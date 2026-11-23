/**
 * The private calendar: the artefact the conversation leaves behind. Planned sessions are read-only for the runner; the
 * coach (gateway) is the only session writer. The day page can log a reported run by hand, and the runner can export the
 * plan, log and change history. See ADR-0001 for the session-write rule.
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";

import { AuthError, type Auth, type AuthUser, type ProfileUpdate } from "./auth";
import { HORIZON_DAYS } from "./coach";
import { applyRevert } from "./history";
import { buildCalendarIcs, buildExportBundle } from "./export";
import { buildManualActivity } from "./manual-activity";
import { createRateLimiter } from "./rate-limit";
import { createGarminClient, type GarminClient } from "./garmin";
import { describeGarminError } from "./garmin-errors";
import { createGarminSync, type GarminSyncOutcome } from "./garmin-sync";
import { buildDirectiveForIntent, parseCoachIntent, type CoachIntent } from "./directives";
import {
  confirmCoachState,
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
  isMuscleId,
  MAX_CHECKIN_NOTE_CHARS,
  musclesForRun,
  parseMuscleTagsJson,
  validateCheckInDay,
  type MuscleCheckIn,
  type MuscleConditionKey,
  type MuscleSide,
  type MuscleWarmUp,
} from "./muscles";
import { computeMuscleStatuses, type MuscleStatusControl } from "./muscle-status";
import {
  confirmMuscleProposal,
  dismissMuscleProposal,
  listPendingMuscleProposals,
  partitionPendingMuscleProposals,
  restoreMuscleProposal,
} from "./muscle-proposals";
import {
  muscleCalendarChip,
  muscleProposalView,
  musclesWorkedCard,
  renderMusclePage,
  type MuscleActivityOption,
  type MuscleProposalView,
  type MuscleTrainingRow,
} from "./web-muscle";
import { CSS } from "./styles";
import {
  LOCALES,
  LOCALE_COOKIE,
  clientStrings,
  createTranslator,
  defaultTranslator,
  isLocale,
  languageCookie,
  resolveLocale,
  type DateFormat,
  type MessageKey,
  type Translator,
} from "./i18n";
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
  ChangeEntry,
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
  /** Shared secret presented to the gateway on every proxied coach turn (see GatewayOptions.internalToken). */
  gatewayToken?: string;
  modelId?: string;
  /** Append `Secure` to session cookies; enable whenever the deployment terminates TLS. */
  cookieSecure?: boolean;
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

/**
 * The pinned three.js builds the 3D muscle viewer imports (see src/vendor/THREE-LICENSE.txt). Read once at
 * startup and served as static scripts, so the app keeps its zero-runtime-npm-dependency rule.
 */
const THREE_MODULE = readFileSync(new URL("./vendor/three.module.min.js", import.meta.url), "utf8");
const ORBIT_CONTROLS_MODULE = readFileSync(new URL("./vendor/OrbitControls.js", import.meta.url), "utf8");
const GLTF_LOADER_MODULE = readFileSync(new URL("./vendor/GLTFLoader.js", import.meta.url), "utf8");
const BUFFER_GEOMETRY_UTILS_MODULE = readFileSync(new URL("./vendor/BufferGeometryUtils.js", import.meta.url), "utf8");
/**
 * The real 3D muscle figure (BodyParts3D, CC BY 4.0; see src/vendor/THREE-LICENSE.txt and
 * docs/MUSCLE-ANATOMY-3D-RESEARCH.md). Read once at startup: the viewer fetches it and falls back to the
 * procedural sculpt when it cannot load or render.
 */
const ANATOMY_MUSCLES_GLB = readFileSync(new URL("./vendor/anatomy-muscles.glb", import.meta.url));
/**
 * Original sign-in art: a ComfyUI-generated dawn-track plate and a Blender-rendered November calendar sculpture.
 * Both are read once at startup and served as static assets, so the auth page keeps the zero-runtime-dependency rule.
 */
const AUTH_HERO_WEBP = readFileSync(new URL("./vendor/signin/auth-hero.webp", import.meta.url));
const AUTH_OBJECT_WEBP = readFileSync(new URL("./vendor/signin/calendar-object.webp", import.meta.url));
const AUTH_GRAIN_WEBP = readFileSync(new URL("./vendor/signin/paper-grain.webp", import.meta.url));
/**
 * Original signed-in art: a Blender/ComfyUI empty-month plate, a wide paper wash for an empty calendar,
 * and a Blender coach token for the bubble. All are local, read once and served with a cache header.
 */
const CALENDAR_EMPTY_WEBP = readFileSync(new URL("./vendor/calendar/calendar-empty.webp", import.meta.url));
const CALENDAR_WASH_WEBP = readFileSync(new URL("./vendor/calendar/calendar-wash.webp", import.meta.url));
const COACH_TOKEN_WEBP = readFileSync(new URL("./vendor/calendar/coach-token.webp", import.meta.url));

/** Bump when the auth or shared stylesheet changes; tests only assert the cache-busting prefix. */
const APP_CSS_VERSION = 34;

const SESSION_COOKIE = "milebooksid";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;

/** Inline JSON that cannot close the surrounding script element. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * A hash-based Content-Security-Policy for one rendered page.
 *
 * The pages carry their client code as inline `<script>` blocks, so a policy of `'self'` alone would block the app. The
 * hashes are computed from the exact bodies this response is about to send, which is the only way they can be trusted to
 * match; `style-src` still allows inline styles because the markup sets a few `style` attributes, and `img-src` allows
 * `data:` for the CSS-embedded icon. There are no inline event handlers, no `eval`, no workers and no third-party
 * origins, so nothing else is needed.
 */
function contentSecurityPolicy(html: string): string {
  const hashes: string[] = [];
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const body = match[1] ?? "";
    if (body.length === 0) continue;
    hashes.push(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  return [
    "default-src 'self'",
    `script-src ${["'self'", ...hashes].join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": contentSecurityPolicy(html),
  });
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

/** A stable strong ETag for an in-memory asset, computed once at startup. */
function etagFor(body: string | Buffer): string {
  return `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
}

/**
 * Serve an in-memory asset with a validator. The 11 MB anatomy model and the three.js builds are read once at
 * startup; without an ETag every page view re-downloads them, so a revalidating request now costs a 304 instead.
 */
function sendAsset(
  request: IncomingMessage,
  response: ServerResponse,
  body: string | Buffer,
  contentType: string,
  cacheControl: string,
  etag: string,
): void {
  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, { etag, "cache-control": cacheControl });
    response.end();
    return;
  }
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": cacheControl,
    etag,
  });
  response.end(body);
}

/** Asset validators, computed once at startup so a revalidating request costs a 304 and no body. */
const STATIC_ETAGS = {
  css: etagFor(CSS),
  three: etagFor(THREE_MODULE),
  orbit: etagFor(ORBIT_CONTROLS_MODULE),
  gltf: etagFor(GLTF_LOADER_MODULE),
  utils: etagFor(BUFFER_GEOMETRY_UTILS_MODULE),
  authHero: etagFor(AUTH_HERO_WEBP),
  authObject: etagFor(AUTH_OBJECT_WEBP),
  grain: etagFor(AUTH_GRAIN_WEBP),
  calendarEmpty: etagFor(CALENDAR_EMPTY_WEBP),
  calendarWash: etagFor(CALENDAR_WASH_WEBP),
  coachToken: etagFor(COACH_TOKEN_WEBP),
  anatomy: etagFor(ANATOMY_MUSCLES_GLB),
} as const;

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

function sessionCookie(id: string, secure: boolean): string {
  const secureAttribute = secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/${secureAttribute}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function clearSessionCookie(secure: boolean): string {
  const secureAttribute = secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/${secureAttribute}; Max-Age=0`;
}

/** A coarse client identity for throttling: the socket peer, never a spoofable header. */
function clientKey(request: IncomingMessage): string {
  return request.socket.remoteAddress ?? "unknown";
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
      value.startsWith("/muscle?") ||
      value === "/changes" ||
      value.startsWith("/changes?"))
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

/** A same-origin in-app path for the language switch redirect; rejects absolute URLs and protocol-relative targets. */
function safeLanguageNext(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("://")) return null;
  const parsed = new URL(value, "http://localhost");
  if (parsed.origin !== "http://localhost") return null;
  return `${parsed.pathname}${parsed.search}`;
}

/** The page to return to after a key save/sync, without transient result params. */
function cleanNext(url: URL): string {  const params = new URLSearchParams(url.search);
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

/** A failed undo carries a fixed reason through the redirect URL. Map the canonical reason to a key so the banner localizes while the URL param stays stable. */
const UNDO_REASON_KEYS: Record<string, MessageKey> = {
  "invalid change id": "flash.undoReason.invalid",
  "that change no longer exists": "flash.undoReason.missing",
  "that change was already undone": "flash.undoReason.undone",
  "the calendar could not be restored": "flash.undoReason.failed",
};

/**
 * The one-line result of a sync, key save, manual log or undo that survives the redirect. The params already exist;
 * before this helper nothing rendered them, so "I pressed Sync and nothing happened" was the expected reading.
 */
function syncFlash(params: URLSearchParams, tx: Translator): string {
  const error = params.get("syncError");
  if (error !== null && error.length > 0) {
    return `<p class="banner error" role="alert">${escapeHtml(tx.t("flash.syncFailed", { detail: error }))}</p>`;
  }
  const synced = params.get("synced");
  if (synced !== null) {
    const count = Number(synced);
    const label = Number.isFinite(count) && count > 0
      ? tx.t(count === 1 ? "flash.newOne" : "flash.newOther", { count: Math.floor(count) })
      : tx.t("flash.noNew");
    return `<p class="banner ok" role="status">${escapeHtml(tx.t("flash.syncDone", { label }))}</p>`;
  }
  if (params.get("garmin") === "deleted") {
    return `<p class="banner ok" role="status">${escapeHtml(tx.t("flash.keyRemoved"))}</p>`;
  }
  if (params.get("logged") === "1") {
    return `<p class="banner ok" role="status">${escapeHtml(tx.t("flash.runLogged"))}</p>`;
  }
  const undoneCount = Number(params.get("undone") ?? "");
  if (Number.isInteger(undoneCount) && undoneCount > 0) {
    return `<p class="banner ok" role="status">${escapeHtml(tx.t("flash.changeUndoneCount", { count: undoneCount }))}</p>`;
  }
  const undoError = params.get("undoError");
  if (undoError !== null && undoError.length > 0) {
    const reasonKey = UNDO_REASON_KEYS[undoError];
    const detail = reasonKey === undefined ? undoError : tx.t(reasonKey);
    return `<p class="banner error" role="alert">${escapeHtml(tx.t("flash.undoFailed", { detail }))}</p>`;
  }
  const logError = params.get("logError");
  if (logError !== null && logError.length > 0) {
    return `<p class="banner error" role="alert">${escapeHtml(tx.t("flash.logFailed", { detail: logError }))}</p>`;
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
function activitySourceLabel(activity: Activity, tx: Translator = defaultTranslator): string {
  return activity.source === "garmin" ? tx.t("activity.source.garmin") : tx.t("activity.source.reported");
}

function activityLine(activity: Activity, tx: Translator = defaultTranslator): string {
  const amount = [activity.distanceKm === null ? "" : `${activity.distanceKm} km`, activity.durationMin === null ? "" : formatMinutes(activity.durationMin), activity.paceSecPerKm === null ? "" : `${Math.floor(activity.paceSecPerKm / 60)}:${String(activity.paceSecPerKm % 60).padStart(2, "0")}/km`, activity.avgHr === null ? "" : `${activity.avgHr} bpm`]
    .filter((part) => part.length > 0)
    .join(" · ");
  return `<li><span class="tick">✓</span> ${escapeHtml(activity.title)}${amount.length === 0 ? "" : ` — ${escapeHtml(amount)}`} <span class="muted">(${escapeHtml(activitySourceLabel(activity, tx))})</span> <a class="chip" href="/activity/${encodeURIComponent(activity.activityId)}">${escapeHtml(tx.t("activity.detail"))}</a></li>`;
}

function formatDayLabel(day: string, date: DateFormat = defaultTranslator.date): string {
  return date.dayLabel(day);
}

function formatShortDate(day: string, date: DateFormat = defaultTranslator.date): string {
  return date.shortDate(day);
}

/** One batch's human headline: count + action + the day or range it touched. Never the raw coach log. */
interface ChangeHeadline {
  readonly text: string;
  readonly action: "add" | "remove" | "update" | "revert" | "mixed";
}

/** The days a batch touched: the `toDay` when there is one, else the `fromDay`. */
function changeDays(changeSet: ChangeSet): string[] {
  const days = changeSet.entries
    .map((entry) => entry.toDay ?? entry.fromDay)
    .filter((day): day is string => day !== null && day.length === 10);
  return [...new Set(days)].sort();
}

function changeRange(changeSet: ChangeSet, tx: Translator): string {
  const days = changeDays(changeSet);
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return "";
  return first === last ? tx.date.weekdayDate(first) : `${tx.date.shortDate(first)} – ${tx.date.shortDate(last)}`;
}

function changeAction(changeSet: ChangeSet): "add" | "remove" | "update" | "revert" | "mixed" {
  const actions = new Set(changeSet.entries.map((entry) => entry.action));
  if (actions.size !== 1) return "mixed";
  const action = changeSet.entries[0]?.action;
  return action === "add" || action === "remove" || action === "update" ? action : action === "revert" ? "revert" : "mixed";
}

/** What a revert batch reversed: an undo that deleted an added session reversed an add. */
function revertAction(changeSet: ChangeSet): "add" | "remove" | "update" | "mixed" {
  const effects = changeSet.entries.map((entry) => {
    if (entry.after === null) return "add" as const;
    if (entry.before === null) return "remove" as const;
    return "update" as const;
  });
  const unique = new Set(effects);
  return unique.size === 1 ? effects[0] ?? "mixed" : "mixed";
}

function changeHeadline(changeSet: ChangeSet, tx: Translator): ChangeHeadline {
  const count = changeSet.entries.length;
  const unit = count === 1 ? tx.t("changes.unitOne") : tx.t("changes.unitOther");
  const phrase = (action: "add" | "remove" | "update" | "mixed"): string => {
    if (action === "add") return tx.t("changes.headline.added", { count, unit });
    if (action === "remove") return tx.t("changes.headline.removed", { count, unit });
    if (action === "update") return tx.t("changes.headline.updated", { count, unit });
    return tx.t("changes.headline.mixed", { count });
  };
  const action = changeAction(changeSet);
  let text: string;
  if (action === "revert") {
    const original = revertAction(changeSet);
    text = original === "remove"
      ? tx.t("changes.headline.restored", { count, unit })
      : tx.t("changes.headline.undone", { phrase: phrase(original) });
  } else {
    text = phrase(action);
  }
  const range = changeRange(changeSet, tx);
  return { text: range.length === 0 ? text : `${text} · ${range}`, action };
}

function changeDayDiff(day: string, today: string): number {
  const from = Date.parse(`${day}T00:00:00.000Z`);
  const to = Date.parse(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** A timestamp in the runner's zone, with relative freshness for the last week. */
function timeMeta(createdAt: string, today: string, timezone: string, tx: Translator): string {
  const day = localDay(createdAt, timezone);
  const diff = changeDayDiff(day, today);
  if (diff === 0) return tx.t("changes.changedToday");
  if (diff === 1) return tx.t("changes.changedYesterday");
  if (diff <= 7) return tx.t("changes.changedDaysAgo", { date: tx.date.shortDate(day), count: diff });
  return tx.t("changes.changedOn", { date: tx.date.shortDate(day) });
}

function changeMeta(changeSet: ChangeSet, today: string, timezone: string, tx: Translator): string {
  return timeMeta(changeSet.createdAt, today, timezone, tx);
}

/** One entry as the runner reads it: what happened, to which session, and what actually moved. */
function describeChangeEntry(entry: ChangeEntry, tx: Translator): { action: string; delta: string } {
  if (entry.action === "add") return { action: tx.t("changes.added"), delta: "" };
  if (entry.action === "remove") return { action: tx.t("changes.deleted"), delta: "" };
  if (entry.action === "revert") {
    return entry.after === null
      ? { action: tx.t("changes.deleted"), delta: "" }
      : { action: tx.t("changes.putBack"), delta: "" };
  }
  const moved = entry.fromDay !== null && entry.toDay !== null && entry.fromDay !== entry.toDay;
  const deltas: string[] = [];
  if (moved && entry.fromDay !== null) deltas.push(tx.t("changes.fromDay", { day: tx.date.shortDate(entry.fromDay) }));
  const before = entry.before;
  const after = entry.after;
  if (before !== null && after !== null) {
    if (before.title !== after.title) deltas.push(tx.t("changes.renamed"));
    if (before.distanceKm !== after.distanceKm) {
      const distance = (value: number | null): string => (value === null ? "–" : `${value} km`);
      deltas.push(`${distance(before.distanceKm)} → ${distance(after.distanceKm)}`);
    }
    if (before.durationMin !== after.durationMin) {
      const duration = (value: number | null): string => (value === null ? "–" : formatMinutes(value));
      deltas.push(`${duration(before.durationMin)} → ${duration(after.durationMin)}`);
    }
    if (before.kind !== after.kind) deltas.push(`${sessionKindLabel(before.kind, tx)} → ${sessionKindLabel(after.kind, tx)}`);
    if ((before.note ?? "") !== (after.note ?? "")) deltas.push(tx.t("changes.noteUpdated"));
  }
  return { action: moved ? tx.t("changes.moved") : tx.t("changes.updated"), delta: deltas.join(" · ") };
}

function changeEntryRow(entry: ChangeEntry, tx: Translator): string {
  const day = entry.toDay ?? entry.fromDay;
  const { action, delta } = describeChangeEntry(entry, tx);
  const dayLabel = day === null ? "" : tx.date.weekdayDate(day);
  return `<li class="change-entry"><span class="change-day">${escapeHtml(dayLabel)}</span><span class="change-what"><span class="change-act">${escapeHtml(action)}</span> <span class="change-title">${escapeHtml(entry.title)}</span>${delta.length === 0 ? "" : ` <span class="change-delta">${escapeHtml(delta)}</span>`} <span class="change-kind">${escapeHtml(sessionKindLabel(entry.kind, tx))}</span></span></li>`;
}

/** The question the runner actually asks: what changed on which day, not the raw coach log. */
function discussMessageFor(changeSet: ChangeSet, tx: Translator): string {
  const count = changeSet.entries.length;
  const range = changeRange(changeSet, tx);
  if (count === 1) {
    const entry = changeSet.entries[0];
    const day = entry === undefined ? null : entry.toDay ?? entry.fromDay;
    if (entry !== undefined && day !== null) return tx.t("changes.discussOne", { title: entry.title, day: tx.date.weekdayDate(day) });
  }
  if (count > 1 && range.length > 0) {
    return tx.t("changes.discussMany", { count, unit: tx.t("changes.unitOther"), when: range });
  }
  return tx.t("changes.discussGeneric");
}

/**
 * The runner-facing change history. Each batch is a human sentence, a short list of what moved, and an Undo whose
 * label carries the blast radius. The raw coach summary stays in the store and the prompt; it is not UI copy.
 */
interface RecentChangesCardOptions {
  readonly headingKey?: MessageKey;
}

function recentChangesCard(
  changeSets: readonly ChangeSet[],
  next: string,
  tx: Translator,
  today: string,
  timezone: string,
  options: RecentChangesCardOptions = {},
): string {
  const heading = `<h2>${escapeHtml(tx.t(options.headingKey ?? "changes.title"))}</h2>`;
  if (changeSets.length === 0) {
    return `<section class="card" id="recent-changes">${heading}<p class="muted small">${escapeHtml(tx.t("changes.empty"))}</p></section>`;
  }
  const rows = changeSets.map((set, index) => {
    const undone = set.revertedAt !== null;
    const headline = changeHeadline(set, tx);
    const count = set.entries.length;
    const unit = count === 1 ? tx.t("changes.unitOne") : tx.t("changes.unitOther");
    const badge = undone ? ` <span class="change-badge">${escapeHtml(tx.t("changes.undoneBadge"))}</span>` : "";
    const meta = `<span class="change-meta muted small">${escapeHtml(changeMeta(set, today, timezone, tx))}${badge}</span>`;
    const sorted = [...set.entries].sort((left, right) => (left.toDay ?? left.fromDay ?? "").localeCompare(right.toDay ?? right.fromDay ?? ""));
    const entryRows = sorted.map((entry) => changeEntryRow(entry, tx));
    const visible = entryRows.slice(0, 3);
    const hidden = entryRows.slice(3);
    const list = visible.length === 0 ? "" : `<ul class="change-entries">${visible.join("")}</ul>`;
    const more = hidden.length === 0
      ? ""
      : `<details class="change-more"><summary>${escapeHtml(tx.t("changes.showAll", { count: entryRows.length }))}</summary><ul class="change-entries">${hidden.join("")}</ul></details>`;
    const helpId = `rc-change-help-${index}`;
    const askWhy = `<button type="button" class="change-ask" title="${escapeHtml(tx.t("changes.discussTitle"))}" aria-label="${escapeHtml(`${tx.t("changes.askWhy")} — ${headline.text}`)}" aria-describedby="${helpId}" data-coach-message="${escapeHtml(discussMessageFor(set, tx))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "discuss-change", changeSetId: set.changeSetId, source: "recent-changes" }))}">${escapeHtml(tx.t("changes.askWhy"))}</button><span class="sr-only" id="${helpId}">${escapeHtml(tx.t("changes.discussTitle"))}</span>`;
    const isRevert = headline.action === "revert";
    const undoLabel = isRevert
      ? tx.t("changes.putItBack")
      : count === 1
        ? tx.t("changes.undoOne")
        : tx.t("changes.undoCount", { count, unit });
    const undoForm = undone
      ? ""
      : `<form method="post" action="/calendar/changes/${encodeURIComponent(set.changeSetId)}/revert" class="change-undo-form" data-change-count="${count}"${isRevert ? ` data-change-putback="1"` : ""}><input type="hidden" name="next" value="${escapeHtml(next)}"><button class="btn ghost" type="submit" aria-label="${escapeHtml(`${undoLabel} — ${headline.text}`)}">${escapeHtml(undoLabel)}</button></form>`;
    return `<li class="change-item${undone ? " undone" : ""}" data-change-set="${escapeHtml(set.changeSetId)}"><div class="change-head"><strong>${escapeHtml(headline.text)}</strong>${meta}</div>${list}${more}<div class="change-actions">${undoForm}${askWhy}</div></li>`;
  }).join("");
  return `<section class="card" id="recent-changes">${heading}<p class="muted small">${escapeHtml(tx.t("changes.footnote"))}</p><ul class="change-list">${rows}</ul></section>`;
}

/** The standalone all-changes page: schedule batches, runs and muscle events in one place. */
type ChangesFilter = "all" | "schedule" | "activity" | "muscle";

const CHANGES_FILTERS: readonly ChangesFilter[] = ["all", "schedule", "activity", "muscle"];

function changesFilterHref(filter: ChangesFilter): string {
  return filter === "all" ? "/changes" : `/changes?type=${filter}`;
}

interface ChangesCounts {
  readonly all: number;
  readonly schedule: number;
  readonly activity: number;
  readonly muscle: number;
}

function changesFilterBar(filter: ChangesFilter, counts: ChangesCounts, tx: Translator): string {
  const labels: Record<ChangesFilter, MessageKey> = {
    all: "changes.filterAll",
    schedule: "changes.filterSchedule",
    activity: "changes.filterActivity",
    muscle: "changes.filterMuscle",
  };
  const links = CHANGES_FILTERS.map((key) => {
    const active = key === filter;
    return `<a class="filter-pill${active ? " active" : ""}" href="${changesFilterHref(key)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(tx.t(labels[key]))} <span class="filter-count">${counts[key]}</span></a>`;
  }).join("");
  return `<nav class="filter-bar" aria-label="${escapeHtml(tx.t("changes.filterAria"))}">${links}</nav>`;
}

function eventHead(action: string, meta: string): string {
  return `<div class="event-head"><strong>${escapeHtml(action)}</strong><span class="event-meta muted small">${escapeHtml(meta)}</span></div>`;
}

function activityEventRow(activity: Activity, today: string, timezone: string, tx: Translator): string {
  const action = activity.source === "garmin" ? tx.t("changes.activitySynced") : tx.t("changes.activityLogged");
  const meta = timeMeta(activity.createdAt, today, timezone, tx);
  const day = tx.date.weekdayDate(activity.day);
  const metrics = activityMetrics(activity);
  const source = activitySourceLabel(activity, tx);
  const title = activity.title.trim().length > 0 ? activity.title : day;
  const href = `/activity/${encodeURIComponent(activity.activityId)}`;
  const detail = `<a class="event-day" href="/day/${escapeHtml(activity.day)}">${escapeHtml(day)}</a> · <a class="event-link" href="${href}">${escapeHtml(title)}</a>${metrics.length === 0 ? "" : ` · ${escapeHtml(metrics)}`} <span class="chip source-${escapeHtml(activity.source)}">${escapeHtml(source)}</span>`;
  const more = `<a class="chip" href="${href}" aria-label="${escapeHtml(`${tx.t("activity.detail")} — ${title} · ${day}`)}">${escapeHtml(tx.t("activity.detail"))}</a>`;
  return `<li class="event-item">${eventHead(action, meta)}<p class="event-detail">${detail}</p><div class="event-actions">${more}</div></li>`;
}

function muscleCheckInRow(checkIn: MuscleCheckIn, today: string, timezone: string, tx: Translator): string {
  const meta = timeMeta(checkIn.createdAt, today, timezone, tx);
  const day = tx.date.weekdayDate(checkIn.day);
  const worst = [...checkIn.muscles].sort((left, right) => right.soreness - left.soreness)[0];
  const parts = [tx.t("changes.muscleForDay", { day }), tx.t("changes.muscleCount", { count: checkIn.muscles.length })];
  if (worst !== undefined) {
    const name = tx.t(`muscle.short.${worst.muscleId}` as MessageKey);
    parts.push(tx.t("changes.muscleWorst", { name, level: worst.soreness }));
    const conditions = worst.conditions.map((key) => tx.t(`muscle.condition.${key}.label` as MessageKey)).join(" · ");
    if (conditions.length > 0) parts.push(`(${conditions})`);
  }
  const links = [`<a class="chip" href="/muscle?day=${encodeURIComponent(checkIn.day)}" aria-label="${escapeHtml(`${tx.t("changes.openMuscles")} — ${day}`)}">${escapeHtml(tx.t("changes.openMuscles"))}</a>`];
  if (checkIn.activityId !== null) {
    links.push(`<a class="chip" href="/activity/${encodeURIComponent(checkIn.activityId)}" aria-label="${escapeHtml(`${tx.t("changes.fromRun")} — ${day}`)}">${escapeHtml(tx.t("changes.fromRun"))}</a>`);
  }
  return `<li class="event-item">${eventHead(tx.t("changes.muscleCheckedIn"), meta)}<p class="event-detail">${escapeHtml(parts.join(" · "))}</p><div class="event-actions">${links.join("")}</div></li>`;
}

function muscleControlRow(control: MuscleStatusControl, today: string, timezone: string, tx: Translator): string {
  const name = tx.t(`muscle.short.${control.muscleId}` as MessageKey);
  const resolved = control.resolvedDay !== null;
  const action = tx.t(resolved ? "changes.muscleStatusResolved" : control.hold ? "changes.muscleStatusHeld" : "changes.muscleStatusReleased");
  const detail = resolved
    ? tx.t("changes.muscleStatusResolvedDetail", { name, day: tx.date.weekdayDate(control.resolvedDay ?? control.updatedAt.slice(0, 10)) })
    : tx.t(control.hold ? "changes.muscleStatusHeldDetail" : "changes.muscleStatusReleasedDetail", { name });
  const meta = timeMeta(control.updatedAt, today, timezone, tx);
  const link = `<a class="chip" href="/muscle?focus=${encodeURIComponent(control.muscleId)}#check-in" aria-label="${escapeHtml(`${tx.t("changes.openMuscles")} — ${name}`)}">${escapeHtml(tx.t("changes.openMuscles"))}</a>`;
  return `<li class="event-item">${eventHead(action, meta)}<p class="event-detail">${escapeHtml(detail)}</p><div class="event-actions">${link}</div></li>`;
}

interface ChangesPageInput {
  readonly scheduleCard: string;
  readonly scheduleCount: number;
  readonly activities: readonly Activity[];
  readonly checkIns: readonly MuscleCheckIn[];
  readonly controls: readonly MuscleStatusControl[];
  readonly filter: ChangesFilter;
  readonly tx: Translator;
  readonly today: string;
  readonly timezone: string;
}

function renderChangesPage(input: ChangesPageInput): string {
  const { scheduleCard, scheduleCount, activities, checkIns, controls, filter, tx, today, timezone } = input;
  const counts: ChangesCounts = {
    all: scheduleCount + activities.length + checkIns.length + controls.length,
    schedule: scheduleCount,
    activity: activities.length,
    muscle: checkIns.length + controls.length,
  };
  const head = `<header class="page-head"><p class="eyebrow">${escapeHtml(tx.t("changes.allEyebrow"))}</p><h1>${escapeHtml(tx.t("changes.allTitle"))}</h1><p class="muted">${escapeHtml(tx.t("changes.allIntro"))}</p></header>`;
  const filters = changesFilterBar(filter, counts, tx);
  const summaryText = filter === "all"
    ? tx.t("changes.allSummary", { count: counts.all })
    : tx.t("changes.filterSummary", { shown: counts[filter], total: counts.all });
  const summary = `<p class="changes-summary muted small">${escapeHtml(summaryText)}</p>`;
  if (counts.all === 0) {
    return `${head}${filters}${summary}<section class="card changes-empty-card"><p class="muted">${escapeHtml(tx.t("changes.allEmpty"))}</p></section>`;
  }
  const sections: string[] = [];
  if (filter === "all" || filter === "schedule") sections.push(scheduleCard);
  if (filter === "all" || filter === "activity") {
    const rows = activities.map((activity) => activityEventRow(activity, today, timezone, tx)).join("");
    sections.push(`<section class="card" id="activity-changes"><h2>${escapeHtml(tx.t("changes.activityTitle"))}</h2>${rows.length === 0 ? `<p class="muted small">${escapeHtml(tx.t("changes.activityEmpty"))}</p>` : `<ul class="event-list">${rows}</ul>`}</section>`);
  }
  if (filter === "all" || filter === "muscle") {
    const events = [
      ...checkIns.map((checkIn) => ({ at: checkIn.createdAt, row: muscleCheckInRow(checkIn, today, timezone, tx) })),
      ...controls.map((control) => ({ at: control.updatedAt, row: muscleControlRow(control, today, timezone, tx) })),
    ].sort((left, right) => right.at.localeCompare(left.at));
    const rows = events.map((event) => event.row).join("");
    sections.push(`<section class="card" id="muscle-changes"><h2>${escapeHtml(tx.t("changes.muscleTitle"))}</h2>${rows.length === 0 ? `<p class="muted small">${escapeHtml(tx.t("changes.muscleEmpty"))}</p>` : `<ul class="event-list">${rows}</ul>`}</section>`);
  }
  return `${head}${filters}${summary}${sections.join("")}<p class="muted small changes-footnote">${escapeHtml(tx.t("changes.allFootnote"))}</p>`;
}

