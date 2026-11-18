/**
 * The private calendar: the artefact the conversation leaves behind. Planned sessions are read-only for the runner; the
 * coach (gateway) is the only session writer. The day page can log a reported run by hand, and the runner can export the
 * plan, log and change history. See ADR-0001 for the session-write rule.
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";

import { AuthError, type Auth, type AuthUser, type ProfileUpdate } from "./auth";
import { HORIZON_DAYS } from "./coach";
import { applyRevert } from "./history";
import { buildCalendarIcs, buildExportBundle } from "./export";
import { buildManualActivity } from "./manual-activity";
import { createGarminClient, type GarminClient } from "./garmin";
import { describeGarminError } from "./garmin-errors";
import { createGarminSync, type GarminSyncOutcome } from "./garmin-sync";
import { buildDirectiveForIntent, parseCoachIntent, type CoachIntent } from "./directives";
import {
  confirmCoachState,
  getCoachStateDefinition,
  isCoachStateKey,
  refreshCoachStates,
  resolveCoachState,
  setManualCoachState,
  sortCoachStates,
} from "./coach-states";
import {
  GarminError,
  mapGarminLaps,
  mapGarminSplits,
  type ActivityLap,
  type ActivitySplit,
} from "./garmin";
import { failedGarminWorkout, mapGarminWorkout } from "./garmin-workout";
import {
  buildSharedTags,
  isMuscleConditionKey,
  MAX_CHECKIN_NOTE_CHARS,
  musclesForRun,
  parseMuscleTagsJson,
  validateCheckInDay,
  type MuscleCheckIn,
  type MuscleConditionKey,
  type MuscleSide,
  type MuscleWarmUp,
} from "./muscles";
import {
  muscleCalendarChip,
  musclesWorkedCard,
  renderMusclePage,
  type MuscleActivityOption,
  type MuscleTrainingRow,
} from "./web-muscle";
import { CSS } from "./styles";
import { errorBanner, escapeHtml, type ViewName } from "./web-html";
import {
  renderCalendarItems,
  type CalendarDayPayload,
  type CalendarItem,
  type CalendarMonthPayload,
} from "./calendar-items";
import { renderCoachAudit, renderCoachStates, stateChipHtml } from "./web-coach-states";
import { localDay, localDateTime, safeTimeZone } from "./time";
import {
  loadSummaryForWeek,
  matchActivitiesToPlan,
  matchActivity,
  personalBests,
  personalBestsForPeriod,
  unmatchedSessions,
  type ActivityPlanMatch,
  type BestEffortDistance,
  type LoadSummary,
  type PersonalBest,
} from "./training";
import type {
  Activity,
  ActivityWorkout,
  ActivityWorkoutStep,
  AppNotification,
  ChangeSet,
  CoachStateKey,
  GarminKey,
  SessionKind,
  Store,
  TrainingSession,
} from "./types";

export interface WebOptions {
  store: Store;
  auth: Auth;
  /** The coach gateway; the embedded bubble talks through this server so the browser stays same-origin. */
  gatewayUrl?: string;
  modelId?: string;
  /** Create a client from a runner's saved key; defaults to the real Garmin Personal API client. */
  garminFactory?: (apiKey: string) => GarminClient;
  /** Legacy/embedding fallback used only when no runner key is saved. */
  garmin?: GarminClient;
  /** Minimum minutes between automatic Garmin pulls on page load. Defaults to 10. */
  autoSyncMinutes?: number;
  /** Pull Garmin when a new browser session starts (login or a resumed auth cookie). Defaults to true. */
  sessionSync?: boolean;
  /** Deterministic auto-state detection; manual/chat states still work when this is off. */
  autoStates?: boolean;
  now?: () => string;
}

export interface WebApp {
  server: ReturnType<typeof createServer>;
  close(): Promise<void>;
  /** Wait for every in-flight Garmin pull; useful in tests and during shutdown. */
  whenSynced(): Promise<void>;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The pinned three.js builds the 3D muscle viewer imports (see src/vendor/THREE-LICENSE.txt). Read once at
 * startup and served as static scripts, so the app keeps its zero-runtime-npm-dependency rule.
 */
const THREE_MODULE = readFileSync(new URL("./vendor/three.module.min.js", import.meta.url), "utf8");
const ORBIT_CONTROLS_MODULE = readFileSync(new URL("./vendor/OrbitControls.js", import.meta.url), "utf8");

const SESSION_COOKIE = "poc3sid";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;

/**
 * Starter prompts for the suggestion rail when the conversation has no live coach suggestions. The rail is the single
 * place for next steps: starters on first open, then the coach's 1-3 follow-ups. The tone book's voice applies here
 * too: the runner opens with a question or an invitation, and the coach responds.
 */
const STARTER_SUGGESTIONS = ["Can we plan my week together?", "Where could a 5 km run fit this week?", "How did last week go?"];

/** Inline JSON that cannot close the surrounding script element. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(html);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function redirect(
  response: ServerResponse,
  location: string,
  headers: Record<string, string | string[]> = {},
): void {
  response.writeHead(303, { location, ...headers });
  response.end();
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 200_000) throw new Error("request too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text.length === 0 ? undefined : (JSON.parse(text) as unknown);
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 200_000) throw new Error("request too large");
    chunks.push(buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function parseCookies(request: IncomingMessage): Record<string, string> {
  const header = request.headers.cookie ?? "";
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name.length === 0) continue;
    cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return cookies;
}

function sessionCookie(id: string): string {
  return `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function maskKey(apiKey: string): string {
  return `••••${apiKey.slice(-4)}`;
}

function isPlausibleGarminKey(key: string): boolean {
  // Printable ASCII only: a pasted PAT never contains whitespace or control characters.
  return key.length >= 10 && key.length <= 512 && /^[\x21-\x7E]+$/.test(key);
}

function safeNext(value: string | null): string {
  if (
    value !== null &&
    (value === "/calendar" ||
      value.startsWith("/calendar?") ||
      value === "/history" ||
      value.startsWith("/history?") ||
      value === "/muscle" ||
      value.startsWith("/muscle?"))
  ) {
    return value;
  }
  // The day page's own log form returns to that day, so a logged run is reviewed in place.
  if (value !== null && /^\/day\/\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return "/calendar";
}

function withParams(path: string, params: Record<string, string | number>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) query.set(name, String(value));
  return `${path}${path.includes("?") ? "&" : "?"}${query.toString()}`;
}

/** The page to return to after a key save/sync, without transient result params. */
function cleanNext(url: URL): string {
  const params = new URLSearchParams(url.search);
  for (const name of ["synced", "syncError", "newest", "garmin", "keyError"]) params.delete(name);
  const query = params.toString();
  const path = url.pathname === "/" ? "/calendar" : url.pathname;
  return `${path}${query.length === 0 ? "" : `?${query}`}`;
}

/** Redirect params for a completed sync; `newest` lets the training log review only a genuinely new run. */
function syncResultParams(result: GarminSyncOutcome): Record<string, string> {
  if (result.error !== null) return { syncError: result.error };
  const params: Record<string, string> = { synced: String(result.imported) };
  if (result.created > 0 && result.newest !== null) params.newest = result.newest.activityId;
  return params;
}

/**
 * The one-line result of a sync, key save, manual log or undo that survives the redirect. The params already exist;
 * before this helper nothing rendered them, so "I pressed Sync and nothing happened" was the expected reading.
 */
function syncFlash(params: URLSearchParams): string {
  const error = params.get("syncError");
  if (error !== null && error.length > 0) {
    return `<p class="banner error" role="alert">Garmin sync failed: ${escapeHtml(error)}</p>`;
  }
  const synced = params.get("synced");
  if (synced !== null) {
    const count = Number(synced);
    const label = Number.isFinite(count) && count > 0
      ? `${Math.floor(count)} new ${count === 1 ? "activity" : "activities"}`
      : "no new activities";
    return `<p class="banner ok" role="status">Garmin sync finished: ${label}.</p>`;
  }
  if (params.get("garmin") === "deleted") {
    return `<p class="banner ok" role="status">Garmin key removed. Sync is off until you connect again.</p>`;
  }
  if (params.get("logged") === "1") {
    return `<p class="banner ok" role="status">Run logged. It is now part of your calendar and training log.</p>`;
  }
  if (params.get("undone") === "1") {
    return `<p class="banner ok" role="status">Change undone. The calendar is back to its previous state.</p>`;
  }
  const undoError = params.get("undoError");
  if (undoError !== null && undoError.length > 0) {
    return `<p class="banner error" role="alert">Could not undo that change: ${escapeHtml(undoError)}</p>`;
  }
  const logError = params.get("logError");
  if (logError !== null && logError.length > 0) {
    return `<p class="banner error" role="alert">Could not log the run: ${escapeHtml(logError)}</p>`;
  }
  return "";
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(month: string): string {
  return `${month}-01`;
}

function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2026, mon ?? 1, 0)).getUTCDate();
}

function weekdayIndex(day: string): number {
  return (new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

function sessionChip(session: TrainingSession): string {
  const amount = session.distanceKm === null ? "" : ` · ${session.distanceKm} km`;
  return `<span class="session kind-${escapeHtml(session.kind)}" title="${escapeHtml(session.note ?? session.title)}">${escapeHtml(session.title)}${escapeHtml(amount)}</span>`;
}

/**
 * The amount a row can add without repeating its title: the distance when the title omits it, else the duration when the
 * distance is unknown. A title that already says "8 km" keeps the full width; its duration stays in the tooltip.
 */
function calendarMeta(title: string, distanceKm: number | null, durationMin: number | null): string | null {
  if (distanceKm !== null) return titleMentions(title, distanceKm, "km") ? null : `${distanceKm} km`;
  if (durationMin !== null) return formatMinutes(durationMin);
  return null;
}

function titleMentions(title: string, amount: number, unit: string): boolean {
  const escaped = String(amount).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9.])${escaped}\\s*${unit}\\b`, "i").test(title);
}

/** Keep the title as the description, adding distance only when the title does not already state it. */
function calendarPillLabel(title: string, distanceKm: number | null): string {
  return distanceKm !== null && !titleMentions(title, distanceKm, "km") ? `${title} · ${distanceKm} km` : title;
}

function planItem(session: TrainingSession): CalendarItem {
  const kindLabel = sessionKindLabel(session.kind);
  const details = [
    session.distanceKm === null ? "" : `${session.distanceKm} km`,
    session.durationMin === null ? "" : formatMinutes(session.durationMin),
    session.note ?? "",
  ]
    .filter((part) => part.length > 0)
    .join(" · ");
  return {
    type: "plan",
    kind: session.kind,
    kindLabel,
    sessionId: session.sessionId,
    label: session.title,
    meta: calendarMeta(session.title, session.distanceKm, session.durationMin),
    tooltip: `Planned session · ${kindLabel} · ${session.title}${details.length === 0 ? "" : ` · ${details}`}`,
  };
}

function activityRunDetails(activity: Activity): string {
  return [
    activity.distanceKm === null ? "" : `${activity.distanceKm} km`,
    activity.durationMin === null ? "" : formatMinutes(activity.durationMin),
    formatPace(activity.paceSecPerKm),
    activity.avgHr === null ? "" : `${activity.avgHr} bpm`,
    activitySourceLabel(activity),
  ]
    .filter((part) => part.length > 0)
    .join(" · ");
}

function recordItem(activity: Activity): CalendarItem {
  const details = activityRunDetails(activity);
  return {
    type: "record",
    source: activity.source,
    activityId: activity.activityId,
    // The title stays the description; distance, pace and HR stay in the tooltip so a long title fits.
    label: activity.title,
    meta: calendarMeta(activity.title, activity.distanceKm, activity.durationMin),
    tooltip: `Recorded run · ${activity.title}${details.length === 0 ? "" : ` · ${details}`}`,
  };
}

function workoutDetail(workout: ActivityWorkout): string {
  return [workout.summary, workout.notes ?? ""].filter((part) => part.length > 0).join(" · ");
}

/**
 * A recorded run and the Garmin workout it followed, folded into one two-row item. The whole row is one click target:
 * the run peek opens with the workout program inside it, so the run and the program are read together instead of in two
 * separate half-row popups. Pairing is the calendar's default for a run with a fetched workout.
 */
function pairItem(activity: Activity, workout: ActivityWorkout): CalendarItem {
  const workoutLabel = workout.label.length > 0 ? workout.label : "Garmin workout";
  const runDetails = activityRunDetails(activity);
  const detail = workoutDetail(workout);
  const programTitle = workout.name !== null && workout.name.length > 0 ? workout.name : workoutLabel;
  const program = detail.startsWith(programTitle)
    ? detail
    : [programTitle, detail].filter((part) => part.length > 0).join(" · ");
  return {
    type: "pair",
    activityId: activity.activityId,
    run: {
      label: activity.title,
      meta: calendarMeta(activity.title, activity.distanceKm, activity.durationMin),
    },
    workout: { label: workoutLabel },
    tooltip: `Recorded run with Garmin workout · ${activity.title}${runDetails.length === 0 ? "" : ` · ${runDetails}`} · Program: ${program}`,
  };
}

function calendarDayItems(
  sessions: readonly TrainingSession[],
  activities: readonly Activity[],
  workouts: readonly ActivityWorkout[] = [],
): CalendarItem[] {
  const programByActivity = new Map(
    workouts.filter((workout) => workout.status === "ok").map((workout) => [workout.activityId, workout]),
  );
  return [
    ...sessions.map(planItem),
    ...activities.map((activity) => {
      const workout = programByActivity.get(activity.activityId);
      return workout === undefined ? recordItem(activity) : pairItem(activity, workout);
    }),
  ];
}

/** How a recorded activity reached the calendar; "Reported" is the runner telling the coach about it. */
function activitySourceLabel(activity: Activity): string {
  return activity.source === "garmin" ? "Garmin" : "Reported";
}

function activityLine(activity: Activity): string {
  const amount = [activity.distanceKm === null ? "" : `${activity.distanceKm} km`, activity.durationMin === null ? "" : formatMinutes(activity.durationMin), activity.paceSecPerKm === null ? "" : `${Math.floor(activity.paceSecPerKm / 60)}:${String(activity.paceSecPerKm % 60).padStart(2, "0")}/km`, activity.avgHr === null ? "" : `${activity.avgHr} bpm`]
    .filter((part) => part.length > 0)
    .join(" · ");
  return `<li><span class="tick">✓</span> ${escapeHtml(activity.title)}${amount.length === 0 ? "" : ` — ${escapeHtml(amount)}`} <span class="muted">(${escapeHtml(activitySourceLabel(activity))})</span> <a class="chip" href="/activity/${encodeURIComponent(activity.activityId)}">Detail</a></li>`;
}

function formatDayLabel(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function formatShortDate(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}

function changeActionLabel(action: string): string {
  if (action === "add") return "Added";
  if (action === "remove") return "Deleted";
  if (action === "revert") return "Reverted";
  return "Moved";
}

/**
 * The runner-facing change history. The journal already existed but was reachable only by asking the coach; this card
 * makes each batch visible with an Undo form that reuses the same audited revert path.
 */
function recentChangesCard(changeSets: readonly ChangeSet[], next: string): string {
  const heading = `<h2>Recent changes</h2>`;
  if (changeSets.length === 0) {
    return `<section class="card" id="recent-changes">${heading}<p class="muted small">No coach changes yet. When the coach edits your calendar, the batch appears here with an Undo button.</p></section>`;
  }
  const rows = changeSets.map((set) => {
    const undone = set.revertedAt !== null;
    const entries = set.entries
      .map((entry) => `${changeActionLabel(entry.action)} ${entry.title}${entry.fromDay === null || entry.toDay === null ? "" : ` (${formatShortDate(entry.fromDay)} → ${formatShortDate(entry.toDay)})`}`)
      .join(" · ");
    // The visible question names the day and the batch so the coach discusses the exact change, never a guess.
    const discussMessage = `Why did the plan change on ${formatShortDate(set.createdAt.slice(0, 10))}? (${set.summary})`;
    const discussButton = `<button type="button" class="coach-ask" data-coach-message="${escapeHtml(discussMessage)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "discuss-change", changeSetId: set.changeSetId, source: "recent-changes" }))}">Discuss this change</button>`;
    const undoForm = undone
      ? `<div class="change-undo">${discussButton}</div>`
      : `<form method="post" action="/calendar/changes/${encodeURIComponent(set.changeSetId)}/revert" class="change-undo"><input type="hidden" name="next" value="${escapeHtml(next)}"><button class="btn ghost" type="submit">Undo this change</button>${discussButton}</form>`;
    return `<li class="change-item${undone ? " undone" : ""}"><div class="change-head"><strong>${escapeHtml(set.summary)}</strong><span class="muted small">${escapeHtml(formatShortDate(set.createdAt.slice(0, 10)))} · ${set.entries.length} ${set.entries.length === 1 ? "change" : "changes"}${undone ? " · undone" : ""}</span></div><p class="muted small">${escapeHtml(entries)}</p>${undoForm}</li>`;
  }).join("");
  return `<section class="card" id="recent-changes">${heading}<p class="muted small">Every coach batch, newest first. Undo is itself recorded as a change.</p><ul class="change-list">${rows}</ul></section>`;
}

type HistoryView = "week" | "month" | "year";

function addMonths(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (mon ?? 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function formatMonthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}`;
}

function formatWeekRange(start: string): string {
  const end = addDays(start, 6);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const range = sameMonth ? `${Number(start.slice(8, 10))}–${formatShortDate(end)}` : `${formatShortDate(start)} – ${formatShortDate(end)}`;
  return `${range} ${end.slice(0, 4)}`;
}

function historyHref(view: HistoryView, period: string): string {
  return `/history?view=${view}&period=${encodeURIComponent(period)}`;
}

function weekStartOf(day: string): string {
  return addDays(day, -weekdayIndex(day));
}

function weekLabel(start: string): string {
  const end = addDays(start, 6);
  if (start.slice(5, 7) === end.slice(5, 7)) return `${Number(start.slice(8, 10))}–${formatShortDate(end)}`;
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

function formatMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return hours === 0 ? `${mins} min` : `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function sumDistance(activities: readonly Activity[]): number {
  return Math.round(activities.reduce((total, activity) => total + (activity.distanceKm ?? 0), 0) * 10) / 10;
}

function sumDuration(activities: readonly Activity[]): number {
  return activities.reduce((total, activity) => total + (activity.durationMin ?? 0), 0);
}

function formatPace(secPerKm: number | null): string {
  if (secPerKm === null) return "";
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, "0")}/km`;
}

function activityMetrics(activity: Activity): string {
  const parts = [
    activity.distanceKm === null ? "" : `${activity.distanceKm} km`,
    activity.durationMin === null ? "" : formatMinutes(activity.durationMin),
    activity.paceSecPerKm === null ? "" : formatPace(activity.paceSecPerKm),
    activity.avgHr === null ? "" : `${activity.avgHr} bpm`,
  ].filter((part) => part.length > 0);
  return parts.join(" · ");
}

/** The reported-effort word for one run; the session-RPE convention counts 7 and up as hard work. */
function rpeWord(rpe: number): string {
  return rpe >= 7 ? "hard" : rpe >= 4 ? "moderate" : "easy";
}

/**
 * The runner's own effort line for a run they rated, e.g. "Felt 7/10 - hard". Runs logged before the field existed
 * leave it undefined and skipped runs store null; both simply show nothing.
 */
function feltText(activity: Activity): string | null {
  const rpe = activity.rpe ?? null;
  return typeof rpe === "number" && Number.isFinite(rpe) && rpe >= 0 && rpe <= 10
    ? `Felt ${rpe}/10 - ${rpeWord(rpe)}`
    : null;
}

function plannedText(sessions: readonly TrainingSession[]): string {
  return sessions.map((session) => calendarPillLabel(session.title, session.distanceKm)).join(", ");
}

/** A compact identity for one recorded run: its day plus distance and duration. */
function activityReference(activity: Activity): string {
  const amount = [
    activity.distanceKm === null ? "" : `${activity.distanceKm} km`,
    activity.durationMin === null ? "" : formatMinutes(activity.durationMin),
  ]
    .filter((part) => part.length > 0)
    .join(" · ");
  return amount.length === 0 ? formatDayLabel(activity.day) : `${formatDayLabel(activity.day)} · ${amount}`;
}

/**
 * The visible question; the review-only constraints travel in the hidden directive. The parenthetical names the
 * exact run so a repeated title cannot be mistaken for another record, and follow-up turns keep the reference.
 */
function coachPromptForActivity(activity: Activity): string {
  return `How did my ${activity.title} go? (${activityReference(activity)})`;
}

function coachPromptForMissed(day: string, sessions: readonly TrainingSession[]): string {
  return `I planned ${plannedText(sessions)} on ${day} but no activity was recorded. What should I do?`;
}

/**
 * The one-tap review card for a run that just arrived - a synced import or a hand-logged run. Both paths produce the
 * same card and the same review-activity wiring, so a run the runner just told the coach about gets the same
 * conversation starter a synced one does.
 */
function runReviewCard(activity: Activity, eyebrow: string): string {
  return `<section class="card review-card"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(activity.title)}</h2><p class="muted">${escapeHtml(formatDayLabel(activity.day))} · ${escapeHtml(activityMetrics(activity))}</p><div class="review-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(coachPromptForActivity(activity))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-activity", activityId: activity.activityId, source: "auto-sync" }))}">Review this run with the coach</button><a class="chip" href="/muscle?activity=${encodeURIComponent(activity.activityId)}">Log muscle feel</a><a class="chip" href="/activity/${encodeURIComponent(activity.activityId)}">Detail</a></div></section>`;
}

/** The review param a manual log redirect carries, resolved to the stored run; a foreign or stale id shows nothing. */
function manualReviewCardFor(store: Store, userId: string, params: URLSearchParams): string {
  const reviewId = params.get("review");
  if (reviewId === null) return "";
  const activity = store.getActivity(userId, reviewId);
  return activity === undefined ? "" : runReviewCard(activity, "Run logged");
}

/**
 * The review card a redirect can offer on the calendar and the day page: the run a sync just imported, else the run
 * a manual log just stored. The two flows never share one redirect, so at most one card renders.
 */
function redirectReviewCardFor(store: Store, userId: string, params: URLSearchParams): string {
  const newestId = params.get("newest");
  if (newestId !== null) {
    const activity = store.getActivity(userId, newestId);
    if (activity !== undefined) return runReviewCard(activity, "New run synced");
  }
  return manualReviewCardFor(store, userId, params);
}

/**
 * What one week card says about a day with nothing recorded. A rest day, a day that has not arrived yet, or a day
 * that is simply after the last Garmin import is not a missed run; only a past, imported day says so, and without
 * scolding.
 */
function dayEmptyStateHtml(day: string, daySessions: readonly TrainingSession[], today: string, awaitingGarmin: boolean): string {
  if (daySessions.length === 0) return `<p class="muted small">No session or activity.</p>`;
  if (daySessions.every((session) => session.kind === "rest")) return `<p class="muted small">Planned rest.</p>`;
  if (day >= today) return `<p class="muted small">Upcoming.</p>`;
  if (awaitingGarmin) {
    return `<div class="history-missed"><span class="muted">Awaiting Garmin sync · a run from this day may not be imported yet.</span></div>`;
  }
  return `<div class="history-missed"><span class="muted">No run logged — the plan does not change.</span><a class="chip" href="/day/${escapeHtml(day)}#log-run">Log a run</a><button type="button" class="coach-ask" data-coach-message="${escapeHtml(coachPromptForMissed(day, daySessions))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-day", day, source: "history" }))}">Ask coach</button></div>`;
}

/**
 * The consultative load warning for a rising week: the runner's own numbers first, then the decision handed back.
 * The muted note beside it keeps the load computation's honesty labels.
 */
function loadWarningText(load: LoadSummary): string {
  const bits: string[] = [];
  if (load.weekChangePct !== null) bits.push(`${load.weekChangePct > 0 ? "+" : ""}${load.weekChangePct}% versus last week`);
  if (load.acwr !== null) bits.push(`ACWR ${load.acwr.toFixed(2)}`);
  const detail = bits.length === 0 ? "" : ` (${bits.join(", ")})`;
  return load.signal === "high"
    ? `This week's load is high${detail} - want to talk it through?`
    : `This week's load is ramping up${detail} - worth talking through before it gets steep?`;
}

