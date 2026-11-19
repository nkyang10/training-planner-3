/** Coaching-state and coach-audit page rendering; the web shell supplies layout. */
import type { AuthUser } from "./auth";
import {
  COACH_STATE_DEFINITIONS,
  coachStateSourceLabel,
  formatCoachStateDate,
  getCoachStateDefinition,
  sortCoachStates,
} from "./coach-states";
import { localDateTime } from "./time";
import type { CoachDirectiveRecord, CoachStateEvent, CoachStateRecord, Memory } from "./types";
import { auditMetric, errorBanner, escapeHtml, type ViewName } from "./web-html";

export interface CoachStateRenderDeps {
  layout: (title: string, body: string, user: AuthUser | undefined, activeView?: ViewName) => string;
}
export function renderCoachAudit(
  user: AuthUser,
  directives: readonly CoachDirectiveRecord[],
  states: readonly CoachStateRecord[],
  legacyModes: readonly Memory[],
  stateEvents: readonly CoachStateEvent[],
  deps: CoachStateRenderDeps,
): string {
  const reviewOnly = directives.filter((record) => !record.directive.allowCalendarWrites).length;
  const blocked = directives.reduce((total, record) => total + record.blockedWrites, 0);
  const coachingStates = states.filter((state) => state.key !== "no_key");
  const activeCount = coachingStates.filter((state) => state.status === "active").length;
  const stateList =
    coachingStates.length === 0
      ? `<p class="muted small">No active states. Auto states appear from the calendar and training; coach or runner states appear on the <a href="/coach-states">Coaching states</a> page.</p>`
      : sortCoachStates(coachingStates).map((state) => stateCardHtml(state, { timezone: user.timezone, internal: true })).join("");
  const eventList =
    stateEvents.length === 0
      ? `<p class="muted small">No state transitions yet.</p>`
      : `<ul class="state-history">${stateEvents
          .map((event) => {
            const definition = getCoachStateDefinition(event.key);
            return `<li><span class="chip">${escapeHtml(event.action)}</span> ${escapeHtml(definition.label)} · ${escapeHtml(event.fromStatus ?? "new")} → ${escapeHtml(event.toStatus)} · ${escapeHtml(coachStateSourceLabel(event.source))} · ${escapeHtml(localDateTime(event.createdAt, user.timezone))}</li>`;
          })
          .join("")}</ul>`;
  const legacyHtml =
    legacyModes.length === 0
      ? ""
      : `<section class="card"><h2>Legacy mode memories</h2><p class="muted small">Older <code>mode:</code> memories are still in the coach's facts. New durable context uses coaching states above.</p><ul class="state-history">${legacyModes
          .map((memory) => `<li><span class="chip">mode</span> ${escapeHtml(memory.text)}</li>`)
          .join("")}</ul></section>`;
  const directiveList =
    directives.length === 0
      ? `<p class="muted small">No hidden directives yet. They appear when you use a coach action such as reviewing a run or a week.</p>`
      : directives
          .map((record) => {
            const directive = record.directive;
            const references = directive.references;
            const referenceParts: string[] = [];
            if (references?.activityId !== undefined) referenceParts.push(`activity ${references.activityId}`);
            if (references?.day !== undefined) referenceParts.push(`day ${references.day}`);
            if (references?.weekStart !== undefined) referenceParts.push(`week ${references.weekStart}`);
            if (references?.sessionIds !== undefined && references.sessionIds.length > 0) {
              referenceParts.push(`sessions ${references.sessionIds.join(", ")}`);
            }
            const focus =
              directive.focus !== undefined && directive.focus.length > 0
                ? `<p class="muted small">Focus: ${escapeHtml(directive.focus.join(", "))}</p>`
                : "";
            const refs =
              referenceParts.length > 0
                ? `<p class="muted small">References: ${escapeHtml(referenceParts.join("; "))}</p>`
                : "";
            const background =
              directive.background === undefined
                ? ""
                : `<p class="audit-background">${escapeHtml(directive.background)}</p>`;
            return `<article class="audit-item">
              <div class="audit-head"><span class="chip">${escapeHtml(directive.mode)}</span><span class="chip">${escapeHtml(directive.source)}</span><span class="chip">${directive.allowCalendarWrites ? "writes allowed" : "comment-only"}</span>${record.blockedWrites > 0 ? `<span class="chip">blocked ${record.blockedWrites}</span>` : ""}<span class="muted small">${escapeHtml(record.createdAt.replace("T", " ").slice(0, 16))}</span></div>
              <p class="audit-visible">“${escapeHtml(record.visible)}”</p>
              ${focus}
              ${refs}
              ${background}
            </article>`;
          })
          .join("");
  return deps.layout(
    "Coach audit",
    `<section class="page-head"><p class="eyebrow"><a href="/profile">← Profile</a> · <a href="/coach-states">Coaching states</a></p><h1>Coach audit</h1><p class="muted">The chat shows only your message and the coach's reply. Each action also sends a hidden directive that guides the coach; it is never rendered in the chat. This page shows those directives and the coaching states.</p></section>
    <section class="card audit-summary"><div class="audit-stats">${auditMetric("recent directives", directives.length)}${auditMetric("comment-only", reviewOnly)}${auditMetric("blocked writes", blocked)}${auditMetric("active states", activeCount)}</div></section>
    <section class="card"><h2>Active coaching states</h2><p class="muted small">Auto, coach-proposed and runner-set states. <a href="/coach-states">Manage states</a>.</p>${stateList}</section>
    <section class="card"><h2>State activity</h2><p class="muted small">Immutable transitions: activation, confirmation, resolution and expiry. Routine auto-refreshes are not logged.</p>${eventList}</section>
    ${legacyHtml}
    <section class="card"><h2>Recent directives</h2>${directiveList}</section>`,
    user,
    "none",
  );
}

