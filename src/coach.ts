/**
 * The coach turn: the model proposes language, memories, future sessions, follow-up suggestions and (rarely) a
 * request to undo a recent batch. This module is pure: it builds the prompt, defines the tool contract and validates
 * the answer, so a malformed answer can be rejected before anything is written (ADR-0001).
 */
import type { Activity, ChangeSet, Memory, Message, SessionKind, TrainingSession } from "./types";
import { addDays, localDateTime, safeTimeZone, weekday } from "./time";

export const SESSION_KINDS: readonly SessionKind[] = ["easy", "long", "interval", "tempo", "rest", "cross", "race", "racewalk"];
const MAX_SESSIONS = 14;
const MAX_MEMORIES = 8;
const MAX_REPLY_CHARS = 2000;
const MAX_MEMORY_CHARS = 200;
const MAX_TITLE_CHARS = 80;
const MAX_NOTE_CHARS = 280;
const MAX_SUGGESTIONS = 3;
const MAX_SUGGESTION_CHARS = 120;
const MAX_REVERT_ID_CHARS = 100;
export const HORIZON_DAYS = 180;

export const COACH_TOOL_NAME = "propose_calendar_turn";

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
  /** 1-3 short follow-ups the runner can tap, in the runner's language. */
  suggestions: string[];
  /** A recent change set to undo ("last" allowed), or null for a normal turn. */
  revertChangeSetId: string | null;
}

export type ValidationPolicy = "repair-format" | "ask-user" | "explain-limit";

export interface ValidationIssue {
  /** A stable field path such as `sessions[0].day`. */
  path: string;
  code: string;
  message: string;
  rejectedValue?: string | number | null;
}

export type ParseResult =
  | { ok: true; turn: CoachTurn }
  | {
      ok: false;
      code: string;
      detail: string;
      issues: ValidationIssue[];
      policy: ValidationPolicy;
    };

export interface ValidationFeedback {
  ok: false;
  code: string;
  issues: ValidationIssue[];
  context: {
    today: string;
    timezone: string;
    weekday: string;
    tomorrow: string;
    horizonEnd: string;
  };
  attempt: number;
  maxAttempts: number;
  policy: ValidationPolicy;
}

export interface CoachPromptInput {
  today: string;
  /** IANA timezone; defaults to UTC for old callers and tests. */
  timezone?: string;
  /** The instant the turn started, used only to date-stamp history. */
  now?: string;
  memories: readonly Memory[];
  sessions: readonly TrainingSession[];
  activities: readonly Activity[];
  history: readonly Message[];
  /** Recent batches, newest first, so the coach knows what changed and what was already undone. */
  recentChanges: readonly ChangeSet[];
  question: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return undefined;
  return value;
}

/** Which recovery path the gateway should take for a validation failure. */
export function policyForCode(code: string): ValidationPolicy {
  if (code === "session-too-far") return "explain-limit";
  if (
    code === "past-session" ||
    code === "missing-session-id" ||
    code === "invalid-action" ||
    code === "invalid-session-kind"
  ) {
    return "ask-user";
  }
  return "repair-format";
}

/** The strict tool definition the model must call before the gateway will write anything. */
export const COACH_TOOL = {
  type: "function",
  function: {
    name: COACH_TOOL_NAME,
    description:
      "Propose one coach turn. The server validates every field before writing; a rejected proposal writes nothing.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["reply", "memories", "sessions", "suggestions", "revertChangeSetId"],
      properties: {
        reply: { type: "string", minLength: 1, maxLength: MAX_REPLY_CHARS },
        memories: {
          type: "array",
          maxItems: MAX_MEMORIES,
          items: { type: "string", minLength: 1, maxLength: MAX_MEMORY_CHARS },
        },
        sessions: {
          type: "array",
          maxItems: MAX_SESSIONS,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["action", "sessionId", "day", "title", "kind", "distanceKm", "durationMin", "note"],
            properties: {
              action: { type: "string", enum: ["add", "update", "remove"] },
              sessionId: { type: ["string", "null"] },
              day: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
              title: { type: "string", maxLength: MAX_TITLE_CHARS },
              kind: { type: "string", enum: [...SESSION_KINDS] },
              distanceKm: { type: ["number", "null"], minimum: 0, maximum: 60 },
              durationMin: { type: ["number", "null"], minimum: 0, maximum: 300 },
              note: { type: ["string", "null"], maxLength: MAX_NOTE_CHARS },
            },
          },
        },
        suggestions: {
          type: "array",
          minItems: 1,
          maxItems: MAX_SUGGESTIONS,
          items: { type: "string", minLength: 1, maxLength: MAX_SUGGESTION_CHARS },
        },
        revertChangeSetId: { type: ["string", "null"], maxLength: MAX_REVERT_ID_CHARS },
      },
    },
  },
} as const;

