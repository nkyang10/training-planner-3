import { afterEach, describe, expect, it } from "vitest";

import {
  COACH_STATE_DEFINITIONS,
  COACH_STATE_KEYS,
  applyStateProposals,
  confirmCoachState,
  detectCoachStates,
  formatCoachStateDate,
  getCoachStateDefinition,
  isCoachStateKey,
  refreshCoachStates,
  renderActiveCoachStates,
  renderCoachStateCatalog,
  resolveCoachState,
  setManualCoachState,
  stateGuardrailViolations,
  syncCoachStates,
  type CoachStateDetectionInput,
  type DetectedState,
  type StateProposal,
} from "../src/coach-states";
import { createStore, type StoreHandle } from "../src/store";
import type {
  Activity,
  CoachStateKey,
  CoachStateRecord,
  SessionKind,
  TrainingSession,
} from "../src/types";

const USER = "state-runner";
const TODAY = "2026-11-05";
const NOW = "2026-11-05T08:00:00.000Z";

const handles: StoreHandle[] = [];
afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
});

function makeStore(): StoreHandle {
  const handle = createStore(":memory:");
  handle.store.createUser({
    userId: USER,
    username: "state-runner",
    displayName: "State Runner",
    passwordHash: "not-used",
    timezone: "UTC",
    goal: "Half marathon",
    createdAt: `${TODAY}T00:00:00.000Z`,
  });
  handles.push(handle);
  return handle;
}

function session(
  day: string,
  kind: SessionKind,
  title = `${kind} session`,
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    sessionId: `s-${day}-${kind}-${title}`,
    userId: USER,
    day,
    title,
    kind,
    distanceKm: 5,
    durationMin: 30,
    note: null,
    createdAt: `${TODAY}T00:00:00.000Z`,
    ...overrides,
  };
}

function activity(day: string, title: string, overrides: Partial<Activity> = {}): Activity {
  return {
    activityId: `a-${day}-${title}`,
    userId: USER,
    day,
    title,
    distanceKm: 5,
    durationMin: 30,
    paceSecPerKm: 360,
    avgHr: 140,
    source: "garmin",
    createdAt: `${TODAY}T00:00:00.000Z`,
    ...overrides,
  };
}

function detect(overrides: Partial<CoachStateDetectionInput> = {}): DetectedState[] {
  return detectCoachStates({
    today: TODAY,
    now: NOW,
    goal: null,
    sessions: [],
    pastSessions: [],
    activities: [],
    hasGarminKey: false,
    lastSyncAt: null,
    ...overrides,
  });
}

function keysOf(states: readonly DetectedState[]): CoachStateKey[] {
  return states.map((state) => state.key);
}

