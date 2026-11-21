import { afterEach, describe, expect, it } from "vitest";

import { createStore, type StoreHandle } from "../src/store";
import {
  MAX_MUSCLE_PROPOSALS,
  MAX_MUSCLE_PROPOSAL_NOTE_CHARS,
  MAX_PROMPT_MUSCLE_PROPOSALS,
  MUSCLE_PROPOSAL_TTL_DAYS,
  buildMuscleProposal,
  confirmMuscleProposal,
  dismissMuscleProposal,
  listPendingMuscleProposals,
  muscleProposalLine,
  parseMuscleProposalDraft,
  renderMuscleProposalsForPrompt,
  type MuscleProposal,
  type MuscleProposalDraft,
} from "../src/muscle-proposals";

const USER = "runner-1";
const TODAY = "2026-11-19";
const NOW = `${TODAY}T08:00:00.000Z`;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanups.splice(0).reverse()) close();
});

const openStore = (): StoreHandle => {
  const handle = createStore(":memory:");
  cleanups.push(() => handle.close());
  return handle;
};

const draft = (overrides: Partial<MuscleProposalDraft> = {}): MuscleProposalDraft => ({
  action: "report",
  muscleId: "calves",
  soreness: 6,
  conditions: ["tight"],
  side: "right",
  warmUp: "eases",
  note: null,
  evidence: ["my right calf is 6/10 and tight"],
  confidence: 0.8,
  ...overrides,
});

const seedProposal = (
  handle: StoreHandle,
  input: { day?: string; overrides?: Partial<MuscleProposalDraft>; status?: MuscleProposal["status"] } = {},
): MuscleProposal => {
  const proposal = buildMuscleProposal({
    userId: USER,
    draft: draft(input.overrides),
    today: input.day ?? TODAY,
    now: NOW,
  });
  const stored: MuscleProposal = input.status === undefined ? proposal : { ...proposal, status: input.status };
  handle.store.appendMuscleProposal(stored);
  return stored;
};

const seedCheckIn = (handle: StoreHandle, muscleId: string, soreness: number): void => {
  handle.store.appendMuscleCheckIn({
    checkInId: `checkin:${muscleId}:${soreness}`,
    userId: USER,
    day: TODAY,
    activityId: null,
    muscles: [{ muscleId, soreness, conditions: [], side: "both", warmUp: null }],
    note: null,
    createdAt: NOW,
  });
};

