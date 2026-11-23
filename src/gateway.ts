/**
 * The Milebook coach gateway: an OpenAI-compatible endpoint the calendar's coach bubble talks to as a "model".
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
  COACH_MEMORY_WINDOW,
  COACH_PROMPT_VERSION,
  COACH_TOOL,
  COACH_TOOL_NAME,
  HORIZON_DAYS,
  assembleConversation,
  buildCoachSystemPrompt,
  buildContextSnapshot,
  buildTurnSuffix,
  buildValidationFeedback,
  buildValidationFeedbackForCode,
  coachEpoch,
  epochReasons,
  parseCoachTurn,
  type CoachEpochParts,
  type CoachTurn,
  type ParseResult,
  type ValidationFeedback,
} from "./coach";
import { applyRevert } from "./history";
import { directiveHash, parseCoachDirective } from "./directives";
import { isMuscleId, referencedMuscleContext } from "./muscles";
import { computeMuscleStatuses, renderMuscleStatusFactsForPrompt } from "./muscle-status";
import {
  buildMuscleProposal,
  listPendingMuscleProposals,
  renderMuscleProposalsForPrompt,
  type MuscleProposal,
} from "./muscle-proposals";
import {
  applyStateProposals,
  refreshCoachStates,
  stateGuardrailViolations,
  type GuardrailChange,
  type StateChange,
  type StateProposal,
} from "./coach-states";
import type {
  Activity,
  ChangeEntry,
  ChangeSet,
  CoachDirective,
  CoachMode,
  CoachStateRecord,
  Message,
  Store,
  TrainingSession,
} from "./types";
import { addDays, localDay, safeTimeZone } from "./time";
import { silentLogger, type Logger } from "./log";

export interface GatewayOptions {
  store: Store;
  /** Identity used only when a request carries no `x-milebook-user` header (health checks, direct admin calls). */
  userId: string;
  modelBaseUrl: string;
  modelApiKey: string;
  modelName: string;
  modelId?: string;
  /** Deterministic auto-state detection; manual/chat states still work when this is off. */
  autoStates?: boolean;
  now?: () => string;
  fetchImpl?: typeof fetch;
  /** Initial proposal plus at most this many repair calls. Default 2 (one repair). */
  maxAttempts?: number;
  /**
   * Shared secret the web surface presents on every write call. When set, a request without it is rejected
   * before the store is touched, so another local process (or a web page via CORS) cannot act as a runner.
   * Unset in unit tests that drive the gateway directly.
   */
  internalToken?: string;
  /** Per-call model abort in milliseconds; defaults to 120 s. Lower it when an edge proxy cuts earlier. */
  modelTimeoutMs?: number;
  /** Structured event log; defaults to silent so a test never writes to stdout. */
  logger?: Logger;
}

export interface Gateway {
  server: ReturnType<typeof createServer>;
  close(): Promise<void>;
}

export type TurnOutcome = "committed" | "clarified" | "fallback";

export type TurnFailureReason = "session-not-found" | "missing-session-id";

/** A proposed schedule action the gateway could not apply because its target session was missing. */
export interface TurnFailure {
  action: "add" | "update" | "remove";
  sessionId: string | null;
  title: string;
  day: string;
  reason: TurnFailureReason;
}

/** Why this turn re-read the runner's context instead of purely appending (LL-3/LL-4). */
export interface GatewayPrefill {
  /** The epoch hash this turn ran under; equal epochs reuse the newest snapshot. */
  epoch: string;
  /** Reason codes for the snapshot appended this turn, empty when the conversation purely appended. */
  refreshed: string[];
  /** True when the token budget dropped the oldest history messages. */
  compacted: boolean;
  /** The snapshot day, so the client can predict the next new-day re-prefill. */
  today: string;
  latestChangeSetId: string | null;
  latestActivityId: string | null;
}

/** The `milebook` block the calendar UI reads from a completion. */
export interface GatewayMeta {
  /** How many sessions the turn wrote (a batch) or restored/deleted (a revert). */
  sessions: number;
  memories: number;
  changes: ChangeEntry[];
  /** The change set this turn recorded, or null when nothing was written. */
  changeSetId: string | null;
  reverted: boolean;
  suggestions: string[];
  /** Actions that could not be applied; the UI renders them as a structured card. */
  failures: TurnFailure[];
  /** How many model attempts were spent (1 = accepted first time, 2 = one repair). */
  attempts: number;
  outcome: TurnOutcome;
  /** The primary validation code when the turn fell back, or null when it did not. */
  validationCode: string | null;
  /** The hidden directive's mode, or null for a plain chat turn. */
  mode: CoachMode | null;
  /** Whether the directive allowed calendar writes; true for plain chat. */
  writesAllowed: boolean;
  /** Calendar writes the gateway refused because the directive forbade them. */
  blockedWrites: number;
  /** Audit id for the hidden directive, or null when the turn had none. */
  directiveId: string | null;
  /** Coaching states activated or resolved by this turn. */
  states: StateChange[];
  /** Muscle-condition suggestions this turn recorded; each waits for the runner's one-tap confirm. */
  muscleProposals: MuscleProposal[];
  /** Active state keys that blocked a proposed session on this turn. */
  blockedByStates: string[];
  /** What the model was prefilled with this turn and why it changed. */
  prefill: GatewayPrefill;
}