function stateRecord(key: CoachStateKey, overrides: Partial<CoachStateRecord> = {}): CoachStateRecord {
  return {
    stateId: `state:${key}`,
    userId: USER,
    key,
    status: "active",
    source: "auto",
    confidence: 0.9,
    evidence: ["Evidence line"],
    activatedAt: NOW,
    updatedAt: NOW,
    expiresAt: "2026-11-20T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

function proposal(overrides: Partial<StateProposal> = {}): StateProposal {
  return {
    key: "travel",
    action: "activate",
    confidence: 0.8,
    evidence: ["Travelling next week"],
    ttlDays: 10,
    note: null,
    ...overrides,
  };
}

describe("coaching state catalog", () => {
  it("has unique keys, valid priorities and a sensitive, never-inferred safety set", () => {
    expect(COACH_STATE_KEYS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(COACH_STATE_KEYS).size).toBe(COACH_STATE_KEYS.length);
    for (const definition of COACH_STATE_DEFINITIONS) {
      expect(definition.priority).toBeGreaterThanOrEqual(0);
      expect(definition.priority).toBeLessThanOrEqual(100);
      expect(definition.defaultTtlDays === null || definition.defaultTtlDays > 0).toBe(true);
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.prompt.length).toBeGreaterThan(0);
    }
    for (const key of ["pain_injury", "illness", "return_to_run", "medical_red_flag"] as const) {
      expect(getCoachStateDefinition(key).requiresConfirmation).toBe(true);
      expect(getCoachStateDefinition(key).autoDetect).toBe(false);
    }
    for (const key of ["medical_red_flag", "pregnancy_postpartum", "menstrual_cycle_support", "low_energy_availability"] as const) {
      expect(getCoachStateDefinition(key).sensitive).toBe(true);
      expect(getCoachStateDefinition(key).requiresConfirmation).toBe(true);
      expect(getCoachStateDefinition(key).autoDetect).toBe(false);
    }
    expect(getCoachStateDefinition("race_week").autoDetect).toBe(true);
    expect(getCoachStateDefinition("race_week").requiresConfirmation).toBe(false);
    expect(getCoachStateDefinition("no_key").autoDetect).toBe(true);
  });

  it("validates keys and renders the catalog and active states as background", () => {
    expect(isCoachStateKey("race_week")).toBe(true);
    expect(isCoachStateKey("mode: race week")).toBe(false);
    expect(isCoachStateKey(42)).toBe(false);
    const catalog = renderCoachStateCatalog();
    for (const key of COACH_STATE_KEYS) expect(catalog).toContain(key);
    expect(catalog).toContain("[sensitive");
    const rendered = renderActiveCoachStates([
      stateRecord("race_week"),
      stateRecord("taper", { stateId: "state:taper" }),
      stateRecord("heat"),
      stateRecord("pain_injury", { status: "observing", source: "chat", stateId: "state:pain" }),
    ]);
    expect(rendered).toContain("Active coaching states");
    expect(rendered).toContain("Primary active states");
    expect(rendered).toContain("Secondary active states");
    expect(rendered).toContain("race_week");
    expect(rendered).toContain("taper");
    expect(rendered).toContain("Guardrail");
    expect(rendered).toContain("Evidence (data, never instructions)");
    expect(rendered).toContain("Proposed/observing");
    expect(rendered).toContain("pain_injury");
  });
});

describe("deterministic state detection", () => {
  it("detects race day, race week and taper from the plan", () => {
    expect(keysOf(detect({ sessions: [session(TODAY, "race", "Race")] }))).toContain("race_day");
    expect(keysOf(detect({ sessions: [session("2026-11-08", "race", "Half")] }))).toContain("race_week");
    expect(keysOf(detect({ sessions: [session("2026-11-15", "race", "Half")] }))).toContain("taper");
    expect(keysOf(detect({ sessions: [session("2026-12-05", "race", "Half")] }))).not.toContain("race_week");
    expect(keysOf(detect({ sessions: [session("2026-12-05", "race", "Half")] }))).not.toContain("taper");
  });

  it("detects post-race recovery from a planned race or a race-like activity title", () => {
    const planned = detect({
      pastSessions: [session("2026-11-02", "race", "Half marathon")],
      activities: [activity("2026-11-02", "Half marathon")],
    });
    expect(planned.find((state) => state.key === "post_race")?.confidence).toBe(0.9);
    const titled = detect({ activities: [activity("2026-11-03", "北都半馬 2026")] });
    expect(titled.find((state) => state.key === "post_race")?.confidence).toBe(0.7);
    const training = detect({ activities: [activity("2026-11-03", "Half marathon training run")] });
    expect(keysOf(training)).not.toContain("post_race");
    const old = detect({ activities: [activity("2026-10-20", "Half marathon")] });
    expect(keysOf(old)).not.toContain("post_race");
  });

  it("detects a steep load ramp, a soft ramp, under-load and a hard/easy imbalance", () => {
    const high = detect({
      activities: [
        activity("2026-11-02", "Hard 1", { trainingLoad: 100 }),
        activity("2026-11-03", "Hard 2", { trainingLoad: 100 }),
        activity("2026-10-26", "Old 1", { trainingLoad: 10 }),
        activity("2026-10-27", "Old 2", { trainingLoad: 10 }),
      ],
    });
    expect(keysOf(high)).toContain("high_risk");
    const watch = detect({
      activities: [
        activity("2026-11-02", "Current", { trainingLoad: 60 }),
        activity("2026-10-26", "Previous", { trainingLoad: 55 }),
        activity("2026-10-19", "Earlier", { trainingLoad: 63 }),
      ],
    });
    expect(keysOf(watch)).toContain("load_spike");
    const under = detect({
      activities: [
        activity("2026-11-02", "Current", { trainingLoad: 20 }),
        activity("2026-10-26", "Previous", { trainingLoad: 100 }),
        activity("2026-10-19", "Earlier", { trainingLoad: 280 }),
      ],
    });
    expect(keysOf(under)).toContain("under_load");
    const imbalance = detect({
      activities: [
        activity("2026-11-02", "Tempo 1", { trainingLoad: 50, durationMin: 40, trainingEffectLabel: "TEMPO" }),
        activity("2026-11-03", "Tempo 2", { trainingLoad: 50, durationMin: 40, trainingEffectLabel: "TEMPO" }),
        activity("2026-11-04", "Tempo 3", { trainingLoad: 50, durationMin: 40, trainingEffectLabel: "TEMPO" }),
        activity("2026-11-05", "Easy 1", { trainingLoad: 50, durationMin: 20, trainingEffectLabel: "BASE" }),
        activity("2026-11-05", "Easy 2", { trainingLoad: 50, durationMin: 20, trainingEffectLabel: "BASE" }),
      ],
    });
    expect(keysOf(imbalance)).toContain("hard_easy_imbalance");
  });

  it("does not invent load states without a baseline", () => {
    const states = detect({ activities: [activity(TODAY, "One run", { trainingLoad: 100 })] });
    expect(keysOf(states)).not.toContain("high_risk");
    expect(keysOf(states)).not.toContain("load_spike");
    expect(keysOf(states)).not.toContain("under_load");
  });

  it("does not match a planned session to an activity on a different day", () => {
    const states = detect({
      pastSessions: [session("2026-11-03", "easy"), session("2026-11-04", "easy")],
      activities: [activity("2026-11-01", "Sunday run"), activity("2026-11-02", "Monday run")],
    });
    expect(keysOf(states)).toContain("consistency_guard");
  });

  it("detects missed planned sessions, stale Garmin data and a missing key", () => {
    const consistency = detect({
      pastSessions: [session("2026-11-03", "easy"), session("2026-11-04", "easy")],
    });
    expect(keysOf(consistency)).toContain("consistency_guard");
    const staleData = detect({ hasGarminKey: true });
    expect(keysOf(staleData)).toContain("data_stale");
    expect(keysOf(staleData)).not.toContain("no_key");
    const noKey = detect({ hasGarminKey: false });
    expect(keysOf(noKey)).toContain("no_key");
    expect(keysOf(noKey)).not.toContain("data_stale");
  });

  it("never flags a brand-new runner who has no plan at all", () => {
    const fresh = detect({ goal: "10k in December" });
    expect(fresh.filter((state) => state.key === "plan_stale")).toEqual([]);
    expect(keysOf(fresh)).toEqual(["no_key"]);
  });

  it("flags a stale plan only for a runner with plan history, using the stale framing", () => {
    expect(getCoachStateDefinition("plan_stale")).toMatchObject({
      defaultTtlDays: 14,
      priority: 35,
      uiNote: "The plan went stale, not the runner; a fresh block restarts it.",
    });
    const stale = detect({ goal: "10k in December", pastSessions: [session("2026-11-03", "easy")] });
    const planStale = stale.find((state) => state.key === "plan_stale");
    expect(planStale?.evidence).toEqual(["The plan went stale: nothing booked in the next 14 days."]);
    expect(planStale?.ttlDays).toBe(14);
    expect(planStale?.confidence).toBe(0.8);
  });

  it("treats a session booked within the next 35 days as plan history", () => {
    const distant = detect({ goal: "10k in December", sessions: [session("2026-11-30", "easy")] });
    expect(distant.find((state) => state.key === "plan_stale")?.evidence).toEqual([
      "The plan went stale: nothing booked in the next 14 days.",
    ]);
  });

  it("does not treat a lone far-future session as recent plan history", () => {
    const far = detect({ goal: "10k in December", sessions: [session("2026-12-20", "race", "Spring marathon")] });
    expect(far.filter((state) => state.key === "plan_stale")).toEqual([]);
  });

  it("does not flag a stale plan when sessions are booked in the next 14 days", () => {
    const booked = detect({
      goal: "10k in December",
      pastSessions: [session("2026-11-03", "easy")],
      sessions: [session("2026-11-08", "easy")],
    });
    expect(booked.filter((state) => state.key === "plan_stale")).toEqual([]);
  });
});

describe("coaching state lifecycle", () => {
  it("creates, updates and resolves an auto state without duplicating rows", () => {
    const handle = makeStore();
    const first: DetectedState = { key: "race_week", confidence: 0.9, evidence: ["Race in 3 days"], ttlDays: 4 };
    const created = syncCoachStates(handle.store, USER, [first], NOW);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ key: "race_week", status: "active", source: "auto" });
    expect(created[0]?.expiresAt).toBe("2026-11-09T08:00:00.000Z");

    const updated = syncCoachStates(handle.store, USER, [{ ...first, confidence: 0.8, evidence: ["Race in 2 days"], ttlDays: 5 }], NOW);
    expect(updated).toHaveLength(1);
    expect(updated[0]?.stateId).toBe(created[0]?.stateId);
    expect(updated[0]?.evidence).toEqual(["Race in 2 days"]);
    expect(updated[0]?.confidence).toBe(0.8);

    const cleared = syncCoachStates(handle.store, USER, [], NOW);
    expect(cleared).toHaveLength(0);
    expect(handle.store.listCoachStates(USER)[0]).toMatchObject({ status: "resolved" });
  });

  it("keeps a user-set state through sync and expires TTL states", () => {
    const handle = makeStore();
    const manual = setManualCoachState(handle.store, USER, "heat", 7, "Hot week", NOW);
    expect(manual).toMatchObject({ source: "user", status: "active", evidence: ["Hot week"] });
    const synced = syncCoachStates(handle.store, USER, [], NOW);
    expect(synced).toHaveLength(1);
    expect(synced[0]?.stateId).toBe(manual.stateId);

    handle.store.appendCoachState(
      stateRecord("travel", {
        stateId: "state:expired",
        source: "user",
        expiresAt: "2026-11-04T00:00:00.000Z",
      }),
    );
    const after = syncCoachStates(handle.store, USER, [], NOW);
    expect(after.map((state) => state.stateId)).not.toContain("state:expired");
    expect(handle.store.getCoachState(USER, "state:expired")).toMatchObject({ status: "resolved" });
  });

  it("respects a user dismissal for seven days before auto-reactivating", () => {
    const handle = makeStore();
    const detected: DetectedState[] = [{ key: "race_week", confidence: 0.9, evidence: ["Race"], ttlDays: 4 }];
    const created = syncCoachStates(handle.store, USER, detected, NOW);
    const stateId = created[0]?.stateId ?? "";
    expect(resolveCoachState(handle.store, USER, stateId, NOW)).toBe(true);
    const dismissed = syncCoachStates(handle.store, USER, detected, NOW);
    expect(dismissed).toHaveLength(0);
    expect(handle.store.getCoachState(USER, stateId)).toMatchObject({ status: "resolved", source: "user" });
  });

  it("refreshes deterministic states from the store", () => {
    const handle = makeStore();
    handle.store.upsertSession(session("2026-11-08", "race", "Half marathon", { distanceKm: 21.1, durationMin: 120 }));
    const states = refreshCoachStates(handle.store, USER, NOW, TODAY);
    expect(states.some((state) => state.key === "race_week")).toBe(true);
    expect(states.find((state) => state.key === "race_week")?.source).toBe("auto");
  });

  it("never proposes plan_stale on refresh for a brand-new account with no sessions", () => {
    const handle = makeStore();
    const states = refreshCoachStates(handle.store, USER, NOW, TODAY);
    expect(states.filter((state) => state.key === "plan_stale")).toEqual([]);
    expect(states.map((state) => state.key)).toEqual(["no_key"]);
  });

  it("serializes repeated syncs and records lifecycle events without duplicate open rows", () => {
    const handle = makeStore();
    const detected: DetectedState[] = [{ key: "race_week", confidence: 0.9, evidence: ["Race in 3 days"], ttlDays: 4 }];
    syncCoachStates(handle.store, USER, detected, NOW);
    syncCoachStates(handle.store, USER, detected, NOW);
    expect(handle.store.getActiveCoachStates(USER, NOW).filter((state) => state.key === "race_week")).toHaveLength(1);
    expect(handle.store.listCoachStateEvents(USER, 10).map((event) => event.action)).toEqual(["activate"]);

    syncCoachStates(handle.store, USER, [], NOW);
    expect(handle.store.listCoachStateEvents(USER, 10).map((event) => event.action)).toEqual(["resolve", "activate"]);
  });

  it("keeps an expired observing state unconfirmed and records the expiry", () => {
    const handle = makeStore();
    handle.store.appendCoachState(
      stateRecord("pain_injury", {
        stateId: "state:expired-observe",
        status: "observing",
        source: "chat",
        expiresAt: "2026-11-04T00:00:00.000Z",
      }),
    );
    expect(confirmCoachState(handle.store, USER, "state:expired-observe", NOW)).toBe(false);
    expect(handle.store.getCoachState(USER, "state:expired-observe")?.status).toBe("observing");
    syncCoachStates(handle.store, USER, [], NOW);
    expect(handle.store.getCoachState(USER, "state:expired-observe")?.status).toBe("resolved");
    expect(handle.store.listCoachStateEvents(USER, 10).map((event) => event.action)).toEqual(["expire"]);
  });

  it("prunes resolved rows and events older than the retention window", () => {
    const handle = makeStore();
    handle.store.appendCoachState(
      stateRecord("travel", {
        stateId: "state:old-history",
        status: "resolved",
        resolvedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    handle.store.appendCoachStateEvent({
      eventId: "state-event:old",
      userId: USER,
      stateId: "state:old-history",
      key: "travel",
      action: "resolve",
      fromStatus: "active",
      toStatus: "resolved",
      source: "user",
      confidence: 1,
      evidence: ["Old"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    syncCoachStates(handle.store, USER, [], NOW);
    expect(handle.store.getCoachState(USER, "state:old-history")).toBeUndefined();
    expect(handle.store.listCoachStateEvents(USER, 10)).toHaveLength(0);
  });

  it("supports a read-only auto-detection kill switch", () => {
    const handle = makeStore();
    handle.store.upsertSession(session("2026-11-08", "race", "Half marathon"));
    expect(refreshCoachStates(handle.store, USER, NOW, TODAY, { detect: false })).toHaveLength(0);
    expect(handle.store.getActiveCoachStates(USER, NOW)).toHaveLength(0);
    expect(refreshCoachStates(handle.store, USER, NOW, TODAY).some((state) => state.key === "race_week")).toBe(true);
  });

  it("formats the expiry date in the runner's timezone", () => {
    expect(formatCoachStateDate("2026-11-23T17:00:00.000Z", "Asia/Shanghai")).toBe("2026-11-24");
    expect(formatCoachStateDate("2026-11-23T17:00:00.000Z", "UTC")).toBe("2026-11-23");
  });
});

describe("state proposals", () => {
  it("starts sensitive proposals as observing and confirms them explicitly", () => {
    const handle = makeStore();
    const changes = applyStateProposals(
      handle.store,
      USER,
      [proposal({ key: "pain_injury", confidence: 0.6, evidence: ["Pain on the outside of the knee"], note: "Two days" })],
      NOW,
    );
    expect(changes[0]).toMatchObject({ key: "pain_injury", status: "observing", action: "activate" });
    const observing = handle.store.getActiveCoachStates(USER, NOW);
    expect(observing[0]).toMatchObject({ key: "pain_injury", status: "observing", source: "chat" });
    expect(observing[0]?.evidence).toContain("Two days");
    expect(confirmCoachState(handle.store, USER, changes[0]?.stateId ?? "", NOW)).toBe(true);
    expect(handle.store.getCoachState(USER, changes[0]?.stateId ?? "")?.status).toBe("active");
    expect(handle.store.listCoachStateEvents(USER, 10).some((event) => event.action === "confirm")).toBe(true);
  });

  it("activates ordinary proposals, resolves them and never downgrades an active state", () => {
    const handle = makeStore();
    const activated = applyStateProposals(handle.store, USER, [proposal()], NOW);
    expect(activated[0]).toMatchObject({ key: "travel", status: "active" });
    const resolved = applyStateProposals(
      handle.store,
      USER,
      [proposal({ action: "resolve", evidence: ["Back home"] })],
      NOW,
    );
    expect(resolved[0]).toMatchObject({ key: "travel", status: "resolved", action: "resolve" });
    expect(handle.store.getActiveCoachStates(USER, NOW)).toHaveLength(0);

    const userSet = setManualCoachState(handle.store, USER, "illness", 5, "Fever", NOW);
    applyStateProposals(handle.store, USER, [proposal({ key: "illness", confidence: 0.5, evidence: ["Maybe ill"] })], NOW);
    expect(handle.store.getCoachState(USER, userSet.stateId)).toMatchObject({
      status: "active",
      source: "user",
      confidence: 1,
      evidence: ["Fever"],
    });
    expect(handle.store.getCoachState(USER, userSet.stateId)?.evidence).not.toContain("Maybe ill");
    expect(handle.store.listCoachStateEvents(USER, 10).some((event) => event.action === "set" && event.key === "illness")).toBe(true);
  });
});

describe("state guardrails", () => {
  it("blocks hard sessions in the last three days before a race but allows easy and the race", () => {
    const handle = makeStore();
    handle.store.upsertSession(session("2026-11-07", "race", "Half marathon"));
    const state = stateRecord("race_week");
    const tempo = stateGuardrailViolations(handle.store, USER, [state], [{ action: "add", kind: "tempo", day: "2026-11-06" }], TODAY);
    expect(tempo).toHaveLength(1);
    expect(tempo[0]).toMatchObject({ key: "race_week", kind: "tempo" });
    expect(stateGuardrailViolations(handle.store, USER, [state], [{ action: "add", kind: "easy", day: "2026-11-06" }], TODAY)).toHaveLength(0);
    expect(stateGuardrailViolations(handle.store, USER, [state], [{ action: "add", kind: "race", day: "2026-11-07" }], TODAY)).toHaveLength(0);
  });

  it("does not apply race-week intensity limits five days out", () => {
    const handle = makeStore();
    handle.store.upsertSession(session("2026-11-10", "race", "Half marathon"));
    const violations = stateGuardrailViolations(
      handle.store,
      USER,
      [stateRecord("race_week")],
      [{ action: "add", kind: "tempo", day: "2026-11-06" }],
      TODAY,
    );
    expect(violations).toHaveLength(0);
  });

  it("blocks intensity and racing for injury, all training for illness, and everything for a red flag", () => {
    const handle = makeStore();
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("pain_injury")], [{ action: "add", kind: "race", day: "2026-11-08" }], TODAY),
    ).toHaveLength(1);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("pain_injury")], [{ action: "add", kind: "easy", day: "2026-11-08" }], TODAY),
    ).toHaveLength(0);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("illness")], [{ action: "add", kind: "easy", day: "2026-11-06" }], TODAY),
    ).toHaveLength(1);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("illness")], [{ action: "add", kind: "rest", day: "2026-11-06" }], TODAY),
    ).toHaveLength(0);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("medical_red_flag")], [{ action: "add", kind: "rest", day: "2026-11-06" }], TODAY),
    ).toHaveLength(1);
  });

  it("blocks intensity in the first week after a race and long runs in the final taper fortnight", () => {
    const handle = makeStore();
    handle.store.appendActivity(activity("2026-11-02", "Half marathon"));
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("post_race")], [{ action: "add", kind: "tempo", day: "2026-11-06" }], TODAY),
    ).toHaveLength(1);
    handle.store.upsertSession(session("2026-11-15", "race", "Half marathon"));
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("taper")], [{ action: "add", kind: "long", day: "2026-11-06" }], TODAY),
    ).toHaveLength(1);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("taper")], [{ action: "add", kind: "easy", day: "2026-11-06" }], TODAY),
    ).toHaveLength(0);
  });

  it("always allows removing a session and ignores observing states", () => {
    const handle = makeStore();
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("pain_injury")], [{ action: "remove", kind: "tempo", day: "2026-11-06" }], TODAY),
    ).toHaveLength(0);
    expect(
      stateGuardrailViolations(
        handle.store,
        USER,
        [stateRecord("pain_injury", { status: "observing" })],
        [{ action: "add", kind: "tempo", day: "2026-11-06" }],
        TODAY,
      ),
    ).toHaveLength(0);
  });

  it("uses the proposed session day, not the current state window, for race week and race day", () => {
    const handle = makeStore();
    handle.store.upsertSession(session("2026-11-07", "race", "Half marathon"));
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("race_week")], [{ action: "add", kind: "tempo", day: "2026-11-10" }], TODAY),
    ).toHaveLength(0);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("race_day")], [{ action: "add", kind: "tempo", day: "2026-11-06" }], TODAY),
    ).toHaveLength(0);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("race_day")], [{ action: "add", kind: "tempo", day: "2026-11-07" }], TODAY),
    ).toHaveLength(1);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("race_day")], [{ action: "add", kind: "tempo", day: "2026-11-08" }], TODAY),
    ).toHaveLength(0);
  });

  it("uses the session day for post-race and taper windows", () => {
    const handle = makeStore();
    handle.store.appendActivity(activity("2026-11-02", "Half marathon"));
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("post_race")], [{ action: "add", kind: "tempo", day: "2026-11-09" }], TODAY),
    ).toHaveLength(1);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("post_race")], [{ action: "add", kind: "tempo", day: "2026-11-10" }], TODAY),
    ).toHaveLength(0);

    handle.store.upsertSession(session("2026-11-15", "race", "Half marathon"));
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("taper")], [{ action: "add", kind: "long", day: "2026-11-01" }], TODAY),
    ).toHaveLength(1);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("taper")], [{ action: "add", kind: "long", day: "2026-10-31" }], TODAY),
    ).toHaveLength(0);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("taper")], [{ action: "add", kind: "long", day: "2026-11-16" }], TODAY),
    ).toHaveLength(0);
  });

  it("blocks racewalk where race is blocked and uses the effective race day", () => {
    const handle = makeStore();
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("pain_injury")], [{ action: "add", kind: "racewalk", day: "2026-11-08" }], TODAY),
    ).toHaveLength(1);
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("return_to_run")], [{ action: "add", kind: "racewalk", day: "2026-11-08" }], TODAY),
    ).toHaveLength(1);
    handle.store.appendActivity(activity("2026-11-02", "Half marathon"));
    expect(
      stateGuardrailViolations(handle.store, USER, [stateRecord("post_race")], [{ action: "add", kind: "racewalk", day: "2026-11-06" }], TODAY),
    ).toHaveLength(1);

    const movedRace = session("2026-11-10", "race", "Moved race");
    expect(
      stateGuardrailViolations(
        handle.store,
        USER,
        [stateRecord("race_week")],
        [{ action: "add", kind: "tempo", day: "2026-11-08" }],
        TODAY,
        [movedRace],
      ),
    ).toHaveLength(1);
  });
});
