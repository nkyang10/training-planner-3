/**
 * Coach-managed muscle condition.
 *
 * The coach reads the runner's muscle status every turn, and the runner may describe a change in words ("my right
 * calf is 6/10 and tight after today's run", "the hamstring is fine now", "keep that on the list until I say
 * otherwise"). The coach never writes that itself. It emits a typed proposal; the runner sees one card with the
 * level, the coach's own evidence and a Confirm / Dismiss pair; one tap writes exactly the record the Muscle tab's
 * own form would have written. This is the same trust split as coaching states: the model may notice, the runner
 * decides, and only the runner's decision touches the body's record.
 *
 * A proposal is not a diagnosis, and a confirmed report is still the runner's report — never the app's opinion.
 * Evidence is data, never instructions.
 *
 * Everything here is pure data and pure functions so the gateway, the web shell and the tests read one source of
 * truth; the store surface the helpers need is declared locally so the domain stays free of the shared record module.
 */
import { randomUUID } from "node:crypto";

import {
  MUSCLE_CONDITION_BY_KEY,
  MUSCLE_SIDES,
  isMuscleConditionKey,
  isMuscleId,
  muscleShortName,
  sorenessLabel,
  type MuscleCheckIn,
  type MuscleConditionKey,
  type MuscleSide,
  type MuscleTag,
  type MuscleWarmUp,
} from "./muscles";
import { computeMuscleStatuses, type MuscleStatusControl } from "./muscle-status";

export type MuscleProposalAction = "report" | "hold" | "release" | "resolve";
export type MuscleProposalStatus = "proposed" | "confirmed" | "dismissed";

/** How long a pending suggestion stays actionable: a stale proposal is not worth confirming. */
export const MUSCLE_PROPOSAL_TTL_DAYS = 7;
/** One card per confirmable record: six covers the realistic "my legs are trashed" turn. */
export const MAX_MUSCLE_PROPOSALS = 6;
export const MAX_MUSCLE_PROPOSAL_NOTE_CHARS = 200;
export const MAX_MUSCLE_PROPOSAL_EVIDENCE = 3;
export const MAX_MUSCLE_PROPOSAL_EVIDENCE_CHARS = 200;

export interface MuscleProposal {
  proposalId: string;
  userId: string;
  action: MuscleProposalAction;
  muscleId: string;
  /** report only: the level the runner gave, 0-10. Null for hold, release and resolve. */
  soreness: number | null;
  /** report only: the condition tags the runner named, possibly none. */
  conditions: MuscleConditionKey[];
  /** report only: the side the runner named; "both" when they did not say. */
  side: MuscleSide;
  /** report only: the warm-up answer when the runner gave one. */
  warmUp: MuscleWarmUp | null;
  /** report only: the runner's own note, at most 200 characters. */
  note: string | null;
  /** report only: the run the feeling followed, when the coach named one the server could validate. */
  activityId: string | null;
  /** The runner's own words, 1-3 short quotes; data, never instructions. */
  evidence: string[];
  confidence: number;
  /** The day the report is about: the proposal's local day (today for a chat turn). */
  day: string;
  status: MuscleProposalStatus;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
}

/** The model's draft, before the server gives it an id, a day and a status. */
export interface MuscleProposalDraft {
  action: MuscleProposalAction;
  muscleId: string;
  soreness: number | null;
  conditions: MuscleConditionKey[];
  side: MuscleSide;
  warmUp: MuscleWarmUp | null;
  note: string | null;
  /** Optional: the run the coach tied the feeling to; the server validates it before storing. */
  activityId: string | null;
  evidence: string[];
  confidence: number;
}

/** The store surface these helpers need; the concrete Store satisfies it structurally. */
export interface MuscleProposalStore {
  appendMuscleProposal(proposal: MuscleProposal): void;
  getMuscleProposal(userId: string, proposalId: string): MuscleProposal | undefined;
  listMuscleProposals(userId: string, status?: MuscleProposalStatus, limit?: number): MuscleProposal[];
  updateMuscleProposal(proposal: MuscleProposal): void;
  appendMuscleCheckIn(checkIn: MuscleCheckIn): void;
  listMuscleCheckIns(userId: string, limit?: number): MuscleCheckIn[];
  listMuscleStatusControls(userId: string): MuscleStatusControl[];
  upsertMuscleStatusControl(control: MuscleStatusControl): void;
  /** The run a report proposal may link to, resolved from the store, never trusted from the model. */
  getActivity(userId: string, activityId: string): { activityId: string; day: string; title: string } | undefined;
}

