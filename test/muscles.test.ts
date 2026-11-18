import { describe, expect, it } from "vitest";

import {
  MUSCLE_CATALOG,
  MUSCLE_CONDITIONS,
  buildSharedTags,
  careEntriesForCheckIn,
  drillCardsForCheckIn,
  getMuscle,
  isMuscleConditionKey,
  isMuscleId,
  musclesForRun,
  musclesForView,
  parseMuscleTagsJson,
  readinessForCheckIn,
  readMuscleTag,
  referencedMuscleContext,
  renderMuscleFactsForPrompt,
  sorenessFill,
  sorenessLabel,
  summarizeCheckIn,
  validateCheckInDay,
  type MuscleCheckIn,
  type MuscleConditionKey,
  type MuscleTag,
} from "../src/muscles";
import { renderMuscleFigure } from "../src/muscle-map";
import type { SessionKind } from "../src/types";

const tag = (overrides: Partial<MuscleTag> = {}): MuscleTag => ({
  muscleId: "calves",
  soreness: 5,
  conditions: [],
  side: "both",
  warmUp: null,
  ...overrides,
});

const checkIn = (muscles: readonly MuscleTag[], day = "2026-11-12"): MuscleCheckIn => ({
  checkInId: "checkin:1",
  userId: "user-1",
  day,
  activityId: null,
  muscles: [...muscles],
  note: null,
  createdAt: "2026-11-12T08:00:00.000Z",
});