describe("parsing a muscle proposal draft", () => {
  it("accepts a complete report and keeps every field", () => {
    const parsed = parseMuscleProposalDraft({
      action: "report",
      muscleId: "calves",
      soreness: 6,
      conditions: ["tight", "tight"],
      side: "right",
      warmUp: "eases",
      note: "  calf felt tight after the long run  ",
      evidence: ["my right calf is 6/10 and tight"],
      confidence: 0.8,
    });
    expect(parsed).toMatchObject({
      ok: true,
      draft: {
        action: "report",
        muscleId: "calves",
        soreness: 6,
        conditions: ["tight"],
        side: "right",
        warmUp: "eases",
        note: "calf felt tight after the long run",
        confidence: 0.8,
      },
    });
  });

  it("defaults the optional report fields and accepts a level of 0", () => {
    const parsed = parseMuscleProposalDraft({
      action: "report",
      muscleId: "calves",
      soreness: 0,
      evidence: ["calves feel fine today"],
      confidence: 0.6,
    });
    expect(parsed).toMatchObject({
      ok: true,
      draft: { soreness: 0, conditions: [], side: "both", warmUp: null, note: null },
    });
  });

  it("rejects unknown muscles, levels outside 0-10 and fractional levels", () => {
    expect(parseMuscleProposalDraft({ ...draft(), muscleId: "tail" })).toMatchObject({
      ok: false,
      path: "muscleId",
    });
    expect(parseMuscleProposalDraft({ ...draft(), soreness: 11 })).toMatchObject({ ok: false, path: "soreness" });
    expect(parseMuscleProposalDraft({ ...draft(), soreness: -1 })).toMatchObject({ ok: false, path: "soreness" });
    expect(parseMuscleProposalDraft({ ...draft(), soreness: 5.5 })).toMatchObject({ ok: false, path: "soreness" });
    expect(parseMuscleProposalDraft({ ...draft(), soreness: null })).toMatchObject({ ok: false, path: "soreness" });
  });

  it("rejects unknown conditions, sides and warm-up answers", () => {
    expect(parseMuscleProposalDraft({ ...draft(), conditions: ["bruised"] })).toMatchObject({
      ok: false,
      path: "conditions",
    });
    expect(parseMuscleProposalDraft({ ...draft(), side: "middle" })).toMatchObject({ ok: false, path: "side" });
    expect(parseMuscleProposalDraft({ ...draft(), warmUp: "sometimes" })).toMatchObject({ ok: false, path: "warmUp" });
  });

  it("requires evidence and a confidence of at least 0.5", () => {
    expect(parseMuscleProposalDraft({ ...draft(), evidence: [] })).toMatchObject({ ok: false, path: "evidence" });
    expect(parseMuscleProposalDraft({ ...draft(), evidence: ["  "] })).toMatchObject({ ok: false, path: "evidence" });
    expect(parseMuscleProposalDraft({ ...draft(), evidence: ["a", "b", "c", "d"] })).toMatchObject({
      ok: false,
      path: "evidence",
    });
    expect(parseMuscleProposalDraft({ ...draft(), confidence: 0.4 })).toMatchObject({ ok: false, path: "confidence" });
    expect(parseMuscleProposalDraft({ ...draft(), confidence: 1.2 })).toMatchObject({ ok: false, path: "confidence" });
  });

  it("rejects unknown keys, unknown actions and a non-object entry", () => {
    expect(parseMuscleProposalDraft({ ...draft(), diagnosis: "strain" })).toMatchObject({ ok: false, path: "diagnosis" });
    expect(parseMuscleProposalDraft({ ...draft(), action: "diagnose" })).toMatchObject({ ok: false, path: "action" });
    expect(parseMuscleProposalDraft("calves")).toMatchObject({ ok: false, path: "" });
  });

  it("normalizes report-only fields away from hold, release and resolve", () => {
    for (const action of ["hold", "release", "resolve"] as const) {
      const parsed = parseMuscleProposalDraft({
        ...draft(),
        action,
        note: "a".repeat(MAX_MUSCLE_PROPOSAL_NOTE_CHARS + 40),
      });
      expect(parsed).toMatchObject({
        ok: true,
        draft: { action, soreness: null, conditions: [], side: "both", warmUp: null, note: null },
      });
    }
  });
});

describe("building and listing proposals", () => {
  it("stamps an id, the runner's day and the pending status", () => {
    const proposal = buildMuscleProposal({ userId: USER, draft: draft(), today: TODAY, now: NOW });
    expect(proposal.proposalId.startsWith("muscle-proposal:")).toBe(true);
    expect(proposal).toMatchObject({
      userId: USER,
      day: TODAY,
      status: "proposed",
      createdAt: NOW,
      updatedAt: NOW,
      decidedAt: null,
      muscleId: "calves",
    });
  });

  it("lists only pending proposals inside the window, newest first", () => {
    const handle = openStore();
    const fresh = seedProposal(handle);
    const old = seedProposal(handle, { day: "2026-11-01" });
    seedProposal(handle, { status: "confirmed" });
    seedProposal(handle, { status: "dismissed" });
    const pending = listPendingMuscleProposals(handle.store, USER, TODAY);
    expect(pending.map((proposal) => proposal.proposalId)).toContain(fresh.proposalId);
    expect(pending.map((proposal) => proposal.proposalId)).not.toContain(old.proposalId);
    expect(pending.every((proposal) => proposal.status === "proposed")).toBe(true);
    expect(MUSCLE_PROPOSAL_TTL_DAYS).toBe(7);
  });

  it("keeps proposals scoped to their runner", () => {
    const handle = openStore();
    seedProposal(handle);
    expect(handle.store.listMuscleProposals("someone-else", "proposed", 12)).toHaveLength(0);
    expect(handle.store.listMuscleProposals(USER, "proposed", MAX_MUSCLE_PROPOSALS)).toHaveLength(1);
  });
});

