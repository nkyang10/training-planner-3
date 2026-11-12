/**
 * The POC3 coach gateway: an OpenAI-compatible endpoint the calendar's coach bubble talks to as a "model".
 *
 * The gateway is where the coach gets memory and a calendar: it loads the runner's memories, upcoming sessions, Garmin
 * activities and recent change sets, asks the local model for one structured turn, validates it, then writes the
 * memories, the sessions and one change set for the batch (or undoes a change set), and returns the natural-language
 * reply plus the metadata the calendar UI needs.
 *
 * A rejected proposal is not immediately converted into a dead-end fallback. The model sees a structured validation
 * result and gets one bounded chance to repair the proposal or ask the runner a clarifying question.
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  COACH_TOOL,
  COACH_TOOL_NAME,
  HORIZON_DAYS,
  buildCoachHistory,
  buildCoachPrompt,
  buildValidationFeedback,
  buildValidationFeedbackForCode,
  parseCoachTurn,
  type CoachTurn,
  type ParseResult,
  type ValidationFeedback,
} from "./coach";
import { applyRevert } from "./history";
import type { ChangeEntry, ChangeSet, Store, TrainingSession } from "./types";
import { addDays, localDay, safeTimeZone } from "./time";

export interface GatewayOptions {
  store: Store;
  /** The single PoC runner; multi-user routing comes later. */
  userId: string;
  modelBaseUrl: string;
  modelApiKey: string;
  modelName: string;
  modelId?: string;
  /** Where the runner opens the calendar the coach writes into. */
  calendarUrl?: string;
  now?: () => string;
  fetchImpl?: typeof fetch;
  /** Initial proposal plus at most this many repair calls. Default 2 (one repair). */
  maxAttempts?: number;
}

export interface Gateway {
  server: ReturnType<typeof createServer>;
  close(): Promise<void>;
}

export type TurnOutcome = "committed" | "clarified" | "fallback";

/** The `poc3` block the calendar UI reads from a completion. */
export interface GatewayMeta {
  /** How many sessions the turn wrote (a batch) or restored/deleted (a revert). */
  sessions: number;
  memories: number;
  changes: ChangeEntry[];
  /** The change set this turn recorded, or null when nothing was written. */
  changeSetId: string | null;
  reverted: boolean;
  suggestions: string[];
  /** How many model attempts were spent (1 = accepted first time, 2 = one repair). */
  attempts: number;
  outcome: TurnOutcome;
  /** The primary validation code when the turn fell back, or null when it did not. */
  validationCode: string | null;
}

const FALLBACK_REPLY =
  "I could not safely write that turn, so nothing was changed. Please say it again in a simpler way — for example the goal, the days you can train, and anything that hurts.";
const MAX_REVERT_LOOKBACK = 50;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 2_000_000) throw new Error("request too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text.length === 0 ? undefined : (JSON.parse(text) as unknown);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lastUserText(body: Record<string, unknown>): string {
  const messages = Array.isArray(body["messages"]) ? body["messages"] : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isObject(message) && message["role"] === "user" && typeof message["content"] === "string") {
      return message["content"].trim();
    }
  }
  return "";
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;

/** Accept an idempotency key from the web proxy header or the OpenAI-compatible body. */
function requestIdFrom(request: IncomingMessage, body: Record<string, unknown>): string | null {
  const header = request.headers["x-poc3-request-id"];
  const raw = typeof header === "string" ? header : typeof body["request_id"] === "string" ? body["request_id"] : "";
  const value = raw.trim();
  return REQUEST_ID.test(value) ? value : null;
}

/** The model may wrap JSON in a fence; take the outermost object. */
function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in the model answer");
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

interface ModelToolCall {
  id: string;
  name: string;
  argumentsText: string;
}

interface ModelReply {
  content: string | null;
  toolCalls: ModelToolCall[];
  assistantMessage: Record<string, unknown>;
}

type ProposalExtraction =
  | { kind: "proposal"; raw: unknown; reply: ModelReply }
  | { kind: "text"; text: string; reply: ModelReply }
  | { kind: "invalid"; code: string; detail: string; reply: ModelReply };

function parseToolCall(raw: unknown): ModelToolCall | undefined {
  if (!isObject(raw)) return undefined;
  const fn = isObject(raw["function"]) ? raw["function"] : undefined;
  const name = typeof fn?.["name"] === "string" ? fn["name"] : "";
  if (name.length === 0) return undefined;
  const rawArguments = fn?.["arguments"];
  const argumentsText =
    typeof rawArguments === "string" ? rawArguments : rawArguments === undefined ? "{}" : JSON.stringify(rawArguments);
  return {
    id: typeof raw["id"] === "string" ? raw["id"] : `call_${randomUUID()}`,
    name,
    argumentsText,
  };
}

