import { describe, expect, it } from "vitest";
import {
  loadSummaryForWeek,
  matchActivitiesToPlan,
  personalBests,
  personalBestsForPeriod,
  unmatchedSessions,
} from "../src/training";
import type { Activity, SessionKind, TrainingSession } from "../src/types";

const activity = (
  activityId: string,
  day: string,
  distanceKm: number | null,
  durationMin: number | null = 30,
): Activity => ({
  activityId,
  userId: "u",
  day,
  title: `activity-${activityId}`,
  distanceKm,
  durationMin,
  paceSecPerKm: 360,
  avgHr: 145,
  source: "garmin",
  createdAt: "2026-11-05T07:00:00.000Z",
});

const session = (
  sessionId: string,
  day: string,
  distanceKm: number | null,
  kind: SessionKind = "easy",
  durationMin: number | null = 30,
): TrainingSession => ({
  sessionId,
  userId: "u",
  day,
  title: `session-${sessionId}`,
  kind,
  distanceKm,
  durationMin,
  note: null,
  createdAt: "2026-11-05T00:00:00.000Z",
});

describe("plan-vs-actual matching", () => {
  it("matches the closest session and reports the distance and duration deltas", () => {
    const [match] = matchActivitiesToPlan(
      [activity("a1", "2026-11-05", 5.2, 32)],
      [session("s1", "2026-11-05", 5, "easy", 30)],
    );

    expect(match?.session?.sessionId).toBe("s1");
    expect(match?.status).toBe("on-plan");
    expect(match?.distanceDeltaKm).toBe(0.2);
    expect(match?.durationDeltaMin).toBe(2);
  });

  it("marks a materially shorter or longer run while still matching it", () => {
    const [short, long] = matchActivitiesToPlan(
      [activity("short", "2026-11-05", 3.5), activity("long", "2026-11-05", 6.9)],
      [session("s1", "2026-11-05", 5), session("s2", "2026-11-05", 6)],
    );

    expect(short?.session?.sessionId).toBe("s1");
    expect(short?.status).toBe("short");
    expect(short?.distanceDeltaKm).toBe(-1.5);
    expect(long?.session?.sessionId).toBe("s2");
    expect(long?.status).toBe("long");
    expect(long?.distanceDeltaKm).toBe(0.9);
  });

  it("leaves a run unplanned when no session is plausible", () => {
    const [match] = matchActivitiesToPlan(
      [activity("a1", "2026-11-05", 12)],
      [session("s1", "2026-11-05", 5)],
    );

    expect(match?.session).toBeNull();
    expect(match?.status).toBe("unplanned");
    expect(match?.distanceDeltaKm).toBeNull();
  });

  it("uses each session and activity once, closest pair first", () => {
    const matches = matchActivitiesToPlan(
      [activity("a1", "2026-11-05", 5.1), activity("a2", "2026-11-05", 9.8)],
      [session("s1", "2026-11-05", 5), session("s2", "2026-11-05", 10)],
    );

    expect(matches.map((match) => [match.activity.activityId, match.session?.sessionId])).toEqual([
      ["a1", "s1"],
      ["a2", "s2"],
    ]);
  });

  it("reports sessions that no activity matched", () => {
    const sessions = [session("s1", "2026-11-05", 5), session("s2", "2026-11-05", 10)];
    const matches = matchActivitiesToPlan([activity("a1", "2026-11-05", 5.1)], sessions);

    expect(unmatchedSessions(matches, sessions).map((entry) => entry.sessionId)).toEqual(["s2"]);
  });

  it("matches two no-distance records without inventing a delta", () => {
    const [match] = matchActivitiesToPlan(
      [activity("a1", "2026-11-05", null)],
      [session("s1", "2026-11-05", null)],
    );

    expect(match?.session?.sessionId).toBe("s1");
    expect(match?.status).toBe("on-plan");
    expect(match?.distanceDeltaKm).toBeNull();
    expect(match?.durationDeltaMin).toBe(0);
  });
});

const loaded = (
  activityId: string,
  day: string,
  distanceKm: number,
  load: number,
  label: string | null,
  anaerobic = 0,
): Activity => ({
  ...activity(activityId, day, distanceKm, 30),
  trainingLoad: load,
  trainingEffectLabel: label,
  anaerobicTrainingEffect: anaerobic,
});

