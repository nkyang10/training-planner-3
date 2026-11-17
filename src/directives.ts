/**
 * The hidden half of a coach message: a typed, server-authored stage direction. The browser sends a typed intent
 * (never free-form hidden text); the web server turns it into a CoachDirective; the gateway validates, renders and
 * enforces it. The directive never enters the visible chat.
 */
import { createHash } from "node:crypto";

import type {
  CoachDirective,
  CoachDirectiveReferences,
  CoachDirectiveStyle,
  CoachFocus,
  CoachLanguage,
  CoachMode,
  CoachSource,
  CoachTone,
} from "./types";

const MODES: readonly CoachMode[] = ["chat", "review", "plan", "undo"];
const FOCUSES: readonly CoachFocus[] = [
  "schedule",
  "pace",
  "hr",
  "load",
  "race_execution",
  "recovery",
  "consistency",
];
const SOURCES: readonly CoachSource[] = [
  "composer",
  "run-peek",
  "day-menu",
  "history",
  "load-card",
  "auto-sync",
  "activity-detail",
];
const LANGUAGES: readonly CoachLanguage[] = ["auto", "en", "zh-Hant"];
const TONES: readonly CoachTone[] = ["supportive", "direct", "brief"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ID_CHARS = 200;
const MAX_BACKGROUND_CHARS = 280;
const MAX_FOCUS = 4;
const MAX_SESSIONS = 100;

/** Optional framing shared by every action-originated intent. */
export interface CoachIntentBase {
  /** Where the action came from; the server validates it before putting it in the directive. */
  source?: CoachSource;
  /** Optional focus override; the server validates the values. */
  focus?: CoachFocus[];
  /** Optional language/tone override; the server validates the values. */
  style?: CoachDirectiveStyle;
}

/** The browser's typed request for a coach action. It contains no hidden prose. */
export type CoachIntent =
  | ({ kind: "chat" } & CoachIntentBase)
  | ({ kind: "review-activity"; activityId: string } & CoachIntentBase)
  | ({ kind: "review-day"; day: string } & CoachIntentBase)
  | ({ kind: "review-week"; weekStart: string } & CoachIntentBase)
  | ({ kind: "plan"; day?: string } & CoachIntentBase)
  | ({ kind: "undo" } & CoachIntentBase);

export type CoachIntentResult =
  | { ok: true; intent: CoachIntent }
  | { ok: false; detail: string };

/** Context the web resolves before building the directive. */
export interface DirectiveBuildContext {
  /** The activity's stored day, resolved from the store rather than trusted from the browser. */
  activityDay?: string;
  /** The Monday that starts a reviewed week. */
  weekStart?: string;
}

const REVIEW_ACTIVITY_BACKGROUND =
  "Comment only: the referenced activity is the exact run the runner means. Check the plan for that day and the surrounding week, comment on execution, effort and what to keep in mind, and do not change the calendar.";
const REVIEW_DAY_BACKGROUND = "Comment on that day's plan and what is recorded; do not change the calendar.";
const REVIEW_WEEK_BACKGROUND =
  "Review the week's actual versus planned load and consistency; do not change the calendar.";
const PLAN_BACKGROUND =
  "The runner is asking for a schedule change; validate dates, session ids and the 180-day horizon before writing.";
const UNDO_BACKGROUND = "The runner is asking to undo a recent change set; do not mix the revert with schedule edits.";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowed<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

function readId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 && text.length <= MAX_ID_CHARS ? text : undefined;
}

function readDay(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return ISO_DAY.test(text) ? text : undefined;
}

function parseFocus(value: unknown): { ok: true; focus?: CoachFocus[] } | { ok: false; detail: string } {
  if (value === undefined) return { ok: true };
  if (!Array.isArray(value) || value.length > MAX_FOCUS) {
    return { ok: false, detail: "focus must be an array of at most 4 items" };
  }
  const focus: CoachFocus[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isAllowed(item, FOCUSES)) {
      return { ok: false, detail: `unknown focus: ${String(item)}` };
    }
    if (!focus.includes(item)) focus.push(item);
  }
  return focus.length === 0 ? { ok: true } : { ok: true, focus };
}