const FALLBACK_REPLY =
  "I could not safely write that, so nothing was changed. Say it again more simply - the goal, the days you can train, and anything that hurts.";
const MAX_REVERT_LOOKBACK = 50;

/** The CJK test the reply language heuristic already uses; reused for the silent preference detection. */
const CJK_TEXT = /[\u3400-\u9fff]/;

/**
 * The silent language preference (LL-5, D20): when no language is stored yet, two consecutive user messages in
 * Chinese persist zh-Hant, so bare follow-ups like "ok" or "go" keep the conversation in the runner's language.
 * English is the default and is never auto-persisted; a message that clearly switches language always wins over
 * the stored value, so bilingual runners keep their per-message choice.
 */
function detectLanguage(history: readonly Message[], question: string): "zh-Hant" | undefined {
  let lastUser: Message | undefined;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message !== undefined && message.role === "user") {
      lastUser = message;
      break;
    }
  }
  if (lastUser === undefined) return undefined;
  if (CJK_TEXT.test(lastUser.text) && CJK_TEXT.test(question)) return "zh-Hant";
  return undefined;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
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
/**
 * A turn claimed longer ago than this is treated as abandoned. The claim row is written before the model is called,
 * so a crash or a restart mid-turn would otherwise wedge that request id behind `409 turn-in-progress` forever.
 */
const TURN_LEASE_MS = 10 * 60_000;