describe("confirming a proposal", () => {
  it("writes the same check-in the runner's own form would and resets the control", () => {
    const handle = openStore();
    const proposal = seedProposal(handle, {
      overrides: { note: "calf felt tight after the long run" },
    });
    const result = confirmMuscleProposal({
      store: handle.store,
      userId: USER,
      proposalId: proposal.proposalId,
      today: TODAY,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    const checkIns = handle.store.listMuscleCheckIns(USER);
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0]).toMatchObject({
      day: TODAY,
      activityId: null,
      note: "calf felt tight after the long run",
    });
    expect(checkIns[0]?.muscles[0]).toMatchObject({
      muscleId: "calves",
      soreness: 6,
      conditions: ["tight"],
      side: "right",
      warmUp: "eases",
    });
    expect(handle.store.listMuscleStatusControls(USER).find((control) => control.muscleId === "calves")).toMatchObject({
      hold: false,
      resolvedDay: null,
    });
    expect(handle.store.getMuscleProposal(USER, proposal.proposalId)?.status).toBe("confirmed");
    expect(handle.store.getMuscleProposal(USER, proposal.proposalId)?.decidedAt).toBe(NOW);
  });

  it("holds and releases the current level", () => {
    const handle = openStore();
    seedCheckIn(handle, "calves", 7);
    const hold = seedProposal(handle, { overrides: { action: "hold", soreness: null, conditions: [], side: "both", warmUp: null } });
    expect(
      confirmMuscleProposal({ store: handle.store, userId: USER, proposalId: hold.proposalId, today: TODAY, now: NOW }).ok,
    ).toBe(true);
    expect(handle.store.listMuscleStatusControls(USER).find((control) => control.muscleId === "calves")?.hold).toBe(true);
    const release = seedProposal(handle, { overrides: { action: "release", soreness: null, conditions: [], side: "both", warmUp: null } });
    expect(
      confirmMuscleProposal({ store: handle.store, userId: USER, proposalId: release.proposalId, today: TODAY, now: NOW }).ok,
    ).toBe(true);
    expect(handle.store.listMuscleStatusControls(USER).find((control) => control.muscleId === "calves")?.hold).toBe(false);
  });

  it("marks the muscle all better from today", () => {
    const handle = openStore();
    seedCheckIn(handle, "calves", 7);
    const resolve = seedProposal(handle, { overrides: { action: "resolve", soreness: null, conditions: [], side: "both", warmUp: null } });
    expect(
      confirmMuscleProposal({ store: handle.store, userId: USER, proposalId: resolve.proposalId, today: TODAY, now: NOW }).ok,
    ).toBe(true);
    expect(handle.store.listMuscleStatusControls(USER).find((control) => control.muscleId === "calves")).toMatchObject({
      hold: false,
      resolvedDay: TODAY,
    });
  });

  it("refuses a status action when nothing is active", () => {
    const handle = openStore();
    const hold = seedProposal(handle, { overrides: { action: "hold", soreness: null, conditions: [], side: "both", warmUp: null } });
    expect(
      confirmMuscleProposal({ store: handle.store, userId: USER, proposalId: hold.proposalId, today: TODAY, now: NOW }),
    ).toMatchObject({ ok: false, detail: "no-active-status" });
    expect(handle.store.getMuscleProposal(USER, hold.proposalId)?.status).toBe("proposed");
  });

  it("refuses an expired suggestion, a decided one and a foreign one", () => {
    const handle = openStore();
    const expired = seedProposal(handle, { day: "2026-11-01" });
    expect(
      confirmMuscleProposal({ store: handle.store, userId: USER, proposalId: expired.proposalId, today: TODAY, now: NOW }),
    ).toMatchObject({ ok: false, detail: "expired" });
    const decided = seedProposal(handle, { status: "dismissed" });
    expect(
      confirmMuscleProposal({ store: handle.store, userId: USER, proposalId: decided.proposalId, today: TODAY, now: NOW }),
    ).toMatchObject({ ok: false, detail: "not-pending" });
    const foreign = seedProposal(handle);
    expect(
      confirmMuscleProposal({ store: handle.store, userId: "someone-else", proposalId: foreign.proposalId, today: TODAY, now: NOW }),
    ).toMatchObject({ ok: false, detail: "not-found" });
  });
});