function formatSeconds(total: number): string {
  const rounded = Math.max(0, Math.round(total));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function humanizeEffect(label: string): string {
  return label
    .toLowerCase()
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

interface ActivityMetricItem {
  label: string;
  value: string;
}

function pushMetricItem(
  items: ActivityMetricItem[],
  label: string,
  value: number | null | undefined,
  suffix: string,
  prefix = "",
): void {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    items.push({ label, value: `${prefix}${value} ${suffix}`.trim() });
  }
}

function activityExtraItems(activity: Activity): ActivityMetricItem[] {
  const items: ActivityMetricItem[] = [];
  pushMetricItem(items, "Elevation", activity.elevationGainM, "m", "+");
  pushMetricItem(items, "Calories", activity.calories, "kcal");
  pushMetricItem(items, "Max HR", activity.maxHr, "bpm");
  pushMetricItem(items, "Cadence", activity.cadenceSpm, "spm");
  pushMetricItem(items, "Stride", activity.strideLengthCm, "cm");
  pushMetricItem(items, "Ground contact", activity.groundContactMs, "ms");
  pushMetricItem(items, "Aerobic effect", activity.aerobicTrainingEffect, "");
  pushMetricItem(items, "Anaerobic effect", activity.anaerobicTrainingEffect, "");
  pushMetricItem(items, "Training load", activity.trainingLoad, "");
  if (activity.trainingEffectLabel !== null && activity.trainingEffectLabel !== undefined && activity.trainingEffectLabel.length > 0) {
    items.push({ label: "Effect", value: humanizeEffect(activity.trainingEffectLabel) });
  }
  const felt = feltText(activity);
  if (felt !== null) items.push({ label: "Felt", value: felt });
  return items;
}

function activityExtraMetrics(activity: Activity): string {
  const items = activityExtraItems(activity);
  if (items.length === 0) return "";
  return `<div class="metric-extra-grid">${items.map((item) => `<div class="metric-extra"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}</div>`;
}

const BEST_EFFORT_LABELS: Record<BestEffortDistance, string> = {
  "1k": "1 km",
  "1mi": "1 mi",
  "5k": "5 km",
};

function bestEffortLabel(distance: BestEffortDistance): string {
  return BEST_EFFORT_LABELS[distance];
}

interface FastestEffortItem {
  distance: BestEffortDistance;
  label: string;
  seconds: number;
  pr: boolean;
}

function fastestEffortItems(activity: Activity, prDistances: ReadonlySet<BestEffortDistance>): FastestEffortItem[] {
  const efforts = [
    { distance: "1k" as const, seconds: activity.fastest1kSec },
    { distance: "1mi" as const, seconds: activity.fastest1miSec },
    { distance: "5k" as const, seconds: activity.fastest5kSec },
  ].filter((effort): effort is { distance: BestEffortDistance; seconds: number } =>
    typeof effort.seconds === "number" && Number.isFinite(effort.seconds) && effort.seconds > 0,
  );
  return efforts.map((effort) => ({
    distance: effort.distance,
    label: bestEffortLabel(effort.distance),
    seconds: effort.seconds,
    pr: prDistances.has(effort.distance),
  }));
}

function fastestEfforts(activity: Activity, prDistances: ReadonlySet<BestEffortDistance>): string {
  const efforts = fastestEffortItems(activity, prDistances);
  if (efforts.length === 0) return "";
  return `<div class="best-efforts">${efforts.map((effort) => {
    return `<div class="best-effort${effort.pr ? " pr" : ""}"><span>Fastest ${effort.label}</span><strong>${formatSeconds(effort.seconds)}</strong>${effort.pr ? `<span class="chip pr-chip" title="Best within your stored history, not a lifetime record">PR</span>` : ""}</div>`;
  }).join("")}</div>`;
}

function splitsSection(splits: readonly ActivitySplit[], error: string | null): string {
  if (error !== null) {
    return `<section class="card splits-card"><h2>Per-kilometre splits</h2><p class="muted small">${escapeHtml(error)}</p></section>`;
  }
  if (splits.length === 0) {
    return `<section class="card splits-card"><h2>Per-kilometre splits</h2><p class="muted small">No per-kilometre samples for this run.</p></section>`;
  }
  const rows = splits.map((split) => `<div class="split-row" role="row"><span>${split.partial ? `${split.distanceKm} km` : `${split.index} km`}</span><span>${formatSeconds(split.durationSec)}</span><span>${formatPace(split.paceSecPerKm)}</span><span>${split.avgHr === null ? "—" : `${split.avgHr} bpm`}</span></div>`).join("");
  return `<section class="card splits-card"><div class="splits-head"><h2>Per-kilometre splits</h2><p class="muted small">Elapsed pace; the final split may be partial.</p></div><div class="splits-table" role="table" aria-label="Per-kilometre splits"><div class="split-row split-header" role="row"><span>KM</span><span>Time</span><span>Pace</span><span>Avg HR</span></div>${rows}</div></section>`;
}

function lapsSection(laps: readonly ActivityLap[], error: string | null): string {
  if (error !== null) {
    return `<section class="card laps-card"><h2>Garmin laps / intervals</h2><p class="muted small">${escapeHtml(error)}</p></section>`;
  }
  if (laps.length === 0) return "";
  const rows = laps.map((lap) => `<div class="lap-row" role="row"><span>#${lap.index} · ${escapeHtml(lap.type)}</span><span>${lap.distanceKm} km</span><span>${formatSeconds(lap.durationSec)}</span><span>${formatPace(lap.paceSecPerKm)}</span><span>${lap.avgHr === null ? "—" : `${lap.avgHr} bpm`}</span></div>`).join("");
  return `<section class="card laps-card"><div class="splits-head"><h2>Garmin laps / intervals</h2><p class="muted small">Garmin's own lap/interval summaries; separate from per-kilometre splits.</p></div><div class="laps-table" role="table" aria-label="Garmin laps and intervals"><div class="lap-row lap-header" role="row"><span>Lap</span><span>Dist</span><span>Time</span><span>Pace</span><span>HR</span></div>${rows}</div></section>`;
}

/**
 * The Garmin workout a run followed. A fetch failure is a muted note, never a broken detail page, and a run that followed
 * no planned workout simply has no card.
 */
function workoutSection(workout: ActivityWorkout | null, error: string | null): string {
  if (error !== null) {
    return `<section class="card workout-card"><div class="workout-head"><div><p class="eyebrow">Training program · Garmin</p><h2>Garmin workout</h2></div></div><p class="muted small">${escapeHtml(error)}</p></section>`;
  }
  if (workout === null || workout.status !== "ok") return "";
  const rows = workout.steps
    .map((step) => `<div class="workout-row" role="row"><span>${step.index}</span><span>${escapeHtml(step.intensity)}</span><span>${escapeHtml(step.duration)}</span><span>${escapeHtml(step.target ?? "—")}</span></div>`)
    .join("");
  const name = workout.name === null ? "" : `<p class="workout-name">${escapeHtml(workout.name)}</p>`;
  const summary = workout.summary.length === 0 ? "" : `<p class="workout-summary">${escapeHtml(workout.summary)}</p>`;
  const notes = workout.notes === null ? "" : `<p class="workout-notes">${escapeHtml(workout.notes)}</p>`;
  return `<section class="card workout-card"><div class="workout-head"><div><p class="eyebrow">Training program · Garmin</p><h2>Garmin workout</h2></div><span class="chip program-chip">${workout.steps.length} ${workout.steps.length === 1 ? "step" : "steps"}</span></div>${name}${summary}<div class="workout-table" role="table" aria-label="Garmin workout steps"><div class="workout-row workout-header" role="row"><span>#</span><span>Step</span><span>Duration</span><span>Target</span></div>${rows}</div>${notes}</section>`;
}

/**
 * Return the stored workout for an activity, fetching it once when the row is missing or a previous attempt failed.
 * A 404 is a confirmed "no planned workout"; another failure is stored with the attempt count raised. Callers get a
 * workout plus an optional note, never an exception: the workout overlay must not break a run page or a peek.
 */
async function ensureActivityWorkout(
  store: Store,
  userId: string,
  activity: Activity,
  garmin: GarminClient | undefined,
  at: string,
): Promise<{ workout: ActivityWorkout | null; error: string | null }> {
  const stored = store.getActivityWorkout(userId, activity.activityId) ?? null;
  if (stored !== null && stored.status !== "unavailable") return { workout: stored, error: null };
  const garminId = activity.activityId.startsWith("garmin:") ? activity.activityId.slice("garmin:".length) : "";
  if (garmin === undefined || garmin.getActivityWorkouts === undefined || activity.source !== "garmin" || garminId.length === 0) {
    return { workout: stored, error: null };
  }
  try {
    const workout = mapGarminWorkout(await garmin.getActivityWorkouts(garminId), activity, at);
    store.saveActivityWorkout(workout);
    return { workout, error: null };
  } catch (error) {
    if (error instanceof GarminError && error.status === 404) {
      const workout = mapGarminWorkout([], activity, at);
      store.saveActivityWorkout(workout);
      return { workout, error: null };
    }
    const workout = failedGarminWorkout(activity, (stored?.attempts ?? 0) + 1, at);
    store.saveActivityWorkout(workout);
    return { workout, error: "Garmin's workout for this run is not available right now." };
  }
}

function hrZonesSection(activity: Activity): string {  const zones = [
    { zone: 1, seconds: activity.hrZone1Sec ?? 0 },
    { zone: 2, seconds: activity.hrZone2Sec ?? 0 },
    { zone: 3, seconds: activity.hrZone3Sec ?? 0 },
    { zone: 4, seconds: activity.hrZone4Sec ?? 0 },
    { zone: 5, seconds: activity.hrZone5Sec ?? 0 },
  ].filter((entry) => Number.isFinite(entry.seconds) && entry.seconds > 0);
  const total = zones.reduce((sum, entry) => sum + entry.seconds, 0);
  if (total <= 0) return "";
  const segments = zones.map((entry) => `<span class="zone-seg zone-${entry.zone}" style="width:${((entry.seconds / total) * 100).toFixed(1)}%" title="Z${entry.zone}"></span>`).join("");
  const legend = zones.map((entry) => `<span class="zone-key"><i class="zone-dot zone-${entry.zone}"></i>Z${entry.zone} ${formatSeconds(entry.seconds)}</span>`).join("");
  return `<section class="card hr-zones-card"><div class="splits-head"><h2>HR zones</h2><p class="muted small">Garmin zone time; zones are defined in Garmin.</p></div><div class="zone-bar" role="img" aria-label="Time in heart-rate zones">${segments}</div><div class="zone-legend">${legend}</div></section>`;
}

function periodBestsCard(periodLabel: string, bests: readonly PersonalBest[]): string {
  const items = bests.length === 0
    ? `<p class="muted small">No best-effort data in this period.</p>`
    : `<div class="best-efforts">${bests.map((best) => `<div class="best-effort"><span>${bestEffortLabel(best.distance)}</span><strong>${formatSeconds(best.seconds)}</strong><small>${escapeHtml(formatShortDate(best.activity.day))} · ${escapeHtml(best.activity.title)}</small></div>`).join("")}</div>`;
  return `<section class="card best-efforts-card"><div class="splits-head"><h2>Best efforts</h2><p class="muted small">${escapeHtml(periodLabel)} · fastest 1 km / 1 mi / 5 km</p></div>${items}<p class="muted small best-scope">Best efforts are within your stored history (the last 90 days, up to 100 activities), not lifetime records.</p></section>`;
}

function coachPromptForWeek(
  periodLabel: string,
  load: LoadSummary,
  activities: readonly Activity[],
  sessions: readonly TrainingSession[],
): string {
  const actualKm = sumDistance(activities);
  const actualMinutes = sumDuration(activities);
  const plannedKm = Math.round(sessions.reduce((total, session) => total + (session.distanceKm ?? 0), 0) * 10) / 10;
  const keyRuns = activities
    .slice(0, 4)
    .map((activity) => `${activity.day} ${activity.title}${activity.distanceKm === null ? "" : ` ${activity.distanceKm} km`}`)
    .join("; ");
  const loadText = load.hasLoad
    ? `Garmin load ${load.weekLoad}; ACWR ${load.acwr === null ? "not available" : load.acwr}; week change ${load.weekChangePct === null ? "not available" : `${load.weekChangePct}%`}; signal ${load.label}.`
    : "No Garmin training-load values were available.";
  const intensity = load.hasIntensity
    ? `Hard ${load.hardDistanceKm} km (${load.hardMinutes} min) and easy ${load.easyDistanceKm} km (${load.easyMinutes} min).`
    : "Training-effect labels were not available.";
  return `Review my training week ${periodLabel}. Actual: ${activities.length} runs, ${actualKm} km, ${formatMinutes(actualMinutes)}. Planned: ${plannedKm} km. ${loadText} ${intensity} Key runs: ${keyRuns.length === 0 ? "none" : keyRuns}. Tell me what went well and one adjustment for next week; do not invent sessions or metrics.`;
}

function formatDelta(value: number | null, unit: string): string {
  if (value === null) return "—";
  if (value === 0) return `0 ${unit}`;
  return `${value > 0 ? "+" : ""}${value} ${unit}`;
}

/**
 * The plan-match badge in the runner's words. "ON PLAN 0 KM" read as "zero km done", so the badge now leads with the
 * outcome - completed - and states the signed distance delta it was always about.
 */
function planMatchBadge(match: ActivityPlanMatch): string {
  if (match.session === null) return "Unplanned";
  const delta = match.distanceDeltaKm;
  if (delta === null) {
    if (match.status === "short") return "Completed - shorter than plan";
    if (match.status === "long") return "Completed - longer than plan";
    return "Completed - on plan";
  }
  if (match.status === "on-plan") {
    return `Completed - on plan (${delta > 0 ? "+" : delta < 0 ? "-" : "+"}${Math.abs(delta).toFixed(1)} km)`;
  }
  return `Completed - ${Math.abs(delta).toFixed(1)} km ${match.status === "short" ? "short" : "over"}`;
}

function matchLabel(match: ActivityPlanMatch | undefined): string {
  if (match === undefined) return `<span class="chip match-unplanned">Unplanned</span>`;
  const title = match.session === null ? "" : ` title="Planned: ${escapeHtml(match.session.title)}"`;
  return `<span class="chip match-${match.status}"${title}>${escapeHtml(planMatchBadge(match))}</span>`;
}

function planDistanceBar(match: ActivityPlanMatch): string {
  if (match.session === null || match.session.distanceKm === null || match.activity.distanceKm === null) return "";
  const planned = match.session.distanceKm;
  const actual = match.activity.distanceKm;
  const max = Math.max(planned, actual, 1);
  const plannedWidth = Math.round((planned / max) * 100);
  const actualWidth = Math.round((actual / max) * 100);
  return `<div class="plan-bar" role="img" aria-label="Planned ${planned} km versus actual ${actual} km">
    <div class="plan-bar-row"><span>Plan</span><div class="plan-bar-track"><span class="plan-bar-fill plan-bar-plan" style="width:${plannedWidth}%"></span></div><strong>${planned} km</strong></div>
    <div class="plan-bar-row"><span>Actual</span><div class="plan-bar-track"><span class="plan-bar-fill plan-bar-actual" style="width:${actualWidth}%"></span></div><strong>${actual} km</strong></div>
  </div>`;
}

function planComparison(match: ActivityPlanMatch): string {
  if (match.session === null) {
    return `<section class="card plan-compare"><h2>Plan vs actual</h2><p class="muted">No planned session matched this run. It is logged as unplanned.</p></section>`;
  }
  const status = match.status === "on-plan" ? "On plan" : match.status === "short" ? "Short of plan" : "Longer than plan";
  return `<section class="card plan-compare"><h2>Plan vs actual</h2>
    <div class="plan-compare-grid">
      <div><span class="muted small">Planned</span><strong>${escapeHtml(match.session.title)}</strong><p class="muted">${escapeHtml(sessionKindLabel(match.session.kind))}${match.session.distanceKm === null ? "" : ` · ${match.session.distanceKm} km`}${match.session.durationMin === null ? "" : ` · ${formatMinutes(match.session.durationMin)}`}</p></div>
      <div><span class="muted small">Actual</span><strong>${escapeHtml(match.activity.title)}</strong><p class="muted">${escapeHtml(activityMetrics(match.activity))}</p></div>
    </div>
    <div class="plan-deltas"><span class="chip match-${match.status}">${status}</span><span>Distance ${escapeHtml(formatDelta(match.distanceDeltaKm, "km"))}</span><span>Duration ${escapeHtml(formatDelta(match.durationDeltaMin, "min"))}</span></div>
    ${planDistanceBar(match)}
  </section>`;
}

/** The six run metrics a calendar peek shows; the activity detail keeps the full list. */
const PEEK_METRIC_LIMIT = 6;

function activityPeekMetrics(activity: Activity): ActivityMetricItem[] {
  const items: ActivityMetricItem[] = [];
  pushMetricItem(items, "Training load", activity.trainingLoad, "");
  if (activity.trainingEffectLabel !== null && activity.trainingEffectLabel !== undefined && activity.trainingEffectLabel.length > 0) {
    items.push({ label: "Effect", value: humanizeEffect(activity.trainingEffectLabel) });
  }
  const felt = feltText(activity);
  if (felt !== null) items.push({ label: "Felt", value: felt });
  pushMetricItem(items, "Elevation", activity.elevationGainM, "m", "+");
  pushMetricItem(items, "Calories", activity.calories, "kcal");
  pushMetricItem(items, "Max HR", activity.maxHr, "bpm");
  pushMetricItem(items, "Cadence", activity.cadenceSpm, "spm");
  return items.slice(0, PEEK_METRIC_LIMIT);
}

interface ActivityPeekPlan {
  status: ActivityPlanMatch["status"];
  label: string;
  title: string | null;
  planned: string | null;
}

function activityPeekPlan(match: ActivityPlanMatch): ActivityPeekPlan {
  if (match.session === null) {
    return { status: "unplanned", label: "Unplanned", title: null, planned: null };
  }
  const statusLabel = match.status === "on-plan" ? "On plan" : match.status === "short" ? "Short" : "Long";
  const delta = match.distanceDeltaKm === null || match.distanceDeltaKm === 0
    ? ""
    : ` ${formatDelta(match.distanceDeltaKm, "km")}`;
  const planned = [
    sessionKindLabel(match.session.kind),
    match.session.distanceKm === null ? "" : `${match.session.distanceKm} km`,
    match.session.durationMin === null ? "" : formatMinutes(match.session.durationMin),
  ]
    .filter((part) => part.length > 0)
    .join(" · ");
  return {
    status: match.status,
    label: `${statusLabel}${delta}`,
    title: match.session.title,
    planned: planned.length === 0 ? null : planned,
  };
}

function prDistancesFor(activities: readonly Activity[], activityId: string): Set<BestEffortDistance> {
  return new Set<BestEffortDistance>(
    personalBests(activities)
      .filter((best) => best.activity.activityId === activityId)
      .map((best) => best.distance),
  );
}

interface ActivityPeekEffort {
  label: string;
  value: string;
  pr: boolean;
}

/** The Garmin workout program shown inside the run peek; the run and its program are one integrated view. */
interface ActivityPeekProgram {
  name: string | null;
  label: string;
  summary: string;
  /** The first few steps; `stepCount` says how many the full detail holds. */
  steps: ActivityWorkoutStep[];
  stepCount: number;
  notes: string | null;
}

interface ActivityPeek {
  activityId: string;
  title: string;
  day: string;
  dayLabel: string;
  source: Activity["source"];
  sourceLabel: string;
  metrics: string;
  extra: ActivityMetricItem[];
  efforts: ActivityPeekEffort[];
  plan: ActivityPeekPlan;
  /** The Garmin workout program the run followed, when one was fetched; null otherwise. */
  program: ActivityPeekProgram | null;
  /** The visible question; it reads like a normal message. */
  coachPrompt: string;
  /** The typed action the bubble sends with the visible question; the hidden directive is built server-side. */
  coachIntent: CoachIntent;
  links: { detail: string; day: string; week: string };
}

function buildActivityPeekProgram(workout: ActivityWorkout | null): ActivityPeekProgram | null {
  if (workout === null || workout.status !== "ok") return null;
  return {
    name: workout.name,
    label: workout.label,
    summary: workout.summary,
    steps: workout.steps.slice(0, 8),
    stepCount: workout.steps.length,
    notes: workout.notes,
  };
}

/** Everything the calendar's run-peek popup renders, computed once on the server so the client holds no metric logic. */
function buildActivityPeek(
  activity: Activity,
  sessions: readonly TrainingSession[],
  prDistances: ReadonlySet<BestEffortDistance>,
  workout: ActivityWorkout | null = null,
): ActivityPeek {
  return {
    activityId: activity.activityId,
    title: activity.title,
    day: activity.day,
    dayLabel: formatDayLabel(activity.day),
    source: activity.source,
    sourceLabel: activitySourceLabel(activity),
    metrics: activityMetrics(activity),
    extra: activityPeekMetrics(activity),
    efforts: fastestEffortItems(activity, prDistances).map((effort) => ({
      label: effort.label,
      value: formatSeconds(effort.seconds),
      pr: effort.pr,
    })),
    plan: activityPeekPlan(matchActivity(activity, sessions)),
    program: buildActivityPeekProgram(workout),
    coachPrompt: coachPromptForActivity(activity),
    coachIntent: { kind: "review-activity", activityId: activity.activityId, source: "run-peek" },
    links: {
      detail: `/activity/${encodeURIComponent(activity.activityId)}`,
      day: `/day/${activity.day}`,
      week: historyHref("week", weekStartOf(activity.day)),
    },
  };
}

/** Friendly names for the plan pill's kind chip; the calendar pill itself keeps the raw kind. */
const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  easy: "Easy",
  long: "Long run",
  interval: "Intervals",
  tempo: "Tempo",
  rest: "Rest",
  cross: "Cross-training",
  race: "Race",
  racewalk: "Race walk",
};

function sessionKindLabel(kind: SessionKind): string {
  return SESSION_KIND_LABELS[kind];
}

/** What the session is for and how hard it should feel, in the runner's language rather than a pace table. */
function sessionIntent(session: TrainingSession): { purpose: string; effort: string } {
  switch (session.kind) {
    case "easy":
      return { purpose: "Aerobic base. The point is time on your feet, not speed.", effort: "Conversational: full sentences, RPE 3-4/10, about 60-70% of max HR." };
    case "long":
      return { purpose: "Endurance. Practice fueling, hydration and even effort over a longer time.", effort: "Steady and relaxed, RPE 4-5/10; finish feeling like you could do another 10 minutes." };
    case "tempo":
      return { purpose: "Threshold. Teach your body to hold a comfortably hard effort.", effort: "Comfortably hard, RPE 6-7/10, roughly an hour-race effort; even splits." };
    case "interval":
      return { purpose: "Speed and VO2max. Short hard repeats with full recoveries.", effort: "Hard repeats, RPE 8/10; the recoveries are part of the session, not a failure." };
    case "race":
      return { purpose: "Race effort. Execute the plan, not a personal best in the first kilometre.", effort: "Start controlled, settle into goal effort, and finish strong; use even or negative splits." };
    case "rest":
      return { purpose: "Recovery. The adaptation happens while you rest.", effort: "No run. A walk or gentle mobility is enough." };
    case "cross":
      return { purpose: "Cross-training. Keep the aerobic engine working without running impact.", effort: "Easy to moderate, RPE 3-5/10; stop if it becomes a hard session." };
    case "racewalk":
      return { purpose: "Technique and aerobic work at race-walk effort.", effort: "Quick, relaxed steps; RPE 5-6/10, not a shuffle and not a sprint." };
    default:
      return { purpose: "Training session.", effort: "Keep it controlled and finish with something left." };
  }
}

/** Server-rendered intent lines for the day page and the session peek. */
function sessionIntentHtml(session: TrainingSession): string {
  const intent = sessionIntent(session);
  return `<p class="session-intent">${escapeHtml(intent.purpose)}</p><p class="session-intent-effort muted small">${escapeHtml(intent.effort)}</p>`;
}

/** The planned amount, using the same duration wording as the run peek. */
function sessionMetrics(session: TrainingSession): string {
  return [
    session.distanceKm === null ? "" : `${session.distanceKm} km`,
    session.durationMin === null ? "" : formatMinutes(session.durationMin),
  ]
    .filter((part) => part.length > 0)
    .join(" · ");
}

interface SessionPeekOutcome {
  status: "completed" | "unmatched" | "missed" | "upcoming" | "rest";
  label: string;
  detail: string | null;
  /** The run that matched the session, or the single run recorded on a rest day; null otherwise. */
  activityId: string | null;
}

/**
 * What happened to one planned session. A completed session shows the matched run; an unmatched, missed, upcoming or
 * rest day says so in one line. Matching uses the same day-scoped rule as the training log, never a cross-day guess.
 */