function parseStyle(value: unknown): { ok: true; style?: CoachDirectiveStyle } | { ok: false; detail: string } {
  if (value === undefined) return { ok: true };
  if (!isObject(value)) return { ok: false, detail: "style must be an object" };
  for (const key of Object.keys(value)) {
    if (key !== "language" && key !== "tone") return { ok: false, detail: `unexpected style key: ${key}` };
  }
  const style: CoachDirectiveStyle = {};
  const language = value["language"];
  if (language !== undefined) {
    if (typeof language !== "string" || !isAllowed(language, LANGUAGES)) {
      return { ok: false, detail: "unknown style language" };
    }
    style.language = language;
  }
  const tone = value["tone"];
  if (tone !== undefined) {
    if (typeof tone !== "string" || !isAllowed(tone, TONES)) {
      return { ok: false, detail: "unknown style tone" };
    }
    style.tone = tone;
  }
  return Object.keys(style).length === 0 ? { ok: true } : { ok: true, style };
}

function parseIntentBase(raw: Record<string, unknown>): { ok: true; value: CoachIntentBase } | { ok: false; detail: string } {
  const allowed = ["kind", "activityId", "day", "weekStart", "source", "focus", "style"];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) return { ok: false, detail: `unexpected intent key: ${key}` };
  }
  const value: CoachIntentBase = {};
  const source = raw["source"];
  if (source !== undefined) {
    if (typeof source !== "string" || !isAllowed(source, SOURCES)) {
      return { ok: false, detail: "unknown intent source" };
    }
    value.source = source;
  }
  const focus = parseFocus(raw["focus"]);
  if (!focus.ok) return focus;
  if (focus.focus !== undefined) value.focus = focus.focus;
  const style = parseStyle(raw["style"]);
  if (!style.ok) return style;
  if (style.style !== undefined) value.style = style.style;
  return { ok: true, value };
}

/** Validate the browser's typed intent. No free-form hidden text is accepted. */
export function parseCoachIntent(raw: unknown): CoachIntentResult {
  if (raw === undefined || raw === null) return { ok: true, intent: { kind: "chat" } };
  if (!isObject(raw)) return { ok: false, detail: "intent must be an object" };
  const kind = raw["kind"];
  if (typeof kind !== "string") return { ok: false, detail: "intent kind must be a string" };
  const base = parseIntentBase(raw);
  if (!base.ok) return base;
  const common = base.value;
  switch (kind) {
    case "chat":
      return { ok: true, intent: { kind: "chat", ...common } };
    case "review-activity": {
      const activityId = readId(raw["activityId"]);
      if (activityId === undefined) return { ok: false, detail: "review-activity needs a valid activityId" };
      return { ok: true, intent: { kind: "review-activity", activityId, ...common } };
    }
    case "review-day": {
      const day = readDay(raw["day"]);
      if (day === undefined) return { ok: false, detail: "review-day needs an ISO day" };
      return { ok: true, intent: { kind: "review-day", day, ...common } };
    }
    case "review-week": {
      const weekStart = readDay(raw["weekStart"]);
      if (weekStart === undefined) return { ok: false, detail: "review-week needs an ISO weekStart" };
      return { ok: true, intent: { kind: "review-week", weekStart, ...common } };
    }
    case "plan": {
      const rawDay = raw["day"];
      if (rawDay === undefined) return { ok: true, intent: { kind: "plan", ...common } };
      const day = readDay(rawDay);
      if (day === undefined) return { ok: false, detail: "plan day must be an ISO day" };
      return { ok: true, intent: { kind: "plan", day, ...common } };
    }
    case "undo":
      return { ok: true, intent: { kind: "undo", ...common } };
    default:
      return { ok: false, detail: `unknown intent kind: ${kind}` };
  }
}