describe("dismissing a proposal", () => {
  it("marks it dismissed once and never writes a record", () => {
    const handle = openStore();
    const proposal = seedProposal(handle);
    expect(dismissMuscleProposal({ store: handle.store, userId: USER, proposalId: proposal.proposalId, now: NOW })).toBe(true);
    expect(handle.store.getMuscleProposal(USER, proposal.proposalId)).toMatchObject({
      status: "dismissed",
      decidedAt: NOW,
    });
    expect(handle.store.listMuscleCheckIns(USER)).toHaveLength(0);
    expect(handle.store.listMuscleStatusControls(USER)).toHaveLength(0);
    expect(dismissMuscleProposal({ store: handle.store, userId: USER, proposalId: proposal.proposalId, now: NOW })).toBe(false);
  });
});

describe("prompt rendering", () => {
  it("renders nothing when nothing is pending", () => {
    expect(renderMuscleProposalsForPrompt([])).toBe("");
  });

  it("renders each pending suggestion with its day, note and no-saved wording", () => {
    const handle = openStore();
    const report = seedProposal(handle, { overrides: { note: "calf felt tight after the long run" } });
    const hold = seedProposal(handle, {
      overrides: { muscleId: "hamstrings", action: "hold", soreness: null, conditions: [], side: "both", warmUp: null },
    });
    const text = renderMuscleProposalsForPrompt([report, hold]);
    expect(text).toContain("Pending muscle suggestions");
    expect(text).toContain("Calves: report 6/10 clear doms tight / stiff, right");
    expect(text).toContain(`suggested ${TODAY}, not confirmed yet`);
    expect(text).toContain('the runner\'s note: "calf felt tight after the long run"');
    expect(text).toContain("Hamstrings: hold the level constant");
    expect(text).toContain("never say they are logged or saved");
  });

  it("summarizes a long tail instead of dropping it", () => {
    const handle = openStore();
    const ids = ["calves", "quads", "glutes", "hamstrings", "adductors", "abductors", "tibialis", "lower-back", "abs", "obliques"];
    const many = ids.map((muscleId) => seedProposal(handle, { overrides: { muscleId } }));
    const text = renderMuscleProposalsForPrompt(many);
    expect(text.split("\n")).toHaveLength(1 + MAX_PROMPT_MUSCLE_PROPOSALS + 1);
    expect(text).toContain("2 older suggestions are also waiting");
    expect(text).not.toContain("Obliques: report");
  });

  it("describes every action in one line", () => {
    const handle = openStore();
    const base = { muscleId: "calves", soreness: null, conditions: [], side: "both" as const, warmUp: null };
    const lines = (["hold", "release", "resolve"] as const).map((action) =>
      muscleProposalLine(buildMuscleProposal({ userId: USER, draft: draft({ ...base, action }), today: TODAY, now: NOW })),
    );
    expect(lines).toEqual([
      "Calves: hold the level constant",
      "Calves: let the level fade again",
      "Calves: mark all better",
    ]);
  });
});
