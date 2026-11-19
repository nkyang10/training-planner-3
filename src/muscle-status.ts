/**
 * The muscle status layer: check-ins become dated status periods, and the present-day soreness is computed
 * from time.
 *
 * The rules, in the runner's words:
 *
 * - Every muscle is in **perfect condition by default**. Nothing is assumed sore until the runner says so.
 * - A check-in starts a status period on the day it is about: the reported level is the start level.
 * - The period **fades on its own**: DOMS resolves in days, so the level decays deterministically over a
 *   standard window (10 days) and dismisses itself at the end. No maintenance work for the runner.
 * - **Hold** keeps the reported level constant until the runner changes it — the honest option for something
 *   that is not improving on its own.
 * - **All better** ends the period on the runner's claim, whatever the clock says.
 * - A newer check-in for the same muscle restarts the period with the new level, so reporting is always the
 *   last word.
 *
 * Everything here is pure data and pure functions so the muscle tab, the coach prompt, the calendar chip and
 * the tests read one source of truth. The decay is an expectation model, not a diagnosis: it mirrors the DOMS
 * course already documented in MUSCLE-TAB.md §9 (pain-free 12-24 h, peak 24-72 h, resolved by 5-7 days),
 * with the 10-day window as the generous auto-dismiss bound the runner asked for.
 */
import {
  MUSCLE_CATALOG,
  readMuscleTag,
  sorenessLabel,
  muscleShortName,
  worstLevel,
  MUSCLE_CONDITION_BY_KEY,
  type MuscleCheckIn,
  type MuscleConditionKey,
  type MuscleSide,
  type MuscleTagLevel,
  type MuscleTagReading,
  type MuscleWarmUp,
} from "./muscles";

/** The standard auto-dismiss window: a status that is not held fades to perfect within this many days. */
export const MUSCLE_STATUS_WINDOW_DAYS = 10;

/** How many days back a check-in still counts as "recent" for the coach's history line. */
export const STATUS_RECENT_DAYS = 14;

// ---------------------------------------------------------------------------
// Controls (the small stored state) and the derived status
// ---------------------------------------------------------------------------

export interface MuscleStatusControl {
  userId: string;
  muscleId: string;
  /** True when the runner chose "keep constant until I change it" — decay is suspended. */
  hold: boolean;
  /** The day the runner claimed "all better"; the muscle is back to perfect from that day. */
  resolvedDay: string | null;
  updatedAt: string;
}

export interface MuscleStatus {
  muscleId: string;
  /** The day the period started (the check-in's day). */
  startDay: string;
  /** The reported level at the start. */
  reported: number;
  /** Today's level: decayed by time, or the reported level when held. */
  current: number;
  conditions: readonly MuscleConditionKey[];
  side: MuscleSide;
  warmUp: MuscleWarmUp | null;
  /** True when decay is suspended and the level stays until the runner changes it. */
  hold: boolean;
  /** The worst day of the auto-dismiss window; the status dismisses itself after it. */
  expectedClearDay: string;
  /** Today's reading: the deterministic interpretation recomputed at today's level. */
  level: MuscleTagLevel;
  reading: MuscleTagReading;
  checkInId: string;
  /** The run this status was reported after, when the runner linked one. */
  activityId: string | null;
}

