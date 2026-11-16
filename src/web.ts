/**
 * The private calendar: the artefact the conversation leaves behind. Read-only for the runner; the coach (gateway)
 * books future sessions, Garmin completes them. There is no manual edit path in POC3 (ADR-0001).
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { AuthError, type Auth, type AuthUser, type ProfileUpdate } from "./auth";
import { createGarminClient, type GarminClient } from "./garmin";
import { describeGarminError } from "./garmin-errors";
import { createGarminSync, type GarminSyncOutcome } from "./garmin-sync";
import {
  mapGarminLaps,
  mapGarminSplits,
  type ActivityLap,
  type ActivitySplit,
} from "./garmin";
import { CSS } from "./styles";
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
import type { Activity, AppNotification, GarminKey, Store, TrainingSession } from "./types";

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

const SESSION_COOKIE = "poc3sid";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;

/**
 * Starter prompts for the suggestion rail when the conversation has no live coach suggestions. The rail is the single
 * place for next steps: starters on first open, then the coach's 1-3 follow-ups.
 */
const STARTER_SUGGESTIONS = ["Plan my week", "Book a 5 km run", "Review last week"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
      value.startsWith("/history?"))
  ) {
    return value;
  }
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
  for (const name of ["synced", "syncError", "garmin", "keyError"]) params.delete(name);
  const query = params.toString();
  const path = url.pathname === "/" ? "/calendar" : url.pathname;
  return `${path}${query.length === 0 ? "" : `?${query}`}`;
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

function activityLine(activity: Activity): string {
  const amount = [activity.distanceKm === null ? "" : `${activity.distanceKm} km`, activity.durationMin === null ? "" : `${activity.durationMin} min`, activity.paceSecPerKm === null ? "" : `${Math.floor(activity.paceSecPerKm / 60)}:${String(activity.paceSecPerKm % 60).padStart(2, "0")}/km`, activity.avgHr === null ? "" : `${activity.avgHr} bpm`]
    .filter((part) => part.length > 0)
    .join(" · ");
  return `<li><span class="tick">✓</span> ${escapeHtml(activity.title)}${amount.length === 0 ? "" : ` — ${escapeHtml(amount)}`} <span class="muted">(${escapeHtml(activity.source)})</span> <a class="chip" href="/activity/${encodeURIComponent(activity.activityId)}">Detail</a></li>`;
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

function plannedText(sessions: readonly TrainingSession[]): string {
  return sessions.map((session) => `${session.title}${session.distanceKm === null ? "" : ` ${session.distanceKm} km`}`).join(", ");
}

function coachPromptForActivity(activity: Activity, sessions: readonly TrainingSession[]): string {
  const metrics = activityMetrics(activity);
  const plan = sessions.length === 0 ? "There was no planned session that day." : `The plan was ${plannedText(sessions)}.`;
  return `How did my ${activity.title} on ${activity.day} go?${metrics.length === 0 ? "" : ` ${metrics}.`} ${plan} Give me one thing to keep and one thing to change.`;
}

function coachPromptForMissed(day: string, sessions: readonly TrainingSession[]): string {
  return `I planned ${plannedText(sessions)} on ${day} but no activity was recorded. What should I do?`;
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

function activityExtraMetrics(activity: Activity): string {
  const items: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: number | null | undefined, suffix: string, prefix = ""): void => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      items.push({ label, value: `${prefix}${value} ${suffix}`.trim() });
    }
  };
  add("Elevation", activity.elevationGainM, "m", "+");
  add("Calories", activity.calories, "kcal");
  add("Max HR", activity.maxHr, "bpm");
  add("Cadence", activity.cadenceSpm, "spm");
  add("Stride", activity.strideLengthCm, "cm");
  add("Ground contact", activity.groundContactMs, "ms");
  add("Aerobic effect", activity.aerobicTrainingEffect, "");
  add("Anaerobic effect", activity.anaerobicTrainingEffect, "");
  add("Training load", activity.trainingLoad, "");
  if (activity.trainingEffectLabel !== null && activity.trainingEffectLabel !== undefined && activity.trainingEffectLabel.length > 0) {
    items.push({ label: "Effect", value: humanizeEffect(activity.trainingEffectLabel) });
  }
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