describe("muscle catalog", () => {
  it("holds 20 unique regions with knowledge and drills", () => {
    const ids = MUSCLE_CATALOG.map((muscle) => muscle.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(20);
    for (const muscle of MUSCLE_CATALOG) {
      expect(muscle.function.length).toBeGreaterThan(10);
      expect(muscle.issues.length).toBeGreaterThan(10);
      expect(muscle.meaning.length).toBeGreaterThan(10);
      expect(muscle.recovery.length).toBeGreaterThan(10);
      expect(muscle.drills.length).toBeGreaterThanOrEqual(2);
      for (const drill of muscle.drills) {
        expect(["mobility", "activation", "recovery"]).toContain(drill.category);
        expect(drill.how.length).toBeGreaterThan(3);
      }
    }
  });

  it("recognises its own ids and condition keys, and rejects others", () => {
    expect(isMuscleId("calves")).toBe(true);
    expect(isMuscleId("hamstrings")).toBe(true);
    expect(isMuscleId("nose")).toBe(false);
    expect(isMuscleConditionKey("tight")).toBe(true);
    expect(isMuscleConditionKey("spicy")).toBe(false);
  });

  it("draws every front and back muscle on its declared view", () => {
    for (const view of ["front", "back"] as const) {
      const html = renderMuscleFigure(view, { viewLabel: `${view} view` });
      for (const muscle of musclesForView(view)) {
        expect(html).toContain(`data-muscle="${muscle.id}"`);
      }
      for (const muscle of MUSCLE_CATALOG.filter((entry) => entry.view !== view && entry.view !== "both")) {
        expect(html).not.toContain(`data-muscle="${muscle.id}"`);
      }
    }
  });

  it("keeps every region inside the figure bounds and mirrors bilateral halves", () => {
    for (const view of ["front", "back"] as const) {
      const html = renderMuscleFigure(view, { viewLabel: `${view} view` });
      expect(html).toContain('viewBox="0 0 230 470"');
      const paths = [...html.matchAll(/<path d="([^"]+)"( transform="translate\(230 0\) scale\(-1 1\)")?>/g)];
      let mirrored = 0;
      for (const match of paths) {
        const d = match[1] ?? "";
        expect(d).not.toContain("NaN");
        const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
        for (const raw of numbers) {
          const value = Number(raw);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(470);
        }
        if ((match[2] ?? "").length > 0) mirrored += 1;
      }
      expect(mirrored).toBeGreaterThanOrEqual(9);
    }
  });

  it("marks selected regions and carries state in the aria labels", () => {
    const html = renderMuscleFigure("back", {
      selected: ["calves"],
      fills: { calves: { fill: sorenessFill(7), dashed: true } },
      ariaLabels: { calves: "Calves, 7/10 sore to touch, needs care" },
      viewLabel: "Back view",
    });
    expect(html).toContain('class="muscle-region selected" data-muscle="calves"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Calves, 7/10 sore to touch, needs care"');
    expect(html).toContain('stroke-dasharray="5 4"');
    expect(html).toContain(sorenessFill(7));
  });

  it("ramps the soreness fill from neutral to deep red", () => {
    expect(sorenessFill(0)).toBe("#f6eee6");
    expect(sorenessFill(5)).not.toBe(sorenessFill(8));
    expect(sorenessFill(8)).not.toBe(sorenessFill(10));
    expect(sorenessLabel(0)).toBe("Nothing");
    expect(sorenessLabel(5)).toBe("Noticeable");
    expect(sorenessLabel(9)).toBe("Severe");
  });
});

describe("check-in validation", () => {
  it("accepts the per-muscle script payload and validates every field", () => {
    const result = parseMuscleTagsJson(
      JSON.stringify([
        { muscleId: "calves", soreness: 6, conditions: ["tight"], side: "left", warmUp: "eases" },
        { muscleId: "quads", soreness: 3, conditions: [], side: "both", warmUp: null },
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tags).toHaveLength(2);
      expect(result.tags[0]).toMatchObject({ muscleId: "calves", soreness: 6, side: "left", warmUp: "eases" });
    }
  });

  it("rejects unknown muscles, bad severity, unknown conditions and duplicates", () => {
    expect(parseMuscleTagsJson(JSON.stringify([{ muscleId: "nose", soreness: 3 }])).ok).toBe(false);
    expect(parseMuscleTagsJson(JSON.stringify([{ muscleId: "calves", soreness: 12 }])).ok).toBe(false);
    expect(parseMuscleTagsJson(JSON.stringify([{ muscleId: "calves", soreness: 2, conditions: ["spicy"] }])).ok).toBe(false);
    expect(parseMuscleTagsJson(JSON.stringify([{ muscleId: "calves", soreness: 2 }, { muscleId: "calves", soreness: 3 }])).ok).toBe(false);
    expect(parseMuscleTagsJson("not json").ok).toBe(false);
    expect(parseMuscleTagsJson("[]").ok).toBe(false);
    expect(parseMuscleTagsJson(null).ok).toBe(false);
  });

  it("builds shared tags for the no-script path, deduped and defaulted", () => {
    const result = buildSharedTags(["calves", "calves", "quads"], 4, ["tight"], "both", null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tags).toHaveLength(2);
      expect(result.tags[0]).toMatchObject({ soreness: 4, conditions: ["tight"], side: "both" });
    }
    expect(buildSharedTags([], 4, [], "both", null).ok).toBe(false);
    expect(buildSharedTags(["nose"], 4, [], "both", null).ok).toBe(false);
    expect(buildSharedTags(["calves"], 11, [], "both", null).ok).toBe(false);
  });

  it("bounds the day: never future, at most 14 days back", () => {
    expect(validateCheckInDay("2026-11-05", "2026-11-05")).toBeNull();
    expect(validateCheckInDay("2026-11-12", "2026-11-05")).toBe("The day cannot be in the future.");
    expect(validateCheckInDay("2026-10-01", "2026-11-05")).toBe("Check-ins go back at most 14 days.");
    expect(validateCheckInDay("05-11-2026", "2026-11-05")).toBe("Pick a valid day.");
  });
});

describe("interpretation rules", () => {
  it("reads plain severity without tags as ok, sore and heavy", () => {
    expect(readMuscleTag(tag({ soreness: 0 })).level).toBe("ok");
    expect(readMuscleTag(tag({ soreness: 3 })).level).toBe("ok");
    expect(readMuscleTag(tag({ soreness: 5 })).level).toBe("sore");
    expect(readMuscleTag(tag({ soreness: 7 })).level).toBe("heavy");
    expect(readMuscleTag(tag({ soreness: 8 })).level).toBe("heavy");
  });

  it("reads the watch tags as worth a look, not a stop", () => {
    for (const key of ["tight", "cramp", "fatigued", "dull_ache", "old_injury"] as const) {
      expect(readMuscleTag(tag({ soreness: 3, conditions: [key] })).level).toBe("watch");
    }
  });

  it("reads the injury signature as warning, with the pain state offer", () => {
    for (const key of ["sharp_pain", "swelling", "numbness"] as const) {
      const reading = readMuscleTag(tag({ soreness: 3, conditions: [key] }));
      expect(reading.level).toBe("warning");
      expect(reading.flagState).toBe("pain_injury");
      expect(reading.withholdDrills).toBe(true);
    }
    const flare = readMuscleTag(tag({ soreness: 7, conditions: ["old_injury"] }));
    expect(flare.level).toBe("warning");
    const extreme = readMuscleTag(tag({ soreness: 9 }));
    expect(extreme.level).toBe("warning");
  });

  it("reads the rhabdomyolysis pattern and spine nerve signs as urgent", () => {
    const swelling = readMuscleTag(tag({ soreness: 8, conditions: ["swelling"] }));
    expect(swelling.level).toBe("urgent");
    expect(swelling.flagState).toBe("medical_red_flag");
    const weak = readMuscleTag(tag({ soreness: 9, conditions: ["fatigued"] }));
    expect(weak.level).toBe("urgent");
    const spine = readMuscleTag(tag({ muscleId: "lower-back", soreness: 4, conditions: ["numbness"] }));
    expect(spine.level).toBe("urgent");
    expect(readMuscleTag(tag({ soreness: 8, conditions: ["swelling"] })).guidance).toContain("medical care");
  });

  it("escalates on the warm-up modifier and reassures when movement helps", () => {
    expect(readMuscleTag(tag({ soreness: 5, warmUp: "worse" })).level).toBe("heavy");
    expect(readMuscleTag(tag({ soreness: 4, conditions: ["dull_ache"], warmUp: "worse" })).level).toBe("warning");
    expect(readMuscleTag(tag({ soreness: 7, warmUp: "eases" })).guidance).toContain("eases once you are moving");
    expect(readMuscleTag(tag({ soreness: 5, side: "left" })).guidance).toContain("one-sided");
  });

  it("names the day after the worst muscle", () => {
    expect(readinessForCheckIn([tag({ muscleId: "quads", soreness: 2 })])).toBe("steady");
    expect(readinessForCheckIn([tag({ soreness: 5 })])).toBe("watch");
    expect(readinessForCheckIn([tag({ soreness: 8 })])).toBe("care");
    expect(
      readinessForCheckIn([tag({ muscleId: "quads", soreness: 2 }), tag({ soreness: 3, conditions: ["sharp_pain"] })]),
    ).toBe("care");
    expect(readinessForCheckIn([tag({ soreness: 8, conditions: ["swelling"] })])).toBe("urgent");
  });

  it("summarises a check-in in one line", () => {
    const line = summarizeCheckIn(
      checkIn([tag({ muscleId: "calves", soreness: 6, conditions: ["tight"] }), tag({ muscleId: "quads", soreness: 4 })]),
    );
    expect(line).toContain("2 muscles");
    expect(line).toContain("Calves 6/10");
    expect(line).toContain("tight");
  });
});

describe("drill suggestions", () => {
  it("orders heavy before watch before sore and caps the list", () => {
    const muscles = [
      tag({ muscleId: "quads", soreness: 3 }),
      tag({ muscleId: "calves", soreness: 8 }),
      tag({ muscleId: "glutes", soreness: 2, conditions: ["tight"] }),
      tag({ muscleId: "hamstrings", soreness: 5 }),
    ];
    const cards = drillCardsForCheckIn(muscles);
    expect(cards.map((card) => card.level)).toEqual(["heavy", "watch", "sore"]);
  });

  it("keeps drill categories per level: heavy is recovery-only, tight prioritises activation", () => {
    const heavy = drillCardsForCheckIn([tag({ soreness: 8 })]);
    expect(heavy[0]?.drills.every((drill) => drill.category === "recovery")).toBe(true);
    const tight = drillCardsForCheckIn([tag({ soreness: 3, conditions: ["tight"] })]);
    expect(tight[0]?.drills[0]?.category).toBe("activation");
    const sore = drillCardsForCheckIn([tag({ soreness: 5 })]);
    expect(sore[0]?.drills.every((drill) => drill.category === "mobility" || drill.category === "recovery")).toBe(true);
  });

  it("withholds drills from warning and urgent tags and lists them for care instead", () => {
    const muscles = [
      tag({ muscleId: "calves", soreness: 6, conditions: ["sharp_pain"] }),
      tag({ muscleId: "quads", soreness: 5 }),
    ];
    expect(drillCardsForCheckIn(muscles).map((card) => card.muscleId)).toEqual(["quads"]);
    const care = careEntriesForCheckIn(muscles);
    expect(care).toHaveLength(1);
    expect(care[0]?.reading.flagState).toBe("pain_injury");
  });
});

describe("muscles worked", () => {
  const base = musclesForRun({ title: "Morning run" });
  const kind = (value: SessionKind): { title: string; kind: SessionKind } => ({ title: "Morning run", kind: value });

  it("gives a base run the running movers", () => {
    expect(base.primary).toEqual(["glutes", "quads", "hamstrings", "calves"]);
    expect(base.secondary).toContain("hip-flexors");
    expect(base.secondary).toContain("tibialis");
  });

  it("upweights the sprint machinery for faster kinds", () => {
    for (const sessionKind of ["interval", "tempo", "race"] as const) {
      const work = musclesForRun(kind(sessionKind));
      expect(work.primary).toContain("hip-flexors");
      expect(work.primary).toContain("hamstrings");
      expect(work.secondary).toContain("obliques");
    }
  });

  it("loads the climbs and trails", () => {
    const hills = musclesForRun({ title: "Hill repeats", elevationGainM: 60 });
    expect(hills.primary).toContain("calves");
    const bigClimb = musclesForRun({ title: "Long run", elevationGainM: 320 });
    expect(bigClimb.primary).toContain("glutes");
    const trail = musclesForRun({ title: "Trail run" });
    expect(trail.secondary).toContain("adductors");
    expect(trail.secondary).toContain("tibialis");
  });

  it("recognises cross-training by its words", () => {
    const cycle = musclesForRun({ title: "Easy spin on the bike", kind: "cross" });
    expect(cycle.primary).toContain("quads");
    const swim = musclesForRun({ title: "Pool swim", kind: "cross" });
    expect(swim.primary).toContain("lats");
    const gym = musclesForRun({ title: "Gym strength session", kind: "cross" });
    expect(gym.primary).toContain("chest");
    const plain = musclesForRun({ title: "Cross training", kind: "cross" });
    expect(plain.primary).toContain("abs");
  });
});

describe("coach prompt facts", () => {
  it("renders the latest check-in and the history count, and nothing without one", () => {
    expect(renderMuscleFactsForPrompt(null, 0)).toBe("");
    const facts = renderMuscleFactsForPrompt(
      checkIn([tag({ muscleId: "calves", soreness: 6, conditions: ["tight"], side: "left", warmUp: "eases" })], "2026-11-12"),
      3,
    );
    expect(facts).toContain("Muscle check-in (latest 2026-11-12");
    expect(facts).toContain("Calves 6/10 tight, left");
    expect(facts).toContain("eases with warm-up");
    expect(facts).toContain("3 check-ins in the last 14 days");
  });

  it("carries the note and the per-muscle knowledge context", () => {
    const checkIns = [checkIn([tag({ muscleId: "hamstrings", soreness: 7 })])];
    const first = checkIns[0];
    if (first === undefined) throw new Error("missing seeded check-in");
    first.note = "grabbed during strides";
    const facts = renderMuscleFactsForPrompt(first, 1);
    expect(facts).toContain("grabbed during strides");
    const context = referencedMuscleContext("hamstrings", checkIns);
    expect(context).toContain("Referenced muscle: Hamstrings (back thighs) — group legs");
    expect(context).toContain("Function:");
    expect(context).toContain("Drill library:");
    expect(context).toContain("The runner's tags for it");
    expect(context).toContain("Hamstrings 7/10");
  });
});

describe("condition catalog", () => {
  it("exposes the eight condition keys used by the form", () => {
    const keys: readonly MuscleConditionKey[] = ["tight", "cramp", "fatigued", "dull_ache", "sharp_pain", "swelling", "numbness", "old_injury"];
    expect(MUSCLE_CONDITIONS.map((condition) => condition.key)).toEqual(keys);
    for (const condition of MUSCLE_CONDITIONS) {
      expect(condition.label.length).toBeGreaterThan(2);
      expect(condition.hint.length).toBeGreaterThan(10);
    }
    expect(getMuscle("calves")?.name).toBe("Calves");
  });
});