function sessionPeekOutcome(
  session: TrainingSession,
  sessions: readonly TrainingSession[],
  activities: readonly Activity[],
  today: string,
): SessionPeekOutcome {
  if (session.kind === "rest") {
    const recorded = activities[0];
    if (recorded === undefined) {
      return { status: "rest", label: "Planned rest", detail: "No run is expected on this day.", activityId: null };
    }
    const metrics = activityMetrics(recorded);
    return {
      status: "rest",
      label: "Planned rest",
      detail: `Recorded anyway: ${recorded.title}${metrics.length === 0 ? "" : ` · ${metrics}`}`,
      activityId: recorded.activityId,
    };
  }
  const match = matchActivitiesToPlan(activities, sessions)
    .find((candidate) => candidate.session?.sessionId === session.sessionId);
  if (match !== undefined) {
    const statusLabel = match.status === "on-plan" ? "On plan" : match.status === "short" ? "Short" : "Long";
    const delta = match.distanceDeltaKm === null || match.distanceDeltaKm === 0 ? "" : ` ${formatDelta(match.distanceDeltaKm, "km")}`;
    const metrics = activityMetrics(match.activity);
    return {
      status: "completed",
      label: `Completed · ${statusLabel}${delta}`,
      detail: metrics.length === 0 ? match.activity.title : `${match.activity.title} · ${metrics}`,
      activityId: match.activity.activityId,
    };
  }
  const recorded = activities[0];
  if (recorded !== undefined) {
    const metrics = activityMetrics(recorded);
    return {
      status: "unmatched",
      label: "Not matched",
      detail: activities.length === 1
        ? `Recorded: ${recorded.title}${metrics.length === 0 ? "" : ` · ${metrics}`}`
        : "Runs were recorded that day, but none match this session.",
      activityId: activities.length === 1 ? recorded.activityId : null,
    };
  }
  if (session.day < today) {
    return { status: "missed", label: "Not done", detail: "No run was logged. The plan does not change and there is nothing to make up.", activityId: null };
  }
  if (session.day === today) {
    return { status: "upcoming", label: "Today", detail: "No run recorded yet today.", activityId: null };
  }
  return { status: "upcoming", label: "Upcoming", detail: null, activityId: null };
}

/** The visible question for one planned session; the hidden review-day directive keeps the turn read-only. */
function coachPromptForSession(session: TrainingSession, outcome: SessionPeekOutcome): string {
  const day = formatDayLabel(session.day);
  if (outcome.status === "completed") return `How did my ${session.title} go? (${day})`;
  if (outcome.status === "missed") return `I planned ${session.title} on ${day} but no run was logged. What should I do?`;
  if (outcome.status === "unmatched") return `I planned ${session.title} on ${day}, but the recorded run does not match. What should I do?`;
  if (outcome.status === "rest") return `What should I do on my rest day, ${day}?`;
  return `What should I focus on in my ${session.title} on ${day}?`;
}

interface SessionPeek {
  sessionId: string;
  title: string;
  day: string;
  dayLabel: string;
  kind: SessionKind;
  kindLabel: string;
  /** Planned distance · duration; empty for a rest day with no amount. */
  metrics: string;
  note: string | null;
  /** What the session is for and how hard it should feel. */
  intent: { purpose: string; effort: string };
  outcome: SessionPeekOutcome;
  /** The visible question; it reads like a normal message. */
  coachPrompt: string;
  /** The typed action the bubble sends with the visible question; the hidden directive is built server-side. */
  coachIntent: CoachIntent;
  links: { day: string; week: string; activity: string | null };
}

/** Everything the calendar's session-peek popup renders, computed once on the server. */
function buildSessionPeek(
  session: TrainingSession,
  sessions: readonly TrainingSession[],
  activities: readonly Activity[],
  today: string,
): SessionPeek {
  const outcome = sessionPeekOutcome(session, sessions, activities, today);
  return {
    sessionId: session.sessionId,
    title: session.title,
    day: session.day,
    dayLabel: formatDayLabel(session.day),
    kind: session.kind,
    kindLabel: sessionKindLabel(session.kind),
    metrics: sessionMetrics(session),
    note: session.note,
    intent: sessionIntent(session),
    outcome,
    coachPrompt: coachPromptForSession(session, outcome),
    coachIntent: { kind: "review-day", day: session.day, source: "session-peek" },
    links: {
      day: `/day/${session.day}`,
      week: historyHref("week", weekStartOf(session.day)),
      activity: outcome.activityId === null ? null : `/activity/${encodeURIComponent(outcome.activityId)}`,
    },
  };
}

interface VolumeBucket {
  label: string;
  total: number;
}

function volumeChart(buckets: readonly VolumeBucket[], title: string, note: string, ariaLabel: string): string {
  const max = Math.max(...buckets.map((bucket) => bucket.total), 1);
  const chartWidth = 360;
  const chartHeight = 140;
  const padLeft = 26;
  const padRight = 8;
  const padTop = 10;
  const padBottom = 24;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;
  const slot = plotWidth / Math.max(buckets.length, 1);
  const barWidth = Math.max(7, Math.min(24, slot * 0.58));
  const bars = buckets.map((bucket, index) => {
    const height = Math.round((bucket.total / max) * plotHeight);
    const x = padLeft + index * slot + (slot - barWidth) / 2;
    const y = padTop + plotHeight - height;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height}" rx="4" class="trend-bar"></rect><text x="${(x + barWidth / 2).toFixed(1)}" y="${chartHeight - 6}" text-anchor="middle" class="trend-axis">${escapeHtml(bucket.label)}</text><text x="${(x + barWidth / 2).toFixed(1)}" y="${Math.max(padTop + 8, y - 4).toFixed(1)}" text-anchor="middle" class="trend-value">${bucket.total > 0 ? bucket.total : ""}</text>`;
  }).join("");
  return `<figure class="trend-card"><figcaption>${escapeHtml(title)}</figcaption><svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="trend-chart" role="img" aria-label="${escapeHtml(ariaLabel)}"><line x1="${padLeft}" y1="${padTop + plotHeight}" x2="${chartWidth - padRight}" y2="${padTop + plotHeight}" class="trend-axis-line"></line>${bars}</svg><p class="trend-note">${escapeHtml(note)}</p></figure>`;
}

type TrendMetricKey = "pace" | "hr" | "cadence" | "load" | "distance" | "duration" | "elevation";

/** One selectable line metric. The chart plots the runs that carry it; a missing value is simply not a point. */
interface TrendMetric {
  key: TrendMetricKey;
  /** Chip text. */
  label: string;
  /** Panel caption and accessible chart name. */
  title: string;
  value(activity: Activity): number | null;
  format(value: number): string;
  /** The minimum visual spread, so a flat series does not look dramatic. */
  minSpread: number;
  /** True when a smaller value belongs at the top of the chart (a faster pace). */
  lowAtTop: boolean;
}

function metricNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function oneDecimal(value: number): string {
  return String(Math.round(value * 10) / 10);
}

const TREND_METRICS: readonly TrendMetric[] = [
  {
    key: "pace",
    label: "Pace",
    title: "Pace trend",
    value: (activity) => metricNumberOrNull(activity.paceSecPerKm),
    format: (value) => formatPace(Math.round(value)),
    minSpread: 30,
    lowAtTop: true,
  },
  {
    key: "hr",
    label: "Heart rate",
    title: "Heart-rate trend",
    value: (activity) => metricNumberOrNull(activity.avgHr),
    format: (value) => `${Math.round(value)} bpm`,
    minSpread: 10,
    lowAtTop: false,
  },
  {
    key: "cadence",
    label: "Cadence",
    title: "Cadence trend",
    value: (activity) => metricNumberOrNull(activity.cadenceSpm),
    format: (value) => `${Math.round(value)} spm`,
    minSpread: 4,
    lowAtTop: false,
  },
  {
    key: "load",
    label: "Load",
    title: "Training-load trend",
    value: (activity) => metricNumberOrNull(activity.trainingLoad),
    format: (value) => oneDecimal(value),
    minSpread: 10,
    lowAtTop: false,
  },
  {
    key: "distance",
    label: "Distance",
    title: "Distance trend",
    value: (activity) => metricNumberOrNull(activity.distanceKm),
    format: (value) => `${oneDecimal(value)} km`,
    minSpread: 1,
    lowAtTop: false,
  },
  {
    key: "duration",
    label: "Time",
    title: "Time trend",
    value: (activity) => metricNumberOrNull(activity.durationMin),
    format: (value) => formatMinutes(Math.round(value)),
    minSpread: 5,
    lowAtTop: false,
  },
  {
    key: "elevation",
    label: "Elevation",
    title: "Elevation trend",
    value: (activity) => metricNumberOrNull(activity.elevationGainM),
    format: (value) => `+${Math.round(value)} m`,
    minSpread: 10,
    lowAtTop: false,
  },
];

interface TrendPoint {
  day: string;
  value: number;
}

/** The last twelve runs that carry the metric, oldest first, matching the volume chart's period. */
function trendPoints(activities: readonly Activity[], metric: TrendMetric): TrendPoint[] {
  return activities
    .filter((activity) => metric.value(activity) !== null)
    .slice(0, 12)
    .reverse()
    .map((activity) => ({ day: activity.day, value: metric.value(activity) ?? 0 }));
}

/**
 * One metric panel. Every metric gets a panel and the picker shows exactly one, so switching is instant and needs no
 * client script; a metric without two points keeps its honest empty note instead of an empty chart.
 */
function trendChart(activities: readonly Activity[], metric: TrendMetric, periodLabel: string): string {
  const points = trendPoints(activities, metric);
  const caption = `<figcaption>${escapeHtml(metric.title)} <span class="muted small">${points.length} ${points.length === 1 ? "run" : "runs"}</span></figcaption>`;
  if (points.length < 2) {
    return `<figure class="trend-panel" data-metric="${metric.key}">${caption}<p class="muted small">Need at least two runs with ${escapeHtml(metric.label.toLowerCase())} data in ${escapeHtml(periodLabel)}.</p></figure>`;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, metric.minSpread);
  const low = min - spread * 0.1;
  const high = max + spread * 0.1;
  const chartWidth = 360;
  const chartHeight = 160;
  const padLeft = 42;
  const padRight = 10;
  const padTop = 14;
  const padBottom = 24;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;
  const coordinates = values.map((value, index) => {
    const x = padLeft + (index / (values.length - 1)) * plotWidth;
    const ratio = (value - low) / (high - low);
    const y = metric.lowAtTop ? padTop + ratio * plotHeight : padTop + (1 - ratio) * plotHeight;
    return { x, y };
  });
  const line = coordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const dots = coordinates
    .map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3" class="trend-dot"></circle>`)
    .join("");
  const first = points[0];
  const last = points[points.length - 1];
  const middleIndex = Math.floor((points.length - 1) / 2);
  const middle = points[middleIndex];
  const firstLabel = first === undefined ? "" : formatShortDate(first.day);
  const lastLabel = last === undefined ? "" : formatShortDate(last.day);
  const middleLabel = points.length >= 4 && middle !== undefined ? formatShortDate(middle.day) : "";
  const firstValue = metric.format(values[0] ?? 0);
  const lastValue = metric.format(values[values.length - 1] ?? 0);
  const topLabel = metric.lowAtTop ? metric.format(low) : metric.format(high);
  const bottomLabel = metric.lowAtTop ? metric.format(high) : metric.format(low);
  const middleX = coordinates[middleIndex]?.x ?? padLeft;
  const middleText =
    middleLabel.length === 0
      ? ""
      : `<text x="${middleX.toFixed(1)}" y="${chartHeight - 6}" text-anchor="middle" class="trend-axis">${escapeHtml(middleLabel)}</text>`;
  return `<figure class="trend-panel" data-metric="${metric.key}">${caption}<svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="trend-chart" role="img" aria-label="${escapeHtml(`${metric.title} for ${periodLabel}`)}"><text x="2" y="${(padTop + 4).toFixed(1)}" class="trend-axis">${escapeHtml(topLabel)}</text><text x="2" y="${(padTop + plotHeight).toFixed(1)}" class="trend-axis">${escapeHtml(bottomLabel)}</text><polyline points="${line}" class="trend-line"></polyline>${dots}<text x="${padLeft}" y="${chartHeight - 6}" class="trend-axis">${escapeHtml(firstLabel)}</text>${middleText}<text x="${chartWidth - padRight}" y="${chartHeight - 6}" text-anchor="end" class="trend-axis">${escapeHtml(lastLabel)}</text></svg><p class="trend-note">${escapeHtml(periodLabel)} · ${escapeHtml(firstValue)} → ${escapeHtml(lastValue)}</p></figure>`;
}

/**
 * The single trend graph: one radio chip per metric and one pre-rendered panel each. The CSS shows the checked panel,
 * so the switch is instant, keyboard accessible and works without a script; a browser without `:has()` keeps the
 * default panel visible instead of hiding every panel.
 */
function trendPicker(activities: readonly Activity[], periodLabel: string): string {
  const withData = TREND_METRICS.filter((metric) => trendPoints(activities, metric).length >= 2);
  const defaultMetric = withData[0] ?? TREND_METRICS[0];
  const chips = TREND_METRICS.map((metric) => {
    const checked = metric.key === defaultMetric?.key ? " checked" : "";
    return `<input class="trend-radio" type="radio" name="trend-metric" id="trend-metric-${metric.key}" value="${metric.key}"${checked}><label class="trend-chip" for="trend-metric-${metric.key}">${escapeHtml(metric.label)}</label>`;
  }).join("");
  const panels = TREND_METRICS.map((metric) => trendChart(activities, metric, periodLabel)).join("");
  return `<section class="trend-card trend-picker" data-default="${defaultMetric?.key ?? "pace"}" aria-labelledby="trend-picker-title"><div class="trend-picker-head"><h3 id="trend-picker-title">Metric trend</h3><p class="muted small">Pick the metric to plot</p></div><div class="trend-chips" role="radiogroup" aria-label="Trend metric">${chips}</div><div class="trend-panels">${panels}</div></section>`;
}

function trendSection(
  activities: readonly Activity[],
  buckets: readonly VolumeBucket[],
  consistency: number,
  periodLabel: string,
  volumeTitle: string,
  volumeAria: string,
): string {
  const paceActivities = activities.filter(
    (activity) => activity.paceSecPerKm !== null && activity.distanceKm !== null && activity.durationMin !== null && activity.distanceKm > 0,
  );
  const distance = paceActivities.reduce((sum, activity) => sum + (activity.distanceKm ?? 0), 0);
  const seconds = paceActivities.reduce((sum, activity) => sum + (activity.durationMin ?? 0) * 60, 0);
  const averagePace = distance > 0 ? Math.round(seconds / distance) : null;
  const hrActivities = activities.filter((activity) => activity.avgHr !== null);
  const averageHr = hrActivities.length === 0 ? null : Math.round(hrActivities.reduce((sum, activity) => sum + (activity.avgHr ?? 0), 0) / hrActivities.length);
  const cadenceActivities = activities.filter((activity) => activity.cadenceSpm !== null && activity.cadenceSpm !== undefined);
  const averageCadence = cadenceActivities.length === 0
    ? null
    : Math.round(cadenceActivities.reduce((sum, activity) => sum + (activity.cadenceSpm ?? 0), 0) / cadenceActivities.length);
  const summaryRow = (label: string, value: string): string => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return `<section class="trends"><div class="trend-head"><h2>Trends</h2><p class="muted small">${escapeHtml(periodLabel)} · ${activities.length} runs</p>${activities.length > 12 ? `<p class="muted small trend-window">The trend plots the last 12 runs with the selected metric; the volume chart covers the whole period.</p>` : ""}</div><div class="trend-grid">${volumeChart(buckets, volumeTitle, `${sumDistance(activities)} km · ${periodLabel}`, volumeAria)}<figure class="trend-card trend-stats"><figcaption>Summary</figcaption><dl>${summaryRow("Average pace", averagePace === null ? "—" : escapeHtml(formatPace(averagePace)))}${summaryRow("Average HR", averageHr === null ? "—" : `${averageHr} bpm`)}${summaryRow("Average cadence", averageCadence === null ? "—" : `${averageCadence} spm`)}${summaryRow("Consistency", `${consistency}%`)}</dl></figure></div>${trendPicker(activities, periodLabel)}</section>`;
}

/** SameSite=Lax covers most CSRF; this also rejects a browser POST whose Origin is another host. */
function isSameOriginPost(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || origin.length === 0) return true;
  const host = request.headers.host;
  if (typeof host !== "string" || host.length === 0) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Manual Garmin pull as an account-menu row; the notification script rewrites `next` to the current page. */
function renderSyncItem(): string {
  return `<form method="post" action="/sync" class="sync-menu-form" data-sync-form>
    <input type="hidden" name="next" value="/calendar">
    <button class="account-item sync-btn" type="submit" aria-label="Sync Garmin" title="Pull new activities now"><span aria-hidden="true">⟳</span>Sync Garmin now</button>
  </form>`;
}

/** Everything about the signed-in runner, collapsed behind their name so the top bar stays short. */
function renderAccountMenu(user: AuthUser): string {
  return `<div class="account-wrap">
    <button class="account-btn" id="account-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="account-menu"><span class="account-name">${escapeHtml(user.displayName)}</span><span class="account-caret" aria-hidden="true">▾</span></button>
    <nav class="account-menu" id="account-menu" aria-label="Account" hidden>
      <p class="account-id"><strong>${escapeHtml(user.displayName)}</strong><span>@${escapeHtml(user.username)}</span></p>
      <a class="account-item" href="/profile">Profile</a>
      <a class="account-item" href="/coach-states">Coaching states</a>
      ${renderSyncItem()}
      <a class="account-item" href="/calendar?garmin=setup">Garmin key</a>
      <a class="account-item" href="/export.json">Export my data</a>
      <hr class="account-sep">
      <a class="account-item account-signout" href="/logout">Sign out</a>
    </nav>
  </div>`;
}

/** Account-menu open/close behaviour, mirroring the notification panel: outside click and Escape close it. */
function renderAccountMenuScript(): string {
  return `<script>
  (() => {
    const button = document.getElementById('account-btn');
    const menu = document.getElementById('account-menu');
    if (!button || !menu) return;

    const hide = (returnFocus) => {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (returnFocus) button.focus();
    };

    button.addEventListener('click', () => {
      if (!menu.hidden) {
        hide(false);
        return;
      }
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      const first = menu.querySelector('a, button');
      if (first) first.focus();
    });
    document.addEventListener('click', (event) => {
      if (!menu.hidden && event.target instanceof Node && !menu.contains(event.target) && !button.contains(event.target)) hide(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !menu.hidden) hide(true);
    });
  })();
  </script>`;
}

function renderNotificationBell(): string {
  return `<div class="notif-wrap">
    <button class="icon-btn notif-btn" id="notif-btn" type="button" aria-label="Notifications" aria-expanded="false" aria-controls="notif-panel"><span aria-hidden="true">🔔</span><span class="notif-badge" id="notif-badge" hidden>0</span></button>
    <section class="notif-panel" id="notif-panel" hidden aria-label="Notifications">
      <header><strong>Notifications</strong><button class="icon-btn" id="notif-close" type="button" aria-label="Close notifications">×</button></header>
      <div class="notif-list" id="notif-list" role="log" aria-live="polite"></div>
      <footer class="notif-footer"><a href="/calendar?garmin=setup">Garmin key</a></footer>
    </section>
  </div>`;
}

function renderNotificationScript(): string {
  return `<script>
  (() => {
    const button = document.getElementById('notif-btn');
    const panel = document.getElementById('notif-panel');
    const close = document.getElementById('notif-close');
    const list = document.getElementById('notif-list');
    const badge = document.getElementById('notif-badge');
    if (!button || !panel || !close || !list || !badge) return;

    const siteName = document.body.dataset.siteName || 'AI Coach Calendar';
    const pageContext = document.body.dataset.pageContext || '';
    const timezone = document.body.dataset.timezone || 'UTC';
    const setUnread = (value) => {
      const count = typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      button.setAttribute('aria-label', count === 0 ? 'Notifications' : 'Notifications (' + count + ' unread)');
      const countSuffix = count === 0 ? '' : ' (' + (count > 99 ? '99+' : count) + ')';
      document.title = (pageContext.length === 0 ? '' : pageContext + ' · ') + siteName + countSuffix;
    };

    const render = (items) => {
      list.replaceChildren();
      if (!Array.isArray(items) || items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'muted small notif-empty';
        empty.textContent = 'No notifications yet.';
        list.append(empty);
        return;
      }
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const link = document.createElement('a');
        link.className = 'notif-item';
        link.href = typeof item.href === 'string' && item.href.startsWith('/') ? item.href : '/calendar';
        const title = document.createElement('strong');
        title.textContent = typeof item.title === 'string' ? item.title : 'Garmin sync';
        const body = document.createElement('span');
        body.textContent = typeof item.body === 'string' ? item.body : '';
        const time = document.createElement('time');
        if (typeof item.createdAt === 'string') {
          time.dateTime = item.createdAt;
          const parsed = new Date(item.createdAt);
          if (Number.isNaN(parsed.getTime())) time.textContent = item.createdAt;
          else {
            try {
              time.textContent = parsed.toLocaleString(undefined, { timeZone: timezone });
            } catch {
              time.textContent = parsed.toLocaleString();
            }
          }
        }
        link.append(title, body, time);
        list.append(link);
      }
    };

    const load = async () => {
      try {
        const response = await fetch('/notifications', { headers: { accept: 'application/json' } });
        if (!response.ok) return;
        const data = await response.json();
        setUnread(data.unread);
        render(data.notifications);
      } catch {
        // Keep the last good list when the network blips.
      }
    };

    const open = async () => {
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      await load();
      try {
        await fetch('/notifications/read', { method: 'POST', headers: { accept: 'application/json' } });
      } catch {
        // A failed read receipt is not worth interrupting the runner.
      }
      setUnread(0);
      close.focus();
    };

    const hide = () => {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      button.focus();
    };

    button.addEventListener('click', () => {
      if (panel.hidden) void open();
      else hide();
    });
    close.addEventListener('click', hide);
    document.addEventListener('click', (event) => {
      if (!panel.hidden && event.target instanceof Node && !panel.contains(event.target) && !button.contains(event.target)) hide();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) hide();
    });
    const syncForm = document.querySelector('[data-sync-form]');
    if (syncForm) {
      syncForm.addEventListener('submit', () => {
        const next = syncForm.querySelector('input[name="next"]');
        if (!next) return;
        const params = new URLSearchParams(location.search);
        for (const name of ['synced', 'syncError', 'newest', 'garmin', 'keyError']) params.delete(name);
        const query = params.toString();
        const path = location.pathname === '/' ? '/calendar' : location.pathname;
        next.value = path + (query.length === 0 ? '' : '?' + query);
      });
    }

    void load();
    window.setInterval(() => { void load(); }, 5000);
  })();
  </script>`;
}

function renderGarminModal(savedKey: GarminKey | undefined, next: string, keyError: string | null): string {
  const replacing = savedKey !== undefined;
  return `<div class="modal" id="garmin-modal" hidden>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="garmin-title">
      <header class="modal-head"><h2 id="garmin-title">${replacing ? "Replace your Garmin key" : "Connect Garmin"}</h2><button class="icon-btn modal-close" type="button" data-close-garmin aria-label="Close">×</button></header>
      <p class="muted">${replacing ? `Current key ${escapeHtml(maskKey(savedKey.apiKey))}. Paste a new key to replace it.` : "Sync your completed Garmin activities into this calendar. You need a Garmin Personal API key."}</p>
      <p class="muted small">Use a key created while signed in to the same Garmin account you want to sync. Keys can expire; if Garmin rejects one, create a fresh key.</p>
      ${keyError === null ? "" : `<p class="error" role="alert">${escapeHtml(keyError)}</p>`}
      <ol class="key-steps">
        <li>Sign in to <a href="https://connect.garmin.com" target="_blank" rel="noreferrer">Garmin Connect</a> in a web browser with the Garmin account you want to sync.</li>
        <li>Open <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noreferrer">Profile &amp; Account → Settings → Personal API Key</a>.</li>
        <li>Choose <strong>Create Key</strong>, accept the terms, and copy the full key.</li>
        <li>Paste it below and use <strong>Show</strong> to verify the whole key before saving.</li>
      </ol>
      <form method="post" action="/garmin/key" class="stack">
        <input type="hidden" name="next" value="${escapeHtml(next)}">
        <label for="garmin-key">Garmin Personal API key</label>
        <div class="key-input-row">
          <input id="garmin-key" name="key" type="password" autocomplete="new-password" spellcheck="false" autocapitalize="off" required placeholder="GCDC_…" aria-describedby="garmin-key-help">
          <button id="garmin-key-toggle" class="key-toggle" type="button" aria-pressed="false">Show</button>
        </div>
        <p id="garmin-key-help" class="muted small">Personal API keys are long and usually start with <code>GCDC_</code>. Use Show to check the whole key. The key stays on this server and is never shown again in full. <a href="https://support.garmin.com/en-US/?faq=HfTwLfw1Gn2A7WS1GdAMH8" target="_blank" rel="noreferrer">How to get a key</a></p>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-garmin>Cancel</button><button type="submit" class="btn">Save &amp; sync</button></div>
      </form>
      ${replacing ? `<form method="post" action="/garmin/key/delete" class="stack key-delete-form"><input type="hidden" name="next" value="${escapeHtml(next)}"><button type="submit" class="btn ghost">Remove saved key</button></form>` : ""}
    </div>
  </div>`;
}