/** Accept an idempotency key from the web proxy header or the OpenAI-compatible body. */
function requestIdFrom(request: IncomingMessage, body: Record<string, unknown>): string | null {
  const header = request.headers["x-milebook-request-id"];
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
  const timer = setTimeout(() => controller.abort(), options.modelTimeoutMs ?? 120_000);
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
        : feedback.policy === "respect-directive"
          ? "This turn is comment-only. Reply with the comment in plain text and do not emit sessions or a revert."
          : feedback.policy === "respect-state"
            ? "An active coaching state forbids this session. Change the session to an allowed kind or reply with a short explanation; do not override the state."
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
  if (code === "comment-only-write") {
    return "I kept this to a comment, so your calendar is unchanged.";
  }
  if (code === "mode-guardrail") {
    return "A coaching state is protecting your plan, so I did not book that. If the state is wrong, resolve it on the Coaching states page.";
  }
  if (code === "past-session") {
    return `${FALLBACK_REPLY} That date has already passed, so I booked nothing.`;
  }
  if (code === "session-too-far") {
    return `${FALLBACK_REPLY} The date is outside the 180-day booking window.`;
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
    milebook: meta,
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
    failures: [],
    attempts: 0,
    outcome: "fallback",
    validationCode: null,
    mode: null,
    writesAllowed: true,
    blockedWrites: 0,
    directiveId: null,
    states: [],
    muscleProposals: [],
    blockedByStates: [],
    prefill: {
      epoch: "",
      refreshed: [],
      compacted: false,
      today: "",
      latestChangeSetId: null,
      latestActivityId: null,
    },
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

/** Persist a short note so a partial failure survives a history reload; the live UI renders a structured card. */
function failureNote(failures: readonly TurnFailure[], reply: string): string {
  const count = failures.length;
  const chinese = /[\u3400-\u9fff]/.test(reply);
  if (chinese) return `註：有 ${count} 個項目找不到，該部分未有更改。`;
  return `Note: ${count} item${count === 1 ? "" : "s"} could not be found, so I left that part unchanged.`;
}

/** "last" means the newest change set that still stands, so an undo cannot pick an already undone batch. */
function resolveChangeSet(store: Store, userId: string, requested: string): ChangeSet | undefined {
  if (requested === "last") {
    return store.listChangeSets(userId, MAX_REVERT_LOOKBACK).find((changeSet) => changeSet.revertedAt === null);
  }
  return store.getChangeSet(userId, requested);
}

/**
 * The calendar a turn would produce: current sessions plus adds/updates/removes and a revert.
 *
 * Guardrails need both halves: `sessions` is the context used to find the effective next race, and `changes` is the
 * set of sessions the turn actually introduces or restores. Checking all effective sessions would flag untouched
 * sessions that were already booked; checking only raw drafts would miss a revert.
 */
function effectiveCalendarForTurn(
  store: Store,
  userId: string,
  turn: CoachTurn,
  today: string,
  at: string,
): { sessions: TrainingSession[]; changes: GuardrailChange[] } {
  const sessions = new Map<string, TrainingSession>();
  for (const session of store.listSessions(userId, today, addDays(today, HORIZON_DAYS))) {
    sessions.set(session.sessionId, session);
  }
  const changes: GuardrailChange[] = [];

  if (turn.revertChangeSetId !== null) {
    const target = resolveChangeSet(store, userId, turn.revertChangeSetId);
    if (target !== undefined && target.revertedAt === null) {
      for (const entry of [...target.entries].reverse()) {
        if (entry.before === null) {
          sessions.delete(entry.sessionId);
          continue;
        }
        sessions.set(entry.sessionId, entry.before);
        if (entry.before.day >= today) {
          changes.push({
            sessionId: entry.before.sessionId,
            action: "revert",
            day: entry.before.day,
            kind: entry.before.kind,
            title: entry.before.title,
          });
        }
      }
    }
  }

  for (let index = 0; index < turn.sessions.length; index += 1) {
    const draft = turn.sessions[index];
    if (draft === undefined) continue;
    if (draft.action === "remove") {
      if (draft.sessionId !== null) sessions.delete(draft.sessionId);
      continue;
    }
    if (draft.action === "update") {
      const existing =
        draft.sessionId === null
          ? undefined
          : sessions.get(draft.sessionId) ?? store.getSession(userId, draft.sessionId);
      if (existing === undefined) continue;
      const updated: TrainingSession = {
        ...existing,
        day: draft.day,
        title: draft.title,
        kind: draft.kind,
        distanceKm: draft.distanceKm,
        durationMin: draft.durationMin,
        note: draft.note,
      };
      sessions.set(updated.sessionId, updated);
      changes.push({
        sessionId: updated.sessionId,
        action: "update",
        day: updated.day,
        kind: updated.kind,
        title: updated.title,
      });
      continue;
    }
    const added: TrainingSession = {
      sessionId: `draft:${index}:${draft.day}:${draft.kind}:${draft.title}`,
      userId,
      day: draft.day,
      title: draft.title,
      kind: draft.kind,
      distanceKm: draft.distanceKm,
      durationMin: draft.durationMin,
      note: draft.note,
      createdAt: at,
    };
    sessions.set(added.sessionId, added);
    changes.push({
      sessionId: added.sessionId,
      action: "add",
      day: added.day,
      kind: added.kind,
      title: added.title,
    });
  }

  return { sessions: [...sessions.values()], changes };
}

interface DirectiveRequest {
  directive: CoachDirective | undefined;
  hash: string | null;
}

/** Read the hidden directive from the trusted web proxy. Plain chat turns carry none. */
function directiveFromBody(
  body: Record<string, unknown>,
): { ok: true; request: DirectiveRequest } | { ok: false; detail: string } {
  const milebook = body["milebook"];
  if (milebook === undefined) return { ok: true, request: { directive: undefined, hash: null } };
  if (!isObject(milebook)) return { ok: false, detail: "milebook must be an object" };
  const raw = milebook["directive"];
  if (raw === undefined) return { ok: true, request: { directive: undefined, hash: null } };
  const parsed = parseCoachDirective(raw);
  if (!parsed.ok) return { ok: false, detail: parsed.detail };
  return { ok: true, request: { directive: parsed.directive, hash: directiveHash(parsed.directive) } };
}

interface ResolvedDirective {
  activity?: Activity;
  sessions: TrainingSession[];
  changeSet?: ChangeSet;
  state?: CoachStateRecord;
}

/**
 * Load the rows a directive points at. References are resolved from the store, never trusted from the browser; a
 * missing or foreign id (change set, coaching state, session) fails before the model call.
 */
function resolveDirectiveReferences(
  store: Store,
  userId: string,
  directive: CoachDirective,
): { ok: true; resolved: ResolvedDirective } | { ok: false; detail: string } {
  const references = directive.references;
  if (references === undefined) return { ok: true, resolved: { sessions: [] } };
  let activity: Activity | undefined;
  if (references.activityId !== undefined) {
    activity = store.getActivity(userId, references.activityId);
    if (activity === undefined) return { ok: false, detail: `activity not found: ${references.activityId}` };
    if (references.day !== undefined && activity.day !== references.day) {
      return { ok: false, detail: "the referenced activity does not belong to the referenced day" };
    }
  }
  let changeSet: ChangeSet | undefined;
  if (references.changeSetId !== undefined) {
    changeSet = store.getChangeSet(userId, references.changeSetId);
    if (changeSet === undefined) return { ok: false, detail: `change set not found: ${references.changeSetId}` };
  }
  let state: CoachStateRecord | undefined;
  if (references.stateId !== undefined) {
    state = store.getCoachState(userId, references.stateId);
    if (state === undefined) return { ok: false, detail: `coaching state not found: ${references.stateId}` };
  }
  if (references.muscleId !== undefined && !isMuscleId(references.muscleId)) {
    return { ok: false, detail: `unknown muscle: ${references.muscleId}` };
  }
  const sessions: TrainingSession[] = [];
  const seen = new Set<string>();
  const addSessions = (rows: readonly TrainingSession[]): void => {
    for (const session of rows) {
      if (seen.has(session.sessionId)) continue;
      seen.add(session.sessionId);
      sessions.push(session);
    }
  };
  const day = references.day ?? activity?.day;
  if (day !== undefined) addSessions(store.listSessions(userId, day, day));
  if (references.weekStart !== undefined) {
    addSessions(store.listSessions(userId, references.weekStart, addDays(references.weekStart, 6)));
  }
  if (references.sessionIds !== undefined) {
    for (const sessionId of references.sessionIds) {
      const session = store.getSession(userId, sessionId);
      if (session === undefined) return { ok: false, detail: `session not found: ${sessionId}` };
      addSessions([session]);
    }
  }
  return {
    ok: true,
    resolved: {
      ...(activity === undefined ? {} : { activity }),
      sessions,
      ...(changeSet === undefined ? {} : { changeSet }),
      ...(state === undefined ? {} : { state }),
    },
  };
}

/** Persist the hidden directive for the owner's audit page; it is never part of the visible chat. */
function persistDirective(
  store: Store,
  userId: string,
  requestId: string | null,
  messageId: string,
  visible: string,
  directive: CoachDirective,
  blockedWrites: number,
  at: string,
  renderedPromptSuffix: string,
): string {
  const directiveId = `directive:${randomUUID()}`;
  store.appendCoachDirective({
    directiveId,
    userId,
    requestId,
    messageId,
    visible,
    directive,
    renderedPromptSuffix: renderedPromptSuffix.length > 0 ? renderedPromptSuffix : null,
    blockedWrites,
    createdAt: at,
  });
  return directiveId;
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
  today: string,
  attempts: number,
  allowCalendarWrites = true,
  allowMemoryWrites = true,
): ApplyResult {
  return options.store.transaction(() => {
    const meta = emptyMeta();
    meta.attempts = attempts;
    meta.suggestions = turn.suggestions;
    const effectiveTurn = allowMemoryWrites ? turn : { ...turn, memories: [] };

    // Muscle-condition suggestions are recorded as pending rows, never as a check-in or a control: the runner's
    // one-tap confirm is the only path from a suggestion to the body's record. A suggestion identical to one that is
    // still waiting (same action, muscle, level, tags and run) is skipped, so a model that repeats itself does not
    // stack duplicate cards; a changed level supersedes the older pending card for that muscle, because two live
    // cards for one muscle invite two confirms of contradictory records.
    const recordMuscleProposals = (): void => {
      const pending = listPendingMuscleProposals(options.store, userId, today);
      const keyOf = (proposal: {
        action: string;
        muscleId: string;
        soreness: number | null;
        conditions: readonly string[];
        activityId: string | null;
      }): string =>
        `${proposal.action}|${proposal.muscleId}|${proposal.soreness ?? ""}|${[...proposal.conditions].sort().join("+")}|${proposal.activityId ?? ""}`;
      const waiting = new Set(pending.map((proposal) => keyOf(proposal)));
      const created: MuscleProposal[] = [];
      for (const draft of turn.muscleProposals) {
        // The run reference is resolved, never trusted: a foreign, missing or wrong-day id is stripped so a
        // hallucinated activityId downgrades to an unlinked report instead of poisoning the suggestion.
        const activityId =
          draft.action === "report" && draft.activityId !== null
            ? (() => {
                const activity = options.store.getActivity(userId, draft.activityId);
                return activity !== undefined && activity.day === today ? activity.activityId : null;
              })()
            : null;
        const key = keyOf({ ...draft, activityId });
        if (waiting.has(key)) continue;
        waiting.add(key);
        const proposal = buildMuscleProposal({
          userId,
          draft: { ...draft, activityId },
          today,
          now: at,
        });
        // Newest wins per muscle: the superseded rows are dismissed, not deleted, so the journal stays honest.
        for (const older of pending) {
          if (older.muscleId !== proposal.muscleId || older.status !== "proposed") continue;
          options.store.updateMuscleProposal({ ...older, status: "dismissed", updatedAt: at, decidedAt: at });
        }
        options.store.appendMuscleProposal(proposal);
        created.push(proposal);
      }
      meta.muscleProposals = created;
    };

    // The silent preference channel (LL-5): applied transactionally, never rendered, never announced. A
    // comment-only directive with memory writes off skips it, like it skips memories.
    if (allowMemoryWrites && Object.keys(turn.profileUpdates).length > 0) {
      options.store.patchCoachPreferences(userId, turn.profileUpdates, at);
    }

    const appendAssistant = (text: string): void => {
      options.store.appendMessage({ messageId: randomUUID(), userId, role: "assistant", text, createdAt: at });
    };

    // Defense in depth: a comment-only directive never writes, even if a caller skipped the pre-apply check.
    if (!allowCalendarWrites && (turn.sessions.length > 0 || turn.revertChangeSetId !== null)) {
      meta.outcome = "clarified";
      const reply = "I kept this turn to a comment and did not change your calendar.";
      appendAssistant(reply);
      return { reply, meta };
    }

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
      meta.states = applyStateProposals(options.store, userId, turn.stateProposals, at);
      recordMuscleProposals();
      const reply = turn.reply;
      for (const text of effectiveTurn.memories) {
        options.store.appendMemory({ memoryId: randomUUID(), userId, text, createdAt: at });
      }
      meta.memories = effectiveTurn.memories.length;
      meta.outcome = "committed";
      appendAssistant(reply);
      return { reply, meta };
    }

    const reply = turn.reply;
    const failures: TurnFailure[] = [];
    meta.states = applyStateProposals(options.store, userId, turn.stateProposals, at);
    recordMuscleProposals();
    for (const text of effectiveTurn.memories) {
      options.store.appendMemory({ memoryId: randomUUID(), userId, text, createdAt: at });
    }
    meta.memories = effectiveTurn.memories.length;

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
        failures.push({
          action: draft.action,
          sessionId: draft.sessionId,
          title: draft.title.length === 0 ? "session" : draft.title,
          day: draft.day,
          reason: draft.sessionId === null ? "missing-session-id" : "session-not-found",
        });
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

    meta.failures = failures;
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
    }
    meta.outcome = meta.changes.length > 0 ? "committed" : "clarified";
    const persistedReply = failures.length === 0 ? reply : `${reply}\n\n${failureNote(failures, reply)}`;
    appendAssistant(persistedReply);
    return { reply, meta };
  });
}