function fastestEfforts(activity: Activity, prDistances: ReadonlySet<BestEffortDistance>): string {
  const efforts = [
    { distance: "1k" as const, seconds: activity.fastest1kSec },
    { distance: "1mi" as const, seconds: activity.fastest1miSec },
    { distance: "5k" as const, seconds: activity.fastest5kSec },
  ].filter((effort): effort is { distance: BestEffortDistance; seconds: number } =>
    typeof effort.seconds === "number" && Number.isFinite(effort.seconds) && effort.seconds > 0,
  );
  if (efforts.length === 0) return "";
  return `<div class="best-efforts">${efforts.map((effort) => {
    const isPr = prDistances.has(effort.distance);
    return `<div class="best-effort${isPr ? " pr" : ""}"><span>Fastest ${bestEffortLabel(effort.distance)}</span><strong>${formatSeconds(effort.seconds)}</strong>${isPr ? `<span class="chip pr-chip">PR</span>` : ""}</div>`;
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

function hrZonesSection(activity: Activity): string {
  const zones = [
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
  return `<section class="card best-efforts-card"><div class="splits-head"><h2>Best efforts</h2><p class="muted small">${escapeHtml(periodLabel)} · fastest 1 km / 1 mi / 5 km</p></div>${items}</section>`;
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

function matchLabel(match: ActivityPlanMatch | undefined): string {
  if (match === undefined || match.session === null) {
    return `<span class="chip match-unplanned">Unplanned</span>`;
  }
  const label = match.status === "on-plan" ? "On plan" : match.status === "short" ? "Short" : "Long";
  const delta = match.distanceDeltaKm === null ? "" : ` ${formatDelta(match.distanceDeltaKm, "km")}`;
  return `<span class="chip match-${match.status}" title="Planned: ${escapeHtml(match.session.title)}">${label}${escapeHtml(delta)}</span>`;
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
      <div><span class="muted small">Planned</span><strong>${escapeHtml(match.session.title)}</strong><p class="muted">${escapeHtml(match.session.kind)}${match.session.distanceKm === null ? "" : ` · ${match.session.distanceKm} km`}${match.session.durationMin === null ? "" : ` · ${match.session.durationMin} min`}</p></div>
      <div><span class="muted small">Actual</span><strong>${escapeHtml(match.activity.title)}</strong><p class="muted">${escapeHtml(activityMetrics(match.activity))}</p></div>
    </div>
    <div class="plan-deltas"><span class="chip match-${match.status}">${status}</span><span>Distance ${escapeHtml(formatDelta(match.distanceDeltaKm, "km"))}</span><span>Duration ${escapeHtml(formatDelta(match.durationDeltaMin, "min"))}</span></div>
    ${planDistanceBar(match)}
  </section>`;
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

function formatMetricValue(value: number, metric: "pace" | "hr"): string {
  return metric === "pace" ? formatPace(Math.round(value)) : `${Math.round(value)} bpm`;
}

function metricLineChart(activities: readonly Activity[], metric: "pace" | "hr", periodLabel: string): string {
  const title = metric === "pace" ? "Pace trend" : "Average HR trend";
  const points = activities
    .filter((activity) => metric === "pace" ? activity.paceSecPerKm !== null : activity.avgHr !== null)
    .slice(0, 12)
    .reverse();
  if (points.length < 2) {
    return `<figure class="trend-card"><figcaption>${title}</figcaption><p class="muted small">Need at least two runs with ${metric === "pace" ? "pace" : "heart-rate"} data in ${escapeHtml(periodLabel)}.</p></figure>`;
  }
  const values = points.map((activity) => metric === "pace" ? activity.paceSecPerKm ?? 0 : activity.avgHr ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, metric === "pace" ? 30 : 10);
  const low = min - spread * 0.1;
  const high = max + spread * 0.1;
  const chartWidth = 360;
  const chartHeight = 140;
  const padLeft = 36;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 22;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;
  const coordinates = values.map((value, index) => {
    const x = padLeft + (index / (values.length - 1)) * plotWidth;
    const ratio = (value - low) / (high - low);
    const y = metric === "pace" ? padTop + ratio * plotHeight : padTop + (1 - ratio) * plotHeight;
    return { x, y };
  });
  const line = coordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const dots = coordinates.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3" class="trend-dot"></circle>`).join("");
  const first = points[0];
  const last = points[points.length - 1];
  const firstLabel = first === undefined ? "" : formatShortDate(first.day);
  const lastLabel = last === undefined ? "" : formatShortDate(last.day);
  const firstValue = formatMetricValue(values[0] ?? 0, metric);
  const lastValue = formatMetricValue(values[values.length - 1] ?? 0, metric);
  const topLabel = metric === "pace" ? formatMetricValue(low, metric) : formatMetricValue(high, metric);
  const bottomLabel = metric === "pace" ? formatMetricValue(high, metric) : formatMetricValue(low, metric);
  return `<figure class="trend-card"><figcaption>${title} <span class="muted small">${points.length} runs</span></figcaption><svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="trend-chart" role="img" aria-label="${title} for ${escapeHtml(periodLabel)}"><text x="2" y="${(padTop + 4).toFixed(1)}" class="trend-axis">${escapeHtml(topLabel)}</text><text x="2" y="${(padTop + plotHeight).toFixed(1)}" class="trend-axis">${escapeHtml(bottomLabel)}</text><polyline points="${line}" class="trend-line"></polyline>${dots}<text x="${padLeft}" y="${chartHeight - 6}" class="trend-axis">${escapeHtml(firstLabel)}</text><text x="${chartWidth - padRight}" y="${chartHeight - 6}" text-anchor="end" class="trend-axis">${escapeHtml(lastLabel)}</text></svg><p class="trend-note">${escapeHtml(periodLabel)} · ${escapeHtml(firstValue)} → ${escapeHtml(lastValue)}</p></figure>`;
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
  return `<section class="trends"><div class="trend-head"><h2>Trends</h2><p class="muted small">${escapeHtml(periodLabel)} · ${activities.length} runs</p></div><div class="trend-grid">${volumeChart(buckets, volumeTitle, `${sumDistance(activities)} km · ${periodLabel}`, volumeAria)}${metricLineChart(activities, "pace", periodLabel)}${metricLineChart(activities, "hr", periodLabel)}<figure class="trend-card trend-stats"><figcaption>Summary</figcaption><dl><div><dt>Average pace</dt><dd>${averagePace === null ? "—" : escapeHtml(formatPace(averagePace))}</dd></div><div><dt>Average HR</dt><dd>${averageHr === null ? "—" : `${averageHr} bpm`}</dd></div><div><dt>Consistency</dt><dd>${consistency}%</dd></div></dl></figure></div></section>`;
}

function errorBanner(error?: string): string {
  return error === undefined ? "" : `<p class="error" role="alert">${escapeHtml(error)}</p>`;
}

function renderSyncIcon(): string {
  return `<form method="post" action="/sync" class="sync-icon-form" data-sync-form>
    <input type="hidden" name="next" value="/calendar">
    <button class="icon-btn sync-btn" type="submit" aria-label="Sync Garmin" title="Sync Garmin"><span aria-hidden="true">⟳</span></button>
  </form>`;
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

    const setUnread = (value) => {
      const count = typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      button.setAttribute('aria-label', count === 0 ? 'Notifications' : 'Notifications (' + count + ' unread)');
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
          time.textContent = Number.isNaN(parsed.getTime()) ? item.createdAt : parsed.toLocaleString();
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
        for (const name of ['synced', 'syncError', 'garmin', 'keyError']) params.delete(name);
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

    for (const trigger of document.querySelectorAll('[data-open-garmin]')) trigger.addEventListener('click', show);
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
    if (params.get('garmin') === 'setup' || params.get('keyError') !== null) show();
  })();
  </script>`;
}

function renderGarminPanel(savedKey: GarminKey | undefined, next: string, keyError: string | null = null): string {
  return `${renderGarminModal(savedKey, next, keyError)}
  ${renderGarminScript()}`;
}

type ViewName = "calendar" | "history" | "none";

function layout(title: string, body: string, user: AuthUser | undefined, activeView: ViewName = "calendar"): string {
  const topActions = user === undefined
    ? `<div class="top-actions"><a class="profile" href="/login">Sign in</a><a href="/signup">Sign up</a></div>`
    : `<div class="top-actions">${renderSyncIcon()}${renderNotificationBell()}<a class="profile" href="/profile">${escapeHtml(user.displayName)}</a><a href="/logout">Sign out</a></div>`;
  const nav = `<nav class="top"><a class="brand" href="/calendar">⚡ AI COACH CALENDAR</a>${topActions}</nav>`;
  const viewBar = user === undefined
    ? ""
    : `<div class="view-bar"><div class="view-switch" data-active="${activeView}" role="tablist" aria-label="Views"><span class="view-thumb" aria-hidden="true"></span><a class="view-tab${activeView === "calendar" ? " active" : ""}" href="/calendar" role="tab" aria-selected="${activeView === "calendar"}">Plan</a><a class="view-tab${activeView === "history" ? " active" : ""}" href="/history" role="tab" aria-selected="${activeView === "history"}">Training log</a></div></div>`;
  const bubble = user === undefined ? "" : renderChatBubble();
  const notificationScript = user === undefined ? "" : renderNotificationScript();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title><link rel="stylesheet" href="/static/app.css?v=5"></head>
  <body>${nav}${viewBar}<main>${body}</main>${bubble}${notificationScript}</body></html>`;
}