function renderGarminScript(): string {
  return `<script>
  (() => {
    const modal = document.getElementById('garmin-modal');
    if (!modal) return;
    const keyInput = document.getElementById('garmin-key');
    const keyToggle = document.getElementById('garmin-key-toggle');
    const params = new URLSearchParams(location.search);
    let lastFocus = null;

    const setKeyVisible = (visible) => {
      if (keyInput) keyInput.type = visible ? 'text' : 'password';
      if (keyToggle) {
        keyToggle.textContent = visible ? 'Hide' : 'Show';
        keyToggle.setAttribute('aria-pressed', String(visible));
      }
    };
    const show = () => {
      lastFocus = document.activeElement;
      modal.hidden = false;
      document.body.classList.add('modal-open');
      setKeyVisible(false);
      if (keyInput) keyInput.focus();
    };
    const hide = () => {
      modal.hidden = true;
      document.body.classList.remove('modal-open');
      setKeyVisible(false);
      if (keyInput) keyInput.value = '';
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
      lastFocus = null;
    };

    for (const closer of document.querySelectorAll('[data-close-garmin]')) closer.addEventListener('click', hide);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) hide();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.hidden) hide();
    });
    if (keyToggle) {
      keyToggle.addEventListener('click', () => {
        setKeyVisible(Boolean(keyInput && keyInput.type === 'password'));
      });
    }
    // The Connect CTAs open the modal in place; the ?garmin=setup link stays as the no-JS and deep-link path.
    document.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href*="garmin=setup"]') : null;
      if (link === null) return;
      event.preventDefault();
      show();
    });
    if (params.get('garmin') === 'setup' || params.get('keyError') !== null) show();
  })();
  </script>`;
}

function renderGarminPanel(savedKey: GarminKey | undefined, next: string, keyError: string | null = null): string {
  return `${renderGarminModal(savedKey, next, keyError)}
  ${renderGarminScript()}`;
}

const SITE_NAME = "AI Coach Calendar";
const MAX_UNREAD_DISPLAY = 99;

function formatUnreadCount(unread: number): string {
  if (!Number.isFinite(unread) || unread <= 0) return "";
  const count = Math.floor(unread);
  return count > MAX_UNREAD_DISPLAY ? " (99+)" : ` (${count})`;
}

function navLabel(user: AuthUser | undefined, activeView: ViewName): string {
  if (user === undefined) return "";
  if (activeView === "calendar") return "Plan";
  if (activeView === "history") return "Training log";
  if (activeView === "muscle") return "Muscles";
  return "";
}

function pageContext(title: string, user: AuthUser | undefined, activeView: ViewName): string {
  const nav = navLabel(user, activeView);
  if (nav.length === 0) return title;
  return nav === title ? title : `${nav} · ${title}`;
}

function documentTitle(title: string, user: AuthUser | undefined, activeView: ViewName, unread: number): string {
  const context = pageContext(title, user, activeView);
  const suffix = `${SITE_NAME}${formatUnreadCount(unread)}`;
  return context.length === 0 ? suffix : `${context} · ${suffix}`;
}

/**
 * The Plan / Training log / Muscles switch: navigation between the three projections of the same runner, so it
 * lives inside the app bar. It renders only when the page names its view; profile, coaching-state, audit, sign-in
 * and error pages pass "none" and get a clean header instead of a tab strip with nothing selected.
 */
function renderViewSwitch(activeView: ViewName): string {
  if (activeView === "none") return "";
  const planActive = activeView === "calendar";
  const logActive = activeView === "history";
  const muscleActive = activeView === "muscle";
  return `<nav class="view-switch" data-active="${activeView}" aria-label="Plan, training log and muscles"><span class="view-thumb" aria-hidden="true"></span><a class="view-tab${planActive ? " active" : ""}" href="/calendar"${planActive ? ' aria-current="page"' : ""}>Plan</a><a class="view-tab${logActive ? " active" : ""}" href="/history"${logActive ? ' aria-current="page"' : ""}>Training log</a><a class="view-tab${muscleActive ? " active" : ""}" href="/muscle"${muscleActive ? ' aria-current="page"' : ""}>Muscles</a></nav>`;
}

