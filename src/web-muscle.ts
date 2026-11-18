/**
 * The Muscle tab: one page where the runner checks in on their muscles and reads what the tags mean.
 *
 * Everything with state is server-rendered first — the current heat map, the per-muscle readings, the drill
 * cards, the history — so the page is honest without script. The inline script then upgrades the same form into
 * a per-muscle tag editor over the two figures; the grouped checkbox list and the quick-set controls stay the
 * no-script submission path, so both worlds post the same record shape.
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
  readinessForCheckIn,
  readMuscleTag,
  sorenessFill,
  sorenessLabel,
  summarizeCheckIn,
  type MuscleCheckIn,
  type MuscleTagLevel,
  type MuscleWork,
} from "./muscles";
import { MUSCLE_RIG, RIG_BODY, type RigShape } from "./muscle-rig";
import { renderMuscleFigure, renderMuscleLegend, renderWorkedPair } from "./muscle-map";
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
  errorCode: string | null;
  /** The check-in the heat map and readings show: the viewed day's, else the latest. */
  dayCheckIn: MuscleCheckIn | null;
  history: readonly MuscleCheckIn[];
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

/** The current-state fills for the heat map: severity colour, dashed stroke for care-needed tags. */
function heatFillsFor(checkIn: MuscleCheckIn | null): Readonly<Record<string, { fill: string; dashed?: boolean }>> {
  if (checkIn === null) return {};
  const fills: Record<string, { fill: string; dashed?: boolean }> = {};
  for (const tag of checkIn.muscles) {
    const reading = readMuscleTag(tag);
    fills[tag.muscleId] = {
      fill: sorenessFill(tag.soreness),
      ...(reading.level === "warning" || reading.level === "urgent" ? { dashed: true } : {}),
    };
  }
  return fills;
}

function heatAriaLabels(checkIn: MuscleCheckIn | null): Readonly<Record<string, string>> {
  if (checkIn === null) return {};
  const labels: Record<string, string> = {};
  for (const tag of checkIn.muscles) {
    const muscle = getMuscle(tag.muscleId);
    if (muscle === undefined) continue;
    const reading = readMuscleTag(tag);
    const care = reading.level === "warning" || reading.level === "urgent" ? ", needs care" : "";
    labels[tag.muscleId] = `${muscle.name}, ${tagLine(tag)}${care}`;
  }
  return labels;
}