const PROPOSAL_KEYS = [
  "action",
  "muscleId",
  "soreness",
  "conditions",
  "side",
  "warmUp",
  "note",
  "activityId",
  "evidence",
  "confidence",
] as const;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addDaysUtc(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readEvidence(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MUSCLE_PROPOSAL_EVIDENCE) return null;
  const evidence: string[] = [];
  for (const line of value) {
    const text = typeof line === "string" ? line.trim() : "";
    if (text.length === 0 || text.length > MAX_MUSCLE_PROPOSAL_EVIDENCE_CHARS) return null;
    evidence.push(text);
  }
  return evidence;
}

function readNote(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > MAX_MUSCLE_PROPOSAL_NOTE_CHARS) return undefined;
  const text = value.trim();
  return text.length === 0 ? null : text;
}

function readSide(value: unknown): MuscleSide | undefined {
  if (value === undefined || value === null) return "both";
  return typeof value === "string" && (MUSCLE_SIDES as readonly string[]).includes(value) ? (value as MuscleSide) : undefined;
}

function readWarmUp(value: unknown): MuscleWarmUp | null | undefined {
  if (value === undefined || value === null) return null;
  return value === "eases" || value === "same" || value === "worse" ? value : undefined;
}

/**
 * The run reference is optional and trusted nowhere: the format check here only keeps a plausible id, and the
 * gateway resolves it against the store (owned, same day) before anything is stored. An unusable id is stripped by
 * the caller, never rejected — a bad guess must not burn the whole suggestion.
 */
function readActivityId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length === 0 || text.length > 200) return undefined;
  return text;
}

export type MuscleProposalDraftResult =
  | { ok: true; draft: MuscleProposalDraft }
  | { ok: false; path: string; message: string };

/**
 * Validate one model-authored proposal. A report needs the level the runner gave; a status action carries no
 * level at all, and extra report fields on it are normalized away instead of rejected, so a verbose model answer
 * still lands. Unknown muscles, out-of-range levels, unknown condition keys and missing evidence are rejected
 * whole, because a stored proposal must always be complete enough to show the runner.
 */
