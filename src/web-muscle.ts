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
  sorenessLabel,
  summarizeCheckIn,
  type MuscleCheckIn,
  type MuscleTagLevel,
  type MuscleWork,
} from "./muscles";
import { renderMuscleLegend } from "./muscle-map";
import { renderMuscleViewerPanel, type MuscleViewerRegion } from "./muscle-viewer";
import { MUSCLE_STATUS_WINDOW_DAYS, worstStatusLevel, type MuscleStatus } from "./muscle-status";
import type { CoachStateKey } from "./types";
import { escapeHtml, type ViewName } from "./web-html";

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
  errorCode: string | null;
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

function errorTextFor(code: string | null): string | undefined {
  switch (code) {
    case null:
    case "":
      return undefined;
    case "empty":
      return "Select at least one muscle before saving.";
    case "day":
      return "Pick a valid day — not in the future, and within the last 14 days.";
    case "activity":
      return "That run could not be linked; it may belong to another day.";
    case "severity":
      return "Soreness must be 0-10.";
    case "conditions":
      return "One of the condition tags was not recognized.";
    case "muscles":
      return "One of the selected muscles was not recognized.";
    case "note":
      return "The note must be at most 200 characters.";
    case "too-many":
      return "That check-in had too many muscles in it.";
    default:
      return "The check-in could not be saved.";
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

function tagLine(tag: { soreness: number; conditions: readonly string[]; side: string }): string {
  const conditions = tag.conditions.map((key) => MUSCLE_CONDITION_BY_KEY[key as keyof typeof MUSCLE_CONDITION_BY_KEY]?.label ?? key);
  const side = tag.side === "both" ? "" : `, ${tag.side}`;
  const parts = [`${tag.soreness}/10 ${sorenessLabel(tag.soreness)}`, ...conditions];
  return parts.join(" · ") + side;
}

function levelChip(level: MuscleTagLevel): string {
  const chip = LEVEL_CHIP[level];
  return `<span class="chip muscle-level ${chip.className}">${chip.label}</span>`;
}

function readinessChipHtml(readiness: string): string {
  return `<span class="chip muscle-readiness ${READINESS_CHIP[readiness] ?? "readiness-steady"}">${escapeHtml(READINESS_LABELS[readiness as keyof typeof READINESS_LABELS] ?? readiness)}</span>`;
}

/** One compact one-tap action on a status row: a tiny form so it works without script too. */
function statusActionForm(action: "hold" | "release" | "resolve", muscleId: string, label: string): string {
  return `<form method="post" action="/muscle/status" class="status-action-form"><input type="hidden" name="action" value="${action}"><input type="hidden" name="muscleId" value="${escapeHtml(muscleId)}"><button class="chip status-action" type="submit">${escapeHtml(label)}</button></form>`;
}

/** One live status row: the muscle, today's computed level, the time story, and the three one-tap controls. */
function statusRowHtml(status: MuscleStatus): string {
  const muscle = getMuscle(status.muscleId);
  const name = muscle?.name ?? status.muscleId;
  const trend = status.hold
    ? `Held constant since ${escapeHtml(formatDayLabel(status.startDay))} — it stays ${status.current}/10 until you change it.`
    : status.current === status.reported
      ? `Reported ${escapeHtml(formatDayLabel(status.startDay))} · fades on its own from here, expected clear by ${escapeHtml(formatDayLabel(status.expectedClearDay))}.`
      : `Was ${status.reported}/10 on ${escapeHtml(formatDayLabel(status.startDay))} · now fading, expected clear by ${escapeHtml(formatDayLabel(status.expectedClearDay))}.`;
  const linked = status.activityId === null
    ? ""
    : ` · about <a href="/activity/${encodeURIComponent(status.activityId)}">the linked run</a>`;
  const holdToggle = status.hold
    ? statusActionForm("release", status.muscleId, "Let it fade")
    : statusActionForm("hold", status.muscleId, "Hold constant");
  return `<li class="muscle-status-row">
    <span class="muscle-attention-dot" style="background:${sorenessFill(status.current)}" aria-hidden="true"></span>
    <div class="muscle-status-main">
      <div class="muscle-reading-head"><strong>${escapeHtml(name)}</strong><span class="chip muscle-tagline">${escapeHtml(tagLine({ soreness: status.current, conditions: [...status.conditions], side: status.side }))}</span>${levelChip(status.level)}</div>
      <p class="muted small">${trend}${linked}</p>
    </div>
    <div class="muscle-status-actions">
      <a class="chip" href="/muscle?focus=${encodeURIComponent(status.muscleId)}#check-in">Update</a>
      ${holdToggle}
      ${statusActionForm("resolve", status.muscleId, "All better")}
    </div>
  </li>`;
}

/**
 * The live status card: what the app holds as true about the runner's muscles *today*. Perfect by default;
 * each reported muscle carries its computed level, its fade clock and three one-tap controls. This is the
 * section the attention badge points at.
 */
function statusSection(statuses: readonly MuscleStatus[]): string {
  const count = statuses.length;
  if (count === 0) {
    return `<section class="card muscle-status-card" id="muscle-status">
      <div class="splits-head"><h2>Muscle status · 肌肉狀態</h2><p class="muted small">Perfect by default — nothing is assumed sore until you report it.</p></div>
      <p class="muscle-status-clear"><span class="chip muscle-readiness readiness-steady">All perfect</span> <span class="muted small">Every muscle is in perfect condition, and that is what the coach is told. Report from a run below, or tap a muscle on the figure, and a dated status appears here that fades on its own.</span></p>
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
  const worstName = worstRow === null ? "" : `worst: ${escapeHtml(muscleShortName(worstRow.muscleId))} · ${LEVEL_CHIP[worstRow.level].label.toLowerCase()}`;
  const allBetter = count >= 2
    ? `<form method="post" action="/muscle/status" class="status-allbetter-form"><input type="hidden" name="action" value="resolve-all"><button class="btn ghost" type="submit">Everything's better</button></form>`
    : "";
  const summary = statuses
    .map((status) => `${muscleShortName(status.muscleId)} ${status.current}/10${status.hold ? " (held)" : ""}`)
    .join(", ");
  const askCoach = `<button type="button" class="coach-ask" data-coach-message="${escapeHtml(`My muscles today: ${summary} — how should that shape my next few days?`)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-muscles", source: "muscle-tab" }))}">Ask coach about this status · 問問教練</button>`;
  return `<section class="card muscle-status-card" id="muscle-status">
    <div class="splits-head">
      <h2>Muscle status · 肌肉狀態 <span class="attention-badge" role="status" aria-label="${count} muscle${count === 1 ? "" : "s"} need attention">${count}</span></h2>
      <p class="muted small">Live levels computed from your reports — each one fades on its own over about ${MUSCLE_STATUS_WINDOW_DAYS} days, ${worstName.length === 0 ? "" : `${worstName} · `}hold one to keep it, or mark it better when it is.</p>
    </div>
    <ul class="muscle-status-list">${statuses.map(statusRowHtml).join("")}</ul>
    <div class="review-actions">${allBetter}${askCoach}</div>
  </section>`;
}

/** One reading row: the muscle, the tag line, the level chip and the guidance paragraph. */
function readingRowHtml(tag: { muscleId: string; soreness: number; conditions: readonly string[]; side: string }): string {
  const muscle = getMuscle(tag.muscleId);
  if (muscle === undefined) return "";
  const reading = readMuscleTag(tag as Parameters<typeof readMuscleTag>[0]);
  return `<li class="muscle-reading">
    <div class="muscle-reading-head"><strong>${escapeHtml(muscle.name)}</strong><span class="chip muscle-tagline">${escapeHtml(tagLine(tag))}</span>${levelChip(reading.level)}</div>
    <p class="muted small">${escapeHtml(reading.guidance)}</p>
  </li>`;
}

function readingsSection(checkIn: MuscleCheckIn): string {
  const readiness = readinessForCheckIn(checkIn.muscles);
  const rows = checkIn.muscles.map(readingRowHtml).join("");
  const linked = checkIn.activityId === null
    ? ""
    : ` · about <a href="/activity/${encodeURIComponent(checkIn.activityId)}">the linked run</a>`;
  const note = checkIn.note === null ? "" : `<p class="muted small">Your note: “${escapeHtml(checkIn.note)}”</p>`;
  const askCoach = `<button type="button" class="coach-ask" data-coach-message="${escapeHtml(`I checked in on my muscles today (${summarizeCheckIn(checkIn)}) — how should that shape my next few days?`)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-muscles", source: "muscle-tab" }))}">Ask coach about this check-in · 問問教練</button>`;
  return `<section class="card muscle-reading-card" id="latest-reading">
    <div class="muscle-reading-head-row"><h2>Latest check-in · 最新回報</h2>${readinessChipHtml(readiness)}</div>
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
function careSection(checkIn: MuscleCheckIn): string {
  const entries = careEntriesForCheckIn(checkIn.muscles);
  if (entries.length === 0) return "";
  const blocks = entries.map(({ tag, reading }) => {
    const muscle = getMuscle(tag.muscleId);
    const name = muscle?.name ?? tag.muscleId;
    const note = `Muscle check-in ${checkIn.day}: ${tagLine(tag)}`;
    const isUrgent = reading.level === "urgent";
    const stateKey: CoachStateKey = isUrgent ? "medical_red_flag" : "pain_injury";
    const offer = stateOfferForm(
      stateKey,
      isUrgent ? 7 : 21,
      note,
      isUrgent ? "Set the medical red-flag state" : "Set the pain/injury state",
    );
    const ask = `<button type="button" class="coach-ask" data-coach-message="${escapeHtml(`My ${name} is ${tagLine(tag)} after training — what should I do?`)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "review-muscles", muscleId: tag.muscleId, source: "muscle-tab" }))}">Ask coach about my ${escapeHtml(name.toLowerCase())}</button>`;
    return `<li class="muscle-reading care">
      <div class="muscle-reading-head"><strong>${escapeHtml(name)}</strong>${levelChip(reading.level)}</div>
      <p class="muted small">${escapeHtml(reading.guidance)}</p>
      <div class="review-actions">${offer}${ask}</div>
    </li>`;
  }).join("");
  return `<section class="card muscle-care-card">
    <h2>Needs care first</h2>
    <p class="muted small">These tags read as more than training soreness. The state offer switches on the existing guardrail — no intensity or racing while it is active, and a clinician line in the coach's advice. You can resolve it from the <a href="/coach-states">coaching states</a> page.</p>
    <ul class="muscle-reading-list">${blocks}</ul>
  </section>`;
}

function drillSection(checkIn: MuscleCheckIn): string {
  const cards = drillCardsForCheckIn(checkIn.muscles);
  if (cards.length === 0) return "";
  const cardHtml = cards.map((card) => {
    const drills = card.drills
      .map((drill) => `<li><span class="chip drill-cat drill-${drill.category}">${drill.category}</span><strong>${escapeHtml(drill.name)}</strong><span class="muted small">${escapeHtml(drill.how)}</span></li>`)
      .join("");
    const ask = `<button type="button" class="coach-ask" data-coach-send="false" data-coach-message="${escapeHtml(`Can we work a short ${card.level === "heavy" ? "easy recovery" : "mobility and activation"} session for my ${card.muscleName.toLowerCase()} into this week?`)}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "plan", source: "muscle-tab" }))}">Ask the coach to work this in</button>`;
    return `<article class="muscle-drill-card">
      <div class="muscle-reading-head"><strong>${escapeHtml(card.muscleName)}</strong>${levelChip(card.level)}</div>
      <p class="muted small">${escapeHtml(card.guidance)}</p>
      <ul class="muscle-drills">${drills}</ul>
      <div class="review-actions">${ask}</div>
    </article>`;
  }).join("");
  return `<section class="card muscle-drill-section"><div class="splits-head"><h2>Suggested drills · 建議動作</h2><p class="muted small">Matched to what you tagged, at the level your muscles are at today.</p></div><div class="muscle-drill-grid">${cardHtml}</div></section>`;
}

function historySection(history: readonly MuscleCheckIn[], dayCheckIn: MuscleCheckIn | null): string {
  const rows = history
    .filter((checkIn) => checkIn !== dayCheckIn)
    .slice(0, 8)
    .map((checkIn) => {
      const worst = checkIn.muscles.map((tag) => readMuscleTag(tag).level).reduce((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a), "ok" as MuscleTagLevel);
      return `<li><a class="chip" href="/muscle?day=${escapeHtml(checkIn.day)}">${escapeHtml(formatDayLabel(checkIn.day))}</a><span class="muted small">${escapeHtml(summarizeCheckIn(checkIn))}</span>${levelChip(worst)}</li>`;
    })
    .join("");
  const list = rows.length === 0
    ? `<p class="muted small">No other check-ins yet. Each saved check-in appears here, so you can see how a muscle settled over the week.</p>`
    : `<ul class="muscle-history">${rows}</ul>`;
  return `<section class="card"><h2>Recent check-ins</h2>${list}</section>`;
}

const LEVEL_RANK: Readonly<Record<MuscleTagLevel, number>> = { ok: 0, sore: 1, heavy: 2, watch: 3, warning: 4, urgent: 5 };

function trainingSection(rows: readonly MuscleTrainingRow[]): string {
  if (rows.length === 0) {
    return `<section class="card"><h2>From your training</h2><p class="muted small">No recorded runs in the last two weeks. Log a run or sync Garmin, and the muscles it worked will show up here for one-tap tagging.</p></section>`;
  }
  const items = rows.map((row) => {
    const chips = [
      ...row.work.primary.map((id) => `<span class="chip worked-chip primary">${escapeHtml(getMuscle(id)?.name ?? id)}</span>`),
      ...row.work.secondary.map((id) => `<span class="chip worked-chip secondary">${escapeHtml(getMuscle(id)?.name ?? id)}</span>`),
    ].join("");
    return `<li class="training-row">
      <div class="training-row-main"><strong>${escapeHtml(row.title)}</strong><span class="muted small">${escapeHtml(formatDayLabel(row.day))}</span></div>
      <div class="training-row-chips">${chips}</div>
      <div class="training-row-actions"><a class="chip" href="/muscle?activity=${encodeURIComponent(row.activityId)}" data-tag-activity="${escapeHtml(row.activityId)}">Tag these muscles</a><a class="chip" href="/activity/${encodeURIComponent(row.activityId)}">Detail</a></div>
    </li>`;
  }).join("");
  return `<section class="card"><div class="splits-head"><h2>From your training · 最近訓練</h2><p class="muted small">What your recent runs worked — primary movers first. One tap starts a check-in on those muscles.</p></div><ul class="training-list">${items}</ul></section>`;
}

/** The list tab's content: the figure's text alternative and the no-script selection path. */
function muscleListSection(prefillIds: readonly string[]): string {
  const groups = new Map<string, string[]>();
  for (const muscle of MUSCLE_CATALOG) {
    const checked = prefillIds.includes(muscle.id) ? " checked" : "";
    const options = groups.get(muscle.group) ?? [];
    options.push(`<li><label><input type="checkbox" class="muscle-check" name="muscleIds" value="${escapeHtml(muscle.id)}"${checked}> ${escapeHtml(muscle.name)}</label><span class="muted small">${escapeHtml(muscle.meaning)}</span></li>`);
    groups.set(muscle.group, options);
  }
  const groupHtml = [...groups.entries()]
    .map(([group, items]) => `<li><strong>${escapeHtml(MUSCLE_GROUP_LABELS[group as keyof typeof MUSCLE_GROUP_LABELS] ?? group)}</strong><ul class="muscle-list-items">${items.join("")}</ul></li>`)
    .join("");
  return `<div class="muscle-list-tab"><p class="muted small">The same muscles as the figure, as checkboxes — the keyboard and no-JavaScript path. Without script these plus the quick set below are the whole form.</p><ul class="muscle-list-groups">${groupHtml}</ul></div>`;
}

function formSection(input: MusclePageInput): string {
  const activityOptions = input.activityOptions.map(
    (option) => `<option value="${escapeHtml(option.activityId)}"${option.activityId === input.prefillActivityId ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
  ).join("");
  const anchors = SORENESS_ANCHORS.map((anchor) => `${anchor.value} ${anchor.label}`).join(" · ");
  const conditionBoxes = MUSCLE_CONDITIONS
    .map((condition) => `<label class="quick-condition"><input type="checkbox" class="quick-condition-input" name="conditions" value="${condition.key}"> ${condition.label}</label>`)
    .join("");
  const sorenessOptions = Array.from({ length: 11 }, (_, value) => `<option value="${value}"${value === 5 ? " selected" : ""}>${value} · ${sorenessLabel(value)}</option>`).join("");
  const focusNote = input.focusMuscleId === null
    ? ""
    : `<p class="ok" role="status">Updating <strong>${escapeHtml(getMuscle(input.focusMuscleId)?.name ?? input.focusMuscleId)}</strong> — set how it feels today and save.</p>`;
  const prefillNote = input.prefillActivityId === null
    ? ""
    : `<p class="ok" role="status">Selected the muscles from that run — set how each one feels and save.</p>`;
  const oldRunNote = input.oldRunId === null
    ? ""
    : `<p class="ok" role="status">That run is older than the 14-day check-in window, so the report is for <strong>today</strong> — its muscles are selected below.</p>`;
  // The figure paints today's status heat; selecting a muscle takes the ember, hovering names it.
  const regions: Record<string, MuscleViewerRegion> = {};
  for (const status of input.statuses) {
    regions[status.muscleId] = {
      fill: sorenessFill(status.current),
      ...(status.level === "warning" || status.level === "urgent" ? { dashed: true } : {}),
      note: `${status.current}/10 ${sorenessLabel(status.current).toLowerCase()} today${status.hold ? " · held" : ""}`,
    };
  }
  const panel = renderMuscleViewerPanel({
    panelId: "muscle",
    regions,
    mode: { kind: "bridge", bridgeName: "__muscleTabBridge" },
    listHtml: muscleListSection(input.prefillMuscleIds),
    figureTabLabel: "3D figure",
    listTabLabel: "Muscle list",
    tablistLabel: "3D muscle figure or muscle list",
    viewerLabel: "3D muscle figure. Drag to rotate, scroll or pinch to zoom, click a muscle to select it.",
    viewerNote: `Drag to rotate · scroll or pinch to zoom · click a muscle to tag it. The figure turns slowly while you decide; <strong>Pause</strong> holds it still. Your live muscle status paints the heat you see on the muscles.`,
    noScriptHint: "The 3D figure needs JavaScript and WebGL — the Muscle list tab carries every muscle.",
    legendHtml: renderMuscleLegend(),
    height: "tall",
  });
  return `<section class="card muscle-checkin-card" id="check-in">
    <div class="splits-head"><h2>How do your muscles feel today? · 今天肌肉感覺如何</h2><p class="muted small">Tap a muscle on the figure, then set its soreness and tags. It takes under a minute.</p></div>
    ${focusNote}
    ${prefillNote}
    ${oldRunNote}
    <form method="post" action="/muscle/checkin" id="muscle-form" class="muscle-form">
      <div class="muscle-form-row">
        <label for="muscle-day">Day</label>
        <input id="muscle-day" name="day" type="date" value="${escapeHtml(input.formDay)}" min="${escapeHtml(input.earliestDay)}" max="${escapeHtml(input.today)}" required>
        <label for="muscle-activity">About which run? <span class="muted small">(optional)</span></label>
        <select id="muscle-activity" name="activityId"><option value="">Not linked to a run</option>${activityOptions}</select>
      </div>
      <div class="muscle-workspace">
        <div class="muscle-map-col">
          ${panel}
        </div>
        <div class="muscle-editor-col">
          <div id="muscle-tray" class="muscle-tray" aria-label="Selected muscles"></div>
          <div id="muscle-editor" class="muscle-editor" aria-live="polite"><p class="muted small muscle-editor-hint">Select a muscle on the figure or in the list to tag it.</p></div>
        </div>
      </div>
      <fieldset class="muscle-quick">
        <legend>Quick set — applied to every selected muscle</legend>
        <div class="muscle-quick-row">
          <label for="quick-soreness">Soreness</label>
          <select id="quick-soreness" name="soreness">${sorenessOptions}</select>
          <span class="muscle-quick-conditions">${conditionBoxes}</span>
          <label for="quick-side">Side</label>
          <select id="quick-side" name="side"><option value="both" selected>Both sides</option><option value="left">Left</option><option value="right">Right</option></select>
          <label for="quick-warmup">With warm-up</label>
          <select id="quick-warmup" name="warmUp"><option value="" selected>—</option><option value="eases">Eases</option><option value="same">Same</option><option value="worse">Worse</option></select>
          <button type="button" class="btn ghost" id="quick-apply">Apply to selected</button>
        </div>
        <p class="muted small">${escapeHtml(anchors)}</p>
        <label class="quick-hold" for="quick-hold"><input type="checkbox" id="quick-hold" name="hold" value="1"> <strong>Keep these levels until I change them</strong> <span class="muted small">(skip the auto-fade — for something that is not settling on its own)</span></label>
      </fieldset>
      <label for="muscle-note">Note for the coach <span class="muted small">(optional)</span></label>
      <input id="muscle-note" name="note" maxlength="200" autocomplete="off" placeholder="e.g. calves tight since Thursday's hills">
      <input type="hidden" name="musclesJson" id="muscle-json" value="">
      <div class="review-actions"><button class="btn" type="submit">Save check-in · 儲存回報</button><button type="button" class="btn ghost" id="muscle-clear">Clear selection</button></div>
    </form>
  </section>`;
}

function safetySection(): string {
  return `<section class="card muscle-safety"><h2>Honest notes about this page</h2>
    <ul class="muscle-safety-list">
      <li>The readings are guidance, not a diagnosis. The app cannot tell a strain from normal soreness — that is exactly why warning levels end in "see a clinician".</li>
      <li>Normal soreness peaks 24-72 h after a session and eases once you are moving; it is not damage, and its absence never means a wasted session.</li>
      <li>Severe soreness with swelling, weakness or dark tea-coloured urine means seeking medical care now — that pattern (rhabdomyolysis) needs a blood test, not a drill.</li>
      <li>Everything here is private to your account, joins the coach's facts when you ask, and is included in your <a href="/export.json">data export</a>.</li>
    </ul>
  </section>`;
}

/** The inline editor script: selection on the figures, the tray, the per-muscle panel, the quick set and the submit. */
function muscleScript(input: MusclePageInput): string {
  const muscleData = MUSCLE_CATALOG.map((muscle) => ({
    id: muscle.id,
    name: muscle.name,
    group: muscle.group,
    view: muscle.view,
    function: muscle.function,
    issues: muscle.issues,
    meaning: muscle.meaning,
    recovery: muscle.recovery,
    drills: muscle.drills,
  }));
  const conditions = MUSCLE_CONDITIONS.map((condition) => ({ key: condition.key, label: condition.label }));
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


export function renderMusclePage(input: MusclePageInput, deps: MusclePageDeps): string {
  const savedBanner = input.saved
    ? `<p class="banner ok" role="status">Check-in saved · 回報已儲存. It is now today's muscle status, and the coach sees the same facts.</p>`
    : "";
  const statusSavedBanner = input.statusSaved
    ? `<p class="banner ok" role="status">Muscle status updated · 狀態已更新.</p>`
    : "";
  const errorBanner = input.errorCode === null ? "" : `<p class="banner error" role="alert">${escapeHtml(errorTextFor(input.errorCode) ?? "The check-in could not be saved.")}</p>`;
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
      : `<p class="muted small">Now: <a href="#muscle-status"><span class="chip muscle-attention-chip">${count} muscle${count === 1 ? "" : "s"} need attention</span></a>${worstRow === null || worst === null ? "" : ` — worst: ${escapeHtml(muscleShortName(worstRow.muscleId))}, ${LEVEL_CHIP[worst].label.toLowerCase()}`}</p>`;
  const readiness = input.dayCheckIn === null ? "" : readinessForCheckIn(input.dayCheckIn.muscles);
  const readinessLine = input.dayCheckIn === null
    ? ""
    : `<p class="muted small">Latest report: ${escapeHtml(formatDayLabel(input.dayCheckIn.day))} · ${readinessChipHtml(readiness)}</p>`;
  const readingSections = input.dayCheckIn === null
    ? `<section class="card"><h2>Latest check-in</h2><p class="muted small">No check-ins yet. Tag a few muscles above and save — the reading (normal soreness, watch, or needs care) appears here, with drills matched to what you tagged.</p></section>`
    : `${careSection(input.dayCheckIn)}${readingsSection(input.dayCheckIn)}${drillSection(input.dayCheckIn)}`;
  const body = `<header class="page-head"><p class="eyebrow">Muscles · 肌肉回報</p>
    <h1>Muscle check-in</h1>
    <p class="muted">A private map of how your muscles feel, after your runs and between them. Report something and it becomes a dated status that fades on its own — the heat below is that status, live; the coach reads the same facts when you ask, and never diagnoses.</p>
    ${attentionLine}
    ${readinessLine}</header>
    ${savedBanner}
    ${statusSavedBanner}
    ${errorBanner}
    ${statusSection(input.statuses)}
    ${formSection(input)}
    ${trainingSection(input.trainingRows)}
    ${readingSections}
    ${historySection(input.history, input.dayCheckIn)}
    ${safetySection()}
    ${muscleScript(input)}`;
  return deps.layout("Muscles", body, input.user, "muscle");
}

/** The attention chip the calendar shows while muscles are in a special (non-perfect) status. */
export function muscleCalendarChip(statuses: readonly MuscleStatus[]): string | null {
  const count = statuses.length;
  if (count === 0) return null;
  const worst = worstStatusLevel(statuses);
  const label =
    worst === "urgent"
      ? "Muscles · care now"
      : worst === "warning" || worst === "heavy"
        ? "Muscles · needs care"
        : `Muscles · ${count} sore`;
  return `<a class="chip muscle-calendar-chip" href="/muscle" title="Your current muscle status needs attention">${escapeHtml(label)}</a>`;
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
): string {
  const workedIds = [...work.primary, ...work.secondary];
  const active = statuses.filter((status) => workedIds.includes(status.muscleId));
  // The figure paints the run's footprint first, then today's status heat wins where a muscle has one.
  const regions: Record<string, MuscleViewerRegion> = {};
  for (const id of work.primary) regions[id] = { fill: "#f28034", note: "primary mover" };
  for (const id of work.secondary) regions[id] = { fill: "#fbd5a8", note: "helper muscle" };
  for (const status of active) {
    const role = regions[status.muscleId]?.note ?? "";
    const note = `${status.current}/10 ${sorenessLabel(status.current).toLowerCase()} today${status.hold ? " · held" : ""}${role.length === 0 ? "" : ` · ${role}`}`;
    regions[status.muscleId] = {
      fill: sorenessFill(status.current),
      ...(status.level === "warning" || status.level === "urgent" ? { dashed: true } : {}),
      note,
    };
  }
  const chips = (ids: readonly string[], emphasis: "primary" | "secondary"): string =>
    ids
      .map((id) => `<a class="chip worked-chip ${emphasis}" href="/muscle?focus=${encodeURIComponent(id)}#check-in">${escapeHtml(getMuscle(id)?.name ?? id)}</a>`)
      .join("");
  const primaryLine = chips(work.primary, "primary");
  const secondaryLine = work.secondary.length === 0 ? "" : chips(work.secondary, "secondary");
  const spoken = `Primary muscles: ${work.primary.map((id) => getMuscle(id)?.name ?? id).join(", ")}.${work.secondary.length === 0 ? "" : ` Secondary: ${work.secondary.map((id) => getMuscle(id)?.name ?? id).join(", ")}.`}`;
  const listHtml = `<div class="worked-list-tab"><p class="muted small"><strong>Primary movers</strong></p><div class="muscle-list-chip-row">${primaryLine}</div>${work.secondary.length === 0 ? "" : `<p class="muted small"><strong>Helpers</strong></p><div class="muscle-list-chip-row">${secondaryLine}</div>`}<p class="muted small">${escapeHtml(spoken)}</p></div>`;
  const panel = renderMuscleViewerPanel({
    panelId: "worked",
    regions,
    mode: { kind: "link", href: "/muscle?focus=" },
    listHtml,
    figureTabLabel: "3D figure",
    listTabLabel: "Worked list",
    tablistLabel: "3D muscles worked or worked list",
    viewerLabel: "3D muscle figure of this run. Drag to rotate; click a muscle to report how it feels.",
    viewerNote: "Drag to rotate · scroll or pinch to zoom · click a muscle to report how it feels. Primary movers ember, helpers light; today's soreness heat paints on top.",
    noScriptHint: "The 3D figure needs JavaScript and WebGL — the Worked list tab carries every muscle.",
    height: "compact",
  });
  const statusChips = active
    .map((status) => {
      const name = muscleShortName(status.muscleId);
      const fill = sorenessFill(status.current);
      return `<a class="chip muscle-worked-status" href="/muscle?focus=${encodeURIComponent(status.muscleId)}#check-in" title="Update this muscle"><span class="muscle-attention-dot" style="background:${fill}" aria-hidden="true"></span>${escapeHtml(name)} · ${status.current}/10${status.hold ? " · held" : ""}</a>`;
    })
    .join("");
  const statusLine =
    active.length === 0
      ? ""
      : `<p class="muted small muscle-worked-status-row">From these muscles now: ${statusChips}</p>`;
  const linkedLine = linkedCheckIn === null
    ? ""
    : `<p class="muted small">You reported after this run: <a href="/muscle?day=${escapeHtml(linkedCheckIn.day)}">${escapeHtml(summarizeCheckIn(linkedCheckIn))}</a></p>`;
  return `<section class="card muscles-worked-card"><div class="splits-head"><h2>Muscles worked · 訓練到的肌肉</h2><p class="muted small">Primary movers ember, helpers light — the honest default for this run, not EMG data. Click a muscle to report how it feels.</p></div>${panel}${statusLine}${linkedLine}<div class="review-actions"><a class="btn ghost" href="/muscle?activity=${encodeURIComponent(activityId)}">Check in these muscles · 回報感覺</a></div></section>`;
}