/** The in-calendar coach bubble: suggestions are tappable; undo is requested in chat, with no history panel. */
function renderChatBubble(): string {
  return `<button id="coach-bubble" type="button" aria-label="Talk to the coach">💬 Coach</button>
  <section id="coach-panel" hidden aria-label="Coach chat">
    <header><div><strong>AI Coach</strong><span class="coach-limit">Bookings up to 180 days ahead · 可預約未來 180 日</span></div><button id="coach-minimize" type="button" aria-label="Minimize chat" title="Minimize">−</button></header>
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
      } catch {
        // A failed history read leaves the bubble empty; the next turn still works.
      }
    };
    const monthGrid = document.querySelector('.month[data-month]');
    const refreshCalendar = async () => {
      if (!monthGrid) return;
      const month = monthGrid.getAttribute('data-month');
      if (!month) return;
      try {
        const response = await fetch('/calendar/data?month=' + encodeURIComponent(month));
        if (!response.ok) return;
        const data = await response.json();
        // The server omits days with nothing left, so clear every cell first; otherwise a deleted chip stays until reload.
        const cells = monthGrid.querySelectorAll('.cell[data-day]');
        for (const cell of cells) {
          cell.querySelectorAll('.session, .done').forEach((node) => node.remove());
        }
        for (const [day, info] of Object.entries(data.days || {})) {
          const cell = monthGrid.querySelector('.cell[data-day="' + day + '"]');
          if (!cell) continue;
          for (const session of info.sessions || []) {
            const chip = document.createElement('span');
            chip.className = 'session kind-' + session.kind;
            chip.textContent = session.title + (session.distanceKm == null ? '' : ' · ' + session.distanceKm + ' km');
            cell.appendChild(chip);
          }
          if (info.activities > 0) {
            const done = document.createElement('span');
            done.className = 'done';
            done.textContent = '✓ ' + info.activities;
            cell.appendChild(done);
          }
        }
      } catch {
        // A failed refresh leaves the page as it was; the booking itself is already stored.
      }
    };
    const rectOf = (day) => {
      const cell = document.querySelector('.cell[data-day="' + day + '"]');
      return cell ? cell.getBoundingClientRect() : null;
    };
    const animateChanges = async (changes) => {
      if (!Array.isArray(changes) || changes.length === 0) return;
      const before = changes.map((change) => ({ change, from: change.fromDay ? rectOf(change.fromDay) : null }));
      await refreshCalendar();
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
    const setRetry = (text) => {
      suggestions.replaceChildren();
      suggestionsSet = true;
      const value = typeof text === 'string' ? text.trim() : '';
      if (value.length === 0) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'suggestion';
      chip.textContent = 'Try again';
      chip.addEventListener('click', () => { void send(value); });
      suggestions.appendChild(chip);
    };
    const showStarters = () => {
      if (suggestionsSet || suggestions.childElementCount > 0) return;
      setSuggestions(STARTERS);
    };
    const send = async (raw) => {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text.length === 0) return;
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
        body: JSON.stringify({ message: text }),
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
          add('error', data && data.error ? data.error.detail : 'The coach could not answer.');
          setRetry(text);
          return;
        }
        add('coach', data.reply);
        setSuggestions(Array.isArray(data.suggestions) && data.suggestions.length > 0 ? data.suggestions : STARTERS);
        scrollToLatest();
        if (data.sessions > 0 || (Array.isArray(data.changes) && data.changes.length > 0)) {
          await animateChanges(data.changes || []);
          add('system', 'Calendar updated · 日曆已更新');
        }
        addFailureCard(data.failures, text);
      } catch {
        typing.remove();
        add('error', 'Network error. Try again.');
        setRetry(text);
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
    const failureReason = (reason) => reason === 'missing-session-id' ? 'no session was specified' : 'session not found';
    const addFailureCard = (failures, retryText) => {
      if (!Array.isArray(failures) || failures.length === 0) return;
      const card = document.createElement('div');
      card.className = 'bubble failure';
      card.setAttribute('role', 'status');
      const head = document.createElement('strong');
      head.textContent = 'Not applied · 未套用';
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
        button.addEventListener('click', () => { void send('What is planned on ' + day + '?'); });
        actions.appendChild(button);
      }
      const retry = typeof retryText === 'string' ? retryText.trim() : '';
      if (retry.length > 0) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Try again';
        button.addEventListener('click', () => { void send(retry); });
        actions.appendChild(button);
      }
      if (actions.childElementCount > 0) card.appendChild(actions);
      log.appendChild(card);
      scrollToLatest();
    };
    const openCoach = (text, sendNow) => {
      show();
      if (sendNow) {
        void send(text);
      } else {
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
      const hasSessions = cell.querySelectorAll('.session').length > 0;
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
      if (action === 'add') openCoach('Add a session on ' + menuDay + ': ', false);
      if (action === 'move') openCoach('Move a session to ' + menuDay + ': ', false);
      if (action === 'delete') openCoach('Delete the session on ' + menuDay + '.', true);
      if (action === 'ask') openCoach('What is planned on ' + menuDay + '? Review it and suggest changes.', true);
      if (action === 'view') location.href = '/day/' + menuDay;
    });
    document.addEventListener('click', (event) => {
      if (dayMenu.hidden) return;
      if (event.target instanceof Node && (dayMenu.contains(event.target) || (event.target instanceof Element && event.target.closest('.cell[data-day]') !== null))) return;
      closeDayMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDayMenu();
    });
    for (const cell of document.querySelectorAll('.cell[data-day]')) {
      cell.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openDayMenu(cell, cell.dataset.day || '');
      });
      cell.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDayMenu(cell, cell.dataset.day || '');
        }
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
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMonthPicker();
    });
    document.body.appendChild(monthPicker);

    bubble.addEventListener('click', show);
    minimize.addEventListener('click', minimizePanel);
    document.addEventListener('click', (event) => {
      const trigger = event.target instanceof Element ? event.target.closest('[data-coach-message]') : null;
      if (trigger === null) return;
      const message = trigger.getAttribute('data-coach-message') ?? '';
      if (message.length === 0) return;
      event.preventDefault();
      openCoach(message, true);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (text.length === 0) return;
      input.value = '';
      void send(text);
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

function renderProfile(user: AuthUser, saved: boolean, error?: string): string {
  return layout(
    "Profile",
    `<section class="card narrow"><h1>Your profile</h1>
      <p class="muted">Signed in as <strong>${escapeHtml(user.username)}</strong>.</p>
      ${saved ? `<p class="ok" role="status">Profile saved.</p>` : ""}
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
    </section>`,
    user,
    "none",
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

      if (url.pathname === "/static/app.css") {
        response.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" });
        response.end(CSS);
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
      const ownsSync = (url.pathname === "/sync" || url.pathname === "/garmin/key") && method === "POST";
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
        sendHtml(response, 405, layout("Method not allowed", `<p>Method not allowed</p>`, requestUser));
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
        sendHtml(response, 405, layout("Method not allowed", `<p>Method not allowed</p>`, requestUser));
        return;
      }

      if (url.pathname === "/logout") {
        if (method === "GET") {
          const sessionId = parseCookies(request)[SESSION_COOKIE];
          if (sessionId !== undefined) sessions.delete(sessionId);
          redirect(response, "/login", { "set-cookie": [options.auth.clearCookie(), clearSessionCookie()] });
          return;
        }
        sendHtml(response, 405, layout("Method not allowed", `<p>Method not allowed</p>`, requestUser));
        return;
      }

      if (requestUser === undefined) {
        redirect(response, "/login");
        return;
      }
      const user = requestUser;
      const today = localDay(now(), safeTimeZone(user.timezone));

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
            renderProfile(user, url.searchParams.get("saved") === "1", url.searchParams.get("error") ?? undefined),
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
            redirect(response, "/profile?saved=1");
          } catch (error) {
            const message = error instanceof AuthError ? error.message : "Could not save the profile";
            redirect(response, "/profile?error=" + encodeURIComponent(message));
          }
          return;
        }
        sendHtml(response, 405, layout("Method not allowed", `<p>Method not allowed</p>`, user));
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
        const message = typeof body === "object" && body !== null && typeof (body as Record<string, unknown>)["message"] === "string"
          ? String((body as Record<string, unknown>)["message"]).trim()
          : "";
        if (message.length === 0 || message.length > 1000) {
          response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: "message must be 1..1000 characters" } }));
          return;
        }
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
            body: JSON.stringify({ model: options.modelId ?? "poc3-coach", stream: false, messages: [{ role: "user", content: message }] }),
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
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ messages }));
        return;
      }

      if (url.pathname === "/calendar/data" && method === "GET") {
        const month = url.searchParams.get("month") ?? today.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) {
          response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: "month must be YYYY-MM" } }));
          return;
        }
        const start = monthStart(month);
        const end = addDays(start, daysInMonth(month) - 1);
        const sessions = options.store.listSessions(user.userId, start, end);
        const activities = options.store.listActivities(user.userId, 500).filter((activity) => activity.day >= start && activity.day <= end);
        const days: Record<string, { sessions: Array<{ title: string; kind: string; distanceKm: number | null }>; activities: number }> = {};
        for (const session of sessions) {
          const entry = (days[session.day] ??= { sessions: [], activities: 0 });
          entry.sessions.push({ title: session.title, kind: session.kind, distanceKm: session.distanceKm });
        }
        for (const activity of activities) {
          const entry = (days[activity.day] ??= { sessions: [], activities: 0 });
          entry.activities += 1;
        }
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ month, days }));
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
        const lastImport = allActivities.reduce((latest, activity) => activity.createdAt > latest ? activity.createdAt : latest, "");
        const synced = url.searchParams.get("synced");
        const syncError = url.searchParams.get("syncError");

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
        const modeLink = (target: HistoryView, label: string): string =>
          `<a class="period-mode${view === target ? " active" : ""}" href="${historyHref(target, modePeriod(target))}" role="tab" aria-selected="${view === target}">${label}</a>`;
        const periodBar = `<section class="period-bar" aria-label="Training log period"><div class="period-top"><div class="period-modes" role="tablist" aria-label="Period view">${modeLink("week", "Week")}${modeLink("month", "Month")}${modeLink("year", "Year")}</div><div class="period-nav"><a href="${historyHref(view, prevPeriod)}" aria-label="Previous ${view}">←</a><span class="period-label">${escapeHtml(periodLabel)}</span><a href="${historyHref(view, nextPeriod)}" aria-label="Next ${view}">→</a><a class="chip" href="${historyHref(view, currentPeriod)}">${currentLabel}</a></div></div><form method="get" action="/history" class="period-picker"><input type="hidden" name="view" value="${view}">${picker}<button class="btn" type="submit">Go</button></form></section>`;

        const longest = activities.reduce((best, activity) => Math.max(best, activity.distanceKm ?? 0), 0);
        const savedKey = options.store.getGarminKey(user.userId);
        const garminPanel = renderGarminPanel(savedKey, cleanNext(url), url.searchParams.get("keyError"));

        const renderDay = (day: string, daySessions: TrainingSession[], dayActivities: Activity[]): string => {
          const dayMatches = matchActivitiesToPlan(dayActivities, daySessions);
          const matchByActivity = new Map(dayMatches.map((match) => [match.activity.activityId, match]));
          const unmatched = unmatchedSessions(dayMatches, daySessions);
          const plannedLine = daySessions.length === 0
            ? dayActivities.length === 0 ? "" : `<p class="history-plan muted">No planned session</p>`
            : `<p class="history-plan">Planned: ${daySessions.map(sessionChip).join(" ")}</p>`;
          const unmatchedLine = dayActivities.length === 0 || unmatched.length === 0
            ? ""
            : `<p class="history-plan muted small">No matching run: ${unmatched.map(sessionChip).join(" ")}</p>`;
          const activityHtml = dayActivities.map((activity) => {
            const message = coachPromptForActivity(activity, daySessions);
            return `<article class="history-activity">
              <div class="history-activity-main">
                <div class="history-activity-head"><strong>${escapeHtml(activity.title)}</strong><span class="chip source-${escapeHtml(activity.source)}">${activity.source === "garmin" ? "Garmin" : "Coach"}</span>${matchLabel(matchByActivity.get(activity.activityId))}</div>
                <p class="history-metrics">${escapeHtml(activityMetrics(activity))}</p>
              </div>
              <div class="history-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(message)}">Ask coach</button><a class="chip" href="/activity/${encodeURIComponent(activity.activityId)}">Detail</a><a class="chip" href="/calendar?month=${escapeHtml(day.slice(0, 7))}">View plan</a></div>
            </article>`;
          }).join("");
          const missed = dayActivities.length > 0
            ? ""
            : daySessions.length > 0
              ? `<div class="history-missed"><span class="muted">No activity recorded.</span><button type="button" class="coach-ask" data-coach-message="${escapeHtml(coachPromptForMissed(day, daySessions))}">Ask coach</button></div>`
              : `<p class="muted small">No session or activity.</p>`;
          return `<section class="history-day">
            <header class="history-day-head"><a href="/day/${escapeHtml(day)}">${escapeHtml(formatDayLabel(day))}</a></header>
            ${plannedLine}
            ${unmatchedLine}
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
          const dayHtml = weekDays.map((day) => renderDay(day, sessions.filter((session) => session.day === day), activities.filter((activity) => activity.day === day))).join("");
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
          loadCard = `<section class="card load-card"><div class="load-head"><div><p class="eyebrow">Training load · 訓練負荷</p><h2>Week load</h2></div><span class="load-chip ${load.signal}">${escapeHtml(load.label)}</span></div><div class="load-grid"><div class="load-stat"><strong>${load.hasLoad ? load.weekLoad : "—"}</strong><span>load</span></div><div class="load-stat"><strong>${load.acwr === null ? "—" : load.acwr.toFixed(2)}</strong><span>ACWR</span></div><div class="load-stat"><strong>${load.weekChangePct === null ? "—" : `${load.weekChangePct > 0 ? "+" : ""}${load.weekChangePct}%`}</strong><span>vs last week</span></div><div class="load-stat"><strong>${load.hasIntensity ? `${load.hardDistanceKm} / ${load.easyDistanceKm} km` : "—"}</strong><span>hard / easy</span></div></div>${load.hasIntensity ? `<p class="muted small">Hard ${load.hardRuns} run${load.hardRuns === 1 ? "" : "s"} · ${load.hardDistanceKm} km · ${load.hardMinutes} min · Easy ${load.easyRuns} run${load.easyRuns === 1 ? "" : "s"} · ${load.easyDistanceKm} km · ${load.easyMinutes} min</p>` : ""}<p class="muted small">${escapeHtml(load.note)} ACWR compares this week with the 28-day average; a soft signal, not medical advice.</p><div class="load-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(prompt)}">Review my week with the coach</button></div></section>`;
        }

        let bestEffortsCard = "";
        if (view !== "week") {
          bestEffortsCard = periodBestsCard(periodLabel, personalBestsForPeriod(allActivities, periodStart, periodEnd));
        }

        const autoBanner = auto.error !== null
          ? `<p class="error" role="alert">Auto-sync failed: ${escapeHtml(auto.error)}</p>`
          : auto.imported > 0
            ? `<p class="ok" role="status">Auto-synced ${auto.imported} Garmin ${auto.imported === 1 ? "activity" : "activities"}.</p>`
            : "";
        const latestForReview = auto.newest ?? (synced !== null && Number(synced) > 0 ? allActivities[0] ?? null : null);
        const reviewSessions = latestForReview === null ? [] : options.store.listSessions(user.userId, latestForReview.day, latestForReview.day);
        const reviewCard = latestForReview === null
          ? ""
          : `<section class="card review-card"><p class="eyebrow">New run synced</p><h2>${escapeHtml(latestForReview.title)}</h2><p class="muted">${escapeHtml(formatDayLabel(latestForReview.day))} · ${escapeHtml(activityMetrics(latestForReview))}</p><div class="review-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(coachPromptForActivity(latestForReview, reviewSessions))}">Review this run with the coach</button><a class="chip" href="/activity/${encodeURIComponent(latestForReview.activityId)}">Detail</a></div></section>`;
        const noActivities = activities.length === 0
          ? `<p class="muted small period-empty">No Garmin activities in this ${view} yet.</p>`
          : "";
        const lastImportText = lastImport.length === 0
          ? "No Garmin import yet."
          : `Last import: ${localDateTime(lastImport, user.timezone)}`;

        const body = `<header class="page-head"><p class="eyebrow">Training log · 訓練紀錄</p><h1>Past training</h1><p class="muted">What actually happened, from Garmin. Pick a week, month or year; the plan stays on the calendar.</p></header>
          ${periodBar}
          ${garminPanel}
          <section class="history-summary">
            <div class="stat"><strong>${activities.length}</strong><span>runs</span></div>
            <div class="stat"><strong>${sumDistance(activities)} km</strong><span>distance</span></div>
            <div class="stat"><strong>${formatMinutes(sumDuration(activities))}</strong><span>time</span></div>
            <div class="stat"><strong>${longest > 0 ? `${longest} km` : "—"}</strong><span>longest</span></div>
          </section>
          ${autoBanner}
          ${synced === null ? "" : `<p class="ok" role="status">Garmin sync: ${escapeHtml(synced)} imported</p>`}
          ${syncError === null ? "" : `<p class="error" role="alert">Garmin sync failed: ${escapeHtml(syncError)}</p>`}
          <p class="muted small">${escapeHtml(lastImportText)}</p>
          ${reviewCard}
          ${loadCard}
          ${trendSection(activities, volumeBuckets, consistency, periodLabel, volumeTitle, volumeAria)}
          ${bestEffortsCard}
          ${noActivities}
          ${content}`;
        sendHtml(response, 200, layout("Training log", body, user, "history"));
        return;
      }

      if (url.pathname === "/" || url.pathname === "/calendar") {
        const month = url.searchParams.get("month") ?? today.slice(0, 7);
        const start = monthStart(month);
        const end = addDays(start, daysInMonth(month) - 1);
        const auto = await autoSync(user.userId, today);
        const sessions = options.store.listSessions(user.userId, start, end);
        const activities = options.store.listActivities(user.userId, 200).filter((activity) => activity.day >= start && activity.day <= end);
        const firstWeekday = weekdayIndex(start);
        const cells: string[] = [];
        for (let pad = 0; pad < firstWeekday; pad += 1) cells.push(`<div class="cell pad"></div>`);
        for (let dayNumber = 1; dayNumber <= daysInMonth(month); dayNumber += 1) {
          const day = `${month}-${String(dayNumber).padStart(2, "0")}`;
          const daySessions = sessions.filter((session) => session.day === day);
          const dayActivities = activities.filter((activity) => activity.day === day);
          cells.push(`<a class="cell${day === today ? " today" : ""}" data-day="${escapeHtml(day)}" href="/day/${escapeHtml(day)}" aria-haspopup="menu" title="Day actions">
            <span class="date">${dayNumber}</span>
            ${daySessions.map(sessionChip).join("")}
            ${dayActivities.length === 0 ? "" : `<span class="done">✓ ${dayActivities.length}</span>`}
          </a>`);
        }
        const prev = addDays(start, -1).slice(0, 7);
        const next = addDays(end, 1).slice(0, 7);
        const currentMonth = today.slice(0, 7);
        const monthLabel = `${MONTHS[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}`;
        const synced = url.searchParams.get("synced");
        const syncError = url.searchParams.get("syncError");
        const autoBanner = auto.error !== null
          ? `<p class="error" role="alert">Auto-sync failed: ${escapeHtml(auto.error)}</p>`
          : auto.imported > 0
            ? `<p class="ok" role="status">Auto-synced ${auto.imported} Garmin ${auto.imported === 1 ? "activity" : "activities"}.</p>`
            : "";
        const savedKey = options.store.getGarminKey(user.userId);
        const garminPanel = renderGarminPanel(savedKey, `/calendar?month=${month}`, url.searchParams.get("keyError"));
        const body = `<header class="page-head"><p class="eyebrow">Private calendar</p>
          <p class="muted">Welcome back, ${escapeHtml(user.displayName)}. Sessions booked by your AI coach. Activities come from Garmin.</p></header>
          <section class="card">
            <div class="month-nav"><a href="/calendar?month=${escapeHtml(prev)}">← Previous</a><a id="month-current" class="month-current" data-month="${escapeHtml(month)}" data-current-month="${escapeHtml(currentMonth)}" href="/calendar?month=${escapeHtml(month)}" aria-haspopup="dialog" title="Choose month">${escapeHtml(monthLabel)}</a><a href="/calendar?month=${escapeHtml(next)}">Next →</a></div>
            ${autoBanner}
            ${synced === null ? "" : `<p class="ok" role="status">Garmin sync: ${escapeHtml(synced)} imported</p>`}
            ${syncError === null ? "" : `<p class="error" role="alert">Garmin sync failed: ${escapeHtml(syncError)}</p>`}
            <div class="dow">${DOW.map((day) => `<span>${day}</span>`).join("")}</div>
            <div class="month" data-month="${escapeHtml(month)}">${cells.join("")}</div>
          </section>
          ${garminPanel}`;
        sendHtml(response, 200, layout("Calendar", body, user));
        return;
      }

      if (url.pathname.startsWith("/activity/")) {
        let activityId = "";
        try {
          activityId = decodeURIComponent(url.pathname.slice("/activity/".length));
        } catch {
          sendHtml(response, 404, layout("Not found", `<p>Not found</p>`, user));
          return;
        }
        const activity = options.store.getActivity(user.userId, activityId);
        if (activity === undefined) {
          sendHtml(response, 404, layout("Not found", `<p>Not found</p>`, user));
          return;
        }
        const sessions = options.store.listSessions(user.userId, activity.day, activity.day);
        const match = matchActivity(activity, sessions);
        const unmatched = unmatchedSessions([match], sessions);
        const message = coachPromptForActivity(activity, sessions);
        const weekHref = historyHref("week", weekStartOf(activity.day));
        let splits: ActivitySplit[] = [];
        let splitError: string | null = null;
        let laps: ActivityLap[] = [];
        let lapError: string | null = null;
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
        const allBests = personalBests(options.store.listActivities(user.userId, 1000));
        const prDistances = new Set<BestEffortDistance>(
          allBests
            .filter((best) => best.activity.activityId === activity.activityId)
            .map((best) => best.distance),
        );
        const extraMetrics = activityExtraMetrics(activity);
        const efforts = fastestEfforts(activity, prDistances);
        const metricsCard = extraMetrics.length === 0 && efforts.length === 0
          ? ""
          : `<section class="card metric-extra-card"><h2>Run metrics</h2>${extraMetrics}${efforts}</section>`;
        const splitsHtml = activity.source === "garmin" ? splitsSection(splits, splitError) : "";
        const showLaps = laps.length > 1 || laps.some((lap) => lap.type !== "Run");
        const lapsHtml = lapError !== null
          ? lapsSection([], lapError)
          : showLaps ? lapsSection(laps, null) : "";
        const zonesHtml = hrZonesSection(activity);
        const otherSessions = unmatched.length === 0
          ? ""
          : `<section class="card"><h2>Other planned sessions that day</h2><p class="muted small">No matching run was recorded for these.</p><p class="history-plan">${unmatched.map(sessionChip).join(" ")}</p></section>`;
        const body = `<header class="page-head"><p class="eyebrow"><a href="${weekHref}">← Training log</a> · Activity</p><h1>${escapeHtml(activity.title)}</h1><p class="muted"><a href="/day/${escapeHtml(activity.day)}">${escapeHtml(formatDayLabel(activity.day))}</a> · <span class="chip source-${escapeHtml(activity.source)}">${activity.source === "garmin" ? "Garmin" : "Coach"}</span></p></header>
          <section class="history-summary detail-summary">
            <div class="stat"><strong>${activity.distanceKm === null ? "—" : `${activity.distanceKm} km`}</strong><span>distance</span></div>
            <div class="stat"><strong>${activity.durationMin === null ? "—" : formatMinutes(activity.durationMin)}</strong><span>time</span></div>
            <div class="stat"><strong>${activity.paceSecPerKm === null ? "—" : formatPace(activity.paceSecPerKm)}</strong><span>pace</span></div>
            <div class="stat"><strong>${activity.avgHr === null ? "—" : `${activity.avgHr} bpm`}</strong><span>avg HR</span></div>
          </section>
          ${planComparison(match)}
          ${metricsCard}
          ${splitsHtml}
          ${lapsHtml}
          ${zonesHtml}
          <section class="card"><h2>Ask the coach about this run</h2><p class="muted">The coach sees your last 30 activities and planned sessions, and this run's metrics are in the message.</p><div class="review-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(message)}">Ask coach</button><a class="chip" href="/day/${escapeHtml(activity.day)}">View day</a><a class="chip" href="/calendar?month=${escapeHtml(activity.day.slice(0, 7))}">View plan</a></div></section>
          ${otherSessions}`;
        sendHtml(response, 200, layout("Activity", body, user, "history"));
        return;
      }

      if (url.pathname.startsWith("/day/")) {
        const day = url.pathname.slice("/day/".length);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          sendHtml(response, 404, layout("Not found", `<p>Not found</p>`, user));
          return;
        }
        const sessions = options.store.listSessions(user.userId, day, day);
        const activities = options.store.listActivities(user.userId, 200).filter((activity) => activity.day === day);
        const body = `<header class="page-head"><p class="eyebrow"><a href="/calendar?month=${escapeHtml(day.slice(0, 7))}">← Calendar</a></p><h1>${escapeHtml(day)}</h1>
          <p class="muted">${escapeHtml(user.displayName)} · <a href="/profile">Profile</a></p></header>
          <section class="card"><h2>Booked by the coach</h2>${sessions.length === 0 ? `<p class="muted">No session booked.</p>` : `<ul class="sessions">${sessions.map((session) => `<li><strong>${escapeHtml(session.title)}</strong> <span class="chip kind-${escapeHtml(session.kind)}">${escapeHtml(session.kind)}</span>${session.distanceKm === null ? "" : ` · ${session.distanceKm} km`}${session.durationMin === null ? "" : ` · ${session.durationMin} min`}${session.note === null ? "" : `<p class="note">${escapeHtml(session.note)}</p>`}</li>`).join("")}</ul>`}</section>
          <section class="card"><h2>Done (Garmin / reported)</h2>${activities.length === 0 ? `<p class="muted">Nothing recorded yet.</p>` : `<ul class="sessions">${activities.map(activityLine).join("")}</ul>`}</section>`;
        sendHtml(response, 200, layout(day, body, user));
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
          const result = await syncService.sync(user.userId, today);
          if (result.error !== null) redirect(response, withParams(next, { syncError: result.error }));
          else redirect(response, withParams(next, { synced: result.imported }));
        } catch (error) {
          redirect(response, withParams(next, { syncError: describeGarminError(error, "sync") }));
        }
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
          const result = await syncService.sync(user.userId, today);
          if (result.error !== null) redirect(response, withParams(next, { syncError: result.error }));
          else redirect(response, withParams(next, { synced: result.imported }));
        } catch (error) {
          redirect(response, withParams(next, { syncError: describeGarminError(error, "sync") }));
        }
        return;
      }

      sendHtml(response, 404, layout("Not found", `<p>Not found</p>`, user));
    })().catch((error: unknown) => {
      if (!response.headersSent) sendHtml(response, 500, layout("Error", `<p class="error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`, requestUser));
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
