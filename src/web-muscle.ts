/**
 * The Muscle tab: one page where the runner checks in on their muscles and reads what the tags mean.
 *
 * Everything with state is server-rendered first — the current heat map, the per-muscle readings, the drill
 * cards, the history — so the page is honest without script. The reusable 3D muscle plugin
 * (src/muscle-viewer.ts) carries the figure; the grouped checkbox list in its list tab and the quick-set
 * controls stay the no-script submission path, so both worlds post the same record shape.
 */
import type { AuthUser } from "./auth";
import {
  MUSCLE_CATALOG,
  MUSCLE_CONDITIONS,
  MUSCLE_CONDITION_BY_KEY,
  MUSCLE_GROUP_LABELS,
  READINESS_LABELS,
  SORENESS_ANCHORS,
  careEntriesForCheckIn,
  drillCardsForCheckIn,
  getMuscle,
  muscleShortName,
  readinessForCheckIn,
  readMuscleTag,
  sorenessFill,
  summarizeCheckIn,
  type MuscleCheckIn,
  type MuscleSide,
  type MuscleTagLevel,
  type MuscleWork,
} from "./muscles";
import type { MuscleProposal } from "./muscle-proposals";
import { renderMuscleLegend } from "./muscle-map";
import { renderMuscleViewerPanel, type MuscleViewerRegion } from "./muscle-viewer";
import { MUSCLE_STATUS_WINDOW_DAYS, worstStatusLevel, type MuscleStatus } from "./muscle-status";
import type { CoachStateKey } from "./types";
import { escapeHtml, type ViewName } from "./web-html";
import { defaultTranslator, type MessageKey, type Translator } from "./i18n";

export interface MuscleActivityOption {
  activityId: string;
  day: string;
  label: string;
}

export interface MuscleTrainingRow {
  activityId: string;
  day: string;
  title: string;
  work: MuscleWork;
}

export interface MusclePageInput {
  user: AuthUser;
  today: string;
  /** The oldest day a check-in may be about. */
  earliestDay: string;
  /** The day the check-in form defaults to. */
  formDay: string;
  saved: boolean;
  /** True right after a one-tap status control (hold, release, resolve) landed. */
  statusSaved: boolean;
  /** True right after the runner confirmed a coach suggestion. */
  proposalSaved: boolean;
  /** True right after the runner dismissed a coach suggestion. */
  proposalDismissed: boolean;
  errorCode: string | null;
  /** Coach suggestions still waiting for the runner's one tap. */
  pendingProposals: readonly MuscleProposal[];
  /** The check-in the readings show: the viewed day's, else the latest. */
  dayCheckIn: MuscleCheckIn | null;
  history: readonly MuscleCheckIn[];
  /** The runner's live muscle statuses: dated periods computed from check-ins, controls and time. */
  statuses: readonly MuscleStatus[];
  /** The muscle a ?focus= deep link asked to update, when present. */
  focusMuscleId: string | null;
  /** The run a ?activity= link named when it is too old to link (older than the check-in window). */
  oldRunId: string | null;
  trainingRows: readonly MuscleTrainingRow[];
  /** The runs linkable on the form's day. */
  activityOptions: readonly MuscleActivityOption[];
  prefillActivityId: string | null;
  prefillMuscleIds: readonly string[];
}

export interface MusclePageDeps {
  layout: (title: string, body: string, user: AuthUser | undefined, activeView?: ViewName, flash?: string) => string;
}

const LEVEL_CHIP: Readonly<Record<MuscleTagLevel, { label: string; className: string }>> = {
  ok: { label: "Fine", className: "level-ok" },
  sore: { label: "Normal soreness", className: "level-sore" },
  heavy: { label: "Big response", className: "level-heavy" },
  watch: { label: "Watch", className: "level-watch" },
  warning: { label: "Needs care", className: "level-warning" },
  urgent: { label: "Care now", className: "level-urgent" },
};

const READINESS_CHIP: Readonly<Record<string, string>> = {
  steady: "readiness-steady",
  watch: "readiness-watch",
  care: "readiness-care",
  urgent: "readiness-urgent",
};

const LEVEL_CHIP_KEY: Readonly<Record<MuscleTagLevel, MessageKey>> = {
  ok: "muscle.levelOk",
  sore: "muscle.levelSore",
  heavy: "muscle.levelHeavy",
  watch: "muscle.levelWatch",
  warning: "muscle.levelWarning",
  urgent: "muscle.levelUrgent",
};

function errorTextFor(code: string | null, tx: Translator = defaultTranslator): string | undefined {
  switch (code) {
    case null:
    case "":
      return undefined;
    case "empty":
      return tx.t("muscle.errEmpty");
    case "day":
      return tx.t("muscle.errDay");
    case "activity":
      return tx.t("muscle.errActivity");
    case "severity":
      return tx.t("muscle.errSeverity");
    case "conditions":
      return tx.t("muscle.errConditions");
    case "muscles":
      return tx.t("muscle.errMuscles");
    case "note":
      return tx.t("muscle.errNote");
    case "too-many":
      return tx.t("muscle.errTooMany");
    case "proposal-missing":
      return tx.t("muscle.errProposalMissing");
    case "proposal-expired":
      return tx.t("muscle.errProposalExpired");
    case "proposal-status":
      return tx.t("muscle.errProposalStatus");
    default:
      return tx.t("muscle.errDefault");
  }
}

/** Inline JSON that cannot close the surrounding script element. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function formatDayLabel(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Localized soreness label keyed by the same bucket thresholds as the producer `sorenessLabel`. The en values
 * are byte-identical, so English renders unchanged; the result stays `.toLowerCase()`-able at call sites.
 */
function txSorenessLabel(value: number, tx: Translator = defaultTranslator): string {
  const bucket =
    value <= 0
      ? "nothing"
      : value <= 2
        ? "barelyThere"
        : value <= 3
          ? "mild"
          : value <= 5
            ? "noticeable"
            : value <= 6
              ? "clearDoms"
              : value <= 7
                ? "soreToTouch"
                : value <= 8
                  ? "strong"
                  : "severe";
  return tx.t(`muscle.soreness.${bucket}.label` as MessageKey);
}

/** Localized full muscle name for a catalog id; falls back to the raw id when the id is unknown. */
function txMuscleName(muscleId: string, tx: Translator = defaultTranslator): string {
  return getMuscle(muscleId) === undefined ? muscleId : tx.t(`muscle.name.${muscleId}` as MessageKey);
}

/** Localized short muscle name for a catalog id; falls back to the raw id when the id is unknown. */
function txMuscleShortName(muscleId: string, tx: Translator = defaultTranslator): string {
  return getMuscle(muscleId) === undefined ? muscleId : tx.t(`muscle.short.${muscleId}` as MessageKey);
}