export function parseMuscleProposalDraft(raw: unknown): MuscleProposalDraftResult {
  if (!isObject(raw)) return { ok: false, path: "", message: "each muscle proposal must be an object" };
  for (const key of Object.keys(raw)) {
    if (!(PROPOSAL_KEYS as readonly string[]).includes(key)) {
      return { ok: false, path: key, message: `unexpected muscle proposal key: ${key}` };
    }
  }
  const action = raw["action"];
  if (action !== "report" && action !== "hold" && action !== "release" && action !== "resolve") {
    return { ok: false, path: "action", message: "action must be report, hold, release or resolve" };
  }
  const muscleId = raw["muscleId"];
  if (!isMuscleId(muscleId)) return { ok: false, path: "muscleId", message: `unknown muscle: ${String(muscleId)}` };
  const confidence = raw["confidence"];
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0.5 || confidence > 1) {
    return { ok: false, path: "confidence", message: "confidence must be 0.5..1" };
  }
  const evidence = readEvidence(raw["evidence"]);
  if (evidence === null) {
    return { ok: false, path: "evidence", message: `evidence must be 1..${MAX_MUSCLE_PROPOSAL_EVIDENCE} short quotes` };
  }
  if (action !== "report") {
    // hold, release and resolve carry no level and no report fields; extra ones are normalized away rather than
    // rejected, so a verbose model answer still lands and a long note never costs a repair attempt.
    return {
      ok: true,
      draft: { action, muscleId, soreness: null, conditions: [], side: "both", warmUp: null, note: null, activityId: null, evidence, confidence },
    };
  }
  const note = readNote(raw["note"]);
  if (note === undefined) {
    return { ok: false, path: "note", message: `note must be a string of at most ${MAX_MUSCLE_PROPOSAL_NOTE_CHARS} characters or null` };
  }
  const activityId = readActivityId(raw["activityId"]);
  if (activityId === undefined) {
    return { ok: false, path: "activityId", message: "activityId must be a short string or null" };
  }
  const soreness = raw["soreness"];
  if (typeof soreness !== "number" || !Number.isInteger(soreness) || soreness < 0 || soreness > 10) {
    return { ok: false, path: "soreness", message: "a report needs an integer soreness of 0..10" };
  }
  const rawConditions = raw["conditions"] === undefined || raw["conditions"] === null ? [] : raw["conditions"];
  if (!Array.isArray(rawConditions)) return { ok: false, path: "conditions", message: "conditions must be an array" };
  const conditions: MuscleConditionKey[] = [];
  for (const condition of rawConditions) {
    if (!isMuscleConditionKey(condition)) {
      return { ok: false, path: "conditions", message: `unknown condition: ${String(condition)}` };
    }
    if (!conditions.includes(condition)) conditions.push(condition);
  }
  const side = readSide(raw["side"]);
  if (side === undefined) return { ok: false, path: "side", message: "side must be both, left or right" };
  const warmUp = readWarmUp(raw["warmUp"]);
  if (warmUp === undefined) return { ok: false, path: "warmUp", message: "warmUp must be eases, same, worse or null" };
  return {
    ok: true,
    draft: { action, muscleId, soreness, conditions, side, warmUp, note, activityId, evidence, confidence },
  };
}

/** The stored row for one validated draft: a fresh id, the runner's day, and the pending status. */
export function buildMuscleProposal(input: {
  userId: string;
  draft: MuscleProposalDraft;
  today: string;
  now: string;
}): MuscleProposal {
  return {
    proposalId: `muscle-proposal:${randomUUID()}`,
    userId: input.userId,
    action: input.draft.action,
    muscleId: input.draft.muscleId,
    soreness: input.draft.soreness,
    conditions: [...input.draft.conditions],
    side: input.draft.side,
    warmUp: input.draft.warmUp,
    note: input.draft.note,
    activityId: input.draft.activityId,
    evidence: [...input.draft.evidence],
    confidence: input.draft.confidence,
    day: input.today,
    status: "proposed",
    createdAt: input.now,
    updatedAt: input.now,
    decidedAt: null,
  };
}

/** One runner-facing line, in English, for the coach prompt (and the tests that pin its wording). */
export function muscleProposalLine(proposal: MuscleProposal): string {
  const name = muscleShortName(proposal.muscleId);
  if (proposal.action === "report") {
    const conditions = proposal.conditions
      .map((condition) => MUSCLE_CONDITION_BY_KEY[condition].label.toLowerCase())
      .join(", ");
    const side = proposal.side === "both" ? "" : `, ${proposal.side}`;
    const level = proposal.soreness === null ? "a level" : `${proposal.soreness}/10 ${sorenessLabel(proposal.soreness).toLowerCase()}`;
    const run = proposal.activityId === null ? "" : " (about the linked run)";
    return `${name}: report ${level}${conditions.length === 0 ? "" : ` ${conditions}`}${side}${run}`;
  }
  if (proposal.action === "hold") return `${name}: hold the level constant`;
  if (proposal.action === "release") return `${name}: let the level fade again`;
  return `${name}: mark all better`;
}

/** The most pending suggestions the prompt lists one by one; older ones are summarized, never dropped from the UI. */
export const MAX_PROMPT_MUSCLE_PROPOSALS = 8;

/**
 * The pending-proposals block for the coach prompt. It exists so the model does not re-propose what the runner has
 * not answered yet, and so it never claims a suggestion was already saved. The newest few are listed in full; a
 * longer tail is summarized so the block stays small. Empty string when nothing is pending.
 */
