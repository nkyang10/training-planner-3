/**
 * The Garmin workout a completed activity followed. Garmin's Personal API exposes it at
 * `GET /activity-service/activity/{id}/workouts`; the official Swagger documents the endpoint and the
 * `ActivityWorkoutDTO` / `WorkoutStepDTO` schema names, but not the field-level properties. The mapper therefore accepts
 * the shape observed on a live account (`stepIndex`, `intensity`, `durationType`, `durationValue`, `targetType`,
 * `targetValue`, `targetValueLow`/`targetValueHigh`) plus the close variants Garmin uses elsewhere. It never throws:
 * an unreadable payload becomes a "none" workout, and the caller keeps the activity untouched.
 *
 * The workout is a read-only overlay. It is not a future training plan: Garmin's Personal API does not expose scheduled
 * workouts or training-plan definitions, so this describes what the watch ran, not what comes next.
 */
import type { Activity, ActivityWorkout, ActivityWorkoutStep } from "./types";

const MAX_STEPS = 60;
const MAX_SUMMARY = 320;
const MAX_LABEL = 64;

/** One parsed step, before it is turned into display rows and the grouped summary. */
interface ParsedStep {
  index: number;
  intensityKey: string;
  intensity: string;
  durationType: string;
  durationValue: number | null;
  targetType: string | null;
  targetLow: number | null;
  targetHigh: number | null;
  /** Repeat steps: the 1-based step the group returns to. */
  repeatFrom: number | null;
  /** Repeat steps: how many times the group runs. */
  repeatCount: number | null;
  exercise: string | null;
  note: string | null;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** The first value that is not null or undefined, from the given keys of one record. */
function pick(source: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** A nested key such as `stepType.stepTypeKey`, tried as a record only. */
function nestedKey(value: unknown, keys: readonly string[]): string | null {
  const root = record(value);
  if (root === undefined) return null;
  return text(pick(root, keys));
}

/** The step array, accepting the bare array Garmin returns and the object envelopes clients have seen. */
function stepList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    const first = raw.length === 1 ? nestedSteps(raw[0]) : undefined;
    return flatten(first ?? raw);
  }
  return flatten(nestedSteps(raw) ?? []);
}

function nestedSteps(value: unknown): unknown[] | undefined {
  const root = record(value);
  if (root === undefined) return undefined;
  const direct = pick(root, ["workoutSteps", "steps", "workoutStepList", "stepList"]);
  if (Array.isArray(direct)) return direct;
  const segments = root["workoutSegments"];
  if (Array.isArray(segments)) {
    const flat: unknown[] = [];
    for (const segment of segments) {
      const segmentRecord = record(segment);
      const steps = segmentRecord === undefined ? undefined : nestedSteps(segmentRecord);
      if (steps !== undefined) flat.push(...steps);
    }
    if (flat.length > 0) return flat;
  }
  const workout = record(root["workout"]);
  if (workout !== undefined) return nestedSteps(workout);
  return undefined;
}

/**
 * Flatten a classic workout DTO's `RepeatGroupDTO` into its child steps followed by one repeat marker, and number
 * steps that arrive without an index. The observed live payload is already flat, so this only runs for envelopes.
 */
function flatten(values: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  let next = 0;
  const walk = (items: readonly unknown[]): void => {
    for (const item of items) {
      const root = record(item);
      if (root === undefined) continue;
      const children = root["workoutSteps"];
      const isGroup =
        Array.isArray(children) &&
        (String(root["type"] ?? "").toLowerCase().includes("repeat") ||
          numberValue(root["numberOfIterations"]) !== null);
      if (isGroup) {
        const first = next + 1;
        walk(children as readonly unknown[]);
        const iterations = numberValue(root["numberOfIterations"] ?? root["endConditionValue"]) ?? 1;
        next += 1;
        out.push({
          stepIndex: next,
          intensity: "REPEAT",
          durationType: "REPEAT_UNTIL_STEPS_CMPLT",
          durationValue: first,
          targetValue: iterations,
        });
        continue;
      }
      const index = numberValue(root["stepIndex"]);
      next = index === null ? next + 1 : Math.max(next + 1, Math.round(index));
      out.push(index === null ? { ...root, stepIndex: next } : root);
    }
  };
  walk(values);
  return out;
}