// ---------------------------------------------------------------------------
// Day math (UTC days; check-ins are already ISO days in the runner's timezone)
// ---------------------------------------------------------------------------

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function addStatusDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days between two ISO days: 0 when the same day, negative when `to` is before `from`. */
export function daysStatusBetween(from: string, to: string): number {
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) return 0;
  const difference = Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`);
  return Math.round(difference / 86_400_000);
}

// ---------------------------------------------------------------------------
// The decay curve
// ---------------------------------------------------------------------------

/**
 * The present-day level for one reported level, given whole days elapsed. The reported level holds through
 * the first day (DOMS peaks 24-72 h, so a same-day or next-morning report is already the peak), then falls
 * linearly to zero at the end of the window. Rounded to the same whole 0-10 scale the runner reported on.
 */
export function decayedSoreness(reported: number, elapsedDays: number, windowDays = MUSCLE_STATUS_WINDOW_DAYS): number {
  const level = Math.max(0, Math.min(10, Math.round(reported)));
  if (level === 0) return 0;
  if (elapsedDays <= 1) return level;
  if (elapsedDays >= windowDays) return 0;
  return Math.round((level * (windowDays - elapsedDays)) / (windowDays - 1));
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

interface MuscleMention {
  checkIn: MuscleCheckIn;
  index: number;
  tagIndex: number;
}

/** The latest mention of each muscle, judged by created time first and by list position to break ties. */
function latestMentionsByMuscle(checkIns: readonly MuscleCheckIn[]): Map<string, MuscleMention> {
  const latest = new Map<string, MuscleMention>();
  checkIns.forEach((checkIn, index) => {
    checkIn.muscles.forEach((tag, tagIndex) => {
      const existing = latest.get(tag.muscleId);
      const newer =
        existing === undefined ||
        checkIn.createdAt > existing.checkIn.createdAt ||
        (checkIn.createdAt === existing.checkIn.createdAt && index > existing.index);
      if (newer) latest.set(tag.muscleId, { checkIn, index, tagIndex });
    });
  });
  return latest;
}

/**
 * The runner's current muscle statuses: one per muscle with an active period, in catalog order. Muscles with
 * no report, a resolved control, or a fully faded window are simply absent — absence is perfect condition.
 */
export function computeMuscleStatuses(input: {
  checkIns: readonly MuscleCheckIn[];
  controls: readonly MuscleStatusControl[];
  today: string;
}): readonly MuscleStatus[] {
  const controlsByMuscle = new Map<string, MuscleStatusControl>();
  for (const control of input.controls) controlsByMuscle.set(control.muscleId, control);
  const mentions = latestMentionsByMuscle(input.checkIns);
  const statuses: MuscleStatus[] = [];
  for (const muscle of MUSCLE_CATALOG) {
    const mention = mentions.get(muscle.id);
    if (mention === undefined) continue;
    const control = controlsByMuscle.get(muscle.id);
    // A newer report restarts the period (the save path clears the control), so a surviving resolvedDay means
    // the runner ended this period after reporting it.
    if (control !== undefined && control.resolvedDay !== null && control.resolvedDay >= mention.checkIn.day) {
      continue;
    }
    const tag = mention.checkIn.muscles[mention.tagIndex];
    if (tag === undefined) continue;
    const hold = control?.hold === true;
    const elapsed = daysStatusBetween(mention.checkIn.day, input.today);
    const current = hold ? tag.soreness : decayedSoreness(tag.soreness, elapsed);
    const fadedOut =
      !hold && (elapsed >= MUSCLE_STATUS_WINDOW_DAYS || (current === 0 && tag.conditions.length === 0));
    if (fadedOut) continue;
    const todayTag = { ...tag, soreness: current };
    const reading = readMuscleTag(todayTag);
    statuses.push({
      muscleId: muscle.id,
      startDay: mention.checkIn.day,
      reported: tag.soreness,
      current,
      conditions: [...tag.conditions],
      side: tag.side,
      warmUp: tag.warmUp,
      hold,
      expectedClearDay: addStatusDays(mention.checkIn.day, MUSCLE_STATUS_WINDOW_DAYS),
      level: reading.level,
      reading,
      checkInId: mention.checkIn.checkInId,
      activityId: mention.checkIn.activityId,
    });
  }
  return statuses;
}

/** The worst reading level among the runner's active statuses, or null when every muscle is perfect. */
export function worstStatusLevel(statuses: readonly MuscleStatus[]): MuscleTagLevel | null {
  return worstLevel(statuses.map((status) => status.level));
}

/** How many muscles are in a special (non-perfect) status — the number the attention badge shows. */
export function attentionCount(statuses: readonly MuscleStatus[]): number {
  return statuses.length;
}

// ---------------------------------------------------------------------------
// Display lines shared by the UI and the coach prompt
// ---------------------------------------------------------------------------

function conditionLabels(conditions: readonly MuscleConditionKey[]): string {
  return conditions.map((condition) => MUSCLE_CONDITION_BY_KEY[condition].label.toLowerCase()).join(", ");
}

/** One runner-facing line: "5/10 noticeable · tight · fading since Thu 12 Nov, clear by Sun 22". */
export function statusLine(status: MuscleStatus): string {
  const parts = [`${status.current}/10 ${sorenessLabel(status.current).toLowerCase()}`];
  const conditions = conditionLabels(status.conditions);
  if (conditions.length > 0) parts.push(conditions);
  if (status.hold) parts.push(`held constant since ${status.startDay}`);
  else if (status.current === status.reported) parts.push(`reported ${status.startDay}`);
  else parts.push(`was ${status.reported}/10 on ${status.startDay}, fading`);
  return parts.join(" · ");
}

/**
 * The muscle facts block for the coach prompt, rewritten for the status layer: today's computed levels per
 * muscle (with the time story the coach needs), the latest check-in's note, and an honest recent count. Empty
 * string when nothing is active, so the block simply does not render.
 */
export function renderMuscleStatusFactsForPrompt(input: {
  statuses: readonly MuscleStatus[];
  checkIns: readonly MuscleCheckIn[];
  today: string;
}): string {
  if (input.statuses.length === 0) return "";
  const lines = input.statuses.map((status) => {
    const name = muscleShortName(status.muscleId);
    const conditions = status.conditions.join("+");
    const side = status.side === "both" ? "" : `, ${status.side}`;
    const warmUp =
      status.warmUp === "eases"
        ? ", eases with warm-up"
        : status.warmUp === "worse"
          ? ", worse with warm-up"
          : "";
    const story = status.hold
      ? `held constant by the runner since ${status.startDay} — the runner says it is not fading on its own`
      : status.current === status.reported
        ? `reported on ${status.startDay}`
        : `reported ${status.reported}/10 on ${status.startDay}, faded with time; expected fully clear by ${status.expectedClearDay}`;
    return `- ${name}: ${status.current}/10 ${sorenessLabel(status.current).toLowerCase()} (${story})${conditions.length === 0 ? "" : ` ${conditions}`}${side}${warmUp}`;
  });
  const latest = input.checkIns[0] ?? null;
  const note = latest?.note === null || latest?.note === undefined ? "" : `- Latest check-in note: "${latest.note}"`;
  const about = latest === null || latest.activityId === null ? "" : " (about the linked run)";
  const recentCutoff = addStatusDays(input.today, -STATUS_RECENT_DAYS);
  const recentCount = input.checkIns.filter((checkIn) => checkIn.day >= recentCutoff).length;
  return [
    `Muscle status today (${input.today}) — runner-reported levels on a 0-10 anchored scale, computed by time: without a new report, a level fades over about ${MUSCLE_STATUS_WINDOW_DAYS} days and the muscle returns to perfect condition. ${input.statuses.length} muscle${input.statuses.length === 1 ? "" : "s"} need attention:`,
    ...lines,
    `- Every other muscle is in perfect condition.`,
    latest === null ? "" : `- Latest check-in: ${latest.day}${about}`,
    note,
    `- ${recentCount} check-in${recentCount === 1 ? "" : "s"} in the last ${STATUS_RECENT_DAYS} days`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}
