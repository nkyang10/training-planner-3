import type { Activity, TrainingSession } from "./types";
import { addDays } from "./time";

export type MatchStatus = "on-plan" | "short" | "long" | "unplanned";

export interface ActivityPlanMatch {
  activity: Activity;
  session: TrainingSession | null;
  distanceDeltaKm: number | null;
  durationDeltaMin: number | null;
  status: MatchStatus;
}

interface Candidate {
  activity: Activity;
  session: TrainingSession;
  gap: number;
}

function distanceGap(activity: Activity, session: TrainingSession): number | null {
  if (activity.distanceKm === null && session.distanceKm === null) return 0;
  if (activity.distanceKm === null || session.distanceKm === null) return null;
  return Math.abs(activity.distanceKm - session.distanceKm);
}

function withinTolerance(activity: Activity, session: TrainingSession): boolean {
  const gap = distanceGap(activity, session);
  if (gap === null) return false;
  if (activity.distanceKm === null || session.distanceKm === null) return true;
  return gap <= Math.max(2, session.distanceKm * 0.35);
}

function statusOf(activity: Activity, session: TrainingSession): MatchStatus {
  if (activity.distanceKm === null || session.distanceKm === null) return "on-plan";
  const delta = activity.distanceKm - session.distanceKm;
  const threshold = Math.max(0.5, session.distanceKm * 0.1);
  if (delta < -threshold) return "short";
  if (delta > threshold) return "long";
  return "on-plan";
}

function deltaKm(activity: Activity, session: TrainingSession): number | null {
  if (activity.distanceKm === null || session.distanceKm === null) return null;
  return Math.round((activity.distanceKm - session.distanceKm) * 10) / 10;
}

function deltaMin(activity: Activity, session: TrainingSession): number | null {
  if (activity.durationMin === null || session.durationMin === null) return null;
  return Math.round(activity.durationMin - session.durationMin);
}

/**
 * Greedy one-to-one day matching: the closest planned session takes the closest
 * recorded activity, within a distance tolerance. A run with no plausible plan
 * is returned as unplanned rather than forced onto a session.
 */
export function matchActivitiesToPlan(
  activities: readonly Activity[],
  sessions: readonly TrainingSession[],
): ActivityPlanMatch[] {
  const candidates: Candidate[] = [];
  for (const activity of activities) {
    for (const session of sessions) {
      // Plan-vs-actual is a same-day comparison; a Thursday run cannot satisfy Tuesday's plan.
      if (activity.day !== session.day) continue;
      if (!withinTolerance(activity, session)) continue;
      const gap = distanceGap(activity, session);
      if (gap === null) continue;
      candidates.push({ activity, session, gap });
    }
  }
  candidates.sort(
    (left, right) =>
      left.gap - right.gap ||
      left.activity.activityId.localeCompare(right.activity.activityId) ||
      left.session.sessionId.localeCompare(right.session.sessionId),
  );
  const usedActivities = new Set<string>();
  const usedSessions = new Set<string>();
  const matched = new Map<string, ActivityPlanMatch>();
  for (const candidate of candidates) {
    if (usedActivities.has(candidate.activity.activityId) || usedSessions.has(candidate.session.sessionId)) continue;
    usedActivities.add(candidate.activity.activityId);
    usedSessions.add(candidate.session.sessionId);
    matched.set(candidate.activity.activityId, {
      activity: candidate.activity,
      session: candidate.session,
      distanceDeltaKm: deltaKm(candidate.activity, candidate.session),
      durationDeltaMin: deltaMin(candidate.activity, candidate.session),
      status: statusOf(candidate.activity, candidate.session),
    });
  }
  return activities.map((activity) => matched.get(activity.activityId) ?? {
    activity,
    session: null,
    distanceDeltaKm: null,
    durationDeltaMin: null,
    status: "unplanned",
  });
}