function layout(
  title: string,
  body: string,
  user: AuthUser | undefined,
  activeView: ViewName = "none",
  unread = 0,
  flash = "",
): string {
  const topActions = user === undefined
    ? `<div class="top-actions"><a class="top-link" href="/login">Sign in</a><a class="top-link ghost" href="/signup">Sign up</a></div>`
    : `<div class="top-actions">${renderNotificationBell()}${renderAccountMenu(user)}</div>`;
  const viewSwitch = user === undefined ? "" : renderViewSwitch(activeView);
  const nav = `<nav class="top"><a class="brand" href="/calendar">⚡ AI COACH CALENDAR</a>${viewSwitch}${topActions}</nav>`;
  const bubble = user === undefined ? "" : renderChatBubble();
  const notificationScript = user === undefined ? "" : renderNotificationScript();
  const accountScript = user === undefined ? "" : renderAccountMenuScript();
  const context = pageContext(title, user, activeView);
  const timezone = escapeHtml(safeTimeZone(user?.timezone));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(documentTitle(title, user, activeView, unread))}</title><link rel="stylesheet" href="/static/app.css?v=20"></head>
  <body data-site-name="${escapeHtml(SITE_NAME)}" data-page-context="${escapeHtml(context)}" data-timezone="${timezone}">${nav}<main>${flash}${body}</main>${bubble}${notificationScript}${accountScript}</body></html>`;
}

/** The in-calendar coach bubble: suggestions are tappable; undo is requested in chat, with no history panel. */
function renderChatBubble(): string {
  return `<button id="coach-bubble" type="button" aria-label="Talk to the coach">💬 Coach</button>
  <section id="coach-panel" hidden aria-label="Coach chat">
    <header><strong>AI Coach</strong><span class="coach-horizon">Books up to ${HORIZON_DAYS} days ahead</span><div class="coach-head-actions"><button id="coach-minimize" type="button" aria-label="Minimize chat" title="Minimize">−</button></div></header>
    <div id="coach-log" role="log" aria-live="polite"></div>
    <div id="coach-suggestions" aria-label="Suggested next messages"></div>
    <form id="coach-form"><textarea id="coach-input" rows="2" maxlength="1000" required placeholder="Tell the coach about your training…"></textarea><button class="btn" type="submit">Send</button></form>
  </section>
  <script>
  (() => {
    const bubble = document.getElementById('coach-bubble');
    const panel = document.getElementById('coach-panel');
    const minimize = document.getElementById('coach-minimize');
    const form = document.getElementById('coach-form');
    const input = document.getElementById('coach-input');
    const log = document.getElementById('coach-log');
    const suggestions = document.getElementById('coach-suggestions');
    if (!bubble || !panel || !minimize || !form || !input || !log || !suggestions) return;
    const STARTERS = ${jsonForScript(STARTER_SUGGESTIONS)};
    let suggestionsSet = false;
    const sendButton = form.querySelector('button[type="submit"]');
    // One coach turn at a time: a second Enter during a pending turn would book two batches.
    let sendInFlight = false;
    const show = () => { panel.hidden = false; bubble.hidden = true; input.focus(); showStarters(); void loadConversation(); };
    const minimizePanel = () => { panel.hidden = true; bubble.hidden = false; bubble.focus(); };
    const scrollToLatest = () => {
      requestAnimationFrame(() => {
        log.scrollTop = log.scrollHeight;
      });
    };
    const add = (role, text) => {
      const line = document.createElement('div');
      line.className = 'bubble ' + role;
      line.textContent = text;
      log.appendChild(line);
      scrollToLatest();
      return line;
    };
    // A guardrail is a block, not a success: the calendar staying whole deserves warning styling, not a green tick.
    const addGuardrail = (text) => {
      const line = document.createElement('div');
      line.className = 'bubble system warn';
      line.setAttribute('role', 'status');
      line.textContent = text;
      log.appendChild(line);
      scrollToLatest();
      return line;
    };
    let historyLoaded = false;
    const loadConversation = async () => {
      if (historyLoaded) return;
      historyLoaded = true;
      try {
        const response = await fetch('/chat/history');
        if (!response.ok) return;
        const data = await response.json();
        if (log.childElementCount > 0) return;
        for (const message of data.messages || []) {
          if (message.role === 'user' || message.role === 'assistant') {
            add(message.role === 'user' ? 'user' : 'coach', String(message.text || ''));
          }
        }
        // Pending sensitive proposals are durable rows, not DOM-only cards: after a refresh the runner must still be
        // able to confirm or dismiss them here.
        if (Array.isArray(data.states)) {
          addStateCards(data.states.filter((state) => state && state.status === 'observing'));
        }
      } catch {
        // A failed history read leaves the bubble empty; the next turn still works.
      }
    };
    const monthGrid = document.querySelector('.month[data-month]');
    const refreshCalendar = async () => {
      if (!monthGrid) return;
      const month = monthGrid.getAttribute('data-month');
      if (!month) return;
      closeActivityPeek(false);
      try {
        const response = await fetch('/calendar/data?month=' + encodeURIComponent(month));
        if (!response.ok) return;
        const data = await response.json();
        // The server omits days with nothing left, so clear every cell first; otherwise a deleted row stays until reload.
        const cells = monthGrid.querySelectorAll('.cell[data-day]');
        for (const cell of cells) {
          const slot = cell.querySelector('.cal-items');
          if (slot !== null) slot.replaceChildren();
        }
        for (const [day, info] of Object.entries(data.days || {})) {
          const cell = monthGrid.querySelector('.cell[data-day="' + day + '"]');
          const slot = cell === null ? null : cell.querySelector('.cal-items');
          if (slot === null) continue;
          // The server renders the rows; swapping its HTML keeps the refresh identical to the first paint.
          slot.innerHTML = info && typeof info.html === 'string' ? info.html : '';
        }
      } catch {
        // A failed refresh leaves the page as it was; the booking itself is already stored.
      }
    };
    const rectOf = (day) => {
      const cell = document.querySelector('.cell[data-day="' + day + '"]');
      return cell ? cell.getBoundingClientRect() : null;
    };
    // The delete animation ends without pointing anywhere; this toast names what was deleted and links the runner to
    // the Recent changes card, where the Undo form for that batch lives.
    const showDeleteToast = (changes) => {
      const removed = changes.filter((change) => change && typeof change === 'object' && change.action === 'remove');
      if (removed.length === 0) return;
      const names = removed
        .map((change) => (typeof change.title === 'string' && change.title.trim().length > 0 ? change.title.trim() : 'the session'))
        .join(', ');
      const toast = document.createElement('div');
      toast.className = 'fx-toast';
      toast.setAttribute('role', 'status');
      const text = document.createElement('span');
      text.textContent = 'Deleted ' + names + ' · ';
      const link = document.createElement('a');
      link.href = '/calendar#recent-changes';
      link.textContent = 'Undo in Recent changes';
      // The Recent changes card is server-rendered, so a same-page hash jump would show a stale card; reload instead.
      link.addEventListener('click', (event) => {
        if (location.pathname === '/calendar' || location.pathname === '/') {
          event.preventDefault();
          location.hash = 'recent-changes';
          location.reload();
        }
      });
      toast.append(text, link);
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 5200);
    };
    const animateChanges = async (changes) => {
      if (!Array.isArray(changes) || changes.length === 0) return;
      const before = changes.map((change) => ({ change, from: change.fromDay ? rectOf(change.fromDay) : null }));
      await refreshCalendar();
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
        showDeleteToast(changes);
        return;
      }
      const overlay = document.createElement('div');
      overlay.id = 'calendar-fx';
      overlay.className = 'active';
      const trash = document.createElement('div');
      trash.className = 'fx-trash';
      trash.textContent = '🗑';
      document.body.appendChild(overlay);
      document.body.appendChild(trash);
      document.body.classList.add('calendar-fx-active');
      for (const [index, item] of before.entries()) {
        setTimeout(() => {
        const change = item.change;
        const to = change.toDay ? rectOf(change.toDay) : null;
        const start = item.from || to;
        if (!start) return;
        const ghost = document.createElement('span');
        ghost.className = 'fx-ghost session kind-' + change.kind;
        ghost.textContent = change.title || change.kind;
        ghost.style.left = start.left + 'px';
        ghost.style.top = start.top + 'px';
        ghost.style.width = start.width + 'px';
        document.body.appendChild(ghost);
        const end = change.action === 'remove' ? { left: innerWidth / 2, top: innerHeight - 70 } : (to || start);
        const dx = end.left - start.left;
        const dy = end.top - start.top;
        const frames = [
          { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + dx * 0.5 + 'px, ' + (dy * 0.5 - 90) + 'px) scale(1.9) rotate(-9deg)', opacity: 1, offset: 0.55 },
          { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + (change.action === 'remove' ? 0.15 : 1) + ') rotate(9deg)', opacity: change.action === 'remove' ? 0 : 1 },
        ];
        if (ghost.animate) {
          ghost.animate(frames, { duration: 950, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => ghost.remove();
        } else {
          ghost.remove();
        }
        if (change.action === 'remove') {
          trash.classList.add('pop');
          if (navigator.vibrate) navigator.vibrate(60);
        }
        const pulseDay = change.action === 'remove' ? change.fromDay : change.toDay;
        const target = pulseDay ? document.querySelector('.cell[data-day="' + pulseDay + '"]') : null;
        if (target) {
          target.classList.add(change.action === 'remove' ? 'fx-delete' : 'fx-land');
          setTimeout(() => target.classList.remove('fx-delete', 'fx-land'), 1300);
        }
        }, index * 140);
      }
      setTimeout(() => {
        overlay.remove();
        trash.remove();
        document.body.classList.remove('calendar-fx-active');
        showDeleteToast(changes);
      }, 1200 + before.length * 140);
    };
    const setSuggestions = (items) => {
      suggestions.replaceChildren();
      suggestionsSet = true;
      if (!Array.isArray(items)) return;
      for (const item of items) {
        const text = typeof item === 'string' ? item.trim() : '';
        if (text.length === 0) continue;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggestion';
        chip.textContent = text;
        chip.addEventListener('click', () => { void send(text); });
        suggestions.appendChild(chip);
      }
    };
    const setRetry = (text, intent) => {
      suggestions.replaceChildren();
      suggestionsSet = true;
      const value = typeof text === 'string' ? text.trim() : '';
      if (value.length === 0) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'suggestion';
      chip.textContent = 'Try again';
      chip.addEventListener('click', () => { void send(value, intent); });
      suggestions.appendChild(chip);
    };
    const showStarters = () => {
      if (suggestionsSet || suggestions.childElementCount > 0) return;
      setSuggestions(STARTERS);
    };
    const addStateCards = (states) => {
      if (!Array.isArray(states) || states.length === 0) return;
      for (const state of states) {
        if (!state || typeof state.stateId !== 'string') continue;
        if (state.action === 'resolve') {
          add('system', 'Coaching state resolved · 狀態已解除');
          continue;
        }
        const card = document.createElement('div');
        card.className = 'bubble state-card';
        card.setAttribute('role', 'status');
        const head = document.createElement('div');
        head.className = 'state-bubble-head';
        const title = document.createElement('strong');
        title.textContent = state.label || 'Coaching state';
        const chip = document.createElement('span');
        chip.className = 'chip state-status state-' + (state.status || 'active');
        chip.textContent = state.status === 'observing' ? 'Proposed' : 'Active';
        head.append(title, chip);
        const detail = document.createElement('p');
        detail.className = 'muted small';
        detail.textContent = state.status === 'observing'
          ? 'The coach proposed a durable state. Confirm it or dismiss it; it is not a diagnosis.'
          : 'Saved to your coaching states.';
        card.append(head, detail);
        if (Array.isArray(state.evidence) && state.evidence.length > 0) {
          const evidence = document.createElement('ul');
          evidence.className = 'state-bubble-evidence';
          for (const line of state.evidence) {
            const item = document.createElement('li');
            item.textContent = String(line);
            evidence.appendChild(item);
          }
          card.appendChild(evidence);
        }
        if (state.uiNote) {
          const note = document.createElement('p');
          note.className = 'state-note';
          note.textContent = String(state.uiNote);
          card.appendChild(note);
        }
        const actions = document.createElement('div');
        actions.className = 'state-bubble-actions';
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'btn ghost';
        dismiss.textContent = state.status === 'observing' ? 'Dismiss · 略過' : 'Resolve · 解除';
        dismiss.addEventListener('click', async () => {
          dismiss.disabled = true;
          try {
            const result = await fetch('/coach-states/' + encodeURIComponent(state.stateId) + '/resolve', { method: 'POST' });
            if (!result.ok) throw new Error('resolve failed');
            card.remove();
            add('system', 'Coaching state resolved · 狀態已解除');
          } catch {
            dismiss.disabled = false;
          }
        });
        if (state.status === 'observing') {
          const confirm = document.createElement('button');
          confirm.type = 'button';
          confirm.className = 'btn';
          confirm.textContent = 'Confirm · 確認';
          confirm.addEventListener('click', async () => {
            confirm.disabled = true;
            try {
              const result = await fetch('/coach-states/' + encodeURIComponent(state.stateId) + '/confirm', { method: 'POST' });
              if (!result.ok) throw new Error('confirm failed');
              card.remove();
              add('system', 'Coaching state confirmed · 狀態已確認');
            } catch {
              confirm.disabled = false;
            }
          });
          actions.appendChild(confirm);
        }
        actions.appendChild(dismiss);
        // Involve the coach in one tap: the same card that confirms or resolves a state can open the conversation
        // about how it should shape the coming week.
        const discuss = document.createElement('button');
        discuss.type = 'button';
        discuss.className = 'btn ghost';
        discuss.textContent = 'Discuss this state · 討論';
        discuss.addEventListener('click', () => {
          openCoach('How should the ' + (state.label || 'coaching state') + ' state shape my coming week?', true, { kind: 'discuss-state', stateId: state.stateId, source: 'state-card' });
        });
        actions.appendChild(discuss);
        card.appendChild(actions);
        log.appendChild(card);
        scrollToLatest();
      }
    };
    const send = async (raw, intent) => {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text.length === 0 || sendInFlight) return;
      sendInFlight = true;
      if (sendButton !== null) sendButton.disabled = true;
      add('user', text);
      if (input.value.trim() === text) input.value = '';
      const typing = add('coach', '…');
      typing.classList.add('typing');
      const makeRequestId = () => {
        const bytes = new Uint8Array(16);
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
        else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      };
      const requestId = makeRequestId();
      const postChat = () => fetch('/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-poc3-request-id': requestId },
        body: JSON.stringify(intent ? { message: text, intent } : { message: text }),
      });
      try {
        let response;
        try {
          response = await postChat();
        } catch {
          // One retry with the same idempotency key: if the first request committed but the response was lost,
          // the gateway replays the cached turn instead of booking it twice.
          response = await postChat();
        }
        const data = await response.json();
        typing.remove();
        if (!response.ok) {
          const reason = response.status === 404
            ? 'That run could not be found.'
            : response.status === 400
              ? 'That message could not be sent.'
              : 'The coach is unavailable right now. Try again.';
          add('error', reason);
          setRetry(text, intent);
          return;
        }
        add('coach', data.reply);
        setSuggestions(Array.isArray(data.suggestions) && data.suggestions.length > 0 ? data.suggestions : STARTERS);
        scrollToLatest();
        if (data.sessions > 0 || (Array.isArray(data.changes) && data.changes.length > 0)) {
          await animateChanges(data.changes || []);
          add('system', 'Calendar updated · 日曆已更新');
        }
        if (data.writesAllowed === false && data.blockedWrites > 0) {
          addGuardrail('Calendar unchanged · 日曆未有更改');
        }
        addStateCards(data.states);
        if (Array.isArray(data.blockedByStates) && data.blockedByStates.length > 0) {
          const labels = data.blockedByStates.map((state) => state && state.label ? String(state.label) : 'a coaching state');
          addGuardrail('Calendar unchanged — ' + labels.join(', ') + ' is protecting the plan · want to talk through what would work instead? · 日曆未有更改');
        }
        addFailureCard(data.failures, text, intent);
      } catch {
        typing.remove();
        add('error', 'Network error. Try again.');
        setRetry(text, intent);
      } finally {
        sendInFlight = false;
        if (sendButton !== null) sendButton.disabled = false;
      }
    };
    const dayMenu = document.createElement('div');
    dayMenu.id = 'day-menu';
    dayMenu.hidden = true;
    dayMenu.setAttribute('role', 'menu');
    dayMenu.setAttribute('aria-label', 'Day actions');
    document.body.appendChild(dayMenu);
    let menuDay = '';
    const closeDayMenu = () => { dayMenu.hidden = true; };
    const formatDay = (day) => new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
    const formatShortDay = (day) => new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', timeZone: 'UTC',
    });
    const failureLabel = (action) => action === 'remove' ? 'Delete' : action === 'update' ? 'Update' : 'Add';
    const failureReason = (reason) => reason === 'missing-session-id' ? 'no session was specified' : 'that session no longer exists';
    const addFailureCard = (failures, retryText, retryIntent) => {
      if (!Array.isArray(failures) || failures.length === 0) return;
      const card = document.createElement('div');
      card.className = 'bubble failure';
      card.setAttribute('role', 'status');
      const head = document.createElement('strong');
      head.textContent = 'Could not apply · 未套用';
      card.appendChild(head);
      const list = document.createElement('ul');
      const days = [];
      for (const raw of failures) {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
        const action = typeof raw.action === 'string' ? raw.action : 'update';
        const title = typeof raw.title === 'string' && raw.title.trim().length > 0 ? raw.title.trim() : 'session';
        const day = typeof raw.day === 'string' ? raw.day : '';
        const reason = typeof raw.reason === 'string' ? raw.reason : 'session-not-found';
        if (day.length > 0 && !days.includes(day)) days.push(day);
        const item = document.createElement('li');
        item.textContent = failureLabel(action) + ' “' + title + '”' + (day.length > 0 ? ' · ' + formatDay(day) : '') + ' — ' + failureReason(reason);
        list.appendChild(item);
      }
      if (list.childElementCount === 0) return;
      card.appendChild(list);
      const actions = document.createElement('div');
      actions.className = 'failure-actions';
      for (const day of days) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Show ' + formatShortDay(day);
        button.addEventListener('click', () => { void send('What is planned on ' + day + '?', { kind: 'review-day', day, source: 'day-menu' }); });
        actions.appendChild(button);
      }
      const retry = typeof retryText === 'string' ? retryText.trim() : '';
      if (retry.length > 0) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Try again';
        button.addEventListener('click', () => { void send(retry, retryIntent); });
        actions.appendChild(button);
      }
      if (actions.childElementCount > 0) card.appendChild(actions);
      log.appendChild(card);
      scrollToLatest();
    };
    let pendingIntent;
    let pendingPrefix = '';
    const parseIntent = (value) => {
      if (typeof value !== 'string' || value.length === 0) return undefined;
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    };
    const openCoach = (text, sendNow, intent) => {
      show();
      if (sendNow) {
        pendingIntent = undefined;
        pendingPrefix = '';
        void send(text, intent);
      } else {
        pendingIntent = intent;
        pendingPrefix = text;
        input.value = text;
        input.focus();
      }
    };
    const openDayMenu = (cell, day) => {
      menuDay = day;
      dayMenu.replaceChildren();
      const header = document.createElement('div');
      header.className = 'day-menu-head';
      const title = document.createElement('strong');
      title.textContent = formatDay(day);
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', 'Close day actions');
      closeButton.addEventListener('click', closeDayMenu);
      header.append(title, closeButton);
      dayMenu.appendChild(header);
      const hasSessions = cell.querySelectorAll('.cal-pill.plan').length > 0;
      const choices = [
        ['add', 'Add a session here', false],
        ['move', 'Move a session here', false],
        ['delete', 'Delete a session here', true, !hasSessions],
        ['ask', 'Ask coach about this day', true],
        ['view', 'View day details', true],
      ];
      for (const [action, label, sendNow, disabled] of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.dataset.action = action;
        button.textContent = label;
        button.disabled = disabled === true;
        if (disabled === true) button.title = 'No session on this day';
        dayMenu.appendChild(button);
      }
      dayMenu.hidden = false;
      const rect = cell.getBoundingClientRect();
      const width = Math.min(280, innerWidth - 16);
      dayMenu.style.width = width + 'px';
      dayMenu.style.left = Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px';
      const menuHeight = dayMenu.offsetHeight || 260;
      dayMenu.style.top = (rect.bottom + 6 + menuHeight > innerHeight ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6) + 'px';
      dayMenu.querySelector('button[data-action="add"]')?.focus();
    };
    dayMenu.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
      if (button === null) return;
      const action = button.dataset.action;
      closeDayMenu();
      if (action === 'add') openCoach('Add a session on ' + menuDay + ': ', false, { kind: 'plan', day: menuDay, source: 'day-menu' });
      if (action === 'move') openCoach('Move a session to ' + menuDay + ': ', false, { kind: 'plan', day: menuDay, source: 'day-menu' });
      if (action === 'delete') openCoach('Delete the session on ' + menuDay + '.', true, { kind: 'plan', day: menuDay, source: 'day-menu' });
      if (action === 'ask') openCoach('What is planned on ' + menuDay + '?', true, { kind: 'review-day', day: menuDay, source: 'day-menu' });
      if (action === 'view') location.href = '/day/' + menuDay;
    });
    document.addEventListener('click', (event) => {
      if (dayMenu.hidden) return;
      if (event.target instanceof Node && (dayMenu.contains(event.target) || (event.target instanceof Element && event.target.closest('.cell[data-day]') !== null))) return;
      closeDayMenu();
    });
    // Escape closes one layer at a time; the shared handler lives with the peek (the topmost layer).
    for (const cell of document.querySelectorAll('.cell[data-day]')) {
      cell.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = event.target instanceof Element ? event.target : null;
        const record = target === null ? null : target.closest('[data-activity-id]');
        const session = target === null ? null : target.closest('[data-session-id]');
        event.preventDefault();
        if (record !== null) {
          void openActivityPeek(record, cell);
          return;
        }
        if (session !== null) {
          void openSessionPeek(session, cell);
          return;
        }
        closeActivityPeek(false);
        openDayMenu(cell, cell.dataset.day || '');
      });
      cell.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target instanceof Element ? event.target : null;
        const record = target === null ? null : target.closest('[data-activity-id]');
        const session = target === null ? null : target.closest('[data-session-id]');
        event.preventDefault();
        if (record !== null) {
          void openActivityPeek(record, cell);
          return;
        }
        if (session !== null) {
          void openSessionPeek(session, cell);
          return;
        }
        closeActivityPeek(false);
        openDayMenu(cell, cell.dataset.day || '');
      });
    }
    const monthCurrent = document.getElementById('month-current');
    const monthPicker = document.createElement('div');
    monthPicker.id = 'month-picker';
    monthPicker.hidden = true;
    monthPicker.setAttribute('role', 'dialog');
    monthPicker.setAttribute('aria-label', 'Choose month and year');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const closeMonthPicker = () => { monthPicker.hidden = true; };
    const openMonthPicker = (anchor) => {
      if (anchor === null || anchor === undefined) return;
      // The picker is its own layer: an open peek or day menu never stacks underneath it.
      closeActivityPeek(false);
      closeDayMenu();
      monthPicker.replaceChildren();
      const head = document.createElement('div');
      head.className = 'month-picker-head';
      const title = document.createElement('strong');
      title.textContent = 'Choose month';
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', 'Close month picker');
      closeButton.addEventListener('click', closeMonthPicker);
      head.append(title, closeButton);
      monthPicker.appendChild(head);
      const yearRow = document.createElement('label');
      yearRow.className = 'month-picker-year';
      const yearLabel = document.createElement('span');
      yearLabel.textContent = 'Year';
      const yearSelect = document.createElement('select');
      yearSelect.id = 'month-year-select';
      for (let year = 2000; year <= 2100; year += 1) {
        const option = document.createElement('option');
        option.value = String(year);
        option.textContent = String(year);
        yearSelect.appendChild(option);
      }
      yearSelect.value = (anchor.dataset.month || '').slice(0, 4) || String(new Date().getUTCFullYear());
      yearRow.append(yearLabel, yearSelect);
      monthPicker.appendChild(yearRow);
      const grid = document.createElement('div');
      grid.className = 'month-picker-grid';
      for (let index = 0; index < monthNames.length; index += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.month = String(index + 1).padStart(2, '0');
        button.textContent = monthNames[index].slice(0, 3);
        button.setAttribute('aria-label', monthNames[index]);
        button.addEventListener('click', () => {
          const year = yearSelect.value || String(new Date().getUTCFullYear());
          location.href = '/calendar?month=' + year + '-' + button.dataset.month;
        });
        grid.appendChild(button);
      }
      monthPicker.appendChild(grid);
      const footer = document.createElement('div');
      footer.className = 'month-picker-foot';
      const thisButton = document.createElement('button');
      thisButton.type = 'button';
      thisButton.textContent = 'This month';
      thisButton.addEventListener('click', () => {
        location.href = '/calendar?month=' + (anchor.dataset.currentMonth || '');
      });
      footer.appendChild(thisButton);
      monthPicker.appendChild(footer);
      monthPicker.hidden = false;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(300, innerWidth - 16);
      monthPicker.style.width = width + 'px';
      monthPicker.style.left = Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px';
      monthPicker.style.top = (rect.bottom + 8 + monthPicker.offsetHeight > innerHeight ? Math.max(8, rect.top - monthPicker.offsetHeight - 8) : rect.bottom + 8) + 'px';
      yearSelect.focus();
    };
    monthCurrent?.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (monthPicker.hidden) openMonthPicker(monthCurrent); else closeMonthPicker();
    });
    document.addEventListener('click', (event) => {
      if (monthPicker.hidden) return;
      if (event.target instanceof Node && (monthPicker.contains(event.target) || event.target === monthCurrent)) return;
      closeMonthPicker();
    });
    // The month picker shares the single Escape handler that closes the topmost popup layer.
    document.body.appendChild(monthPicker);

    // One anchored dialog serves both pill kinds: a run peek and a session peek never stack.
    const peek = document.createElement('div');
    peek.id = 'activity-peek';
    peek.hidden = true;
    peek.tabIndex = -1;
    peek.setAttribute('role', 'dialog');
    peek.setAttribute('aria-labelledby', 'activity-peek-title');
    const peekHead = document.createElement('header');
    peekHead.className = 'peek-head';
    const peekHeadText = document.createElement('div');
    peekHeadText.className = 'peek-head-text';
    const peekDay = document.createElement('p');
    peekDay.className = 'peek-eyebrow';
    peekDay.id = 'activity-peek-day';
    const peekTitle = document.createElement('h2');
    peekTitle.id = 'activity-peek-title';
    peekHeadText.append(peekDay, peekTitle);
    const peekClose = document.createElement('button');
    peekClose.type = 'button';
    peekClose.className = 'peek-close';
    peekClose.setAttribute('aria-label', 'Close details');
    peekClose.textContent = '×';
    peekHead.append(peekHeadText, peekClose);
    const peekBody = document.createElement('div');
    peekBody.className = 'peek-body';
    const peekActions = document.createElement('footer');
    peekActions.className = 'peek-actions';
    peek.append(peekHead, peekBody, peekActions);
    document.body.appendChild(peek);

    let peekTrigger = null;
    let peekRequest = 0;
    let peekFailed = false;
    const closeActivityPeek = (restoreFocus = true) => {
      if (peek.hidden) return;
      peek.hidden = true;
      peekRequest += 1;
      peekFailed = false;
      const trigger = peekTrigger;
      peekTrigger = null;
      if (restoreFocus !== false && trigger !== null && typeof trigger.focus === 'function') trigger.focus();
    };
    peekClose.addEventListener('click', () => closeActivityPeek());

    const positionPeek = (anchor) => {
      const width = Math.min(360, innerWidth - 16);
      const height = peek.offsetHeight || 320;
      if (innerWidth <= 640) {
        peek.style.left = '8px';
        peek.style.width = Math.max(0, innerWidth - 16) + 'px';
        peek.style.top = Math.max(8, innerHeight - height - 8) + 'px';
        return;
      }
      const rect = anchor.getBoundingClientRect();
      peek.style.left = Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px';
      peek.style.width = width + 'px';
      const below = rect.bottom + 8;
      const above = rect.top - height - 8;
      const fitsBelow = below + height <= innerHeight - 8;
      const fitsAbove = above >= 8;
      peek.style.top = (fitsBelow || !fitsAbove ? Math.max(8, Math.min(below, innerHeight - height - 8)) : above) + 'px';
    };

    const peekNote = (text) => {
      const note = document.createElement('p');
      note.className = 'peek-note';
      note.textContent = text;
      return note;
    };
    const peekChip = (className, text) => {
      const chip = document.createElement('span');
      chip.className = className;
      chip.textContent = text;
      return chip;
    };
    const peekLink = (className, href, text) => {
      const link = document.createElement('a');
      link.className = className;
      link.href = typeof href === 'string' && href.startsWith('/') ? href : '/calendar';
      link.textContent = text;
      return link;
    };
    const renderPeekLoading = (title, day, kind) => {
      const fallback = kind === 'session' ? 'Planned session' : 'Recorded run';
      peekTitle.textContent = title.length > 0 ? title : fallback;
      peekDay.textContent = day.length > 0 ? formatDay(day) : '';
      peekBody.replaceChildren(peekNote(kind === 'session' ? 'Loading session details…' : 'Loading run details…'));
      peekActions.replaceChildren();
    };
    const renderPeekError = (kind, id, day) => {
      if (kind === 'session') {
        peekBody.replaceChildren(peekNote('Could not load this session just now. Open the day or tap the pill again.'));
        peekActions.replaceChildren(peekLink('btn peek-primary', '/day/' + day, 'View day →'));
        return;
      }
      peekBody.replaceChildren(peekNote('Could not load this run just now. Open the full detail or tap the pill again.'));
      peekActions.replaceChildren(
        peekLink('btn peek-primary', '/activity/' + encodeURIComponent(id), 'Open full detail →'),
        peekLink('chip', '/day/' + day, 'View day'),
      );
    };
    const renderPeekSteps = (container, steps, stepCount) => {
      if (!Array.isArray(steps) || steps.length === 0) return;
      const list = document.createElement('div');
      list.className = 'peek-steps';
      const head = document.createElement('div');
      head.className = 'peek-step peek-step-head';
      for (const [className, text] of [
        ['peek-step-index', '#'],
        ['peek-step-intensity', 'Step'],
        ['peek-step-duration', 'Duration'],
        ['peek-step-target', 'Target'],
      ]) {
        const cell = document.createElement('span');
        cell.className = className;
        cell.textContent = text;
        head.append(cell);
      }
      list.append(head);
      for (const step of steps) {
        if (!step || typeof step !== 'object') continue;
        const row = document.createElement('div');
        row.className = 'peek-step';
        const index = document.createElement('span');
        index.className = 'peek-step-index';
        index.textContent = typeof step.index === 'number' ? String(step.index) : '';
        const intensity = document.createElement('span');
        intensity.className = 'peek-step-intensity';
        intensity.textContent = typeof step.intensity === 'string' ? step.intensity : '';
        const duration = document.createElement('span');
        duration.className = 'peek-step-duration';
        duration.textContent = typeof step.duration === 'string' ? step.duration : '';
        const target = document.createElement('span');
        target.className = 'peek-step-target';
        target.textContent = typeof step.target === 'string' ? step.target : '';
        row.append(index, intensity, duration, target);
        list.append(row);
      }
      container.append(list);
      const total = typeof stepCount === 'number' ? stepCount : steps.length;
      if (total > steps.length) container.append(peekNote('+' + (total - steps.length) + ' more steps in the activity detail.'));
    };
    const renderPeek = (data) => {
      peekTitle.textContent = typeof data.title === 'string' ? data.title : 'Recorded run';
      peekDay.textContent = typeof data.dayLabel === 'string' ? data.dayLabel : '';
      peekBody.replaceChildren();
      peekActions.replaceChildren();
      const meta = document.createElement('div');
      meta.className = 'peek-meta';
      const source = data.source === 'chat' ? 'chat' : 'garmin';
      meta.append(peekChip('chip source-' + source, source === 'garmin' ? 'Garmin' : 'Reported'));
      if (typeof data.metrics === 'string' && data.metrics.length > 0) {
        const metrics = document.createElement('strong');
        metrics.className = 'peek-metrics';
        metrics.textContent = data.metrics;
        meta.append(metrics);
      }
      peekBody.append(meta);
      const plan = data.plan !== null && typeof data.plan === 'object' ? data.plan : null;
      if (plan !== null) {
        const planRow = document.createElement('div');
        planRow.className = 'peek-plan';
        const status = typeof plan.status === 'string' ? plan.status : 'unplanned';
        planRow.append(peekChip('chip match-' + status, typeof plan.label === 'string' ? plan.label : 'Unplanned'));
        const planText = document.createElement('span');
        const hasPlan = typeof plan.title === 'string' && plan.title.length > 0;
        planText.className = hasPlan ? 'peek-plan-text' : 'peek-plan-text muted';
        planText.textContent = hasPlan
          ? plan.title + (typeof plan.planned === 'string' && plan.planned.length > 0 ? ' · ' + plan.planned : '')
          : 'No planned session matched this run.';
        planRow.append(planText);
        peekBody.append(planRow);
      }
      const program = data.program !== null && typeof data.program === 'object' ? data.program : null;
      if (program !== null) {
        const box = document.createElement('div');
        box.className = 'peek-program';
        const head = document.createElement('div');
        head.className = 'peek-program-head';
        head.append(peekChip('chip peek-program-chip', 'Training program · Garmin'));
        const programName = typeof program.name === 'string' ? program.name : '';
        const programLabel = typeof program.label === 'string' ? program.label : '';
        const programTitle = programName.length > 0 ? programName : programLabel;
        if (programTitle.length > 0) {
          const title = document.createElement('strong');
          title.className = 'peek-program-name';
          title.textContent = programTitle;
          head.append(title);
        }
        box.append(head);
        const programSummary = typeof program.summary === 'string' ? program.summary : '';
        const summaryText = programSummary === programTitle
          ? ''
          : programSummary.startsWith(programTitle + ' · ')
            ? programSummary.slice(programTitle.length + 3)
            : programSummary;
        if (summaryText.length > 0) {
          const summary = document.createElement('p');
          summary.className = 'peek-workout-summary';
          summary.textContent = summaryText;
          box.append(summary);
        }
        renderPeekSteps(box, program.steps, program.stepCount);
        if (typeof program.notes === 'string' && program.notes.length > 0) box.append(peekNote(program.notes));
        peekBody.append(box);
      }
      const extra = Array.isArray(data.extra) ? data.extra : [];
      if (extra.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'peek-grid';
        for (const item of extra) {
          if (!item || typeof item !== 'object') continue;
          const stat = document.createElement('div');
          stat.className = 'peek-stat';
          const label = document.createElement('span');
          label.textContent = typeof item.label === 'string' ? item.label : '';
          const value = document.createElement('strong');
          value.textContent = typeof item.value === 'string' ? item.value : '';
          stat.append(label, value);
          grid.append(stat);
        }
        if (grid.childElementCount > 0) peekBody.append(grid);
      }
      const efforts = Array.isArray(data.efforts) ? data.efforts : [];
      if (efforts.length > 0) {
        const row = document.createElement('div');
        row.className = 'peek-efforts';
        for (const effort of efforts) {
          if (!effort || typeof effort !== 'object') continue;
          const chip = document.createElement('span');
          chip.className = 'peek-effort' + (effort.pr === true ? ' pr' : '');
          const label = document.createElement('span');
          label.textContent = 'Fastest ' + (typeof effort.label === 'string' ? effort.label : '');
          const value = document.createElement('strong');
          value.textContent = typeof effort.value === 'string' ? effort.value : '';
          chip.append(label, value);
          if (effort.pr === true) chip.append(peekChip('chip pr-chip', 'PR'));
          row.append(chip);
        }
        if (row.childElementCount > 0) peekBody.append(row);
      }
      const links = data.links !== null && typeof data.links === 'object' ? data.links : {};
      const ask = document.createElement('button');
      ask.type = 'button';
      ask.className = 'coach-ask';
      ask.textContent = 'Ask coach';
      if (typeof data.coachPrompt === 'string' && data.coachPrompt.length > 0) ask.setAttribute('data-coach-message', data.coachPrompt);
      else ask.disabled = true;
      if (data.coachIntent !== null && typeof data.coachIntent === 'object' && !Array.isArray(data.coachIntent)) {
        ask.setAttribute('data-coach-intent', JSON.stringify(data.coachIntent));
      }
      peekActions.append(
        peekLink('btn peek-primary', links.detail, 'Open full detail →'),
        ask,
        peekLink('chip', links.day, 'View day'),
        peekLink('chip', links.week, 'Training log week'),
      );
    };
    const renderSessionPeek = (data) => {
      peekTitle.textContent = typeof data.title === 'string' ? data.title : 'Planned session';
      peekDay.textContent = typeof data.dayLabel === 'string' ? data.dayLabel : '';
      peekBody.replaceChildren();
      peekActions.replaceChildren();
      const meta = document.createElement('div');
      meta.className = 'peek-meta';
      const kind = typeof data.kind === 'string' && data.kind.length > 0 ? data.kind : 'easy';
      meta.append(peekChip('chip kind-' + kind, typeof data.kindLabel === 'string' ? data.kindLabel : kind));
      if (typeof data.metrics === 'string' && data.metrics.length > 0) {
        const metrics = document.createElement('strong');
        metrics.className = 'peek-metrics';
        metrics.textContent = data.metrics;
        meta.append(metrics);
      }
      peekBody.append(meta);
      if (typeof data.note === 'string' && data.note.length > 0) {
        peekBody.append(peekNote(data.note));
      }
      const intent = data.intent !== null && typeof data.intent === 'object' ? data.intent : null;
      if (intent !== null) {
        const box = document.createElement('div');
        box.className = 'peek-intent';
        if (typeof intent.purpose === 'string' && intent.purpose.length > 0) {
          const purpose = document.createElement('p');
          purpose.className = 'peek-intent-purpose';
          purpose.textContent = intent.purpose;
          box.append(purpose);
        }
        if (typeof intent.effort === 'string' && intent.effort.length > 0) {
          const effort = document.createElement('p');
          effort.className = 'peek-intent-effort muted small';
          effort.textContent = intent.effort;
          box.append(effort);
        }
        if (box.childElementCount > 0) peekBody.append(box);
      }
      const outcome = data.outcome !== null && typeof data.outcome === 'object' ? data.outcome : null;
      if (outcome !== null) {
        const row = document.createElement('div');
        row.className = 'peek-plan';
        const status = typeof outcome.status === 'string' ? outcome.status : 'upcoming';
        row.append(peekChip('chip peek-status-' + status, typeof outcome.label === 'string' ? outcome.label : 'Planned'));
        const detail = document.createElement('span');
        const detailText = typeof outcome.detail === 'string' ? outcome.detail : '';
        detail.className = detailText.length > 0 ? 'peek-plan-text' : 'peek-plan-text muted';
        detail.textContent = detailText.length > 0 ? detailText : 'No run recorded for this session yet.';
        row.append(detail);
        peekBody.append(row);
      }
      const links = data.links !== null && typeof data.links === 'object' ? data.links : {};
      const ask = document.createElement('button');
      ask.type = 'button';
      ask.className = 'coach-ask';
      ask.textContent = 'Ask coach';
      if (typeof data.coachPrompt === 'string' && data.coachPrompt.length > 0) ask.setAttribute('data-coach-message', data.coachPrompt);
      else ask.disabled = true;
      if (data.coachIntent !== null && typeof data.coachIntent === 'object' && !Array.isArray(data.coachIntent)) {
        ask.setAttribute('data-coach-intent', JSON.stringify(data.coachIntent));
      }
      const actions = [
        peekLink('btn peek-primary', links.day, 'View day →'),
        ask,
      ];
      const move = document.createElement('button');
      move.type = 'button';
      move.className = 'chip';
      move.textContent = 'Move';
      move.setAttribute('data-coach-send', 'false');
      move.setAttribute('data-coach-message', 'Move my ' + (typeof data.title === 'string' ? data.title : 'session') + ' on ' + (typeof data.dayLabel === 'string' ? data.dayLabel : '') + ' to ');
      move.setAttribute('data-coach-intent', JSON.stringify({ kind: 'plan', day: data.day, source: 'session-peek' }));
      actions.push(move);
      if (typeof links.activity === 'string' && links.activity.length > 0) actions.push(peekLink('chip', links.activity, 'Open run'));
      actions.push(peekLink('chip', links.week, 'Training log week'));
      peekActions.append(...actions);
    };
    const openPeek = async (pill, cell, kind) => {
      const id = kind === 'session'
        ? (typeof pill.dataset.sessionId === 'string' ? pill.dataset.sessionId : '')
        : (typeof pill.dataset.activityId === 'string' ? pill.dataset.activityId : '');
      if (id.length === 0) return;
      const day = cell.dataset.day || '';
      const titleNode = pill.querySelector('.cal-text');
      const title = titleNode !== null && titleNode.textContent !== null ? titleNode.textContent : '';
      if (!peek.hidden && peekTrigger === pill && !peekFailed) {
        closeActivityPeek();
        return;
      }
      closeDayMenu();
      peekTrigger = pill;
      peek.dataset.kind = kind === 'session' ? 'session-peek' : 'run-peek';
      peekClose.setAttribute('aria-label', kind === 'session' ? 'Close session details' : 'Close run details');
      peekFailed = false;
      peekRequest += 1;
      const request = peekRequest;
      renderPeekLoading(title, day, kind);
      peek.hidden = false;
      positionPeek(pill);
      peek.focus();
      try {
        const endpoint = kind === 'session'
          ? '/session/' + encodeURIComponent(id) + '/peek'
          : '/activity/' + encodeURIComponent(id) + '/peek';
        const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
        if (request !== peekRequest) return;
        if (!response.ok) throw new Error('peek failed');
        const payload = await response.json();
        if (request !== peekRequest) return;
        if (!payload || typeof payload !== 'object' || !payload.peek || typeof payload.peek !== 'object') throw new Error('peek missing');
        if (kind === 'session') renderSessionPeek(payload.peek);
        else renderPeek(payload.peek);
        positionPeek(pill);
      } catch {
        if (request !== peekRequest) return;
        peekFailed = true;
        renderPeekError(kind, id, day);
        positionPeek(pill);
      }
    };
    const openActivityPeek = (pill, cell) => openPeek(pill, cell, 'activity');
    const openSessionPeek = (pill, cell) => openPeek(pill, cell, 'session');
    document.addEventListener('click', (event) => {
      if (peek.hidden) return;
      if (event.target instanceof Node && (peek.contains(event.target) || (event.target instanceof Element && event.target.closest('[data-activity-id], [data-session-id]') !== null))) return;
      closeActivityPeek(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      // One press, one layer, topmost first: peek, then picker, then day menu, then the chat panel.
      if (!peek.hidden) { closeActivityPeek(); return; }
      if (!monthPicker.hidden) { closeMonthPicker(); return; }
      if (!dayMenu.hidden) { closeDayMenu(); return; }
      if (!panel.hidden) minimizePanel();
    });
    window.addEventListener('resize', () => {
      if (!peek.hidden && peekTrigger !== null) positionPeek(peekTrigger);
    });
    window.addEventListener('scroll', () => closeActivityPeek(false), { passive: true });

    bubble.addEventListener('click', show);
    minimize.addEventListener('click', minimizePanel);
    document.addEventListener('click', (event) => {
      const trigger = event.target instanceof Element ? event.target.closest('[data-coach-message]') : null;
      if (trigger === null) return;
      const message = trigger.getAttribute('data-coach-message') ?? '';
      if (message.length === 0) return;
      const intent = parseIntent(trigger.getAttribute('data-coach-intent') ?? '');
      event.preventDefault();
      closeActivityPeek(false);
      openCoach(message, trigger.getAttribute('data-coach-send') !== 'false', intent);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (text.length === 0) return;
      input.value = '';
      const intent = pendingIntent !== undefined && text.startsWith(pendingPrefix) ? pendingIntent : undefined;
      pendingIntent = undefined;
      pendingPrefix = '';
      void send(text, intent);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
    });
  })();
  </script>`;
}

function renderLogin(error?: string): string {
  return layout(
    "Sign in",
    `<section class="card narrow"><h1>Sign in</h1>
      <p class="muted">Your private training calendar, booked by your AI coach.</p>
      ${errorBanner(error)}
      <form method="post" action="/login" class="stack">
        <label for="username">Username</label><input id="username" name="username" required autocomplete="username" minlength="3" maxlength="24">
        <label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password" minlength="8">
        <button class="btn" type="submit">Sign in</button>
      </form>
      <p class="muted small">New here? <a href="/signup">Create an account</a></p>
    </section>`,
    undefined,
  );
}

function renderSignup(error?: string): string {
  return layout(
    "Create an account",
    `<section class="card narrow"><h1>Create an account</h1>
      <p class="muted">A private calendar for your training, kept by your AI coach.</p>
      ${errorBanner(error)}
      <form method="post" action="/signup" class="stack">
        <label for="username">Username</label><input id="username" name="username" required autocomplete="username" minlength="3" maxlength="24" pattern="[a-z0-9_]{3,24}">
        <label for="displayName">Display name</label><input id="displayName" name="displayName" required autocomplete="name" maxlength="60">
        <label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="new-password" minlength="8">
        <label for="timezone">Timezone</label><input id="timezone" name="timezone" value="Asia/Hong_Kong" required autocomplete="off">
        <label for="goal">Training goal <span class="muted small">(optional)</span></label><input id="goal" name="goal" maxlength="120" autocomplete="off">
        <button class="btn" type="submit">Create account</button>
      </form>
      <p class="muted small">Already have an account? <a href="/login">Sign in</a></p>
    </section>`,
    undefined,
  );
}

function renderProfile(user: AuthUser, saved: boolean, error?: string, unread = 0, flash = "", goalChanged = false): string {
  const goal = user.goal ?? "";
  // The goal already reaches the coach's facts; this closes the loop right away - one tap opens the chat with a
  // message the runner can edit, no hidden directive needed for a plain chat turn.
  const goalOffer = goalChanged && goal.length > 0
    ? `<div class="goal-offer"><p class="ok" role="status">New goal saved · 新目標已儲存</p><p class="muted small">Want the coach to work from the new goal? One tap opens the chat with a message you can edit.</p><button type="button" class="coach-ask" data-coach-send="false" data-coach-message="${escapeHtml(`My new goal is ${goal}. Can you help me plan toward it?`)}">Tell the coach about your new goal</button></div>`
    : "";
  return layout(
    "Profile",
    `<section class="card narrow"><h1>Your profile</h1>
      <p class="muted">Signed in as <strong>${escapeHtml(user.username)}</strong>.</p>
      ${saved ? `<p class="ok" role="status">Profile saved.</p>` : ""}
      ${goalOffer}
      ${errorBanner(error)}
      <form method="post" action="/profile" class="stack">
        <label for="username">Username</label><input id="username" value="${escapeHtml(user.username)}" readonly>
        <label for="displayName">Display name</label><input id="displayName" name="displayName" value="${escapeHtml(user.displayName)}" required maxlength="60" autocomplete="name">
        <label for="timezone">Timezone</label><input id="timezone" name="timezone" value="${escapeHtml(user.timezone)}" required autocomplete="off">
        <label for="goal">Training goal <span class="muted small">(optional)</span></label><input id="goal" name="goal" value="${escapeHtml(user.goal ?? "")}" maxlength="120" autocomplete="off">
        <label for="password">New password <span class="muted small">(leave blank to keep it)</span></label><input id="password" name="password" type="password" minlength="8" autocomplete="new-password">
        <button class="btn" type="submit">Save profile</button>
      </form>
      <p class="muted small">Member since ${escapeHtml(user.createdAt.slice(0, 10))}.</p>
      <p class="muted small"><a href="/muscle">Muscle check-ins</a> — how your muscles feel, and what the coach reads</p>
      <p class="muted small"><a href="/coach-states">Coaching states</a> — travel, heat, pain or a focus block</p>
      <p class="muted small"><a href="/calendar?garmin=setup">Garmin connection</a> · <a href="/export.json">Export my data (JSON)</a> · <a href="/export.ics">Calendar export (ICS)</a></p>
    </section>`,
    user,
    "none",
    unread,
    flash,
  );
}

export function createWeb(options: WebOptions): WebApp {
  const now = options.now ?? (() => new Date().toISOString());
  const sessionSync = options.sessionSync ?? true;
  const garminClients = new Map<string, GarminClient>();
  const makeGarminClient = options.garminFactory ?? ((apiKey: string) => createGarminClient({ apiKey }));
  const clientFor = (userId: string): GarminClient | undefined => {
    const saved = options.store.getGarminKey(userId);
    if (saved === undefined) return options.garmin;
    const cached = garminClients.get(userId);
    if (cached !== undefined) return cached;
    const client = makeGarminClient(saved.apiKey);
    garminClients.set(userId, client);
    return client;
  };
  const syncService = createGarminSync({ store: options.store, clientFor, now, limit: 100 });
  const autoSync = async (userId: string, today: string): Promise<GarminSyncOutcome> => {
    if (clientFor(userId) === undefined) return { imported: 0, created: 0, newest: null, error: null };
    const last = options.store.getLastSync(userId);
    const interval = (options.autoSyncMinutes ?? 10) * 60_000;
    if (last !== null && new Date(now()).getTime() - new Date(last).getTime() < interval) {
      return { imported: 0, created: 0, newest: null, error: null };
    }
    return syncService.sync(userId, today);
  };
  /**
   * Fill the workouts for the month the runner is looking at. The sync backfills a few rows per pull; this makes the
   * visible grid pair every run that has a Garmin workout instead of waiting several page loads. The budget, the time
   * cap and the throttle keep a calendar render from turning into a Garmin crawl, and every failure stays a cached row.
   */
  const CALENDAR_WORKOUT_BUDGET = 6;
  const CALENDAR_WORKOUT_TIME_MS = 2500;
  const CALENDAR_WORKOUT_THROTTLE_MS = 60_000;
  const calendarWorkoutAt = new Map<string, number>();
  const enrichCalendarWorkouts = async (userId: string, activities: readonly Activity[]): Promise<void> => {
    const client = clientFor(userId);
    if (client === undefined || client.getActivityWorkouts === undefined) return;
    const parsed = new Date(now()).getTime();
    const atMs = Number.isFinite(parsed) ? parsed : Date.now();
    const last = calendarWorkoutAt.get(userId);
    if (last !== undefined && atMs - last < CALENDAR_WORKOUT_THROTTLE_MS) return;
    calendarWorkoutAt.set(userId, atMs);
    const at = new Date(atMs).toISOString();
    const pending = activities
      .filter((activity) => activity.source === "garmin")
      .filter((activity) => {
        const stored = options.store.getActivityWorkout(userId, activity.activityId);
        return stored === undefined || (stored.status === "unavailable" && stored.attempts < 2);
      })
      .slice(0, CALENDAR_WORKOUT_BUDGET);
    const deadline = Date.now() + CALENDAR_WORKOUT_TIME_MS;
    for (const activity of pending) {
      if (Date.now() > deadline) break;
      const garminId = activity.activityId.startsWith("garmin:") ? activity.activityId.slice("garmin:".length) : "";
      if (garminId.length === 0) continue;
      try {
        const workout = mapGarminWorkout(await client.getActivityWorkouts(garminId), activity, at);
        options.store.saveActivityWorkout(workout);
      } catch (error) {
        if (error instanceof GarminError && error.status === 404) {
          options.store.saveActivityWorkout(mapGarminWorkout([], activity, at));
        } else {
          const stored = options.store.getActivityWorkout(userId, activity.activityId);
          options.store.saveActivityWorkout(failedGarminWorkout(activity, (stored?.attempts ?? 0) + 1, at));
        }
      }
    }
  };
  const unreadFor = (user: AuthUser | undefined): number => {
    if (user === undefined) return 0;
    try {
      return options.store.countUnreadNotifications(user.userId);
    } catch {
      return 0;
    }
  };
  const pageLayout = (
    title: string,
    body: string,
    user: AuthUser | undefined,
    activeView: ViewName = "none",
    flash = "",
  ): string => layout(title, body, user, activeView, unreadFor(user), flash);

  interface BrowserSession {
    userId: string;
    expiresAt: number;
    lastSeen: number;
  }
  const sessions = new Map<string, BrowserSession>();
  const pruneSessions = (at: number): void => {
    for (const [id, session] of sessions) {
      if (session.expiresAt <= at) sessions.delete(id);
    }
    while (sessions.size >= MAX_SESSIONS) {
      let oldestId: string | undefined;
      let oldestSeen = Number.POSITIVE_INFINITY;
      for (const [id, session] of sessions) {
        if (session.lastSeen < oldestSeen) {
          oldestSeen = session.lastSeen;
          oldestId = id;
        }
      }
      if (oldestId === undefined) break;
      sessions.delete(oldestId);
    }
  };
  const startSession = (userId: string, today: string, syncOnStart: boolean): string => {
    const at = Date.now();
    pruneSessions(at);
    const id = randomUUID();
    sessions.set(id, { userId, expiresAt: at + SESSION_TTL_MS, lastSeen: at });
    if (syncOnStart && sessionSync) syncService.syncInBackground(userId, today);
    return sessionCookie(id);
  };
  const resolveSession = (
    request: IncomingMessage,
    response: ServerResponse,
    user: AuthUser,
    today: string,
    syncOnStart: boolean,
  ): void => {
    const at = Date.now();
    const id = parseCookies(request)[SESSION_COOKIE];
    const existing = id === undefined ? undefined : sessions.get(id);
    if (id !== undefined && existing !== undefined && existing.userId === user.userId && existing.expiresAt > at) {
      existing.lastSeen = at;
      return;
    }
    response.setHeader("set-cookie", startSession(user.userId, today, syncOnStart));
  };

  const server = createServer((request, response) => {
    let requestUser: AuthUser | undefined;
    void (async (): Promise<void> => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const method = request.method ?? "GET";

      if (method === "POST" && !isSameOriginPost(request)) {
        sendHtml(response, 403, pageLayout("Forbidden", `<p>Cross-origin form submission is not allowed.</p>`, undefined, "none"));
        return;
      }

      if (url.pathname === "/static/app.css") {
        response.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" });
        response.end(CSS);
        return;
      }
      if (url.pathname === "/static/three.module.js") {
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        response.end(THREE_MODULE);
        return;
      }
      if (url.pathname === "/static/orbit-controls.js") {
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        response.end(ORBIT_CONTROLS_MODULE);
        return;
      }
      if (url.pathname === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "ok" }));
        return;
      }
      if (url.pathname === "/favicon.ico") {
        response.writeHead(204);
        response.end();
        return;
      }

      requestUser = options.auth.read(request);
      const isLoginPost = (url.pathname === "/login" || url.pathname === "/signup") && method === "POST";
      const ownsSync = (url.pathname === "/sync" || url.pathname === "/garmin/key" || url.pathname === "/garmin/key/delete") && method === "POST";
      if (requestUser !== undefined && url.pathname !== "/logout" && !isLoginPost) {
        const sessionToday = localDay(now(), safeTimeZone(requestUser.timezone));
        resolveSession(request, response, requestUser, sessionToday, !ownsSync);
      }

      if (url.pathname === "/login") {
        if (method === "GET") {
          if (requestUser !== undefined) {
            redirect(response, "/calendar");
            return;
          }
          sendHtml(response, 200, renderLogin(url.searchParams.get("error") ?? undefined));
          return;
        }
        if (method === "POST") {
          const form = await readForm(request);
          try {
            const result = options.auth.login({
              username: form.get("username") ?? "",
              password: form.get("password") ?? "",
            });
            const loginToday = localDay(now(), safeTimeZone(result.user.timezone));
            const session = startSession(result.user.userId, loginToday, true);
            redirect(response, "/calendar", { "set-cookie": [result.cookie, session] });
          } catch (error) {
            const message = error instanceof AuthError ? error.message : "Could not sign in";
            redirect(response, "/login?error=" + encodeURIComponent(message));
          }
          return;
        }
        sendHtml(response, 405, pageLayout("Method not allowed", `<p>Method not allowed</p>`, requestUser, "none"));
        return;
      }

      if (url.pathname === "/signup") {
        if (method === "GET") {
          if (requestUser !== undefined) {
            redirect(response, "/calendar");
            return;
          }
          sendHtml(response, 200, renderSignup(url.searchParams.get("error") ?? undefined));
          return;
        }
        if (method === "POST") {
          const form = await readForm(request);
          try {
            const result = options.auth.signup({
              username: form.get("username") ?? "",
              displayName: form.get("displayName") ?? "",
              password: form.get("password") ?? "",
              timezone: (form.get("timezone") ?? "").trim() || "Asia/Hong_Kong",
              goal: form.get("goal"),
            });
            const signupToday = localDay(now(), safeTimeZone(result.user.timezone));
            const session = startSession(result.user.userId, signupToday, true);
            redirect(response, "/calendar", { "set-cookie": [result.cookie, session] });
          } catch (error) {
            const message = error instanceof AuthError ? error.message : "Could not create the account";
            redirect(response, "/signup?error=" + encodeURIComponent(message));
          }
          return;
        }
        sendHtml(response, 405, pageLayout("Method not allowed", `<p>Method not allowed</p>`, requestUser, "none"));
        return;
      }

      if (url.pathname === "/logout") {
        if (method === "GET") {
          const sessionId = parseCookies(request)[SESSION_COOKIE];
          if (sessionId !== undefined) sessions.delete(sessionId);
          redirect(response, "/login", { "set-cookie": [options.auth.clearCookie(), clearSessionCookie()] });
          return;
        }
        sendHtml(response, 405, pageLayout("Method not allowed", `<p>Method not allowed</p>`, requestUser, "none"));
        return;
      }

      if (requestUser === undefined) {
        redirect(response, "/login");
        return;
      }
      const user = requestUser;
      const today = localDay(now(), safeTimeZone(user.timezone));
      const flash = syncFlash(url.searchParams);

      if (url.pathname === "/notifications" && method === "GET") {
        sendJson(response, 200, {
          unread: options.store.countUnreadNotifications(user.userId),
          notifications: options.store.listNotifications(user.userId, 20),
        });
        return;
      }
      if (url.pathname === "/notifications/read" && method === "POST") {
        options.store.markNotificationsRead(user.userId, now());
        sendJson(response, 200, { unread: 0 });
        return;
      }

      if (url.pathname === "/profile") {
        if (method === "GET") {
          sendHtml(
            response,
            200,
            renderProfile(
              user,
              url.searchParams.get("saved") === "1",
              url.searchParams.get("error") ?? undefined,
              unreadFor(user),
              flash,
              url.searchParams.get("goal") === "1",
            ),
          );
          return;
        }
        if (method === "POST") {
          const form = await readForm(request);
          const password = form.get("password") ?? "";
          const patch: ProfileUpdate = {};
          if (form.has("displayName")) patch.displayName = form.get("displayName") ?? "";
          if (form.has("timezone")) patch.timezone = form.get("timezone") ?? "";
          if (form.has("goal")) patch.goal = form.get("goal");
          if (password.length > 0) patch.password = password;
          try {
            options.auth.updateProfile(user.userId, patch);
            // The offer appears only when the goal actually changed to a new non-empty text, so it never nags.
            const goalChanged =
              form.has("goal") && (patch.goal ?? "").trim().length > 0 && (patch.goal ?? "").trim() !== (user.goal ?? "");
            redirect(response, goalChanged ? "/profile?saved=1&goal=1" : "/profile?saved=1");
          } catch (error) {
            const message = error instanceof AuthError ? error.message : "Could not save the profile";
            redirect(response, "/profile?error=" + encodeURIComponent(message));
          }
          return;
        }
        sendHtml(response, 405, pageLayout("Method not allowed", `<p>Method not allowed</p>`, user, "none"));
        return;
      }

      if (url.pathname === "/coach-audit") {
        if (method === "GET") {
          const nowIso = now();
          const directives = options.store.listCoachDirectives(user.userId, 50);
          const states = options.store.getActiveCoachStates(user.userId, nowIso);
          const legacyModes = options.store
            .listMemories(user.userId, 100)
            .filter((memory) => memory.text.trim().toLowerCase().startsWith("mode:"));
          const stateEvents = options.store.listCoachStateEvents(user.userId, 20);
          sendHtml(response, 200, renderCoachAudit(user, directives, states, legacyModes, stateEvents, { layout: pageLayout }));
          return;
        }
        sendHtml(response, 405, pageLayout("Method not allowed", `<p>Method not allowed</p>`, user, "none"));
        return;
      }

      if (url.pathname === "/coach-states/refresh") {
        if (method !== "POST") {
          sendHtml(response, 405, pageLayout("Method not allowed", `<p>Method not allowed</p>`, user, "none"));
          return;
        }
        refreshCoachStates(options.store, user.userId, now(), today, {
          detect: options.autoStates !== false,
        });
        redirect(response, "/coach-states");
        return;
      }

      if (url.pathname === "/coach-states") {
        if (method === "GET") {
          const nowIso = now();
          const states = options.store.getActiveCoachStates(user.userId, nowIso);
          const history = options.store.listCoachStates(user.userId, 100);
          sendHtml(
            response,
            200,
            renderCoachStates(user, states, history, url.searchParams.get("error") ?? undefined, { layout: pageLayout }),
          );
          return;
        }
        if (method === "POST") {
          const form = await readForm(request);
          const key = form.get("key") ?? "";
          if (!isCoachStateKey(key)) {
            redirect(response, "/coach-states?error=invalid-key");
            return;
          }
          const ttlDays = Number(form.get("ttlDays") ?? "7");
          if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 365) {
            redirect(response, "/coach-states?error=invalid-ttl");
            return;
          }
          const note = (form.get("note") ?? "").trim();
          if (note.length > 200) {
            redirect(response, "/coach-states?error=invalid-note");
            return;
          }
          options.store.transaction(() => setManualCoachState(options.store, user.userId, key, ttlDays, note, now()));
          redirect(response, "/coach-states");
          return;
        }
        sendHtml(response, 405, pageLayout("Method not allowed", `<p>Method not allowed</p>`, user, "none"));
        return;
      }

      const stateAction = /^\/coach-states\/([^/]+)\/(confirm|resolve)$/.exec(url.pathname);
      if (stateAction !== null) {
        if (method !== "POST") {
          sendHtml(response, 405, pageLayout("Method not allowed", `<p>Method not allowed</p>`, user, "none"));
          return;
        }
        let stateId = "";
        try {
          stateId = decodeURIComponent(stateAction[1] ?? "");
        } catch {
          stateId = "";
        }
        const action = stateAction[2];
        const ok =
          stateId.length > 0 &&
          (action === "confirm"
            ? options.store.transaction(() => confirmCoachState(options.store, user.userId, stateId, now()))
            : options.store.transaction(() => resolveCoachState(options.store, user.userId, stateId, now())));
        if (!ok) {
          redirect(response, "/coach-states?error=not-found");
          return;
        }
        redirect(response, "/coach-states");
        return;
      }

      if (url.pathname === "/muscle") {
        if (method === "GET") {
          const checkIns = options.store.listMuscleCheckIns(user.userId, 40);
          const latest = checkIns[0] ?? null;
          const dayParam = url.searchParams.get("day");
          const viewedDay =
            dayParam !== null && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam <= today ? dayParam : null;
          const dayCheckIn =
            viewedDay === null ? latest : (checkIns.find((checkIn) => checkIn.day === viewedDay) ?? null);
          const twoWeeksAgo = addDays(today, -14);
          const recentActivities = options.store
            .listActivities(user.userId, 40)
            .filter((activity) => activity.day >= twoWeeksAgo && activity.day <= today);
          const windowSessions = options.store.listSessions(user.userId, twoWeeksAgo, today);
          const runKind = (activity: Activity): SessionKind | undefined =>
            matchActivity(activity, windowSessions.filter((session) => session.day === activity.day)).session?.kind;
          const trainingRows: MuscleTrainingRow[] = recentActivities.slice(0, 3).map((activity) => ({
            activityId: activity.activityId,
            day: activity.day,
            title: activity.title,
            work: musclesForRun({
              title: activity.title,
              kind: runKind(activity),
              distanceKm: activity.distanceKm,
              elevationGainM: activity.elevationGainM ?? null,
            }),
          }));
          const prefillId = url.searchParams.get("activity");
          const prefillActivity =
            prefillId === null ? undefined : options.store.getActivity(user.userId, prefillId);
          const prefillRecent = prefillActivity !== undefined && prefillActivity.day >= twoWeeksAgo ? prefillActivity : undefined;
          const formDay = prefillRecent !== undefined ? prefillRecent.day : today;
          const activityOptions: MuscleActivityOption[] = options.store
            .listActivities(user.userId, 60)
            .filter((activity) => activity.day === formDay)
            .map((activity) => ({
              activityId: activity.activityId,
              day: activity.day,
              label: `${activity.title}${activity.distanceKm === null ? "" : ` · ${activity.distanceKm} km`}`,
            }));
          const prefillMuscleIds =
            prefillRecent === undefined
              ? []
              : musclesForRun({
                  title: prefillRecent.title,
                  kind: runKind(prefillRecent),
                  distanceKm: prefillRecent.distanceKm,
                  elevationGainM: prefillRecent.elevationGainM ?? null,
                }).primary;
          sendHtml(
            response,
            200,
            renderMusclePage(
              {
                user,
                today,
                earliestDay: twoWeeksAgo,
                formDay,
                saved: url.searchParams.get("saved") === "1",
                errorCode: url.searchParams.get("error"),
                dayCheckIn,
                history: checkIns,
                trainingRows,
                activityOptions,
                prefillActivityId: prefillRecent === undefined ? null : prefillRecent.activityId,
                prefillMuscleIds,
              },
              { layout: pageLayout },
            ),
          );
          return;
        }
        sendHtml(response, 405, pageLayout("Method not allowed", `<p>Method not allowed</p>`, user, "none"));
        return;
      }

      if (url.pathname === "/muscle/checkin" && method === "POST") {
        const form = await readForm(request);
        const rawDay = (form.get("day") ?? "").trim();
        const checkDay = rawDay.length === 0 ? today : rawDay;
        if (validateCheckInDay(checkDay, today) !== null) {
          redirect(response, "/muscle?error=day");
          return;
        }
        const activityId = (form.get("activityId") ?? "").trim();
        let linkedActivity: Activity | undefined;
        if (activityId.length > 0) {
          linkedActivity = options.store.getActivity(user.userId, activityId);
          if (linkedActivity === undefined || linkedActivity.day !== checkDay) {
            redirect(response, "/muscle?error=activity");
            return;
          }
        }
        const note = (form.get("note") ?? "").trim();
        if (note.length > MAX_CHECKIN_NOTE_CHARS) {
          redirect(response, "/muscle?error=note");
          return;
        }
        // The script path posts per-muscle JSON; the no-script path posts shared values over the checked list.
        const json = form.get("musclesJson");
        let tagsResult = json !== null && json.trim().length > 0 ? parseMuscleTagsJson(json) : undefined;
        if (tagsResult === undefined) {
          const muscleIds = form.getAll("muscleIds").map((value) => String(value));
          const soreness = Number(form.get("soreness") ?? "5");
          const rawConditions = form.getAll("conditions").map((value) => String(value));
          const conditions = rawConditions.filter((value): value is MuscleConditionKey => isMuscleConditionKey(value));
          if (conditions.length !== rawConditions.length) {
            redirect(response, "/muscle?error=conditions");
            return;
          }
          const rawSide = form.get("side") ?? "both";
          const side: MuscleSide = rawSide === "left" || rawSide === "right" ? rawSide : "both";
          const rawWarmUp = form.get("warmUp") ?? "";
          const warmUp: MuscleWarmUp | null =
            rawWarmUp === "eases" || rawWarmUp === "same" || rawWarmUp === "worse" ? rawWarmUp : null;
          tagsResult = buildSharedTags(muscleIds, soreness, conditions, side, warmUp);
        }
        if (!tagsResult.ok) {
          const message = tagsResult.error;
          const code = message.includes("at least one muscle")
            ? "empty"
            : message.includes("At most")
              ? "too-many"
              : message.includes("Soreness")
                ? "severity"
                : message.includes("condition") || message.includes("warm-up") || message.includes("Side")
                  ? "conditions"
                  : "muscles";
          redirect(response, `/muscle?error=${code}`);
          return;
        }
        const checkIn: MuscleCheckIn = {
          checkInId: `checkin:${randomUUID()}`,
          userId: user.userId,
          day: checkDay,
          activityId: linkedActivity === undefined ? null : linkedActivity.activityId,
          muscles: tagsResult.tags,
          note: note.length === 0 ? null : note,
          createdAt: now(),
        };
        options.store.appendMuscleCheckIn(checkIn);
        redirect(response, "/muscle?saved=1");
        return;
      }

      if (url.pathname === "/chat" && method === "POST") {
        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch {
          response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: "invalid body" } }));
          return;
        }
        const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
        const message = typeof record["message"] === "string" ? record["message"].trim() : "";
        if (message.length === 0 || message.length > 1000) {
          response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: "message must be 1..1000 characters" } }));
          return;
        }
        const intentResult = parseCoachIntent(record["intent"]);
        if (!intentResult.ok) {
          response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: intentResult.detail } }));
          return;
        }
        const intent = intentResult.intent;
        let activityDay: string | undefined;
        if (intent.kind === "review-activity") {
          const activity = options.store.getActivity(user.userId, intent.activityId);
          if (activity === undefined) {
            response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: { detail: "activity not found" } }));
            return;
          }
          activityDay = activity.day;
        }
        const weekStart = intent.kind === "review-week" ? weekStartOf(intent.weekStart) : undefined;
        const directive = buildDirectiveForIntent(intent, {
          ...(activityDay === undefined ? {} : { activityDay }),
          ...(weekStart === undefined ? {} : { weekStart }),
        });
        const gatewayUrl = (options.gatewayUrl ?? "http://127.0.0.1:8090").replace(/\/$/, "");
        const requestId = request.headers["x-poc3-request-id"];
        try {
          const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-poc3-user": user.userId,
              ...(typeof requestId === "string" ? { "x-poc3-request-id": requestId } : {}),
            },
            body: JSON.stringify({
              model: options.modelId ?? "poc3-coach",
              stream: false,
              messages: [{ role: "user", content: message }],
              ...(directive === undefined ? {} : { poc3: { directive } }),
            }),
          });
          const payload = (await upstream.json()) as {
            choices?: Array<{ message?: { content?: unknown } }>;
            poc3?: {
              sessions?: number;
              memories?: number;
              changes?: unknown[];
              changeSetId?: string | null;
              reverted?: boolean;
              suggestions?: unknown[];
              failures?: unknown[];
              attempts?: number;
              outcome?: string;
              validationCode?: string | null;
              mode?: string | null;
              writesAllowed?: boolean;
              blockedWrites?: number;
              directiveId?: string | null;
              states?: unknown[];
              blockedByStates?: unknown[];
            };
            error?: { detail?: string };
          };
          const reply = payload.choices?.[0]?.message?.content;
          if (!upstream.ok || typeof reply !== "string") {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: { detail: payload.error?.detail ?? `coach answered ${upstream.status}` } }));
            return;
          }
          const suggestions = Array.isArray(payload.poc3?.suggestions)
            ? payload.poc3.suggestions.filter((suggestion): suggestion is string => typeof suggestion === "string")
            : [];
          const rawFailures = payload.poc3?.failures;
          const failures = Array.isArray(rawFailures)
            ? rawFailures
                .filter((failure): failure is Record<string, unknown> => typeof failure === "object" && failure !== null && !Array.isArray(failure))
                .map((failure) => ({
                  action: typeof failure["action"] === "string" ? failure["action"] : "update",
                  sessionId: typeof failure["sessionId"] === "string" ? failure["sessionId"] : null,
                  title: typeof failure["title"] === "string" ? failure["title"] : "session",
                  day: typeof failure["day"] === "string" ? failure["day"] : "",
                  reason: failure["reason"] === "missing-session-id" ? "missing-session-id" : "session-not-found",
                }))
            : [];
          const rawStates = Array.isArray(payload.poc3?.states) ? payload.poc3.states : [];
          const states: Array<{
            stateId: string;
            key: CoachStateKey;
            label: string;
            status: string;
            action: string;
            source: string;
            confidence: number;
            evidence: string[];
            expiresAt: string | null;
            uiNote: string;
          }> = [];
          for (const value of rawStates) {
            if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
            const record = value as Record<string, unknown>;
            const stateId = typeof record["stateId"] === "string" ? record["stateId"] : "";
            const key = record["key"];
            if (stateId.length === 0 || !isCoachStateKey(key)) continue;
            const stored = options.store.getCoachState(user.userId, stateId);
            const definition = getCoachStateDefinition(key);
            states.push({
              stateId,
              key,
              label: definition.label,
              status: stored?.status ?? (typeof record["status"] === "string" ? record["status"] : "active"),
              action: record["action"] === "resolve" ? "resolve" : "activate",
              source: stored?.source ?? "chat",
              confidence: stored?.confidence ?? 0,
              evidence: stored?.evidence ?? [],
              expiresAt: stored?.expiresAt ?? null,
              uiNote: definition.uiNote,
            });
          }
          const rawBlocked = Array.isArray(payload.poc3?.blockedByStates) ? payload.poc3.blockedByStates : [];
          const blockedByStates: Array<{ key: CoachStateKey; label: string }> = [];
          for (const value of rawBlocked) {
            if (typeof value === "string" && isCoachStateKey(value)) {
              blockedByStates.push({ key: value, label: getCoachStateDefinition(value).label });
            }
          }
          response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          response.end(JSON.stringify({
            reply,
            sessions: payload.poc3?.sessions ?? 0,
            changes: payload.poc3?.changes ?? [],
            suggestions,
            failures,
            changeSetId: payload.poc3?.changeSetId ?? null,
            reverted: payload.poc3?.reverted === true,
            memories: payload.poc3?.memories ?? 0,
            attempts: payload.poc3?.attempts ?? 1,
            outcome: payload.poc3?.outcome ?? "committed",
            validationCode: payload.poc3?.validationCode ?? null,
            mode: payload.poc3?.mode ?? null,
            writesAllowed: payload.poc3?.writesAllowed !== false,
            blockedWrites: typeof payload.poc3?.blockedWrites === "number" ? payload.poc3.blockedWrites : 0,
            directiveId: typeof payload.poc3?.directiveId === "string" ? payload.poc3.directiveId : null,
            states,
            blockedByStates,
          }));
        } catch (error) {
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: error instanceof Error ? error.message : String(error) } }));
        }
        return;
      }

      if (url.pathname === "/chat/history" && method === "GET") {
        const messages = options.store.listMessages(user.userId, 40).map((message) => ({
          role: message.role,
          text: message.text,
          createdAt: message.createdAt,
        }));
        const states = sortCoachStates(options.store.getActiveCoachStates(user.userId, now()))
          .filter((state) => state.key !== "no_key")
          .map((state) => {
            const definition = getCoachStateDefinition(state.key);
            return {
              stateId: state.stateId,
              key: state.key,
              label: definition.label,
              status: state.status,
              source: state.source,
              confidence: state.confidence,
              evidence: state.evidence,
              expiresAt: state.expiresAt,
              uiNote: definition.uiNote,
            };
          });
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ messages, states }));
        return;
      }

      if (url.pathname === "/calendar/data" && method === "GET") {
        const dataMonthParam = url.searchParams.get("month");
        const month = dataMonthParam !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(dataMonthParam) ? dataMonthParam : today.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) {
          response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: "month must be YYYY-MM" } }));
          return;
        }
        const start = monthStart(month);
        const end = addDays(start, daysInMonth(month) - 1);
        const sessions = options.store.listSessions(user.userId, start, end);
        const activities = options.store.listActivities(user.userId, 500).filter((activity) => activity.day >= start && activity.day <= end);
        const workouts = options.store.listActivityWorkouts(user.userId, start, end);
        const programByActivity = new Map(
          workouts.filter((workout) => workout.status === "ok").map((workout) => [workout.activityId, workout]),
        );
        const itemsByDay: Record<string, CalendarItem[]> = {};
        for (const session of sessions) {
          (itemsByDay[session.day] ??= []).push(planItem(session));
        }
        for (const activity of activities) {
          const workout = programByActivity.get(activity.activityId);
          (itemsByDay[activity.day] ??= []).push(workout === undefined ? recordItem(activity) : pairItem(activity, workout));
        }
        const days: Record<string, CalendarDayPayload> = {};
        for (const [day, items] of Object.entries(itemsByDay)) {
          days[day] = { items, html: renderCalendarItems(items) };
        }
        const payload: CalendarMonthPayload = { month, days };
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify(payload));
        return;
      }

      if (url.pathname === "/history") {
        const viewParam = url.searchParams.get("view");
        const view: HistoryView = viewParam === "month" || viewParam === "year" ? viewParam : "week";
        const periodParam = url.searchParams.get("period") ?? "";
        const currentWeek = weekStartOf(today);
        const currentMonth = today.slice(0, 7);
        const currentYear = today.slice(0, 4);

        let periodStart = currentWeek;
        let periodEnd = addDays(currentWeek, 6);
        let periodLabel = formatWeekRange(currentWeek);
        let periodValue = currentWeek;
        let prevPeriod = addDays(currentWeek, -7);
        let nextPeriod = addDays(currentWeek, 7);
        let currentPeriod = currentWeek;
        let currentLabel = "This week";
        let picker = `<input type="date" name="period" value="${escapeHtml(currentWeek)}" aria-label="Pick a day in the week">`;

        if (view === "month") {
          const month = /^\d{4}-\d{2}$/.test(periodParam) && Number(periodParam.slice(5, 7)) >= 1 && Number(periodParam.slice(5, 7)) <= 12
            ? periodParam
            : currentMonth;
          periodStart = monthStart(month);
          periodEnd = addDays(periodStart, daysInMonth(month) - 1);
          periodLabel = formatMonthLabel(month);
          periodValue = month;
          prevPeriod = addMonths(month, -1);
          nextPeriod = addMonths(month, 1);
          currentPeriod = currentMonth;
          currentLabel = "This month";
          picker = `<input type="month" name="period" value="${escapeHtml(month)}" aria-label="Pick a month">`;
        } else if (view === "year") {
          const year = /^\d{4}$/.test(periodParam) && Number(periodParam) >= 2000 && Number(periodParam) <= 2100
            ? periodParam
            : currentYear;
          periodStart = `${year}-01-01`;
          periodEnd = `${year}-12-31`;
          periodLabel = year;
          periodValue = year;
          prevPeriod = String(Number(year) - 1);
          nextPeriod = String(Number(year) + 1);
          currentPeriod = currentYear;
          currentLabel = "This year";
          picker = `<select name="period" aria-label="Pick a year">${Array.from({ length: 101 }, (_, index) => 2000 + index).map((value) => `<option value="${value}"${String(value) === year ? " selected" : ""}>${value}</option>`).join("")}</select>`;
        } else {
          const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(periodParam) ? weekStartOf(periodParam) : currentWeek;
          periodStart = weekStart;
          periodEnd = addDays(weekStart, 6);
          periodLabel = formatWeekRange(weekStart);
          periodValue = weekStart;
          prevPeriod = addDays(weekStart, -7);
          nextPeriod = addDays(weekStart, 7);
          currentPeriod = currentWeek;
          currentLabel = "This week";
          picker = `<input type="date" name="period" value="${escapeHtml(weekStart)}" aria-label="Pick a day in the week">`;
        }

        const auto = await autoSync(user.userId, today);
        const allActivities = options.store.listActivities(user.userId, 1000);
        const activities = allActivities.filter((activity) => activity.day >= periodStart && activity.day <= periodEnd);
        const sessions = options.store.listSessions(user.userId, periodStart, periodEnd);
        const workouts = options.store.listActivityWorkouts(user.userId, periodStart, periodEnd);
        const lastImport = allActivities.reduce((latest, activity) => activity.createdAt > latest ? activity.createdAt : latest, "");
        const newestId = url.searchParams.get("newest");
        const newestActivity = newestId === null ? undefined : options.store.getActivity(user.userId, newestId);

        const modePeriod = (target: HistoryView): string => {
          if (target === "week") {
            if (view === "week") return periodValue;
            if (view === "month") return periodValue === currentMonth ? currentWeek : weekStartOf(periodStart);
            return periodValue === currentYear ? currentWeek : weekStartOf(`${periodValue}-01-01`);
          }
          if (target === "month") {
            if (view === "month") return periodValue;
            if (view === "week") return periodValue.slice(0, 7);
            return periodValue === currentYear ? currentMonth : `${periodValue}-01`;
          }
          if (view === "year") return periodValue;
          return periodValue.slice(0, 4);
        };
        // Week / Month / Year are links between pages, not same-page tab panels: the active mode carries aria-current.
        const modeLink = (target: HistoryView, label: string): string =>
          `<a class="period-mode${view === target ? " active" : ""}" href="${historyHref(target, modePeriod(target))}"${view === target ? ' aria-current="page"' : ""}>${label}</a>`;
        const periodBar = `<section class="period-bar" aria-label="Training log period"><div class="period-top"><div class="period-modes">${modeLink("week", "Week")}${modeLink("month", "Month")}${modeLink("year", "Year")}</div><div class="period-nav"><a href="${historyHref(view, prevPeriod)}" aria-label="Previous ${view}">←</a><span class="period-label">${escapeHtml(periodLabel)}</span><a href="${historyHref(view, nextPeriod)}" aria-label="Next ${view}">→</a><a class="chip" href="${historyHref(view, currentPeriod)}">${currentLabel}</a></div></div><form method="get" action="/history" class="period-picker"><input type="hidden" name="view" value="${view}">${picker}<button class="btn" type="submit">Go</button></form></section>`;

        const longest = activities.reduce((best, activity) => Math.max(best, activity.distanceKm ?? 0), 0);
        const savedKey = options.store.getGarminKey(user.userId);
        // A past day after the last import has not necessarily been missed; the run may simply not have arrived yet.
        const lastSync = options.store.getLastSync(user.userId);
        const lastSyncDay = lastSync === null ? null : localDay(lastSync, safeTimeZone(user.timezone));
        const awaitingGarmin = (day: string): boolean => savedKey !== undefined && lastSyncDay !== null && day > lastSyncDay;
        const garminPanel = renderGarminPanel(savedKey, cleanNext(url), url.searchParams.get("keyError"));

        const renderDay = (day: string, daySessions: TrainingSession[], dayActivities: Activity[], dayWorkouts: ActivityWorkout[]): string => {
          const dayMatches = matchActivitiesToPlan(dayActivities, daySessions);
          const matchByActivity = new Map(dayMatches.map((match) => [match.activity.activityId, match]));
          const unmatched = unmatchedSessions(dayMatches, daySessions);
          const plannedLine = daySessions.length === 0
            ? dayActivities.length === 0 ? "" : `<p class="history-plan muted">No planned session</p>`
            : `<p class="history-plan">Planned: ${daySessions.map(sessionChip).join(" ")}</p>`;
          const unmatchedLine = dayActivities.length === 0 || unmatched.length === 0
            ? ""
            : `<p class="history-plan muted small">No matching run: ${unmatched.map(sessionChip).join(" ")}</p>`;
          const programLine = dayWorkouts
            .filter((workout) => workout.status === "ok")
            .map((workout) => `<p class="history-program"><span class="chip">Garmin workout</span><span>${escapeHtml(workout.label)}${workout.summary.length === 0 ? "" : ` · ${escapeHtml(workout.summary)}`}</span></p>`)
            .join("");
          const activityHtml = dayActivities.map((activity) => {
            const message = coachPromptForActivity(activity);
            return `<article class="history-activity">
              <div class="history-activity-main">
                <div class="history-activity-head"><strong>${escapeHtml(activity.title)}</strong><span class="chip source-${escapeHtml(activity.source)}">${escapeHtml(activitySourceLabel(activity))}</span>${matchLabel(matchByActivity.get(activity.activityId))}</div>
                <p class="history-metrics">${escapeHtml(activityMetrics(activity))}</p>
              </div>
              <div class="history-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(message)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-activity", activityId: activity.activityId, source: "history" }))}">Ask coach</button><a class="chip" href="/activity/${encodeURIComponent(activity.activityId)}">Detail</a><a class="chip" href="/calendar?month=${escapeHtml(day.slice(0, 7))}">View plan</a></div>
            </article>`;
          }).join("");
          const missed = dayActivities.length > 0
            ? ""
            : dayEmptyStateHtml(day, daySessions, today, awaitingGarmin(day));
          return `<section class="history-day">
            <header class="history-day-head"><a href="/day/${escapeHtml(day)}">${escapeHtml(formatDayLabel(day))}</a></header>
            ${plannedLine}
            ${unmatchedLine}
            ${programLine}
            ${activityHtml}
            ${missed}
          </section>`;
        };

        let content = "";
        let load: LoadSummary | null = null;
        let volumeBuckets: VolumeBucket[] = [];
        let consistency = 0;
        let volumeTitle = "Daily volume";
        let volumeAria = `Daily volume for ${periodLabel}`;

        if (view === "week") {
          const weekDays = Array.from({ length: 7 }, (_, index) => addDays(periodStart, index));
          const plannedKm = Math.round(sessions.reduce((total, session) => total + (session.distanceKm ?? 0), 0) * 10) / 10;
          const dayHtml = weekDays.map((day) => renderDay(day, sessions.filter((session) => session.day === day), activities.filter((activity) => activity.day === day), workouts.filter((workout) => workout.day === day))).join("");
          content = `<section class="history-week"><header class="history-week-head"><h2>Week ${escapeHtml(periodLabel)}</h2><p class="muted small">${activities.length} run${activities.length === 1 ? "" : "s"} · ${sumDistance(activities)} km · ${formatMinutes(sumDuration(activities))}${plannedKm > 0 ? ` · planned ${plannedKm} km` : ""}</p></header>${dayHtml}</section>`;
          load = loadSummaryForWeek(allActivities, periodStart);
          volumeBuckets = weekDays.map((day, index) => ({
            label: DOW[index] ?? formatShortDate(day),
            total: sumDistance(activities.filter((activity) => activity.day === day)),
          }));
          const activeDays = weekDays.filter((day) => activities.some((activity) => activity.day === day)).length;
          consistency = Math.round((activeDays / 7) * 100);
          volumeTitle = "Daily volume";
          volumeAria = `Daily volume for ${periodLabel}`;
        } else if (view === "month") {
          const firstWeek = weekStartOf(periodStart);
          const lastWeek = weekStartOf(periodEnd);
          const weekStarts: string[] = [];
          for (let start = firstWeek; start <= lastWeek; start = addDays(start, 7)) weekStarts.push(start);
          const rows = weekStarts.map((start) => {
            const end = addDays(start, 6);
            const weekActivities = activities.filter((activity) => activity.day >= start && activity.day <= end);
            const weekSessions = sessions.filter((session) => session.day >= start && session.day <= end);
            const plannedKm = Math.round(weekSessions.reduce((total, session) => total + (session.distanceKm ?? 0), 0) * 10) / 10;
            return `<a class="period-row" href="${historyHref("week", start)}"><div><h2>Week ${escapeHtml(weekLabel(start))}</h2><p class="muted small">${weekActivities.length} run${weekActivities.length === 1 ? "" : "s"} · ${sumDistance(weekActivities)} km · ${formatMinutes(sumDuration(weekActivities))}${plannedKm > 0 ? ` · planned ${plannedKm} km` : ""}</p></div><span class="chip">View week</span></a>`;
          }).join("");
          content = `<div class="period-rows">${rows}</div>`;
          volumeBuckets = weekStarts.map((start) => ({
            label: formatShortDate(start),
            total: sumDistance(activities.filter((activity) => activity.day >= start && activity.day <= addDays(start, 6))),
          }));
          const activeWeeks = weekStarts.filter((start) => activities.some((activity) => activity.day >= start && activity.day <= addDays(start, 6))).length;
          consistency = Math.round((activeWeeks / Math.max(weekStarts.length, 1)) * 100);
          volumeTitle = "Weekly volume";
          volumeAria = `Weekly volume for ${periodLabel}`;
        } else {
          const rows = MONTHS.map((monthName, index) => {
            const monthKey = `${periodValue}-${String(index + 1).padStart(2, "0")}`;
            const monthActivities = activities.filter((activity) => activity.day.slice(0, 7) === monthKey);
            const monthSessions = sessions.filter((session) => session.day.slice(0, 7) === monthKey);
            const plannedKm = Math.round(monthSessions.reduce((total, session) => total + (session.distanceKm ?? 0), 0) * 10) / 10;
            return `<a class="period-row" href="${historyHref("month", monthKey)}"><div><h2>${escapeHtml(monthName)} ${escapeHtml(periodValue)}</h2><p class="muted small">${monthActivities.length} run${monthActivities.length === 1 ? "" : "s"} · ${sumDistance(monthActivities)} km · ${formatMinutes(sumDuration(monthActivities))}${plannedKm > 0 ? ` · planned ${plannedKm} km` : ""}</p></div><span class="chip">View month</span></a>`;
          }).join("");
          content = `<div class="period-rows">${rows}</div>`;
          volumeBuckets = MONTHS.map((monthName, index) => ({
            label: monthName.slice(0, 3),
            total: sumDistance(activities.filter((activity) => activity.day.slice(0, 7) === `${periodValue}-${String(index + 1).padStart(2, "0")}`)),
          }));
          const activeMonths = MONTHS.filter((_, index) => activities.some((activity) => activity.day.slice(0, 7) === `${periodValue}-${String(index + 1).padStart(2, "0")}`)).length;
          consistency = Math.round((activeMonths / 12) * 100);
          volumeTitle = "Monthly volume";
          volumeAria = `Monthly volume for ${periodValue}`;
        }

        let loadCard = "";
        if (load !== null) {
          const prompt = coachPromptForWeek(periodLabel, load, activities, sessions);
          const loadStats = [
            load.hasLoad ? `<div class="load-stat"><strong>${load.weekLoad}</strong><span>load</span></div>` : "",
            load.acwr === null ? "" : `<div class="load-stat"><strong>${load.acwr.toFixed(2)}</strong><span>ACWR</span></div>`,
            load.weekChangePct === null ? "" : `<div class="load-stat"><strong>${load.weekChangePct > 0 ? "+" : ""}${load.weekChangePct}%</strong><span>vs last week</span></div>`,
            load.hasIntensity ? `<div class="load-stat"><strong>${load.hardDistanceKm} / ${load.easyDistanceKm} km</strong><span>hard / easy</span></div>` : "",
          ].filter((part) => part.length > 0).join("");
          const intensityLine = load.hasIntensity
            ? `<p class="muted small">Hard ${load.hardRuns} run${load.hardRuns === 1 ? "" : "s"} · ${load.hardDistanceKm} km · ${load.hardMinutes} min · Easy ${load.easyRuns} run${load.easyRuns === 1 ? "" : "s"} · ${load.easyDistanceKm} km · ${load.easyMinutes} min</p>`
            : "";
          // The split is Garmin's intensity when present and the runner's reported effort otherwise; say which rule.
          const hardEasyNote = load.hasIntensity
            ? `<p class="muted small">A reported effort of 7 or above counts as hard.</p>`
            : "";
          const rising = load.signal === "watch" || load.signal === "high";
          const warningLine = rising ? `<p class="load-warning">${escapeHtml(loadWarningText(load))}</p>` : "";
          const rampIntent = { kind: "review-week", weekStart: periodStart, source: "load-card" };
          const rampChip = rising
            ? `<button type="button" class="coach-ask" data-coach-message="The last week or two ramped up - can we talk it through?" data-coach-intent="${escapeHtml(JSON.stringify(rampIntent))}">Talk through this ramp</button>`
            : "";
          const acwrNote = load.acwr === null
            ? ""
            : `<p class="muted small">ACWR compares this week with the 28-day average; a soft signal, not medical advice.</p>`;
          loadCard = `<section class="card load-card"><div class="load-head"><div><p class="eyebrow">Training load · 訓練負荷</p><h2>Week load</h2></div><span class="load-chip ${load.signal}">${escapeHtml(load.label)}</span></div>${warningLine}${loadStats.length === 0 ? "" : `<div class="load-grid">${loadStats}</div>`}${intensityLine}${hardEasyNote}<p class="muted small">${escapeHtml(load.note)}</p>${acwrNote}<div class="load-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(prompt)}" data-coach-intent="${escapeHtml(JSON.stringify(rampIntent))}">Review my week with the coach</button>${rampChip}</div></section>`;
        }

        let bestEffortsCard = "";
        if (view !== "week") {
          bestEffortsCard = periodBestsCard(periodLabel, personalBestsForPeriod(allActivities, periodStart, periodEnd));
        }

        const latestForReview = auto.newest ?? newestActivity ?? null;
        const reviewSessions = latestForReview === null ? [] : options.store.listSessions(user.userId, latestForReview.day, latestForReview.day);
        // The sync card and the manual-log card share one renderer, so both paths produce the identical one-tap review.
        const reviewCard = latestForReview === null ? "" : runReviewCard(latestForReview, "New run synced");
        const manualReviewCard = manualReviewCardFor(options.store, user.userId, url.searchParams);
        const noActivities = activities.length === 0
          ? `<p class="muted small period-empty">No recorded activities in this ${view} yet. <a href="/day/${escapeHtml(today)}#log-run">Log a run</a> or <a href="/calendar?garmin=setup">connect Garmin</a>.</p>`
          : "";
        const lastImportText = lastImport.length === 0
          ? "No Garmin import yet."
          : `Last import: ${localDateTime(lastImport, user.timezone)}`;

        const body = `<header class="page-head"><p class="eyebrow">Training log · 訓練紀錄</p><h1>Past training</h1><p class="muted">What actually happened, from Garmin and reported runs. Pick a week, month or year; the plan stays on the calendar.</p></header>
          ${periodBar}
          ${garminPanel}
          <section class="history-summary">
            <div class="stat"><strong>${activities.length}</strong><span>runs</span></div>
            <div class="stat"><strong>${sumDistance(activities)} km</strong><span>distance</span></div>
            <div class="stat"><strong>${formatMinutes(sumDuration(activities))}</strong><span>time</span></div>
            <div class="stat"><strong>${longest > 0 ? `${longest} km` : "—"}</strong><span>longest</span></div>
          </section>
          <p class="muted small">${escapeHtml(lastImportText)}</p>
          ${manualReviewCard}
          ${reviewCard}
          ${loadCard}
          ${trendSection(activities, volumeBuckets, consistency, periodLabel, volumeTitle, volumeAria)}
          ${bestEffortsCard}
          ${noActivities}
          ${content}`;
        sendHtml(response, 200, pageLayout("Training log", body, user, "history", flash));
        return;
      }

      if (url.pathname === "/" || url.pathname === "/calendar") {
        const monthParam = url.searchParams.get("month");
        const month = monthParam !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : today.slice(0, 7);
        const start = monthStart(month);
        const end = addDays(start, daysInMonth(month) - 1);
        await autoSync(user.userId, today);
        const nowIso = now();
        const activeStates = sortCoachStates(options.store.getActiveCoachStates(user.userId, nowIso))
          .filter((state) => state.status === "active" && state.key !== "no_key")
          .slice(0, 3);
        // A recent muscle check-in at warning level earns the same one-tap visibility as a coaching state.
        const latestCheckIn = options.store.listMuscleCheckIns(user.userId, 1)[0];
        const muscleChip =
          latestCheckIn !== undefined && addDays(latestCheckIn.day, 3) >= today
            ? (muscleCalendarChip(latestCheckIn) ?? "")
            : "";
        const stateChips =
          activeStates.length === 0 && muscleChip.length === 0
            ? ""
            : `<div class="state-chips">${activeStates.map((state) => stateChipHtml(state)).join("")}${muscleChip}${activeStates.length === 0 ? "" : `<a class="chip" href="/coach-states">All states</a>`}</div>`;
        const sessions = options.store.listSessions(user.userId, start, end);
        const activities = options.store.listActivities(user.userId, 200).filter((activity) => activity.day >= start && activity.day <= end);
        // Fill this month's missing workouts before rendering so every run with a Garmin workout is paired in the grid.
        await enrichCalendarWorkouts(user.userId, activities);
        const workouts = options.store.listActivityWorkouts(user.userId, start, end);
        const firstWeekday = weekdayIndex(start);
        const cells: string[] = [];
        for (let pad = 0; pad < firstWeekday; pad += 1) cells.push(`<div class="cell pad"></div>`);
        for (let dayNumber = 1; dayNumber <= daysInMonth(month); dayNumber += 1) {
          const day = `${month}-${String(dayNumber).padStart(2, "0")}`;
          const daySessions = sessions.filter((session) => session.day === day);
          const dayActivities = activities.filter((activity) => activity.day === day);
          const dayWorkouts = workouts.filter((workout) => workout.day === day);
          const items = calendarDayItems(daySessions, dayActivities, dayWorkouts);
          cells.push(`<a class="cell${day === today ? " today" : ""}" data-day="${escapeHtml(day)}" href="/day/${escapeHtml(day)}" aria-haspopup="menu" title="Day actions">
            <span class="date">${dayNumber}</span>
            <span class="cal-items">${renderCalendarItems(items)}</span>
          </a>`);
        }
        const prev = addDays(start, -1).slice(0, 7);
        const next = addDays(end, 1).slice(0, 7);
        const currentMonth = today.slice(0, 7);
        const monthLabel = `${MONTHS[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}`;
        const savedKey = options.store.getGarminKey(user.userId);
        const garminPanel = renderGarminPanel(savedKey, `/calendar?month=${month}`, url.searchParams.get("keyError"));
        // Freshness beside the data: the same timestamp the bell shows, formatted in the runner's own timezone.
        const lastSync = options.store.getLastSync(user.userId);
        const syncChip = savedKey !== undefined && lastSync !== null
          ? `<span class="chip garmin-sync-chip" title="The last Garmin pull, shown in your timezone">Garmin synced ${escapeHtml(localDateTime(lastSync, safeTimeZone(user.timezone)))}</span>`
          : "";
        const reviewCard = redirectReviewCardFor(options.store, user.userId, url.searchParams);
        const emptyCard = sessions.length > 0 || activities.length > 0
          ? ""
          : `<section class="card empty-card"><h2>Your calendar is empty</h2><p class="muted">Ask the coach for a plan, connect Garmin, or log a run by hand. The coach books, moves and deletes sessions; you can undo a batch from the recent changes below.</p><p class="empty-actions"><a class="btn" href="/calendar?garmin=setup">Connect Garmin</a> <a class="btn ghost" href="/day/${escapeHtml(today)}#log-run">Log a run</a> <button class="btn ghost coach-ask" type="button" data-coach-message="Help me plan the next two weeks." data-coach-intent="${escapeHtml(JSON.stringify({ kind: "plan", source: "composer" }))}">Ask the coach</button></p></section>`;
        const connectCard = savedKey === undefined
          ? `<section class="card connect-card"><h2>Garmin is not connected</h2><p class="muted small">Connect a Personal API key to pull completed runs and pair them with the workout they followed. <a class="btn" href="/calendar?garmin=setup">Connect Garmin</a> <a class="chip" href="/day/${escapeHtml(today)}#log-run">Log a run by hand</a></p></section>`
          : "";
        // The 6am answer: what is booked today, above the grid, only in the month that contains today.
        const todaySessions = month === currentMonth ? sessions.filter((session) => session.day === today) : [];
        const todayActivities = month === currentMonth ? activities.filter((activity) => activity.day === today) : [];
        const todaySession = todaySessions[0];
        const todayRun = todayActivities[0];
        const todayStrip = month !== currentMonth
          ? ""
          : `<section class="today-strip" aria-label="Today">
            <div class="today-strip-head"><span class="today-strip-label">Today</span><span class="today-strip-date">${escapeHtml(formatDayLabel(today))}</span></div>${
              todaySession !== undefined
                ? `<div class="today-strip-main"><span class="chip kind-${escapeHtml(todaySession.kind)}">${escapeHtml(sessionKindLabel(todaySession.kind))}</span><strong class="today-strip-title">${escapeHtml(todaySession.title)}</strong>${[
                    todaySession.distanceKm === null ? "" : `${todaySession.distanceKm} km`,
                    todaySession.durationMin === null ? "" : formatMinutes(todaySession.durationMin),
                  ].filter((part) => part.length > 0).map((part) => `<span class="today-strip-meta">${escapeHtml(part)}</span>`).join("")}${todaySessions.length > 1 ? `<a class="chip" href="/day/${escapeHtml(today)}">+${todaySessions.length - 1} more</a>` : ""}${todayRun !== undefined ? `<span class="today-strip-meta"><span class="tick">✓</span> ${escapeHtml(todayRun.title)} — ${escapeHtml(activityMetrics(todayRun))}</span>` : ""}<p class="today-strip-intent">${escapeHtml(sessionIntent(todaySession).purpose)} <span class="muted">${escapeHtml(sessionIntent(todaySession).effort)}</span></p></div>
              <div class="today-strip-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(`What is planned on ${today}?`)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-day", day: today, source: "today-strip" }))}">Ask coach</button><a class="chip" href="/day/${escapeHtml(today)}">View day</a></div>`
                : todayRun !== undefined
                  ? `<div class="today-strip-main"><strong class="today-strip-title"><span class="tick">✓</span> ${escapeHtml(todayRun.title)}</strong><span class="today-strip-meta">${escapeHtml(activityMetrics(todayRun))}</span><span class="chip source-${escapeHtml(todayRun.source)}">${escapeHtml(activitySourceLabel(todayRun))}</span></div>
              <div class="today-strip-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(coachPromptForActivity(todayRun))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-activity", activityId: todayRun.activityId, source: "today-strip" }))}">Ask coach</button><a class="chip" href="/activity/${encodeURIComponent(todayRun.activityId)}">Detail</a><a class="chip" href="/day/${escapeHtml(today)}">View day</a></div>`
                  : `<div class="today-strip-main"><p class="today-strip-empty">Nothing booked today — ask the coach to fill it, or log a run by hand.</p></div>
              <div class="today-strip-actions"><button type="button" class="coach-ask" data-coach-send="false" data-coach-message="${escapeHtml(`Add a session on ${today}: `)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "plan", day: today, source: "today-strip" }))}">Ask the coach</button><a class="chip" href="/day/${escapeHtml(today)}#log-run">Log a run</a></div>`
            }</section>`;
        const body = `<header class="page-head"><p class="eyebrow">Private calendar</p>
          <h1>Your plan</h1>
          <p class="muted">Welcome back, ${escapeHtml(user.displayName)}.</p>
          <p class="cal-legend">Colored row: planned session · green ✓ row: recorded run · green+purple ◈ row: recorded run + the Garmin workout it followed.</p>
          <p class="head-actions"><a class="chip" href="/day/${escapeHtml(today)}#log-run">Log a run</a> <a class="chip" href="#recent-changes">Recent changes</a>${syncChip}</p>${stateChips}</header>
          ${todayStrip}
          ${reviewCard}
          ${emptyCard}
          <section class="card">
            <div class="month-nav"><a href="/calendar?month=${escapeHtml(prev)}">← Previous</a><a id="month-current" class="month-current" data-month="${escapeHtml(month)}" data-current-month="${escapeHtml(currentMonth)}" href="/calendar?month=${escapeHtml(month)}" aria-haspopup="dialog" title="Choose month">${escapeHtml(monthLabel)}</a><a href="/calendar?month=${escapeHtml(next)}">Next →</a></div>
            <div class="dow">${DOW.map((day) => `<span>${day}</span>`).join("")}</div>
            <div class="month" data-month="${escapeHtml(month)}">${cells.join("")}</div>
          </section>
          ${connectCard}
          ${recentChangesCard(options.store.listChangeSets(user.userId, 5), `/calendar?month=${month}`)}
          ${garminPanel}`;
        sendHtml(response, 200, pageLayout("Plan", body, user, "calendar", flash));
        return;
      }

      const peekPath = /^\/activity\/(.+)\/peek$/.exec(url.pathname);
      if (peekPath !== null) {
        if (method !== "GET") {
          sendJson(response, 405, { error: { detail: "method not allowed" } });
          return;
        }
        let peekActivityId = "";
        try {
          peekActivityId = decodeURIComponent(peekPath[1] ?? "");
        } catch {
          sendJson(response, 404, { error: { detail: "activity not found" } });
          return;
        }
        const peekActivity = options.store.getActivity(user.userId, peekActivityId);
        if (peekActivity === undefined) {
          sendJson(response, 404, { error: { detail: "activity not found" } });
          return;
        }
        const peekSessions = options.store.listSessions(user.userId, peekActivity.day, peekActivity.day);
        const peekPrDistances = prDistancesFor(
          options.store.listActivities(user.userId, 1000),
          peekActivity.activityId,
        );
        const peekWorkout = options.store.getActivityWorkout(user.userId, peekActivity.activityId) ?? null;
        sendJson(response, 200, { peek: buildActivityPeek(peekActivity, peekSessions, peekPrDistances, peekWorkout) });
        return;
      }

      const sessionPeekPath = /^\/session\/(.+)\/peek$/.exec(url.pathname);
      if (sessionPeekPath !== null) {
        if (method !== "GET") {
          sendJson(response, 405, { error: { detail: "method not allowed" } });
          return;
        }
        let peekSessionId = "";
        try {
          peekSessionId = decodeURIComponent(sessionPeekPath[1] ?? "");
        } catch {
          sendJson(response, 404, { error: { detail: "session not found" } });
          return;
        }
        const peekSession = options.store.getSession(user.userId, peekSessionId);
        if (peekSession === undefined) {
          sendJson(response, 404, { error: { detail: "session not found" } });
          return;
        }
        const peekSessions = options.store.listSessions(user.userId, peekSession.day, peekSession.day);
        const peekActivities = options.store
          .listActivities(user.userId, 500)
          .filter((activity) => activity.day === peekSession.day);
        sendJson(response, 200, { peek: buildSessionPeek(peekSession, peekSessions, peekActivities, today) });
        return;
      }

      if (url.pathname.startsWith("/activity/")) {
        let activityId = "";
        try {
          activityId = decodeURIComponent(url.pathname.slice("/activity/".length));
        } catch {
          sendHtml(response, 404, pageLayout("Not found", `<p>Not found</p>`, user, "none"));
          return;
        }
        const activity = options.store.getActivity(user.userId, activityId);
        if (activity === undefined) {
          sendHtml(response, 404, pageLayout("Not found", `<p>Not found</p>`, user, "none"));
          return;
        }
        const sessions = options.store.listSessions(user.userId, activity.day, activity.day);
        const match = matchActivity(activity, sessions);
        const unmatched = unmatchedSessions([match], sessions);
        const message = coachPromptForActivity(activity);
        const weekHref = historyHref("week", weekStartOf(activity.day));
        let splits: ActivitySplit[] = [];
        let splitError: string | null = null;
        let laps: ActivityLap[] = [];
        let lapError: string | null = null;
        let workout = options.store.getActivityWorkout(user.userId, activity.activityId) ?? null;
        let workoutError: string | null = null;
        const garmin = clientFor(user.userId);
        const garminId = activity.activityId.startsWith("garmin:") ? activity.activityId.slice("garmin:".length) : "";
        if (garmin !== undefined && activity.source === "garmin" && garminId.length > 0) {
          if (garmin.getActivityDetails !== undefined) {
            try {
              splits = mapGarminSplits(await garmin.getActivityDetails(garminId));
            } catch {
              splitError = "Garmin per-kilometre splits are not available for this run.";
            }
          }
          if (garmin.getActivitySummary !== undefined) {
            try {
              laps = mapGarminLaps(await garmin.getActivitySummary(garminId));
            } catch {
              lapError = "Garmin lap/interval summaries are not available for this run.";
            }
          }
        }
        if (garmin !== undefined && activity.source === "garmin") {
          // The workout is fetched once and stored; the detail page retries a failed fetch, then the calendar reuses it.
          const ensured = await ensureActivityWorkout(options.store, user.userId, activity, garmin, now());
          workout = ensured.workout;
          workoutError = ensured.error;
        }
        const prDistances = prDistancesFor(options.store.listActivities(user.userId, 1000), activity.activityId);
        const extraMetrics = activityExtraMetrics(activity);
        const efforts = fastestEfforts(activity, prDistances);
        const metricsCard = extraMetrics.length === 0 && efforts.length === 0
          ? ""
          : `<section class="card metric-extra-card"><h2>Run metrics</h2>${extraMetrics}${efforts}</section>`;
        const worked = musclesForRun({
          title: activity.title,
          kind: match.session?.kind,
          distanceKm: activity.distanceKm,
          elevationGainM: activity.elevationGainM ?? null,
        });
        const workedCard = musclesWorkedCard(activity.activityId, worked);
        const splitsHtml = activity.source === "garmin" ? splitsSection(splits, splitError) : "";
        const showLaps = laps.length > 1 || laps.some((lap) => lap.type !== "Run");
        const lapsHtml = lapError !== null
          ? lapsSection([], lapError)
          : showLaps ? lapsSection(laps, null) : "";
        const zonesHtml = hrZonesSection(activity);
        const workoutHtml = workoutSection(workout, workoutError);
        const otherSessions = unmatched.length === 0
          ? ""
          : `<section class="card"><h2>Other planned sessions that day</h2><p class="muted small">No matching run was recorded for these.</p><p class="history-plan">${unmatched.map(sessionChip).join(" ")}</p></section>`;
        const body = `<header class="page-head"><p class="eyebrow"><a href="${weekHref}">← Training log</a> · Activity</p><h1>${escapeHtml(activity.title)}</h1><p class="muted"><a href="/day/${escapeHtml(activity.day)}">${escapeHtml(formatDayLabel(activity.day))}</a> · <span class="chip source-${escapeHtml(activity.source)}">${escapeHtml(activitySourceLabel(activity))}</span></p></header>
          <section class="history-summary detail-summary">
            <div class="stat"><strong>${activity.distanceKm === null ? "—" : `${activity.distanceKm} km`}</strong><span>distance</span></div>
            <div class="stat"><strong>${activity.durationMin === null ? "—" : formatMinutes(activity.durationMin)}</strong><span>time</span></div>
            <div class="stat"><strong>${activity.paceSecPerKm === null ? "—" : formatPace(activity.paceSecPerKm)}</strong><span>pace</span></div>
            <div class="stat"><strong>${activity.avgHr === null ? "—" : `${activity.avgHr} bpm`}</strong><span>avg HR</span></div>
          </section>
          ${planComparison(match)}
          ${workoutHtml}
          ${workedCard}
          ${metricsCard}
          ${splitsHtml}
          ${lapsHtml}
          ${zonesHtml}
          <section class="card"><h2>Ask the coach about this run</h2><p class="muted">The coach will compare this run with your plan for the day and comment on effort, pace and what to keep in mind. Your calendar will not change.</p><div class="review-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(message)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-activity", activityId: activity.activityId, source: "activity-detail" }))}">Ask coach</button><a class="chip" href="/day/${escapeHtml(activity.day)}">View day</a><a class="chip" href="/calendar?month=${escapeHtml(activity.day.slice(0, 7))}">View plan</a></div></section>
          ${otherSessions}`;
        sendHtml(response, 200, pageLayout("Activity", body, user, "history", flash));
        return;
      }

      if (url.pathname.startsWith("/day/")) {
        const day = url.pathname.slice("/day/".length);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          sendHtml(response, 404, pageLayout("Not found", `<p>Not found</p>`, user, "none"));
          return;
        }
        const sessions = options.store.listSessions(user.userId, day, day);
        const activities = options.store.listActivities(user.userId, 200).filter((activity) => activity.day === day);
        const dayWorkouts = options.store
          .listActivityWorkouts(user.userId, day, day)
          .filter((workout) => workout.status === "ok");
        const workoutCard = dayWorkouts.length === 0
          ? ""
          : `<section class="card"><h2>Garmin workouts</h2><p class="muted small">The planned workout a recorded run followed. Garmin supplies this per activity; it is not a future plan.</p>${dayWorkouts.map((workout) => `<p class="history-program"><span class="chip">Garmin workout</span><span>${escapeHtml(workout.label)}${workout.summary.length === 0 ? "" : ` · ${escapeHtml(workout.summary)}`}</span></p>`).join("")}</section>`;
        const reviewCard = redirectReviewCardFor(options.store, user.userId, url.searchParams);
        const body = `<header class="page-head"><p class="eyebrow"><a href="/calendar?month=${escapeHtml(day.slice(0, 7))}">← Calendar</a></p><h1>${escapeHtml(formatDayLabel(day))}</h1>
          <p class="muted">${escapeHtml(day)} · ${escapeHtml(user.displayName)} · <a href="/profile">Profile</a></p></header>
          ${reviewCard}
          <section class="card"><h2>Booked by the coach</h2>${sessions.length === 0 ? `<p class="muted">No session booked.</p>` : `<ul class="sessions">${sessions.map((session) => `<li><strong>${escapeHtml(session.title)}</strong> <span class="chip kind-${escapeHtml(session.kind)}">${escapeHtml(sessionKindLabel(session.kind))}</span>${session.distanceKm === null ? "" : ` · ${session.distanceKm} km`}${session.durationMin === null ? "" : ` · ${formatMinutes(session.durationMin)}`}${session.note === null ? "" : `<p class="note">${escapeHtml(session.note)}</p>`}${sessionIntentHtml(session)}</li>`).join("")}</ul>`}</section>
          <section class="card"><h2>Recorded activities</h2>${activities.length === 0 ? `<p class="muted">Nothing recorded yet. Log a run below if it is not on Garmin.</p>` : `<ul class="sessions">${activities.map(activityLine).join("")}</ul>`}</section>
          <section class="card" id="log-run"><h2>Log a run</h2><p class="muted small">Treadmill, commute or a run from a watch that is not Garmin. It is matched to the plan with the same same-day rules as a synced run, and a later Garmin sync will not overwrite it.</p>
            <form method="post" action="/activities" class="stack log-form">
              <input type="hidden" name="next" value="/day/${escapeHtml(day)}">
              <input type="hidden" name="requestId" value="${escapeHtml(randomUUID())}">
              <label for="log-day">Day</label><input id="log-day" name="day" type="date" value="${escapeHtml(day)}" max="${escapeHtml(today)}" required>
              <label for="log-title">Title <span class="muted small">(optional)</span></label><input id="log-title" name="title" maxlength="80" placeholder="Morning run" autocomplete="off">
              <div class="log-row"><div><label for="log-distance">Distance (km)</label><input id="log-distance" name="distanceKm" type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="5"></div><div><label for="log-duration">Duration (min)</label><input id="log-duration" name="durationMin" type="number" min="1" max="600" step="1" inputmode="numeric" placeholder="30"></div></div>
              <label for="log-rpe">How did it feel? (0-10, optional)</label><input id="log-rpe" name="rpe" type="number" min="0" max="10" step="0.5" inputmode="decimal" placeholder="7">
              <button class="btn" type="submit">Log run</button>
            </form>
          </section>
          ${workoutCard}`;
        sendHtml(response, 200, pageLayout(formatDayLabel(day), body, user, "calendar", flash));
        return;
      }

      if (url.pathname === "/activities" && method === "POST") {
        const form = await readForm(request);
        const next = safeNext(form.get("next"));
        const result = buildManualActivity(
          {
            day: form.get("day") ?? "",
            title: form.get("title"),
            distanceKm: form.get("distanceKm"),
            durationMin: form.get("durationMin"),
            // The form's post-run effort: 0-10 in half steps, blank stays valid and stores null.
            rpe: form.get("rpe"),
            requestId: form.get("requestId"),
          },
          { userId: user.userId, today, now: now() },
        );
        if (!result.ok) {
          redirect(response, withParams(next, { logError: result.error }));
          return;
        }
        options.store.appendActivity(result.activity);
        // `review` lets the redirected page show the same one-tap review card a synced run gets.
        redirect(response, withParams(next, { logged: "1", review: result.activity.activityId }));
        return;
      }

      if (url.pathname === "/garmin/key/delete" && method === "POST") {
        const form = await readForm(request);
        const next = safeNext(form.get("next"));
        options.store.deleteGarminKey(user.userId);
        garminClients.delete(user.userId);
        redirect(response, withParams(next, { garmin: "deleted" }));
        return;
      }

      if (url.pathname === "/garmin/key" && method === "POST") {
        const form = await readForm(request);
        const next = safeNext(form.get("next"));
        const key = (form.get("key") ?? "").trim();
        if (key.length === 0) {
          redirect(response, withParams(next, { garmin: "setup", keyError: "Enter your Garmin personal API key." }));
          return;
        }
        if (!isPlausibleGarminKey(key)) {
          redirect(response, withParams(next, {
            garmin: "setup",
            keyError: "That does not look like a Garmin personal API key. Copy the whole key and try again.",
          }));
          return;
        }
        let client: GarminClient;
        try {
          client = makeGarminClient(key);
          await client.token();
        } catch (error) {
          redirect(response, withParams(next, { garmin: "setup", keyError: describeGarminError(error, "key") }));
          return;
        }
        options.store.saveGarminKey({ userId: user.userId, apiKey: key, savedAt: now() });
        garminClients.set(user.userId, client);
        try {
          const result = await syncService.sync(user.userId, today, { notifyWhenUnchanged: true });
          redirect(response, withParams(next, syncResultParams(result)));
        } catch (error) {
          redirect(response, withParams(next, { syncError: describeGarminError(error, "sync") }));
        }
        return;
      }

      const revertPath = /^\/calendar\/changes\/([^/]+)\/revert$/.exec(url.pathname);
      if (revertPath !== null && method === "POST") {
        const form = await readForm(request);
        const next = safeNext(form.get("next"));
        let changeSetId = "";
        try {
          changeSetId = decodeURIComponent(revertPath[1] ?? "");
        } catch {
          redirect(response, withParams(next, { undoError: "invalid change id" }));
          return;
        }
        const changeSet = options.store.getChangeSet(user.userId, changeSetId);
        if (changeSet === undefined) {
          redirect(response, withParams(next, { undoError: "that change no longer exists" }));
          return;
        }
        if (changeSet.revertedAt !== null) {
          redirect(response, withParams(next, { undoError: "that change was already undone" }));
          return;
        }
        try {
          applyRevert(options.store, user.userId, changeSet, now());
          redirect(response, withParams(next, { undone: "1" }));
        } catch {
          redirect(response, withParams(next, { undoError: "the calendar could not be restored" }));
        }
        return;
      }

      if (url.pathname === "/export.json" && method === "GET") {
        const bundle = buildExportBundle({
          exportedAt: now(),
          profile: {
            userId: user.userId,
            username: user.username,
            displayName: user.displayName,
            timezone: user.timezone,
            goal: user.goal,
            createdAt: user.createdAt,
          },
          sessions: options.store.listSessions(user.userId, "0000-01-01", "9999-12-31"),
          activities: options.store.listActivities(user.userId, 5000),
          changeSets: options.store.listChangeSets(user.userId, 500),
          muscleCheckIns: options.store.listMuscleCheckIns(user.userId, 500),
        });
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="poc3-export-${today}.json"`,
          "cache-control": "no-store",
        });
        response.end(JSON.stringify(bundle, null, 2));
        return;
      }

      if (url.pathname === "/export.ics" && method === "GET") {
        const ics = buildCalendarIcs({
          sessions: options.store.listSessions(user.userId, "0000-01-01", "9999-12-31"),
          calendarName: `POC3 - ${user.displayName}`,
          now: now(),
        });
        response.writeHead(200, {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": `attachment; filename="poc3-calendar-${today}.ics"`,
          "cache-control": "no-store",
        });
        response.end(ics);
        return;
      }

      if (url.pathname === "/sync" && method === "POST") {
        const form = await readForm(request);
        const next = safeNext(form.get("next"));
        if (clientFor(user.userId) === undefined) {
          redirect(response, withParams(next, { garmin: "setup" }));
          return;
        }
        try {
          const result = await syncService.sync(user.userId, today, { notifyWhenUnchanged: true });
          redirect(response, withParams(next, syncResultParams(result)));
        } catch (error) {
          redirect(response, withParams(next, { syncError: describeGarminError(error, "sync") }));
        }
        return;
      }

      sendHtml(response, 404, pageLayout("Not found", `<p>Not found</p>`, user, "none"));
    })().catch((error: unknown) => {
      if (!response.headersSent) sendHtml(response, 500, pageLayout("Error", `<p class="error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`, requestUser, "none"));
      else response.end();
    });
  });
  return {
    server,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await syncService.idle();
    },
    whenSynced: () => syncService.idle(),
  };
}