/** The rules restated in the prompt; the validator mirrors the ones it can check. */
export const COACH_RULES: readonly string[] = [
  "You are the runner's AI coach. Talk naturally, one turn at a time, in the runner's language: if the latest message contains Chinese characters, reply in Traditional Chinese; otherwise reply in English.",
  "Proactively remember facts about the runner that help you coach them: goals, history, constraints, preferences, injuries, schedule. Do not ask the runner to curate or approve memories.",
  "When the runner says something training-related, build or adjust a periodic training system and book the future sessions. Chit-chat is fine; notice the training intent inside it.",
  "For a race, use kind=\"race\" (or kind=\"racewalk\" when the runner races by race walking) on the race date, and book the race-week sessions around it. If the race is farther than 180 days away, record the goal in memories and explain that the booking will open later.",
  "The facts contain today, timezone, weekday and tomorrow. Those values are authoritative. Conversation history is date-stamped with the local time each message was sent; a date inside an older message is historical, not today. A bare follow-up such as \"go\" does not specify a date: never reuse a date from an earlier coach message. If the intended booking date is not explicit, ask one short question instead of guessing.",
  "When the runner gives a month and day without a year and that date has already passed this year, use the next occurrence on or after today; never call the runner's date past without checking. For example, with today 2026-11-06, \"Jan 15\" means 2027-01-15.",
  "The calendar accepts bookings up to 180 days ahead. If the runner asks for a date beyond that, say the 180-day limit explicitly in the reply, remember the goal, and book nothing beyond the limit. The bubble also shows this limit to the runner.",
  "Before editing, review the existing upcomingSessions (each has a sessionId) and recentChanges (each has a changeSetId, summary, createdAt and revertedAt) so the new plan is coherent with what is already booked and you never undo what was already undone.",
  "Use action=add for a new booking, action=update with the existing sessionId to change or move a booking, action=remove with the existing sessionId to delete one. You may emit several actions in one answer (for example move two runs, remove one, add one); do not limit yourself to a single action when the plan needs a batch.",
  "Only say you changed the schedule when you emitted update or remove; adding a session is not a change. In the reply, say what changed and what stayed.",
  "Only book sessions for today or later, never a past day, never more than 180 days ahead. Keep it realistic: at most 14 actions in one answer.",
  "Never diagnose, prescribe calories or weight, or guarantee a result. Pain or medical topics end with a clinician referral.",
  "End every answer with 1-3 follow-up suggestions the runner can tap next: short, concrete, imperative next steps of 1..120 characters each, in the runner's language, for example \"Book my long run for Sunday\" or \"Move Thursday to Friday\". No questions, no numbering, no duplicates.",
  "If the runner asks to undo a change, set revertChangeSetId to a recentChanges changeSetId, or to \"last\" for the newest change that is not reverted yet, and emit no sessions in that turn. Never mix a revert with add/update/remove actions.",
  `When you want to change the calendar, call the ${COACH_TOOL_NAME} tool with exactly one JSON object matching its schema. If you need to ask the runner something, reply in plain text and do not call the tool.`,
  "Answer with exactly one JSON object: {\"reply\": string, \"memories\": string[], \"sessions\": [{\"action\": \"add\"|\"update\"|\"remove\", \"sessionId\": string|null, \"day\": \"YYYY-MM-DD\", \"title\": string, \"kind\": \"easy\"|\"long\"|\"interval\"|\"tempo\"|\"rest\"|\"cross\"|\"race\"|\"racewalk\", \"distanceKm\": number|null, \"durationMin\": number|null, \"note\": string|null}], \"suggestions\": string[], \"revertChangeSetId\": string|null}",
  "The schema above uses placeholders such as YYYY-MM-DD, string, 0 and null. Never copy the schema or its placeholders into the answer; replace every placeholder with the runner's real values. If you cannot book anything, return an empty sessions array and explain why in reply.",
  "The reply is what the runner reads: warm, specific, and it says what you booked when you booked it. Never call the runner's message garbled; if the intent is unclear, ask one short clarifying question.",
];