/** Stable key slug for drill and guidance text: lowercase, runs of non-alphanumerics become single underscores, leading/trailing underscores stripped. */
function drillSlug(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function tagLine(
  tag: { soreness: number; conditions: readonly string[]; side: string },
  tx: Translator = defaultTranslator,
): string {
  const conditions = tag.conditions.map((key) =>
    key in MUSCLE_CONDITION_BY_KEY ? tx.t(`muscle.condition.${key}.label` as MessageKey) : key,
  );
  const side = tag.side === "both" ? "" : `, ${tag.side}`;
  const parts = [`${tag.soreness}/10 ${txSorenessLabel(tag.soreness, tx)}`, ...conditions];
  return parts.join(" · ") + side;
}

function levelChip(level: MuscleTagLevel, tx: Translator = defaultTranslator): string {
  const chip = LEVEL_CHIP[level];
  return `<span class="chip muscle-level ${chip.className}">${escapeHtml(tx.t(LEVEL_CHIP_KEY[level]))}</span>`;
}

function readinessChipHtml(readiness: string, tx: Translator = defaultTranslator): string {
  const label = readiness in READINESS_LABELS ? tx.t(`muscle.readiness.${readiness}` as MessageKey) : readiness;
  return `<span class="chip muscle-readiness ${READINESS_CHIP[readiness] ?? "readiness-steady"}">${escapeHtml(label)}</span>`;
}

/** One compact one-tap action on a status row: a tiny form so it works without script too. */
function statusActionForm(action: "hold" | "release" | "resolve", muscleId: string, label: string): string {
  return `<form method="post" action="/muscle/status" class="status-action-form"><input type="hidden" name="action" value="${action}"><input type="hidden" name="muscleId" value="${escapeHtml(muscleId)}"><button class="chip status-action" type="submit">${escapeHtml(label)}</button></form>`;
}

/** One live status row: the muscle, today's computed level, the time story, and the three one-tap controls. */
function statusRowHtml(status: MuscleStatus, tx: Translator = defaultTranslator): string {
  const name = txMuscleName(status.muscleId, tx);
  const trend = status.hold
    ? tx.t("muscle.heldTrend", { day: escapeHtml(formatDayLabel(status.startDay)), current: status.current })
    : status.current === status.reported
      ? tx.t("muscle.reportedTrend", {
          day: escapeHtml(formatDayLabel(status.startDay)),
          clear: escapeHtml(formatDayLabel(status.expectedClearDay)),
        })
      : tx.t("muscle.fadingTrend", {
          reported: status.reported,
          day: escapeHtml(formatDayLabel(status.startDay)),
          clear: escapeHtml(formatDayLabel(status.expectedClearDay)),
        });
  const linked = status.activityId === null
    ? ""
    : tx.t("muscle.linkedRun", { href: `/activity/${encodeURIComponent(status.activityId)}` });
  const holdToggle = status.hold
    ? statusActionForm("release", status.muscleId, tx.t("muscle.letItFade"))
    : statusActionForm("hold", status.muscleId, tx.t("muscle.holdConstant"));
  return `<li class="muscle-status-row">
    <span class="muscle-attention-dot" style="background:${sorenessFill(status.current)}" aria-hidden="true"></span>
    <div class="muscle-status-main">
      <div class="muscle-reading-head"><strong>${escapeHtml(name)}</strong><span class="chip muscle-tagline">${escapeHtml(tagLine({ soreness: status.current, conditions: [...status.conditions], side: status.side }, tx))}</span>${levelChip(status.level, tx)}</div>
      <p class="muted small">${trend}${linked}</p>
    </div>
    <div class="muscle-status-actions">
      <a class="chip" href="/muscle?focus=${encodeURIComponent(status.muscleId)}#check-in">${escapeHtml(tx.t("muscle.updateButton"))}</a>
      ${holdToggle}
      ${statusActionForm("resolve", status.muscleId, tx.t("muscle.allBetter"))}
    </div>
  </li>`;
}

/**
 * The live status card: what the app holds as true about the runner's muscles *today*. Perfect by default;
 * each reported muscle carries its computed level, its fade clock and three one-tap controls. This is the
 * section the attention badge points at.
 */
function statusSection(statuses: readonly MuscleStatus[], tx: Translator = defaultTranslator): string {
  const count = statuses.length;
  if (count === 0) {
    return `<section class="card muscle-status-card" id="muscle-status">
      <div class="splits-head"><h2>${escapeHtml(tx.t("muscle.statusHeading"))}</h2><p class="muted small">${escapeHtml(tx.t("muscle.statusEmptyProse"))}</p></div>
      <p class="muscle-status-clear"><span class="chip muscle-readiness readiness-steady">${escapeHtml(tx.t("muscle.allPerfect"))}</span> <span class="muted small">${escapeHtml(tx.t("muscle.statusClearProse"))}</span></p>
    </section>`;
  }
  const worst = worstStatusLevel(statuses);
  const worstRow =
    worst === null
      ? null
      : statuses.reduce<MuscleStatus | null>(
          (worstStatus, status) =>
            worstStatus === null || LEVEL_RANK[status.level] > LEVEL_RANK[worstStatus.level] ? status : worstStatus,
          null,
        );
  const worstName = worstRow === null
    ? ""
    : tx.t("muscle.worstPrefix", {
        name: escapeHtml(txMuscleShortName(worstRow.muscleId, tx)),
        level: escapeHtml(tx.t(LEVEL_CHIP_KEY[worstRow.level]).toLowerCase()),
      });
  const allBetter = count >= 2
    ? `<form method="post" action="/muscle/status" class="status-allbetter-form"><input type="hidden" name="action" value="resolve-all"><button class="btn ghost" type="submit">${tx.t("muscle.everythingBetter")}</button></form>`
    : "";
  const summary = statuses
    .map((status) => `${muscleShortName(status.muscleId)} ${status.current}/10${status.hold ? " (held)" : ""}`)
    .join(", ");
  const askCoach = `<button type="button" class="coach-ask" data-coach-message="${escapeHtml(`My muscles today: ${summary} — how should that shape my next few days?`)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-muscles", source: "muscle-tab" }))}">${escapeHtml(tx.t("muscle.askCoachStatus"))}</button>`;
  return `<section class="card muscle-status-card" id="muscle-status">
    <div class="splits-head">
      <h2>${escapeHtml(tx.t("muscle.statusHeading"))} <span class="attention-badge" role="status" aria-label="${escapeHtml(tx.t("muscle.needAttentionAria", { count }))}">${count}</span></h2>
      <p class="muted small">${tx.t("muscle.liveLevels", { days: MUSCLE_STATUS_WINDOW_DAYS, worst: worstName.length === 0 ? "" : `${worstName} · ` })}</p>
    </div>
    <ul class="muscle-status-list">${statuses.map((status) => statusRowHtml(status, tx)).join("")}</ul>
    <div class="review-actions">${allBetter}${askCoach}</div>
  </section>`;
}

/**
 * One coach suggestion in the runner's words, ready for the page or the coach dock. The line is built here so the
 * server and the client render the same sentence; the evidence stays a list of the runner's own quotes.
 */
export interface MuscleProposalView {
  proposalId: string;
  action: MuscleProposal["action"];
  muscleId: string;
  name: string;
  line: string;
  evidence: string[];
  note: string | null;
  day: string;
  status: MuscleProposal["status"];
}

function sideLabel(side: MuscleSide, tx: Translator = defaultTranslator): string {
  if (side === "left") return tx.t("muscle.sideLeft");
  if (side === "right") return tx.t("muscle.sideRight");
  return tx.t("muscle.sideBoth");
}

export function muscleProposalView(proposal: MuscleProposal, tx: Translator = defaultTranslator): MuscleProposalView {
  const name = txMuscleName(proposal.muscleId, tx);
  let line: string;
  if (proposal.action === "report") {
    const level = proposal.soreness ?? 0;
    const parts = [
      tx.t("muscle.proposalReport", {
        name,
        level: String(level),
        label: txSorenessLabel(level, tx).toLowerCase(),
      }),
    ];
    const conditions = proposal.conditions.map((condition) => tx.t(`muscle.condition.${condition}.label` as MessageKey));
    if (conditions.length > 0) parts.push(conditions.join(" · "));
    if (proposal.side !== "both") parts.push(sideLabel(proposal.side, tx));
    line = parts.join(" · ");
  } else if (proposal.action === "hold") {
    line = tx.t("muscle.proposalHold", { name });
  } else if (proposal.action === "release") {
    line = tx.t("muscle.proposalRelease", { name });
  } else {
    line = tx.t("muscle.proposalResolve", { name });
  }
  return {
    proposalId: proposal.proposalId,
    action: proposal.action,
    muscleId: proposal.muscleId,
    name,
    line,
    evidence: [...proposal.evidence],
    note: proposal.note,
    day: proposal.day,
    status: proposal.status,
  };
}

/** One pending suggestion: what the coach noticed, the runner's own quote, and the Confirm / Dismiss pair. */
function proposalCardHtml(proposal: MuscleProposal, tx: Translator = defaultTranslator): string {
  const view = muscleProposalView(proposal, tx);
  const quotes = view.evidence.map((quote) => `“${quote}”`).join(" · ");
  const evidence = `<p class="muted small">${escapeHtml(tx.t("muscle.proposalEvidence", { quotes }))}</p>`;
  const note = view.note === null
    ? ""
    : `<p class="muted small">${escapeHtml(tx.t("muscle.proposalNote", { note: view.note }))}</p>`;
  const base = `/muscle/proposals/${encodeURIComponent(view.proposalId)}`;
  return `<li class="muscle-proposal" data-proposal-id="${escapeHtml(view.proposalId)}">
    <div class="muscle-proposal-head"><span class="chip muscle-proposal-chip">${escapeHtml(tx.t("muscle.proposalChip"))}</span><strong>${escapeHtml(view.line)}</strong></div>
    ${evidence}${note}
    <form method="post" action="${base}/confirm" class="proposal-actions">
      <button class="btn" type="submit">${escapeHtml(tx.t("muscle.proposalConfirm"))}</button>
      <button class="btn ghost" type="submit" formaction="${base}/dismiss">${escapeHtml(tx.t("muscle.proposalDismiss"))}</button>
    </form>
  </li>`;
}

/**
 * The coach-suggestion card: the model may notice a change in the runner's words, but nothing about the body is
 * written until the runner taps Confirm. The card is server-rendered, so it works without script and survives a
 * refresh; the coach dock renders the same view for the turn that created it.
 */
function proposalsSection(proposals: readonly MuscleProposal[], tx: Translator = defaultTranslator): string {
  if (proposals.length === 0) return "";
  return `<section class="card muscle-proposal-card" id="muscle-suggestions">
    <div class="splits-head"><h2>${escapeHtml(tx.t("muscle.proposalHeading"))}</h2><p class="muted small">${escapeHtml(tx.t("muscle.proposalIntro"))}</p></div>
    <ul class="muscle-proposal-list">${proposals.map((proposal) => proposalCardHtml(proposal, tx)).join("")}</ul>
  </section>`;
}

/** One reading row: the muscle, the tag line, the level chip and the guidance paragraph. */
function readingRowHtml(tag: { muscleId: string; soreness: number; conditions: readonly string[]; side: string }, tx: Translator = defaultTranslator): string {
  const muscle = getMuscle(tag.muscleId);
  if (muscle === undefined) return "";
  const reading = readMuscleTag(tag as Parameters<typeof readMuscleTag>[0]);
  return `<li class="muscle-reading">
    <div class="muscle-reading-head"><strong>${escapeHtml(txMuscleName(tag.muscleId, tx))}</strong><span class="chip muscle-tagline">${escapeHtml(tagLine(tag, tx))}</span>${levelChip(reading.level, tx)}</div>
    <p class="muted small">${escapeHtml(tx.t(`muscle.guidance.${drillSlug(reading.guidance)}` as MessageKey))}</p>
  </li>`;
}

function readingsSection(checkIn: MuscleCheckIn, tx: Translator = defaultTranslator): string {
  const readiness = readinessForCheckIn(checkIn.muscles);
  const rows = checkIn.muscles.map((tag) => readingRowHtml(tag, tx)).join("");
  const linked = checkIn.activityId === null
    ? ""
    : tx.t("muscle.linkedRun", { href: `/activity/${encodeURIComponent(checkIn.activityId)}` });
  const note = checkIn.note === null ? "" : `<p class="muted small">${tx.t("muscle.yourNote", { note: escapeHtml(checkIn.note) })}</p>`;
  const askCoach = `<button type="button" class="coach-ask" data-coach-message="${escapeHtml(`I checked in on my muscles today (${summarizeCheckIn(checkIn)}) — how should that shape my next few days?`)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-muscles", source: "muscle-tab" }))}">${escapeHtml(tx.t("muscle.askCoachCheckIn"))}</button>`;
  return `<section class="card muscle-reading-card" id="latest-reading">
    <div class="muscle-reading-head-row"><h2>${escapeHtml(tx.t("muscle.latestCheckIn"))}</h2>${readinessChipHtml(readiness, tx)}</div>
    <p class="muted small">${escapeHtml(formatDayLabel(checkIn.day))}${linked}</p>
    ${note}
    <ul class="muscle-reading-list">${rows}</ul>
    <div class="review-actions">${askCoach}</div>
  </section>`;
}

function stateOfferForm(key: CoachStateKey, ttlDays: number, note: string, label: string): string {
  return `<form method="post" action="/coach-states" class="state-offer-form"><input type="hidden" name="key" value="${escapeHtml(key)}"><input type="hidden" name="ttlDays" value="${ttlDays}"><input type="hidden" name="note" value="${escapeHtml(note)}"><button class="btn ghost" type="submit">${escapeHtml(label)}</button></form>`;
}

/**
 * The care-now block for warning and urgent tags: the guidance, a one-tap coaching state that switches on the
 * existing guardrails, and a coach question scoped to that muscle. No drills here — drills would read as advice
 * the app must not give at this level.
 */
function careSection(checkIn: MuscleCheckIn, tx: Translator = defaultTranslator): string {
  const entries = careEntriesForCheckIn(checkIn.muscles);
  if (entries.length === 0) return "";
  const blocks = entries.map(({ tag, reading }) => {
    const muscle = getMuscle(tag.muscleId);
    const name = muscle?.name ?? tag.muscleId;
    const displayName = txMuscleName(tag.muscleId, tx);
    const note = `Muscle check-in ${checkIn.day}: ${tagLine(tag)}`;
    const isUrgent = reading.level === "urgent";
    const stateKey: CoachStateKey = isUrgent ? "medical_red_flag" : "pain_injury";
    const offer = stateOfferForm(
      stateKey,
      isUrgent ? 7 : 21,
      note,
      tx.t(isUrgent ? "muscle.setRedFlag" : "muscle.setPainState"),
    );
    const ask = `<button type="button" class="coach-ask" data-coach-message="${escapeHtml(`My ${name} is ${tagLine(tag)} after training — what should I do?`)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-muscles", muscleId: tag.muscleId, source: "muscle-tab" }))}">${tx.t("muscle.askCoachMuscle", { name: escapeHtml(displayName.toLowerCase()) })}</button>`;
    return `<li class="muscle-reading care">
      <div class="muscle-reading-head"><strong>${escapeHtml(displayName)}</strong>${levelChip(reading.level, tx)}</div>
      <p class="muted small">${escapeHtml(tx.t(`muscle.guidance.${drillSlug(reading.guidance)}` as MessageKey))}</p>
      <div class="review-actions">${offer}${ask}</div>
    </li>`;
  }).join("");
  return `<section class="card muscle-care-card">
    <h2>${escapeHtml(tx.t("muscle.careHeading"))}</h2>
    <p class="muted small">${tx.t("muscle.careProse")}</p>
    <ul class="muscle-reading-list">${blocks}</ul>
  </section>`;
}

function drillSection(checkIn: MuscleCheckIn, tx: Translator = defaultTranslator): string {
  const cards = drillCardsForCheckIn(checkIn.muscles);
  if (cards.length === 0) return "";
  const cardHtml = cards.map((card) => {
    const drills = card.drills
      .map((drill) => `<li><span class="chip drill-cat drill-${drill.category}">${tx.t(`muscle.drillCategory.${drill.category}` as MessageKey)}</span><strong>${escapeHtml(tx.t(`muscle.drill.${drillSlug(drill.name)}.name` as MessageKey))}</strong><span class="muted small">${escapeHtml(tx.t(`muscle.drill.${drillSlug(drill.how)}.how` as MessageKey))}</span></li>`)
      .join("");
    const ask = `<button type="button" class="coach-ask" data-coach-send="false" data-coach-message="${escapeHtml(`Can we work a short ${card.level === "heavy" ? "easy recovery" : "mobility and activation"} session for my ${card.muscleName.toLowerCase()} into this week?`)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "plan", source: "muscle-tab" }))}">${escapeHtml(tx.t("muscle.askWorkIn"))}</button>`;
    return `<article class="muscle-drill-card">
      <div class="muscle-reading-head"><strong>${escapeHtml(txMuscleName(card.muscleId, tx))}</strong>${levelChip(card.level, tx)}</div>
      <p class="muted small">${escapeHtml(tx.t(`muscle.guidance.${drillSlug(card.guidance)}` as MessageKey))}</p>
      <ul class="muscle-drills">${drills}</ul>
      <div class="review-actions">${ask}</div>
    </article>`;
  }).join("");
  return `<section class="card muscle-drill-section"><div class="splits-head"><h2>${escapeHtml(tx.t("muscle.drillHeading"))}</h2><p class="muted small">${escapeHtml(tx.t("muscle.drillProse"))}</p></div><div class="muscle-drill-grid">${cardHtml}</div></section>`;
}

function historySection(history: readonly MuscleCheckIn[], dayCheckIn: MuscleCheckIn | null, tx: Translator = defaultTranslator): string {
  const rows = history
    .filter((checkIn) => checkIn !== dayCheckIn)
    .slice(0, 8)
    .map((checkIn) => {
      const worst = checkIn.muscles.map((tag) => readMuscleTag(tag).level).reduce((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a), "ok" as MuscleTagLevel);
      return `<li><a class="chip" href="/muscle?day=${escapeHtml(checkIn.day)}">${escapeHtml(formatDayLabel(checkIn.day))}</a><span class="muted small">${escapeHtml(summarizeCheckIn(checkIn))}</span>${levelChip(worst, tx)}</li>`;
    })
    .join("");
  const list = rows.length === 0
    ? `<p class="muted small">${escapeHtml(tx.t("muscle.historyEmpty"))}</p>`
    : `<ul class="muscle-history">${rows}</ul>`;
  return `<section class="card"><h2>${escapeHtml(tx.t("muscle.recentCheckIns"))}</h2>${list}</section>`;
}

const LEVEL_RANK: Readonly<Record<MuscleTagLevel, number>> = { ok: 0, sore: 1, heavy: 2, watch: 3, warning: 4, urgent: 5 };

function trainingSection(rows: readonly MuscleTrainingRow[], tx: Translator = defaultTranslator): string {
  if (rows.length === 0) {
    return `<section class="card"><h2>${escapeHtml(tx.t("muscle.trainingHeading"))}</h2><p class="muted small">${escapeHtml(tx.t("muscle.trainingEmptyProse"))}</p></section>`;
  }
  const items = rows.map((row) => {
    const chips = [
      ...row.work.primary.map((id) => `<span class="chip worked-chip primary">${escapeHtml(txMuscleName(id, tx))}</span>`),
      ...row.work.secondary.map((id) => `<span class="chip worked-chip secondary">${escapeHtml(txMuscleName(id, tx))}</span>`),
    ].join("");
    return `<li class="training-row">
      <div class="training-row-main"><strong>${escapeHtml(row.title)}</strong><span class="muted small">${escapeHtml(formatDayLabel(row.day))}</span></div>
      <div class="training-row-chips">${chips}</div>
      <div class="training-row-actions"><a class="chip" href="/muscle?activity=${encodeURIComponent(row.activityId)}" data-tag-activity="${escapeHtml(row.activityId)}">${escapeHtml(tx.t("muscle.tagThese"))}</a><a class="chip" href="/activity/${encodeURIComponent(row.activityId)}">${escapeHtml(tx.t("muscle.detailLink"))}</a></div>
    </li>`;
  }).join("");
  return `<section class="card"><div class="splits-head"><h2>${escapeHtml(tx.t("muscle.trainingHeading"))}</h2><p class="muted small">${escapeHtml(tx.t("muscle.trainingProse"))}</p></div><ul class="training-list">${items}</ul></section>`;
}

/** The list tab's content: the figure's text alternative and the no-script selection path. */
function muscleListSection(prefillIds: readonly string[], tx: Translator = defaultTranslator): string {
  const groups = new Map<string, string[]>();
  for (const muscle of MUSCLE_CATALOG) {
    const checked = prefillIds.includes(muscle.id) ? " checked" : "";
    const options = groups.get(muscle.group) ?? [];
    options.push(`<li><label><input type="checkbox" class="muscle-check" name="muscleIds" value="${escapeHtml(muscle.id)}"${checked}> ${escapeHtml(txMuscleName(muscle.id, tx))}</label><span class="muted small">${escapeHtml(muscle.meaning)}</span></li>`);
    groups.set(muscle.group, options);
  }
  const groupHtml = [...groups.entries()]
    .map(([group, items]) => `<li><strong>${escapeHtml(group in MUSCLE_GROUP_LABELS ? tx.t(`muscle.group.${group}` as MessageKey) : group)}</strong><ul class="muscle-list-items">${items.join("")}</ul></li>`)
    .join("");
  return `<div class="muscle-list-tab"><p class="muted small">${escapeHtml(tx.t("muscle.listIntro"))}</p><ul class="muscle-list-groups">${groupHtml}</ul></div>`;
}

function formSection(input: MusclePageInput, tx: Translator = defaultTranslator): string {
  const activityOptions = input.activityOptions.map(
    (option) => `<option value="${escapeHtml(option.activityId)}"${option.activityId === input.prefillActivityId ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
  ).join("");
  const anchors = SORENESS_ANCHORS.map((anchor) => `${anchor.value} ${txSorenessLabel(anchor.value, tx)}`).join(" · ");
  const conditionBoxes = MUSCLE_CONDITIONS
    .map((condition) => `<label class="quick-condition"><input type="checkbox" class="quick-condition-input" name="conditions" value="${condition.key}"> ${tx.t(`muscle.condition.${condition.key}.label` as MessageKey)}</label>`)
    .join("");
  const sorenessOptions = Array.from({ length: 11 }, (_, value) => `<option value="${value}"${value === 5 ? " selected" : ""}>${value} · ${txSorenessLabel(value, tx)}</option>`).join("");
  const focusNote = input.focusMuscleId === null
    ? ""
    : `<p class="ok" role="status">${tx.t("muscle.focusNote", { name: escapeHtml(txMuscleName(input.focusMuscleId, tx)) })}</p>`;
  const prefillNote = input.prefillActivityId === null
    ? ""
    : `<p class="ok" role="status">${tx.t("muscle.prefillNote")}</p>`;
  const oldRunNote = input.oldRunId === null
    ? ""
    : `<p class="ok" role="status">${tx.t("muscle.oldRunNote")}</p>`;
  // The figure paints today's status heat; selecting a muscle takes the ember, hovering names it.
  const regions: Record<string, MuscleViewerRegion> = {};
  for (const status of input.statuses) {
    regions[status.muscleId] = {
      fill: sorenessFill(status.current),
      ...(status.level === "warning" || status.level === "urgent" ? { dashed: true } : {}),
      note: `${status.current}/10 ${txSorenessLabel(status.current, tx).toLowerCase()} ${tx.t("muscle.wordToday")}${status.hold ? ` · ${tx.t("muscle.wordHeld")}` : ""}`,
    };
  }
  const panel = renderMuscleViewerPanel({
    panelId: "muscle",
    regions,
    mode: { kind: "bridge", bridgeName: "__muscleTabBridge" },
    listHtml: muscleListSection(input.prefillMuscleIds, tx),
    figureTabLabel: tx.t("muscle.figureTab"),
    listTabLabel: tx.t("muscle.tabList"),
    tablistLabel: tx.t("muscle.tabTablist"),
    viewerLabel: tx.t("muscle.tabViewerLabel"),
    viewerNote: tx.t("muscle.tabViewerNote"),
    noScriptHint: tx.t("muscle.tabNoScript"),
    legendHtml: renderMuscleLegend(),
    height: "tall",
  });
  return `<section class="card muscle-checkin-card" id="check-in">
    <div class="splits-head"><h2>${escapeHtml(tx.t("muscle.formHeading"))}</h2><p class="muted small">${escapeHtml(tx.t("muscle.formProse"))}</p></div>
    ${focusNote}
    ${prefillNote}
    ${oldRunNote}
    <form method="post" action="/muscle/checkin" id="muscle-form" class="muscle-form">
      <div class="muscle-form-row">
        <label for="muscle-day">${escapeHtml(tx.t("muscle.labelDay"))}</label>
        <input id="muscle-day" name="day" type="date" value="${escapeHtml(input.formDay)}" min="${escapeHtml(input.earliestDay)}" max="${escapeHtml(input.today)}" required>
        <label for="muscle-activity">${escapeHtml(tx.t("muscle.labelRun"))} <span class="muted small">${escapeHtml(tx.t("muscle.optional"))}</span></label>
        <select id="muscle-activity" name="activityId"><option value="">${escapeHtml(tx.t("muscle.notLinked"))}</option>${activityOptions}</select>
      </div>
      <div class="muscle-workspace">
        <div class="muscle-map-col">
          ${panel}
        </div>
        <div class="muscle-editor-col">
          <div id="muscle-tray" class="muscle-tray" aria-label="${escapeHtml(tx.t("muscle.selectedAria"))}"></div>
          <div id="muscle-editor" class="muscle-editor" aria-live="polite"><p class="muted small muscle-editor-hint">${escapeHtml(tx.t("muscle.editorHint"))}</p></div>
        </div>
      </div>
      <fieldset class="muscle-quick">
        <legend>${escapeHtml(tx.t("muscle.quickSetLegend"))}</legend>
        <div class="muscle-quick-row">
          <label for="quick-soreness">${escapeHtml(tx.t("muscle.labelSoreness"))}</label>
          <select id="quick-soreness" name="soreness">${sorenessOptions}</select>
          <span class="muscle-quick-conditions">${conditionBoxes}</span>
          <label for="quick-side">${escapeHtml(tx.t("muscle.labelSide"))}</label>
          <select id="quick-side" name="side"><option value="both" selected>${escapeHtml(tx.t("muscle.sideBoth"))}</option><option value="left">${escapeHtml(tx.t("muscle.sideLeft"))}</option><option value="right">${escapeHtml(tx.t("muscle.sideRight"))}</option></select>
          <label for="quick-warmup">${escapeHtml(tx.t("muscle.labelWarmup"))}</label>
          <select id="quick-warmup" name="warmUp"><option value="" selected>—</option><option value="eases">${escapeHtml(tx.t("muscle.warmEases"))}</option><option value="same">${escapeHtml(tx.t("muscle.warmSame"))}</option><option value="worse">${escapeHtml(tx.t("muscle.warmWorse"))}</option></select>
          <button type="button" class="btn ghost" id="quick-apply">${escapeHtml(tx.t("muscle.applySelected"))}</button>
        </div>
        <p class="muted small">${escapeHtml(anchors)}</p>
        <label class="quick-hold" for="quick-hold"><input type="checkbox" id="quick-hold" name="hold" value="1"> <strong>${escapeHtml(tx.t("muscle.holdLabel"))}</strong> <span class="muted small">${escapeHtml(tx.t("muscle.holdHint"))}</span></label>
      </fieldset>
      <label for="muscle-note">${escapeHtml(tx.t("muscle.noteLabel"))} <span class="muted small">${escapeHtml(tx.t("muscle.optional"))}</span></label>
      <input id="muscle-note" name="note" maxlength="200" autocomplete="off" placeholder="${tx.t("muscle.notePlaceholder")}">
      <input type="hidden" name="musclesJson" id="muscle-json" value="">
      <div class="review-actions"><button class="btn" type="submit" data-track="muscle-checkin" data-track-value="save">${escapeHtml(tx.t("muscle.saveButton"))}</button><button type="button" class="btn ghost" id="muscle-clear">${escapeHtml(tx.t("muscle.clearButton"))}</button></div>
    </form>
  </section>`;
}

function safetySection(tx: Translator = defaultTranslator): string {
  return `<section class="card muscle-safety"><h2>${tx.t("muscle.safetyHeading")}</h2>
    <ul class="muscle-safety-list">
      <li>${tx.t("muscle.safetyNote1")}</li>
      <li>${tx.t("muscle.safetyNote2")}</li>
      <li>${tx.t("muscle.safetyNote3")}</li>
      <li>${tx.t("muscle.safetyNote4")}</li>
    </ul>
  </section>`;
}

/** The inline editor script: selection on the figures, the tray, the per-muscle panel, the quick set and the submit. */
function muscleScript(input: MusclePageInput, tx: Translator = defaultTranslator): string {
  const muscleData = MUSCLE_CATALOG.map((muscle) => ({
    id: muscle.id,
    name: txMuscleName(muscle.id, tx),
    group: muscle.group,
    view: muscle.view,
    function: muscle.function,
    issues: muscle.issues,
    meaning: muscle.meaning,
    recovery: muscle.recovery,
    drills: muscle.drills.map((drill) => ({
      ...drill,
      name: tx.t(`muscle.drill.${drillSlug(drill.name)}.name` as MessageKey),
      how: tx.t(`muscle.drill.${drillSlug(drill.how)}.how` as MessageKey),
    })),
  }));
  const conditions = MUSCLE_CONDITIONS.map((condition) => ({
    key: condition.key,
    label: tx.t(`muscle.condition.${condition.key}.label` as MessageKey),
  }));
  const training = input.trainingRows.map((row) => ({
    activityId: row.activityId,
    day: row.day,
    title: row.title,
    muscles: [...row.work.primary, ...row.work.secondary],
  }));
  const activitiesByDay: Record<string, { activityId: string; label: string }[]> = {};
  for (const option of input.activityOptions) {
    const list = activitiesByDay[option.day] ?? [];
    list.push({ activityId: option.activityId, label: option.label });
    activitiesByDay[option.day] = list;
  }
  const allActivities = input.activityOptions.map((option) => ({ day: option.day, activityId: option.activityId, label: option.label }));
  return `<script>
  (() => {
    const form = document.getElementById('muscle-form');
    const tray = document.getElementById('muscle-tray');
    const editor = document.getElementById('muscle-editor');
    const jsonInput = document.getElementById('muscle-json');
    const dayInput = document.getElementById('muscle-day');
    const activitySelect = document.getElementById('muscle-activity');
    const clearButton = document.getElementById('muscle-clear');
    const applyButton = document.getElementById('quick-apply');
    if (!form || !tray || !editor || !jsonInput || !dayInput || !activitySelect || !clearButton || !applyButton) return;

    const MUSCLES = ${jsonForScript(muscleData)};
    const CONDITIONS = ${jsonForScript(conditions)};
    const TRAINING = ${jsonForScript(training)};
    const ALL_ACTIVITIES = ${jsonForScript(allActivities)};
    const SELECTED_FIRST = ${jsonForScript(input.prefillMuscleIds)};
    const catalog = new Map(MUSCLES.map((muscle) => [muscle.id, muscle]));
    const state = new Map();
    let activeId = null;

    const painWords = ['sharp_pain', 'swelling', 'numbness', 'old_injury', 'dull_ache'];
    const newTag = () => ({ soreness: 0, conditions: [], side: 'both', warmUp: null });
    const tagOf = (id) => { if (!state.has(id)) state.set(id, newTag()); return state.get(id); };
    const labelFor = (value) => {
      if (value <= 0) return 'Nothing';
      if (value <= 2) return 'Barely there';
      if (value <= 3) return 'Mild';
      if (value <= 5) return 'Noticeable';
      if (value <= 6) return 'Clear DOMS';
      if (value <= 7) return 'Sore to touch';
      if (value <= 8) return 'Strong';
      return 'Severe';
    };
    const regionNodes = (id) => document.querySelectorAll('[data-muscle="' + id + '"]');
    const checkBoxes = (id) => document.querySelectorAll('input.muscle-check[value="' + id + '"]');

    const syncRegion = (id) => {
      const tag = state.get(id);
      for (const node of regionNodes(id)) {
        node.classList.toggle('selected', tag !== undefined);
        const muscle = catalog.get(id);
        if (muscle === undefined) continue;
        node.setAttribute('aria-pressed', tag === undefined ? 'false' : 'true');
        const label = tag === undefined
          ? muscle.name
          : muscle.name + ', ' + tag.soreness + '/10 ' + labelFor(tag.soreness) + (tag.conditions.length === 0 ? '' : ', ' + tag.conditions.join(', '));
        node.setAttribute('aria-label', label);
      }
      for (const box of checkBoxes(id)) box.checked = tag !== undefined;
      // The 3D viewer repaints the same muscle from the same state, whichever surface changed it.
      if (typeof window.__muscleViewer === 'object' && window.__muscleViewer !== null) {
        window.__muscleViewer.syncMuscle(id, tag === undefined ? null : tag);
      }
    };

    const renderTray = () => {
      tray.replaceChildren();
      if (state.size === 0) {
        const empty = document.createElement('span');
        empty.className = 'muted small';
        empty.textContent = 'No muscles selected yet.';
        tray.append(empty);
        return;
      }
      for (const [id, tag] of state) {
        const muscle = catalog.get(id);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'muscle-tray-chip' + (id === activeId ? ' active' : '');
        chip.textContent = (muscle ? muscle.name : id) + ' · ' + tag.soreness + '/10';
        chip.addEventListener('click', () => { setActive(id); });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'muscle-tray-remove';
        remove.setAttribute('aria-label', 'Remove ' + (muscle ? muscle.name : id));
        remove.textContent = '×';
        remove.addEventListener('click', () => { deselect(id); });
        chip.append(remove);
        tray.append(chip);
      }
    };

    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    const renderEditor = () => {
      editor.replaceChildren();
      const muscle = activeId === null ? undefined : catalog.get(activeId);
      if (activeId === null || muscle === undefined) {
        editor.append(el('p', 'muted small muscle-editor-hint', 'Select a muscle on the figure or in the list to tag it.'));
        return;
      }
      const tag = tagOf(activeId);
      const head = el('div', 'muscle-ed-head');
      head.append(el('strong', '', muscle.name), el('span', 'chip', muscle.group));
      const remove = el('button', 'btn ghost muscle-ed-remove', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => { deselect(activeId); });
      head.append(remove);
      editor.append(head);

      const sorenessRow = el('div', 'muscle-ed-soreness');
      const slider = el('input');
      slider.type = 'range';
      slider.id = 'ed-soreness';
      slider.min = '0';
      slider.max = '10';
      slider.step = '1';
      slider.value = String(tag.soreness);
      const readout = el('output', 'muscle-ed-readout', tag.soreness + '/10 · ' + labelFor(tag.soreness));
      slider.addEventListener('input', () => {
        tag.soreness = Number(slider.value);
        readout.textContent = tag.soreness + '/10 · ' + labelFor(tag.soreness);
        syncRegion(muscle.id);
        renderTray();
        syncWarmupVisibility(tag);
      });
      const sorenessLabel = el('label', '', 'Soreness today');
      sorenessLabel.setAttribute('for', 'ed-soreness');
      sorenessRow.append(sorenessLabel, slider, readout);
      editor.append(sorenessRow);
      editor.append(el('p', 'muted small muscle-ed-anchors', '0 nothing · 3 mild · 5 noticeable · 7 sore to touch · 9-10 severe'));

      const conditionRow = el('div', 'muscle-ed-conditions');
      conditionRow.append(el('span', 'muted small', 'Tags:'));
      for (const condition of CONDITIONS) {
        const chip = el('button', 'muscle-condition-chip', condition.label);
        chip.type = 'button';
        const on = () => tag.conditions.includes(condition.key);
        chip.setAttribute('aria-pressed', on() ? 'true' : 'false');
        chip.addEventListener('click', () => {
          if (on()) tag.conditions = tag.conditions.filter((key) => key !== condition.key);
          else tag.conditions.push(condition.key);
          chip.setAttribute('aria-pressed', on() ? 'true' : 'false');
          syncRegion(muscle.id);
          renderTray();
          syncWarmupVisibility(tag);
        });
        conditionRow.append(chip);
      }
      editor.append(conditionRow);

      const sideRow = el('div', 'muscle-ed-side');
      sideRow.append(el('span', 'muted small', 'Side:'));
      for (const side of ['both', 'left', 'right']) {
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'ed-side';
        radio.id = 'ed-side-' + side;
        radio.value = side;
        radio.checked = tag.side === side;
        radio.addEventListener('change', () => { tag.side = side; });
        const sideLabel = el('label', '', side === 'both' ? 'Both' : side === 'left' ? 'Left' : 'Right');
        sideLabel.setAttribute('for', 'ed-side-' + side);
        sideRow.append(radio, sideLabel);
      }
      editor.append(sideRow);

      const warmupRow = el('div', 'muscle-ed-warmup');
      warmupRow.append(el('span', 'muted small', 'Better once warmed up?'));
      for (const [value, text] of [['eases', 'Eases'], ['same', 'Same'], ['worse', 'Worse']]) {
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'ed-warmup';
        radio.id = 'ed-warmup-' + value;
        radio.value = value;
        radio.checked = tag.warmUp === value;
        radio.addEventListener('change', () => { tag.warmUp = radio.checked ? value : null; });
        const warmupLabel = el('label', '', text);
        warmupLabel.setAttribute('for', 'ed-warmup-' + value);
        warmupRow.append(radio, warmupLabel);
      }
      editor.append(warmupRow);
      syncWarmupVisibility(tag);

      const knowledge = el('details', 'muscle-ed-knowledge');
      const summary = el('summary', '', 'What the coach knows about ' + muscle.name);
      knowledge.append(summary);
      knowledge.append(el('p', 'muscle-ed-knowledge-line', 'Does: ' + muscle.function));
      knowledge.append(el('p', 'muscle-ed-knowledge-line', 'Usual meaning of soreness here: ' + muscle.meaning));
      knowledge.append(el('p', 'muscle-ed-knowledge-line', 'While it settles: ' + muscle.recovery));
      const drillList = el('ul', 'muscle-ed-drills');
      for (const drill of muscle.drills) {
        const item = el('li');
        item.append(el('span', 'chip drill-cat drill-' + drill.category, drill.category));
        item.append(el('strong', '', drill.name));
        item.append(el('span', 'muted small', ' ' + drill.how));
        drillList.append(item);
      }
      knowledge.append(drillList);
      editor.append(knowledge);
    };

    const syncWarmupVisibility = (tag) => {
      const warmupRow = editor.querySelector('.muscle-ed-warmup');
      if (warmupRow === null) return;
      const needed = tag.soreness >= 4 || tag.conditions.some((key) => painWords.includes(key));
      warmupRow.classList.toggle('hidden', !needed);
    };

    const setActive = (id) => {
      activeId = id;
      renderEditor();
      renderTray();
    };

    const select = (id) => { tagOf(id); syncRegion(id); setActive(id); };
    const deselect = (id) => {
      state.delete(id);
      if (activeId === id) activeId = null;
      syncRegion(id);
      renderTray();
      renderEditor();
    };

    const toggle = (id) => { if (state.has(id)) deselect(id); else select(id); };

    // The 3D figure drives selection through the plugin's bridge; the checkbox list (the plugin's list tab) is
    // the text path, so both surfaces share one state map here.
    for (const box of document.querySelectorAll('input.muscle-check')) {
      box.addEventListener('change', () => { toggle(box.value); });
    }

    applyButton.addEventListener('click', () => {
      if (state.size === 0) return;
      const soreness = Number((document.getElementById('quick-soreness') || {}).value || 0);
      const side = (document.getElementById('quick-side') || {}).value || 'both';
      const rawWarmup = (document.getElementById('quick-warmup') || {}).value || '';
      const warmUp = rawWarmup === 'eases' || rawWarmup === 'same' || rawWarmup === 'worse' ? rawWarmup : null;
      const picked = [];
      for (const box of document.querySelectorAll('.quick-condition-input')) {
        if (box.checked) picked.push(box.value);
      }
      for (const [id, tag] of state) {
        tag.soreness = soreness;
        tag.side = side;
        tag.warmUp = warmUp;
        tag.conditions = [...picked];
        syncRegion(id);
      }
      renderTray();
      renderEditor();
    });

    clearButton.addEventListener('click', () => {
      for (const id of [...state.keys()]) deselect(id);
    });

    // The day decides which runs are linkable; the select follows it.
    const refillActivities = () => {
      const day = dayInput.value;
      const options = (ALL_ACTIVITIES || []).filter((item) => item.day === day);
      const current = activitySelect.value;
      activitySelect.replaceChildren();
      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'Not linked to a run';
      activitySelect.append(none);
      for (const option of options) {
        const node = document.createElement('option');
        node.value = option.activityId;
        node.textContent = option.label;
        activitySelect.append(node);
      }
      if (options.some((option) => option.activityId === current)) activitySelect.value = current;
    };
    dayInput.addEventListener('change', refillActivities);

    for (const link of document.querySelectorAll('[data-tag-activity]')) {
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const row = (TRAINING || []).find((item) => item.activityId === link.dataset.tagActivity);
        if (row === undefined) return;
        for (const id of [...state.keys()]) deselect(id);
        for (const id of row.muscles) select(id);
        activeId = row.muscles.length > 0 ? row.muscles[0] : null;
        renderEditor();
        renderTray();
        activitySelect.value = row.activityId;
        if (dayInput.value !== row.day) { dayInput.value = row.day; refillActivities(); activitySelect.value = row.activityId; }
        const formCard = document.getElementById('check-in');
        if (formCard !== null) formCard.scrollIntoView({ block: 'start' });
      });
    }

    form.addEventListener('submit', () => {
      const tags = [];
      for (const [id, tag] of state) tags.push({ muscleId: id, soreness: tag.soreness, conditions: tag.conditions, side: tag.side, warmUp: tag.warmUp });
      jsonInput.value = tags.length > 0 ? JSON.stringify(tags) : '';
    });

    for (const id of SELECTED_FIRST) select(id);
    if (SELECTED_FIRST.length > 0) activeId = SELECTED_FIRST[0];
    renderEditor();
    renderTray();
    refillActivities();
    // The 3D viewer drives selection through this bridge: it calls toggle(), and reads peek/has to repaint.
    // peek is read-only on purpose: hovering must never create a tag, or a glide across the figure would
    // quietly select every muscle it crossed.
    window.__muscleTabBridge = { toggle, peek: (id) => state.get(id) ?? null, has: (id) => state.has(id) };
  })();
  </script>`;
}


export function renderMusclePage(input: MusclePageInput, deps: MusclePageDeps, tx: Translator = defaultTranslator): string {
  const savedBanner = input.saved
    ? `<p class="banner ok" role="status">${tx.t("muscle.savedBanner")}</p>`
    : "";
  const statusSavedBanner = input.statusSaved
    ? `<p class="banner ok" role="status">${tx.t("muscle.statusSavedBanner")}</p>`
    : "";
  const proposalSavedBanner = input.proposalSaved
    ? `<p class="banner ok" role="status">${tx.t("muscle.proposalSavedBanner")}</p>`
    : "";
  const proposalDismissedBanner = input.proposalDismissed
    ? `<p class="banner" role="status">${tx.t("muscle.proposalDismissedBanner")}</p>`
    : "";
  const errorBanner = input.errorCode === null ? "" : `<p class="banner error" role="alert">${escapeHtml(errorTextFor(input.errorCode, tx) ?? tx.t("muscle.errDefault"))}</p>`;
  const count = input.statuses.length;
  const worst = worstStatusLevel(input.statuses);
  const worstRow =
    worst === null
      ? null
      : input.statuses.reduce<MuscleStatus | null>(
          (worstStatus, status) =>
            worstStatus === null || LEVEL_RANK[status.level] > LEVEL_RANK[worstStatus.level] ? status : worstStatus,
          null,
        );
  const attentionLine =
    count === 0
      ? ""
      : `<p class="muted small">${escapeHtml(tx.t("muscle.attentionNow"))} <a href="#muscle-status"><span class="chip muscle-attention-chip">${escapeHtml(tx.t("muscle.needAttentionAria", { count }))}</span></a>${worstRow === null || worst === null ? "" : ` ${tx.t("muscle.attentionWorst", { name: escapeHtml(txMuscleShortName(worstRow.muscleId, tx)), level: escapeHtml(tx.t(`muscle.level.${worst}` as MessageKey).toLowerCase()) })}`}</p>`;
  const readiness = input.dayCheckIn === null ? "" : readinessForCheckIn(input.dayCheckIn.muscles);
  const readinessLine = input.dayCheckIn === null
    ? ""
    : `<p class="muted small">${escapeHtml(tx.t("muscle.latestReport"))} ${escapeHtml(formatDayLabel(input.dayCheckIn.day))} · ${readinessChipHtml(readiness, tx)}</p>`;
  const readingSections = input.dayCheckIn === null
    ? `<section class="card"><h2>${escapeHtml(tx.t("muscle.latestCheckIn"))}</h2><p class="muted small">${escapeHtml(tx.t("muscle.readingsEmptyProse"))}</p></section>`
    : `${careSection(input.dayCheckIn, tx)}${readingsSection(input.dayCheckIn, tx)}${drillSection(input.dayCheckIn, tx)}`;
  const body = `<header class="page-head"><p class="eyebrow">${escapeHtml(tx.t("nav.muscles"))}</p>
    <h1>${escapeHtml(tx.t("muscle.pageTitle"))}</h1>
    <p class="muted">${escapeHtml(tx.t("muscle.pageIntro"))}</p>
    ${attentionLine}
    ${readinessLine}</header>
    ${savedBanner}
    ${statusSavedBanner}
    ${proposalSavedBanner}
    ${proposalDismissedBanner}
    ${errorBanner}
    ${proposalsSection(input.pendingProposals, tx)}
    <div class="muscle-layout">
      <div class="muscle-status-slot">${statusSection(input.statuses, tx)}</div>
      <div class="muscle-form-slot">${formSection(input, tx)}</div>
      <div class="muscle-readings-slot">${readingSections}</div>
    </div>
    ${trainingSection(input.trainingRows, tx)}
    ${historySection(input.history, input.dayCheckIn, tx)}
    ${safetySection(tx)}
    ${muscleScript(input, tx)}`;
  return deps.layout(tx.t("nav.muscles"), body, input.user, "muscle");
}

/** The attention chip the calendar shows while muscles are in a special (non-perfect) status. */
export function muscleCalendarChip(statuses: readonly MuscleStatus[], tx: Translator = defaultTranslator): string | null {
  const count = statuses.length;
  if (count === 0) return null;
  const worst = worstStatusLevel(statuses);
  const label =
    worst === "urgent"
      ? tx.t("muscle.calendarCareNow")
      : worst === "warning" || worst === "heavy"
        ? tx.t("muscle.calendarNeedsCare")
        : tx.t("muscle.calendarSore", { count });
  return `<a class="chip muscle-calendar-chip" href="/muscle" title="${escapeHtml(tx.t("muscle.calendarChipTitle"))}">${escapeHtml(label)}</a>`;
}

/**
 * The muscles-worked card for the activity detail: the same reusable 3D muscle plugin as the Muscle tab, in
 * link mode — primary movers ember, helpers light, and clicking a muscle deep-links into a check-in on exactly
 * that muscle. The list tab is the text representation (primary/helper chips, the spoken summary), the live
 * status chips and the report already linked to this run stay readable without script, and the button starts a
 * check-in on exactly these muscles with the run preselected.
 */
export function musclesWorkedCard(
  activityId: string,
  work: MuscleWork,
  statuses: readonly MuscleStatus[] = [],
  linkedCheckIn: MuscleCheckIn | null = null,
  tx: Translator = defaultTranslator,
): string {
  const workedIds = [...work.primary, ...work.secondary];
  const active = statuses.filter((status) => workedIds.includes(status.muscleId));
  // The figure paints the run's footprint first, then today's status heat wins where a muscle has one.
  const regions: Record<string, MuscleViewerRegion> = {};
  const moverRole = tx.t("muscle.rolePrimaryMover");
  const helperRole = tx.t("muscle.roleHelperMuscle");
  for (const id of work.primary) regions[id] = { fill: "#f28034", note: moverRole };
  for (const id of work.secondary) regions[id] = { fill: "#fbd5a8", note: helperRole };
  for (const status of active) {
    const role = regions[status.muscleId]?.note ?? "";
    const note = `${status.current}/10 ${txSorenessLabel(status.current, tx).toLowerCase()} ${tx.t("muscle.wordToday")}${status.hold ? ` · ${tx.t("muscle.wordHeld")}` : ""}${role.length === 0 ? "" : ` · ${role}`}`;
    regions[status.muscleId] = {
      fill: sorenessFill(status.current),
      ...(status.level === "warning" || status.level === "urgent" ? { dashed: true } : {}),
      note,
    };
  }
  const chips = (ids: readonly string[], emphasis: "primary" | "secondary"): string =>
    ids
      .map((id) => `<a class="chip worked-chip ${emphasis}" href="/muscle?focus=${encodeURIComponent(id)}#check-in">${escapeHtml(txMuscleName(id, tx))}</a>`)
      .join("");
  const primaryLine = chips(work.primary, "primary");
  const secondaryLine = work.secondary.length === 0 ? "" : chips(work.secondary, "secondary");
  const primaryNames = work.primary.map((id) => txMuscleName(id, tx)).join(", ");
  const secondaryNames = work.secondary.map((id) => txMuscleName(id, tx)).join(", ");
  const spoken = `${tx.t("muscle.spokenPrimary")} ${primaryNames}.${work.secondary.length === 0 ? "" : ` ${tx.t("muscle.spokenSecondary")} ${secondaryNames}.`}`;
  const listHtml = `<div class="worked-list-tab"><p class="muted small"><strong>${escapeHtml(tx.t("muscle.primaryMovers"))}</strong></p><div class="muscle-list-chip-row">${primaryLine}</div>${work.secondary.length === 0 ? "" : `<p class="muted small"><strong>${escapeHtml(tx.t("muscle.helpers"))}</strong></p><div class="muscle-list-chip-row">${secondaryLine}</div>`}<p class="muted small">${escapeHtml(spoken)}</p></div>`;
  const panel = renderMuscleViewerPanel({
    panelId: "worked",
    regions,
    mode: { kind: "link", href: "/muscle?focus=" },
    listHtml,
    figureTabLabel: tx.t("muscle.figureTab"),
    listTabLabel: tx.t("muscle.listTab"),
    tablistLabel: tx.t("muscle.tablistLabel"),
    viewerLabel: tx.t("muscle.viewerLabel"),
    viewerNote: tx.t("muscle.viewerNote"),
    noScriptHint: tx.t("muscle.noScriptHint"),
    height: "compact",
  });
  const statusChips = active
    .map((status) => {
      const name = txMuscleShortName(status.muscleId, tx);
      const fill = sorenessFill(status.current);
      return `<a class="chip muscle-worked-status" href="/muscle?focus=${encodeURIComponent(status.muscleId)}#check-in" title="${escapeHtml(tx.t("muscle.updateTitle"))}"><span class="muscle-attention-dot" style="background:${fill}" aria-hidden="true"></span>${escapeHtml(name)} · ${status.current}/10${status.hold ? ` · ${escapeHtml(tx.t("muscle.wordHeld"))}` : ""}</a>`;
    })
    .join("");
  const statusLine =
    active.length === 0
      ? ""
      : `<p class="muted small muscle-worked-status-row">${escapeHtml(tx.t("muscle.fromTheseNow"))} ${statusChips}</p>`;
  const linkedLine = linkedCheckIn === null
    ? ""
    : `<p class="muted small">${escapeHtml(tx.t("muscle.reportedAfterRun"))} <a href="/muscle?day=${escapeHtml(linkedCheckIn.day)}">${escapeHtml(summarizeCheckIn(linkedCheckIn))}</a></p>`;
  return `<section class="card muscles-worked-card" id="muscles-worked" tabindex="-1"><div class="splits-head"><h2>${escapeHtml(tx.t("muscle.workedHeading"))}</h2><p class="muted small">${escapeHtml(tx.t("muscle.workedProse"))}</p></div>${panel}${statusLine}${linkedLine}<div class="review-actions"><a class="btn ghost" href="/muscle?activity=${encodeURIComponent(activityId)}">${escapeHtml(tx.t("muscle.checkInButton"))}</a></div></section>`;
}