export function renderMuscleProposalsForPrompt(pending: readonly MuscleProposal[]): string {
  if (pending.length === 0) return "";
  const listed = pending.slice(0, MAX_PROMPT_MUSCLE_PROPOSALS);
  const lines = listed.map((proposal) => {
    const note = proposal.note === null ? "" : ` — the runner's note: "${proposal.note}"`;
    return `- ${muscleProposalLine(proposal)} (suggested ${proposal.day}, not confirmed yet)${note}`;
  });
  const older = pending.length - listed.length;
  return [
    "Pending muscle suggestions (the runner has not confirmed these; never say they are logged or saved, do not repeat the same suggestion, and answer plainly if the runner asks about one):",
    ...lines,
    ...(older > 0 ? [`- ${older} older suggestion${older === 1 ? " is" : "s are"} also waiting; do not repeat ${older === 1 ? "it" : "them"} either.`] : []),
  ].join("\n");
}

export interface PendingMuscleProposals {
  /** Offerable now: inside the window, and a status action has an active status to act on. */
  offered: MuscleProposal[];
  /** Pending rows outside the offer window; not rendered as cards, but the page says they exist. */
  expired: number;
  /** Pending hold/release/resolve rows whose status faded before the tap; the honest dead-end count. */
  inactive: number;
}

/**
 * The honest partition behind every surface: what can still be confirmed, and what cannot. A hold, release or
 * resolve with no active status is not offered (its tap could only fail), and an out-of-window row is not offered
 * either; both stay stored and are counted so the Muscle tab can say what happened instead of silently vanishing
 * (F5/F14). The prompt block reads `offered` only, so the coach never re-proposes a dead end.
 */
export function partitionPendingMuscleProposals(
  store: MuscleProposalStore,
  userId: string,
  today: string,
): PendingMuscleProposals {
  const cutoff = addDaysUtc(today, -MUSCLE_PROPOSAL_TTL_DAYS);
  const rows = store.listMuscleProposals(userId, "proposed", 40);
  const statuses = computeMuscleStatuses({
    checkIns: store.listMuscleCheckIns(userId, 40),
    controls: store.listMuscleStatusControls(userId),
    today,
  });
  const active = new Set(statuses.map((status) => status.muscleId));
  const offered: MuscleProposal[] = [];
  let expired = 0;
  let inactive = 0;
  for (const proposal of rows) {
    if (!ISO_DAY.test(proposal.day) || proposal.day < cutoff || proposal.day > today) {
      expired += 1;
      continue;
    }
    if (proposal.action !== "report" && !active.has(proposal.muscleId)) {
      inactive += 1;
      continue;
    }
    offered.push(proposal);
  }
  return { offered, expired, inactive };
}

/** Offerable pending suggestions for one runner, newest first; the wrapper every read surface uses. */
export function listPendingMuscleProposals(
  store: MuscleProposalStore,
  userId: string,
  today: string,
): MuscleProposal[] {
  return partitionPendingMuscleProposals(store, userId, today).offered;
}

export type MuscleProposalConfirmResult =
  | { ok: true; proposal: MuscleProposal; checkIn: MuscleCheckIn | null }
  | { ok: false; detail: "not-found" | "not-pending" | "expired" | "incomplete" | "no-active-status" };

/**
 * Apply one confirmed proposal. This writes exactly what the runner's own one-tap control or check-in form would
 * have written, and it is the caller's job to run it in the same transaction as the proposal's status change:
 *
 * - report → a new append-only check-in for the runner's day, and the control row resets to fading;
 * - hold / release → the control row's hold flag, keeping the reported level;
 * - resolve → the control row claims the muscle better from today.
 *
 * A hold, release or resolve needs an active status to act on; if the period faded between the suggestion and the
 * tap, the confirm fails honestly instead of storing a control with nothing behind it.
 */