export function buildCoachPrompt(input: CoachPromptInput): string {
  const timezone = safeTimeZone(input.timezone);
  const today = input.today;
  const facts = {
    now: input.now ?? null,
    today,
    timezone,
    weekday: weekday(today),
    tomorrow: addDays(today, 1),
    horizonEnd: addDays(today, HORIZON_DAYS),
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
    recentChanges: input.recentChanges.map((changeSet) => ({
      changeSetId: changeSet.changeSetId,
      summary: changeSet.summary,
      createdAt: changeSet.createdAt,
      revertedAt: changeSet.revertedAt,
    })),
  };
  const conversation = input.history
    .slice(-10)
    .map((message) => {
      const role = message.role === "user" ? "Runner" : "Coach";
      return `[${localDateTime(message.createdAt, timezone)}] ${role}: ${message.text}`;
    })
    .join("\n");
  return `${COACH_RULES.join("\n")}\n\nWhat you know about this runner (JSON):\n${JSON.stringify(facts)}\n\nConversation so far (oldest first; each line is date-stamped in ${timezone}; use it as context, not as today):\n${conversation.length === 0 ? "(this is the first turn)" : conversation}\n\nThe runner's latest message:\n${input.question}`;
}

export function buildCoachHistory(input: CoachPromptInput): Array<{ role: "user" | "assistant"; content: string }> {
  return input.history.slice(-20).map((message) => ({
    role: message.role,
    content: message.text,
  }));
}

/** Turn a failed parse into the structured result the model reads on the repair attempt. */
export function buildValidationFeedback(
  result: ParseResult,
  today: string,
  timezone: string,
  attempt: number,
  maxAttempts: number,
): ValidationFeedback {
  if (result.ok) throw new Error("cannot build validation feedback for a successful turn");
  return buildValidationFeedbackForCode(result.code, result.detail, today, timezone, attempt, maxAttempts, result.issues, result.policy);
}

/** Feedback for failures that happen before `parseCoachTurn`, such as malformed tool arguments. */
export function buildValidationFeedbackForCode(
  code: string,
  detail: string,
  today: string,
  timezone: string,
  attempt: number,
  maxAttempts: number,
  issues: ValidationIssue[] = [{ path: "", code, message: detail }],
  policy: ValidationPolicy = policyForCode(code),
): ValidationFeedback {
  return {
    ok: false,
    code,
    issues,
    context: {
      today,
      timezone: safeTimeZone(timezone),
      weekday: weekday(today),
      tomorrow: addDays(today, 1),
      horizonEnd: addDays(today, HORIZON_DAYS),
    },
    attempt,
    maxAttempts,
    policy,
  };
}