describe("weekly load summary", () => {
  it("summarises a steady week with hard/easy kilometres", () => {
    const summary = loadSummaryForWeek(
      [
        loaded("a1", "2026-10-20", 5, 200, "AEROBIC_BASE"),
        loaded("a2", "2026-10-27", 5, 200, "AEROBIC_BASE"),
        loaded("a3", "2026-11-03", 5, 200, "AEROBIC_BASE"),
        loaded("a4", "2026-11-10", 5, 100, "AEROBIC_BASE"),
        loaded("a5", "2026-11-12", 6, 100, "TEMPO"),
      ],
      "2026-11-09",
    );

    expect(summary.weekLoad).toBe(200);
    expect(summary.previousWeekLoad).toBe(200);
    expect(summary.fourWeekLoad).toBe(800);
    expect(summary.acwr).toBe(1);
    expect(summary.weekChangePct).toBe(0);
    expect(summary.hardDistanceKm).toBe(6);
    expect(summary.easyDistanceKm).toBe(5);
    expect(summary.hardRuns).toBe(1);
    expect(summary.easyRuns).toBe(1);
    expect(summary.hasLoad).toBe(true);
    expect(summary.hasIntensity).toBe(true);
    expect(summary.signal).toBe("steady");
    expect(summary.label).toBe("Steady");
  });

  it("flags a high ramp from a steep week-over-week jump", () => {
    const summary = loadSummaryForWeek(
      [
        loaded("a1", "2026-11-03", 5, 200, "AEROBIC_BASE"),
        loaded("a2", "2026-11-10", 8, 200, "TEMPO"),
        loaded("a3", "2026-11-12", 8, 200, "TEMPO"),
      ],
      "2026-11-09",
    );

    expect(summary.weekChangePct).toBe(100);
    expect(summary.acwr).toBe(2.67);
    expect(summary.signal).toBe("high");
    expect(summary.label).toBe("High ramp");
  });

  it("refuses to invent a ratio without a previous-week baseline", () => {
    const summary = loadSummaryForWeek([loaded("a1", "2026-11-10", 5, 100, "AEROBIC_BASE")], "2026-11-09");

    expect(summary.weekLoad).toBe(100);
    expect(summary.previousWeekLoad).toBe(0);
    expect(summary.acwr).toBeNull();
    expect(summary.weekChangePct).toBeNull();
    expect(summary.signal).toBe("insufficient");
  });

  it("reports no load data when Garmin did not provide a load", () => {
    const summary = loadSummaryForWeek(
      [activity("a1", "2026-11-10", 5, 30), activity("a2", "2026-11-12", 6, 35)],
      "2026-11-09",
    );

    expect(summary.hasLoad).toBe(false);
    expect(summary.hasIntensity).toBe(false);
    expect(summary.weekLoad).toBe(0);
    expect(summary.acwr).toBeNull();
    expect(summary.signal).toBe("no-data");
    expect(summary.label).toBe("No load data");
    expect(summary.hardDistanceKm).toBe(0);
    expect(summary.easyDistanceKm).toBe(0);
  });

  it("classifies a high anaerobic effect as hard without a text label", () => {
    const summary = loadSummaryForWeek(
      [loaded("a1", "2026-11-10", 4, 100, null, 3)],
      "2026-11-09",
    );

    expect(summary.hasIntensity).toBe(true);
    expect(summary.hardDistanceKm).toBe(4);
    expect(summary.easyDistanceKm).toBe(0);
  });
});

describe("personal bests", () => {
  const fastest = (
    activityId: string,
    day: string,
    fastest1kSec: number | null,
    fastest1miSec: number | null,
    fastest5kSec: number | null,
  ): Activity => ({
    ...activity(activityId, day, 5),
    fastest1kSec,
    fastest1miSec,
    fastest5kSec,
  });

  it("finds the fastest 1 km, 1 mi and 5 km, with ties going to the later day", () => {
    const bests = personalBests([
      fastest("a", "2026-11-01", 300, 500, 1600),
      fastest("b", "2026-11-02", 290, 510, 1500),
      fastest("c", "2026-11-03", 290, 490, 1550),
    ]);

    expect(bests.map((best) => [best.distance, best.seconds, best.activity.activityId])).toEqual([
      ["1k", 290, "c"],
      ["1mi", 490, "c"],
      ["5k", 1500, "b"],
    ]);
  });

  it("filters best efforts to one period", () => {
    const activities = [
      fastest("a", "2026-10-01", 280, 480, 1450),
      fastest("b", "2026-11-02", 290, 510, 1500),
      fastest("c", "2026-11-03", 295, 490, 1550),
    ];

    const bests = personalBestsForPeriod(activities, "2026-11-01", "2026-11-30");
    expect(bests.map((best) => [best.distance, best.activity.activityId])).toEqual([
      ["1k", "b"],
      ["1mi", "c"],
      ["5k", "b"],
    ]);
  });

  it("ignores activities without fastest-split fields", () => {
    expect(personalBests([activity("a", "2026-11-01", 5)])).toEqual([]);
    expect(personalBests([fastest("a", "2026-11-01", 300, null, null)])).toHaveLength(1);
  });
});