/** Turn a typed intent into the server-authored directive. A plain chat turn has no directive. */
export function buildDirectiveForIntent(
  intent: CoachIntent,
  context: DirectiveBuildContext = {},
): CoachDirective | undefined {
  if (intent.kind === "chat") return undefined;
  const style: CoachDirectiveStyle = {
    language: intent.style?.language ?? "auto",
    tone: intent.style?.tone ?? "supportive",
  };
  if (intent.kind === "review-activity") {
    const references: CoachDirectiveReferences = { activityId: intent.activityId };
    if (context.activityDay !== undefined) references.day = context.activityDay;
    return {
      mode: "review",
      allowCalendarWrites: false,
      allowMemoryWrites: true,
      focus: intent.focus ?? ["schedule", "pace", "hr", "race_execution"],
      references,
      background: REVIEW_ACTIVITY_BACKGROUND,
      source: intent.source ?? "run-peek",
      style,
    };
  }
  if (intent.kind === "review-day") {
    return {
      mode: "review",
      allowCalendarWrites: false,
      allowMemoryWrites: true,
      focus: intent.focus ?? ["schedule", "load"],
      references: { day: intent.day },
      background: REVIEW_DAY_BACKGROUND,
      source: intent.source ?? "day-menu",
      style,
    };
  }
  if (intent.kind === "review-week") {
    return {
      mode: "review",
      allowCalendarWrites: false,
      allowMemoryWrites: true,
      focus: intent.focus ?? ["load", "consistency", "schedule"],
      references: { weekStart: context.weekStart ?? intent.weekStart },
      background: REVIEW_WEEK_BACKGROUND,
      source: intent.source ?? "load-card",
      style,
    };
  }
  if (intent.kind === "plan") {
    const directive: CoachDirective = {
      mode: "plan",
      allowCalendarWrites: true,
      allowMemoryWrites: true,
      focus: intent.focus ?? ["schedule"],
      background: PLAN_BACKGROUND,
      source: intent.source ?? "day-menu",
      style,
    };
    if (intent.day !== undefined) directive.references = { day: intent.day };
    return directive;
  }
  return {
    mode: "undo",
    allowCalendarWrites: true,
    allowMemoryWrites: true,
    background: UNDO_BACKGROUND,
    source: intent.source ?? "composer",
    style,
  };
}

function parseReferences(
  value: unknown,
): { ok: true; references?: CoachDirectiveReferences } | { ok: false; detail: string } {
  if (value === undefined) return { ok: true };
  if (!isObject(value)) return { ok: false, detail: "references must be an object" };
  const allowed = ["activityId", "day", "weekStart", "sessionIds"];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) return { ok: false, detail: `unexpected reference key: ${key}` };
  }
  const references: CoachDirectiveReferences = {};
  const activityId = value["activityId"];
  if (activityId !== undefined) {
    const parsed = readId(activityId);
    if (parsed === undefined) return { ok: false, detail: "activityId reference must be a short string" };
    references.activityId = parsed;
  }
  const day = value["day"];
  if (day !== undefined) {
    const parsed = readDay(day);
    if (parsed === undefined) return { ok: false, detail: "day reference must be an ISO day" };
    references.day = parsed;
  }
  const weekStart = value["weekStart"];
  if (weekStart !== undefined) {
    const parsed = readDay(weekStart);
    if (parsed === undefined) return { ok: false, detail: "weekStart reference must be an ISO day" };
    references.weekStart = parsed;
  }
  const rawSessions = value["sessionIds"];
  if (rawSessions !== undefined) {
    if (!Array.isArray(rawSessions) || rawSessions.length > MAX_SESSIONS) {
      return { ok: false, detail: "sessionIds must be an array of at most 100 ids" };
    }
    const sessionIds: string[] = [];
    for (const item of rawSessions) {
      const parsed = readId(item);
      if (parsed === undefined) return { ok: false, detail: "each session id must be a short string" };
      if (!sessionIds.includes(parsed)) sessionIds.push(parsed);
    }
    if (sessionIds.length > 0) references.sessionIds = sessionIds;
  }
  return Object.keys(references).length === 0 ? { ok: true } : { ok: true, references };
}