function workoutName(raw: unknown): string | null {
  const root = record(raw);
  if (root === undefined) return null;
  const direct = text(pick(root, ["workoutName", "name", "title", "workoutTitle"]));
  if (direct !== null) return direct;
  return nestedKey(root["workout"], ["workoutName", "name", "title"]);
}

function intensityOf(raw: Record<string, unknown>): { key: string; label: string } {
  const rawKey =
    text(pick(raw, ["intensity", "intensityType", "intensityKey"])) ??
    nestedKey(raw["stepType"], ["stepTypeKey", "typeKey", "stepTypeId"]);
  const key = (rawKey ?? "OTHER").toUpperCase().replace(/[\s-]+/g, "_");
  return { key, label: intensityLabel(key) };
}

function intensityLabel(key: string): string {
  if (key.includes("WARM")) return "Warm-up";
  if (key.includes("COOL")) return "Cool-down";
  if (key.includes("RECOVER")) return "Recovery";
  if (key.includes("REST")) return "Rest";
  if (key.includes("INTERVAL") || key === "ACTIVE" || key === "RUN") return "Run";
  if (key.includes("REPEAT")) return "Repeat";
  if (key.includes("OTHER")) return "Step";
  const humanized = key
    .toLowerCase()
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return humanized.length === 0 ? "Step" : humanized;
}

function durationTypeOf(raw: Record<string, unknown>): string {
  const direct = text(pick(raw, ["durationType", "endConditionType", "conditionTypeKey"]));
  if (direct !== null) return direct.toUpperCase().replace(/[\s.-]+/g, "_");
  const nested = nestedKey(raw["endCondition"], ["conditionTypeKey", "durationType", "conditionTypeId"]);
  return nested === null ? "" : nested.toUpperCase().replace(/[\s.-]+/g, "_");
}

function durationValueOf(raw: Record<string, unknown>): number | null {
  return numberValue(pick(raw, ["durationValue", "endConditionValue", "duration"]));
}

function targetTypeOf(raw: Record<string, unknown>): string | null {
  const direct = text(pick(raw, ["targetType", "targetTypeKey", "target"]));
  const rawKey = direct ?? nestedKey(raw["targetType"], ["workoutTargetTypeKey", "targetTypeKey", "typeKey", "targetTypeId"]);
  return rawKey === null ? null : rawKey.toUpperCase().replace(/[\s.-]+/g, "_");
}

function targetRangeOf(raw: Record<string, unknown>, repeat: boolean): { low: number | null; high: number | null } {
  if (repeat) return { low: null, high: null };
  const low = numberValue(pick(raw, ["targetValueLow", "customTargetValueLow", "targetValueOne", "targetLow"]));
  const high = numberValue(pick(raw, ["targetValueHigh", "customTargetValueHigh", "targetValueTwo", "targetHigh"]));
  if (low === null && high === null) {
    const single = numberValue(pick(raw, ["targetValue", "target"]));
    return { low: single, high: single };
  }
  return { low: low ?? high, high: high ?? low };
}

function exerciseOf(raw: Record<string, unknown>): string | null {
  return (
    text(pick(raw, ["exerciseName", "exercise"])) ??
    nestedKey(raw["exercise"], ["name", "exerciseName", "displayName"])
  );
}

function stepNote(raw: Record<string, unknown>): string | null {
  return text(pick(raw, ["notes", "note", "description", "coachNotes"]));
}

