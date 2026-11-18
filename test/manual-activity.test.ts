import { describe, expect, it } from "vitest";

import { buildManualActivity, type ManualActivityInput } from "../src/manual-activity";

const TODAY = "2026-11-18";
const NOW = "2026-11-18T08:00:00.000Z";
const context = { userId: "u1", today: TODAY, now: NOW };

const build = (input: Partial<ManualActivityInput> = {}) =>
  buildManualActivity({ day: "2026-11-17", distanceKm: "5", durationMin: "30", ...input }, context);

describe("manual activity", () => {
  it("builds a reported activity with a pace and the chat source", () => {
    const result = build({ title: "  Treadmill   run  " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activity).toMatchObject({
      userId: "u1",
      day: "2026-11-17",
      title: "Treadmill run",
      distanceKm: 5,
      durationMin: 30,
      paceSecPerKm: 360,
      avgHr: null,
      source: "chat",
      createdAt: NOW,
    });
    expect(result.activity.activityId.startsWith("activity:manual:")).toBe(true);
  });

  it("defaults the title and accepts a duration-only run", () => {
    const result = build({ title: "   ", distanceKm: "", durationMin: "45" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activity.title).toBe("Run");
    expect(result.activity.distanceKm).toBeNull();
    expect(result.activity.paceSecPerKm).toBeNull();
  });

  it("accepts a distance-only run", () => {
    const result = build({ distanceKm: "7.5", durationMin: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activity.durationMin).toBeNull();
    expect(result.activity.paceSecPerKm).toBeNull();
  });

  it("accepts an RPE of 0, 7, 7.5 and 10", () => {
    const results = ["0", "7", "7.5", "10"].map((rpe) => build({ rpe }));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.map((result) => (result.ok ? result.activity.rpe : null))).toEqual([0, 7, 7.5, 10]);
  });

  it("rejects an out-of-range, quarter-step or non-numeric RPE", () => {
    expect(build({ rpe: "11" })).toMatchObject({ ok: false, error: "RPE must be between 0 and 10 in half steps." });
    expect(build({ rpe: "-1" })).toMatchObject({ ok: false, error: "RPE must be between 0 and 10 in half steps." });
    expect(build({ rpe: "7.25" })).toMatchObject({ ok: false, error: "RPE must be between 0 and 10 in half steps." });
    expect(build({ rpe: "banana" })).toMatchObject({ ok: false, error: "RPE must be between 0 and 10 in half steps." });
  });

  it("leaves the RPE null when the runner skipped it", () => {
    for (const input of [{ rpe: "" }, { rpe: null }, {}]) {
      const result = build(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.activity.rpe).toBeNull();
    }
  });

  it("accepts an RPE on a distance-only run", () => {
    const result = build({ distanceKm: "7.5", durationMin: "", rpe: "8" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activity.durationMin).toBeNull();
    expect(result.activity.rpe).toBe(8);
  });

  it("rejects a future run, a bad day and an impossible amount", () => {
    expect(build({ day: "2026-11-19" })).toMatchObject({ ok: false, error: "A run cannot be logged in the future." });
    expect(build({ day: "17/11/2026" })).toMatchObject({ ok: false, error: "Pick a valid day (YYYY-MM-DD)." });
    expect(build({ distanceKm: "101" })).toMatchObject({ ok: false });
    expect(build({ durationMin: "0" })).toMatchObject({ ok: false });
    expect(build({ distanceKm: "", durationMin: "" })).toMatchObject({ ok: false, error: "Enter a distance, a duration, or both." });
  });

  it("is idempotent for the same client request id", () => {
    const first = build({ requestId: "request-12345678" });
    const second = build({ requestId: "request-12345678", title: "Different title" });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.activity.activityId).toBe(first.activity.activityId);
    expect(second.activity.title).toBe("Different title");
  });

  it("isolates two runners with the same request id", () => {
    const first = build({ requestId: "shared-request-id" });
    const other = buildManualActivity(
      { day: "2026-11-17", distanceKm: "5", durationMin: "30", requestId: "shared-request-id" },
      { ...context, userId: "u2" },
    );
    expect(first.ok && other.ok).toBe(true);
    if (!first.ok || !other.ok) return;
    expect(other.activity.activityId).not.toBe(first.activity.activityId);
  });
});