async function callModel(options: GatewayOptions, messages: Array<Record<string, unknown>>): Promise<ModelReply> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetchImpl(`${options.modelBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${options.modelApiKey}` },
      body: JSON.stringify({
        model: options.modelName,
        temperature: 0.3,
        tools: [COACH_TOOL],
        tool_choice: "auto",
        parallel_tool_calls: false,
        messages,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`model answered ${response.status}`);
    const payload = (await response.json()) as { choices?: Array<{ message?: unknown }> };
    const message = payload.choices?.[0]?.message;
    if (!isObject(message)) throw new Error("model returned no message");
    const content = typeof message["content"] === "string" ? message["content"] : null;
    const rawToolCalls = Array.isArray(message["tool_calls"]) ? message["tool_calls"] : [];
    const toolCalls = rawToolCalls.map(parseToolCall).filter((call): call is ModelToolCall => call !== undefined);
    if (content === null && toolCalls.length === 0) throw new Error("model returned no content");
    return { content, toolCalls, assistantMessage: message };
  } finally {
    clearTimeout(timer);
  }
}

function extractProposal(reply: ModelReply): ProposalExtraction {
  if (reply.toolCalls.length > 1) {
    return {
      kind: "invalid",
      code: "multiple-tool-calls",
      detail: "a turn may contain exactly one proposal tool call",
      reply,
    };
  }
  if (reply.toolCalls.length === 1) {
    const call = reply.toolCalls[0];
    if (call === undefined) {
      return { kind: "invalid", code: "unknown-tool", detail: "missing tool call", reply };
    }
    if (call.name !== COACH_TOOL_NAME) {
      return { kind: "invalid", code: "unknown-tool", detail: `unknown tool: ${call.name}`, reply };
    }
    try {
      return { kind: "proposal", raw: JSON.parse(call.argumentsText) as unknown, reply };
    } catch {
      return { kind: "invalid", code: "invalid-json", detail: "tool arguments are not valid JSON", reply };
    }
  }
  const content = reply.content?.trim() ?? "";
  if (content.length === 0) {
    return { kind: "invalid", code: "empty-model-response", detail: "the model returned no content", reply };
  }
  try {
    return { kind: "proposal", raw: extractJson(content), reply };
  } catch {
    if (content.startsWith("{") || content.startsWith("```")) {
      return { kind: "invalid", code: "invalid-json", detail: "the model answer is not valid JSON", reply };
    }
    if (content.length > 2000) {
      return { kind: "invalid", code: "invalid-clarification", detail: "clarification must be at most 2000 characters", reply };
    }
    return { kind: "text", text: content, reply };
  }
}

function repairInstruction(feedback: ValidationFeedback): string {
  const policy =
    feedback.policy === "ask-user"
      ? "Do not silently move or rewrite the rejected session. Ask the runner one short question."
      : feedback.policy === "explain-limit"
        ? "Explain the 180-day booking limit and do not book beyond it."
        : "Correct the format only; do not invent facts or dates.";
  return `Your previous answer looked like the schema template or otherwise failed validation. ${JSON.stringify(feedback)} ${policy} Return a corrected proposal by calling ${COACH_TOOL_NAME}, or reply with one short clarifying question in plain text without calling the tool. Never copy schema placeholders such as YYYY-MM-DD or string.`;
}

function appendRepair(messages: Array<Record<string, unknown>>, reply: ModelReply, feedback: ValidationFeedback): void {
  const instruction = repairInstruction(feedback);
  if (reply.toolCalls.length > 0) {
    messages.push(reply.assistantMessage);
    for (const call of reply.toolCalls) {
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: COACH_TOOL_NAME,
        content: JSON.stringify({ ...feedback, instruction }),
      });
    }
    return;
  }
  messages.push({ role: "assistant", content: reply.content ?? "" });
  messages.push({ role: "user", content: instruction });
}

function fallbackFor(code: string | null): string {
  if (code === "past-session") {
    return `${FALLBACK_REPLY}\n\nI tried to book a date that has already passed, so I did not move it to today automatically.`;
  }
  if (code === "session-too-far") {
    return `${FALLBACK_REPLY}\n\nThe requested date is outside the 180-day booking window.`;
  }
  return FALLBACK_REPLY;
}

function completionBody(id: string, model: string, reply: string, created: number, meta: GatewayMeta): unknown {
  return {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    poc3: meta,
  };
}