/** Validate the model's answer. Nothing is written unless this returns ok. */
export function parseCoachTurn(raw: unknown, today: string): ParseResult {
  const issues: ValidationIssue[] = [];
  const addIssue = (path: string, code: string, message: string, rejectedValue?: string | number | null): void => {
    issues.push(rejectedValue === undefined ? { path, code, message } : { path, code, message, rejectedValue });
  };

  if (!isObject(raw)) {
    return {
      ok: false,
      code: "not-an-object",
      detail: "the answer must be a JSON object",
      issues: [{ path: "", code: "not-an-object", message: "the answer must be a JSON object" }],
      policy: "repair-format",
    };
  }

  const keys = Object.keys(raw).sort();
  const allowed = ["memories", "reply", "revertChangeSetId", "sessions", "suggestions"];
  for (const key of keys) {
    if (!allowed.includes(key)) addIssue(key, "extra-keys", `unexpected key: ${key}`, key);
  }

  const reply = typeof raw["reply"] === "string" ? raw["reply"].trim() : "";
  if (reply.length === 0 || reply.length > MAX_REPLY_CHARS) {
    addIssue("reply", "invalid-reply", "reply must be 1..2000 characters", reply);
  }

  const rawMemories = raw["memories"] === undefined ? [] : raw["memories"];
  const memories: string[] = [];
  if (!Array.isArray(rawMemories) || rawMemories.length > MAX_MEMORIES) {
    addIssue("memories", "invalid-memories", "memories must be an array of at most 8 strings");
  } else {
    for (let index = 0; index < rawMemories.length; index += 1) {
      const item = rawMemories[index];
      const text = typeof item === "string" ? item.trim() : "";
      if (text.length === 0 || text.length > MAX_MEMORY_CHARS) {
        addIssue(`memories[${index}]`, "invalid-memory", "each memory must be 1..200 characters");
      } else {
        memories.push(text);
      }
    }
  }

  const rawSessions = raw["sessions"] === undefined ? [] : raw["sessions"];
  const sessions: SessionDraft[] = [];
  const horizonEnd = addDays(today, HORIZON_DAYS);
  if (!Array.isArray(rawSessions) || rawSessions.length > MAX_SESSIONS) {
    addIssue("sessions", "invalid-sessions", "sessions must be an array of at most 14 items");
  } else {
    for (let index = 0; index < rawSessions.length; index += 1) {
      const item = rawSessions[index];
      const path = `sessions[${index}]`;
      if (!isObject(item)) {
        addIssue(path, "invalid-session", "each session must be an object");
        continue;
      }
      const actionValue = item["action"] === undefined ? "add" : item["action"];
      if (actionValue !== "add" && actionValue !== "update" && actionValue !== "remove") {
        addIssue(`${path}.action`, "invalid-action", `unknown action: ${String(actionValue)}`, String(actionValue));
        continue;
      }
      const action = actionValue as SessionAction;
      const sessionId =
        typeof item["sessionId"] === "string" && item["sessionId"].trim().length > 0 ? item["sessionId"].trim() : null;
      if (action !== "add" && sessionId === null) {
        addIssue(`${path}.sessionId`, "missing-session-id", `${action} needs the existing sessionId`);
      }
      const day = typeof item["day"] === "string" ? item["day"] : "";
      if (action !== "remove") {
        if (!ISO_DAY.test(day)) {
          addIssue(`${path}.day`, "invalid-session-day", `not an ISO day: ${day}`, day);
        } else if (day < today) {
          addIssue(`${path}.day`, "past-session", `the past cannot be booked: ${day}`, day);
        } else if (day > horizonEnd) {
          addIssue(`${path}.day`, "session-too-far", `beyond ${horizonEnd}: ${day}`, day);
        }
      }
      const title = typeof item["title"] === "string" ? item["title"].trim() : "";
      if (action !== "remove" && (title.length === 0 || title.length > MAX_TITLE_CHARS)) {
        addIssue(`${path}.title`, "invalid-session-title", "title must be 1..80 characters", title);
      }
      const kind = item["kind"];
      if (action !== "remove" && (typeof kind !== "string" || !(SESSION_KINDS as readonly string[]).includes(kind))) {
        addIssue(`${path}.kind`, "invalid-session-kind", `unknown kind: ${String(kind)}`, String(kind));
      }
      const distanceKm = numberOrNull(item["distanceKm"], 0, 60);
      const durationMin = numberOrNull(item["durationMin"], 0, 300);
      if (distanceKm === undefined) {
        addIssue(`${path}.distanceKm`, "invalid-distance", "distanceKm must be 0..60 or null");
      }
      if (durationMin === undefined) {
        addIssue(`${path}.durationMin`, "invalid-duration", "durationMin must be 0..300 or null");
      }
      const noteValue = item["note"];
      if (noteValue !== null && noteValue !== undefined && (typeof noteValue !== "string" || noteValue.length > MAX_NOTE_CHARS)) {
        addIssue(`${path}.note`, "invalid-note", "note must be a string of at most 280 characters or null");
      }
      sessions.push({
        action,
        sessionId,
        day,
        title,
        kind: (typeof kind === "string" ? kind : "easy") as SessionKind,
        distanceKm: distanceKm === undefined ? null : distanceKm,
        durationMin: durationMin === undefined ? null : durationMin,
        note: typeof noteValue === "string" && noteValue.trim().length > 0 ? noteValue.trim() : null,
      });
    }
  }

  const rawSuggestions = raw["suggestions"];
  const suggestions: string[] = [];
  if (!Array.isArray(rawSuggestions) || rawSuggestions.length < 1 || rawSuggestions.length > MAX_SUGGESTIONS) {
    addIssue("suggestions", "invalid-suggestions", "suggestions must be an array of 1..3 strings");
  } else {
    for (let index = 0; index < rawSuggestions.length; index += 1) {
      const item = rawSuggestions[index];
      const text = typeof item === "string" ? item.trim() : "";
      if (text.length === 0 || text.length > MAX_SUGGESTION_CHARS) {
        addIssue(`suggestions[${index}]`, "invalid-suggestion", "each suggestion must be 1..120 characters");
      } else {
        suggestions.push(text);
      }
    }
  }

  const rawRevert = raw["revertChangeSetId"];
  let revertChangeSetId: string | null = null;
  if (rawRevert !== null && rawRevert !== undefined) {
    const text = typeof rawRevert === "string" ? rawRevert.trim() : "";
    if (text.length === 0 || text.length > MAX_REVERT_ID_CHARS || /\s/.test(text)) {
      addIssue(
        "revertChangeSetId",
        "invalid-revert",
        "revertChangeSetId must be null, \"last\", or one changeSetId from recentChanges",
      );
    } else {
      revertChangeSetId = text;
    }
  }

  const first = issues[0];
  if (first !== undefined) {
    return {
      ok: false,
      code: first.code,
      detail: first.message,
      issues,
      policy: policyForCode(first.code),
    };
  }
  return { ok: true, turn: { reply, memories, sessions, suggestions, revertChangeSetId } };
}
