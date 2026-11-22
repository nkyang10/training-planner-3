import { describe, expect, it } from "vitest";

import type { MuscleCheckIn, MuscleConditionKey, MuscleSide, MuscleWarmUp } from "../src/muscles";
import {
  MUSCLE_STATUS_WINDOW_DAYS,
  addStatusDays,
  computeMuscleStatuses,
  daysStatusBetween,
  decayedSoreness,
  renderMuscleStatusFactsForPrompt,
  statusLine,
  worstStatusLevel,
  type MuscleStatusControl,
} from "../src/muscle-status";

const TODAY = "2026-11-19";

interface TagSeed {
  muscleId: string;
  soreness: number;
  conditions?: readonly MuscleConditionKey[];
  side?: MuscleSide;
  warmUp?: MuscleWarmUp;
}

const makeCheckIn = (input: {
  createdAt: string;
  day: string;
  muscles: readonly TagSeed[];
  activityId?: string | null;
  note?: string | null;
}): MuscleCheckIn => ({
  checkInId: `checkin:${input.createdAt}:${input.day}:${input.muscles.map((tag) => tag.muscleId).join("+")}`,
  userId: "runner-1",
  day: input.day,
  activityId: input.activityId ?? null,
  muscles: input.muscles.map((tag) => ({
    muscleId: tag.muscleId,
    soreness: tag.soreness,
    conditions: [...(tag.conditions ?? [])],
    side: tag.side ?? "both",
    warmUp: tag.warmUp ?? null,
  })),
  note: input.note ?? null,
  createdAt: input.createdAt,
});

const control = (input: { muscleId: string; hold?: boolean; resolvedDay?: string | null }): MuscleStatusControl => ({
  userId: "runner-1",
  muscleId: input.muscleId,
  hold: input.hold ?? false,
  resolvedDay: input.resolvedDay ?? null,
  updatedAt: "2026-11-19T08:00:00.000Z",
});

const statusesFor = (
  checkIns: readonly MuscleCheckIn[],
  controls: readonly MuscleStatusControl[] = [],
  today: string = TODAY,
): ReturnType<typeof computeMuscleStatuses> =>
  computeMuscleStatuses({ checkIns, controls, today });

describe("the day helpers", () => {
  it("adds and subtracts whole days", () => {
    expect(addStatusDays("2026-11-19", 10)).toBe("2026-11-29");
    expect(addStatusDays("2026-11-30", 3)).toBe("2026-12-03");
  });

  it("counts whole days between ISO days", () => {
    expect(daysStatusBetween("2026-11-10", "2026-11-19")).toBe(9);
    expect(daysStatusBetween("2026-11-19", "2026-11-19")).toBe(0);
    expect(daysStatusBetween("2026-11-19", "2026-11-10")).toBe(-9);
  });
});

describe("the soreness decay curve", () => {
  it("holds the reported level through the first day, then falls linearly", () => {
    expect(decayedSoreness(7, 0)).toBe(7);
    expect(decayedSoreness(7, 1)).toBe(7);
    expect(decayedSoreness(7, 2)).toBe(6);
    expect(decayedSoreness(7, 3)).toBe(5);
    expect(decayedSoreness(7, 5)).toBe(4);
    expect(decayedSoreness(7, 9)).toBe(1);
  });

  it("dismisses itself at the end of the standard window", () => {
    expect(decayedSoreness(7, MUSCLE_STATUS_WINDOW_DAYS)).toBe(0);
    expect(decayedSoreness(7, MUSCLE_STATUS_WINDOW_DAYS + 5)).toBe(0);
  });

  it("never invents soreness and clamps the reported level to the scale", () => {
    expect(decayedSoreness(0, 3)).toBe(0);
    expect(decayedSoreness(2, 5)).toBe(1);
    expect(decayedSoreness(-4, 0)).toBe(0);
    expect(decayedSoreness(15, 0)).toBe(10);
  });

  it("respects a custom window", () => {
    expect(decayedSoreness(7, 2, 5)).toBe(5);
    expect(decayedSoreness(7, 5, 5)).toBe(0);
  });
});