function streamChunk(id: string, model: string, created: number, content: string, finish: string | null): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: content.length === 0 ? {} : { content }, finish_reason: finish }],
  })}\n\n`;
}

function emptyMeta(): GatewayMeta {
  return {
    sessions: 0,
    memories: 0,
    changes: [],
    changeSetId: null,
    reverted: false,
    suggestions: [],
    attempts: 0,
    outcome: "fallback",
    validationCode: null,
  };
}

/** One line per mutation, short enough to store on the change set and show in the coach prompt. */
function summarizeChanges(changes: readonly ChangeEntry[]): string {
  const parts = changes.map((change) => {
    if (change.action === "add") return `add "${change.title}" on ${change.toDay ?? "?"}`;
    if (change.action === "remove") return `remove "${change.title}" from ${change.fromDay ?? "?"}`;
    return `move "${change.title}" ${change.fromDay ?? "?"} → ${change.toDay ?? "?"}`;
  });
  const summary = parts.join("; ");
  return summary.length > 280 ? `${summary.slice(0, 279)}…` : summary;
}

/** "last" means the newest change set that still stands, so an undo cannot pick an already undone batch. */
function resolveChangeSet(store: Store, userId: string, requested: string): ChangeSet | undefined {
  if (requested === "last") {
    return store.listChangeSets(userId, MAX_REVERT_LOOKBACK).find((changeSet) => changeSet.revertedAt === null);
  }
  return store.getChangeSet(userId, requested);
}

interface ApplyResult {
  reply: string;
  meta: GatewayMeta;
}

/**
 * Apply one already-parsed turn atomically. The model is not allowed to write directly; every mutation and the
 * assistant message are committed together so a mid-turn failure cannot leave a half-applied plan.
 */
function applyParsedTurn(
  options: GatewayOptions,
  userId: string,
  turn: CoachTurn,
  at: string,
  attempts: number,
): ApplyResult {
  return options.store.transaction(() => {
    const meta = emptyMeta();
    meta.attempts = attempts;
    meta.suggestions = turn.suggestions;

    const appendAssistant = (text: string): void => {
      options.store.appendMessage({ messageId: randomUUID(), userId, role: "assistant", text, createdAt: at });
    };

    if (turn.revertChangeSetId !== null && turn.sessions.length > 0) {
      meta.outcome = "fallback";
      meta.validationCode = "revert-conflict";
      meta.suggestions = [];
      const reply = `${FALLBACK_REPLY}\n\nI did not apply anything: an undo and schedule edits cannot share one turn.`;
      appendAssistant(reply);
      return { reply, meta };
    }

    if (turn.revertChangeSetId !== null) {
      const target = resolveChangeSet(options.store, userId, turn.revertChangeSetId);
      if (target === undefined) {
        meta.outcome = "fallback";
        meta.validationCode = "unknown-change-set";
        meta.suggestions = [];
        const reply = `${FALLBACK_REPLY}\n\nI could not find the change you asked me to undo.`;
        appendAssistant(reply);
        return { reply, meta };
      }
      if (target.revertedAt !== null) {
        meta.outcome = "fallback";
        meta.validationCode = "already-reverted";
        meta.suggestions = [];
        const reply = `${FALLBACK_REPLY}\n\nThat change was already undone, so there was nothing to revert.`;
        appendAssistant(reply);
        return { reply, meta };
      }

      const result = applyRevert(options.store, userId, target, at);
      meta.changes = result.changes;
      meta.reverted = true;
      meta.sessions = result.changes.length;
      meta.changeSetId = options.store.listChangeSets(userId, 1)[0]?.changeSetId ?? null;
      let reply = turn.reply;
      for (const text of turn.memories) {
        options.store.appendMemory({ memoryId: randomUUID(), userId, text, createdAt: at });
      }
      meta.memories = turn.memories.length;
      if (result.changes.length > 0 && options.calendarUrl !== undefined) {
        reply = `${reply}\n\nYour calendar: ${options.calendarUrl}`;
      }
      meta.outcome = "committed";
      appendAssistant(reply);
      return { reply, meta };
    }

    let reply = turn.reply;
    const failures: string[] = [];
    for (const text of turn.memories) {
      options.store.appendMemory({ memoryId: randomUUID(), userId, text, createdAt: at });
    }
    meta.memories = turn.memories.length;

    for (const draft of turn.sessions) {
      if (draft.action === "add") {
        const sessionId = `session:${createHash("sha256").update(`${userId}:${draft.day}:${draft.kind}:${draft.title}`).digest("hex").slice(0, 32)}`;
        const before = options.store.getSession(userId, sessionId) ?? null;
        const after: TrainingSession = {
          sessionId,
          userId,
          day: draft.day,
          title: draft.title,
          kind: draft.kind,
          distanceKm: draft.distanceKm,
          durationMin: draft.durationMin,
          note: draft.note,
          createdAt: at,
        };
        options.store.upsertSession(after);
        meta.changes.push({ action: "add", sessionId, before, after, fromDay: null, toDay: draft.day, title: draft.title, kind: draft.kind });
        continue;
      }

      const existing = draft.sessionId === null ? undefined : options.store.getSession(userId, draft.sessionId);
      if (existing === undefined) {
        failures.push(draft.title.length === 0 ? (draft.sessionId ?? "unknown session") : draft.title);
        continue;
      }
      if (draft.action === "remove") {
        options.store.deleteSession(userId, existing.sessionId);
        meta.changes.push({
          action: "remove",
          sessionId: existing.sessionId,
          before: existing,
          after: null,
          fromDay: existing.day,
          toDay: null,
          title: existing.title,
          kind: existing.kind,
        });
        continue;
      }
      const after: TrainingSession = {
        sessionId: existing.sessionId,
        userId,
        day: draft.day,
        title: draft.title,
        kind: draft.kind,
        distanceKm: draft.distanceKm,
        durationMin: draft.durationMin,
        note: draft.note,
        createdAt: at,
      };
      options.store.upsertSession(after);
      meta.changes.push({
        action: "update",
        sessionId: existing.sessionId,
        before: existing,
        after,
        fromDay: existing.day,
        toDay: draft.day,
        title: draft.title,
        kind: draft.kind,
      });
    }

    if (failures.length > 0) {
      reply = `${reply}\n\nNote: I could not find ${failures.length === 1 ? "one session" : `${failures.length} sessions`} you asked me to change, so that part was not applied.`;
    }
    if (meta.changes.length > 0) {
      const changeSet: ChangeSet = {
        changeSetId: `change:${randomUUID()}`,
        userId,
        createdAt: at,
        summary: summarizeChanges(meta.changes),
        entries: meta.changes,
        revertedAt: null,
      };
      options.store.appendChangeSet(changeSet);
      meta.changeSetId = changeSet.changeSetId;
      meta.sessions = meta.changes.length;
      if (options.calendarUrl !== undefined) {
        reply = `${reply}\n\nYour calendar: ${options.calendarUrl}`;
      }
    }
    meta.outcome = meta.changes.length > 0 ? "committed" : "clarified";
    appendAssistant(reply);
    return { reply, meta };
  });
}

export function createGateway(options: GatewayOptions): Gateway {
  const now = options.now ?? (() => new Date().toISOString());
  const modelId = options.modelId ?? "poc3-coach";
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const server = createServer((request, response) => {
    void (async (): Promise<void> => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const method = request.method ?? "GET";
      if (method === "OPTIONS") {
        response.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, content-type, x-poc3-user",
          "access-control-allow-methods": "GET, POST, OPTIONS",
        });
        response.end();
        return;
      }
      if (url.pathname === "/health" && method === "GET") {
        sendJson(response, 200, { status: "ok", model: options.modelName });
        return;
      }
      if (url.pathname === "/v1/models" && method === "GET") {
        sendJson(response, 200, {
          object: "list",
          data: [{ id: modelId, object: "model", created: Math.floor(Date.now() / 1000), owned_by: "poc3" }],
        });
        return;
      }
      if (url.pathname !== "/v1/chat/completions" || method !== "POST") {
        sendJson(response, 404, { error: { code: "not-found", detail: "use POST /v1/chat/completions" } });
        return;
      }

      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        sendJson(response, 400, { error: { code: "invalid-body", detail: error instanceof Error ? error.message : String(error) } });
        return;
      }
      if (!isObject(body)) {
        sendJson(response, 400, { error: { code: "invalid-body", detail: "expected a JSON object" } });
        return;
      }
      const question = lastUserText(body);
      if (question.length === 0) {
        sendJson(response, 400, { error: { code: "no-question", detail: "the last user message is empty" } });
        return;
      }
      const userId = typeof request.headers["x-poc3-user"] === "string" ? request.headers["x-poc3-user"] : options.userId;
      const requestId = body["stream"] === true ? null : requestIdFrom(request, body);
      if (requestId !== null) {
        const existing = options.store.getCoachTurn(userId, requestId);
        if (existing?.status === "completed" && existing.responseJson !== null) {
          response.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "x-poc3-idempotent-replay": "true",
          });
          response.end(existing.responseJson);
          return;
        }
        if (existing?.status === "in_progress") {
          sendJson(response, 409, {
            error: { code: "turn-in-progress", detail: "a turn with this request id is already running" },
          });
          return;
        }
        const claimed = options.store.claimCoachTurn({
          requestId,
          userId,
          createdAt: now(),
          completedAt: null,
          status: "in_progress",
          attempts: 0,
          validationCode: null,
          outcome: null,
          responseJson: null,
        });
        if (!claimed) {
          sendJson(response, 409, {
            error: { code: "turn-in-progress", detail: "a turn with this request id is already running" },
          });
          return;
        }
      }
      const profile = options.store.getUser(userId);
      const timezone = safeTimeZone(profile?.timezone);
      const nowIso = now();
      const today = localDay(nowIso, timezone);
      const history = options.store.listMessages(userId, 20);
      const recentChanges = options.store.listChangeSets(userId, 10);
      const prompt = buildCoachPrompt({
        today,
        timezone,
        now: nowIso,
        memories: options.store.listMemories(userId, 100),
        sessions: options.store.listSessions(userId, today, addDays(today, HORIZON_DAYS)),
        activities: options.store.listActivities(userId, 10),
        history,
        recentChanges,
        question,
      });
      const createdAt = now();
      options.store.appendMessage({
        messageId: randomUUID(),
        userId,
        role: "user",
        text: question,
        createdAt,
      });

      const messages: Array<Record<string, unknown>> = [
        { role: "system", content: prompt },
        ...buildCoachHistory({ today, memories: [], sessions: [], activities: [], history, recentChanges: [], question }),
        { role: "user", content: question },
      ];

      let reply = FALLBACK_REPLY;
      let meta = emptyMeta();
      let validationCode: string | null = null;
      let persisted = false;
      let attempt = 0;
      try {
        for (attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const modelReply = await callModel(options, messages);
          const extracted = extractProposal(modelReply);
          if (extracted.kind === "text") {
            reply = extracted.text;
            meta.attempts = attempt;
            meta.outcome = "clarified";
            meta.validationCode = null;
            validationCode = null;
            break;
          }
          if (extracted.kind === "invalid") {
            validationCode = extracted.code;
            meta.attempts = attempt;
            meta.validationCode = validationCode;
            if (attempt >= maxAttempts) {
              reply = fallbackFor(validationCode);
              break;
            }
            const feedback = buildValidationFeedbackForCode(
              extracted.code,
              extracted.detail,
              today,
              timezone,
              attempt,
              maxAttempts,
            );
            appendRepair(messages, modelReply, feedback);
            continue;
          }

          const parsed: ParseResult = parseCoachTurn(extracted.raw, today);
          if (parsed.ok) {
            const applied = applyParsedTurn(options, userId, parsed.turn, now(), attempt);
            reply = applied.reply;
            meta = applied.meta;
            validationCode = meta.validationCode;
            persisted = true;
            break;
          }
          validationCode = parsed.code;
          meta.attempts = attempt;
          meta.validationCode = validationCode;
          if (attempt >= maxAttempts) {
            reply = fallbackFor(validationCode);
            break;
          }
          const feedback = buildValidationFeedback(parsed, today, timezone, attempt, maxAttempts);
          appendRepair(messages, modelReply, feedback);
        }
      } catch (error) {
        if (requestId !== null) options.store.failCoachTurn(userId, requestId, now());
        sendJson(response, 502, { error: { code: "model-failed", detail: error instanceof Error ? error.message : String(error) } });
        return;
      }

      if (!persisted) {
        meta.attempts = attempt;
        meta.validationCode = validationCode;
        if (meta.outcome !== "clarified") meta.outcome = "fallback";
        options.store.appendMessage({ messageId: randomUUID(), userId, role: "assistant", text: reply, createdAt: now() });
      }

      const id = `chatcmpl-${randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);
      if (body["stream"] === true) {
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        });
        response.write(streamChunk(id, modelId, created, reply, null));
        response.write(streamChunk(id, modelId, created, "", "stop"));
        response.write("data: [DONE]\n\n");
        response.end();
        return;
      }
      const completion = completionBody(id, modelId, reply, created, meta);
      if (requestId !== null) {
        options.store.completeCoachTurn(userId, requestId, {
          completedAt: now(),
          attempts: meta.attempts,
          validationCode: meta.validationCode,
          outcome: meta.outcome,
          responseJson: JSON.stringify(completion),
        });
      }
      sendJson(response, 200, completion);
    })().catch((error: unknown) => {
      if (!response.headersSent) {
        sendJson(response, 500, { error: { code: "gateway-failed", detail: error instanceof Error ? error.message : String(error) } });
      } else {
        response.end();
      }
    });
  });
  return {
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