export function createGateway(options: GatewayOptions): Gateway {
  const now = options.now ?? (() => new Date().toISOString());
  const modelId = options.modelId ?? "milebook-coach";
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const internalToken = options.internalToken;
  const log = options.logger ?? silentLogger;
  const server = createServer((request, response) => {
    void (async (): Promise<void> => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const method = request.method ?? "GET";
      if (method === "OPTIONS") {
        // The gateway is an internal service: the browser never calls it cross-origin (the bubble goes through the
        // web surface), so no CORS grant is sent and no preflight target is advertised.
        response.writeHead(204, { "cache-control": "no-store" });
        response.end();
        return;
      }
      if (url.pathname === "/health" && method === "GET") {
        sendJson(response, 200, { status: "ok", model: options.modelName });
        return;
      }
      if (internalToken !== undefined && request.headers["x-milebook-internal-token"] !== internalToken) {
        sendJson(response, 401, { error: { code: "unauthorized", detail: "missing or invalid internal token" } });
        return;
      }
      if (url.pathname === "/v1/models" && method === "GET") {
        sendJson(response, 200, {
          object: "list",
          data: [{ id: modelId, object: "model", created: Math.floor(Date.now() / 1000), owned_by: "milebook" }],
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
      const userId = typeof request.headers["x-milebook-user"] === "string" ? request.headers["x-milebook-user"] : options.userId;
      const directiveResult = directiveFromBody(body);
      if (!directiveResult.ok) {
        sendJson(response, 400, { error: { code: "invalid-directive", detail: directiveResult.detail } });
        return;
      }
      const { directive, hash: currentDirectiveHash } = directiveResult.request;
      const requestId = body["stream"] === true ? null : requestIdFrom(request, body);
      if (requestId !== null) {
        const existing = options.store.getCoachTurn(userId, requestId);
        if (existing?.status === "completed" && existing.responseJson !== null) {
          if ((existing.directiveHash ?? null) !== currentDirectiveHash) {
            sendJson(response, 409, {
              error: { code: "directive-mismatch", detail: "the request id was used with a different turn directive" },
            });
            return;
          }
          response.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "x-milebook-idempotent-replay": "true",
          });
          response.end(existing.responseJson);
          return;
        }
        if (existing?.status === "in_progress") {
          const startedAt = Date.parse(existing.createdAt);
          const ageMs = Date.parse(now()) - startedAt;
          const abandoned = Number.isFinite(startedAt) && Number.isFinite(ageMs) && ageMs > TURN_LEASE_MS;
          if (!abandoned) {
            sendJson(response, 409, {
              error: { code: "turn-in-progress", detail: "a turn with this request id is already running" },
            });
            return;
          }
          // The claim never reached completion (crash, restart or a killed process). Release it so the retry can run.
          options.store.failCoachTurn(userId, requestId, now());
        }
      }
      let resolved: ResolvedDirective = { sessions: [] };
      if (directive !== undefined) {
        const resolution = resolveDirectiveReferences(options.store, userId, directive);
        if (!resolution.ok) {
          sendJson(response, 404, { error: { code: "reference-not-found", detail: resolution.detail } });
          return;
        }
        resolved = resolution.resolved;
      }
      if (requestId !== null) {
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
          directiveHash: currentDirectiveHash,
        });
        if (!claimed) {
          sendJson(response, 409, {
            error: { code: "turn-in-progress", detail: "a turn with this request id is already running" },
          });
          return;
        }
      }

      try {
        const profile = options.store.getUser(userId);
        const timezone = safeTimeZone(profile?.timezone);
        const nowIso = now();
        const today = localDay(nowIso, timezone);
        const states = refreshCoachStates(options.store, userId, nowIso, today, {
          detect: options.autoStates !== false,
        });
      const history = options.store.listMessages(userId, 20);
      const recentChanges = options.store.listChangeSets(userId, 10);
      // The runner's muscle status: check-ins become dated periods, their levels fade with time unless held,
      // and today's computed state rides in every snapshot. A review-muscles directive still zooms in on one
      // muscle's knowledge and history.
      const muscleCheckIns = options.store.listMuscleCheckIns(userId, 40);
      const muscleFacts = renderMuscleStatusFactsForPrompt({
        statuses: computeMuscleStatuses({
          checkIns: muscleCheckIns,
          controls: options.store.listMuscleStatusControls(userId),
          today,
        }),
        checkIns: muscleCheckIns,
        today,
      });
      const referencedMuscleId = directive?.references?.muscleId;
      const referencedMuscle =
        referencedMuscleId !== undefined && isMuscleId(referencedMuscleId)
          ? referencedMuscleContext(referencedMuscleId, muscleCheckIns)
          : "";
      // The coach's own pending muscle suggestions ride in the snapshot so it never repeats one the runner has
      // not answered, and never claims a suggestion is already saved.
      const pendingMuscleProposals = listPendingMuscleProposals(options.store, userId, today);
      const pendingMuscleFacts = renderMuscleProposalsForPrompt(pendingMuscleProposals);

      // The silent language preference (LL-5): learn it before the epoch is computed, so the snapshot's profile
      // block carries it on this very turn.
      let preferences = options.store.getCoachPreferences(userId);
      if (preferences?.language == null) {
        const detected = detectLanguage(history, question);
        if (detected !== undefined) {
          preferences = options.store.patchCoachPreferences(userId, { language: detected }, nowIso);
        }
      }

      // The epoch rule (LL-3): a new snapshot is appended only when something it tracks changed; between fires
      // the conversation purely appends and the provider's cached prefix survives intact.
      const memories = options.store.listMemories(userId, COACH_MEMORY_WINDOW);
      const sessions = options.store.listSessions(userId, today, addDays(today, HORIZON_DAYS));
      const pastSessions = options.store.listSessions(userId, addDays(today, -30), today);
      const activities = options.store.listActivities(userId, 30);
      const latestChangeSet = options.store.listChangeSets(userId, 1)[0] ?? null;
      const latestMuscleCheckIn = muscleCheckIns[0] ?? null;
      const epochParts: CoachEpochParts = {
        promptVersion: COACH_PROMPT_VERSION,
        today,
        latestChangeSetId: latestChangeSet?.changeSetId ?? null,
        latestActivityId: activities.length > 0 ? (activities[0]?.activityId ?? null) : null,
        activityCount: activities.length,
        latestMuscleCheckInId: latestMuscleCheckIn?.checkInId ?? null,
        pendingMuscleProposalIds: pendingMuscleProposals.map((proposal) => proposal.proposalId).sort(),
        activeStateKeys: states
          .filter((state) => state.status === "active" || state.status === "observing")
          .map((state) => state.key)
          .sort(),
        memoryIds: memories.map((memory) => memory.memoryId),
        profileKey: createHash("sha256")
          .update(
            JSON.stringify({
              displayName: profile?.displayName ?? "",
              timezone,
              goal: profile?.goal ?? null,
            }),
          )
          .digest("hex"),
        preferenceKey: createHash("sha256")
          .update(
            JSON.stringify({
              language: preferences?.language ?? null,
              tone: preferences?.tone ?? null,
              replyLength: preferences?.replyLength ?? null,
              nickname: preferences?.nickname ?? null,
            }),
          )
          .digest("hex"),
      };
      const epoch = coachEpoch(epochParts);
      const lastSnapshot = options.store.getLatestPromptSnapshot(userId);
      let lastParts: CoachEpochParts | null = null;
      if (lastSnapshot !== undefined) {
        try {
          lastParts = JSON.parse(lastSnapshot.epochJson) as CoachEpochParts;
        } catch {
          lastParts = null;
        }
      }
      const refreshed =
        lastSnapshot === undefined || lastSnapshot.epoch !== epoch ? epochReasons(lastParts, epochParts) : [];
      // The snapshot is written before the turn's message, so assembly orders it first on equal timestamps.
      if (refreshed.length > 0) {
        options.store.appendPromptSnapshot({
          snapshotId: `snapshot:${randomUUID()}`,
          userId,
          epoch,
          epochJson: JSON.stringify(epochParts),
          reasons: refreshed,
          body: buildContextSnapshot({
            today,
            timezone,
            displayName: profile?.displayName ?? null,
            goal: profile?.goal ?? null,
            preferences: preferences ?? null,
            memories,
            sessions,
            pastSessions,
            activities,
            recentChanges,
            states,
            ...(muscleFacts.length === 0 ? {} : { muscleFacts }),
            ...(pendingMuscleFacts.length === 0 ? {} : { pendingMuscleProposals: pendingMuscleFacts }),
          }),
          createdAt: nowIso,
        });
      }
      const snapshots = options.store.listPromptSnapshots(userId, 3);

      // Segment E: the hidden suffix of this turn's message. Persisted on the directive audit row so the next
      // turn reproduces the exact bytes the provider already cached.
      const turnSuffix =
        directive === undefined
          ? ""
          : buildTurnSuffix({
              directive,
              ...(resolved.activity === undefined ? {} : { referencedActivity: resolved.activity }),
              ...(resolved.sessions.length === 0 ? {} : { referencedSessions: resolved.sessions }),
              ...(resolved.changeSet === undefined ? {} : { referencedChangeSet: resolved.changeSet }),
              ...(resolved.state === undefined ? {} : { referencedState: resolved.state }),
              ...(referencedMuscle.length === 0 ? {} : { referencedMuscle }),
            });
      const createdAt = now();
      const userMessageId = randomUUID();
      options.store.appendMessage({
        messageId: userMessageId,
        userId,
        role: "user",
        text: question,
        createdAt,
      });

      const suffixRows = options.store.listCoachDirectiveSuffixes(userId, 50);
      const assembly = assembleConversation({
        history,
        timezone,
        suffixes: new Map(suffixRows.map((row) => [row.messageId, row.suffix])),
        snapshots,
        latestSnapshot: snapshots.length > 0 ? snapshots[snapshots.length - 1] : undefined,
        turn: {
          text: question,
          createdAt,
          ...(turnSuffix.length === 0 ? {} : { suffix: turnSuffix }),
        },
      });
      const prefill: GatewayPrefill = {
        epoch,
        refreshed,
        compacted: assembly.compacted,
        today,
        latestChangeSetId: epochParts.latestChangeSetId,
        latestActivityId: epochParts.latestActivityId,
      };
      const messages: Array<Record<string, unknown>> = [
        { role: "system", content: buildCoachSystemPrompt() },
        ...assembly.messages.map((message) => ({ role: message.role, content: message.content })),
      ];

      let reply = FALLBACK_REPLY;
      let meta = emptyMeta();
      let validationCode: string | null = null;
      let persisted = false;
      let blockedWrites = 0;
      let blockedByStates: string[] = [];
      let lastProposals: StateProposal[] = [];
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
            blockedByStates = [];
            break;
          }
          if (extracted.kind === "invalid") {
            blockedByStates = [];
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
            lastProposals = parsed.turn.stateProposals;
            if (
              directive !== undefined &&
              !directive.allowCalendarWrites &&
              (parsed.turn.sessions.length > 0 || parsed.turn.revertChangeSetId !== null)
            ) {
              blockedByStates = [];
              blockedWrites += 1;
              validationCode = "comment-only-write";
              meta.attempts = attempt;
              meta.validationCode = validationCode;
              if (attempt >= maxAttempts) {
                reply = fallbackFor(validationCode);
                break;
              }
              const feedback = buildValidationFeedbackForCode(
                "comment-only-write",
                "this turn is comment-only: reply in plain text and do not emit sessions or a revert",
                today,
                timezone,
                attempt,
                maxAttempts,
                [
                  {
                    path: "sessions",
                    code: "comment-only-write",
                    message: "calendar writes are forbidden on this turn",
                  },
                ],
                "respect-directive",
              );
              appendRepair(messages, modelReply, feedback);
              continue;
            }
            const proposedActiveStates: CoachStateRecord[] = parsed.turn.stateProposals
              .filter((proposal) => proposal.action === "activate")
              .map((proposal) => ({
                stateId: `proposed:${proposal.key}`,
                userId,
                key: proposal.key,
                status: "active" as const,
                source: "chat" as const,
                confidence: proposal.confidence,
                evidence: proposal.evidence,
                activatedAt: now(),
                updatedAt: now(),
                expiresAt: null,
                resolvedAt: null,
              }));
            const effectiveCalendar = effectiveCalendarForTurn(options.store, userId, parsed.turn, today, now());
            const guardrailViolations = stateGuardrailViolations(
              options.store,
              userId,
              [...states, ...proposedActiveStates],
              effectiveCalendar.changes,
              today,
              effectiveCalendar.sessions,
            );
            if (guardrailViolations.length > 0) {
              blockedByStates = [...new Set(guardrailViolations.map((violation) => violation.key))];
              validationCode = "mode-guardrail";
              meta.attempts = attempt;
              meta.validationCode = validationCode;
              meta.blockedByStates = blockedByStates;
              if (attempt >= maxAttempts) {
                reply = fallbackFor(validationCode);
                break;
              }
              const feedback = buildValidationFeedbackForCode(
                "mode-guardrail",
                guardrailViolations.map((violation) => violation.message).join(" "),
                today,
                timezone,
                attempt,
                maxAttempts,
                guardrailViolations.map((violation) => ({
                  path: violation.path,
                  code: "mode-guardrail",
                  message: violation.message,
                  rejectedValue: violation.kind,
                })),
                "respect-state",
              );
              appendRepair(messages, modelReply, feedback);
              continue;
            }
            blockedByStates = [];
            const applied = applyParsedTurn(
              options,
              userId,
              parsed.turn,
              now(),
              today,
              attempt,
              directive?.allowCalendarWrites !== false,
              directive?.allowMemoryWrites !== false,
            );
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
      } catch {
        if (requestId !== null) options.store.failCoachTurn(userId, requestId, now());
        if (directive !== undefined) {
          persistDirective(
            options.store,
            userId,
            requestId,
            userMessageId,
            question,
            directive,
            blockedWrites,
            now(),
            turnSuffix,
          );
        }
        sendJson(response, 502, { error: { code: "model-failed", detail: "the model call failed" } });
        return;
      }

      meta.mode = directive?.mode ?? null;
      meta.writesAllowed = directive?.allowCalendarWrites !== false;
      meta.blockedWrites = blockedWrites;
      meta.blockedByStates = blockedByStates;
      meta.prefill = prefill;
      if (directive !== undefined) {
        meta.directiveId = persistDirective(
          options.store,
          userId,
          requestId,
          userMessageId,
          question,
          directive,
          blockedWrites,
          now(),
          turnSuffix,
        );
      }

      if (!persisted) {
        meta.attempts = attempt;
        meta.validationCode = validationCode;
        if (meta.outcome !== "clarified") meta.outcome = "fallback";
        // A guardrail fallback can still leave the runner with the context the model proposed; sensitive states
        // stay observing and surface as a confirmation card instead of being silently lost.
        if (validationCode === "mode-guardrail" && lastProposals.length > 0) {
          meta.states = options.store.transaction(() => applyStateProposals(options.store, userId, lastProposals, now()));
        }
        options.store.appendMessage({ messageId: randomUUID(), userId, role: "assistant", text: reply, createdAt: now() });
      }

      const id = `chatcmpl-${randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);
      if (body["stream"] === true) {
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          connection: "keep-alive",
          "x-content-type-options": "nosniff",
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
      log.info("coach.turn", {
        requestId,
        status: "completed",
        attempts: meta.attempts,
        outcome: meta.outcome,
        validationCode: meta.validationCode,
        replyChars: reply.length,
      });
      } catch (error) {
        log.error("coach.turn.failed", {
          requestId,
          message: error instanceof Error ? error.message : String(error),
        });
        if (requestId !== null) {
          try {
            options.store.failCoachTurn(userId, requestId, now());
          } catch {
            // The claim is best-effort; the response below is still the source of truth for this request.
          }
        }
        throw error;
      }
    })().catch(() => {
      if (!response.headersSent) {
        sendJson(response, 500, { error: { code: "gateway-failed", detail: "the gateway failed before it could reply" } });
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
