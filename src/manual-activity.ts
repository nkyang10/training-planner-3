/**
 * Build a reported activity from the runner's form.
 *
 * POC3's completion half used to be Garmin-only: `appendActivity` had exactly one caller, the sync. This module turns a
 * small form into the same `Activity` record the sync writes, so the calendar, the training log, plan matching, the run
 * peek and the activity detail all work without a device.
 *
 * The rules are deliberately conservative: no future runs, a bounded distance/duration, at least one of the two amounts,
 * and a deterministic id derived from the client request id so a double submit replaces the same row instead of
 * duplicating it. The form also accepts an optional post-run RPE (0-10 in half steps, the Borg CR10 scale): it is
 * stored as-is and gives the run a session-RPE load in the training log even without a Garmin training load.
 */
import { createHash, randomUUID } from "node:crypto";

import type { Activity } from "./types";

export interface ManualActivityInput {
  day: string;
  title?: string | null;
  distanceKm?: string | null;
  durationMin?: string | null;
  /** Optional post-run effort, 0-10 in half steps (e.g. "7" or "7.5"); absent, null or blank stays valid. */
  rpe?: string | null;
  /** Client-generated idempotency key; a repeated submit reuses the same activity id. */
  requestId?: string | null;
}

export interface ManualActivityContext {
  userId: string;
  today: string;
  now: string;
}

export type ManualActivityResult =
  | { ok: true; activity: Activity }
  | { ok: false; error: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE_CHARS = 80;
const MAX_DISTANCE_KM = 100;
const MAX_DURATION_MIN = 600;
const MIN_RPE = 0;
const MAX_RPE = 10;

function parseAmount(raw: string | null | undefined, min: number, max: number): number | null | undefined {
  if (raw === null || raw === undefined || raw.trim().length === 0) return null;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < min || value > max) return undefined;
  return value;
}

/**
 * The RPE scale allows integer and half steps only ("7.5" is valid, "7.25" is not), so a one-tap form never
 * produces a value the load rules would have to round or refuse later.
 */
function parseRpe(raw: string | null | undefined): number | null | undefined {
  if (raw === null || raw === undefined || raw.trim().length === 0) return null;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < MIN_RPE || value > MAX_RPE) return undefined;
  if (Math.round(value * 2) !== value * 2) return undefined;
  return value;
}

function cleanTitle(raw: string | null | undefined): string {
  const title = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (title.length === 0) return "Run";
  return title.slice(0, MAX_TITLE_CHARS);
}

function activityIdFor(userId: string, requestId: string | null | undefined): string {
  const key = typeof requestId === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(requestId) ? requestId : randomUUID();
  const digest = createHash("sha256").update(`${userId}:${key}`).digest("hex").slice(0, 24);
  return `activity:manual:${digest}`;
}

export function buildManualActivity(input: ManualActivityInput, context: ManualActivityContext): ManualActivityResult {
  const day = typeof input.day === "string" ? input.day.trim() : "";
  if (!ISO_DAY.test(day)) return { ok: false, error: "Pick a valid day (YYYY-MM-DD)." };
  if (day > context.today) return { ok: false, error: "A run cannot be logged in the future." };

  const distanceKm = parseAmount(input.distanceKm, 0, MAX_DISTANCE_KM);
  if (distanceKm === undefined) {
    return { ok: false, error: `Distance must be between 0 and ${MAX_DISTANCE_KM} km.` };
  }
  const durationMin = parseAmount(input.durationMin, 1, MAX_DURATION_MIN);
  if (durationMin === undefined) {
    return { ok: false, error: `Duration must be between 1 and ${MAX_DURATION_MIN} minutes.` };
  }
  if (distanceKm === null && durationMin === null) {
    return { ok: false, error: "Enter a distance, a duration, or both." };
  }

  const rpe = parseRpe(input.rpe);
  if (rpe === undefined) {
    return { ok: false, error: `RPE must be between ${MIN_RPE} and ${MAX_RPE} in half steps.` };
  }

  const paceSecPerKm =
    distanceKm !== null && distanceKm > 0 && durationMin !== null
      ? Math.round((durationMin * 60) / distanceKm)
      : null;

  return {
    ok: true,
    activity: {
      activityId: activityIdFor(context.userId, input.requestId),
      userId: context.userId,
      day,
      title: cleanTitle(input.title),
      distanceKm,
      durationMin,
      paceSecPerKm,
      avgHr: null,
      source: "chat",
      createdAt: context.now,
      rpe,
    },
  };
}