export function unmatchedSessions(
  matches: readonly ActivityPlanMatch[],
  sessions: readonly TrainingSession[],
): TrainingSession[] {
  const matchedIds = new Set<string>();
  for (const match of matches) {
    if (match.session !== null) matchedIds.add(match.session.sessionId);
  }
  return sessions.filter((session) => !matchedIds.has(session.sessionId));
}

/** One activity matched against a day's planned sessions; unplanned when nothing fits. */
export function matchActivity(
  activity: Activity,
  sessions: readonly TrainingSession[],
): ActivityPlanMatch {
  return matchActivitiesToPlan([activity], sessions)[0] ?? {
    activity,
    session: null,
    distanceDeltaKm: null,
    durationDeltaMin: null,
    status: "unplanned",
  };
}

export type BestEffortDistance = "1k" | "1mi" | "5k";

export interface PersonalBest {
  distance: BestEffortDistance;
  seconds: number;
  activity: Activity;
}

const BEST_EFFORT_DISTANCES: readonly BestEffortDistance[] = ["1k", "1mi", "5k"];

function bestEffortSeconds(activity: Activity, distance: BestEffortDistance): number | null {
  const value = distance === "1k"
    ? activity.fastest1kSec
    : distance === "1mi"
      ? activity.fastest1miSec
      : activity.fastest5kSec;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Fastest 1 km / 1 mi / 5 km across the supplied history; ties go to the later day. */
export function personalBests(activities: readonly Activity[]): PersonalBest[] {
  const best = new Map<BestEffortDistance, PersonalBest>();
  for (const activity of activities) {
    for (const distance of BEST_EFFORT_DISTANCES) {
      const seconds = bestEffortSeconds(activity, distance);
      if (seconds === null) continue;
      const current = best.get(distance);
      if (
        current === undefined ||
        seconds < current.seconds ||
        (seconds === current.seconds && activity.day > current.activity.day)
      ) {
        best.set(distance, { distance, seconds, activity });
      }
    }
  }
  return BEST_EFFORT_DISTANCES.flatMap((distance) => {
    const entry = best.get(distance);
    return entry === undefined ? [] : [entry];
  });
}

/** Fastest 1 km / 1 mi / 5 km inside one period, used by the month/year best-efforts card. */
export function personalBestsForPeriod(
  activities: readonly Activity[],
  start: string,
  end: string,
): PersonalBest[] {
  return personalBests(activities.filter((activity) => activity.day >= start && activity.day <= end));
}

export type LoadSignal = "steady" | "watch" | "high" | "insufficient" | "no-data";

/**
 * A soft weekly load signal. The load is Garmin's training load when present; ACWR is the selected week against the
 * 28-day average (coupled rolling average). It is deliberately not a diagnosis or an injury prediction.
 */
export interface LoadSummary {
  weekLoad: number;
  previousWeekLoad: number;
  fourWeekLoad: number;
  acwr: number | null;
  weekChangePct: number | null;
  hardDistanceKm: number;
  easyDistanceKm: number;
  hardMinutes: number;
  easyMinutes: number;
  hardRuns: number;
  easyRuns: number;
  hasLoad: boolean;
  hasIntensity: boolean;
  signal: LoadSignal;
  label: string;
  note: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function activityLoad(activity: Activity): number {
  const load = activity.trainingLoad;
  return typeof load === "number" && Number.isFinite(load) && load > 0 ? load : 0;
}

function isHardActivity(activity: Activity): boolean {
  const label = activity.trainingEffectLabel?.toUpperCase() ?? "";
  if (/TEMPO|THRESHOLD|VO2|ANAEROBIC|SPEED|RACE|INTERVAL/.test(label)) return true;
  return (activity.anaerobicTrainingEffect ?? 0) >= 2.5;
}

/**
 * Summarise one selected week for the training-log load card. The 28-day window includes the selected week (coupled
 * ACWR); a missing baseline returns `insufficient` instead of inventing a ratio.
 */
export function loadSummaryForWeek(activities: readonly Activity[], weekStart: string): LoadSummary {
  const weekEnd = addDays(weekStart, 6);
  const previousStart = addDays(weekStart, -7);
  const previousEnd = addDays(weekStart, -1);
  const fourWeekStart = addDays(weekEnd, -27);
  const weekActivities = activities.filter((activity) => activity.day >= weekStart && activity.day <= weekEnd);
  const previousActivities = activities.filter((activity) => activity.day >= previousStart && activity.day <= previousEnd);
  const fourWeekActivities = activities.filter((activity) => activity.day >= fourWeekStart && activity.day <= weekEnd);

  const weekLoad = round1(weekActivities.reduce((sum, activity) => sum + activityLoad(activity), 0));
  const previousWeekLoad = round1(previousActivities.reduce((sum, activity) => sum + activityLoad(activity), 0));
  const fourWeekLoad = round1(fourWeekActivities.reduce((sum, activity) => sum + activityLoad(activity), 0));
  const hasLoad = weekActivities.some((activity) => activityLoad(activity) > 0);
  const hasIntensity = weekActivities.some(
    (activity) => activity.trainingEffectLabel !== null && activity.trainingEffectLabel !== undefined
      || activity.anaerobicTrainingEffect !== null && activity.anaerobicTrainingEffect !== undefined,
  );
  const hasBaseline = previousWeekLoad > 0 && fourWeekLoad > 0;
  const acwr = hasBaseline && hasLoad ? Math.round((weekLoad / (fourWeekLoad / 4)) * 100) / 100 : null;
  const weekChangePct = previousWeekLoad > 0 && hasLoad
    ? Math.round(((weekLoad - previousWeekLoad) / previousWeekLoad) * 100)
    : null;

  let hardDistanceKm = 0;
  let easyDistanceKm = 0;
  let hardMinutes = 0;
  let easyMinutes = 0;
  let hardRuns = 0;
  let easyRuns = 0;
  if (hasIntensity) {
    for (const activity of weekActivities) {
      const hard = isHardActivity(activity);
      const distance = activity.distanceKm ?? 0;
      const minutes = activity.durationMin ?? 0;
      if (hard) {
        hardDistanceKm += distance;
        hardMinutes += minutes;
        hardRuns += 1;
      } else {
        easyDistanceKm += distance;
        easyMinutes += minutes;
        easyRuns += 1;
      }
    }
  }

  let signal: LoadSignal = "steady";
  if (!hasLoad) signal = "no-data";
  else if (!hasBaseline) signal = "insufficient";
  else if ((acwr !== null && acwr > 1.5) || (weekChangePct !== null && weekChangePct > 30)) signal = "high";
  else if ((acwr !== null && acwr > 1.3) || (weekChangePct !== null && weekChangePct > 20)) signal = "watch";

  const labels: Record<LoadSignal, string> = {
    steady: "Steady",
    watch: "Watch the ramp",
    high: "High ramp",
    insufficient: "Not enough history",
    "no-data": "No load data",
  };
  const notes: Record<LoadSignal, string> = {
    steady: "Load is within the recent range. Keep the easy/hard mix deliberate.",
    watch: "The ramp is rising. Keep the next week easier and treat this as a signal, not a diagnosis.",
    high: "The ramp is steep. Back off the next week and treat this as a signal, not a diagnosis.",
    insufficient: "A previous week and four weeks of load are needed before judging the ramp.",
    "no-data": "Garmin did not provide training load for these runs.",
  };

  return {
    weekLoad,
    previousWeekLoad,
    fourWeekLoad,
    acwr,
    weekChangePct,
    hardDistanceKm: round1(hardDistanceKm),
    easyDistanceKm: round1(easyDistanceKm),
    hardMinutes: Math.round(hardMinutes),
    easyMinutes: Math.round(easyMinutes),
    hardRuns,
    easyRuns,
    hasLoad,
    hasIntensity,
    signal,
    label: labels[signal],
    note: notes[signal],
  };
}