function familyLabel(family: string): string {
  switch (family) {
    case "race_phase":
      return "Race phase";
    case "load":
      return "Load";
    case "consistency":
      return "Consistency";
    case "safety":
      return "Safety / medical";
    case "life":
      return "Life / logistics";
    case "wellbeing":
      return "Wellbeing";
    case "environment":
      return "Environment";
    case "data":
      return "Data";
    case "setup":
      return "Setup";
    case "runner":
      return "Runner focus";
    default:
      return family;
  }
}

function stateErrorMessage(code?: string): string | undefined {
  switch (code) {
    case undefined:
      return undefined;
    case "invalid-key":
      return "Choose a valid coaching state.";
    case "invalid-ttl":
      return "Days must be 1..365.";
    case "invalid-note":
      return "Note must be at most 200 characters.";
    case "not-found":
      return "State not found or already resolved.";
    default:
      return "Could not update the coaching state.";
  }
}

function stateStatusChip(state: CoachStateRecord): string {
  const label = state.status === "active" ? "Active" : state.status === "observing" ? "Proposed" : "Resolved";
  return `<span class="chip state-status state-${state.status}">${label}</span>`;
}

/** The visible question for one coaching state; the hidden discuss-state directive keeps the turn comment-only. */
function coachPromptForState(label: string): string {
  return `How should the ${label} state shape my coming week?`;
}

export function stateChipHtml(state: CoachStateRecord): string {
  const definition = getCoachStateDefinition(state.key);
  return `<a class="chip state-chip state-${state.status}" href="/coach-states" title="${escapeHtml(definition.description)}">${escapeHtml(definition.shortLabel)}</a>`;
}

