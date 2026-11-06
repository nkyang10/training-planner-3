/**
 * The POC3 coach gateway: an OpenAI-compatible endpoint the calendar's coach bubble talks to as a "model".
 *
 * The gateway is where the coach gets memory and a calendar: it loads the runner's memories, upcoming sessions, Garmin
 * activities and recent change sets, asks the local model for one structured turn, validates it, then writes the
 * memories, the sessions and one change set for the batch (or undoes a change set), and returns the natural-language
 * reply plus the metadata the calendar UI needs.
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { HORIZON_DAYS, buildCoachHistory, buildCoachPrompt, parseCoachTurn } from "./coach";
import { applyRevert } from "./history";
import type { ChangeEntry, ChangeSet, Store, TrainingSession } from "./types";

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
}

export interface Gateway {
  server: ReturnType<typeof createServer>;
  close(): Promise<void>;
}

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

function looksLikeSchemaEcho(raw: unknown): boolean {
  const text = JSON.stringify(raw);
  return text.includes("YYYY-MM-DD") || text.includes("string | null") || text.includes("\\\"string\\\"");
}

async function askModel(
  options: GatewayOptions,
  prompt: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  question: string,
): Promise<unknown> {
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
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: prompt }, ...history, { role: "user", content: question }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`model answered ${response.status}`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("model returned no content");
    return extractJson(content);
  } finally {
    clearTimeout(timer);
  }
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
  return { sessions: 0, memories: 0, changes: [], changeSetId: null, reverted: false, suggestions: [] };
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

export function createGateway(options: GatewayOptions): Gateway {
  const now = options.now ?? (() => new Date().toISOString());
  const modelId = options.modelId ?? "poc3-coach";
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
      const today = now().slice(0, 10);
      const history = options.store.listMessages(userId, 20);
      const recentChanges = options.store.listChangeSets(userId, 10);
      const prompt = buildCoachPrompt({
        today,
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

      let raw: unknown;
      try {
        raw = await askModel(
          options,
          prompt,
          buildCoachHistory({ today, memories: [], sessions: [], activities: [], history, recentChanges: [], question }),
          question,
        );
      } catch (error) {
        sendJson(response, 502, { error: { code: "model-failed", detail: error instanceof Error ? error.message : String(error) } });
        return;
      }
      let parsed = parseCoachTurn(raw, today);
      if (!parsed.ok && looksLikeSchemaEcho(raw)) {
        // Some models echo the prompt's JSON schema when a request is hard. Ask once, explicitly, for real values.
        const repairPrompt = `${prompt}\n\nIMPORTANT: your previous answer was the schema template, not a real answer. Return ONE JSON object with real values for this runner now. Never output YYYY-MM-DD, string, 0 or other placeholders from the schema. If a month/day has no year and has passed this year, use the next occurrence.`;
        try {
          raw = await askModel(options, repairPrompt, [], question);
          parsed = parseCoachTurn(raw, today);
        } catch {
          // Keep the original fallback when the repair call fails.
        }
      }
      let reply = FALLBACK_REPLY;
      const meta = emptyMeta();
      const failures: string[] = [];
      if (parsed.ok) {
        const turn = parsed.turn;
        if (turn.revertChangeSetId !== null && turn.sessions.length > 0) {
          // An undo and a batch must stay separate turns: one answer cannot both restore and overwrite snapshots.
          reply = `${FALLBACK_REPLY}\n\nI did not apply anything: an undo and schedule edits cannot share one turn.`;
        } else if (turn.revertChangeSetId !== null) {
          const target = resolveChangeSet(options.store, userId, turn.revertChangeSetId);
          if (target === undefined) {
            reply = `${FALLBACK_REPLY}\n\nI could not find the change you asked me to undo.`;
          } else if (target.revertedAt !== null) {
            reply = `${FALLBACK_REPLY}\n\nThat change was already undone, so there was nothing to revert.`;
          } else {
            const result = applyRevert(options.store, userId, target, now());
            meta.changes = result.changes;
            meta.reverted = true;
            meta.sessions = result.changes.length;
            meta.suggestions = turn.suggestions;
            meta.changeSetId = options.store.listChangeSets(userId, 1)[0]?.changeSetId ?? null;
            reply = turn.reply;
            for (const text of turn.memories) {
              options.store.appendMemory({ memoryId: randomUUID(), userId, text, createdAt: now() });
            }
            meta.memories = turn.memories.length;
            if (result.changes.length > 0 && options.calendarUrl !== undefined) {
              reply = `${reply}\n\nYour calendar: ${options.calendarUrl}`;
            }
          }
        } else {
          reply = turn.reply;
          meta.suggestions = turn.suggestions;
          for (const text of turn.memories) {
            options.store.appendMemory({ memoryId: randomUUID(), userId, text, createdAt: now() });
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
                createdAt: now(),
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
              createdAt: now(),
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
              createdAt: now(),
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
        }
      }
      options.store.appendMessage({ messageId: randomUUID(), userId, role: "assistant", text: reply, createdAt: now() });

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
      sendJson(response, 200, completionBody(id, modelId, reply, created, meta));
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

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