describe("computing the current statuses", () => {
  it("is empty when the runner has never reported — perfect by default", () => {
    expect(statusesFor([])).toEqual([]);
  });

  it("starts a dated period from a fresh report", () => {
    const checkIns = [makeCheckIn({ createdAt: "2026-11-19T08:00:00.000Z", day: TODAY, muscles: [{ muscleId: "quads", soreness: 7 }] })];
    const statuses = statusesFor(checkIns);
    expect(statuses).toHaveLength(1);
    const status = statuses[0];
    expect(status).toMatchObject({
      muscleId: "quads",
      startDay: TODAY,
      reported: 7,
      current: 7,
      hold: false,
      level: "heavy",
      expectedClearDay: addStatusDays(TODAY, MUSCLE_STATUS_WINDOW_DAYS),
    });
  });

  it("fades the level with time and recomputes the reading at today's level", () => {
    const checkIns = [
      makeCheckIn({ createdAt: "2026-11-16T08:00:00.000Z", day: "2026-11-16", muscles: [{ muscleId: "calves", soreness: 7 }] }),
    ];
    const statuses = statusesFor(checkIns);
    expect(statuses[0]?.current).toBe(5);
    expect(statuses[0]?.reported).toBe(7);
    expect(statuses[0]?.level).toBe("sore");
    expect(statuses[0]?.expectedClearDay).toBe("2026-11-26");
  });

  it("auto-dismisses once the window has fully passed", () => {
    const checkIns = [
      makeCheckIn({ createdAt: "2026-11-01T08:00:00.000Z", day: "2026-11-01", muscles: [{ muscleId: "calves", soreness: 6 }] }),
    ];
    expect(statusesFor(checkIns)).toHaveLength(0);
  });

  it("keeps the reported level constant while the runner holds it", () => {
    const checkIns = [
      makeCheckIn({ createdAt: "2026-11-01T08:00:00.000Z", day: "2026-11-01", muscles: [{ muscleId: "calves", soreness: 6 }] }),
    ];
    const held = statusesFor(checkIns, [control({ muscleId: "calves", hold: true })]);
    expect(held[0]?.current).toBe(6);
    expect(held[0]?.hold).toBe(true);
    expect(held[0]?.level).toBe("sore");
  });

  it("returns to perfect condition when the runner claims all better", () => {
    const checkIns = [makeCheckIn({ createdAt: "2026-11-19T08:00:00.000Z", day: TODAY, muscles: [{ muscleId: "quads", soreness: 7 }] })];
    expect(statusesFor(checkIns, [control({ muscleId: "quads", resolvedDay: TODAY })])).toEqual([]);
  });

  it("lets a newer report restart the period with the new level", () => {
    const checkIns = [
      makeCheckIn({ createdAt: "2026-11-10T08:00:00.000Z", day: "2026-11-10", muscles: [{ muscleId: "quads", soreness: 8 }] }),
      makeCheckIn({ createdAt: "2026-11-18T08:00:00.000Z", day: "2026-11-17", muscles: [{ muscleId: "quads", soreness: 3 }] }),
    ];
    const statuses = statusesFor(checkIns);
    expect(statuses[0]).toMatchObject({ reported: 3, current: 3, startDay: "2026-11-17" });
  });

  it("treats a perfect report as the muscle returning to perfect condition", () => {
    const checkIns = [makeCheckIn({ createdAt: "2026-11-19T08:00:00.000Z", day: TODAY, muscles: [{ muscleId: "quads", soreness: 0 }] })];
    expect(statusesFor(checkIns)).toEqual([]);
  });

  it("keeps a lingering condition in the status even after the level rounds away", () => {
    const checkIns = [
      makeCheckIn({
        createdAt: "2026-11-10T08:00:00.000Z",
        day: "2026-11-10",
        muscles: [{ muscleId: "calves", soreness: 3, conditions: ["tight"] }],
      }),
    ];
    const statuses = statusesFor(checkIns);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.current).toBe(0);
    expect(statuses[0]?.level).toBe("watch");
  });

  it("keeps warning conditions warning at the faded level", () => {
    const checkIns = [
      makeCheckIn({
        createdAt: "2026-11-14T08:00:00.000Z",
        day: "2026-11-14",
        muscles: [{ muscleId: "hamstrings", soreness: 6, conditions: ["sharp_pain"] }],
      }),
    ];
    const statuses = statusesFor(checkIns);
    expect(statuses[0]?.current).toBe(3);
    expect(statuses[0]?.level).toBe("warning");
  });

  it("carries the linked run and the side through the status", () => {
    const checkIns = [
      makeCheckIn({
        createdAt: "2026-11-19T08:00:00.000Z",
        day: TODAY,
        activityId: "garmin:1",
        muscles: [{ muscleId: "calves", soreness: 5, side: "left" }],
      }),
    ];
    const status = statusesFor(checkIns)[0];
    expect(status?.activityId).toBe("garmin:1");
    expect(status?.side).toBe("left");
  });

  it("reports the worst level across statuses and one count number", () => {
    const checkIns = [
      makeCheckIn({
        createdAt: "2026-11-19T08:00:00.000Z",
        day: TODAY,
        muscles: [
          { muscleId: "calves", soreness: 5 },
          { muscleId: "quads", soreness: 9, conditions: ["swelling"] },
        ],
      }),
    ];
    const statuses = statusesFor(checkIns);
    expect(statuses).toHaveLength(2);
    expect(worstStatusLevel(statuses)).toBe("urgent");
  });
});