function parseStep(value: unknown, position: number): ParsedStep | undefined {
  const raw = record(value);
  if (raw === undefined) return undefined;
  const rawIndex = numberValue(pick(raw, ["stepIndex", "stepOrder", "messageIndex", "index"]));
  const index = rawIndex === null || rawIndex <= 0 ? position + 1 : Math.round(rawIndex);
  const durationType = durationTypeOf(raw);
  const repeat = durationType.includes("REPEAT");
  const intensity = intensityOf(raw);
  const range = targetRangeOf(raw, repeat);
  const repeatFrom = repeat ? numberValue(pick(raw, ["repeatFrom", "durationValue", "endConditionValue"])) : null;
  const repeatCount = repeat
    ? numberValue(pick(raw, ["repeatCount", "numberOfIterations", "targetValue", "iterations"]))
    : null;
  return {
    index,
    intensityKey: intensity.key,
    intensity: intensity.label,
    durationType,
    durationValue: durationValueOf(raw),
    targetType: targetTypeOf(raw),
    targetLow: range.low,
    targetHigh: range.high,
    repeatFrom: repeatFrom === null ? null : Math.round(repeatFrom),
    repeatCount: repeatCount === null ? null : Math.round(repeatCount),
    exercise: exerciseOf(raw),
    note: stepNote(raw),
  };
}