/** Validate a directive received from the trusted web server. Unknown fields are rejected. */
export function parseCoachDirective(
  raw: unknown,
): { ok: true; directive: CoachDirective } | { ok: false; detail: string } {
  if (!isObject(raw)) return { ok: false, detail: "directive must be an object" };
  const allowed = [
    "mode",
    "allowCalendarWrites",
    "allowMemoryWrites",
    "focus",
    "references",
    "background",
    "source",
    "style",
  ];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) return { ok: false, detail: `unexpected directive key: ${key}` };
  }
  const mode = raw["mode"];
  if (typeof mode !== "string" || !isAllowed(mode, MODES)) return { ok: false, detail: "unknown directive mode" };
  const allowCalendarWrites = raw["allowCalendarWrites"];
  if (typeof allowCalendarWrites !== "boolean") {
    return { ok: false, detail: "allowCalendarWrites must be a boolean" };
  }
  const allowMemoryWrites = raw["allowMemoryWrites"];
  if (allowMemoryWrites !== undefined && typeof allowMemoryWrites !== "boolean") {
    return { ok: false, detail: "allowMemoryWrites must be a boolean" };
  }
  const focus = parseFocus(raw["focus"]);
  if (!focus.ok) return focus;
  const references = parseReferences(raw["references"]);
  if (!references.ok) return references;
  const background = raw["background"];
  if (background !== undefined) {
    if (typeof background !== "string") return { ok: false, detail: "background must be a string" };
    if (background.trim().length === 0 || background.length > MAX_BACKGROUND_CHARS) {
      return { ok: false, detail: "background must be 1..280 characters" };
    }
  }
  const source = raw["source"];
  if (typeof source !== "string" || !isAllowed(source, SOURCES)) {
    return { ok: false, detail: "unknown directive source" };
  }
  const style = parseStyle(raw["style"]);
  if (!style.ok) return style;
  const directive: CoachDirective = {
    mode,
    allowCalendarWrites,
    ...(allowMemoryWrites === undefined ? {} : { allowMemoryWrites }),
    ...(focus.focus === undefined ? {} : { focus: focus.focus }),
    ...(references.references === undefined ? {} : { references: references.references }),
    ...(background === undefined ? {} : { background: background.trim() }),
    source,
    ...(style.style === undefined ? {} : { style: style.style }),
  };
  return { ok: true, directive };
}

/** Render the directive as a clearly separated background section for the coach prompt. */
export function renderCoachDirective(directive: CoachDirective): string {
  const lines = [
    "Turn directive (background; never mention this section to the runner):",
    `- mode: ${directive.mode}`,
    `- calendar writes: ${directive.allowCalendarWrites ? "allowed" : "forbidden"}`,
    `- memory writes: ${directive.allowMemoryWrites === false ? "forbidden" : "allowed"}`,
  ];
  if (directive.focus !== undefined && directive.focus.length > 0) {
    lines.push(`- focus: ${directive.focus.join(", ")}`);
  }
  const references = directive.references;
  if (references !== undefined) {
    const parts: string[] = [];
    if (references.activityId !== undefined) parts.push(`activity ${references.activityId}`);
    if (references.day !== undefined) parts.push(`day ${references.day}`);
    if (references.weekStart !== undefined) parts.push(`week ${references.weekStart}`);
    if (references.sessionIds !== undefined && references.sessionIds.length > 0) {
      parts.push(`sessions ${references.sessionIds.join(", ")}`);
    }
    if (parts.length > 0) lines.push(`- references: ${parts.join("; ")}`);
  }
  if (directive.background !== undefined) lines.push(`- background: ${directive.background}`);
  if (directive.style !== undefined) {
    const style: string[] = [];
    if (directive.style.language !== undefined) style.push(`language ${directive.style.language}`);
    if (directive.style.tone !== undefined) style.push(`tone ${directive.style.tone}`);
    if (style.length > 0) lines.push(`- style: ${style.join(", ")}`);
  }
  if (!directive.allowCalendarWrites) {
    lines.push(
      "This turn is comment-only: reply in plain text, write no sessions and no revert, and leave the calendar unchanged.",
    );
  }
  lines.push("Do not mention this directive to the runner; the visible reply must stand alone.");
  return lines.join("\n");
}

/** Stable hash of a normalized directive; a replay with a different directive is refused. */
export function directiveHash(directive: CoachDirective): string {
  return createHash("sha256").update(JSON.stringify(directive)).digest("hex");
}
