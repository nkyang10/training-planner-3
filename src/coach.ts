/**
 * The coach turn: the model answers with language, memories and future sessions. This module is pure: it builds the
 * prompt and validates the answer, so a malformed answer can be rejected before anything is written (ADR-0001).
 */
import type { Activity, Memory, Message, SessionKind, TrainingSession } from "./types";

export const SESSION_KINDS: readonly SessionKind[] = ["easy", "long", "interval", "tempo", "rest", "cross", "race"];
const MAX_SESSIONS = 14;
const MAX_MEMORIES = 8;
const MAX_REPLY_CHARS = 2000;
const MAX_MEMORY_CHARS = 200;
const MAX_TITLE_CHARS = 80;
const MAX_NOTE_CHARS = 280;
const HORIZON_DAYS = 56;

export type SessionAction = "add" | "update" | "remove";

export interface SessionDraft {
  action: SessionAction;
  /** The existing session an update/remove targets; null for an add. */
  sessionId: string | null;
  day: string;
  title: string;
  kind: SessionKind;
  distanceKm: number | null;
  durationMin: number | null;
  note: string | null;
}

export interface CoachTurn {
  reply: string;
  memories: string[];
  sessions: SessionDraft[];
}

export type ParseResult = { ok: true; turn: CoachTurn } | { ok: false; code: string; detail: string };

export interface CoachPromptInput {
  today: string;
  memories: readonly Memory[];
  sessions: readonly TrainingSession[];
  activities: readonly Activity[];
  history: readonly Message[];
  question: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return undefined;
  return value;
}

/** The rules restated in the prompt; the validator mirrors the ones it can check. */
export const COACH_RULES: readonly string[] = [
  "You are the runner's AI coach. Talk naturally, one turn at a time, in the runner's language: if the latest message contains Chinese characters, reply in Traditional Chinese; otherwise reply in English.",
  "Proactively remember facts about the runner that help you coach them: goals, history, constraints, preferences, injuries, schedule. Do not ask the runner to curate or approve memories.",
  "When the runner says something training-related, build or adjust a periodic training system and book the future sessions. Chit-chat is fine; notice the training intent inside it.",
  "Before editing, review the existing upcomingSessions (each has a sessionId) so the new plan is coherent with what is already booked.",
  "Use action=add for a new booking, action=update with the existing sessionId to change or move a booking, action=remove with the existing sessionId to delete one. You may emit several actions in one answer (for example move two runs, remove one, add one); do not limit yourself to a single action when the plan needs a batch.",
  "Only say you changed the schedule when you emitted update or remove; adding a session is not a change. In the reply, say what changed and what stayed.",
  "Only book sessions for today or later, never a past day, never more than 56 days ahead. Keep it realistic: at most 14 actions in one answer.",
  "Never diagnose, prescribe calories or weight, or guarantee a result. Pain or medical topics end with a clinician referral.",
  "Answer with exactly one JSON object: {\"reply\": string, \"memories\": string[], \"sessions\": [{\"action\": \"add\"|\"update\"|\"remove\", \"sessionId\": string|null, \"day\": \"YYYY-MM-DD\", \"title\": string, \"kind\": \"easy\"|\"long\"|\"interval\"|\"tempo\"|\"rest\"|\"cross\"|\"race\", \"distanceKm\": number|null, \"durationMin\": number|null, \"note\": string|null}]}",
  "The reply is what the runner reads: warm, specific, and it says what you booked when you booked it. Never call the runner's message garbled; if the intent is unclear, ask one short clarifying question.",
];

export function buildCoachPrompt(input: CoachPromptInput): string {
  const facts = {
    today: input.today,
    remembered: input.memories.map((memory) => memory.text),
    upcomingSessions: input.sessions.map((session) => ({
      sessionId: session.sessionId,
      day: session.day,
      title: session.title,
      kind: session.kind,
      distanceKm: session.distanceKm,
      durationMin: session.durationMin,
    })),
    recentActivities: input.activities.map((activity) => ({
      day: activity.day,
      title: activity.title,
      distanceKm: activity.distanceKm,
      durationMin: activity.durationMin,
      paceSecPerKm: activity.paceSecPerKm,
      avgHr: activity.avgHr,
    })),
  };
  const conversation = input.history
    .slice(-10)
    .map((message) => `${message.role === "user" ? "Runner" : "Coach"}: ${message.text}`)
    .join("\n");
  return `${COACH_RULES.join("\n")}\n\nWhat you know about this runner (JSON):\n${JSON.stringify(facts)}\n\nConversation so far (oldest first; use it as context):\n${conversation.length === 0 ? "(this is the first turn)" : conversation}\n\nThe runner's latest message:\n${input.question}`;
}