function clock(totalSeconds: number): string {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function paceClock(secPerKm: number): string {
  const rounded = Math.max(0, Math.round(secPerKm));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function rounded(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Garmin stores a workout time in seconds; FIT-style millisecond payloads are recognized by magnitude. */
function durationSeconds(value: number): number {
  return value > 86_400 ? value / 1000 : value;
}

function durationText(type: string, value: number | null): string {
  if (value === null || value <= 0) return type.includes("LAP") ? "lap" : "open";
  if (type.includes("REP")) return `${Math.round(value)} reps`;
  if (type.includes("DIST")) {
    return value >= 100 ? `${rounded(value / 1000, 2)} km` : `${Math.round(value)} m`;
  }
  if (type.includes("CAL")) return `${Math.round(value)} kcal`;
  return clock(durationSeconds(value));
}

/** Target text; pace and speed targets arrive in metres per second on the live endpoint. */
function targetText(type: string | null, low: number | null, high: number | null): string | null {
  if (low === null || high === null || low <= 0 || high <= 0) return null;
  const key = type ?? "";
  const first = Math.min(low, high);
  const second = Math.max(low, high);
  if (key.includes("PACE")) {
    const asPace = (value: number): number => (value < 30 ? 1000 / value : value);
    const fast = Math.round(Math.min(asPace(low), asPace(high)));
    const slow = Math.round(Math.max(asPace(low), asPace(high)));
    return fast === slow ? `${paceClock(fast)}/km` : `${paceClock(fast)}–${paceClock(slow)}/km`;
  }
  if (key.includes("HEART")) {
    if (second <= 100) return `${Math.round(first)}–${Math.round(second)}% max HR`;
    return `${Math.round(first)}–${Math.round(second)} bpm`;
  }
  if (key.includes("CADENCE")) return `${Math.round(first)}–${Math.round(second)} spm`;
  if (key.includes("POWER")) return `${Math.round(first)}–${Math.round(second)} W`;
  if (key.includes("SPEED")) {
    const kmh = (value: number): number => (value < 30 ? value * 3.6 : value);
    return `${rounded(Math.min(kmh(low), kmh(high)), 1)}–${rounded(Math.max(kmh(low), kmh(high)), 1)} km/h`;
  }
  return `${rounded(first, 1)}–${rounded(second, 1)}`;
}

/** One step as a phrase, e.g. "Warm-up 10:00 @ 5:30–5:50/km" or "Squat 12 reps". */
function stepText(step: ParsedStep): string {
  const head = step.exercise ?? step.intensity;
  const parts = [head, durationText(step.durationType, step.durationValue)];
  const target = targetText(step.targetType, step.targetLow, step.targetHigh);
  if (target !== null) parts.push(`@ ${target}`);
  return parts.join(" ");
}

interface SummaryEntry {
  text: string;
  /** First raw step index this entry covers. */
  fromIndex: number;
  /** Last raw step index this entry covers; equal to fromIndex for a plain step. */
  toIndex: number;
}

/**
 * Group the steps into phrases. A repeat step closes the block it points back to, so the block becomes one
 * "3 × (…)" entry; because grouping runs in order, a nested repeat is already one entry when its outer repeat
 * closes, and it nests correctly.
 */
function groupEntries(steps: readonly ParsedStep[]): SummaryEntry[] {
  const output: SummaryEntry[] = [];
  for (const step of steps) {
    if (step.repeatCount === null || step.repeatCount <= 0) {
      output.push({ text: stepText(step), fromIndex: step.index, toIndex: step.index });
      continue;
    }
    const from = step.repeatFrom ?? 1;
    const inside = output.filter((entry) => entry.fromIndex >= from && entry.toIndex < step.index);
    const outside = output.filter((entry) => !(entry.fromIndex >= from && entry.toIndex < step.index));
    const body = inside.map((entry) => entry.text).join(", ");
    const text = body.length === 0 ? `${step.repeatCount} × repeat` : `${step.repeatCount} × (${body})`;
    outside.push({ text, fromIndex: from, toIndex: step.index });
    output.splice(0, output.length, ...outside);
  }
  return output;
}

function capText(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;
}

/** The grouped one-line summary. */
function summarize(entries: readonly SummaryEntry[]): string {
  return capText(entries.map((entry) => entry.text).join(" · "), MAX_SUMMARY);
}

/** The short pill/peek label: the workout name, else the main repeat group, else the first step. */
function shortLabel(name: string | null, entries: readonly SummaryEntry[]): string {
  if (name !== null) return capText(name, MAX_LABEL);
  const group = entries.find((entry) => entry.fromIndex !== entry.toIndex);
  return capText((group ?? entries[0])?.text ?? "Garmin workout", MAX_LABEL);
}

function notesOf(raw: unknown, steps: readonly ParsedStep[]): string | null {
  const root = record(raw);
  const direct = root === undefined ? null : pick(root, ["notes", "coachNotes", "description"]);
  if (typeof direct === "string" && direct.trim().length > 0) return direct.trim();
  if (Array.isArray(direct)) {
    const parts = direct.map(text).filter((part): part is string => part !== null);
    if (parts.length > 0) return parts.join(" ");
  }
  const fromSteps = [...new Set(steps.map((step) => step.note).filter((note): note is string => note !== null))];
  return fromSteps.length === 0 ? null : fromSteps.join(" ");
}

function toDisplayStep(step: ParsedStep): ActivityWorkoutStep {
  if (step.repeatCount !== null && step.repeatCount > 0) {
    return {
      index: step.index,
      intensity: "Repeat",
      intensityKey: "REPEAT",
      duration: `${step.repeatCount} ×`,
      target: step.repeatFrom === null ? null : `back to step ${step.repeatFrom}`,
    };
  }
  return {
    index: step.index,
    intensity: step.intensity,
    intensityKey: step.intensityKey,
    duration: durationText(step.durationType, step.durationValue),
    target: targetText(step.targetType, step.targetLow, step.targetHigh),
  };
}

/**
 * Map one `/activity-service/activity/{id}/workouts` payload to the Milebook record. An empty or unreadable payload is a
 * confirmed "none": the run followed no planned workout.
 */
export function mapGarminWorkout(raw: unknown, activity: Activity, fetchedAt: string): ActivityWorkout {
  const parsed = stepList(raw)
    .slice(0, MAX_STEPS)
    .map(parseStep)
    .filter((step): step is ParsedStep => step !== undefined);
  const name = workoutName(raw);
  const entries = groupEntries(parsed);
  const base = {
    activityId: activity.activityId,
    userId: activity.userId,
    day: activity.day,
    fetchedAt,
    attempts: 0,
  };
  if (parsed.length === 0) {
    return { ...base, name, label: name ?? "", summary: "", steps: [], notes: null, status: "none" };
  }
  return {
    ...base,
    name,
    label: shortLabel(name, entries),
    summary: summarize(entries),
    steps: parsed.map(toDisplayStep),
    notes: notesOf(raw, parsed),
    status: "ok",
  };
}

/** A failed fetch, kept so sync can retry once and then stop asking Garmin for this activity. */
export function failedGarminWorkout(activity: Activity, attempts: number, fetchedAt: string): ActivityWorkout {
  return {
    activityId: activity.activityId,
    userId: activity.userId,
    day: activity.day,
    name: null,
    label: "",
    summary: "",
    steps: [],
    notes: null,
    status: "unavailable",
    attempts: Math.max(1, Math.round(attempts)),
    fetchedAt,
  };
}