describe("the shared status line", () => {
  it("describes the faded story in the runner's words", () => {
    const checkIns = [
      makeCheckIn({
        createdAt: "2026-11-14T08:00:00.000Z",
        day: "2026-11-14",
        muscles: [{ muscleId: "calves", soreness: 7, conditions: ["tight"] }],
      }),
    ];
    const status = statusesFor(checkIns)[0];
    expect(statusLine(status!)).toContain("4/10");
    expect(statusLine(status!)).toContain("tight");
    expect(statusLine(status!)).toContain("was 7/10 on 2026-11-14, fading");
  });

  it("says held plainly when decay is suspended", () => {
    const checkIns = [
      makeCheckIn({ createdAt: "2026-11-14T08:00:00.000Z", day: "2026-11-14", muscles: [{ muscleId: "calves", soreness: 7 }] }),
    ];
    const status = statusesFor(checkIns, [control({ muscleId: "calves", hold: true })])[0];
    expect(statusLine(status!)).toContain("held constant since 2026-11-14");
  });
});

describe("the coach prompt facts", () => {
  it("stays empty while every muscle is in perfect condition", () => {
    expect(
      renderMuscleStatusFactsForPrompt({ statuses: [], checkIns: [], today: TODAY }),
    ).toBe("");
  });

  it("renders today's computed levels with the time story the coach needs", () => {
    const checkIns: MuscleCheckIn[] = [
      makeCheckIn({
        createdAt: "2026-11-14T08:00:00.000Z",
        day: "2026-11-14",
        muscles: [
          { muscleId: "calves", soreness: 7, conditions: ["tight"], side: "left" },
          { muscleId: "quads", soreness: 8 },
        ],
        note: "hills on Tuesday",
      }),
    ];
    const text = renderMuscleStatusFactsForPrompt({
      statuses: statusesFor(checkIns),
      checkIns,
      today: TODAY,
    });
    expect(text).toContain(`Muscle status today (${TODAY})`);
    expect(text).toContain("2 muscles need attention");
    expect(text).toContain("- Calves: 4/10 noticeable (reported 7/10 on 2026-11-14, faded with time; expected fully clear by 2026-11-24) tight, left");
    expect(text).toContain("- Quads: 4/10 noticeable (reported 8/10 on 2026-11-14, faded with time; expected fully clear by 2026-11-24)");
    expect(text).toContain("Every other muscle is in perfect condition.");
    expect(text).toContain('Latest check-in note: "hills on Tuesday"');
    expect(text).toContain("1 check-in in the last 14 days");
  });

  it("marks a held level as the runner saying it is not fading on its own", () => {
    const checkIns = [makeCheckIn({ createdAt: "2026-11-10T08:00:00.000Z", day: "2026-11-10", muscles: [{ muscleId: "calves", soreness: 6 }] })];
    const text = renderMuscleStatusFactsForPrompt({
      statuses: statusesFor(checkIns, [control({ muscleId: "calves", hold: true })]),
      checkIns,
      today: TODAY,
    });
    expect(text).toContain("- Calves: 6/10 clear doms (held constant by the runner since 2026-11-10");
    expect(text).toContain("not fading on its own");
  });

  it("counts only check-ins inside the recent window", () => {
    const checkIns: MuscleCheckIn[] = [
      makeCheckIn({ createdAt: "2026-11-18T08:00:00.000Z", day: "2026-11-18", muscles: [{ muscleId: "calves", soreness: 5 }] }),
      makeCheckIn({ createdAt: "2026-10-01T08:00:00.000Z", day: "2026-10-01", muscles: [{ muscleId: "quads", soreness: 5 }] }),
    ];
    const text = renderMuscleStatusFactsForPrompt({ statuses: statusesFor(checkIns), checkIns, today: TODAY });
    expect(text).toContain("1 check-in in the last 14 days");
  });
});