type HistoryView = "week" | "month" | "year";

function addMonths(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (mon ?? 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function formatMonthLabel(month: string, date: DateFormat = defaultTranslator.date): string {
  return date.monthLabel(month);
}

function formatWeekRange(start: string, date: DateFormat = defaultTranslator.date): string {
  const end = addDays(start, 6);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const range = sameMonth ? `${Number(start.slice(8, 10))}–${formatShortDate(end, date)}` : `${formatShortDate(start, date)} – ${formatShortDate(end, date)}`;
  return `${range} ${end.slice(0, 4)}`;
}

function historyHref(view: HistoryView, period: string): string {
  return `/history?view=${view}&period=${encodeURIComponent(period)}`;
}

function weekStartOf(day: string): string {
  return addDays(day, -weekdayIndex(day));
}

function weekLabel(start: string, date: DateFormat = defaultTranslator.date): string {
  const end = addDays(start, 6);
  if (start.slice(5, 7) === end.slice(5, 7)) return `${Number(start.slice(8, 10))}–${formatShortDate(end, date)}`;
  return `${formatShortDate(start, date)} – ${formatShortDate(end, date)}`;
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
function rpeWord(rpe: number, tx: Translator = defaultTranslator): string {
  return tx.t(rpe >= 7 ? "rpe.hard" : rpe >= 4 ? "rpe.moderate" : "rpe.easy");
}

/**
 * The runner's own effort line for a run they rated, e.g. "Felt 7/10 - hard". Runs logged before the field existed
 * leave it undefined and skipped runs store null; both simply show nothing.
 */
function feltText(activity: Activity, tx: Translator = defaultTranslator): string | null {
  const rpe = activity.rpe ?? null;
  return typeof rpe === "number" && Number.isFinite(rpe) && rpe >= 0 && rpe <= 10
    ? tx.t("activity.feltLine", { rpe, word: rpeWord(rpe, tx) })
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
function runReviewCard(activity: Activity, eyebrow: string, tx: Translator = defaultTranslator): string {
  return `<section class="card review-card"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(activity.title)}</h2><p class="muted">${escapeHtml(formatDayLabel(activity.day, tx.date))} · ${escapeHtml(activityMetrics(activity))}</p><div class="review-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(coachPromptForActivity(activity))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-activity", activityId: activity.activityId, source: "auto-sync" }))}">${escapeHtml(tx.t("review.coachAsk"))}</button><a class="chip" href="/muscle?activity=${encodeURIComponent(activity.activityId)}">${escapeHtml(tx.t("review.muscle"))}</a><a class="chip" href="/activity/${encodeURIComponent(activity.activityId)}">${escapeHtml(tx.t("review.detail"))}</a></div></section>`;
}

/** The review param a manual log redirect carries, resolved to the stored run; a foreign or stale id shows nothing. */
function manualReviewCardFor(store: Store, userId: string, params: URLSearchParams, tx: Translator = defaultTranslator): string {
  const reviewId = params.get("review");
  if (reviewId === null) return "";
  const activity = store.getActivity(userId, reviewId);
  return activity === undefined ? "" : runReviewCard(activity, tx.t("review.eyebrowLogged"), tx);
}

/**
 * The review card a redirect can offer on the calendar and the day page: the run a sync just imported, else the run
 * a manual log just stored. The two flows never share one redirect, so at most one card renders.
 */
function redirectReviewCardFor(store: Store, userId: string, params: URLSearchParams, tx: Translator = defaultTranslator): string {
  const newestId = params.get("newest");
  if (newestId !== null) {
    const activity = store.getActivity(userId, newestId);
    if (activity !== undefined) return runReviewCard(activity, tx.t("review.eyebrowSynced"), tx);
  }
  return manualReviewCardFor(store, userId, params, tx);
}

/**
 * What one week card says about a day with nothing recorded. A rest day, a day that has not arrived yet, or a day
 * that is simply after the last Garmin import is not a missed run; only a past, imported day says so, and without
 * scolding.
 */
function dayEmptyStateHtml(day: string, daySessions: readonly TrainingSession[], today: string, awaitingGarmin: boolean, tx: Translator = defaultTranslator): string {
  if (daySessions.length === 0) return `<p class="muted small">${escapeHtml(tx.t("empty.none"))}</p>`;
  if (daySessions.every((session) => session.kind === "rest")) return `<p class="muted small">${escapeHtml(tx.t("empty.rest"))}</p>`;
  if (day >= today) return `<p class="muted small">${escapeHtml(tx.t("empty.upcoming"))}</p>`;
  if (awaitingGarmin) {
    return `<div class="history-missed"><span class="muted">${escapeHtml(tx.t("empty.awaitingGarmin"))}</span></div>`;
  }
  return `<div class="history-missed"><span class="muted">${escapeHtml(tx.t("empty.noRunLogged"))}</span><a class="chip" href="/day/${escapeHtml(day)}#log-run">${escapeHtml(tx.t("empty.logRun"))}</a><button type="button" class="coach-ask" data-coach-message="${escapeHtml(coachPromptForMissed(day, daySessions))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-day", day, source: "history" }))}">${escapeHtml(tx.t("coach.ask"))}</button></div>`;
}

/**
 * The consultative load warning for a rising week: the runner's own numbers first, then the decision handed back.
 * The muted note beside it keeps the load computation's honesty labels.
 */
function loadWarningText(load: LoadSummary, tx: Translator = defaultTranslator): string {
  const bits: string[] = [];
  if (load.weekChangePct !== null) bits.push(`${load.weekChangePct > 0 ? "+" : ""}${load.weekChangePct}% ${tx.t("loadwarn.versusLastWeek")}`);
  if (load.acwr !== null) bits.push(`ACWR ${load.acwr.toFixed(2)}`);
  const detail = bits.length === 0 ? "" : ` (${bits.join(", ")})`;
  return load.signal === "high"
    ? tx.t("loadwarn.high", { detail })
    : tx.t("loadwarn.ramping", { detail });
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

function activityExtraItems(activity: Activity, tx: Translator = defaultTranslator): ActivityMetricItem[] {
  const items: ActivityMetricItem[] = [];
  pushMetricItem(items, tx.t("metric.elevation"), activity.elevationGainM, "m", "+");
  pushMetricItem(items, tx.t("metric.calories"), activity.calories, "kcal");
  pushMetricItem(items, tx.t("metric.maxHr"), activity.maxHr, "bpm");
  pushMetricItem(items, tx.t("metric.cadence"), activity.cadenceSpm, "spm");
  pushMetricItem(items, tx.t("metric.stride"), activity.strideLengthCm, "cm");
  pushMetricItem(items, tx.t("metric.groundContact"), activity.groundContactMs, "ms");
  pushMetricItem(items, tx.t("metric.aerobicEffect"), activity.aerobicTrainingEffect, "");
  pushMetricItem(items, tx.t("metric.anaerobicEffect"), activity.anaerobicTrainingEffect, "");
  pushMetricItem(items, tx.t("metric.trainingLoad"), activity.trainingLoad, "");
  if (activity.trainingEffectLabel !== null && activity.trainingEffectLabel !== undefined && activity.trainingEffectLabel.length > 0) {
    items.push({ label: tx.t("metric.effect"), value: humanizeEffect(activity.trainingEffectLabel) });
  }
  const felt = feltText(activity, tx);
  if (felt !== null) items.push({ label: tx.t("metric.felt"), value: felt });
  return items;
}

function activityExtraMetrics(activity: Activity, tx: Translator = defaultTranslator): string {
  const items = activityExtraItems(activity, tx);
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

function splitsSection(splits: readonly ActivitySplit[], error: string | null, tx: Translator = defaultTranslator): string {
  const title = escapeHtml(tx.t("splits.cardTitle"));
  if (error !== null) {
    return `<section class="card splits-card"><h2>${title}</h2><p class="muted small">${escapeHtml(error)}</p></section>`;
  }
  if (splits.length === 0) {
    return `<section class="card splits-card"><h2>${title}</h2><p class="muted small">${escapeHtml(tx.t("splits.empty"))}</p></section>`;
  }
  const rows = splits.map((split) => `<div class="split-row" role="row"><span>${split.partial ? `${split.distanceKm} km` : `${split.index} km`}</span><span>${formatSeconds(split.durationSec)}</span><span>${formatPace(split.paceSecPerKm)}</span><span>${split.avgHr === null ? "—" : `${split.avgHr} bpm`}</span></div>`).join("");
  return `<section class="card splits-card"><div class="splits-head"><h2>${title}</h2><p class="muted small">${escapeHtml(tx.t("splits.note"))}</p></div><div class="splits-table" role="table" aria-label="${title}"><div class="split-row split-header" role="row"><span>${escapeHtml(tx.t("splits.colKm"))}</span><span>${escapeHtml(tx.t("col.time"))}</span><span>${escapeHtml(tx.t("col.pace"))}</span><span>${escapeHtml(tx.t("splits.colAvgHr"))}</span></div>${rows}</div></section>`;
}

function lapsSection(laps: readonly ActivityLap[], error: string | null, tx: Translator = defaultTranslator): string {
  const title = escapeHtml(tx.t("laps.cardTitle"));
  if (error !== null) {
    return `<section class="card laps-card"><h2>${title}</h2><p class="muted small">${escapeHtml(error)}</p></section>`;
  }
  if (laps.length === 0) return "";
  const rows = laps.map((lap) => `<div class="lap-row" role="row"><span>#${lap.index} · ${escapeHtml(lap.type)}</span><span>${lap.distanceKm} km</span><span>${formatSeconds(lap.durationSec)}</span><span>${formatPace(lap.paceSecPerKm)}</span><span>${lap.avgHr === null ? "—" : `${lap.avgHr} bpm`}</span></div>`).join("");
  return `<section class="card laps-card"><div class="splits-head"><h2>${title}</h2><p class="muted small">${escapeHtml(tx.t("laps.note"))}</p></div><div class="laps-table" role="table" aria-label="${escapeHtml(tx.t("laps.aria"))}"><div class="lap-row lap-header" role="row"><span>${escapeHtml(tx.t("laps.colLap"))}</span><span>${escapeHtml(tx.t("laps.colDist"))}</span><span>${escapeHtml(tx.t("col.time"))}</span><span>${escapeHtml(tx.t("col.pace"))}</span><span>${escapeHtml(tx.t("laps.colHr"))}</span></div>${rows}</div></section>`;
}

/**
 * The Garmin workout a run followed. A fetch failure is a muted note, never a broken detail page, and a run that followed
 * no planned workout simply has no card.
 */
function workoutSection(workout: ActivityWorkout | null, error: string | null, tx: Translator = defaultTranslator): string {
  const eyebrow = escapeHtml(tx.t("workout.eyebrow"));
  const title = escapeHtml(tx.t("workout.cardTitle"));
  if (error !== null) {
    return `<section class="card workout-card"><div class="workout-head"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div></div><p class="muted small">${escapeHtml(error)}</p></section>`;
  }
  if (workout === null || workout.status !== "ok") return "";
  const rows = workout.steps
    .map((step) => `<div class="workout-row" role="row"><span>${step.index}</span><span>${escapeHtml(step.intensity)}</span><span>${escapeHtml(step.duration)}</span><span>${escapeHtml(step.target ?? "—")}</span></div>`)
    .join("");
  const name = workout.name === null ? "" : `<p class="workout-name">${escapeHtml(workout.name)}</p>`;
  const summary = workout.summary.length === 0 ? "" : `<p class="workout-summary">${escapeHtml(workout.summary)}</p>`;
  const notes = workout.notes === null ? "" : `<p class="workout-notes">${escapeHtml(workout.notes)}</p>`;
  const stepChip = tx.t(workout.steps.length === 1 ? "workout.stepOne" : "workout.stepOther");
  return `<section class="card workout-card"><div class="workout-head"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div><span class="chip program-chip">${workout.steps.length} ${escapeHtml(stepChip)}</span></div>${name}${summary}<div class="workout-table" role="table" aria-label="${escapeHtml(tx.t("workout.aria"))}"><div class="workout-row workout-header" role="row"><span>#</span><span>${escapeHtml(tx.t("workout.colStep"))}</span><span>${escapeHtml(tx.t("workout.colDuration"))}</span><span>${escapeHtml(tx.t("workout.colTarget"))}</span></div>${rows}</div>${notes}</section>`;
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

function hrZonesSection(activity: Activity, tx: Translator = defaultTranslator): string {  const zones = [
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
  return `<section class="card hr-zones-card"><div class="splits-head"><h2>${escapeHtml(tx.t("hrzones.cardTitle"))}</h2><p class="muted small">${escapeHtml(tx.t("hrzones.note"))}</p></div><div class="zone-bar" role="img" aria-label="${escapeHtml(tx.t("hrzones.aria"))}">${segments}</div><div class="zone-legend">${legend}</div></section>`;
}

function periodBestsCard(periodLabel: string, bests: readonly PersonalBest[], tx: Translator = defaultTranslator): string {
  const items = bests.length === 0
    ? `<p class="muted small">${escapeHtml(tx.t("besteffort.empty"))}</p>`
    : `<div class="best-efforts">${bests.map((best) => `<div class="best-effort"><span>${bestEffortLabel(best.distance)}</span><strong>${formatSeconds(best.seconds)}</strong><small>${escapeHtml(formatShortDate(best.activity.day, tx.date))} · ${escapeHtml(best.activity.title)}</small></div>`).join("")}</div>`;
  return `<section class="card best-efforts-card"><div class="splits-head"><h2>${escapeHtml(tx.t("besteffort.title"))}</h2><p class="muted small">${escapeHtml(periodLabel)} · ${escapeHtml(tx.t("besteffort.subtitle"))}</p></div>${items}<p class="muted small best-scope">${escapeHtml(tx.t("besteffort.scope"))}</p></section>`;
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
function planMatchBadge(match: ActivityPlanMatch, tx: Translator = defaultTranslator): string {
  if (match.session === null) return tx.t("plan.badgeUnplanned");
  const delta = match.distanceDeltaKm;
  if (delta === null) {
    if (match.status === "short") return tx.t("plan.badgeShorter");
    if (match.status === "long") return tx.t("plan.badgeLonger");
    return tx.t("plan.badgeOnPlan");
  }
  if (match.status === "on-plan") {
    return tx.t("plan.badgeOnPlanDelta", { sign: delta > 0 ? "+" : delta < 0 ? "-" : "+", delta: Math.abs(delta).toFixed(1) });
  }
  return tx.t(match.status === "short" ? "plan.badgeShort" : "plan.badgeOver", { delta: Math.abs(delta).toFixed(1) });
}

function matchLabel(match: ActivityPlanMatch | undefined, tx: Translator = defaultTranslator): string {
  if (match === undefined) return `<span class="chip match-unplanned">${escapeHtml(tx.t("plan.badgeUnplanned"))}</span>`;
  const title = match.session === null ? "" : ` title="${escapeHtml(tx.t("plan.plannedTitle", { title: match.session.title }))}"`;
  return `<span class="chip match-${match.status}"${title}>${escapeHtml(planMatchBadge(match, tx))}</span>`;
}

function planDistanceBar(match: ActivityPlanMatch, tx: Translator = defaultTranslator): string {
  if (match.session === null || match.session.distanceKm === null || match.activity.distanceKm === null) return "";
  const planned = match.session.distanceKm;
  const actual = match.activity.distanceKm;
  const max = Math.max(planned, actual, 1);
  const plannedWidth = Math.round((planned / max) * 100);
  const actualWidth = Math.round((actual / max) * 100);
  return `<div class="plan-bar" role="img" aria-label="${escapeHtml(tx.t("plan.barAria", { planned, actual }))}">
    <div class="plan-bar-row"><span>${escapeHtml(tx.t("plan.barPlan"))}</span><div class="plan-bar-track"><span class="plan-bar-fill plan-bar-plan" style="width:${plannedWidth}%"></span></div><strong>${planned} km</strong></div>
    <div class="plan-bar-row"><span>${escapeHtml(tx.t("plan.barActual"))}</span><div class="plan-bar-track"><span class="plan-bar-fill plan-bar-actual" style="width:${actualWidth}%"></span></div><strong>${actual} km</strong></div>
  </div>`;
}

function planComparison(match: ActivityPlanMatch, tx: Translator = defaultTranslator): string {
  if (match.session === null) {
    return `<section class="card plan-compare"><h2>${escapeHtml(tx.t("plan.compareTitle"))}</h2><p class="muted">${escapeHtml(tx.t("plan.compareNoMatch"))}</p></section>`;
  }
  const status = tx.t(match.status === "on-plan" ? "plan.statusOnPlan" : match.status === "short" ? "plan.statusShort" : "plan.statusLong");
  return `<section class="card plan-compare"><h2>${escapeHtml(tx.t("plan.compareTitle"))}</h2>
    <div class="plan-compare-grid">
      <div><span class="muted small">${escapeHtml(tx.t("plan.sidePlanned"))}</span><strong>${escapeHtml(match.session.title)}</strong><p class="muted">${escapeHtml(sessionKindLabel(match.session.kind, tx))}${match.session.distanceKm === null ? "" : ` · ${match.session.distanceKm} km`}${match.session.durationMin === null ? "" : ` · ${formatMinutes(match.session.durationMin)}`}</p></div>
      <div><span class="muted small">${escapeHtml(tx.t("plan.sideActual"))}</span><strong>${escapeHtml(match.activity.title)}</strong><p class="muted">${escapeHtml(activityMetrics(match.activity))}</p></div>
    </div>
    <div class="plan-deltas"><span class="chip match-${match.status}">${escapeHtml(status)}</span><span>${escapeHtml(tx.t("plan.distance"))} ${escapeHtml(formatDelta(match.distanceDeltaKm, "km"))}</span><span>${escapeHtml(tx.t("plan.duration"))} ${escapeHtml(formatDelta(match.durationDeltaMin, "min"))}</span></div>
    ${planDistanceBar(match, tx)}
  </section>`;
}

/** The six run metrics a calendar peek shows; the activity detail keeps the full list. */
const PEEK_METRIC_LIMIT = 6;

function activityPeekMetrics(activity: Activity, tx: Translator = defaultTranslator): ActivityMetricItem[] {
  const items: ActivityMetricItem[] = [];
  pushMetricItem(items, tx.t("metric.trainingLoad"), activity.trainingLoad, "");
  if (activity.trainingEffectLabel !== null && activity.trainingEffectLabel !== undefined && activity.trainingEffectLabel.length > 0) {
    items.push({ label: tx.t("metric.effect"), value: humanizeEffect(activity.trainingEffectLabel) });
  }
  const felt = feltText(activity, tx);
  if (felt !== null) items.push({ label: tx.t("metric.felt"), value: felt });
  pushMetricItem(items, tx.t("metric.elevation"), activity.elevationGainM, "m", "+");
  pushMetricItem(items, tx.t("metric.calories"), activity.calories, "kcal");
  pushMetricItem(items, tx.t("metric.maxHr"), activity.maxHr, "bpm");
  pushMetricItem(items, tx.t("metric.cadence"), activity.cadenceSpm, "spm");
  return items.slice(0, PEEK_METRIC_LIMIT);
}

interface ActivityPeekPlan {
  status: ActivityPlanMatch["status"];
  label: string;
  title: string | null;
  planned: string | null;
}

function activityPeekPlan(match: ActivityPlanMatch, tx: Translator = defaultTranslator): ActivityPeekPlan {
  if (match.session === null) {
    return { status: "unplanned", label: tx.t("plan.badgeUnplanned"), title: null, planned: null };
  }
  const statusLabel = tx.t(match.status === "on-plan" ? "peek.statusOnPlan" : match.status === "short" ? "peek.statusShort" : "peek.statusLong");
  const delta = match.distanceDeltaKm === null || match.distanceDeltaKm === 0
    ? ""
    : ` ${formatDelta(match.distanceDeltaKm, "km")}`;
  const planned = [
    sessionKindLabel(match.session.kind, tx),
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
  tx: Translator = defaultTranslator,
): ActivityPeek {
  return {
    activityId: activity.activityId,
    title: activity.title,
    day: activity.day,
    dayLabel: formatDayLabel(activity.day, tx.date),
    source: activity.source,
    sourceLabel: activitySourceLabel(activity, tx),
    metrics: activityMetrics(activity),
    extra: activityPeekMetrics(activity, tx),
    efforts: fastestEffortItems(activity, prDistances).map((effort) => ({
      label: effort.label,
      value: formatSeconds(effort.seconds),
      pr: effort.pr,
    })),
    plan: activityPeekPlan(matchActivity(activity, sessions), tx),
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
const SESSION_KIND_KEYS: Record<SessionKind, MessageKey> = {
  easy: "session.kind.easy",
  long: "session.kind.long",
  interval: "session.kind.interval",
  tempo: "session.kind.tempo",
  rest: "session.kind.rest",
  cross: "session.kind.cross",
  race: "session.kind.race",
  racewalk: "session.kind.racewalk",
};

function sessionKindLabel(kind: SessionKind, tx: Translator = defaultTranslator): string {
  return tx.t(SESSION_KIND_KEYS[kind]);
}

interface SessionIntentKeys {
  readonly purpose: MessageKey;
  readonly effort: MessageKey;
}

const SESSION_INTENT_KEYS: Record<SessionKind, SessionIntentKeys> = {
  easy: { purpose: "session.intent.purpose.easy", effort: "session.intent.effort.easy" },
  long: { purpose: "session.intent.purpose.long", effort: "session.intent.effort.long" },
  tempo: { purpose: "session.intent.purpose.tempo", effort: "session.intent.effort.tempo" },
  interval: { purpose: "session.intent.purpose.interval", effort: "session.intent.effort.interval" },
  race: { purpose: "session.intent.purpose.race", effort: "session.intent.effort.race" },
  rest: { purpose: "session.intent.purpose.rest", effort: "session.intent.effort.rest" },
  cross: { purpose: "session.intent.purpose.cross", effort: "session.intent.effort.cross" },
  racewalk: { purpose: "session.intent.purpose.racewalk", effort: "session.intent.effort.racewalk" },
};

const SESSION_INTENT_FALLBACK: SessionIntentKeys = {
  purpose: "session.intent.purpose.fallback",
  effort: "session.intent.effort.fallback",
};

/** What the session is for and how hard it should feel, in the runner's language rather than a pace table. */
function sessionIntent(
  session: TrainingSession,
  tx: Translator = defaultTranslator,
): { purpose: string; effort: string } {
  const keys = SESSION_INTENT_KEYS[session.kind] ?? SESSION_INTENT_FALLBACK;
  return { purpose: tx.t(keys.purpose), effort: tx.t(keys.effort) };
}

/** Server-rendered intent lines for the day page and the session peek. */
function sessionIntentHtml(session: TrainingSession, tx: Translator = defaultTranslator): string {
  const intent = sessionIntent(session, tx);
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
  tx: Translator = defaultTranslator,
): SessionPeekOutcome {
  if (session.kind === "rest") {
    const recorded = activities[0];
    if (recorded === undefined) {
      return { status: "rest", label: tx.t("peek.outcomeRest"), detail: tx.t("peek.restDetail"), activityId: null };
    }
    const metrics = activityMetrics(recorded);
    const summary = `${recorded.title}${metrics.length === 0 ? "" : ` · ${metrics}`}`;
    return {
      status: "rest",
      label: tx.t("peek.outcomeRest"),
      detail: tx.t("peek.restRecorded", { detail: summary }),
      activityId: recorded.activityId,
    };
  }
  const match = matchActivitiesToPlan(activities, sessions)
    .find((candidate) => candidate.session?.sessionId === session.sessionId);
  if (match !== undefined) {
    const statusLabel = tx.t(match.status === "on-plan" ? "peek.statusOnPlan" : match.status === "short" ? "peek.statusShort" : "peek.statusLong");
    const delta = match.distanceDeltaKm === null || match.distanceDeltaKm === 0 ? "" : ` ${formatDelta(match.distanceDeltaKm, "km")}`;
    const metrics = activityMetrics(match.activity);
    return {
      status: "completed",
      label: tx.t("peek.completed", { status: statusLabel, delta }),
      detail: metrics.length === 0 ? match.activity.title : `${match.activity.title} · ${metrics}`,
      activityId: match.activity.activityId,
    };
  }
  const recorded = activities[0];
  if (recorded !== undefined) {
    const metrics = activityMetrics(recorded);
    const summary = `${recorded.title}${metrics.length === 0 ? "" : ` · ${metrics}`}`;
    return {
      status: "unmatched",
      label: tx.t("peek.notMatched"),
      detail: activities.length === 1
        ? tx.t("peek.recorded", { detail: summary })
        : tx.t("peek.notMatchedMany"),
      activityId: activities.length === 1 ? recorded.activityId : null,
    };
  }
  if (session.day < today) {
    return { status: "missed", label: tx.t("peek.notDone"), detail: tx.t("peek.missedDetail"), activityId: null };
  }
  if (session.day === today) {
    return { status: "upcoming", label: tx.t("peek.today"), detail: tx.t("peek.todayDetail"), activityId: null };
  }
  return { status: "upcoming", label: tx.t("peek.upcoming"), detail: null, activityId: null };
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
  tx: Translator = defaultTranslator,
): SessionPeek {
  const outcome = sessionPeekOutcome(session, sessions, activities, today, tx);
  return {
    sessionId: session.sessionId,
    title: session.title,
    day: session.day,
    dayLabel: formatDayLabel(session.day, tx.date),
    kind: session.kind,
    kindLabel: sessionKindLabel(session.kind, tx),
    metrics: sessionMetrics(session),
    note: session.note,
    intent: sessionIntent(session, tx),
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
function trendChart(activities: readonly Activity[], metric: TrendMetric, periodLabel: string, tx: Translator = defaultTranslator): string {
  const points = trendPoints(activities, metric);
  const metricTitle = tx.t(`history.trend.metricTitle.${metric.key}` as const);
  const caption = `<figcaption>${escapeHtml(metricTitle)} <span class="muted small">${escapeHtml(tx.t("history.runCount", { count: points.length }))}</span></figcaption>`;
  if (points.length < 2) {
    const labelWord = tx.t(`history.trend.metric.${metric.key}` as const).toLowerCase();
    return `<figure class="trend-panel" data-metric="${metric.key}">${caption}<p class="muted small">${escapeHtml(tx.t("history.trend.needTwo", { label: labelWord, period: periodLabel }))}</p></figure>`;
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
  return `<figure class="trend-panel" data-metric="${metric.key}">${caption}<svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="trend-chart" role="img" aria-label="${escapeHtml(tx.t("history.trend.chartAria", { title: metricTitle, period: periodLabel }))}"><text x="2" y="${(padTop + 4).toFixed(1)}" class="trend-axis">${escapeHtml(topLabel)}</text><text x="2" y="${(padTop + plotHeight).toFixed(1)}" class="trend-axis">${escapeHtml(bottomLabel)}</text><polyline points="${line}" class="trend-line"></polyline>${dots}<text x="${padLeft}" y="${chartHeight - 6}" class="trend-axis">${escapeHtml(firstLabel)}</text>${middleText}<text x="${chartWidth - padRight}" y="${chartHeight - 6}" text-anchor="end" class="trend-axis">${escapeHtml(lastLabel)}</text></svg><p class="trend-note">${escapeHtml(periodLabel)} · ${escapeHtml(firstValue)} → ${escapeHtml(lastValue)}</p></figure>`;
}

/**
 * The single trend graph: one radio chip per metric and one pre-rendered panel each. The CSS shows the checked panel,
 * so the switch is instant, keyboard accessible and works without a script; a browser without `:has()` keeps the
 * default panel visible instead of hiding every panel.
 */
function trendPicker(activities: readonly Activity[], periodLabel: string, tx: Translator = defaultTranslator): string {
  const withData = TREND_METRICS.filter((metric) => trendPoints(activities, metric).length >= 2);
  const defaultMetric = withData[0] ?? TREND_METRICS[0];
  const chips = TREND_METRICS.map((metric) => {
    const checked = metric.key === defaultMetric?.key ? " checked" : "";
    return `<input class="trend-radio" type="radio" name="trend-metric" id="trend-metric-${metric.key}" value="${metric.key}"${checked}><label class="trend-chip" for="trend-metric-${metric.key}">${escapeHtml(tx.t(`history.trend.metric.${metric.key}` as const))}</label>`;
  }).join("");
  const panels = TREND_METRICS.map((metric) => trendChart(activities, metric, periodLabel, tx)).join("");
  return `<section class="trend-card trend-picker" data-default="${defaultMetric?.key ?? "pace"}" aria-labelledby="trend-picker-title"><div class="trend-picker-head"><h3 id="trend-picker-title">${escapeHtml(tx.t("history.trend.pickerTitle"))}</h3><p class="muted small">${escapeHtml(tx.t("history.trend.pickerHint"))}</p></div><div class="trend-chips" role="radiogroup" aria-label="${escapeHtml(tx.t("history.trend.pickerAria"))}">${chips}</div><div class="trend-panels">${panels}</div></section>`;
}

function trendSection(
  activities: readonly Activity[],
  buckets: readonly VolumeBucket[],
  consistency: number,
  periodLabel: string,
  volumeTitle: string,
  volumeAria: string,
  consistencyUnit?: string,
  tx: Translator = defaultTranslator,
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
  const noData = escapeHtml(tx.t("history.trend.noData"));
  const summaryRow = (label: string, value: string): string => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const consistencyValue = consistencyUnit === undefined
    ? `${consistency}%`
    : escapeHtml(tx.t("history.trend.ofUnit", { pct: consistency, unit: consistencyUnit }));
  const runCount = escapeHtml(tx.t("history.runCount", { count: activities.length }));
  const windowNote = activities.length > 12 ? `<p class="muted small trend-window">${escapeHtml(tx.t("history.trend.window"))}</p>` : "";
  return `<section class="trends"><div class="trend-head"><h2>${escapeHtml(tx.t("history.trend.title"))}</h2><p class="muted small">${escapeHtml(periodLabel)} · ${runCount}</p>${windowNote}</div><div class="trend-grid">${volumeChart(buckets, volumeTitle, `${sumDistance(activities)} km · ${periodLabel}`, volumeAria)}<figure class="trend-card trend-stats"><figcaption>${escapeHtml(tx.t("history.trend.summary"))}</figcaption><dl>${summaryRow(escapeHtml(tx.t("history.trend.avgPace")), averagePace === null ? noData : escapeHtml(formatPace(averagePace)))}${summaryRow(escapeHtml(tx.t("history.trend.avgHr")), averageHr === null ? noData : `${averageHr} bpm`)}${summaryRow(escapeHtml(tx.t("history.trend.avgCadence")), averageCadence === null ? noData : `${averageCadence} spm`)}${summaryRow(escapeHtml(tx.t("history.trend.consistency")), consistencyValue)}</dl></figure></div>${trendPicker(activities, periodLabel, tx)}</section>`;
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
function renderSyncItem(tx: Translator): string {
  return `<form method="post" action="/sync" class="sync-menu-form" data-sync-form>
    <input type="hidden" name="next" value="/calendar">
    <button class="account-item sync-btn" type="submit" aria-label="${escapeHtml(tx.t("account.syncAria"))}" title="${escapeHtml(tx.t("account.syncTitle"))}"><span aria-hidden="true">⟳</span>${escapeHtml(tx.t("account.syncNow"))}</button>
  </form>`;
}

/** Everything about the signed-in runner, collapsed behind their name so the top bar stays short. */
function renderAccountMenu(user: AuthUser, tx: Translator): string {
  return `<div class="account-wrap">
    <button class="account-btn" id="account-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="account-menu"><span class="account-name">${escapeHtml(user.displayName)}</span><span class="account-caret" aria-hidden="true">▾</span></button>
    <nav class="account-menu" id="account-menu" aria-label="${escapeHtml(tx.t("account.menu.label"))}" hidden>
      <p class="account-id"><strong>${escapeHtml(user.displayName)}</strong><span>@${escapeHtml(user.username)}</span></p>
      <a class="account-item" href="/profile">${escapeHtml(tx.t("account.profile"))}</a>
      <a class="account-item" href="/coach-states">${escapeHtml(tx.t("account.coachStates"))}</a>
      <a class="account-item" href="/changes">${escapeHtml(tx.t("account.changes"))}</a>
      ${renderSyncItem(tx)}
      <a class="account-item" href="/calendar?garmin=setup">${escapeHtml(tx.t("account.garminKey"))}</a>
      <a class="account-item" href="/export.json">${escapeHtml(tx.t("account.export"))}</a>
      <hr class="account-sep">
      <a class="account-item account-signout" href="/logout">${escapeHtml(tx.t("account.signout"))}</a>
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

function renderNotificationBell(tx: Translator): string {
  return `<div class="notif-wrap">
    <button class="icon-btn notif-btn" id="notif-btn" type="button" aria-label="${escapeHtml(tx.t("notif.aria"))}" aria-expanded="false" aria-controls="notif-panel"><span aria-hidden="true">🔔</span><span class="notif-badge" id="notif-badge" hidden>0</span></button>
    <section class="notif-panel" id="notif-panel" hidden aria-label="${escapeHtml(tx.t("notif.title"))}">
      <header><strong>${escapeHtml(tx.t("notif.title"))}</strong><button class="icon-btn" id="notif-close" type="button" aria-label="${escapeHtml(tx.t("notif.close"))}">×</button></header>
      <div class="notif-list" id="notif-list" role="log" aria-live="polite"></div>
      <footer class="notif-footer"><a href="/calendar?garmin=setup">${escapeHtml(tx.t("notif.garminKey"))}</a></footer>
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

    // Localized chrome strings injected by the server (see layout's window.__I18N__). English keeps working if absent.
    const ui = window.__I18N__ || {};
    const interp = (tpl, count) => (typeof tpl === 'string' ? tpl.replace('{count}', String(count)) : '');
    const siteName = document.body.dataset.siteName || 'Milebook';
    const pageContext = document.body.dataset.pageContext || '';
    const timezone = document.body.dataset.timezone || 'UTC';
    const setUnread = (value) => {
      const count = typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      button.setAttribute('aria-label', count === 0
        ? (ui.notifAria || 'Notifications')
        : interp(ui.notifUnread, count) || ('Notifications (' + count + ' unread)'));
      const countSuffix = count === 0 ? '' : ' (' + (count > 99 ? '99+' : count) + ')';
      document.title = (pageContext.length === 0 ? '' : pageContext + ' · ') + siteName + countSuffix;
    };

    const render = (items) => {
      list.replaceChildren();
      if (!Array.isArray(items) || items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'muted small notif-empty';
        empty.textContent = ui.notifEmpty || 'No notifications yet.';
        list.append(empty);
        return;
      }
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const link = document.createElement('a');
        link.className = 'notif-item';
        link.href = typeof item.href === 'string' && item.href.startsWith('/') ? item.href : '/calendar';
        const title = document.createElement('strong');
        title.textContent = typeof item.title === 'string' ? item.title : (ui.notifDefault || 'Garmin sync');
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

/**
 * The attention badge on the Muscles tab: how many muscles are in a special (non-perfect) status, loaded once
 * per page the same way the notification bell loads its unread count. Server-rendered pages keep their honest
 * no-script surface (the muscle tab and the calendar chip carry the same count), so this is pure awareness.
 */
function renderMuscleBadgeScript(): string {
  return `<script>
  (() => {
    const tab = document.querySelector('.view-tab[href="/muscle"]');
    if (tab === null) return;
    const ui = window.__I18N__ || {};
    fetch('/muscle/attention.json', { headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data === null || typeof data !== 'object') return;
        const count = Math.max(0, Math.floor(Number(data.count) || 0));
        if (count === 0) return;
        const badge = document.createElement('span');
        badge.className = 'view-badge';
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.setAttribute('aria-hidden', 'true');
        tab.append(badge);
        const base = ui.muscleTabBase || 'Muscles';
        const suffix = count === 1
          ? (ui.muscleStatusOne || 'muscle in a special status')
          : (ui.muscleStatusOther || 'muscles in a special status');
        tab.setAttribute('aria-label', base + ' — ' + count + ' ' + suffix);
      })
      .catch(() => {
        // Without the count the tab is still a working link.
      });
  })();
  </script>`;
}

/**
 * Privacy-safe UI event hook. Components mark the events that matter with `data-track`; this dispatches a
 * `milebook:track` CustomEvent on window. It never sends data over the network — a host that wants analytics listens for
 * the event and applies its own consent and retention rules.
 */
function renderTrackScript(): string {
  return `<script>
  (() => {
    const emit = (el) => {
      const name = el.getAttribute('data-track');
      if (!name) return;
      const value = el.getAttribute('data-track-value') || (el instanceof HTMLInputElement ? el.value : '');
      window.dispatchEvent(new CustomEvent('milebook:track', { detail: { name: name, value: value, page: document.body.dataset.pageContext || '' } }));
    };
    document.addEventListener('click', (event) => {
      const el = event.target instanceof Element ? event.target.closest('[data-track]') : null;
      // Inputs emit on change; a label click would otherwise count the same choice twice.
      if (el !== null && !(el instanceof HTMLInputElement)) emit(el);
    });
    document.addEventListener('change', (event) => {
      const el = event.target;
      if (el instanceof Element && el.matches('[data-track]')) emit(el);
    });
  })();
  </script>`;
}

function renderGarminModal(savedKey: GarminKey | undefined, next: string, keyError: string | null, tx: Translator): string {
  const replacing = savedKey !== undefined;
  return `<div class="modal" id="garmin-modal" hidden>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="garmin-title">
      <header class="modal-head"><h2 id="garmin-title">${escapeHtml(replacing ? tx.t("garmin.titleReplace") : tx.t("garmin.titleConnect"))}</h2><button class="icon-btn modal-close" type="button" data-close-garmin aria-label="${escapeHtml(tx.t("garmin.close"))}">×</button></header>
      <p class="muted">${replacing ? tx.t("garmin.introReplace", { key: escapeHtml(maskKey(savedKey.apiKey)) }) : escapeHtml(tx.t("garmin.introConnect"))}</p>
      <p class="muted small">${escapeHtml(tx.t("garmin.hint"))}</p>
      ${keyError === null ? "" : `<p class="error" role="alert">${escapeHtml(keyError)}</p>`}
      <ol class="key-steps">
        <li>${tx.t("garmin.step1")}</li>
        <li>${tx.t("garmin.step2")}</li>
        <li>${tx.t("garmin.step3")}</li>
        <li>${tx.t("garmin.step4")}</li>
      </ol>
      <form method="post" action="/garmin/key" class="stack">
        <input type="hidden" name="next" value="${escapeHtml(next)}">
        <label for="garmin-key">${escapeHtml(tx.t("garmin.keyLabel"))}</label>
        <div class="key-input-row">
          <input id="garmin-key" name="key" type="password" autocomplete="new-password" spellcheck="false" autocapitalize="off" required placeholder="${escapeHtml(tx.t("garmin.keyPlaceholder"))}" aria-describedby="garmin-key-help">
          <button id="garmin-key-toggle" class="key-toggle" type="button" aria-pressed="false">${escapeHtml(tx.t("garmin.show"))}</button>
        </div>
        <p id="garmin-key-help" class="muted small">${tx.t("garmin.keyHelp")}</p>
        <div class="modal-actions"><button type="button" class="btn ghost" data-close-garmin>${escapeHtml(tx.t("garmin.cancel"))}</button><button type="submit" class="btn">${escapeHtml(tx.t("garmin.save"))}</button></div>
      </form>
      ${replacing ? `<form method="post" action="/garmin/key/delete" class="stack key-delete-form"><input type="hidden" name="next" value="${escapeHtml(next)}"><button type="submit" class="btn ghost">${escapeHtml(tx.t("garmin.remove"))}</button></form>` : ""}
    </div>
  </div>`;
}

function renderGarminScript(): string {
  return `<script>
  (() => {
    const modal = document.getElementById('garmin-modal');
    if (!modal) return;
    const ui = window.__I18N__ || {};
    const keyInput = document.getElementById('garmin-key');
    const keyToggle = document.getElementById('garmin-key-toggle');
    const params = new URLSearchParams(location.search);
    let lastFocus = null;

    const setKeyVisible = (visible) => {
      if (keyInput) keyInput.type = visible ? 'text' : 'password';
      if (keyToggle) {
        keyToggle.textContent = visible ? (ui.garminHide || 'Hide') : (ui.garminShow || 'Show');
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

function renderGarminPanel(savedKey: GarminKey | undefined, next: string, tx: Translator, keyError: string | null = null): string {
  return `${renderGarminModal(savedKey, next, keyError, tx)}
  ${renderGarminScript()}`;
}

const SITE_NAME = "Milebook";
const MAX_UNREAD_DISPLAY = 99;

function formatUnreadCount(unread: number): string {
  if (!Number.isFinite(unread) || unread <= 0) return "";
  const count = Math.floor(unread);
  return count > MAX_UNREAD_DISPLAY ? " (99+)" : ` (${count})`;
}

function navLabel(user: AuthUser | undefined, activeView: ViewName, tx: Translator): string {
  if (user === undefined) return "";
  if (activeView === "calendar") return tx.t("nav.plan");
  if (activeView === "history") return tx.t("nav.log");
  if (activeView === "muscle") return tx.t("nav.muscles");
  if (activeView === "changes") return tx.t("changes.allTitle");
  return "";
}

function pageContext(title: string, user: AuthUser | undefined, activeView: ViewName, tx: Translator): string {
  const nav = navLabel(user, activeView, tx);
  if (nav.length === 0) return title;
  return nav === title ? title : `${nav} · ${title}`;
}

function documentTitle(title: string, user: AuthUser | undefined, activeView: ViewName, unread: number, tx: Translator): string {
  const context = pageContext(title, user, activeView, tx);
  const suffix = `${tx.t("app.name")}${formatUnreadCount(unread)}`;
  return context.length === 0 ? suffix : `${context} · ${suffix}`;
}

/**
 * The Plan / Training log / Muscles switch: navigation between the three projections of the same runner, so it
 * lives inside the app bar. It renders only when the page names its view; profile, coaching-state, audit, sign-in
 * and error pages pass "none" and get a clean header instead of a tab strip with nothing selected.
 */
function renderViewSwitch(activeView: ViewName, tx: Translator): string {
  if (activeView === "none") return "";
  const planActive = activeView === "calendar";
  const logActive = activeView === "history";
  const muscleActive = activeView === "muscle";
  const label = escapeHtml(tx.t("nav.switch.label"));
  const plan = escapeHtml(tx.t("nav.plan"));
  const log = escapeHtml(tx.t("nav.log"));
  const muscle = escapeHtml(tx.t("nav.muscles"));
  // The changes page is a fourth projection but has no tab of its own: keep the three tabs reachable, select none.
  const thumb = activeView === "changes" ? "" : `<span class="view-thumb" aria-hidden="true"></span>`;
  return `<nav class="view-switch" data-active="${activeView}" aria-label="${label}">${thumb}<a class="view-tab${planActive ? " active" : ""}" href="/calendar"${planActive ? ' aria-current="page"' : ""}>${plan}</a><a class="view-tab${logActive ? " active" : ""}" href="/history"${logActive ? ' aria-current="page"' : ""}>${log}</a><a class="view-tab${muscleActive ? " active" : ""}" href="/muscle"${muscleActive ? ' aria-current="page"' : ""}>${muscle}</a></nav>`;
}

function renderLanguageSwitch(tx: Translator, extraClass = ""): string {
  const options = LOCALES.map((meta) => {
    const active = meta.code === tx.locale;
    const label = escapeHtml(meta.nativeName);
    const title = escapeHtml(meta.englishName);
    const href = escapeHtml(`/language?locale=${encodeURIComponent(meta.code)}`);
    return active
      ? `<span class="lang-btn" aria-current="true" title="${title}">${label}</span>`
      : `<a class="lang-btn" href="${href}" title="${title}">${label}</a>`;
  }).join("");
  const className = extraClass.length > 0 ? `lang-switch ${extraClass}` : "lang-switch";
  return `<nav class="${className}" aria-label="${escapeHtml(tx.t("footer.language"))}"><span class="lang-switch-label" aria-hidden="true">${escapeHtml(tx.t("footer.language"))}</span>${options}</nav>`;
}

/**
 * Common footer shown on every rendered page: a localized tagline and the language switcher. Each control posts a
 * plain GET to /language, so switching works without JavaScript; the server remembers the choice in a cookie and
 * sends the runner back to the page they were on.
 */
function renderFooter(tx: Translator): string {
  return `<footer class="site-footer"><div class="site-footer-inner"><span class="footer-tagline">${escapeHtml(tx.t("footer.tagline"))}</span><a class="footer-credits" href="/privacy">${escapeHtml(tx.t("footer.privacy"))}</a><a class="footer-credits" href="/credits">${escapeHtml(tx.t("footer.credits"))}</a>${renderLanguageSwitch(tx)}</div></footer>`;
}

/**
 * Small map of localized strings the inline client scripts need at runtime (notification panel, muscle badge,
 * Garmin show/hide). Serialized once; scripts fall back to English if it is ever missing.
 */
function clientI18nScript(tx: Translator): string {
  const strings = {
    ...clientStrings(tx.locale),
    notifAria: tx.t("notif.aria"),
    notifUnread: tx.t("notif.ariaUnread", { count: "{count}" }),
    notifEmpty: tx.t("notif.empty"),
    notifDefault: tx.t("notif.defaultItem"),
    garminShow: tx.t("garmin.show"),
    garminHide: tx.t("garmin.hide"),
    muscleTabBase: tx.t("muscle.tabAria"),
    muscleStatusOne: tx.t("muscle.statusOne"),
    muscleStatusOther: tx.t("muscle.statusOther"),
  };
  return `<script>window.__I18N__=${jsonForScript(strings)};</script>`;
}

function layout(
  title: string,
  body: string,
  user: AuthUser | undefined,
  activeView: ViewName = "none",
  unread = 0,
  flash = "",
  tx: Translator = defaultTranslator,
): string {
  const topActions = user === undefined
    ? `<div class="top-actions"><a class="top-link" href="/login">${escapeHtml(tx.t("header.signin"))}</a><a class="top-link ghost" href="/signup">${escapeHtml(tx.t("header.signup"))}</a></div>`
    : `<div class="top-actions">${renderNotificationBell(tx)}${renderAccountMenu(user, tx)}</div>`;
  const viewSwitch = user === undefined ? "" : renderViewSwitch(activeView, tx);
  const nav = `<nav class="top"><a class="brand" href="/calendar">${SITE_MARK}<span>${escapeHtml(tx.t("app.name"))}</span></a>${viewSwitch}${topActions}</nav>`;
  const bubble = user === undefined ? "" : renderChatBubble(tx);
  const notificationScript = user === undefined ? "" : renderNotificationScript();
  const accountScript = user === undefined ? "" : renderAccountMenuScript();
  // The badge script only matters where the tab strip renders; "none" pages have no Muscles tab to badge.
  const muscleBadgeScript = user === undefined || activeView === "none" ? "" : renderMuscleBadgeScript();
  const context = pageContext(title, user, activeView, tx);
  const timezone = escapeHtml(safeTimeZone(user?.timezone));
  const localeTag = escapeHtml(tx.locale);
  const dir = tx.dir;
  const i18nScript = clientI18nScript(tx);
  const trackScript = renderTrackScript();
  return `<!doctype html><html lang="${localeTag}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(documentTitle(title, user, activeView, unread, tx))}</title><link rel="stylesheet" href="/static/app.css?v=${APP_CSS_VERSION}"></head>
  <body data-site-name="${escapeHtml(tx.t("app.name"))}" data-locale="${localeTag}" data-page-context="${escapeHtml(context)}" data-active-view="${activeView}" data-timezone="${timezone}">${nav}<div class="app-shell"><main>${flash}${body}</main>${bubble}</div>${renderFooter(tx)}${i18nScript}${notificationScript}${accountScript}${muscleBadgeScript}${trackScript}</body></html>`;
}

/** The in-calendar coach bubble: suggestions are tappable; undo is requested in chat, with no history panel. */
function renderChatBubble(tx: Translator): string {
  const E = escapeHtml;
  return `<aside class="coach-dock" aria-label="${E(tx.t("coach.title"))}">
  <button id="coach-bubble" type="button" aria-label="${E(tx.t("coach.bubbleAria"))}" aria-expanded="false" aria-controls="coach-panel" data-track="coach-open" data-track-value="launcher">${E(tx.t("coach.bubbleLabel"))}</button>
  <section id="coach-panel" hidden role="region" aria-label="${E(tx.t("coach.title"))}">
    <header><div class="coach-head"><img class="coach-avatar" src="/static/coach-token.webp" alt="" width="30" height="30" decoding="async"><div class="coach-head-text"><strong>${E(tx.t("coach.title"))}</strong><span class="coach-horizon">${E(tx.t("coach.horizon", { days: HORIZON_DAYS }))}</span></div></div><div class="coach-head-actions"><button id="coach-close" type="button" aria-label="${E(tx.t("coach.closeAria"))}" title="${E(tx.t("coach.closeTitle"))}" data-track="coach-close" data-track-value="close">×</button><button id="coach-minimize" type="button" aria-label="${E(tx.t("coach.minimizeAria"))}" title="${E(tx.t("coach.minimizeTitle"))}" data-track="coach-close" data-track-value="minimize">−</button></div></header>
    <div class="coach-tabs" role="tablist" aria-label="${E(tx.t("coach.tabsAria"))}"><button id="coach-tab-chat" class="coach-tab" type="button" role="tab" aria-selected="true" aria-controls="coach-tabpanel-chat" tabindex="0" data-coach-tab="chat">${E(tx.t("coach.tabChat"))}<span class="coach-tab-count" data-coach-count="chat" hidden></span></button><button id="coach-tab-states" class="coach-tab" type="button" role="tab" aria-selected="false" aria-controls="coach-tabpanel-states" tabindex="-1" data-coach-tab="states">${E(tx.t("coach.tabStates"))}<span class="coach-tab-count" data-coach-count="states" hidden></span></button><button id="coach-tab-changes" class="coach-tab" type="button" role="tab" aria-selected="false" aria-controls="coach-tabpanel-changes" tabindex="-1" data-coach-tab="changes">${E(tx.t("coach.tabChanges"))}<span class="coach-tab-count" data-coach-count="changes" hidden></span></button></div>
    <div class="coach-tab-panel" id="coach-tabpanel-chat" role="tabpanel" aria-labelledby="coach-tab-chat" data-coach-panel="chat">
      <div id="coach-log" role="log" aria-live="polite"></div>
      <div id="coach-suggestions" aria-label="${E(tx.t("coach.suggestionsAria"))}"></div>
      <form id="coach-form"><textarea id="coach-input" rows="2" maxlength="1000" required placeholder="${E(tx.t("coach.placeholder"))}"></textarea><button class="btn" type="submit">${E(tx.t("coach.send"))}</button></form>
    </div>
    <div class="coach-tab-panel" id="coach-tabpanel-states" role="tabpanel" aria-labelledby="coach-tab-states" data-coach-panel="states" hidden>
      <div class="coach-tab-body" id="coach-states-list"></div>
      <div class="coach-tab-foot"><a class="chip" href="/coach-states">${E(tx.t("coach.statesAll"))}</a></div>
    </div>
    <div class="coach-tab-panel" id="coach-tabpanel-changes" role="tabpanel" aria-labelledby="coach-tab-changes" data-coach-panel="changes" hidden>
      <div class="coach-tab-body" id="coach-changes-list"></div>
      <div class="coach-tab-foot"><a class="chip" href="/changes">${E(tx.t("coach.changesAll"))}</a></div>
    </div>
  </section>
  <script>
  (() => {
    const ui = window.__I18N__ || {};
    const tr = (key, fallback) => (typeof ui[key] === 'string' ? ui[key] : fallback);
    const trf = (key, fallback, vars) => {
      const template = tr(key, fallback);
      if (!vars) return template;
      return template.replace(/\\{(\\w+)\\}/g, (whole, name) => (vars[name] === undefined ? whole : String(vars[name])));
    };
    const pageLocale = document.body.dataset.locale || 'en';
    const bubble = document.getElementById('coach-bubble');
    const panel = document.getElementById('coach-panel');
    const minimize = document.getElementById('coach-minimize');
    const close = document.getElementById('coach-close');
    const form = document.getElementById('coach-form');
    const input = document.getElementById('coach-input');
    const log = document.getElementById('coach-log');
    const suggestions = document.getElementById('coach-suggestions');
    const statesList = document.getElementById('coach-states-list');
    const changesList = document.getElementById('coach-changes-list');
    const tabs = panel === null ? [] : Array.from(panel.querySelectorAll('[data-coach-tab]'));
    const tabPanels = panel === null ? [] : Array.from(panel.querySelectorAll('[data-coach-panel]'));
    if (!bubble || !panel || !minimize || !close || !form || !input || !log || !suggestions || !statesList || !changesList) return;
    const overlayWidth = () => window.matchMedia('(max-width: 1199px)').matches;
    const sheetWidth = () => window.matchMedia('(max-width: 720px)').matches;
    // Below 1200 px the coach is an overlay: inert the page behind it so keyboard focus cannot land on content the
    // panel covers (WCAG 2.4.11). The dock at >=1200 px occupies its own grid column, so the page stays focusable.
    // Query at call time: the footer is parsed after the dock's inline script, so a captured reference would be null.
    const syncCoachInert = () => {
      const open = !panel.hidden && overlayWidth();
      const pageMain = document.querySelector('.app-shell > main');
      const siteFooter = document.querySelector('.site-footer');
      const topbar = document.querySelector('nav.top');
      if (pageMain !== null) pageMain.inert = open;
      if (siteFooter !== null) siteFooter.inert = open;
      // The sheet covers the app bar at <=720 px; the drawer starts below it, so the bar stays usable there.
      if (topbar !== null) topbar.inert = open && sheetWidth();
    };
    const STARTERS = ${jsonForScript(tx.starters())};
    let suggestionsSet = false;
    const sendButton = form.querySelector('button[type="submit"]');
    // One coach turn at a time: a second Enter during a pending turn would book two batches.
    let sendInFlight = false;
    // The panel is one coach surface in three groups: the conversation, the durable states it believes, and the
    // calendar changes it made. The strip only switches which group is visible; the chat keeps running underneath.
    const changesSeenKey = 'milebook.coachChangesSeen';
    const readChangesSeen = () => {
      try { return localStorage.getItem(changesSeenKey) || ''; } catch { return ''; }
    };
    const writeChangesSeen = (value) => {
      try { if (typeof value === 'string' && value.length > 0) localStorage.setItem(changesSeenKey, value); } catch { /* private mode */ }
    };
    // Opening the Changes tab is the moment the runner has seen the newest batch; the badge is for unseen edits, not
    // for every batch that still has an Undo.
    const markChangesSeen = () => {
      writeChangesSeen(changesList.dataset.newest || '');
      setCount('changes', 0, tr('changesBadgeTitle', 'new coach changes'));
    };
    // The prefill cache, client half (LL-4): the server is the truth about what was re-read, but the runner is
    // already waiting when that truth arrives. The client predicts the re-prefill from signals it already has - a
    // fresh Garmin import, a saved muscle check-in, a new day, a confirmed state or a calendar batch - and names
    // the reason in the typing line; the response's prefill block then replaces the guess with the fact.
    const prefillKey = 'milebook.coachPrefill';
    const waitFlagKey = 'milebook.coachWait';
    const readPrefill = () => {
      try { return JSON.parse(localStorage.getItem(prefillKey) || 'null'); } catch { return null; }
    };
    const writePrefill = (value) => {
      try { if (value !== null && typeof value === 'object') localStorage.setItem(prefillKey, JSON.stringify(value)); } catch { /* private mode */ }
    };
    const setWaitFlag = (reason) => {
      try { localStorage.setItem(waitFlagKey, reason); } catch { /* private mode */ }
    };
    const takeWaitFlag = () => {
      try {
        const reason = localStorage.getItem(waitFlagKey) || '';
        localStorage.removeItem(waitFlagKey);
        return reason;
      } catch { return ''; }
    };
    // A page that just imported runs or saved a check-in will re-read the runner's context on the next turn.
    try {
      const pageParams = new URLSearchParams(window.location.search);
      if (pageParams.get('synced') !== null && Number(pageParams.get('synced')) > 0) setWaitFlag('Activities');
      else if (pageParams.get('saved') === '1') setWaitFlag('Muscle');
    } catch { /* private mode */ }
    const localToday = () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    };
    const waitReasonText = (reason) => {
      if (reason === 'Activities') return tr('coachWaitActivities', 'Pulling in your latest runs...');
      if (reason === 'Muscle') return tr('coachWaitMuscle', 'Refreshing how your body feels...');
      if (reason === 'Day') return tr('coachWaitDay', 'New day - checking your plan...');
      if (reason === 'Calendar') return tr('coachWaitCalendar', 'Your calendar changed - re-reading it...');
      if (reason === 'States') return tr('coachWaitStates', 'Noting your coaching states...');
      return tr('coachWaitFirst', 'Getting to know you and your plan...');
    };
    const predictWaitReason = () => {
      const flagged = takeWaitFlag();
      if (flagged === 'Activities' || flagged === 'Muscle' || flagged === 'States') return flagged;
      const stored = readPrefill();
      if (stored === null || typeof stored !== 'object' || typeof stored.today !== 'string') return 'First';
      if (stored.today !== localToday()) return 'Day';
      if (typeof stored.latestChangeSetId === 'string' && (changesList.dataset.newest || '') !== stored.latestChangeSetId) return 'Calendar';
      return null;
    };
    let activeTab = 'chat';
    const track = (name, value) => {
      window.dispatchEvent(new CustomEvent('milebook:track', { detail: { name: name, value: value, page: document.body.dataset.pageContext || '' } }));
    };
    const setTab = (name, options) => {
      const next = tabPanels.some((tabPanel) => tabPanel.dataset.coachPanel === name) ? name : 'chat';
      const changed = next !== activeTab;
      activeTab = next;
      if (changed) track('coach-tab', next);
      if (next === 'changes') markChangesSeen();
      for (const tabPanel of tabPanels) tabPanel.hidden = tabPanel.dataset.coachPanel !== next;
      for (const tab of tabs) {
        const selected = tab.dataset.coachTab === next;
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected ? 0 : -1;
        if (selected && options && options.focus === true) tab.focus();
      }
      if (next === 'chat' && options && options.focusInput === true) input.focus();
    };
    const setCount = (name, count, label) => {
      const badge = panel.querySelector('[data-coach-count="' + name + '"]');
      if (badge === null) return;
      const value = Math.max(0, Math.floor(Number(count) || 0));
      badge.textContent = value > 99 ? '99+' : String(value);
      badge.hidden = value === 0;
      badge.title = typeof label === 'string' ? label : '';
    };
    /**
     * Pending muscle suggestions are decisions, not decoration: the launcher badge shows them while the panel is
     * closed, and the Chat tab counts them while it is open (F4). Both disappear at zero, and the launcher keeps
     * its spoken label in step with the count.
     */
    const updateMusclePendingCount = (count) => {
      const value = Math.max(0, Math.floor(Number(count) || 0));
      setCount('chat', value, tr('musclePendingOne', 'coach muscle suggestion waiting'));
      for (const badge of bubble.querySelectorAll('.coach-pending-badge')) badge.remove();
      // The server-rendered launcher label is the localized truth; keep it and only append the pending count.
      const baseAria = bubble.dataset.baseAria || bubble.getAttribute('aria-label') || 'Talk to the coach';
      bubble.dataset.baseAria = baseAria;
      if (value === 0) {
        bubble.setAttribute('aria-label', baseAria);
        return;
      }
      const badge = document.createElement('span');
      badge.className = 'view-badge coach-pending-badge';
      badge.textContent = value > 9 ? '9+' : String(value);
      badge.setAttribute('aria-hidden', 'true');
      bubble.appendChild(badge);
      const suffix = value === 1
        ? tr('musclePendingOne', 'coach muscle suggestion waiting')
        : tr('musclePendingOther', 'coach muscle suggestions waiting');
      bubble.setAttribute('aria-label', baseAria + ' — ' + value + ' ' + suffix);
    };
    /** A confirm changes the attention count the app-bar badge reads; refresh it in place instead of waiting for a reload (F6). */
    const refreshMuscleAttention = () => {
      const tab = document.querySelector('.view-tab[href="/muscle"]');
      if (tab === null) return;
      const ui = window.__I18N__ || {};
      fetch('/muscle/attention.json', { headers: { accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data === null || typeof data !== 'object') return;
          const count = Math.max(0, Math.floor(Number(data.count) || 0));
          for (const badge of tab.querySelectorAll('.view-badge')) badge.remove();
          if (count === 0) {
            tab.setAttribute('aria-label', ui.muscleTabBase || 'Muscles');
            return;
          }
          const badge = document.createElement('span');
          badge.className = 'view-badge';
          badge.textContent = count > 9 ? '9+' : String(count);
          badge.setAttribute('aria-hidden', 'true');
          tab.appendChild(badge);
          const base = ui.muscleTabBase || 'Muscles';
          const suffix = count === 1
            ? (ui.muscleStatusOne || 'muscle in a special status')
            : (ui.muscleStatusOther || 'muscles in a special status');
          tab.setAttribute('aria-label', base + ' — ' + count + ' ' + suffix);
        })
        .catch(() => {
          // Without the count the tab is still a working link.
        });
    };
    const show = (focusComposer) => {
      document.body.classList.add('coach-open');
      panel.hidden = false;
      bubble.hidden = true;
      bubble.setAttribute('aria-expanded', 'true');
      // Focus the selected tab, not the textarea: an "Ask coach" turn sends itself and must not pop the phone keyboard
      // over the answer. A deliberate launcher click may focus the composer.
      setTab(activeTab, { focus: activeTab !== 'chat' });
      if (activeTab === 'chat' && focusComposer === true) input.focus();
      syncCoachInert();
      showStarters();
      void loadConversation();
    };
    const minimizePanel = () => {
      panel.hidden = true;
      bubble.hidden = false;
      bubble.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('coach-open');
      syncCoachInert();
      bubble.focus();
    };
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
    let historyInFlight = false;
    const loadConversation = async (force) => {
      if (historyInFlight) return;
      if (historyLoaded && force !== true) return;
      historyInFlight = true;
      try {
        const response = await fetch('/chat/history');
        if (!response.ok) return;
        const data = await response.json();
        if (log.childElementCount === 0) {
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
          // Pending muscle suggestions are durable rows too: the runner can still confirm or dismiss them after a
          // refresh, not only on the turn that produced them.
          addMuscleProposalCards(data.muscleProposals);
        }
        // The context tabs read the same durable rows: states are what the coach currently believes, changes are
        // what it actually wrote. Refreshing them after a turn keeps the three groups in step without a page load.
        if (Array.isArray(data.states)) renderStatesTab(data.states);
        if (Array.isArray(data.changes)) renderChangesTab(data.changes);
        // The pending-suggestion count is a decision queue: the launcher badge and the Chat tab count both track
        // it here so a waiting decision is visible before the log is ever opened.
        updateMusclePendingCount(Array.isArray(data.muscleProposals) ? data.muscleProposals.length : 0);
        historyLoaded = true;
      } catch {
        // A failed history read leaves the bubble empty; the next turn still works.
      } finally {
        historyInFlight = false;
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
    // the schedule card on the All changes page, where the Undo form for that batch lives.
    const showDeleteToast = (changes) => {
      const removed = changes.filter((change) => change && typeof change === 'object' && change.action === 'remove');
      if (removed.length === 0) return;
      const names = removed
        .map((change) => (typeof change.title === 'string' && change.title.trim().length > 0 ? change.title.trim() : tr('sessionWord', 'session')))
        .join(', ');
      const toast = document.createElement('div');
      toast.className = 'fx-toast';
      toast.setAttribute('role', 'status');
      const text = document.createElement('span');
      text.textContent = tr('deletedPrefix', 'Deleted') + ' ' + names + ' · ';
      const link = document.createElement('a');
      link.href = '/changes#recent-changes';
      link.textContent = tr('undoLink', 'Undo in All changes');
      toast.append(text, link);
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 5200);
    };
    /** A short, non-blocking confirmation used by in-place actions (undo) that do not redirect the page. */
    const showToast = (text) => {
      const toast = document.createElement('div');
      toast.className = 'fx-toast';
      toast.setAttribute('role', 'status');
      const span = document.createElement('span');
      span.textContent = text;
      toast.appendChild(span);
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4200);
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
      chip.textContent = tr('retry', 'Try again');
      chip.addEventListener('click', () => { void send(value, intent); });
      suggestions.appendChild(chip);
    };
    const showStarters = () => {
      if (suggestionsSet || suggestions.childElementCount > 0) return;
      setSuggestions(STARTERS);
    };
    /**
     * One durable coaching state, rendered either as a chat card (proposal in the log) or as a card in the States
     * tab. Actions drop every copy of the state across the dock and keep the tab count honest.
     */
    const dropState = (stateId, message) => {
      for (const node of panel.querySelectorAll('[data-state-id]')) {
        if (node.dataset.stateId === stateId) node.remove();
      }
      let proposed = 0;
      for (const node of statesList.querySelectorAll('[data-state-id]')) {
        if (node.querySelector('.state-status.state-observing') !== null) proposed += 1;
      }
      setCount('states', proposed, tr('statesBadgeTitle', 'proposed states'));
      add('system', message);
      // A confirmed or resolved state changes the epoch, so the next coach turn re-reads the states.
      setWaitFlag('States');
    };
    const buildStateCard = (state, inLog) => {
      const card = document.createElement('div');
      card.className = inLog ? 'bubble state-card' : 'state-card coach-state-card';
      card.dataset.stateId = state.stateId;
      card.setAttribute('role', 'status');
      const head = document.createElement('div');
      head.className = 'state-bubble-head';
      const title = document.createElement('strong');
      title.textContent = state.label || tr('stateDefault', 'Coaching state');
      const chip = document.createElement('span');
      chip.className = 'chip state-status state-' + (state.status || 'active');
      chip.textContent = state.status === 'observing' ? tr('statusProposed', 'Proposed') : tr('statusActive', 'Active');
      head.append(title, chip);
      const detail = document.createElement('p');
      detail.className = 'muted small';
      detail.textContent = state.status === 'observing'
        ? tr('stateProposedDetail', 'The coach proposed a durable state. Confirm it or dismiss it; it is not a diagnosis.')
        : tr('stateActiveDetail', 'Saved to your coaching states.');
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
      dismiss.textContent = state.status === 'observing' ? tr('dismiss', 'Dismiss') : tr('resolve', 'Resolve');
      dismiss.addEventListener('click', async () => {
        dismiss.disabled = true;
        try {
          const result = await fetch('/coach-states/' + encodeURIComponent(state.stateId) + '/resolve', { method: 'POST' });
          if (!result.ok) throw new Error('resolve failed');
          dropState(state.stateId, tr('stateResolved', 'Coaching state resolved'));
        } catch {
          dismiss.disabled = false;
        }
      });
      if (state.status === 'observing') {
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'btn';
        confirm.textContent = tr('confirm', 'Confirm');
        confirm.addEventListener('click', async () => {
          confirm.disabled = true;
          try {
            const result = await fetch('/coach-states/' + encodeURIComponent(state.stateId) + '/confirm', { method: 'POST' });
            if (!result.ok) throw new Error('confirm failed');
            dropState(state.stateId, tr('stateConfirmed', 'Coaching state confirmed'));
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
      discuss.textContent = tr('discuss', 'Discuss this state');
      discuss.addEventListener('click', () => {
        openCoach('How should the ' + (state.label || 'coaching state') + ' state shape my coming week?', true, { kind: 'discuss-state', stateId: state.stateId, source: 'state-card' });
      });
      actions.appendChild(discuss);
      card.appendChild(actions);
      return card;
    };
    const addStateCards = (states) => {
      if (!Array.isArray(states) || states.length === 0) return;
      for (const state of states) {
        if (!state || typeof state.stateId !== 'string') continue;
        if (state.action === 'resolve') {
          add('system', tr('stateResolved', 'Coaching state resolved'));
          continue;
        }
        log.appendChild(buildStateCard(state, true));
        scrollToLatest();
      }
    };
    /**
     * One pending coach muscle suggestion. It is the coach's notice, not a write: Confirm posts exactly the record
     * the Muscle tab's own form would have written, Dismiss drops it (with an Undo, because a mis-tap should cost
     * one tap, not a re-entry), and Adjust opens the form on the coach's reading so a misparse is corrected in
     * place. The card is a labelled group announced once by the log's live region, never a nested status.
     */
    const buildMuscleProposalCard = (proposal) => {
      const card = document.createElement('div');
      card.className = 'bubble muscle-suggestion';
      card.dataset.proposalId = proposal.proposalId;
      card.setAttribute('role', 'group');
      const headId = 'sug-' + String(proposal.proposalId).replace(/[^a-z0-9-]/gi, '');
      card.setAttribute('aria-labelledby', headId);
      const head = document.createElement('strong');
      head.id = headId;
      head.textContent = tr('muscleSuggestion', 'Muscle suggestion');
      card.appendChild(head);
      const lineRow = document.createElement('p');
      lineRow.className = 'muscle-suggestion-line';
      lineRow.textContent = typeof proposal.line === 'string' ? proposal.line : '';
      if (typeof proposal.readingLabel === 'string' && proposal.readingLabel.length > 0) {
        const chip = document.createElement('span');
        chip.className = 'chip muscle-level level-' + String(proposal.reading || 'ok');
        chip.textContent = proposal.readingLabel;
        lineRow.append(' ', chip);
      }
      card.appendChild(lineRow);
      if (typeof proposal.suggestedLabel === 'string' && proposal.suggestedLabel.length > 0) {
        const meta = document.createElement('p');
        meta.className = 'muted small';
        meta.textContent = proposal.suggestedLabel;
        card.appendChild(meta);
      }
      if (Array.isArray(proposal.evidence) && proposal.evidence.length > 0) {
        const evidence = document.createElement('p');
        evidence.className = 'muted small';
        const quotes = proposal.evidence.map((quote) => '“' + String(quote) + '”').join(' · ');
        evidence.textContent = tr('muscleSuggestionEvidence', 'You said: {quotes}').replace('{quotes}', quotes);
        card.appendChild(evidence);
      }
      if (typeof proposal.note === 'string' && proposal.note.length > 0) {
        const note = document.createElement('p');
        note.className = 'muted small';
        note.textContent = tr('muscleSuggestionNote', 'Your note: {note}').replace('{note}', proposal.note);
        card.appendChild(note);
      }
      if (typeof proposal.contextLabel === 'string' && proposal.contextLabel.length > 0) {
        const context = document.createElement('p');
        context.className = 'muted small';
        context.textContent = proposal.contextLabel;
        card.appendChild(context);
      }
      if (typeof proposal.runLabel === 'string' && proposal.runLabel.length > 0 && typeof proposal.runHref === 'string') {
        const run = document.createElement('p');
        run.className = 'muted small';
        const link = document.createElement('a');
        link.href = proposal.runHref;
        link.textContent = proposal.runLabel;
        run.appendChild(link);
        card.appendChild(run);
      }
      const pending = document.createElement('p');
      pending.className = 'muted small muscle-suggestion-pending';
      pending.textContent = tr('muscleSuggestionPending', 'Suggested - nothing is saved until you confirm.');
      card.appendChild(pending);
      const actions = document.createElement('div');
      actions.className = 'proposal-actions';
      const decide = async (decision, button) => {
        button.disabled = true;
        try {
          const result = await fetch('/muscle/proposals/' + encodeURIComponent(proposal.proposalId) + '/' + decision, {
            method: 'POST',
            headers: { accept: 'application/json' },
          });
          if (!result.ok) {
            // The typed detail says which honest failure happened: an already-decided row re-syncs instead of
            // showing the generic apology, so a stale copy never claims a second confirm.
            const body = await result.json().catch(() => null);
            const detail = body && typeof body.detail === 'string' ? body.detail : '';
            if (detail === 'not-pending' || detail === 'not-found') {
              card.replaceChildren();
              card.classList.add('muted');
              card.textContent = tr('muscleAlreadyDecided', 'That suggestion was already confirmed or dismissed - refreshing.');
              setWaitFlag('Muscle');
              void loadConversation(true);
              return;
            }
            track('muscle-suggestion-failed', detail || 'unknown');
            button.disabled = false;
            pending.textContent = tr('muscleFailed', 'That suggestion could not be applied. Open the Muscle tab to check in.');
            return;
          }
          track('muscle-suggestion-' + decision, typeof proposal.action === 'string' ? proposal.action : 'report');
          if (decision === 'confirm') {
            card.replaceChildren();
            card.classList.add('ok');
            // The success line names the muscle, the way a friend would say it back - not a system's
            // "record updated".
            const name = typeof proposal.name === 'string' ? proposal.name.trim() : '';
            const noted = name.length > 0
              ? tr('muscleConfirmedName', 'Noted — {name} is on your record now').replace('{name}', name)
              : tr('muscleConfirmed', 'Noted — saved to your muscle record');
            card.textContent = noted + ' · ';
            const view = document.createElement('a');
            view.href = '/muscle';
            view.textContent = tr('muscleViewRecord', 'See it on the Muscle tab');
            card.appendChild(view);
            refreshMuscleAttention();
          } else {
            card.replaceChildren();
            card.classList.add('muted');
            card.textContent = tr('muscleDismissed', 'Dropped — nothing changed') + ' · ';
            const undo = document.createElement('button');
            undo.type = 'button';
            undo.className = 'chip muscle-suggestion-undo';
            undo.textContent = tr('muscleUndo', 'Undo');
            undo.addEventListener('click', async () => {
              undo.disabled = true;
              try {
                const undone = await fetch('/muscle/proposals/' + encodeURIComponent(proposal.proposalId) + '/restore', {
                  method: 'POST',
                  headers: { accept: 'application/json' },
                });
                if (!undone.ok) throw new Error('restore failed');
                card.replaceWith(buildMuscleProposalCard(proposal));
                scrollToLatest();
              } catch {
                undo.disabled = false;
              }
            });
            card.appendChild(undo);
          }
          setWaitFlag('Muscle');
          void loadConversation(true);
        } catch {
          track('muscle-suggestion-failed', 'network');
          button.disabled = false;
          pending.textContent = tr('muscleFailed', 'That suggestion could not be applied. Open the Muscle tab to check in.');
        }
      };
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'btn';
      confirm.textContent = tr('confirm', 'Confirm');
      confirm.addEventListener('click', () => { void decide('confirm', confirm); });
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'btn ghost';
      dismiss.textContent = tr('dismiss', 'Dismiss');
      dismiss.addEventListener('click', () => { void decide('dismiss', dismiss); });
      actions.append(confirm, dismiss);
      const adjust = document.createElement('a');
      adjust.className = 'chip proposal-adjust';
      adjust.href = '/muscle?proposal=' + encodeURIComponent(proposal.proposalId) + '#check-in';
      adjust.textContent = tr('muscleAdjust', 'Adjust in the form');
      adjust.addEventListener('click', () => { track('muscle-suggestion-adjust', typeof proposal.action === 'string' ? proposal.action : 'report'); });
      actions.appendChild(adjust);
      card.appendChild(actions);
      return card;
    };
    // Pending muscle suggestions are durable rows: after a refresh the runner can still decide them here. On the
    // Muscle tab the page card owns the standing queue, so history cards defer to it with one link instead of a
    // second Confirm for the same record (F3); a card the turn just created renders here even there, because the
    // page card only exists after the next reload.
    const onMusclePage = () => (document.body.dataset.activeView || '') === 'muscle';
    const addMuscleProposalCards = (proposals, options) => {
      if (!Array.isArray(proposals) || proposals.length === 0) return;
      const fromTurn = !!(options && options.fromTurn === true);
      if (!fromTurn && onMusclePage()) {
        const note = document.createElement('p');
        note.className = 'bubble system';
        const link = document.createElement('a');
        link.href = '#muscle-suggestions';
        link.textContent = tr('muscleOnThisPage', 'Coach suggestions are waiting on this page');
        note.appendChild(link);
        log.appendChild(note);
        scrollToLatest();
        return;
      }
      track('muscle-suggestion-shown', fromTurn ? 'dock-turn' : 'dock-history');
      let firstConfirm = null;
      for (const proposal of proposals) {
        if (!proposal || typeof proposal.proposalId !== 'string' || proposal.status !== 'proposed') continue;
        const card = buildMuscleProposalCard(proposal);
        if (firstConfirm === null) firstConfirm = card.querySelector('.proposal-actions .btn');
        log.appendChild(card);
      }
      scrollToLatest();
      if ((options && options.focus === true) && firstConfirm !== null) {
        // The decision is the turn's real next step: keyboard and screen-reader users land on it instead of
        // Shift-Tabbing backwards past the chips to find it.
        firstConfirm.focus();
      }
    };
    // The States tab is the durable half of the conversation: active and proposed states stay put instead of
    // scrolling away with the messages that produced them. Proposals that need a decision come first, and the badge
    // counts only those — an active state is context, not an alert.
    const renderStatesTab = (states) => {
      const rows = Array.isArray(states)
        ? states.filter((state) => state && typeof state.stateId === 'string' && state.status !== 'resolved')
        : [];
      const proposed = rows.filter((state) => state.status === 'observing');
      const ordered = proposed.concat(rows.filter((state) => state.status !== 'observing'));
      statesList.replaceChildren();
      if (ordered.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'coach-tab-empty';
        empty.textContent = tr('statesEmpty', 'No active coaching states. The coach proposes one when something durable matters — pain, travel, a race week or a load spike.');
        statesList.appendChild(empty);
      } else {
        for (const state of ordered) statesList.appendChild(buildStateCard(state, false));
      }
      setCount('states', proposed.length, tr('statesBadgeTitle', 'proposed states'));
    };
    const formatChangeDate = (value, withWeekday = false) => {
      const day = typeof value === 'string' ? value.slice(0, 10) : '';
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(day)) return '';
      const tag = pageLocale === 'en' ? 'en-GB' : pageLocale;
      try {
        const date = new Date(day + 'T12:00:00Z');
        if (!withWeekday) return date.toLocaleDateString(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' });
        // English keeps the comma its long day labels use; Chinese uses the locale's own order.
        if (pageLocale === 'en') {
          return date.toLocaleDateString(tag, { weekday: 'short', timeZone: 'UTC' }) + ', ' + date.toLocaleDateString(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' });
        }
        return date.toLocaleDateString(tag, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
      } catch {
        return day;
      }
    };
    /** The runner's local day for an instant, so the panel and the page date a batch the same way. */
    const localDayOf = (value) => {
      const date = typeof value === 'string' ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) return '';
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: document.body.dataset.timezone || 'UTC',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(date);
        const map = {};
        for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value;
        return map.year + '-' + map.month + '-' + map.day;
      } catch {
        return date.toISOString().slice(0, 10);
      }
    };
    const changeUnit = (count) => tr(count === 1 ? 'changes.unitOne' : 'changes.unitOther', count === 1 ? 'session' : 'sessions');
    const changeRangeText = (entries) => {
      const days = [...new Set(entries.map((entry) => (typeof entry.toDay === 'string' && entry.toDay.length === 10 ? entry.toDay : entry.fromDay)).filter((day) => typeof day === 'string' && day.length === 10))].sort();
      if (days.length === 0) return '';
      return days.length === 1 ? formatChangeDate(days[0], true) : formatChangeDate(days[0]) + ' – ' + formatChangeDate(days[days.length - 1]);
    };
    const changeHeadlineText = (change) => {
      const entries = Array.isArray(change.entries) ? change.entries : [];
      const count = entries.length;
      const unit = changeUnit(count);
      const range = changeRangeText(entries);
      const actions = new Set(entries.map((entry) => entry.action));
      let text;
      if (actions.size === 1 && actions.has('add')) text = trf('changes.headline.added', '{count} {unit} added', { count, unit });
      else if (actions.size === 1 && actions.has('remove')) text = trf('changes.headline.removed', '{count} {unit} removed', { count, unit });
      else if (actions.size === 1 && actions.has('update')) text = trf('changes.headline.updated', '{count} {unit} updated', { count, unit });
      else if (actions.size === 1 && actions.has('revert')) text = trf('changes.headline.revert', 'Undone · {count} {unit}', { count, unit });
      else text = trf('changes.headline.mixed', '{count} changes', { count });
      return range.length === 0 ? text : text + ' · ' + range;
    };
    const changeEntryText = (entry) => {
      const day = formatChangeDate(entry.toDay || entry.fromDay, true);
      const moved = entry.action === 'update' && typeof entry.fromDay === 'string' && typeof entry.toDay === 'string' && entry.fromDay !== entry.toDay;
      const label = entry.action === 'remove'
        ? tr('changes.deleted', 'Deleted')
        : entry.action === 'add'
          ? tr('changes.added', 'Added')
          : entry.action === 'revert'
            ? tr('changes.reverted', 'Reverted')
            : moved
              ? tr('changes.moved', 'Moved')
              : tr('changes.updated', 'Updated');
      const title = typeof entry.title === 'string' && entry.title.trim().length > 0 ? entry.title.trim() : tr('sessionWord', 'session');
      return day.length > 0 ? day + ' · ' + label + ' ' + title : label + ' ' + title;
    };
    // The page card is server-rendered; an in-place undo removes only its form and leaves "Ask why" usable.
    const markRecentChangeUndone = (changeSetId) => {
      for (const item of document.querySelectorAll('#recent-changes .change-item')) {
        if (item.dataset.changeSet !== changeSetId) continue;
        item.classList.add('undone');
        const undoForm = item.querySelector('.change-undo-form');
        if (undoForm !== null) undoForm.remove();
        const meta = item.querySelector('.change-head .change-meta');
        if (meta !== null && meta.querySelector('.change-badge') === null) {
          const badge = document.createElement('span');
          badge.className = 'change-badge';
          badge.textContent = tr('changes.undoneBadge', 'Undone');
          meta.append(' ', badge);
        }
      }
    };
    const undoToast = (count, putBack) => {
      const unit = changeUnit(count);
      return putBack
        ? trf('js.changePutBackToast', 'Put back: {count} {unit}', { count, unit })
        : trf('js.changeUndoToast', 'Undone: {count} {unit}', { count, unit });
    };
    // Progressive enhancement for the server-rendered card: the plain form still works without script.
    const wireRecentChanges = () => {
      for (const undoForm of document.querySelectorAll('#recent-changes .change-undo-form')) {
        undoForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const undoButton = undoForm.querySelector('button[type=submit]');
          const count = Number(undoForm.dataset.changeCount || '1');
          const putBack = undoForm.dataset.changePutback === '1';
          if (undoButton !== null) undoButton.disabled = true;
          try {
            const response = await fetch(undoForm.action, {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ next: location.pathname + location.search }).toString(),
              redirect: 'follow',
            });
            if (!response.ok) throw new Error('undo failed');
            const item = undoForm.closest('.change-item');
            markRecentChangeUndone(item === null ? '' : item.dataset.changeSet || '');
            await refreshCalendar();
            void loadConversation(true);
            showToast(undoToast(count, putBack));
          } catch {
            if (undoButton !== null) undoButton.disabled = false;
            addGuardrail(tr('changeUndoFailed', 'Could not undo that change. Try again from All changes.'));
          }
        });
      }
    };
    wireRecentChanges();
    const buildChangeCard = (change) => {
      const reverted = change.revertedAt !== null && change.revertedAt !== undefined;
      const entries = Array.isArray(change.entries) ? change.entries : [];
      const count = entries.length;
      const unit = changeUnit(count);
      const isRevert = entries.length > 0 && entries.every((entry) => entry.action === 'revert');
      const card = document.createElement('article');
      card.className = 'coach-change' + (reverted ? ' undone' : '');
      card.dataset.changeSet = change.changeSetId;
      const head = document.createElement('div');
      head.className = 'coach-change-head';
      const title = document.createElement('strong');
      title.textContent = changeHeadlineText(change);
      const meta = document.createElement('span');
      meta.className = 'coach-change-meta';
      const changedDay = localDayOf(change.createdAt);
      meta.textContent = (changedDay.length === 0 ? '' : trf('changes.changedOn', 'Changed {date}', { date: formatChangeDate(changedDay) })) + (reverted ? ' · ' + tr('changes.undoneBadge', 'Undone') : '');
      head.append(title, meta);
      card.appendChild(head);
      const sortedEntries = entries.slice().sort((left, right) => String(left.toDay || left.fromDay || '').localeCompare(String(right.toDay || right.fromDay || '')));
      if (sortedEntries.length > 0) {
        const visible = sortedEntries.slice(0, 3);
        const hidden = sortedEntries.slice(3);
        const list = document.createElement('ul');
        list.className = 'coach-change-entries';
        for (const entry of visible) {
          const item = document.createElement('li');
          item.textContent = changeEntryText(entry);
          list.appendChild(item);
        }
        card.appendChild(list);
        if (hidden.length > 0) {
          const more = document.createElement('details');
          more.className = 'coach-change-more';
          const summary = document.createElement('summary');
          summary.textContent = trf('changes.showAll', 'Show all {count}', { count: sortedEntries.length });
          const hiddenList = document.createElement('ul');
          hiddenList.className = 'coach-change-entries';
          for (const entry of hidden) {
            const item = document.createElement('li');
            item.textContent = changeEntryText(entry);
            hiddenList.appendChild(item);
          }
          more.append(summary, hiddenList);
          card.appendChild(more);
        }
      }
      const actions = document.createElement('div');
      actions.className = 'coach-change-actions';
      if (!reverted) {
        const undoForm = document.createElement('form');
        undoForm.method = 'post';
        undoForm.action = '/calendar/changes/' + encodeURIComponent(change.changeSetId) + '/revert';
        undoForm.className = 'coach-change-undo';
        const nextInput = document.createElement('input');
        nextInput.type = 'hidden';
        nextInput.name = 'next';
        nextInput.value = '/changes';
        const undoButton = document.createElement('button');
        undoButton.type = 'submit';
        undoButton.className = 'btn ghost';
        undoButton.textContent = isRevert
          ? tr('changes.putItBack', 'Put it back')
          : count === 1
            ? tr('changes.undoOne', 'Undo 1 session')
            : trf('changes.undoCount', 'Undo {count} {unit}', { count, unit });
        undoButton.setAttribute('aria-label', undoButton.textContent + ' — ' + title.textContent);
        undoForm.append(nextInput, undoButton);
        // Undo in place: the audited revert runs, the grid refreshes, and the chat stays where it is. The plain form
        // still works without script and lands on the All changes page.
        undoForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          undoButton.disabled = true;
          try {
            const response = await fetch(undoForm.action, {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ next: nextInput.value }).toString(),
              redirect: 'follow',
            });
            if (!response.ok) throw new Error('undo failed');
            card.classList.add('undone');
            undoForm.remove();
            meta.textContent = meta.textContent + ' · ' + tr('changes.undoneBadge', 'Undone');
            markRecentChangeUndone(change.changeSetId);
            await refreshCalendar();
            void loadConversation(true);
            showToast(undoToast(count, isRevert));
          } catch {
            undoButton.disabled = false;
            addGuardrail(tr('changeUndoFailed', 'Could not undo that change. Try again from All changes.'));
          }
        });
        actions.appendChild(undoForm);
      }
      const discuss = document.createElement('button');
      discuss.type = 'button';
      discuss.className = 'coach-change-ask';
      discuss.textContent = tr('changes.askWhy', 'Ask why');
      discuss.setAttribute('aria-label', discuss.textContent + ' — ' + title.textContent);
      discuss.addEventListener('click', () => {
        const range = changeRangeText(entries);
        const message = entries.length === 0 || (entries.length > 1 && range.length === 0)
          ? tr('changes.discussGeneric', 'Why did the plan change?')
          : entries.length === 1
            ? trf('changes.discussOne', 'Why did you change "{title}" on {day}?', { title: entries[0].title, day: formatChangeDate(entries[0].toDay || entries[0].fromDay, true) })
            : trf('changes.discussMany', 'Why did you change {count} {unit} for {when}?', { count, unit, when: range });
        openCoach(message, true, { kind: 'discuss-change', changeSetId: change.changeSetId, source: 'coach-dock' });
      });
      actions.appendChild(discuss);
      // Jump to the month the batch touched, so "what changed" and "where" are one tap apart.
      let month = '';
      for (const entry of entries) {
        const day = typeof entry.toDay === 'string' && entry.toDay.length >= 7 ? entry.toDay : typeof entry.fromDay === 'string' ? entry.fromDay : '';
        if (day.length >= 7) { month = day.slice(0, 7); break; }
      }
      if (/^\\d{4}-\\d{2}$/.test(month)) {
        const link = document.createElement('a');
        link.className = 'chip';
        link.href = '/calendar?month=' + month;
        link.textContent = tr('changeShow', 'Show on calendar');
        link.setAttribute('aria-label', link.textContent + ' — ' + title.textContent);
        actions.appendChild(link);
      }
      card.appendChild(actions);
      return card;
    };
    const renderChangesTab = (changes) => {
      const rows = Array.isArray(changes)
        ? changes.filter((change) => change && typeof change.changeSetId === 'string')
        : [];
      changesList.replaceChildren();
      if (rows.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'coach-tab-empty';
        empty.textContent = tr('changesEmpty', 'No changes yet. Ask the coach to plan or move something and it will appear here with an Undo.');
        changesList.appendChild(empty);
      } else {
        for (const change of rows) changesList.appendChild(buildChangeCard(change));
      }
      let newest = '';
      for (const change of rows) {
        if (typeof change.createdAt === 'string' && change.createdAt > newest) newest = change.createdAt;
      }
      changesList.dataset.newest = newest;
      // The badge marks batches newer than the last look, not every batch that can still be undone. Opening the tab
      // is the look; a first visit with no watermark shows no badge.
      const seen = readChangesSeen();
      const unseen = seen.length === 0
        ? 0
        : rows.filter((change) => (change.revertedAt === null || change.revertedAt === undefined) && typeof change.createdAt === 'string' && change.createdAt > seen).length;
      if (activeTab === 'changes') {
        writeChangesSeen(newest);
        setCount('changes', 0, tr('changesBadgeTitle', 'new coach changes'));
      } else {
        setCount('changes', unseen, tr('changesBadgeTitle', 'new coach changes'));
      }
    };
    const send = async (raw, intent) => {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text.length === 0 || sendInFlight) return;
      sendInFlight = true;
      if (sendButton !== null) sendButton.disabled = true;
      add('user', text);
      if (input.value.trim() === text) input.value = '';
      // The bare ellipsis stays the signal for a cached-append turn; a re-prefill says why it is re-reading.
      const waitReason = predictWaitReason();
      const typing = add('coach', waitReason === null ? '…' : waitReasonText(waitReason));
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
        headers: { 'content-type': 'application/json', 'x-milebook-request-id': requestId },
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
            ? tr('errNotFound', 'That run could not be found.')
            : response.status === 400
              ? tr('errBadRequest', 'That message could not be sent.')
              : tr('errUnavailable', 'The coach is unavailable right now. Try again.');
          add('error', reason);
          setRetry(text, intent);
          return;
        }
        add('coach', data.reply);
        // The server's prefill block is the truth the typing line predicted; store it for the next prediction.
        if (data.prefill !== null && typeof data.prefill === 'object') writePrefill(data.prefill);
        setSuggestions(Array.isArray(data.suggestions) && data.suggestions.length > 0 ? data.suggestions : STARTERS);
        scrollToLatest();
        if (data.sessions > 0 || (Array.isArray(data.changes) && data.changes.length > 0)) {
          await animateChanges(data.changes || []);
          add('system', tr('calendarUpdated', 'Calendar updated'));
        }
        if (data.writesAllowed === false && data.blockedWrites > 0) {
          addGuardrail(tr('calendarUnchanged', 'Calendar unchanged'));
        }
        addStateCards(data.states);
        addMuscleProposalCards(data.muscleProposals, { focus: true, fromTurn: true });
        if (Array.isArray(data.blockedByStates) && data.blockedByStates.length > 0) {
          const labels = data.blockedByStates.map((s) => (s && s.label ? String(s.label) : tr('blockedByDefault', 'a coaching state')));
          addGuardrail(tr('guardrailProtected', 'Calendar unchanged — {labels} is protecting the plan · want to talk through what would work instead?').replace('{labels}', labels.join(', ')));
        }
        addFailureCard(data.failures, text, intent);
        // The States and Changes tabs read the same durable rows the reply just touched; one refresh keeps them in
        // step with the calendar and the log without a page load.
        void loadConversation(true);
      } catch {
        typing.remove();
        add('error', tr('errNetwork', 'Network error. Try again.'));
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
    dayMenu.setAttribute('aria-label', tr('dayMenuAria', 'Day actions'));
    document.body.appendChild(dayMenu);
    let menuDay = '';
    const closeDayMenu = () => { dayMenu.hidden = true; };
    const formatDay = (day) => new Date(day + 'T00:00:00Z').toLocaleDateString(pageLocale, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
    const formatShortDay = (day) => new Date(day + 'T00:00:00Z').toLocaleDateString(pageLocale, {
      day: 'numeric', month: 'short', timeZone: 'UTC',
    });
    const failureLabel = (action) => action === 'remove' ? tr('actionRemove', 'Delete') : action === 'update' ? tr('actionUpdate', 'Update') : tr('actionAdd', 'Add');
    const failureReason = (reason) => reason === 'missing-session-id' ? tr('reasonMissing', 'no session was specified') : tr('reasonGone', 'that session no longer exists');
    const addFailureCard = (failures, retryText, retryIntent) => {
      if (!Array.isArray(failures) || failures.length === 0) return;
      const card = document.createElement('div');
      card.className = 'bubble failure';
      card.setAttribute('role', 'status');
      const head = document.createElement('strong');
      head.textContent = tr('failHead', 'Could not apply');
      card.appendChild(head);
      const list = document.createElement('ul');
      const days = [];
      for (const raw of failures) {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
        const action = typeof raw.action === 'string' ? raw.action : 'update';
        const title = typeof raw.title === 'string' && raw.title.trim().length > 0 ? raw.title.trim() : tr('sessionWord', 'session');
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
        button.textContent = tr('showDay', 'Show') + ' ' + formatShortDay(day);
        button.addEventListener('click', () => { void send('What is planned on ' + day + '?', { kind: 'review-day', day, source: 'day-menu' }); });
        actions.appendChild(button);
      }
      const retry = typeof retryText === 'string' ? retryText.trim() : '';
      if (retry.length > 0) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = tr('retry', 'Try again');
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
      setTab('chat');
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
      closeButton.setAttribute('aria-label', tr('dayCloseAria', 'Close day actions'));
      closeButton.addEventListener('click', closeDayMenu);
      header.append(title, closeButton);
      dayMenu.appendChild(header);
      const hasSessions = cell.querySelectorAll('.cal-pill.plan').length > 0;
      const choices = [
        ['add', tr('dayAdd', 'Add a session here'), false],
        ['move', tr('dayMove', 'Move a session here'), false],
        ['delete', tr('dayDelete', 'Delete a session here'), true, !hasSessions],
        ['ask', tr('dayAsk', 'Ask coach about this day'), true],
        ['view', tr('dayView', 'View day details'), true],
      ];
      for (const [action, label, sendNow, disabled] of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.dataset.action = action;
        button.textContent = label;
        button.disabled = disabled === true;
        if (disabled === true) button.title = tr('dayNoSession', 'No session on this day');
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
    monthPicker.setAttribute('aria-label', tr('monthPickerAria', 'Choose month and year'));
    // Month names come from the page locale via Intl, so the picker localizes for free with the language switch.
    const monthDate = (index) => new Date(Date.UTC(2024, index, 1));
    const monthShort = (index) => monthDate(index).toLocaleDateString(pageLocale, { month: 'short', timeZone: 'UTC' });
    const monthLong = (index) => monthDate(index).toLocaleDateString(pageLocale, { month: 'long', timeZone: 'UTC' });
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
      title.textContent = tr('monthChoose', 'Choose month');
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', tr('monthCloseAria', 'Close month picker'));
      closeButton.addEventListener('click', closeMonthPicker);
      head.append(title, closeButton);
      monthPicker.appendChild(head);
      const yearRow = document.createElement('label');
      yearRow.className = 'month-picker-year';
      const yearLabel = document.createElement('span');
      yearLabel.textContent = tr('year', 'Year');
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
      for (let index = 0; index < 12; index += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.month = String(index + 1).padStart(2, '0');
        button.textContent = monthShort(index);
        button.setAttribute('aria-label', monthLong(index));
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
      thisButton.textContent = tr('thisMonth', 'This month');
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
    peekClose.setAttribute('aria-label', tr('peekClose', 'Close details'));
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
      const fallback = kind === 'session' ? tr('peekPlannedSession', 'Planned session') : tr('recordedRun', 'Recorded run');
      peekTitle.textContent = title.length > 0 ? title : fallback;
      peekDay.textContent = day.length > 0 ? formatDay(day) : '';
      peekBody.replaceChildren(peekNote(kind === 'session' ? tr('loadingSession', 'Loading session details…') : tr('loadingRun', 'Loading run details…')));
      peekActions.replaceChildren();
    };
    const renderPeekError = (kind, id, day) => {
      if (kind === 'session') {
        peekBody.replaceChildren(peekNote(tr('peekErrSession', 'Could not load this session just now. Open the day or tap the pill again.')));
        peekActions.replaceChildren(peekLink('btn peek-primary', '/day/' + day, tr('peekViewDay', 'View day') + ' →'));
        return;
      }
      peekBody.replaceChildren(peekNote(tr('peekErrRun', 'Could not load this run just now. Open the full detail or tap the pill again.')));
      peekActions.replaceChildren(
        peekLink('btn peek-primary', '/activity/' + encodeURIComponent(id), tr('peekOpenDetail', 'Open full detail →')),
        peekLink('chip', '/day/' + day, tr('peekViewDay', 'View day')),
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
        ['peek-step-intensity', tr('stepColStep', 'Step')],
        ['peek-step-duration', tr('stepColDuration', 'Duration')],
        ['peek-step-target', tr('stepColTarget', 'Target')],
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
      if (total > steps.length) container.append(peekNote('+' + (total - steps.length) + ' ' + tr('moreStepsSuffix', 'more steps in the activity detail.')));
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
        planRow.append(peekChip('chip match-' + status, typeof plan.label === 'string' ? plan.label : tr('unplanned', 'Unplanned')));
        const planText = document.createElement('span');
        const hasPlan = typeof plan.title === 'string' && plan.title.length > 0;
        planText.className = hasPlan ? 'peek-plan-text' : 'peek-plan-text muted';
        planText.textContent = hasPlan
          ? plan.title + (typeof plan.planned === 'string' && plan.planned.length > 0 ? ' · ' + plan.planned : '')
          : tr('noPlanMatch', 'No planned session matched this run.');
        planRow.append(planText);
        peekBody.append(planRow);
      }
      const program = data.program !== null && typeof data.program === 'object' ? data.program : null;
      if (program !== null) {
        const box = document.createElement('div');
        box.className = 'peek-program';
        const head = document.createElement('div');
        head.className = 'peek-program-head';
        head.append(peekChip('chip peek-program-chip', tr('eyebrowProgram', 'Training program · Garmin')));
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
          label.textContent = tr('fastestPrefix', 'Fastest') + ' ' + (typeof effort.label === 'string' ? effort.label : '');
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
      ask.textContent = tr('askCoach', 'Ask coach');
      if (typeof data.coachPrompt === 'string' && data.coachPrompt.length > 0) ask.setAttribute('data-coach-message', data.coachPrompt);
      else ask.disabled = true;
      if (data.coachIntent !== null && typeof data.coachIntent === 'object' && !Array.isArray(data.coachIntent)) {
        ask.setAttribute('data-coach-intent', JSON.stringify(data.coachIntent));
      }
      peekActions.append(
        peekLink('btn peek-primary', links.detail, tr('peekOpenDetail', 'Open full detail →')),
        ask,
        peekLink('chip', links.day, tr('peekViewDay', 'View day')),
        peekLink('chip', links.week, tr('peekTrainingWeek', 'Training log week')),
      );
    };
    const renderSessionPeek = (data) => {
      peekTitle.textContent = typeof data.title === 'string' ? data.title : tr('peekPlannedSession', 'Planned session');
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
        row.append(peekChip('chip peek-status-' + status, typeof outcome.label === 'string' ? outcome.label : tr('peekPlanned', 'Planned')));
        const detail = document.createElement('span');
        const detailText = typeof outcome.detail === 'string' ? outcome.detail : '';
        detail.className = detailText.length > 0 ? 'peek-plan-text' : 'peek-plan-text muted';
        detail.textContent = detailText.length > 0 ? detailText : tr('peekNoRun', 'No run recorded for this session yet.');
        row.append(detail);
        peekBody.append(row);
      }
      const links = data.links !== null && typeof data.links === 'object' ? data.links : {};
      const ask = document.createElement('button');
      ask.type = 'button';
      ask.className = 'coach-ask';
      ask.textContent = tr('askCoach', 'Ask coach');
      if (typeof data.coachPrompt === 'string' && data.coachPrompt.length > 0) ask.setAttribute('data-coach-message', data.coachPrompt);
      else ask.disabled = true;
      if (data.coachIntent !== null && typeof data.coachIntent === 'object' && !Array.isArray(data.coachIntent)) {
        ask.setAttribute('data-coach-intent', JSON.stringify(data.coachIntent));
      }
      const actions = [
        peekLink('btn peek-primary', links.day, tr('peekViewDay', 'View day') + ' →'),
        ask,
      ];
      const move = document.createElement('button');
      move.type = 'button';
      move.className = 'chip';
      move.textContent = tr('move', 'Move');
      move.setAttribute('data-coach-send', 'false');
      move.setAttribute('data-coach-message', 'Move my ' + (typeof data.title === 'string' ? data.title : 'session') + ' on ' + (typeof data.dayLabel === 'string' ? data.dayLabel : '') + ' to ');
      move.setAttribute('data-coach-intent', JSON.stringify({ kind: 'plan', day: data.day, source: 'session-peek' }));
      actions.push(move);
      if (typeof links.activity === 'string' && links.activity.length > 0) actions.push(peekLink('chip', links.activity, tr('peekOpenRun', 'Open run')));
      actions.push(peekLink('chip', links.week, tr('peekTrainingWeek', 'Training log week')));
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
      peekClose.setAttribute('aria-label', kind === 'session' ? tr('peekCloseSession', 'Close session details') : tr('peekCloseRun', 'Close run details'));
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
      if (!panel.hidden) { track('coach-close', 'escape'); minimizePanel(); }
    });
    window.addEventListener('resize', () => {
      if (!peek.hidden && peekTrigger !== null) positionPeek(peekTrigger);
    });
    window.addEventListener('resize', syncCoachInert);
    window.addEventListener('scroll', () => closeActivityPeek(false), { passive: true });

    bubble.addEventListener('click', () => show(true));
    minimize.addEventListener('click', minimizePanel);
    close.addEventListener('click', minimizePanel);
    // The tab strip is a real tablist: click or Left/Right/Home/End, one panel visible at a time.
    for (const tab of tabs) {
      tab.addEventListener('click', () => setTab(tab.dataset.coachTab || 'chat'));
    }
    const tabStrip = panel.querySelector('.coach-tabs');
    if (tabStrip !== null) {
      tabStrip.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
        const current = tabs.indexOf(document.activeElement);
        if (current < 0) return;
        event.preventDefault();
        const last = tabs.length - 1;
        const nextIndex = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : event.key === 'ArrowRight'
              ? (current === last ? 0 : current + 1)
              : (current === 0 ? last : current - 1);
        const next = tabs[nextIndex];
        if (next === undefined) return;
        setTab(next.dataset.coachTab || 'chat', { focus: true });
      });
    }
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
    // Page segmented controls are URL-addressable: the server reads ?tab=..., and this keeps the URL in sync on
    // change and restores the checked segment on back/forward. The radios stay the no-JS path.
    for (const group of document.querySelectorAll('.seg-tabs')) {
      for (const input of group.querySelectorAll('.seg-input')) {
        input.addEventListener('change', () => {
          if (!input.checked) return;
          const url = new URL(location.href);
          url.searchParams.set('tab', input.value);
          window.history.pushState({ tab: input.value }, '', url);
        });
      }
    }
    window.addEventListener('popstate', () => {
      const tab = new URL(location.href).searchParams.get('tab');
      for (const group of document.querySelectorAll('.seg-tabs')) {
        const inputs = [...group.querySelectorAll('.seg-input')];
        const match = inputs.find((input) => input.value === tab) ?? inputs[0];
        if (match !== undefined) match.checked = true;
      }
    });
  })();
  </script>`;
}

/**
 * Turns an auth error code (carried through a redirect query) into a localized message. Unknown or legacy values
 * fall back to the page's generic error text, so a stray value never leaks a developer-facing English string.
 */
function authErrorText(code: string | undefined, fallbackKey: MessageKey, tx: Translator): string | undefined {
  if (code === undefined) return undefined;
  switch (code) {
    case "invalid-credentials":
      return tx.t("authErr.invalidCredentials");
    case "username-taken":
      return tx.t("authErr.usernameTaken");
    case "invalid-input":
      return tx.t("authErr.invalidInput");
    case "not-found":
      return tx.t("authErr.notFound");
    case "invalid-current-password":
      return tx.t("authErr.invalidCurrentPassword");
    case "confirm-mismatch":
      return tx.t("authErr.confirmMismatch");
    default:
      return tx.t(fallbackKey);
  }
}

const SITE_MARK = `<span class="site-mark" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M6 25V8l10 10L26 7v18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="8" r="1.8" fill="currentColor"/></svg></span>`;

const AUTH_ICON_LOCK = `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const AUTH_ICON_CALENDAR = `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="3" y="4" width="14" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 8h14M7 2.5V5M13 2.5V5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const AUTH_ICON_ROUTE = `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M2 14.5l4.5-6 3.8 4.2 3.2-3.2 4.5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="2.5" cy="14.5" r="1.2" fill="currentColor"/></svg>`;

const AUTH_EYE_ICONS = `<svg class="auth-eye" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><svg class="auth-eye-off" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.4-6 9.5-6c2 0 3.7.7 5.1 1.7M21.5 12s-3.4 6-9.5 6c-2 0-3.7-.7-5.1-1.7M4 4l16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The curated IANA zones offered on sign-up. The browser may add the device's zone when it is not in this list. */
const AUTH_TIMEZONE_GROUPS: ReadonlyArray<{ label: MessageKey; zones: readonly string[] }> = [
  {
    label: "auth.timezone.asiaPacific",
    zones: [
      "Asia/Taipei",
      "Asia/Hong_Kong",
      "Asia/Tokyo",
      "Asia/Seoul",
      "Asia/Shanghai",
      "Asia/Singapore",
      "Asia/Bangkok",
      "Asia/Jakarta",
      "Asia/Kolkata",
      "Australia/Sydney",
      "Australia/Perth",
      "Pacific/Auckland",
    ],
  },
  {
    label: "auth.timezone.europeAfrica",
    zones: [
      "Europe/London",
      "Europe/Dublin",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Amsterdam",
      "Europe/Stockholm",
      "Europe/Warsaw",
      "Europe/Istanbul",
      "Africa/Johannesburg",
      "Africa/Cairo",
    ],
  },
  {
    label: "auth.timezone.americas",
    zones: [
      "America/New_York",
      "America/Toronto",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Vancouver",
      "America/Mexico_City",
      "America/Sao_Paulo",
      "America/Bogota",
      "America/Santiago",
    ],
  },
  { label: "auth.timezone.utc", zones: ["UTC"] },
];

function authTimezoneOffset(zone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((entry) => entry.type === "timeZoneName")?.value;
    if (part === undefined) return "UTC";
    const offset = part.replace(/^GMT/, "UTC");
    return offset === "UTC" ? "UTC+0" : offset;
  } catch {
    return "UTC";
  }
}

function renderAuthTimezoneOptions(tx: Translator): string {
  return AUTH_TIMEZONE_GROUPS.map((group) => {
    const options = group.zones.map((zone) => {
      const selected = zone === "Asia/Hong_Kong" ? " selected" : "";
      return `<option value="${escapeHtml(zone)}"${selected}>${escapeHtml(zone)} · ${escapeHtml(authTimezoneOffset(zone))}</option>`;
    }).join("");
    return `<optgroup label="${escapeHtml(tx.t(group.label))}">${options}</optgroup>`;
  }).join("");
}

interface AuthErrorInfo {
  title: string;
  message: string;
  fields: readonly string[];
  link?: { href: string; label: string };
}

function authErrorInfo(code: string | undefined, mode: "login" | "signup", tx: Translator): AuthErrorInfo | undefined {
  if (code === undefined) return undefined;
  const signupTitle = tx.t("error.couldNotCreateAccount");
  const loginTitle = tx.t("error.couldNotSignIn");
  const title = mode === "signup" ? signupTitle : loginTitle;
  const credentials = ["username", "password"];
  const signupFields = ["username", "displayName", "password", "timezone", "goal"];
  switch (code) {
    case "invalid-credentials":
      return { title: loginTitle, message: tx.t("authErr.invalidCredentials"), fields: credentials };
    case "username-taken":
      return { title: signupTitle, message: tx.t("authErr.usernameTaken"), fields: ["username"], link: { href: "#username", label: tx.t("auth.error.chooseUsername") } };
    case "invalid-input":
      return { title, message: tx.t("authErr.invalidInput"), fields: mode === "signup" ? signupFields : credentials };
    case "not-found":
      return { title: loginTitle, message: tx.t("authErr.notFound"), fields: ["username"], link: { href: "#username", label: tx.t("auth.error.checkUsername") } };
    default:
      return { title, message: tx.t("authErr.invalidInput"), fields: [] };
  }
}

function authInvalid(info: AuthErrorInfo | undefined, field: string): string {
  return info !== undefined && info.fields.includes(field) ? ' aria-invalid="true"' : "";
}

function authDescribedBy(info: AuthErrorInfo | undefined, field: string, ids: readonly string[]): string {
  const list = [...ids];
  if (info !== undefined && info.fields.includes(field)) list.push("auth-error");
  return list.length > 0 ? ` aria-describedby="${list.join(" ")}"` : "";
}

function renderAuthError(info: AuthErrorInfo): string {
  const E = escapeHtml;
  return `<div class="auth-error" id="auth-error" role="alert" aria-atomic="true" tabindex="-1">
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.6v5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14.1" r="1" fill="currentColor"/></svg>
    <div><p class="auth-error-title">${E(info.title)}</p> <p class="auth-error-message">${E(info.message)}${info.link === undefined ? "" : ` <a class="auth-error-link" href="${E(info.link.href)}">${E(info.link.label)}</a>`}</p></div>
  </div>`;
}

function renderAuthStory(tx: Translator): string {
  const E = escapeHtml;
  const proof = [
    { icon: AUTH_ICON_LOCK, text: tx.t("auth.story.pointPrivate") },
    { icon: AUTH_ICON_CALENDAR, text: tx.t("auth.story.pointCoach") },
    { icon: AUTH_ICON_ROUTE, text: tx.t("auth.story.pointLongRun") },
  ].map((item) => `<li>${item.icon}<span>${E(item.text)}</span></li>`).join("");
  return `<section class="auth-story" aria-labelledby="auth-story-title">
    <img class="auth-story-bg" src="/static/auth-hero.webp" alt="" width="1024" height="1280" fetchpriority="high" decoding="async">
    <div class="auth-story-shade" aria-hidden="true"></div>
    <div class="auth-story-inner">
      <a class="auth-brand" href="/login" data-track="auth-brand">${SITE_MARK}<span>${E(tx.t("app.name"))}</span></a>
      <p class="auth-eyebrow">${E(tx.t("auth.story.eyebrow"))}</p>
      <h1 class="auth-story-title" id="auth-story-title">${E(tx.t("auth.story.heading"))}</h1>
      <p class="auth-story-sub">${E(tx.t("auth.story.subtitle"))}</p>
      <ul class="auth-proof">${proof}</ul>
      <p class="auth-story-note">${E(tx.t("auth.story.note"))}</p>
    </div>
    <img class="auth-object" src="/static/calendar-object.webp" alt="" width="1200" height="899" fetchpriority="low" decoding="async">
  </section>`;
}

function renderAuthPanel(mode: "login" | "signup", info: AuthErrorInfo | undefined, tx: Translator): string {
  const E = escapeHtml;
  const isSignup = mode === "signup";
  const usernameLabel = E(tx.t(isSignup ? "signup.username" : "login.username"));
  const passwordLabel = E(tx.t(isSignup ? "signup.password" : "login.password"));
  const submitLabel = tx.t(isSignup ? "auth.signup.submit" : "auth.login.submit");
  const busyLabel = tx.t(isSignup ? "auth.signup.submitBusy" : "auth.login.submitBusy");
  const usernameServerInvalid = info !== undefined && info.fields.includes("username") ? ' data-server-invalid="true"' : "";
  const usernameHint = isSignup ? `<p class="auth-hint" id="username-hint">${E(tx.t("auth.username.hint"))}</p>` : "";
  const passwordHint = isSignup ? `<p class="auth-hint" id="password-hint">${E(tx.t("auth.password.hint"))}</p>` : "";
  const passwordStrength = isSignup
    ? `<div class="auth-strength" id="password-strength" data-score="0" hidden>
        <div class="auth-strength-bars" role="meter" aria-label="${E(tx.t("auth.password.strengthLabel"))}" aria-valuemin="0" aria-valuemax="3" aria-valuenow="0"><span class="auth-strength-bar"></span><span class="auth-strength-bar"></span><span class="auth-strength-bar"></span></div>
        <p class="auth-strength-text" id="password-strength-text" aria-live="polite"></p>
      </div>`
    : "";
  const usernameDescribedBy = authDescribedBy(info, "username", isSignup ? ["username-hint", "username-error"] : ["username-error"]);
  const passwordDescribedBy = authDescribedBy(info, "password", isSignup ? ["password-hint", "password-strength-text", "password-error"] : ["password-error"]);
  const displayNameDescribedBy = authDescribedBy(info, "displayName", ["displayName-error"]);
  const timezoneDescribedBy = authDescribedBy(info, "timezone", ["timezone-hint", "timezone-error"]);
  const goalDescribedBy = authDescribedBy(info, "goal", ["goal-hint"]);
  const usernameError = `<p class="auth-field-error" id="username-error" role="alert" hidden></p>`;
  const displayNameError = `<p class="auth-field-error" id="displayName-error" role="alert" hidden></p>`;
  const passwordError = `<p class="auth-field-error" id="password-error" role="alert" hidden></p>`;
  const timezoneError = `<p class="auth-field-error" id="timezone-error" role="alert" hidden></p>`;
  const fields = [
    `<div class="auth-field">
      <div class="auth-label-row"><label for="username">${usernameLabel}</label></div>
      <input id="username" name="username" type="text" required autocomplete="username" minlength="3" maxlength="24"${isSignup ? ' pattern="[a-z0-9_]{3,24}"' : ""} spellcheck="false" autocapitalize="none" autocorrect="off" enterkeyhint="next" data-auth-persist="username"${usernameServerInvalid}${authInvalid(info, "username")}${usernameDescribedBy}>
      ${usernameHint}
      ${usernameError}
    </div>`,
    isSignup
      ? `<div class="auth-field">
          <label for="displayName">${E(tx.t("signup.displayName"))}</label>
          <input id="displayName" name="displayName" type="text" required autocomplete="name" maxlength="60" data-auth-persist="displayName"${authInvalid(info, "displayName")}${displayNameDescribedBy}>
          ${displayNameError}
        </div>`
      : "",
    `<div class="auth-field">
      <div class="auth-label-row"><label for="password">${passwordLabel}</label></div>
      <div class="auth-password">
        <input id="password" name="password" type="password" required autocomplete="${isSignup ? "new-password" : "current-password"}" minlength="8" spellcheck="false" autocapitalize="none" autocorrect="off" enterkeyhint="go"${authInvalid(info, "password")}${passwordDescribedBy}>
        <button class="auth-reveal" id="password-toggle" type="button" aria-controls="password" aria-pressed="false" aria-label="${E(tx.t("auth.password.show"))}" hidden>${AUTH_EYE_ICONS}</button>
      </div>
      ${passwordHint}
      <p class="auth-caps" id="password-caps" role="status" hidden>${E(tx.t("auth.password.caps"))}</p>
      ${passwordStrength}
      ${passwordError}
    </div>`,
    isSignup
      ? `<div class="auth-field">
          <label for="timezone">${E(tx.t("signup.timezone"))}</label>
          <select id="timezone" name="timezone" required autocomplete="off" data-auth-persist="timezone"${authInvalid(info, "timezone")}${timezoneDescribedBy}>${renderAuthTimezoneOptions(tx)}</select>
          <p class="auth-hint" id="timezone-hint" data-auth-tz-hint>${E(tx.t("auth.timezone.hint"))}</p>
          ${timezoneError}
        </div>`
      : "",
    isSignup
      ? `<details class="auth-goal-disclosure"${info !== undefined && info.fields.includes("goal") ? " open" : ""}>
          <summary><span class="auth-goal-summary-label">${E(tx.t("auth.goal.disclosure"))} <span class="auth-goal-saved" data-auth-goal-saved hidden>${E(tx.t("auth.goal.saved"))}</span></span></summary>
          <div class="auth-field auth-goal-field">
            <label class="sr-only" for="goal">${E(tx.t("signup.goal"))}</label>
            <input id="goal" name="goal" type="text" maxlength="120" autocomplete="off" data-auth-persist="goal"${authInvalid(info, "goal")}${goalDescribedBy}>
            <p class="auth-hint" id="goal-hint">${E(tx.t("auth.goal.hint"))}</p>
            <div class="auth-goal-chips" role="group" aria-label="${E(tx.t("auth.goal.picksAria"))}" hidden>
              <button class="auth-goal-chip" type="button" data-auth-goal="${E(tx.t("auth.goal.pick1"))}" data-track="auth-goal">${E(tx.t("auth.goal.pick1"))}</button>
              <button class="auth-goal-chip" type="button" data-auth-goal="${E(tx.t("auth.goal.pick2"))}" data-track="auth-goal">${E(tx.t("auth.goal.pick2"))}</button>
              <button class="auth-goal-chip" type="button" data-auth-goal="${E(tx.t("auth.goal.pick3"))}" data-track="auth-goal">${E(tx.t("auth.goal.pick3"))}</button>
            </div>
          </div>
        </details>`
      : "",
  ].filter((field) => field.length > 0).join("");
  const foot = isSignup
    ? `<p class="auth-switch-line">${E(tx.t("auth.signup.haveAccount"))} <a href="/login" data-track="auth-mode" data-track-value="login">${E(tx.t("auth.signup.signin"))}</a></p>`
    : `<p class="auth-switch-line">${E(tx.t("auth.login.newHere"))} <a href="/signup" data-track="auth-mode" data-track-value="signup">${E(tx.t("auth.login.createAccount"))}</a></p>
       <details class="auth-help"><summary>${E(tx.t("auth.help.summary"))}</summary><p>${E(tx.t("auth.help.body"))}</p><a href="/signup">${E(tx.t("auth.help.signup"))}</a></details>`;
  return `<main id="auth-main" class="auth-panel" tabindex="-1">
    <div class="auth-panel-top">${renderLanguageSwitch(tx, "auth-lang")}</div>
    <div class="auth-panel-body">
      <nav class="auth-mode" data-mode="${mode}" aria-label="${E(tx.t("auth.mode.aria"))}">
        <a class="auth-mode-link" href="/login"${isSignup ? "" : ' aria-current="page"'} data-track="auth-mode" data-track-value="login">${E(tx.t("login.title"))}</a>
        <a class="auth-mode-link" href="/signup"${isSignup ? ' aria-current="page"' : ""} data-track="auth-mode" data-track-value="signup">${E(tx.t("signup.title"))}</a>
      </nav>
      <div class="auth-head">
        <p class="auth-eyebrow">${E(tx.t(isSignup ? "auth.signup.eyebrow" : "auth.login.eyebrow"))}</p>
        <h2 id="auth-heading">${E(tx.t(isSignup ? "auth.signup.heading" : "auth.login.heading"))}</h2>
        <p class="auth-sub">${E(tx.t(isSignup ? "auth.signup.subtitle" : "auth.login.subtitle"))}</p>
      </div>
      ${info === undefined ? "" : renderAuthError(info)}
      <form class="auth-form" method="post" action="${isSignup ? "/signup" : "/login"}" aria-labelledby="auth-heading" novalidate${info === undefined ? "" : ' aria-describedby="auth-error"'}>
        ${fields}
        <button class="auth-submit" type="submit" data-auth-submit data-label-default="${E(submitLabel)}" data-busy-label="${E(busyLabel)}" data-track="auth-submit" data-track-value="${mode}">
          <span class="auth-submit-label">${E(submitLabel)}</span>
          <span class="auth-submit-arrow" aria-hidden="true">→</span>
          <span class="auth-spinner" aria-hidden="true"></span>
        </button>
      </form>
      <div class="auth-foot">${foot}</div>
    </div>
  </main>`;
}

function renderAuthScript(): string {
  return `<script>
  (() => {
    const ui = window.__I18N__ || {};
    const tr = (key, fallback) => (typeof ui[key] === 'string' ? ui[key] : fallback);
    const page = document.querySelector('.auth-page');
    const form = document.querySelector('.auth-form');
    if (!page || !form) return;
    const mode = page.getAttribute('data-mode') === 'signup' ? 'signup' : 'login';
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    const reveal = document.getElementById('password-toggle');
    const caps = document.getElementById('password-caps');
    const strength = document.getElementById('password-strength');
    const strengthText = document.getElementById('password-strength-text');
    const strengthMeter = strength ? strength.querySelector('[role="meter"]') : null;
    const usernameError = document.getElementById('username-error');
    const usernameHint = document.getElementById('username-hint');
    const displayName = document.getElementById('displayName');
    const displayNameError = document.getElementById('displayName-error');
    const passwordError = document.getElementById('password-error');
    const passwordHint = document.getElementById('password-hint');
    const timezoneError = document.getElementById('timezone-error');
    const submit = form.querySelector('[data-auth-submit]');
    const submitLabel = submit ? submit.querySelector('.auth-submit-label') : null;
    const busyLabel = submit ? submit.getAttribute('data-busy-label') || '' : '';
    const persistFields = Array.from(document.querySelectorAll('[data-auth-persist]'));
    const storageKey = 'milebook.auth.' + mode;
    const hasError = new URLSearchParams(location.search).has('error');
    const readSaved = () => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : {};
      } catch (error) {
        return {};
      }
    };
    const writeSaved = (values) => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(values));
      } catch (error) {
        // Private mode or a full storage quota: the page still works without persistence.
      }
    };
    const save = () => {
      const values = {};
      for (const field of persistFields) {
        if (field.name) values[field.name] = field.value;
      }
      writeSaved(values);
    };
    const saved = hasError ? readSaved() : {};
    const offsetLabel = (zone) => {
      try {
        const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((entry) => entry.type === 'timeZoneName');
        if (!part) return 'UTC';
        const offset = part.value.replace('GMT', 'UTC');
        return offset === 'UTC' ? 'UTC+0' : offset;
      } catch (error) {
        return 'UTC';
      }
    };
    const timezone = document.getElementById('timezone');
    const timezoneHint = document.querySelector('[data-auth-tz-hint]');
    const ensureTimezone = (zone) => {
      if (!timezone) return;
      if (!Array.from(timezone.options).some((option) => option.value === zone)) {
        const option = document.createElement('option');
        option.value = zone;
        option.textContent = zone + ' · ' + offsetLabel(zone);
        timezone.appendChild(option);
      }
    };
    if (saved && typeof saved === 'object') {
      for (const field of persistFields) {
        const value = saved[field.name];
        if (typeof value !== 'string' || value.length === 0) continue;
        if (field instanceof HTMLSelectElement) {
          ensureTimezone(value);
          field.value = value;
        } else if (field instanceof HTMLInputElement && field.value.length === 0) {
          field.value = value;
        }
      }
    }
    const savedTimezone = saved && typeof saved.timezone === 'string' ? saved.timezone : '';
    const goalSaved = document.querySelector('[data-auth-goal-saved]');
    if (goalSaved && saved && typeof saved.goal === 'string' && saved.goal.length > 0) goalSaved.hidden = false;
    if (timezone && savedTimezone.length === 0) {
      let detected = '';
      try {
        detected = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch (error) {
        detected = '';
      }
      if (detected.length > 0) {
        ensureTimezone(detected);
        timezone.value = detected;
        if (timezoneHint) timezoneHint.textContent = tr('authTzDetected', 'Detected {zone}. Change it if needed.').replace('{zone}', detected);
      }
    }
    for (const field of persistFields) {
      field.addEventListener('input', save);
      field.addEventListener('change', save);
    }
    if (reveal && password) {
      reveal.hidden = false;
      reveal.addEventListener('click', () => {
        const showing = password.type === 'password';
        password.type = showing ? 'text' : 'password';
        reveal.setAttribute('aria-pressed', showing ? 'true' : 'false');
        reveal.setAttribute('aria-label', tr(showing ? 'authHidePassword' : 'authShowPassword', showing ? 'Hide password' : 'Show password'));
        reveal.classList.toggle('is-visible', showing);
        password.focus({ preventScroll: true });
      });
    }
    if (caps && password) {
      const updateCaps = (event) => {
        if (typeof event.getModifierState !== 'function') return;
        caps.hidden = !(event.getModifierState('CapsLock') && document.activeElement === password);
      };
      password.addEventListener('keydown', updateCaps);
      password.addEventListener('keyup', updateCaps);
      password.addEventListener('blur', () => { caps.hidden = true; });
    }
    if (strength && strengthText && strengthMeter && password) {
      const updateStrength = () => {
        const value = password.value;
        if (value.length === 0) {
          strength.hidden = true;
          strength.setAttribute('data-score', '0');
          strength.removeAttribute('data-tone');
          strengthMeter.setAttribute('aria-valuenow', '0');
          strengthMeter.removeAttribute('aria-valuetext');
          strengthText.textContent = '';
          return;
        }
        let score = 1;
        let tone = 'danger';
        let label = tr('authTooShort', 'Use at least 8 characters.');
        if (value.length >= 16) {
          score = 3;
          tone = 'ok';
          label = tr('authStrong', 'Strong — a long passphrase.');
        } else if (value.length >= 12) {
          score = 2;
          tone = 'ok';
          label = tr('authGood', 'Good — a longer passphrase is stronger.');
        } else if (value.length >= 8) {
          tone = 'warn';
          label = tr('authFair', 'Fair — add a few more characters.');
        }
        if (value.length >= 12) {
          const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((rule) => rule.test(value)).length;
          if (classes >= 3) {
            score = 3;
            tone = 'ok';
            label = tr('authStrong', 'Strong — a long passphrase.');
          }
        }
        strength.hidden = false;
        strength.setAttribute('data-score', String(score));
        strength.setAttribute('data-tone', tone);
        strengthMeter.setAttribute('aria-valuenow', String(score));
        strengthMeter.setAttribute('aria-valuetext', label);
        if (strengthText.textContent !== label) strengthText.textContent = label;
      };
      password.addEventListener('input', updateStrength);
      updateStrength();
    }
    if (username && usernameError && mode === 'signup') {
      const validateUsername = () => {
        if (username.getAttribute('data-server-invalid') === 'true') return;
        const value = username.value.trim();
        if (value.length === 0) {
          usernameError.hidden = true;
          usernameError.textContent = '';
          username.removeAttribute('aria-invalid');
          if (usernameHint) usernameHint.hidden = false;
          return;
        }
        const valid = /^[a-z0-9_]{3,24}$/.test(value);
        usernameError.textContent = valid ? '' : tr('authUsernameInvalid', 'Use 3–24 lowercase letters, numbers or underscores.');
        usernameError.hidden = valid;
        if (usernameHint) usernameHint.hidden = !valid;
        if (valid) username.removeAttribute('aria-invalid');
        else username.setAttribute('aria-invalid', 'true');
      };
      username.addEventListener('blur', validateUsername);
      username.addEventListener('input', () => {
        usernameError.hidden = true;
        usernameError.textContent = '';
        if (username.getAttribute('data-server-invalid') === 'true') {
          username.removeAttribute('data-server-invalid');
          username.removeAttribute('aria-invalid');
        }
      });
    }
    const goal = document.getElementById('goal');
    const goalChips = document.querySelector('.auth-goal-chips');
    const errorLink = document.querySelector('.auth-error-link');
    if (errorLink) {
      errorLink.addEventListener('click', () => {
        const href = errorLink.getAttribute('href') || '';
        const target = href.startsWith('#') ? document.getElementById(href.slice(1)) : null;
        if (target instanceof HTMLElement) target.focus({ preventScroll: true });
      });
    }
    if (goal && goalChips) {
      goalChips.hidden = false;
      for (const chip of goalChips.querySelectorAll('[data-auth-goal]')) {
        chip.addEventListener('click', () => {
          goal.value = chip.getAttribute('data-auth-goal') || '';
          goal.dispatchEvent(new Event('input', { bubbles: true }));
          goal.focus({ preventScroll: true });
        });
      }
    }
    const clearFieldError = (input, error) => {
      if (error) {
        error.hidden = true;
        error.textContent = '';
      }
      if (input) input.removeAttribute('aria-invalid');
      if (input === username && usernameHint) usernameHint.hidden = false;
      if (input === password) {
        if (passwordHint) passwordHint.hidden = false;
        if (strength && password && password.value.length > 0 && strength.getAttribute('data-score') !== '0') strength.hidden = false;
      }
      if (input === timezone && timezoneHint) timezoneHint.hidden = false;
    };
    const showFieldError = (input, error, message) => {
      if (!input || !error) return;
      error.textContent = message;
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      if (input === username && usernameHint) usernameHint.hidden = true;
      if (input === password) {
        if (passwordHint) passwordHint.hidden = true;
        if (strength) strength.hidden = true;
      }
      if (input === timezone && timezoneHint) timezoneHint.hidden = true;
    };
    const validateFields = () => {
      let firstInvalid = null;
      const required = (input, error, message) => {
        if (!input) return true;
        if (input.value.trim().length === 0) {
          showFieldError(input, error, message);
          if (!firstInvalid) firstInvalid = input;
          return false;
        }
        clearFieldError(input, error);
        return true;
      };
      required(username, usernameError, tr('authUsernameRequired', 'Enter a username.'));
      if (mode === 'signup') {
        if (username && username.value.trim().length > 0 && !/^[a-z0-9_]{3,24}$/.test(username.value.trim())) {
          showFieldError(username, usernameError, tr('authUsernameInvalid', 'Use 3–24 lowercase letters, numbers or underscores.'));
          if (!firstInvalid) firstInvalid = username;
        }
        required(displayName, displayNameError, tr('authDisplayNameRequired', 'Enter a display name.'));
        if (password && password.value.length > 0 && password.value.length < 8) {
          showFieldError(password, passwordError, tr('authTooShort', 'Use at least 8 characters.'));
          if (!firstInvalid) firstInvalid = password;
        } else {
          required(password, passwordError, tr('authPasswordRequired', 'Enter a password.'));
        }
        if (timezone && timezone.value.trim().length === 0) {
          showFieldError(timezone, timezoneError, tr('authTimezoneRequired', 'Choose a timezone.'));
          if (!firstInvalid) firstInvalid = timezone;
        } else if (timezone) {
          clearFieldError(timezone, timezoneError);
        }
      } else {
        required(password, passwordError, tr('authPasswordRequired', 'Enter a password.'));
      }
      if (firstInvalid) {
        firstInvalid.focus();
        return false;
      }
      return true;
    };
    for (const [input, error] of [[username, usernameError], [displayName, displayNameError], [password, passwordError], [timezone, timezoneError]]) {
      if (!input || !error) continue;
      input.addEventListener('input', () => clearFieldError(input, error));
    }
    let submitting = false;
    const resetSubmit = () => {
      submitting = false;
      form.removeAttribute('aria-busy');
      if (!submit) return;
      submit.classList.remove('is-busy');
      submit.removeAttribute('aria-disabled');
      if (submitLabel) submitLabel.textContent = submit.getAttribute('data-label-default') || submitLabel.textContent;
    };
    form.addEventListener('submit', (event) => {
      if (submitting) {
        event.preventDefault();
        return;
      }
      if (!validateFields()) {
        event.preventDefault();
        return;
      }
      submitting = true;
      save();
      form.setAttribute('aria-busy', 'true');
      if (submit) {
        submit.classList.add('is-busy');
        submit.setAttribute('aria-disabled', 'true');
        if (submitLabel && busyLabel.length > 0) submitLabel.textContent = busyLabel;
      }
    });
    window.addEventListener('pageshow', resetSubmit);
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (hasError) {
      const invalid = document.querySelector('[aria-invalid="true"]');
      const banner = document.getElementById('auth-error');
      const target = finePointer && invalid ? invalid : banner;
      if (target) {
        try {
          target.focus({ preventScroll: true });
        } catch (error) {
          target.focus();
        }
      }
    } else if (finePointer && window.innerWidth >= 980 && username) {
      try {
        username.focus({ preventScroll: true });
      } catch (error) {
        // Focus is an enhancement; the page remains usable without it.
      }
    }
  })();
  </script>`;
}

function renderAuthPage(mode: "login" | "signup", title: string, error: string | undefined, tx: Translator): string {
  const E = escapeHtml;
  const info = authErrorInfo(error, mode, tx);
  const localeTag = E(tx.locale);
  const dir = tx.dir;
  const pageTitle = E((info === undefined ? "" : tx.t("auth.error.titlePrefix")) + documentTitle(title, undefined, "none", 0, tx));
  const context = E(pageContext(title, undefined, "none", tx));
  return `<!doctype html><html lang="${localeTag}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title><meta name="description" content="${E(tx.t("auth.meta.description"))}"><meta name="theme-color" content="#fbf4ea"><meta name="color-scheme" content="light">
  <link rel="preload" as="image" href="/static/auth-hero.webp" type="image/webp" fetchpriority="high">
  <link rel="stylesheet" href="/static/app.css?v=${APP_CSS_VERSION}"></head>
  <body class="auth-page" data-mode="${mode}" data-site-name="${E(tx.t("app.name"))}" data-locale="${localeTag}" data-page-context="${context}" data-timezone="Asia/Hong_Kong">
    <a class="auth-skip" href="#username">${E(tx.t("auth.skip"))}</a>
    <div class="auth-shell">${renderAuthStory(tx)}${renderAuthPanel(mode, info, tx)}</div>
    <footer class="auth-foot"><a class="footer-credits" href="/privacy">${E(tx.t("footer.privacy"))}</a> · <a class="footer-credits" href="/credits">${E(tx.t("footer.credits"))}</a></footer>
    ${clientI18nScript(tx)}${renderTrackScript()}${renderAuthScript()}
  </body></html>`;
}

function renderLogin(error: string | undefined, tx: Translator): string {
  return renderAuthPage("login", tx.t("login.title"), error, tx);
}

function renderSignup(error: string | undefined, tx: Translator): string {
  return renderAuthPage("signup", tx.t("signup.title"), error, tx);
}

function renderProfile(user: AuthUser, saved: boolean, error: string | undefined, unread: number, flash: string, goalChanged: boolean, tx: Translator): string {
  const goal = user.goal ?? "";
  // The goal already reaches the coach's facts; this closes the loop right away - one tap opens the chat with a
  // message the runner can edit, no hidden directive needed for a plain chat turn.
  const goalOffer = goalChanged && goal.length > 0
    ? `<div class="goal-offer"><p class="ok" role="status">${escapeHtml(tx.t("profile.goalOfferSaved"))}</p><p class="muted small">${escapeHtml(tx.t("profile.goalOfferPrompt"))}</p><button type="button" class="coach-ask" data-coach-send="false" data-coach-message="${escapeHtml(tx.t("profile.goalOfferMessage", { goal }))}">${escapeHtml(tx.t("profile.goalOfferButton"))}</button></div>`
    : "";
  return layout(
    tx.t("profile.title"),
    `<section class="card narrow"><h1>${escapeHtml(tx.t("profile.heading"))}</h1>
      <p class="muted">${escapeHtml(tx.t("profile.signedInAs"))} <strong>${escapeHtml(user.username)}</strong>.</p>
      ${saved ? `<p class="ok" role="status">${escapeHtml(tx.t("profile.saved"))}</p>` : ""}
      ${goalOffer}
      ${errorBanner(authErrorText(error, "error.couldNotSaveProfile", tx))}
      <form method="post" action="/profile" class="stack">
        <label for="username">${escapeHtml(tx.t("profile.username"))}</label><input id="username" value="${escapeHtml(user.username)}" readonly>
        <label for="displayName">${escapeHtml(tx.t("profile.displayName"))}</label><input id="displayName" name="displayName" value="${escapeHtml(user.displayName)}" required maxlength="60" autocomplete="name">
        <label for="timezone">${escapeHtml(tx.t("profile.timezone"))}</label><input id="timezone" name="timezone" value="${escapeHtml(user.timezone)}" required autocomplete="off">
        <label for="goal">${escapeHtml(tx.t("profile.goal"))} <span class="muted small">${escapeHtml(tx.t("profile.optional"))}</span></label><input id="goal" name="goal" value="${escapeHtml(user.goal ?? "")}" maxlength="120" autocomplete="off">
        <label for="password">${escapeHtml(tx.t("profile.changePassword"))} <span class="muted small">${escapeHtml(tx.t("profile.passwordHint"))}</span></label><input id="password" name="password" type="password" minlength="8" autocomplete="new-password">
        <label for="currentPassword">${escapeHtml(tx.t("profile.currentPassword"))} <span class="muted small">${escapeHtml(tx.t("profile.currentPasswordHint"))}</span></label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password">
        <button class="btn" type="submit">${escapeHtml(tx.t("profile.submit"))}</button>
      </form>
      <form method="post" action="/profile/sign-out-everywhere" class="stack">
        <button class="btn ghost" type="submit">${escapeHtml(tx.t("profile.signOutEverywhere"))}</button>
        <p class="muted small">${escapeHtml(tx.t("profile.signOutEverywhereHint"))}</p>
      </form>
      <h2>${escapeHtml(tx.t("profile.deleteHeading"))}</h2>
      <p class="muted small">${escapeHtml(tx.t("profile.deleteHint"))}</p>
      <form method="post" action="/profile/delete" class="stack">
        <label for="deletePassword">${escapeHtml(tx.t("profile.currentPassword"))}</label><input id="deletePassword" name="currentPassword" type="password" required autocomplete="current-password">
        <label for="deleteConfirm">${escapeHtml(tx.t("profile.deleteConfirmLabel", { username: user.username }))}</label><input id="deleteConfirm" name="confirm" required autocomplete="off">
        <button class="btn ghost" type="submit">${escapeHtml(tx.t("profile.deleteSubmit"))}</button>
      </form>
      <p class="muted small">${escapeHtml(tx.t("profile.memberSince", { date: user.createdAt.slice(0, 10) }))}</p>
      <p class="muted small"><a href="/muscle">${escapeHtml(tx.t("profile.muscleLink"))}</a> — ${escapeHtml(tx.t("profile.muscleHint"))}</p>
      <p class="muted small"><a href="/coach-states">${escapeHtml(tx.t("profile.coachStatesLink"))}</a> — ${escapeHtml(tx.t("profile.coachStatesHint"))}</p>
      <p class="muted small"><a href="/calendar?garmin=setup">${escapeHtml(tx.t("profile.garminLink"))}</a> · <a href="/export.json">${escapeHtml(tx.t("profile.exportJson"))}</a> · <a href="/export.ics">${escapeHtml(tx.t("profile.exportIcs"))}</a></p>
    </section>`,
    user,
    "none",
    unread,
    flash,
    tx,
  );
}

/**
 * The two third-party works Milebook ships, with the notices their licences require. three.js is MIT, whose notice
 * must accompany the distribution; the anatomy model derives from BodyParts3D, whose CC BY 4.0 terms require an
 * attribution the end user can actually see, not merely a file in the repository.
 *
 * The credit lines are deliberately not translated: a licence statement that changes with the interface language is
 * not a statement of attribution anymore. Only the labels around them are localized.
 */
const THREE_CREDIT = "three.js r170 - Copyright (c) 2010-2025 three.js authors - MIT License";
const ANATOMY_CREDIT =
  "BodyParts3D - Copyright (c) The Database Center for Life Science - CC Attribution 4.0 International";

function renderCredits(tx: Translator): string {
  const body = `<section class="card narrow">
      <h1>${escapeHtml(tx.t("credits.heading"))}</h1>
      <p class="muted">${escapeHtml(tx.t("credits.intro"))}</p>
      <h2>${escapeHtml(tx.t("credits.threeHeading"))}</h2>
      <p class="credit-line">${escapeHtml(THREE_CREDIT)}</p>
      <p>${escapeHtml(tx.t("credits.threeBody"))}</p>
      <h2>${escapeHtml(tx.t("credits.anatomyHeading"))}</h2>
      <p class="credit-line">${escapeHtml(ANATOMY_CREDIT)}</p>
      <p>${escapeHtml(tx.t("credits.anatomyBody"))}</p>
      <p class="muted small">${escapeHtml(tx.t("credits.noticeFile"))}</p>
    </section>`;
  return layout(tx.t("credits.title"), body, undefined, "none", 0, "", tx);
}

/**
 * The privacy statement. It is written against the schema, not against intentions: every section names what the store
 * actually keeps (`src/types.ts` records), who else receives it (the configured model endpoint and Garmin), how long it
 * lives (the pruning constants) and what deletion does (all 19 tables, irreversibly). If a fact here stops matching the
 * code, the page is wrong, not the code.
 */
function renderPrivacy(tx: Translator): string {
  const section = (heading: MessageKey, body: MessageKey): string =>
    `<h2>${escapeHtml(tx.t(heading))}</h2>\n      <p>${escapeHtml(tx.t(body))}</p>`;
  const body = `<section class="card narrow">
      <h1>${escapeHtml(tx.t("privacy.heading"))}</h1>
      <p class="muted">${escapeHtml(tx.t("privacy.intro"))}</p>
      ${section("privacy.dataHeading", "privacy.dataBody")}
      ${section("privacy.modelHeading", "privacy.modelBody")}
      ${section("privacy.retentionHeading", "privacy.retentionBody")}
      ${section("privacy.choicesHeading", "privacy.choicesBody")}
      ${section("privacy.deleteHeading", "privacy.deleteBody")}
      ${section("privacy.contactHeading", "privacy.contactBody")}
      <p class="muted small">${escapeHtml(tx.t("privacy.updated"))}</p>
    </section>`;
  return layout(tx.t("privacy.title"), body, undefined, "none", 0, "", tx);
}

/** Confirmation after an erasure. Deliberately carries no account detail: the account no longer exists. */
function renderGoodbye(tx: Translator): string {
  const body = `<section class="card narrow">
      <h1>${escapeHtml(tx.t("goodbye.heading"))}</h1>
      <p>${escapeHtml(tx.t("goodbye.body"))}</p>
      <p><a href="/signup">${escapeHtml(tx.t("goodbye.signup"))}</a></p>
    </section>`;
  return layout(tx.t("goodbye.title"), body, undefined, "none", 0, "", tx);
}

export function createWeb(options: WebOptions): WebApp {
  const now = options.now ?? (() => new Date().toISOString());
  const sessionSync = options.sessionSync ?? true;
  const cookieSecure = options.cookieSecure === true;
  const gatewayToken = options.gatewayToken;
  /** Failed-credential throttle: a key is blocked after 10 failures in 15 minutes; a success clears it. */
  const authLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });
  /** Model-spend throttle: at most 40 coach turns per runner per 5 minutes. */
  const chatLimiter = createRateLimiter({ limit: 40, windowMs: 5 * 60_000 });
  /**
   * The gateway's liveness as the web surface sees it, cached for 5 s so a health poll does not turn into a request
   * storm against the coach process.
   */
  let gatewayProbe: { at: number; value: "ok" | "down" } = { at: 0, value: "down" };
  const gatewayHealth = async (): Promise<"ok" | "down"> => {
    const at = Date.now();
    if (at - gatewayProbe.at < 5_000) return gatewayProbe.value;
    let value: "ok" | "down" = "down";
    try {
      const url = `${(options.gatewayUrl ?? "http://127.0.0.1:8090").replace(/\/$/, "")}/health`;
      const response = await fetch(url, { signal: AbortSignal.timeout(800) });
      value = response.ok ? "ok" : "down";
    } catch {
      value = "down";
    }
    gatewayProbe = { at, value };
    return value;
  };
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
    return sessionCookie(id, cookieSecure);
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

      // Baseline hardening for every response. The app is same-origin only and is never framed; a CSP is the next
      // step (it needs nonces for the inline client scripts, see docs/PRODUCTION-READINESS.md).
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("referrer-policy", "same-origin");
      response.setHeader("x-frame-options", "DENY");
      response.setHeader("cross-origin-opener-policy", "same-origin");
      response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
      if (cookieSecure) {
        response.setHeader("strict-transport-security", "max-age=15552000; includeSubDomains");
      }

      // Per-request translator: cookie wins, then Accept-Language, then default. Everything rendered
      // below (chrome, satellites, errors, flash) flows through this pageLayout, so one switch covers all pages.
      const requestCookies = parseCookies(request);
      const localeCookieValue = requestCookies[LOCALE_COOKIE];
      const tx = createTranslator(resolveLocale(localeCookieValue, request.headers["accept-language"]));
      const pageLayout = (
        title: string,
        body: string,
        user: AuthUser | undefined,
        activeView: ViewName = "none",
        flash = "",
      ): string => layout(title, body, user, activeView, unreadFor(user), flash, tx);

      if (method === "POST" && !isSameOriginPost(request)) {
        sendHtml(response, 403, pageLayout(tx.t("error.forbidden"), `<p>${tx.t("error.crossOrigin")}</p>`, undefined, "none"));
        return;
      }

      if (url.pathname === "/language") {
        // Public, GET-only: sets the language cookie then returns to the page you were on.
        // `next` is optional and validated to a same-origin path; otherwise fall back to the Referer or the calendar.
        const code = url.searchParams.get("locale");
        const fallback = safeLanguageNext(url.searchParams.get("next")) ?? safeLanguageNext(request.headers.referer ? new URL(request.headers.referer, "http://localhost").pathname + new URL(request.headers.referer, "http://localhost").search : null) ?? "/calendar";
        if (isLocale(code)) {
          redirect(response, fallback, { "set-cookie": languageCookie(code) });
        } else {
          redirect(response, fallback);
        }
        return;
      }

      if (url.pathname === "/static/app.css") {
        sendAsset(request, response, CSS, "text/css; charset=utf-8", "public, max-age=31536000, immutable", STATIC_ETAGS.css);
        return;
      }
      if (url.pathname === "/static/three.module.js") {
        sendAsset(request, response, THREE_MODULE, "text/javascript; charset=utf-8", "no-cache", STATIC_ETAGS.three);
        return;
      }
      if (url.pathname === "/static/orbit-controls.js") {
        sendAsset(request, response, ORBIT_CONTROLS_MODULE, "text/javascript; charset=utf-8", "no-cache", STATIC_ETAGS.orbit);
        return;
      }
      if (url.pathname === "/static/gltf-loader.js") {
        sendAsset(request, response, GLTF_LOADER_MODULE, "text/javascript; charset=utf-8", "no-cache", STATIC_ETAGS.gltf);
        return;
      }
      if (url.pathname === "/static/utils/BufferGeometryUtils.js") {
        sendAsset(request, response, BUFFER_GEOMETRY_UTILS_MODULE, "text/javascript; charset=utf-8", "no-cache", STATIC_ETAGS.utils);
        return;
      }
      if (url.pathname === "/static/auth-hero.webp") {
        sendAsset(request, response, AUTH_HERO_WEBP, "image/webp", "public, max-age=86400", STATIC_ETAGS.authHero);
        return;
      }
      if (url.pathname === "/static/calendar-object.webp") {
        sendAsset(request, response, AUTH_OBJECT_WEBP, "image/webp", "public, max-age=86400", STATIC_ETAGS.authObject);
        return;
      }
      if (url.pathname === "/static/paper-grain.webp") {
        sendAsset(request, response, AUTH_GRAIN_WEBP, "image/webp", "public, max-age=86400", STATIC_ETAGS.grain);
        return;
      }
      if (url.pathname === "/static/calendar-empty.webp") {
        sendAsset(request, response, CALENDAR_EMPTY_WEBP, "image/webp", "public, max-age=86400", STATIC_ETAGS.calendarEmpty);
        return;
      }
      if (url.pathname === "/static/calendar-wash.webp") {
        sendAsset(request, response, CALENDAR_WASH_WEBP, "image/webp", "public, max-age=86400", STATIC_ETAGS.calendarWash);
        return;
      }
      if (url.pathname === "/static/coach-token.webp") {
        sendAsset(request, response, COACH_TOKEN_WEBP, "image/webp", "public, max-age=86400", STATIC_ETAGS.coachToken);
        return;
      }
      if (url.pathname === "/static/anatomy-muscles.glb") {
        sendAsset(request, response, ANATOMY_MUSCLES_GLB, "model/gltf-binary", "public, max-age=3600", STATIC_ETAGS.anatomy);
        return;
      }
      if (url.pathname === "/health") {
        // A green web health must not hide a dead coach: the deploy and the uptime monitor read `gateway` too.
        const gateway = await gatewayHealth();
        response.writeHead(gateway === "ok" ? 200 : 503, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: gateway === "ok" ? "ok" : "degraded", gateway }));
        return;
      }
      if (url.pathname === "/credits") {
        if (method !== "GET") {
          sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, undefined));
          return;
        }
        sendHtml(response, 200, renderCredits(tx));
        return;
      }
      if (url.pathname === "/privacy") {
        if (method !== "GET") {
          sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, undefined));
          return;
        }
        sendHtml(response, 200, renderPrivacy(tx));
        return;
      }
      if (url.pathname === "/goodbye") {
        if (method !== "GET") {
          sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, undefined));
          return;
        }
        sendHtml(response, 200, renderGoodbye(tx));
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
          sendHtml(response, 200, renderLogin(url.searchParams.get("error") ?? undefined, tx));
          return;
        }
        if (method === "POST") {
          const form = await readForm(request);
          const username = (form.get("username") ?? "").trim().toLowerCase();
          const attemptKey = `${clientKey(request)}|login|${username}`;
          if (authLimiter.blocked(attemptKey)) {
            sendHtml(response, 429, pageLayout(tx.t("error.tooManyAttempts"), `<p>${tx.t("error.tooManyAttempts")}</p>`, requestUser, "none"));
            return;
          }
          try {
            const result = options.auth.login({
              username: form.get("username") ?? "",
              password: form.get("password") ?? "",
            });
            authLimiter.reset(attemptKey);
            const loginToday = localDay(now(), safeTimeZone(result.user.timezone));
            const session = startSession(result.user.userId, loginToday, true);
            redirect(response, "/calendar", { "set-cookie": [result.cookie, session] });
          } catch (error) {
            authLimiter.fail(attemptKey);
            const code = error instanceof AuthError ? error.code : "generic";
            redirect(response, "/login?error=" + encodeURIComponent(code));
          }
          return;
        }
        sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, requestUser, "none"));
        return;
      }

      if (url.pathname === "/signup") {
        if (method === "GET") {
          if (requestUser !== undefined) {
            redirect(response, "/calendar");
            return;
          }
          sendHtml(response, 200, renderSignup(url.searchParams.get("error") ?? undefined, tx));
          return;
        }
        if (method === "POST") {
          const form = await readForm(request);
          const signupName = (form.get("username") ?? "").trim().toLowerCase();
          const attemptKey = `${clientKey(request)}|signup|${signupName}`;
          if (authLimiter.blocked(attemptKey)) {
            sendHtml(response, 429, pageLayout(tx.t("error.tooManyAttempts"), `<p>${tx.t("error.tooManyAttempts")}</p>`, requestUser, "none"));
            return;
          }
          try {
            const result = options.auth.signup({
              username: form.get("username") ?? "",
              displayName: form.get("displayName") ?? "",
              password: form.get("password") ?? "",
              timezone: (form.get("timezone") ?? "").trim() || "Asia/Hong_Kong",
              goal: form.get("goal"),
            });
            authLimiter.reset(attemptKey);
            const signupToday = localDay(now(), safeTimeZone(result.user.timezone));
            const session = startSession(result.user.userId, signupToday, true);
            redirect(response, "/calendar", { "set-cookie": [result.cookie, session] });
          } catch (error) {
            authLimiter.fail(attemptKey);
            const code = error instanceof AuthError ? error.code : "generic";
            redirect(response, "/signup?error=" + encodeURIComponent(code));
          }
          return;
        }
        sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, requestUser, "none"));
        return;
      }

      if (url.pathname === "/logout") {
        if (method === "GET") {
          const sessionId = parseCookies(request)[SESSION_COOKIE];
          if (sessionId !== undefined) sessions.delete(sessionId);
          redirect(response, "/login", { "set-cookie": [options.auth.clearCookie(), clearSessionCookie(cookieSecure)] });
          return;
        }
        sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, requestUser, "none"));
        return;
      }

      if (requestUser === undefined) {
        redirect(response, "/login");
        return;
      }
      const user = requestUser;
      const today = localDay(now(), safeTimeZone(user.timezone));
      const flash = syncFlash(url.searchParams, tx);

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
              tx,
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
          if (password.length > 0) {
            patch.password = password;
            patch.currentPassword = form.get("currentPassword") ?? "";
          }
          try {
            const result = options.auth.updateProfile(user.userId, patch);
            // The offer appears only when the goal actually changed to a new non-empty text, so it never nags.
            const goalChanged =
              form.has("goal") && (patch.goal ?? "").trim().length > 0 && (patch.goal ?? "").trim() !== (user.goal ?? "");
            redirect(response, goalChanged ? "/profile?saved=1&goal=1" : "/profile?saved=1", {
              "set-cookie": result.cookie,
            });
          } catch (error) {
            const code = error instanceof AuthError ? error.code : "generic";
            redirect(response, "/profile?error=" + encodeURIComponent(code));
          }
          return;
        }
        sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, user, "none"));
        return;
      }

      if (url.pathname === "/profile/sign-out-everywhere") {
        if (method === "POST") {
          options.auth.signOutEverywhere(user.userId);
          const sessionId = parseCookies(request)[SESSION_COOKIE];
          if (sessionId !== undefined) sessions.delete(sessionId);
          redirect(response, "/login", { "set-cookie": [options.auth.clearCookie(), clearSessionCookie(cookieSecure)] });
          return;
        }
        sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, user, "none"));
        return;
      }

      if (url.pathname === "/profile/delete") {
        if (method === "POST") {
          const form = await readForm(request);
          const currentPassword = form.get("currentPassword") ?? "";
          const confirmation = (form.get("confirm") ?? "").trim().toLowerCase();
          // Two independent gates: prove the credential, then prove intent by typing the username.
          if (!options.auth.confirmPassword(user.userId, currentPassword)) {
            redirect(response, "/profile?error=invalid-current-password");
            return;
          }
          if (confirmation !== user.username.toLowerCase()) {
            redirect(response, "/profile?error=confirm-mismatch");
            return;
          }
          options.store.deleteAccount(user.userId);
          // Every in-memory page session for the account dies with it, so no tab keeps a stale identity.
          for (const [sessionId, session] of sessions) {
            if (session.userId === user.userId) sessions.delete(sessionId);
          }
          redirect(response, "/goodbye", { "set-cookie": [options.auth.clearCookie(), clearSessionCookie(cookieSecure)] });
          return;
        }
        sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, user, "none"));
        return;
      }

      if (url.pathname === "/coach-audit") {
        if (method === "GET") {
          const nowIso = now();
          const directives = options.store.listCoachDirectives(user.userId, 50);
          const states = options.store.getActiveCoachStates(user.userId, nowIso);
          const stateEvents = options.store.listCoachStateEvents(user.userId, 20);
          const preferences = options.store.getCoachPreferences(user.userId);
          const snapshots = options.store.listPromptSnapshots(user.userId, 3);
          sendHtml(response, 200, renderCoachAudit(user, directives, states, stateEvents, { layout: pageLayout }, tx, preferences, snapshots));
          return;
        }
        sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, user, "none"));
        return;
      }

      if (url.pathname === "/coach-states/refresh") {
        if (method !== "POST") {
          sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, user, "none"));
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
          const tabParam = url.searchParams.get("tab");
          const selectedTab = tabParam === "set" || tabParam === "history" ? tabParam : "current";
          sendHtml(
            response,
            200,
            renderCoachStates(user, states, history, url.searchParams.get("error") ?? undefined, { layout: pageLayout }, tx, selectedTab),
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
        sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, user, "none"));
        return;
      }

      const stateAction = /^\/coach-states\/([^/]+)\/(confirm|resolve)$/.exec(url.pathname);
      if (stateAction !== null) {
        if (method !== "POST") {
          sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, user, "none"));
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
          // The status layer: dated periods with time-decayed levels, the one source for the status card, the
          // attention badge, the calendar chip and the coach prompt.
          const statuses = computeMuscleStatuses({
            checkIns,
            controls: options.store.listMuscleStatusControls(user.userId),
            today,
          });
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
          // A ?proposal= Adjust link opens the form on the coach's reading: the muscle is selected with the
          // proposal's own level, tags, side, warm-up, note and run, so correcting a misparse is one edit, not a
          // dismiss plus a full re-entry (F2).
          const proposalParam = url.searchParams.get("proposal");
          const adjustProposal =
            proposalParam === null ? undefined : options.store.getMuscleProposal(user.userId, proposalParam);
          const prefillProposal =
            adjustProposal !== undefined && adjustProposal.status === "proposed" ? adjustProposal : null;
          const prefillId = url.searchParams.get("activity");
          const prefillActivity =
            prefillId === null ? undefined : options.store.getActivity(user.userId, prefillId);
          const prefillRecent = prefillActivity !== undefined && prefillActivity.day >= twoWeeksAgo ? prefillActivity : undefined;
          // A run older than the 14-day window cannot be linked (a check-in is about its own day), but its
          // muscles still prefill: the form defaults to today and says so, so the "Check in these muscles"
          // deep link never silently drops the run.
          const prefillOld = prefillActivity !== undefined && prefillActivity.day < twoWeeksAgo ? prefillActivity : undefined;
          const formDay = prefillProposal !== null ? prefillProposal.day : prefillRecent !== undefined ? prefillRecent.day : today;
          const activityOptions: MuscleActivityOption[] = options.store
            .listActivities(user.userId, 60)
            .filter((activity) => activity.day === formDay)
            .map((activity) => ({
              activityId: activity.activityId,
              day: activity.day,
              label: `${activity.title}${activity.distanceKm === null ? "" : ` · ${activity.distanceKm} km`}`,
            }));
          // The linked run must stay selectable even when the newest-60 window missed it.
          const keepSelectable = (activity: Activity): void => {
            if (!activityOptions.some((option) => option.activityId === activity.activityId)) {
              activityOptions.push({
                activityId: activity.activityId,
                day: activity.day,
                label: `${activity.title}${activity.distanceKm === null ? "" : ` · ${activity.distanceKm} km`}`,
              });
            }
          };
          if (prefillRecent !== undefined) keepSelectable(prefillRecent);
          if (prefillProposal !== null && prefillProposal.activityId !== null) {
            const proposalRun = options.store.getActivity(user.userId, prefillProposal.activityId);
            if (proposalRun !== undefined && proposalRun.day === formDay) keepSelectable(proposalRun);
          }
          // A ?focus= deep link opens the form on one muscle — the "Update" path from a status row.
          const focusParam = url.searchParams.get("focus");
          const focusMuscleId = focusParam !== null && isMuscleId(focusParam) ? focusParam : null;
          const prefillMuscleIds =
            prefillProposal !== null
              ? [prefillProposal.muscleId]
              : focusMuscleId !== null
                ? [focusMuscleId]
                : prefillRecent !== undefined
                  ? musclesForRun({
                      title: prefillRecent.title,
                      kind: runKind(prefillRecent),
                      distanceKm: prefillRecent.distanceKm,
                      elevationGainM: prefillRecent.elevationGainM ?? null,
                    }).primary
                  : prefillOld === undefined
                    ? []
                    : musclesForRun({
                        title: prefillOld.title,
                        kind: runKind(prefillOld),
                        distanceKm: prefillOld.distanceKm,
                        elevationGainM: prefillOld.elevationGainM ?? null,
                      }).primary;
          // The honest partition: only offerable suggestions become cards; expired and dead-end rows are counted
          // so the page says what happened instead of silently vanishing (F5/F14).
          const pending = partitionPendingMuscleProposals(options.store, user.userId, today);
          const dismissedProposalId =
            url.searchParams.get("saved") === "dismissed" ? url.searchParams.get("proposal") : null;
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
                statusSaved: url.searchParams.get("saved") === "status",
                proposalSaved: url.searchParams.get("saved") === "proposal",
                proposalDismissed: url.searchParams.get("saved") === "dismissed",
                dismissedProposalId: dismissedProposalId === null ? null : dismissedProposalId,
                errorCode: url.searchParams.get("error"),
                pendingProposals: pending.offered,
                pendingExpired: pending.expired,
                pendingInactive: pending.inactive,
                prefillProposal,
                dayCheckIn,
                history: checkIns,
                statuses,
                focusMuscleId,
                oldRunId: prefillOld === undefined ? null : prefillOld.activityId,
                trainingRows,
                activityOptions,
                prefillActivityId:
                  prefillProposal !== null && prefillProposal.activityId !== null
                    ? prefillProposal.activityId
                    : prefillRecent === undefined
                      ? null
                      : prefillRecent.activityId,
                prefillMuscleIds,
              },
              { layout: pageLayout },
              tx,
            ),
          );
          return;
        }
        sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, user, "none"));
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
        // The report restarts the status period for every muscle it mentions: the control row is reset (a
        // survived "resolved" is cleared, and the optional hold-constant checkbox decides the decay mode).
        const hold = form.get("hold") === "1";
        const at = now();
        for (const tag of checkIn.muscles) {
          options.store.upsertMuscleStatusControl({
            userId: user.userId,
            muscleId: tag.muscleId,
            hold,
            resolvedDay: null,
            updatedAt: at,
          });
        }
        redirect(response, "/muscle?saved=1");
        return;
      }

      /**
       * The one-tap status controls: hold a level constant, let it fade again, or claim "all better". The same
       * period model as the check-in path — a newer report always resets these controls for its muscles.
       */
      if (url.pathname === "/muscle/status" && method === "POST") {
        const form = await readForm(request);
        const action = form.get("action") ?? "";
        const at = now();
        if (action === "resolve-all") {
          const checkIns = options.store.listMuscleCheckIns(user.userId, 40);
          const statuses = computeMuscleStatuses({
            checkIns,
            controls: options.store.listMuscleStatusControls(user.userId),
            today,
          });
          for (const status of statuses) {
            options.store.upsertMuscleStatusControl({
              userId: user.userId,
              muscleId: status.muscleId,
              hold: false,
              resolvedDay: today,
              updatedAt: at,
            });
          }
          redirect(response, "/muscle?saved=status");
          return;
        }
        const muscleId = form.get("muscleId") ?? "";
        if (!isMuscleId(muscleId)) {
          redirect(response, "/muscle?error=muscles");
          return;
        }
        if (action !== "resolve" && action !== "hold" && action !== "release") {
          redirect(response, "/muscle?error=conditions");
          return;
        }
        options.store.upsertMuscleStatusControl({
          userId: user.userId,
          muscleId,
          hold: action === "hold",
          resolvedDay: action === "resolve" ? today : null,
          updatedAt: at,
        });
        redirect(response, "/muscle?saved=status");
        return;
      }

      /**
       * The one-tap decision on a coach suggestion. A confirm writes exactly what the Muscle tab's own form would
       * have written — a check-in, a hold, a release or an all-better claim — and only then is the suggestion
       * marked confirmed. The dock calls it with an Accept header and gets JSON; a no-script form gets a redirect
       * back to the Muscle tab, where the record now lives.
       */
      const proposalAction = /^\/muscle\/proposals\/([^/]+)\/(confirm|dismiss|restore)$/.exec(url.pathname);
      if (proposalAction !== null) {
        if (method !== "POST") {
          sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, user, "none"));
          return;
        }
        let proposalId = "";
        try {
          proposalId = decodeURIComponent(proposalAction[1] ?? "");
        } catch {
          proposalId = "";
        }
        const decision = proposalAction[2];
        const wantsJson = (request.headers["accept"] ?? "").includes("application/json");
        let outcome: { ok: true } | { ok: false; detail: string };
        if (proposalId.length === 0) {
          outcome = { ok: false, detail: "not-found" };
        } else if (decision === "confirm") {
          const confirmed = options.store.transaction(() =>
            confirmMuscleProposal({ store: options.store, userId: user.userId, proposalId, today, now: now() }),
          );
          outcome = confirmed.ok ? { ok: true } : { ok: false, detail: confirmed.detail };
        } else if (decision === "restore") {
          // Undo a dismissal while the suggestion is still inside its window: a mis-tap costs one tap (F7).
          const restored = options.store.transaction(() =>
            restoreMuscleProposal({ store: options.store, userId: user.userId, proposalId, today, now: now() }),
          );
          outcome = restored ? { ok: true } : { ok: false, detail: "not-found" };
        } else {
          const dismissed = options.store.transaction(() =>
            dismissMuscleProposal({ store: options.store, userId: user.userId, proposalId, now: now() }),
          );
          outcome = dismissed ? { ok: true } : { ok: false, detail: "not-found" };
        }
        if (wantsJson) {
          if (!outcome.ok) {
            sendJson(response, outcome.detail === "not-found" ? 404 : 409, { ok: false, detail: outcome.detail });
            return;
          }
          sendJson(response, 200, { ok: true, decision });
          return;
        }
        if (!outcome.ok) {
          const code =
            outcome.detail === "expired"
              ? "proposal-expired"
              : outcome.detail === "no-active-status" || outcome.detail === "incomplete"
                ? "proposal-status"
                : "proposal-missing";
          redirect(response, `/muscle?error=${code}`);
          return;
        }
        // A dismissal redirects with its id so the banner can offer Undo; a restore lands back on the page where
        // the card is pending again.
        redirect(
          response,
          decision === "confirm"
            ? "/muscle?saved=proposal"
            : decision === "dismiss"
              ? `/muscle?saved=dismissed&proposal=${encodeURIComponent(proposalId)}`
              : "/muscle",
        );
        return;
      }

      /** The attention feed the app-bar badge reads: the count of muscles in a special status, plus the rows. */
      if (url.pathname === "/muscle/attention.json" && method === "GET") {
        const checkIns = options.store.listMuscleCheckIns(user.userId, 40);
        const statuses = computeMuscleStatuses({
          checkIns,
          controls: options.store.listMuscleStatusControls(user.userId),
          today,
        });
        sendJson(
          response,
          200,
          {
            count: statuses.length,
            items: statuses.map((status) => ({
              muscleId: status.muscleId,
              name: tx.t(`muscle.short.${status.muscleId}` as MessageKey),
              current: status.current,
              level: status.level,
              hold: status.hold,
              href: `/muscle?focus=${encodeURIComponent(status.muscleId)}#check-in`,
            })),
          },
        );
        return;
      }

      /**
       * The standalone all-changes page: the schedule journal, logged/synced runs and muscle events in one place.
       * It is a projection, not a new audit table: every row already exists in the store with its own timestamp.
       */
      if (url.pathname === "/changes") {
        if (method !== "GET") {
          sendHtml(response, 405, pageLayout(tx.t("error.methodNotAllowed"), `<p>${tx.t("error.methodNotAllowed")}</p>`, user, "changes"));
          return;
        }
        const typeParam = url.searchParams.get("type");
        const filter: ChangesFilter = typeParam === "schedule" || typeParam === "activity" || typeParam === "muscle" ? typeParam : "all";
        const timezone = safeTimeZone(user.timezone);
        const changeSets = options.store.listChangeSets(user.userId, 20);
        const activities = options.store.listActivities(user.userId, 30).slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const checkIns = options.store.listMuscleCheckIns(user.userId, 20);
        const controls = options.store.listMuscleStatusControls(user.userId).slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        const scheduleCard = recentChangesCard(changeSets, "/changes", tx, today, timezone, { headingKey: "changes.scheduleTitle" });
        const body = renderChangesPage({ scheduleCard, scheduleCount: changeSets.length, activities, checkIns, controls, filter, tx, today, timezone });
        sendHtml(response, 200, pageLayout(tx.t("changes.allTitle"), body, user, "changes", flash));
        return;
      }

      if (url.pathname === "/chat" && method === "POST") {
        const spendKey = `chat|${requestUser.userId}`;
        if (chatLimiter.blocked(spendKey)) {
          response.writeHead(429, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: "too many coach messages, try again in a few minutes" } }));
          return;
        }
        chatLimiter.fail(spendKey);
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
        const requestId = request.headers["x-milebook-request-id"];
        // A coach turn may take two model attempts; the gateway aborts its own upstream call at 120 s. The proxy
        // budget stays slightly above that so a slow-but-valid turn is not cut off, and a hung gateway cannot pin a
        // browser request indefinitely.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 130_000);
        try {
          const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              "x-milebook-user": user.userId,
              ...(gatewayToken === undefined ? {} : { "x-milebook-internal-token": gatewayToken }),
              ...(typeof requestId === "string" ? { "x-milebook-request-id": requestId } : {}),
            },
            body: JSON.stringify({
              model: options.modelId ?? "milebook-coach",
              stream: false,
              messages: [{ role: "user", content: message }],
              ...(directive === undefined ? {} : { milebook: { directive } }),
            }),
          });
          const payload = (await upstream.json()) as {
            choices?: Array<{ message?: { content?: unknown } }>;
            milebook?: {
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
              muscleProposals?: unknown[];
              blockedByStates?: unknown[];
              prefill?: {
                epoch?: string;
                refreshed?: string[];
                compacted?: boolean;
                today?: string;
                latestChangeSetId?: string | null;
                latestActivityId?: string | null;
              };
            };
            error?: { detail?: string };
          };
          const reply = payload.choices?.[0]?.message?.content;
          if (!upstream.ok || typeof reply !== "string") {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: { detail: payload.error?.detail ?? `coach answered ${upstream.status}` } }));
            return;
          }
          const suggestions = Array.isArray(payload.milebook?.suggestions)
            ? payload.milebook.suggestions.filter((suggestion): suggestion is string => typeof suggestion === "string")
            : [];
          const rawFailures = payload.milebook?.failures;
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
          const rawStates = Array.isArray(payload.milebook?.states) ? payload.milebook.states : [];
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
            states.push({
              stateId,
              key,
              label: tx.t(`coachState.label.${key}` as const),
              status: stored?.status ?? (typeof record["status"] === "string" ? record["status"] : "active"),
              action: record["action"] === "resolve" ? "resolve" : "activate",
              source: stored?.source ?? "chat",
              confidence: stored?.confidence ?? 0,
              evidence: stored?.evidence ?? [],
              expiresAt: stored?.expiresAt ?? null,
              uiNote: tx.t(`coachState.note.${key}` as const),
            });
          }
          const rawBlocked = Array.isArray(payload.milebook?.blockedByStates) ? payload.milebook.blockedByStates : [];
          const blockedByStates: Array<{ key: CoachStateKey; label: string }> = [];
          for (const value of rawBlocked) {
            if (typeof value === "string" && isCoachStateKey(value)) {
              blockedByStates.push({ key: value, label: tx.t(`coachState.label.${value}` as const) });
            }
          }
          // Muscle suggestions ride back with the turn so the dock can render one card per suggestion. The rows
          // are read from the store, never trusted from the upstream payload.
          const rawMuscleProposals = Array.isArray(payload.milebook?.muscleProposals)
            ? payload.milebook.muscleProposals
            : [];
          const turnStatuses = computeMuscleStatuses({
            checkIns: options.store.listMuscleCheckIns(user.userId, 40),
            controls: options.store.listMuscleStatusControls(user.userId),
            today,
          });
          const muscleProposals: MuscleProposalView[] = [];
          for (const value of rawMuscleProposals) {
            if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
            const proposalId = (value as Record<string, unknown>)["proposalId"];
            if (typeof proposalId !== "string" || proposalId.length === 0) continue;
            const stored = options.store.getMuscleProposal(user.userId, proposalId);
            if (stored === undefined) continue;
            muscleProposals.push(
              muscleProposalView(
                {
                  proposal: stored,
                  statuses: turnStatuses,
                  today,
                  run:
                    stored.activityId === null
                      ? undefined
                      : options.store.getActivity(user.userId, stored.activityId) ?? undefined,
                },
                tx,
              ),
            );
          }
          response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          response.end(JSON.stringify({
            reply,
            sessions: payload.milebook?.sessions ?? 0,
            changes: payload.milebook?.changes ?? [],
            suggestions,
            failures,
            changeSetId: payload.milebook?.changeSetId ?? null,
            reverted: payload.milebook?.reverted === true,
            memories: payload.milebook?.memories ?? 0,
            attempts: payload.milebook?.attempts ?? 1,
            outcome: payload.milebook?.outcome ?? "committed",
            validationCode: payload.milebook?.validationCode ?? null,
            mode: payload.milebook?.mode ?? null,
            writesAllowed: payload.milebook?.writesAllowed !== false,
            blockedWrites: typeof payload.milebook?.blockedWrites === "number" ? payload.milebook.blockedWrites : 0,
            directiveId: typeof payload.milebook?.directiveId === "string" ? payload.milebook.directiveId : null,
            states,
            muscleProposals,
            blockedByStates,
            prefill: typeof payload.milebook?.prefill === "object" && payload.milebook?.prefill !== null
              ? payload.milebook.prefill
              : null,
          }));
        } catch (error) {
          const aborted = error instanceof Error && error.name === "AbortError";
          if (aborted) {
            response.writeHead(504, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: { detail: "the coach did not answer in time" } }));
          } else {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: { detail: "the coach service is unavailable" } }));
          }
        } finally {
          clearTimeout(timer);
        }
        return;
      }

      if (url.pathname === "/chat/history" && method === "GET") {
        const messages = options.store.listMessages(user.userId, 40).map((message) => ({
          role: message.role,
          text: message.text,
          createdAt: message.createdAt,
        }));
        // The first-hour onboarding moment (US-8): a runner with no conversation yet gets a
        // server-authored greeting instead of a blank log. It is not stored and costs no model
        // call; the first real message replaces it.
        if (messages.length === 0) {
          const goalText = typeof user.goal === "string" ? user.goal.trim().slice(0, 120) : "";
          const welcome = goalText.length > 0
            ? `Hi - I'm your coach. You told me your goal: "${goalText}". Want me to sketch a first week toward it? Or tell me anything I should know first - I never book anything you didn't ask for.`
            : "Hi - I'm your coach. Tell me what you're training for - a race, a distance, or just getting back into it - and I'll sketch a plan you can change or undo. Connect Garmin or log runs by hand whenever suits you; I never book anything you didn't ask for.";
          messages.push({ role: "assistant", text: welcome, createdAt: now() });
        }
        const states = sortCoachStates(options.store.getActiveCoachStates(user.userId, now()))
          .filter((state) => state.key !== "no_key")
          .map((state) => {
            return {
              stateId: state.stateId,
              key: state.key,
              label: tx.t(`coachState.label.${state.key}` as const),
              status: state.status,
              source: state.source,
              confidence: state.confidence,
              evidence: state.evidence,
              expiresAt: state.expiresAt,
              uiNote: tx.t(`coachState.note.${state.key}` as const),
            };
          });
        // The coach dock's Changes tab reads the same durable journal the Recent changes card renders. Keeping it on
        // this endpoint means the panel needs one request, not one per tab.
        const changes = options.store.listChangeSets(user.userId, 5).map((set) => ({
          changeSetId: set.changeSetId,
          summary: set.summary,
          createdAt: set.createdAt,
          revertedAt: set.revertedAt,
          entries: set.entries.map((entry) => ({
            action: entry.action,
            title: entry.title,
            kind: entry.kind,
            fromDay: entry.fromDay,
            toDay: entry.toDay,
          })),
        }));
        // Pending coach muscle suggestions are durable rows, not DOM-only cards: after a refresh the runner must
        // still be able to confirm or dismiss them here. The views carry the record's own vocabulary, the age, the
        // current status context and the run link, so the dock never invents its own wording.
        const muscleProposals = listPendingMuscleProposals(options.store, user.userId, today).map((proposal) =>
          muscleProposalView(
            {
              proposal,
              statuses: computeMuscleStatuses({
                checkIns: options.store.listMuscleCheckIns(user.userId, 40),
                controls: options.store.listMuscleStatusControls(user.userId),
                today,
              }),
              today,
              run:
                proposal.activityId === null
                  ? undefined
                  : options.store.getActivity(user.userId, proposal.activityId) ?? undefined,
            },
            tx,
          ),
        );
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ messages, states, changes, muscleProposals }));
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
        const date = tx.date;
        // The run summary line: "N runs · X km · D" with optional longest and planned tails, one shape for the period.
        const summaryLine = (count: number, distance: string, duration: string, plannedKm: number, longest = 0): string =>
          `${tx.t("history.runCount", { count })} · ${distance} km · ${duration}${longest > 0 ? ` · ${tx.t("history.statLongest")} ${longest} km` : ""}${plannedKm > 0 ? tx.t("history.plannedSuffix", { distance: plannedKm }) : ""}`;

        let periodStart = currentWeek;
        let periodEnd = addDays(currentWeek, 6);
        let periodLabel = formatWeekRange(currentWeek, date);
        let periodValue = currentWeek;
        let prevPeriod = addDays(currentWeek, -7);
        let nextPeriod = addDays(currentWeek, 7);
        let currentPeriod = currentWeek;
        let currentLabel = tx.t("history.thisWeek");
        let picker = `<input type="date" name="period" value="${escapeHtml(currentWeek)}" aria-label="${escapeHtml(tx.t("history.pickDay"))}">`;

        if (view === "month") {
          const month = /^\d{4}-\d{2}$/.test(periodParam) && Number(periodParam.slice(5, 7)) >= 1 && Number(periodParam.slice(5, 7)) <= 12
            ? periodParam
            : currentMonth;
          periodStart = monthStart(month);
          periodEnd = addDays(periodStart, daysInMonth(month) - 1);
          periodLabel = formatMonthLabel(month, date);
          periodValue = month;
          prevPeriod = addMonths(month, -1);
          nextPeriod = addMonths(month, 1);
          currentPeriod = currentMonth;
          currentLabel = tx.t("history.thisMonth");
          picker = `<input type="month" name="period" value="${escapeHtml(month)}" aria-label="${escapeHtml(tx.t("history.pickMonth"))}">`;
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
          currentLabel = tx.t("history.thisYear");
          picker = `<select name="period" aria-label="${escapeHtml(tx.t("history.pickYear"))}">${Array.from({ length: 101 }, (_, index) => 2000 + index).map((value) => `<option value="${value}"${String(value) === year ? " selected" : ""}>${value}</option>`).join("")}</select>`;
        } else {
          const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(periodParam) ? weekStartOf(periodParam) : currentWeek;
          periodStart = weekStart;
          periodEnd = addDays(weekStart, 6);
          periodLabel = formatWeekRange(weekStart, date);
          periodValue = weekStart;
          prevPeriod = addDays(weekStart, -7);
          nextPeriod = addDays(weekStart, 7);
          currentPeriod = currentWeek;
          currentLabel = tx.t("history.thisWeek");
          picker = `<input type="date" name="period" value="${escapeHtml(weekStart)}" aria-label="${escapeHtml(tx.t("history.pickDay"))}">`;
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
        const periodWord = tx.t(view === "week" ? "history.wordWeek" : view === "month" ? "history.wordMonth" : "history.wordYear");
        const periodBar = `<section class="period-bar" aria-label="${escapeHtml(tx.t("history.periodAria"))}"><div class="period-top"><div class="period-modes">${modeLink("week", tx.t("history.viewWeek"))}${modeLink("month", tx.t("history.viewMonth"))}${modeLink("year", tx.t("history.viewYear"))}</div><div class="period-nav"><a href="${historyHref(view, prevPeriod)}" aria-label="${escapeHtml(tx.t("history.previous", { period: periodWord }))}">←</a><span class="period-label">${escapeHtml(periodLabel)}</span><a href="${historyHref(view, nextPeriod)}" aria-label="${escapeHtml(tx.t("history.next", { period: periodWord }))}">→</a><a class="chip" href="${historyHref(view, currentPeriod)}">${currentLabel}</a></div></div><form method="get" action="/history" class="period-picker"><input type="hidden" name="view" value="${view}">${picker}<button class="btn" type="submit">${escapeHtml(tx.t("history.go"))}</button></form></section>`;

        const longest = activities.reduce((best, activity) => Math.max(best, activity.distanceKm ?? 0), 0);
        const savedKey = options.store.getGarminKey(user.userId);
        // A past day after the last import has not necessarily been missed; the run may simply not have arrived yet.
        const lastSync = options.store.getLastSync(user.userId);
        const lastSyncDay = lastSync === null ? null : localDay(lastSync, safeTimeZone(user.timezone));
        const awaitingGarmin = (day: string): boolean => savedKey !== undefined && lastSyncDay !== null && day > lastSyncDay;
        const garminPanel = renderGarminPanel(savedKey, cleanNext(url), tx, url.searchParams.get("keyError"));

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
                <div class="history-activity-head"><strong>${escapeHtml(activity.title)}</strong><span class="chip source-${escapeHtml(activity.source)}">${escapeHtml(activitySourceLabel(activity, tx))}</span>${matchLabel(matchByActivity.get(activity.activityId), tx)}</div>
                <p class="history-metrics">${escapeHtml(activityMetrics(activity))}</p>
              </div>
              <div class="history-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(message)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-activity", activityId: activity.activityId, source: "history" }))}">Ask coach</button><a class="chip" href="/activity/${encodeURIComponent(activity.activityId)}">Detail</a><a class="chip" href="/calendar?month=${escapeHtml(day.slice(0, 7))}">View plan</a></div>
            </article>`;
          }).join("");
          const missed = dayActivities.length > 0
            ? ""
            : dayEmptyStateHtml(day, daySessions, today, awaitingGarmin(day), tx);
          return `<section class="history-day">
            <header class="history-day-head"><a href="/day/${escapeHtml(day)}">${escapeHtml(formatDayLabel(day, date))}</a></header>
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
        let volumeTitle = tx.t("history.volume.daily");
        let volumeAria = tx.t("history.volume.dailyAria", { period: periodLabel });
        // What the consistency percentage counts, so the summary row never reads as a mystery grade.
        let consistencyUnit = tx.t("history.trend.unitDays");

        if (view === "week") {
          const weekDays = Array.from({ length: 7 }, (_, index) => addDays(periodStart, index));
          const plannedKm = Math.round(sessions.reduce((total, session) => total + (session.distanceKm ?? 0), 0) * 10) / 10;
          const dayHtml = weekDays.map((day) => renderDay(day, sessions.filter((session) => session.day === day), activities.filter((activity) => activity.day === day), workouts.filter((workout) => workout.day === day))).join("");
          content = `<section class="history-week"><header class="history-week-head"><h2>${tx.t("history.weekTitle", { period: escapeHtml(periodLabel) })}</h2></header>${dayHtml}</section>`;
          load = loadSummaryForWeek(allActivities, periodStart);
          volumeBuckets = weekDays.map((day, index) => ({
            label: date.weekdays()[index] ?? formatShortDate(day, date),
            total: sumDistance(activities.filter((activity) => activity.day === day)),
          }));
          const activeDays = weekDays.filter((day) => activities.some((activity) => activity.day === day)).length;
          consistency = Math.round((activeDays / 7) * 100);
          volumeTitle = tx.t("history.volume.daily");
          volumeAria = tx.t("history.volume.dailyAria", { period: periodLabel });
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
            return `<a class="period-row" href="${historyHref("week", start)}"><div><h2>${tx.t("history.weekTitle", { period: escapeHtml(weekLabel(start, date)) })}</h2><p class="muted small">${summaryLine(weekActivities.length, String(sumDistance(weekActivities)), formatMinutes(sumDuration(weekActivities)), plannedKm)}</p></div><span class="chip">${escapeHtml(tx.t("history.viewWeekLink"))}</span></a>`;
          }).join("");
          content = `<div class="period-rows">${rows}</div>`;
          volumeBuckets = weekStarts.map((start) => ({
            label: formatShortDate(start, date),
            total: sumDistance(activities.filter((activity) => activity.day >= start && activity.day <= addDays(start, 6))),
          }));
          const activeWeeks = weekStarts.filter((start) => activities.some((activity) => activity.day >= start && activity.day <= addDays(start, 6))).length;
          consistency = Math.round((activeWeeks / Math.max(weekStarts.length, 1)) * 100);
          consistencyUnit = tx.t("history.trend.unitWeeks");
          volumeTitle = tx.t("history.volume.weekly");
          volumeAria = tx.t("history.volume.weeklyAria", { period: periodLabel });
        } else {
          const monthNames = date.monthNames();
          const rows = monthNames.map((monthName, index) => {
            const monthKey = `${periodValue}-${String(index + 1).padStart(2, "0")}`;
            const monthActivities = activities.filter((activity) => activity.day.slice(0, 7) === monthKey);
            const monthSessions = sessions.filter((session) => session.day.slice(0, 7) === monthKey);
            const plannedKm = Math.round(monthSessions.reduce((total, session) => total + (session.distanceKm ?? 0), 0) * 10) / 10;
            return `<a class="period-row" href="${historyHref("month", monthKey)}"><div><h2>${tx.t("history.monthTitle", { month: escapeHtml(monthName), year: escapeHtml(periodValue) })}</h2><p class="muted small">${summaryLine(monthActivities.length, String(sumDistance(monthActivities)), formatMinutes(sumDuration(monthActivities)), plannedKm)}</p></div><span class="chip">${escapeHtml(tx.t("history.viewMonthLink"))}</span></a>`;
          }).join("");
          content = `<div class="period-rows">${rows}</div>`;
          volumeBuckets = monthNames.map((monthName, index) => ({
            label: monthName.slice(0, 3),
            total: sumDistance(activities.filter((activity) => activity.day.slice(0, 7) === `${periodValue}-${String(index + 1).padStart(2, "0")}`)),
          }));
          const activeMonths = monthNames.filter((_, index) => activities.some((activity) => activity.day.slice(0, 7) === `${periodValue}-${String(index + 1).padStart(2, "0")}`)).length;
          consistency = Math.round((activeMonths / 12) * 100);
          consistencyUnit = tx.t("history.trend.unitMonths");
          volumeTitle = tx.t("history.volume.monthly");
          volumeAria = tx.t("history.volume.monthlyAria", { period: periodValue });
        }

        let loadCard = "";
        if (load !== null) {
          const prompt = coachPromptForWeek(periodLabel, load, activities, sessions);
          const loadStats = [
            load.hasLoad ? `<div class="load-stat" title="${tx.t("history.load.titleLoad")}"><strong>${load.weekLoad}</strong><span>${escapeHtml(tx.t("history.load.statLoad"))}</span></div>` : "",
            load.acwr === null ? "" : `<div class="load-stat" title="${tx.t("history.load.titleAcwr")}"><strong>${load.acwr.toFixed(2)}</strong><span>${escapeHtml(tx.t("history.load.statAcwr"))}</span></div>`,
            load.weekChangePct === null ? "" : `<div class="load-stat" title="${tx.t("history.load.titleVs")}"><strong>${load.weekChangePct > 0 ? "+" : ""}${load.weekChangePct}%</strong><span>${escapeHtml(tx.t("history.load.statVsLast"))}</span></div>`,
            load.hasIntensity ? `<div class="load-stat" title="${tx.t("history.load.titleSplit")}"><strong>${escapeHtml(tx.t("history.load.hard"))} ${load.hardDistanceKm} km · ${escapeHtml(tx.t("history.load.easy"))} ${load.easyDistanceKm} km</strong><span>${escapeHtml(tx.t("history.load.statSplit"))}</span></div>` : "",
          ].filter((part) => part.length > 0).join("");
          const intensityLine = load.hasIntensity
            ? `<p class="muted small">${escapeHtml(tx.t("history.load.hard"))} ${escapeHtml(tx.t("history.runCount", { count: load.hardRuns }))} · ${load.hardDistanceKm} km · ${load.hardMinutes} min · ${escapeHtml(tx.t("history.load.easy"))} ${escapeHtml(tx.t("history.runCount", { count: load.easyRuns }))} · ${load.easyDistanceKm} km · ${load.easyMinutes} min</p>`
            : "";
          // The split is Garmin's intensity when present and the runner's reported effort otherwise; say which rule.
          const hardEasyNote = load.hasIntensity
            ? `<p class="muted small">${escapeHtml(tx.t("history.load.hardEasyNote"))}</p>`
            : "";
          const rising = load.signal === "watch" || load.signal === "high";
          const warningLine = rising ? `<p class="load-warning">${escapeHtml(loadWarningText(load, tx))}</p>` : "";
          const rampIntent = { kind: "review-week", weekStart: periodStart, source: "load-card" };
          const rampChip = rising
            ? `<button type="button" class="coach-ask" data-coach-message="The last week or two ramped up - can we talk it through?" data-coach-intent="${escapeHtml(JSON.stringify(rampIntent))}">${escapeHtml(tx.t("history.load.rampChip"))}</button>`
            : "";
          const acwrNote = load.hasLoad
            ? `<p class="muted small">${tx.t("history.load.acwrNote")}</p>`
            : "";
          const loadSignalLabel = tx.t(`history.load.signal.${load.signal}` as const);
          const loadNote = `${tx.t(`history.load.note.${load.signal}` as const)}${load.reportEffort ? ` ${tx.t("history.load.reportedEffort")}` : ""}`;
          loadCard = `<section class="card load-card" id="load-card"><div class="load-head"><div><p class="eyebrow">${escapeHtml(tx.t("history.loadEyebrow"))}</p><h2>${escapeHtml(tx.t("history.loadTitle"))}</h2></div><span class="load-chip ${load.signal}">${escapeHtml(loadSignalLabel)}</span></div>${warningLine}${loadStats.length === 0 ? "" : `<div class="load-grid">${loadStats}</div>`}${intensityLine}${hardEasyNote}<p class="muted small">${escapeHtml(loadNote)}</p>${acwrNote}<div class="load-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(prompt)}" data-coach-intent="${escapeHtml(JSON.stringify(rampIntent))}">${escapeHtml(tx.t("history.load.reviewWeek"))}</button>${rampChip}</div></section>`;
        }

        let bestEffortsCard = "";
        if (view !== "week") {
          bestEffortsCard = periodBestsCard(periodLabel, personalBestsForPeriod(allActivities, periodStart, periodEnd), tx);
        }

        const latestForReview = auto.newest ?? newestActivity ?? null;
        // The sync card and the manual-log card share one renderer, so both paths produce the identical one-tap review.
        const reviewCard = latestForReview === null ? "" : runReviewCard(latestForReview, tx.t("review.eyebrowSynced"), tx);
        const manualReviewCard = manualReviewCardFor(options.store, user.userId, url.searchParams, tx);
        const logRunLink = `<a href="/day/${escapeHtml(today)}#log-run">${escapeHtml(tx.t("empty.logRun"))}</a>`;
        const connectLink = `<a href="/calendar?garmin=setup">${escapeHtml(tx.t("history.connectGarmin"))}</a>`;
        const periodEmptyKey = view === "week" ? "history.periodEmptyWeek" : view === "month" ? "history.periodEmptyMonth" : "history.periodEmptyYear";
        const noActivities = activities.length === 0
          ? `<p class="muted small period-empty">${tx.t(periodEmptyKey, { logRun: logRunLink, connect: connectLink })}</p>`
          : "";
        const lastImportText = lastImport.length === 0
          ? tx.t("history.noImport")
          : tx.t("history.lastImport", { time: localDateTime(lastImport, user.timezone) });

        const selectedTab = url.searchParams.get("tab") === "review" ? "review" : "period";
        const periodChecked = selectedTab === "period" ? " checked" : "";
        const reviewChecked = selectedTab === "review" ? " checked" : "";
        const loadSignalText = load === null ? "" : tx.t(`history.load.signal.${load.signal}` as const);
        const loadChip = load === null
          ? ""
          : `<a class="chip history-load-chip" data-track="history-load" data-track-value="review" href="${historyHref(view, periodValue)}&tab=review#load-card" title="${escapeHtml(tx.t("history.loadChipTitle"))}">${escapeHtml(load.hasLoad ? tx.t("history.loadChip", { load: load.weekLoad, signal: loadSignalText }) : tx.t("history.loadChipNoData"))}</a>`;
        const loadLine = loadChip === "" ? "" : `<p class="muted small history-load-line">${loadChip}</p>`;
        // The page used to open on summaries and bury the period rows. The tab strip puts the period first — days,
        // weeks or months depending on the view — and keeps load/trend/review one tap away. The tab is in the URL
        // (`?tab=review`) so the load chip, a reload and back/forward all land on the same panel.
        const periodTabLabel = view === "week" ? tx.t("history.tabDays") : view === "month" ? tx.t("history.tabWeeks") : tx.t("history.tabMonths");
        const historyTabs = `<div class="seg-tabs history-tabs" role="radiogroup" aria-label="${escapeHtml(tx.t("history.tabsAria"))}"><input class="seg-input" type="radio" name="history-tab" id="history-tab-period" value="period" data-track="page-tab"${periodChecked}><input class="seg-input" type="radio" name="history-tab" id="history-tab-review" value="review" data-track="page-tab"${reviewChecked}><div class="seg-labels"><label class="seg-label" for="history-tab-period">${escapeHtml(periodTabLabel)}</label><label class="seg-label" for="history-tab-review">${escapeHtml(tx.t("history.tabReview"))}</label></div><div class="seg-panels"><div class="seg-panel" data-seg-panel="period">${noActivities}${content}</div><div class="seg-panel" data-seg-panel="review">${manualReviewCard}${reviewCard}${loadCard}${trendSection(activities, volumeBuckets, consistency, periodLabel, volumeTitle, volumeAria, consistencyUnit, tx)}${bestEffortsCard}</div></div></div>`;
        const body = `<header class="page-head"><h1>${escapeHtml(tx.t("history.heading"))}</h1><p class="muted">${escapeHtml(tx.t("history.intro"))}</p></header>
          ${periodBar}
          ${garminPanel}
          <p class="history-period-summary muted small">${summaryLine(activities.length, String(sumDistance(activities)), formatMinutes(sumDuration(activities)), Math.round(sessions.reduce((total, session) => total + (session.distanceKm ?? 0), 0) * 10) / 10, longest)}</p>
          <p class="muted small">${escapeHtml(lastImportText)}</p>
          ${loadLine}
          ${historyTabs}`;
        sendHtml(response, 200, pageLayout(tx.t("history.eyebrow"), body, user, "history", flash));
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
        // The live muscle statuses earn the same one-tap visibility as a coaching state: the chip shows the
        // count while muscles are in a special (non-perfect) status, and fades out with them.
        const muscleStatuses = computeMuscleStatuses({
          checkIns: options.store.listMuscleCheckIns(user.userId, 40),
          controls: options.store.listMuscleStatusControls(user.userId),
          today,
        });
        const muscleChip = muscleCalendarChip(muscleStatuses, tx) ?? "";
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
        const date = tx.date;
        const monthLabel = date.monthLabel(month);
        const savedKey = options.store.getGarminKey(user.userId);
        const garminPanel = renderGarminPanel(savedKey, `/calendar?month=${month}`, tx, url.searchParams.get("keyError"));
        // Freshness and the row key live with the grid they describe, not in the page head.
        const lastSync = options.store.getLastSync(user.userId);
        const syncMeta = savedKey !== undefined && lastSync !== null
          ? `<span class="chip garmin-sync-chip" title="${escapeHtml(tx.t("calendar.syncedChipTitle"))}">${escapeHtml(tx.t("calendar.syncedChip", { time: localDateTime(lastSync, safeTimeZone(user.timezone)) }))}</span>`
          : savedKey === undefined
            ? `<a class="garmin-connect-link" href="/calendar?garmin=setup" aria-label="${escapeHtml(tx.t("calendar.connectGarmin"))}" title="${escapeHtml(tx.t("calendar.connectGarmin"))}">${escapeHtml(tx.t("calendar.connectTitle"))} ›</a>`
            : "";
        const calendarKey = `<div class="cal-key" aria-label="${escapeHtml(tx.t("calendar.keyAria"))}">
          <span class="cal-key-item"><i class="key-swatch key-plan" aria-hidden="true"></i>${escapeHtml(tx.t("calendar.keyPlan"))}</span>
          <span class="cal-key-item"><i class="key-swatch key-record" aria-hidden="true">✓</i>${escapeHtml(tx.t("calendar.keyRecord"))}</span>
          <span class="cal-key-item"><i class="key-swatch key-pair" aria-hidden="true">◈</i>${escapeHtml(tx.t("calendar.keyPair"))}</span>
          ${syncMeta}
        </div>`;
        const reviewCard = redirectReviewCardFor(options.store, user.userId, url.searchParams, tx);
        // The one-line context the coach is acting on: durable states and the live muscle reading.
        const stateLinks = activeStates.map((state) => stateChipHtml(state, tx)).join(" · ");
        const contextLinks = [stateLinks, muscleChip].filter((part) => part.length > 0).join(" ｜ ");
        const contextLine = contextLinks.length === 0
          ? ""
          : `<p class="entry-context"><span class="entry-context-label">${escapeHtml(tx.t("calendar.contextLabel"))}</span>${contextLinks}</p>`;
        // The next booked session gives an empty today an anchor instead of a dead end.
        const nextSession = month === currentMonth
          ? options.store
              .listSessions(user.userId, addDays(today, 1), addDays(today, 14))
              .sort((left, right) => left.day.localeCompare(right.day) || left.title.localeCompare(right.title))[0]
          : undefined;
        const nextLine = nextSession === undefined
          ? `<span class="entry-next">${escapeHtml(tx.t("calendar.nextNone"))}</span>`
          : `<span class="entry-next">${escapeHtml(tx.t("calendar.nextUp", {
              when: nextSession.day === addDays(today, 1) ? tx.t("calendar.nextTomorrow") : date.shortDate(nextSession.day),
              title: nextSession.title,
            }))}</span>`;
        // The 6am answer: what is booked today, promoted to the first card and reduced to one primary action.
        const todaySessions = month === currentMonth ? sessions.filter((session) => session.day === today) : [];
        const todayActivities = month === currentMonth ? activities.filter((activity) => activity.day === today) : [];
        const todaySession = todaySessions[0];
        const todayRun = todayActivities[0];
        const calendarEmpty = sessions.length === 0 && activities.length === 0;
        let todayMain = "";
        let todayActions = "";
        if (todaySession !== undefined) {
          const intent = sessionIntent(todaySession, tx);
          // The hero has room for the duration, but it never repeats a distance the title already states.
          const titleHasDistance = todaySession.distanceKm !== null && titleMentions(todaySession.title, todaySession.distanceKm, "km");
          const amounts = [
            todaySession.distanceKm === null || titleHasDistance ? "" : `${todaySession.distanceKm} km`,
            todaySession.durationMin === null ? "" : formatMinutes(todaySession.durationMin),
          ].filter((part) => part.length > 0).map((part) => `<span class="today-strip-meta">${escapeHtml(part)}</span>`).join("");
          todayMain = `<div class="today-strip-main"><span class="chip kind-${escapeHtml(todaySession.kind)}">${escapeHtml(sessionKindLabel(todaySession.kind, tx))}</span><strong class="today-strip-title">${escapeHtml(todaySession.title)}</strong>${amounts}${todaySessions.length > 1 ? `<a class="chip" href="/day/${escapeHtml(today)}">+${todaySessions.length - 1}${escapeHtml(tx.t("calendar.moreSuffix"))}</a>` : ""}${todayRun !== undefined ? `<span class="today-strip-meta"><span class="tick">✓</span> ${escapeHtml(todayRun.title)} — ${escapeHtml(activityMetrics(todayRun))}</span>` : ""}<p class="today-strip-intent">${escapeHtml(intent.purpose)} <span class="muted">${escapeHtml(intent.effort)}</span></p></div>`;
          todayActions = `<div class="today-strip-actions"><a class="btn" href="/day/${escapeHtml(today)}">${escapeHtml(tx.t("calendar.viewDay"))}</a><button type="button" class="entry-quiet-link" data-coach-message="${escapeHtml(`What is planned on ${today}?`)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-day", day: today, source: "today-strip" }))}">${escapeHtml(tx.t("calendar.askCoach"))}</button></div>`;
        } else if (todayRun !== undefined) {
          todayMain = `<div class="today-strip-main"><strong class="today-strip-title"><span class="tick">✓</span> ${escapeHtml(todayRun.title)}</strong><span class="today-strip-meta">${escapeHtml(activityMetrics(todayRun))}</span><span class="chip source-${escapeHtml(todayRun.source)}">${escapeHtml(activitySourceLabel(todayRun))}</span></div>`;
          todayActions = `<div class="today-strip-actions"><a class="btn" href="/activity/${encodeURIComponent(todayRun.activityId)}">${escapeHtml(tx.t("calendar.viewDetail"))}</a><button type="button" class="entry-quiet-link" data-coach-message="${escapeHtml(coachPromptForActivity(todayRun))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-activity", activityId: todayRun.activityId, source: "today-strip" }))}">${escapeHtml(tx.t("calendar.askCoach"))}</button></div>`;
        } else if (calendarEmpty) {
          todayMain = `<div class="today-strip-main"><p class="today-strip-empty">${escapeHtml(tx.t("calendar.emptyHeroTitle"))}<span class="entry-next">${escapeHtml(tx.t("calendar.emptyHeroBody"))}</span></p></div>`;
          todayActions = `<div class="today-strip-actions"><button type="button" class="btn" data-coach-message="${escapeHtml(tx.t("calendar.emptyHeroMessage"))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "plan", source: "today-strip" }))}">${escapeHtml(tx.t("calendar.emptyHeroAsk"))}</button><a class="entry-quiet-link" href="/day/${escapeHtml(today)}#log-run">${escapeHtml(tx.t("calendar.logRun"))}</a></div>`;
        } else {
          todayMain = `<div class="today-strip-main"><p class="today-strip-empty">${escapeHtml(tx.t("calendar.nothingTodayShort"))}${nextLine}</p></div>`;
          todayActions = `<div class="today-strip-actions"><button type="button" class="btn" data-coach-message="${escapeHtml(tx.t("calendar.heroAskMessage"))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "plan", day: today, source: "today-strip" }))}">${escapeHtml(tx.t("calendar.heroAsk"))}</button><a class="entry-quiet-link" href="/day/${escapeHtml(today)}#log-run">${escapeHtml(tx.t("calendar.logRun"))}</a></div>`;
        }
        const todayStrip = month !== currentMonth
          ? ""
          : `<section class="today-strip${calendarEmpty ? " has-mark" : ""}" aria-label="${escapeHtml(tx.t("calendar.today"))}">
            <div class="today-strip-head"><span class="today-strip-label">${escapeHtml(tx.t("calendar.today"))}</span><span class="today-strip-date">${escapeHtml(formatDayLabel(today, date))}</span></div>
            ${todayMain}
            ${calendarEmpty ? `<div class="today-strip-mark" aria-hidden="true"><img src="/static/calendar-empty.webp?v=2" alt="" width="120" height="90" decoding="async"></div>` : ""}
            ${todayActions}
            ${contextLine}
          </section>`;
        const body = `<header class="page-head calendar-head">
          <h1>${escapeHtml(tx.t("calendar.heading"))}</h1>
          <p class="muted">${escapeHtml(tx.t("calendar.welcome", { name: user.displayName }))}</p>
        </header>
          ${todayStrip}
          ${reviewCard}
          <section class="card calendar-card${calendarEmpty ? " is-empty" : ""}">
            <div class="month-nav"><a href="/calendar?month=${escapeHtml(prev)}">${escapeHtml(tx.t("calendar.prev"))}</a><a id="month-current" class="month-current" data-month="${escapeHtml(month)}" data-current-month="${escapeHtml(currentMonth)}" href="/calendar?month=${escapeHtml(month)}" aria-haspopup="dialog" title="${escapeHtml(tx.t("calendar.chooseMonth"))}">${escapeHtml(monthLabel)}</a><a href="/calendar?month=${escapeHtml(next)}">${escapeHtml(tx.t("calendar.next"))}</a></div>
            ${calendarKey}
            <div class="dow">${date.weekdays().map((day) => `<span>${escapeHtml(day)}</span>`).join("")}</div>
            <div class="month" data-month="${escapeHtml(month)}">${cells.join("")}</div>
          </section>
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
        sendJson(response, 200, { peek: buildActivityPeek(peekActivity, peekSessions, peekPrDistances, peekWorkout, tx) });
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
        sendJson(response, 200, { peek: buildSessionPeek(peekSession, peekSessions, peekActivities, today, tx) });
        return;
      }

      if (url.pathname.startsWith("/activity/")) {
        let activityId = "";
        try {
          activityId = decodeURIComponent(url.pathname.slice("/activity/".length));
        } catch {
          sendHtml(response, 404, pageLayout(tx.t("error.notFound"), `<p>${tx.t("error.notFound")}</p>`, user, "none"));
          return;
        }
        const activity = options.store.getActivity(user.userId, activityId);
        if (activity === undefined) {
          sendHtml(response, 404, pageLayout(tx.t("error.notFound"), `<p>${tx.t("error.notFound")}</p>`, user, "none"));
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
              splitError = tx.t("activity.splitError");
            }
          }
          if (garmin.getActivitySummary !== undefined) {
            try {
              laps = mapGarminLaps(await garmin.getActivitySummary(garminId));
            } catch {
              lapError = tx.t("activity.lapError");
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
        const extraMetrics = activityExtraMetrics(activity, tx);
        const efforts = fastestEfforts(activity, prDistances);
        const metricsCard = extraMetrics.length === 0 && efforts.length === 0
          ? ""
          : `<section class="card metric-extra-card"><h2>${escapeHtml(tx.t("activity.runMetrics"))}</h2>${extraMetrics}${efforts}</section>`;
        const worked = musclesForRun({
          title: activity.title,
          kind: match.session?.kind,
          distanceKm: activity.distanceKm,
          elevationGainM: activity.elevationGainM ?? null,
        });
        const activityCheckIns = options.store.listMuscleCheckIns(user.userId, 40);
        const workedCard = musclesWorkedCard(
          activity.activityId,
          worked,
          computeMuscleStatuses({
            checkIns: activityCheckIns,
            controls: options.store.listMuscleStatusControls(user.userId),
            today,
          }),
          activityCheckIns.find((checkIn) => checkIn.activityId === activity.activityId) ?? null,
          tx,
        );
        const splitsHtml = activity.source === "garmin" ? splitsSection(splits, splitError, tx) : "";
        const showLaps = laps.length > 1 || laps.some((lap) => lap.type !== "Run");
        const lapsHtml = lapError !== null
          ? lapsSection([], lapError, tx)
          : showLaps ? lapsSection(laps, null, tx) : "";
        const zonesHtml = hrZonesSection(activity, tx);
        const workoutHtml = workoutSection(workout, workoutError, tx);
        const otherSessions = unmatched.length === 0
          ? ""
          : `<section class="card"><h2>${escapeHtml(tx.t("activity.otherPlanned"))}</h2><p class="muted small">${escapeHtml(tx.t("activity.otherPlannedNote"))}</p><p class="history-plan">${unmatched.map(sessionChip).join(" ")}</p></section>`;
        const headActions = `<div class="head-actions" aria-label="${escapeHtml(tx.t("activity.actionsAria"))}"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(message)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-activity", activityId: activity.activityId, source: "activity-detail" }))}">${escapeHtml(tx.t("activity.askCoach"))}</button><a class="chip" href="/day/${escapeHtml(activity.day)}">${escapeHtml(tx.t("activity.viewDay"))}</a><a class="chip" href="/calendar?month=${escapeHtml(activity.day.slice(0, 7))}">${escapeHtml(tx.t("activity.viewPlan"))}</a><a class="chip" data-track="activity-muscles" data-track-value="muscles" href="#muscles-worked">${escapeHtml(tx.t("activity.jumpMuscles"))}</a></div>`;
        const body = `<header class="page-head"><p class="eyebrow"><a href="${weekHref}">← ${escapeHtml(tx.t("nav.log"))}</a> · ${escapeHtml(tx.t("activity.title"))}</p><h1>${escapeHtml(activity.title)}</h1><p class="muted"><a href="/day/${escapeHtml(activity.day)}">${escapeHtml(formatDayLabel(activity.day, tx.date))}</a> · <span class="chip source-${escapeHtml(activity.source)}">${escapeHtml(activitySourceLabel(activity, tx))}</span></p>${headActions}</header>
          <section class="history-summary detail-summary">
            <div class="stat"><strong>${activity.distanceKm === null ? "—" : `${activity.distanceKm} km`}</strong><span>${escapeHtml(tx.t("history.statDistance"))}</span></div>
            <div class="stat"><strong>${activity.durationMin === null ? "—" : formatMinutes(activity.durationMin)}</strong><span>${escapeHtml(tx.t("history.statTime"))}</span></div>
            <div class="stat"><strong>${activity.paceSecPerKm === null ? "—" : formatPace(activity.paceSecPerKm)}</strong><span>${escapeHtml(tx.t("activity.pace"))}</span></div>
            <div class="stat"><strong>${activity.avgHr === null ? "—" : `${activity.avgHr} bpm`}</strong><span>${escapeHtml(tx.t("activity.avgHr"))}</span></div>
          </section>
          ${planComparison(match, tx)}
          <div class="activity-columns"><div class="activity-col">${workoutHtml}${metricsCard}${splitsHtml}</div><div class="activity-col">${workedCard}${zonesHtml}${lapsHtml}</div></div>
          <section class="card"><h2>${escapeHtml(tx.t("activity.askCoachTitle"))}</h2><p class="muted">${escapeHtml(tx.t("activity.askCoachProse"))}</p><div class="review-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(message)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-activity", activityId: activity.activityId, source: "activity-detail" }))}">${escapeHtml(tx.t("activity.askCoach"))}</button><a class="chip" href="/day/${escapeHtml(activity.day)}">${escapeHtml(tx.t("activity.viewDay"))}</a><a class="chip" href="/calendar?month=${escapeHtml(activity.day.slice(0, 7))}">${escapeHtml(tx.t("activity.viewPlan"))}</a></div></section>
          ${otherSessions}`;
        sendHtml(response, 200, pageLayout(tx.t("activity.title"), body, user, "history", flash));
        return;
      }

      if (url.pathname.startsWith("/day/")) {
        const day = url.pathname.slice("/day/".length);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          sendHtml(response, 404, pageLayout(tx.t("error.notFound"), `<p>${tx.t("error.notFound")}</p>`, user, "none"));
          return;
        }
        const sessions = options.store.listSessions(user.userId, day, day);
        const activities = options.store.listActivities(user.userId, 200).filter((activity) => activity.day === day);
        const dayWorkouts = options.store
          .listActivityWorkouts(user.userId, day, day)
          .filter((workout) => workout.status === "ok");
        const workoutCard = dayWorkouts.length === 0
          ? ""
          : `<section class="card"><h2>${escapeHtml(tx.t("day.garminWorkouts"))}</h2><p class="muted small">${escapeHtml(tx.t("day.garminWorkoutsProse"))}</p>${dayWorkouts.map((workout) => `<p class="history-program"><span class="chip">${escapeHtml(tx.t("day.garminWorkoutChip"))}</span><span>${escapeHtml(workout.label)}${workout.summary.length === 0 ? "" : ` · ${escapeHtml(workout.summary)}`}</span></p>`).join("")}</section>`;
        const reviewCard = redirectReviewCardFor(options.store, user.userId, url.searchParams, tx);
        const body = `<header class="page-head"><p class="eyebrow"><a href="/calendar?month=${escapeHtml(day.slice(0, 7))}">← ${escapeHtml(tx.t("day.backCalendar"))}</a></p><h1>${escapeHtml(formatDayLabel(day, tx.date))}</h1></header>
          ${reviewCard}
          <section class="card"><h2>${escapeHtml(tx.t("day.bookedByCoach"))}</h2>${sessions.length === 0 ? `<p class="muted">${escapeHtml(tx.t("day.noSession"))}</p>` : `<ul class="sessions">${sessions.map((session) => `<li><strong>${escapeHtml(session.title)}</strong> <span class="chip kind-${escapeHtml(session.kind)}">${escapeHtml(sessionKindLabel(session.kind, tx))}</span>${session.distanceKm === null ? "" : ` · ${session.distanceKm} km`}${session.durationMin === null ? "" : ` · ${formatMinutes(session.durationMin)}`}${session.note === null ? "" : `<p class="note">${escapeHtml(session.note)}</p>`}${sessionIntentHtml(session, tx)}</li>`).join("")}</ul>`}</section>
          <section class="card"><h2>${escapeHtml(tx.t("day.recorded"))}</h2>${activities.length === 0 ? `<p class="muted">${escapeHtml(tx.t("day.recordedEmpty"))}</p>` : `<ul class="sessions">${activities.map((activity) => activityLine(activity, tx)).join("")}</ul>`}</section>
          <details class="log-disclosure" id="log-run">
            <summary class="btn">${escapeHtml(tx.t("day.logRun"))}</summary>
            <section class="card log-panel"><p class="muted small">${escapeHtml(tx.t("day.logRunProse"))}</p>
              <form method="post" action="/activities" class="stack log-form">
                <input type="hidden" name="next" value="/day/${escapeHtml(day)}">
                <input type="hidden" name="requestId" value="${escapeHtml(randomUUID())}">
                <label for="log-day">${escapeHtml(tx.t("day.fieldDay"))}</label><input id="log-day" name="day" type="date" value="${escapeHtml(day)}" max="${escapeHtml(today)}" required>
                <label for="log-title">${escapeHtml(tx.t("day.fieldTitle"))} <span class="muted small">${escapeHtml(tx.t("day.fieldTitleOptional"))}</span></label><input id="log-title" name="title" maxlength="80" placeholder="${escapeHtml(tx.t("day.titlePlaceholder"))}" autocomplete="off">
                <div class="log-row"><div><label for="log-distance">${escapeHtml(tx.t("day.fieldDistance"))}</label><input id="log-distance" name="distanceKm" type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="5"></div><div><label for="log-duration">${escapeHtml(tx.t("day.fieldDuration"))}</label><input id="log-duration" name="durationMin" type="number" min="1" max="600" step="1" inputmode="numeric" placeholder="30"></div></div>
                <label for="log-rpe">${escapeHtml(tx.t("day.fieldRpe"))}</label><input id="log-rpe" name="rpe" type="number" min="0" max="10" step="0.5" inputmode="decimal" placeholder="7">
                <button class="btn" type="submit">${escapeHtml(tx.t("day.submit"))}</button>
              </form>
            </section>
          </details>
          ${workoutCard}
          <script>
          (() => {
            const log = document.getElementById('log-run');
            if (!(log instanceof HTMLDetailsElement)) return;
            if (location.hash === '#log-run') log.open = true;
          })();
          </script>`;
        sendHtml(response, 200, pageLayout(formatDayLabel(day, tx.date), body, user, "calendar", flash));
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
          const result = applyRevert(options.store, user.userId, changeSet, now());
          const restored = result.restored + result.deleted;
          // Land on the card, not the top of the page: the runner pressed Undo to see the result.
          redirect(response, `${withParams(next, { undone: String(restored) })}#recent-changes`);
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
          muscleStatusControls: options.store.listMuscleStatusControls(user.userId),
          muscleProposals: options.store.listMuscleProposals(user.userId, undefined, 200),
        });
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="milebook-export-${today}.json"`,
          "cache-control": "no-store",
        });
        response.end(JSON.stringify(bundle, null, 2));
        return;
      }

      if (url.pathname === "/export.ics" && method === "GET") {
        const ics = buildCalendarIcs({
          sessions: options.store.listSessions(user.userId, "0000-01-01", "9999-12-31"),
          calendarName: `Milebook - ${user.displayName}`,
          now: now(),
        });
        response.writeHead(200, {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": `attachment; filename="milebook-calendar-${today}.ics"`,
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

      sendHtml(response, 404, pageLayout(tx.t("error.notFound"), `<p>${tx.t("error.notFound")}</p>`, user, "none"));
    })().catch((error: unknown) => {
      // The failure is logged for the operator; the runner gets a stable page, never an internal message.
      console.error("milebook web: request failed", error);
      if (!response.headersSent) sendHtml(response, 500, layout(defaultTranslator.t("error.serverError"), `<p class="error">${escapeHtml(defaultTranslator.t("error.serverErrorBody"))}</p>`, requestUser, "none", unreadFor(requestUser)));
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