export function buildCoachHistory(input: CoachPromptInput): Array<{ role: "user" | "assistant"; content: string }> {
  return input.history.slice(-20).map((message) => ({
    role: message.role,
    content: message.text,
  }));
}

/** Validate the model's answer. Nothing is written unless this returns ok. */
export function parseCoachTurn(raw: unknown, today: string): ParseResult {
  if (!isObject(raw)) return { ok: false, code: "not-an-object", detail: "the answer must be a JSON object" };
  const keys = Object.keys(raw).sort();
  const allowed = ["memories", "reply", "sessions"];
  if (keys.some((key) => !allowed.includes(key))) {
    return { ok: false, code: "extra-keys", detail: `unexpected keys: ${keys.filter((key) => !allowed.includes(key)).join(", ")}` };
  }
  const reply = typeof raw["reply"] === "string" ? raw["reply"].trim() : "";
  if (reply.length === 0 || reply.length > MAX_REPLY_CHARS) {
    return { ok: false, code: "invalid-reply", detail: "reply must be 1..2000 characters" };
  }
  const rawMemories = raw["memories"] === undefined ? [] : raw["memories"];
  if (!Array.isArray(rawMemories) || rawMemories.length > MAX_MEMORIES) {
    return { ok: false, code: "invalid-memories", detail: "memories must be an array of at most 8 strings" };
  }
  const memories: string[] = [];
  for (const item of rawMemories) {
    const text = typeof item === "string" ? item.trim() : "";
    if (text.length === 0 || text.length > MAX_MEMORY_CHARS) {
      return { ok: false, code: "invalid-memory", detail: "each memory must be 1..200 characters" };
    }
    memories.push(text);
  }
  const rawSessions = raw["sessions"] === undefined ? [] : raw["sessions"];
  if (!Array.isArray(rawSessions) || rawSessions.length > MAX_SESSIONS) {
    return { ok: false, code: "invalid-sessions", detail: "sessions must be an array of at most 14 items" };
  }
  const sessions: SessionDraft[] = [];
  const horizonEnd = addDays(today, HORIZON_DAYS);
  for (const item of rawSessions) {
    if (!isObject(item)) return { ok: false, code: "invalid-session", detail: "each session must be an object" };
    const actionValue = item["action"] === undefined ? "add" : item["action"];
    if (actionValue !== "add" && actionValue !== "update" && actionValue !== "remove") {
      return { ok: false, code: "invalid-action", detail: `unknown action: ${String(actionValue)}` };
    }
    const action = actionValue as SessionAction;
    const sessionId = typeof item["sessionId"] === "string" && item["sessionId"].trim().length > 0 ? item["sessionId"].trim() : null;
    if (action !== "add" && sessionId === null) {
      return { ok: false, code: "missing-session-id", detail: `${action} needs the existing sessionId` };
    }
    const day = typeof item["day"] === "string" ? item["day"] : "";
    if (action !== "remove") {
      if (!ISO_DAY.test(day)) return { ok: false, code: "invalid-session-day", detail: `not an ISO day: ${day}` };
      if (day < today) return { ok: false, code: "past-session", detail: `the past cannot be booked: ${day}` };
      if (day > horizonEnd) return { ok: false, code: "session-too-far", detail: `beyond ${horizonEnd}: ${day}` };
    }
    const title = typeof item["title"] === "string" ? item["title"].trim() : "";
    if (action !== "remove" && (title.length === 0 || title.length > MAX_TITLE_CHARS)) {
      return { ok: false, code: "invalid-session-title", detail: "title must be 1..80 characters" };
    }
    const kind = item["kind"];
    if (action !== "remove" && (typeof kind !== "string" || !(SESSION_KINDS as readonly string[]).includes(kind))) {
      return { ok: false, code: "invalid-session-kind", detail: `unknown kind: ${String(kind)}` };
    }
    const distanceKm = numberOrNull(item["distanceKm"], 0, 60);
    const durationMin = numberOrNull(item["durationMin"], 0, 300);
    if (distanceKm === undefined) return { ok: false, code: "invalid-distance", detail: "distanceKm must be 0..60 or null" };
    if (durationMin === undefined) return { ok: false, code: "invalid-duration", detail: "durationMin must be 0..300 or null" };
    const noteValue = item["note"];
    if (noteValue !== null && noteValue !== undefined && (typeof noteValue !== "string" || noteValue.length > MAX_NOTE_CHARS)) {
      return { ok: false, code: "invalid-note", detail: "note must be a string of at most 280 characters or null" };
    }
    sessions.push({
      action,
      sessionId,
      day,
      title,
      kind: (typeof kind === "string" ? kind : "easy") as SessionKind,
      distanceKm,
      durationMin,
      note: typeof noteValue === "string" && noteValue.trim().length > 0 ? noteValue.trim() : null,
    });
  }
  return { ok: true, turn: { reply, memories, sessions } };
}