export function confirmMuscleProposal(input: {
  store: MuscleProposalStore;
  userId: string;
  proposalId: string;
  today: string;
  now: string;
}): MuscleProposalConfirmResult {
  const { store, userId, proposalId, today, now } = input;
  const proposal = store.getMuscleProposal(userId, proposalId);
  if (proposal === undefined) return { ok: false, detail: "not-found" };
  if (proposal.status !== "proposed") return { ok: false, detail: "not-pending" };
  const cutoff = addDaysUtc(today, -MUSCLE_PROPOSAL_TTL_DAYS);
  if (!ISO_DAY.test(proposal.day) || proposal.day < cutoff || proposal.day > today) {
    return { ok: false, detail: "expired" };
  }

  let checkIn: MuscleCheckIn | null = null;
  if (proposal.action === "report") {
    if (proposal.soreness === null) return { ok: false, detail: "incomplete" };
    const tag: MuscleTag = {
      muscleId: proposal.muscleId,
      soreness: proposal.soreness,
      conditions: [...proposal.conditions],
      side: proposal.side,
      warmUp: proposal.warmUp,
    };
    // The run link is re-resolved at confirm time — the store stays the authority, and a run deleted or moved
    // between suggestion and tap downgrades to an unlinked report instead of failing the whole decision.
    const run =
      proposal.activityId === null
        ? null
        : (() => {
            const activity = store.getActivity(userId, proposal.activityId);
            return activity !== undefined && activity.day === proposal.day ? activity.activityId : null;
          })();
    checkIn = {
      checkInId: `checkin:${randomUUID()}`,
      userId,
      day: proposal.day,
      activityId: run,
      muscles: [tag],
      note: proposal.note,
      createdAt: now,
    };
    store.appendMuscleCheckIn(checkIn);
    store.upsertMuscleStatusControl({ userId, muscleId: proposal.muscleId, hold: false, resolvedDay: null, updatedAt: now });
  } else {
    const statuses = computeMuscleStatuses({
      checkIns: store.listMuscleCheckIns(userId, 40),
      controls: store.listMuscleStatusControls(userId),
      today,
    });
    if (!statuses.some((status) => status.muscleId === proposal.muscleId)) {
      return { ok: false, detail: "no-active-status" };
    }
    if (proposal.action === "hold") {
      store.upsertMuscleStatusControl({ userId, muscleId: proposal.muscleId, hold: true, resolvedDay: null, updatedAt: now });
    } else if (proposal.action === "release") {
      store.upsertMuscleStatusControl({ userId, muscleId: proposal.muscleId, hold: false, resolvedDay: null, updatedAt: now });
    } else {
      store.upsertMuscleStatusControl({ userId, muscleId: proposal.muscleId, hold: false, resolvedDay: today, updatedAt: now });
    }
  }
  const decided: MuscleProposal = { ...proposal, status: "confirmed", updatedAt: now, decidedAt: now };
  store.updateMuscleProposal(decided);
  return { ok: true, proposal: decided, checkIn };
}

/** Dismiss one pending proposal; false when it is missing, foreign or already decided. */
export function dismissMuscleProposal(input: {
  store: MuscleProposalStore;
  userId: string;
  proposalId: string;
  now: string;
}): boolean {
  const proposal = input.store.getMuscleProposal(input.userId, input.proposalId);
  if (proposal === undefined || proposal.status !== "proposed") return false;
  input.store.updateMuscleProposal({ ...proposal, status: "dismissed", updatedAt: input.now, decidedAt: input.now });
  return true;
}

/**
 * Undo a dismissal (F7): a mis-tap costs one tap, not a full re-entry. The row returns to pending while it is still
 * inside the offer window; a stale dismissal is not resurrected, and the endpoint says "not-found" to the dock.
 */
export function restoreMuscleProposal(input: {
  store: MuscleProposalStore;
  userId: string;
  proposalId: string;
  today: string;
  now: string;
}): boolean {
  const proposal = input.store.getMuscleProposal(input.userId, input.proposalId);
  if (proposal === undefined || proposal.status !== "dismissed") return false;
  const cutoff = addDaysUtc(input.today, -MUSCLE_PROPOSAL_TTL_DAYS);
  if (!ISO_DAY.test(proposal.day) || proposal.day < cutoff || proposal.day > input.today) return false;
  input.store.updateMuscleProposal({ ...proposal, status: "proposed", updatedAt: input.now, decidedAt: null });
  return true;
}