function stateCardHtml(
  state: CoachStateRecord,
  options: { proposed?: boolean; timezone?: string; internal?: boolean } = {},
): string {
  const definition = getCoachStateDefinition(state.key);
  const internal = options.internal === true;
  const proposed = options.proposed === true || state.status === "observing";
  const evidence =
    state.evidence.length === 0
      ? ""
      : `<ul class="state-evidence">${state.evidence.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
  const keyChip = internal ? `<span class="chip">${escapeHtml(state.key)}</span>` : "";
  const guardrails =
    internal && definition.guardrails.length > 0
      ? `<p class="state-guardrail">Guardrail: ${escapeHtml(definition.guardrails.map((rule) => rule.rule).join(" "))}</p>`
      : "";
  const expiry = formatCoachStateDate(state.expiresAt, options.timezone ?? "UTC");
  const expiryText = expiry === "no expiry" ? "no expiry" : `until ${expiry}`;
  const confidence = internal ? `confidence ${state.confidence.toFixed(2)} · ` : "";
  const confirm = `<form method="post" action="/coach-states/${encodeURIComponent(state.stateId)}/confirm" class="state-actions"><button class="btn" type="submit">Confirm · 確認</button><button class="btn ghost" type="submit" formaction="/coach-states/${encodeURIComponent(state.stateId)}/resolve">Dismiss · 略過</button></form>`;
  const resolve = `<form method="post" action="/coach-states/${encodeURIComponent(state.stateId)}/resolve" class="state-actions"><button class="btn ghost" type="submit">Resolve · 解除</button></form>`;
  // Every state card can reach the coach in one tap: the action sits beside the data and never chases the runner.
  const askCoach = `<div class="state-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(coachPromptForState(definition.label))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "discuss-state", stateId: state.stateId, source: "states-page" }))}">Ask coach about this state · 問問教練</button></div>`;
  return `<article class="state-card state-${state.status}">
    <div class="state-head"><strong>${escapeHtml(definition.label)}</strong>${keyChip}${stateStatusChip(state)}<span class="chip">${escapeHtml(coachStateSourceLabel(state.source))}</span><span class="muted small">${confidence}${escapeHtml(expiryText)}</span></div>
    <p class="muted small">${escapeHtml(definition.description)}</p>
    ${evidence}
    ${guardrails}
    <p class="state-note">${escapeHtml(definition.uiNote)}</p>
    ${proposed ? confirm : resolve}
    ${askCoach}
  </article>`;
}

export function renderCoachStates(
  user: AuthUser,
  states: readonly CoachStateRecord[],
  history: readonly CoachStateRecord[],
  error: string | undefined,
  deps: CoachStateRenderDeps,
): string {
  const active = sortCoachStates(states.filter((state) => state.status === "active" && state.key !== "no_key"));
  const observing = sortCoachStates(states.filter((state) => state.status === "observing" && state.key !== "no_key"));
  const setup = states.find((state) => state.key === "no_key" && state.status === "active");
  const setupHtml =
    setup === undefined
      ? ""
      : `<section class="card"><h2>Setup · 設定</h2><p class="muted small">No Garmin key is saved. <a href="/calendar?garmin=setup">Connect Garmin</a> to coach from recorded runs, or <a href="/calendar">log a run by hand</a>.</p></section>`;
  const activeHtml =
    active.length === 0
      ? `<p class="muted small">No active states. Automatic states appear from your calendar and training; use Refresh or set one below.</p>`
      : active.map((state) => stateCardHtml(state, { timezone: user.timezone })).join("");
  const observingHtml =
    observing.length === 0
      ? ""
      : `<section class="card"><h2>Proposed by the coach · 教練建議</h2><p class="muted small">These wait for your confirmation. They do not change your plan until you confirm; dismiss one that does not fit.</p>${observing.map((state) => stateCardHtml(state, { proposed: true, timezone: user.timezone })).join("")}</section>`;
  const families = new Map<string, string[]>();
  for (const definition of COACH_STATE_DEFINITIONS) {
    if (definition.family === "setup") continue;
    const options = families.get(definition.family) ?? [];
    options.push(
      `<option value="${definition.key}">${escapeHtml(definition.label)}${definition.sensitive ? " (sensitive)" : ""}</option>`,
    );
    families.set(definition.family, options);
  }
  const stateOptions = [...families.entries()]
    .map(([family, options]) => `<optgroup label="${escapeHtml(familyLabel(family))}">${options.join("")}</optgroup>`)
    .join("");
  const resolved = history.filter((state) => state.status === "resolved");
  const historyHtml =
    resolved.length === 0
      ? `<p class="muted small">No resolved states yet.</p>`
      : `<ul class="state-history">${resolved
          .map((state) => {
            const definition = getCoachStateDefinition(state.key);
            return `<li><span class="chip">${escapeHtml(definition.label)}</span> ${escapeHtml(coachStateSourceLabel(state.source))} · ${escapeHtml(localDateTime(state.resolvedAt ?? state.updatedAt, user.timezone))}</li>`;
          })
          .join("")}</ul>`;
  const resolvedCount = resolved.length;
  const errorMessage = stateErrorMessage(error);
  return deps.layout(
    "Coaching states",
    `<section class="page-head"><p class="eyebrow"><a href="/profile">← Profile</a></p><h1>Coaching states · 教練狀態</h1><p class="muted">Temporary situations that change your training — race phase, load, travel, heat, pain, illness or a focus block. Some are detected automatically; others are suggested by the coach or set by you. States shape the coach's advice; they never lock your calendar, and they are not diagnoses.</p><p class="muted small">Active ${active.length} · Proposed ${observing.length} · Resolved ${resolvedCount}</p>${errorBanner(errorMessage)}</section>
    ${setupHtml}
    <section class="card"><h2>Active states · 生效狀態</h2><form method="post" action="/coach-states/refresh" class="state-refresh"><button class="btn ghost" type="submit" title="Re-check automatic states">Refresh · 更新</button></form>${activeHtml}</section>
    ${observingHtml}
    <section class="card"><h2>Set a state · 設定狀態</h2><p class="muted small">Use this for travel, heat, time pressure, pain, illness, sleep debt or a focus block. Sensitive states are never inferred; they are yours to set.</p>
      <form method="post" action="/coach-states" class="state-form">
        <label for="state-key">State</label><select id="state-key" name="key" required><option value="" disabled selected>Choose a state...</option>${stateOptions}</select>
        <label for="state-ttl">Covers the next N days</label><div class="state-ttl-row"><input id="state-ttl" name="ttlDays" type="number" min="1" max="365" value="7" required aria-label="Days from today this state covers"> <span class="muted small">days, starting today</span></div>
        <label for="state-note">Note <span class="muted small">(optional)</span></label><input id="state-note" name="note" maxlength="200" autocomplete="off" placeholder="e.g. travelling to Tokyo 20-24 Nov">
        <button class="btn" type="submit">Set state · 儲存</button>
      </form>
      <p class="state-note">Not medical advice. For chest pain, fainting, severe breathlessness, pregnancy/postpartum or a worsening injury, seek a clinician.</p>
    </section>
    <section class="card"><h2>Recent state history · 最近已解除</h2>${historyHtml}</section>`,
    user,
    "none",
  );
}