function readinessChipHtml(readiness: string): string {
  return `<span class="chip muscle-readiness ${READINESS_CHIP[readiness] ?? "readiness-steady"}">${escapeHtml(READINESS_LABELS[readiness as keyof typeof READINESS_LABELS] ?? readiness)}</span>`;
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

/** The grouped checkbox list: the figure's text alternative and the no-script selection path. */
function muscleListSection(): string {
  const groups = new Map<string, string[]>();
  for (const muscle of MUSCLE_CATALOG) {
    const options = groups.get(muscle.group) ?? [];
    options.push(`<li><label><input type="checkbox" class="muscle-check" name="muscleIds" value="${escapeHtml(muscle.id)}"> ${escapeHtml(muscle.name)}</label><span class="muted small">${escapeHtml(muscle.meaning)}</span></li>`);
    groups.set(muscle.group, options);
  }
  const groupHtml = [...groups.entries()]
    .map(([group, items]) => `<li><strong>${escapeHtml(MUSCLE_GROUP_LABELS[group as keyof typeof MUSCLE_GROUP_LABELS] ?? group)}</strong><ul class="muscle-list-items">${items.join("")}</ul></li>`)
    .join("");
  return `<details class="muscle-list-details" id="muscle-list"><summary>All muscles — list view (keyboard-friendly)</summary><p class="muted small">The same muscles as the map, as checkboxes. Without JavaScript these plus the quick set below are the whole form.</p><ul class="muscle-list-groups">${groupHtml}</ul></details>`;
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
  const selectedFigureIds = input.prefillMuscleIds;
  const fills = heatFillsFor(input.dayCheckIn);
  const ariaLabels = heatAriaLabels(input.dayCheckIn);
  const figures = [
    renderMuscleFigure("front", { fills, ariaLabels, selected: selectedFigureIds, viewLabel: "Front view" }),
    renderMuscleFigure("back", { fills, ariaLabels, selected: selectedFigureIds, viewLabel: "Back view" }),
  ].join("");
  const prefillNote = input.prefillActivityId === null
    ? ""
    : `<p class="ok" role="status">Selected the muscles from that run — set how each one feels and save.</p>`;
  return `<section class="card muscle-checkin-card" id="check-in">
    <div class="splits-head"><h2>How do your muscles feel today? · 今天肌肉感覺如何</h2><p class="muted small">Tap a muscle on the figure, then set its soreness and tags. It takes under a minute.</p></div>
    ${prefillNote}
    <form method="post" action="/muscle/checkin" id="muscle-form" class="muscle-form">
      <div class="muscle-form-row">
        <label for="muscle-day">Day</label>
        <input id="muscle-day" name="day" type="date" value="${escapeHtml(input.formDay)}" min="${escapeHtml(input.earliestDay)}" max="${escapeHtml(input.today)}" required>
        <label for="muscle-activity">About which run? <span class="muted small">(optional)</span></label>
        <select id="muscle-activity" name="activityId"><option value="">Not linked to a run</option>${activityOptions}</select>
      </div>
      <div class="muscle-workspace">
        <div class="muscle-map-col">
          <div class="muscle-viewer-wrap">
            <div id="muscle-viewer" class="muscle-viewer" aria-label="3D muscle figure. Drag to rotate, scroll or pinch to zoom, click a muscle to select it."></div>
            <div class="viewer-controls">
              <button type="button" class="chip" id="viewer-rotation" aria-pressed="true">Pause rotation</button>
              <button type="button" class="chip" id="viewer-front">Front</button>
              <button type="button" class="chip" id="viewer-back">Back</button>
              <button type="button" class="chip" id="viewer-reset">Reset</button>
            </div>
            <div id="viewer-tooltip" class="viewer-tooltip" role="status" hidden></div>
            <p class="muted small muscle-viewer-note">Drag to rotate · scroll or pinch to zoom · click a muscle to tag it. The figure turns slowly while you decide; <strong>Pause</strong> holds it still. A recent check-in paints the heat you see on the muscles.</p>
          </div>
          ${renderMuscleLegend()}
          <details class="muscle-2d-fallback" id="muscle-2d">
            <summary>Flat figure (no 3D needed) · 平面圖</summary>
            <p class="muted small">The same muscles front and back. This view works without JavaScript or WebGL, and its regions are plain buttons for keyboard users who prefer them.</p>
            <div class="muscle-figures">${figures}</div>
          </details>
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
      </fieldset>
      ${muscleListSection()}
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

    for (const node of document.querySelectorAll('.muscle-region')) {
      node.addEventListener('click', () => { toggle(node.dataset.muscle || ''); });
      node.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle(node.dataset.muscle || '');
      });
    }
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
    // The 3D viewer drives selection through this bridge: it calls toggle(), and reads tagOf/has to repaint.
    window.__muscleTabBridge = { toggle, tagOf, has: (id) => state.has(id) };
  })();
  </script>`;
}

/**
 * The 3D muscle viewer: three.js over the rig data, physically rendered, with the same selection state as the
 * flat figure. It runs as a module script behind an import map that resolves the vendored builds, and it degrades
 * to the flat figure (the details opens itself) when WebGL cannot start. Selection flows through the classic
 * script's bridge, so the tray, the editor, the checkbox list, the 2D figure and the 3D figure stay in step.
 */
function muscleViewerScript(input: MusclePageInput): string {
  const rig = {
    body: RIG_BODY.map((part) => ({ mirror: part.mirror, shape: part.shape as RigShape })),
    muscles: MUSCLE_RIG.map((entry) => ({ id: entry.muscleId, mirror: entry.mirror, shapes: entry.shapes })),
  };
  const heat: Record<string, { fill: string; dashed?: boolean }> = {};
  for (const [id, value] of Object.entries(heatFillsFor(input.dayCheckIn))) heat[id] = value;
  const names: Record<string, string> = {};
  for (const muscle of MUSCLE_CATALOG) names[muscle.id] = muscle.name;
  return `<script type="importmap">{"imports":{"three":"/static/three.module.js"}}</script>
  <script type="module">
  import * as THREE from 'three';
  import { OrbitControls } from '/static/orbit-controls.js';
  (() => {
    const RIG = ${jsonForScript(rig)};
    const HEAT = ${jsonForScript(heat)};
    const NAMES = ${jsonForScript(names)};
    const container = document.getElementById('muscle-viewer');
    const tooltip = document.getElementById('viewer-tooltip');
    const rotationButton = document.getElementById('viewer-rotation');
    const bridge = window.__muscleTabBridge;
    if (container === null || tooltip === null || bridge === undefined) return;
    const showFallback = (reason) => {
      container.textContent = reason;
      container.classList.add('muscle-viewer-failed');
      const fallback = document.getElementById('muscle-2d');
      if (fallback !== null) fallback.open = true;
    };
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (error) {
      showFallback('The 3D figure could not start here; the flat figure below carries every muscle.');
      return;
    }
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
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

    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#fbf1e3');
    scene.fog = new THREE.Fog('#fbf1e3', 9, 18);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    const defaultView = { radius: 7.4, polar: 1.42, azimuth: 0.5 };
    const setCamera = (radius, polar, azimuth) => {
      camera.position.set(
        Math.sin(polar) * Math.sin(azimuth) * radius,
        Math.cos(polar) * radius + 2.35,
        Math.sin(polar) * Math.cos(azimuth) * radius,
      );
      camera.lookAt(0, 2.35, 0);
    };
    setCamera(defaultView.radius, defaultView.polar, defaultView.azimuth);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2.35, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 3.6;
    controls.maxDistance = 11;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.autoRotateSpeed = 1.0;
    let running = !reduced;
    controls.autoRotate = running;
    if (rotationButton !== null) {
      rotationButton.setAttribute('aria-pressed', running ? 'true' : 'false');
      rotationButton.textContent = running ? 'Pause rotation' : 'Play rotation';
      rotationButton.addEventListener('click', () => {
        running = !running;
        controls.autoRotate = running;
        rotationButton.setAttribute('aria-pressed', running ? 'true' : 'false');
        rotationButton.textContent = running ? 'Pause rotation' : 'Play rotation';
      });
    }

    scene.add(new THREE.HemisphereLight(0xfff4e4, 0xd9c2a8, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(3.6, 6.4, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = 0;
    key.shadow.bias = -0.0008;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
    fill.position.set(-4.2, 3.2, 2.4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffb37a, 0.85);
    rim.position.set(-1.2, 4.4, -5.2);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 48),
      new THREE.MeshStandardMaterial({ color: '#f2dfc4', roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: '#c8b193',
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0.25,
      clearcoatRoughness: 0.55,
      sheen: 0.4,
      sheenColor: new THREE.Color('#ffe6c8'),
    });
    const muscleMatBase = {
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.5,
      sheen: 0.3,
      sheenColor: new THREE.Color('#ffd9b8'),
    };

    const figure = new THREE.Group();
    scene.add(figure);
    const buildShape = (shape, mirrored, material) => {
      const at = shape.at;
      let geometry;
      if (shape.kind === 'sphere') geometry = new THREE.SphereGeometry(shape.radius, 28, 20);
      else if (shape.kind === 'capsule') geometry = new THREE.CapsuleGeometry(shape.radius, shape.length, 6, 18);
      else if (shape.kind === 'box') geometry = new THREE.BoxGeometry(shape.size[0], shape.size[1], shape.size[2]);
      else {
        const points = shape.profile.map((point) => new THREE.Vector2(point[0], point[1]));
        const top = shape.profile[shape.profile.length - 1];
        points.push(new THREE.Vector2(0, top[1] + 0.03));
        geometry = new THREE.LatheGeometry(points, 44);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(mirrored ? -at[0] : at[0], at[1], at[2]);
      if (shape.scale !== undefined) mesh.scale.set(shape.scale[0], shape.scale[1], shape.scale[2]);
      if (shape.scaleZ !== undefined) mesh.scale.z = shape.scaleZ;
      if (shape.tilt !== undefined) mesh.rotation.z = (mirrored ? -1 : 1) * shape.tilt * Math.PI / 180;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    for (const part of RIG.body) {
      figure.add(buildShape(part.shape, false, bodyMat));
      if (part.mirror) figure.add(buildShape(part.shape, true, bodyMat));
    }

    const muscleGroups = new Map();
    const muscleMeshes = [];
    for (const muscle of RIG.muscles) {
      const material = new THREE.MeshPhysicalMaterial({ ...muscleMatBase, color: '#cfa173' });
      const group = new THREE.Group();
      group.userData.muscleId = muscle.id;
      const addShapes = (mirrored) => {
        for (const shape of muscle.shapes) {
          const mesh = buildShape(shape, mirrored, material);
          mesh.userData.muscleId = muscle.id;
          group.add(mesh);
          muscleMeshes.push(mesh);
        }
      };
      addShapes(false);
      if (muscle.mirror) addShapes(true);
      figure.add(group);
      muscleGroups.set(muscle.id, { group, material });
    }

    let hoveredId = null;
    const syncMuscle = (id, tag) => {
      const entry = muscleGroups.get(id);
      if (entry === undefined) return;
      const heat = HEAT[id];
      const selected = bridge.has(id);
      const warning = heat !== undefined && heat.dashed === true;
      const color = tag !== null && heat !== undefined ? heat.fill : selected ? '#ff5a1f' : '#cfa173';
      entry.material.color.set(color);
      if (selected) {
        entry.material.emissive.set('#ff5a1f');
        entry.material.emissiveIntensity = 0.4;
      } else if (warning) {
        entry.material.emissive.set('#c03a2b');
        entry.material.emissiveIntensity = 0.32;
      } else if (id === hoveredId) {
        entry.material.emissive.set('#ff5a1f');
        entry.material.emissiveIntensity = 0.18;
      } else {
        entry.material.emissive.set('#000000');
        entry.material.emissiveIntensity = 0;
      }
    };
    window.__muscleViewer = { syncMuscle };
    for (const id of Object.keys(NAMES)) syncMuscle(id, bridge.tagOf(id) ?? null);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(muscleMeshes, false);
      return hits.length > 0 ? hits[0].object.userData.muscleId : null;
    };
    let downAt = null;
    renderer.domElement.addEventListener('pointerdown', (event) => {
      downAt = { x: event.clientX, y: event.clientY };
    });
    renderer.domElement.addEventListener('pointerup', (event) => {
      if (downAt === null) return;
      const moved = Math.abs(event.clientX - downAt.x) + Math.abs(event.clientY - downAt.y);
      downAt = null;
      if (moved > 7) return;
      const id = pick(event);
      if (id === null || id === undefined) return;
      bridge.toggle(id);
      tooltip.hidden = true;
    });
    let moveAt = 0;
    renderer.domElement.addEventListener('pointermove', (event) => {
      const now = Date.now();
      if (now - moveAt < 60) return;
      moveAt = now;
      const id = pick(event);
      if (id === hoveredId) {
        if (id !== null && id !== undefined) positionTip(event);
        return;
      }
      const previous = hoveredId;
      hoveredId = id === undefined ? null : id;
      if (previous !== null) syncMuscle(previous, bridge.tagOf(previous) ?? null);
      if (hoveredId === null) {
        tooltip.hidden = true;
        renderer.domElement.style.cursor = 'grab';
        return;
      }
      syncMuscle(hoveredId, bridge.tagOf(hoveredId) ?? null);
      renderer.domElement.style.cursor = 'pointer';
      const tag = bridge.tagOf(hoveredId) ?? null;
      const heat = HEAT[hoveredId];
      const state = tag === null ? 'not tagged yet' : tag.soreness + '/10 · ' + labelFor(tag.soreness) + (heat !== undefined && heat.dashed === true ? ' · needs care' : '');
      tooltip.textContent = NAMES[hoveredId] + ' — ' + state;
      positionTip(event);
      tooltip.hidden = false;
    });
    renderer.domElement.addEventListener('pointerleave', () => {
      const previous = hoveredId;
      hoveredId = null;
      if (previous !== null) syncMuscle(previous, bridge.tagOf(previous) ?? null);
      tooltip.hidden = true;
    });
    const positionTip = (event) => {
      const rect = container.getBoundingClientRect();
      const x = Math.min(event.clientX - rect.left + 14, rect.width - 170);
      const y = event.clientY - rect.top + 14;
      tooltip.style.left = Math.max(4, x) + 'px';
      tooltip.style.top = Math.max(4, y) + 'px';
    };

    // Front, Back and Reset tween the camera once around the figure, then hand control back.
    let orbitTween = null;
    const tweenTo = (azimuth) => {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      let from = spherical.theta;
      let to = azimuth;
      while (to - from > Math.PI) to -= Math.PI * 2;
      while (to - from < -Math.PI) to += Math.PI * 2;
      orbitTween = { fromTheta: from, toTheta: to, fromPhi: spherical.phi, toPhi: defaultView.polar, fromR: spherical.radius, toR: defaultView.radius, at: 0 };
    };
    const front = document.getElementById('viewer-front');
    const back = document.getElementById('viewer-back');
    const reset = document.getElementById('viewer-reset');
    if (front !== null) front.addEventListener('click', () => tweenTo(0));
    if (back !== null) back.addEventListener('click', () => tweenTo(Math.PI));
    if (reset !== null) reset.addEventListener('click', () => tweenTo(defaultView.azimuth));

    const clock = new THREE.Clock();
    const animate = () => {
      requestAnimationFrame(animate);
      if (document.hidden) return;
      const elapsed = clock.getElapsedTime();
      if (orbitTween !== null) {
        orbitTween.at = Math.min(1, orbitTween.at + 0.035);
        const eased = orbitTween.at * orbitTween.at * (3 - 2 * orbitTween.at);
        const theta = orbitTween.fromTheta + (orbitTween.toTheta - orbitTween.fromTheta) * eased;
        const phi = orbitTween.fromPhi + (orbitTween.toPhi - orbitTween.fromPhi) * eased;
        const radius = orbitTween.fromR + (orbitTween.toR - orbitTween.fromR) * eased;
        setCamera(radius, phi, theta);
        controls.autoRotate = false;
        if (orbitTween.at >= 1) {
          orbitTween = null;
          controls.autoRotate = running;
        }
      } else if (running) {
        const breathe = 1 + Math.sin(elapsed * 1.7) * 0.008;
        figure.scale.set(breathe, 1, breathe);
        for (const [id, heat] of Object.entries(HEAT)) {
          if (heat.dashed !== true) continue;
          const entry = muscleGroups.get(id);
          if (entry === undefined || bridge.has(id)) continue;
          entry.material.emissiveIntensity = 0.24 + Math.sin(elapsed * 2.6) * 0.14;
        }
        controls.update();
      } else {
        controls.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(container);
    else window.addEventListener('resize', resize);
    resize();
    // A DOM marker the fixture screenshot and the browser check can assert: the 3D viewer really started.
    container.dataset.viewerReady = '1';
  })();
  </script>`;
}

export function renderMusclePage(input: MusclePageInput, deps: MusclePageDeps): string {
  const savedBanner = input.saved
    ? `<p class="banner ok" role="status">Check-in saved · 回報已儲存. The coach now sees it in your facts.</p>`
    : "";
  const errorBanner = input.errorCode === null ? "" : `<p class="banner error" role="alert">${escapeHtml(errorTextFor(input.errorCode) ?? "The check-in could not be saved.")}</p>`;
  const readiness = input.dayCheckIn === null ? "" : readinessForCheckIn(input.dayCheckIn.muscles);
  const readinessLine = input.dayCheckIn === null
    ? ""
    : `<p class="muted small">Latest: ${escapeHtml(formatDayLabel(input.dayCheckIn.day))} · ${readinessChipHtml(readiness)}</p>`;
  const readingSections = input.dayCheckIn === null
    ? `<section class="card"><h2>Latest check-in</h2><p class="muted small">No check-ins yet. Tag a few muscles above and save — the reading (normal soreness, watch, or needs care) appears here, with drills matched to what you tagged.</p></section>`
    : `${careSection(input.dayCheckIn)}${readingsSection(input.dayCheckIn)}${drillSection(input.dayCheckIn)}`;
  const body = `<header class="page-head"><p class="eyebrow">Muscles · 肌肉回報</p>
    <h1>Muscle check-in</h1>
    <p class="muted">A private map of how your muscles feel, after your runs and between them. The heat shows your latest check-in; the coach reads the same facts when you ask, and never diagnoses.</p>
    ${readinessLine}</header>
    ${savedBanner}
    ${errorBanner}
    ${formSection(input)}
    ${trainingSection(input.trainingRows)}
    ${readingSections}
    ${historySection(input.history, input.dayCheckIn)}
    ${safetySection()}
    ${muscleScript(input)}
    ${muscleViewerScript(input)}`;
  return deps.layout("Muscles", body, input.user, "muscle");
}

/** The readiness chip the calendar shows when the latest check-in needs attention. */
export function muscleCalendarChip(checkIn: MuscleCheckIn): string | null {
  const readiness = readinessForCheckIn(checkIn.muscles);
  if (readiness !== "care" && readiness !== "urgent") return null;
  const label = readiness === "urgent" ? "Muscles · care now" : "Muscles · watch";
  return `<a class="chip muscle-calendar-chip" href="/muscle" title="Your latest muscle check-in needs attention">${escapeHtml(label)}</a>`;
}

/**
 * The muscles-worked card for the activity detail: the read-only front/back pair, the named chip alternative and
 * the deep link that starts a check-in on exactly those muscles.
 */
export function musclesWorkedCard(activityId: string, work: MuscleWork): string {
  return `<section class="card muscles-worked-card"><div class="splits-head"><h2>Muscles worked · 訓練到的肌肉</h2><p class="muted small">Primary movers darker, helpers lighter — the honest default for this run, not EMG data.</p></div>${renderWorkedPair(work)}<div class="review-actions"><a class="btn ghost" href="/muscle?activity=${encodeURIComponent(activityId)}">Check in these muscles · 回報感覺</a></div></section>`;
}
