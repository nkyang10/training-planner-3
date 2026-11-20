/** Coaching-state and coach-audit page rendering; the web shell supplies layout. */
import type { AuthUser } from "./auth";
import {
  COACH_STATE_DEFINITIONS,
  formatCoachStateDate,
  getCoachStateDefinition,
  sortCoachStates,
} from "./coach-states";
import { localDateTime } from "./time";
import type { CoachDirectiveRecord, CoachStateEvent, CoachStateRecord, Memory } from "./types";
import { defaultTranslator, type Translator } from "./i18n";
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
  tx: Translator = defaultTranslator,
): string {
  const reviewOnly = directives.filter((record) => !record.directive.allowCalendarWrites).length;
  const blocked = directives.reduce((total, record) => total + record.blockedWrites, 0);
  const coachingStates = states.filter((state) => state.key !== "no_key");
  const activeCount = coachingStates.filter((state) => state.status === "active").length;
  const stateList =
    coachingStates.length === 0
      ? `<p class="muted small">${tx.t("coachAudit.noStatesPre")}<a href="/coach-states">${tx.t("account.coachStates")}</a>${tx.t("coachAudit.noStatesPost")}</p>`
      : sortCoachStates(coachingStates).map((state) => stateCardHtml(state, { timezone: user.timezone, internal: true }, tx)).join("");
  const eventList =
    stateEvents.length === 0
      ? `<p class="muted small">${tx.t("coachAudit.noEvents")}</p>`
      : `<ul class="state-history">${stateEvents
          .map((event) => {
            return `<li><span class="chip">${escapeHtml(event.action)}</span> ${escapeHtml(tx.t(`coachState.label.${event.key}` as const))} · ${escapeHtml(event.fromStatus ?? "new")} → ${escapeHtml(event.toStatus)} · ${escapeHtml(tx.t(`coachState.source.${event.source}` as const))} · ${escapeHtml(localDateTime(event.createdAt, user.timezone))}</li>`;
          })
          .join("")}</ul>`;
  const legacyHtml =
    legacyModes.length === 0
      ? ""
      : `<section class="card"><h2>${tx.t("coachAudit.legacyHeading")}</h2><p class="muted small">${tx.t("coachAudit.legacyPre")}<code>mode:</code>${tx.t("coachAudit.legacyPost")}</p><ul class="state-history">${legacyModes
          .map((memory) => `<li><span class="chip">mode</span> ${escapeHtml(memory.text)}</li>`)
          .join("")}</ul></section>`;
  const directiveList =
    directives.length === 0
      ? `<p class="muted small">${tx.t("coachAudit.noDirectives")}</p>`
      : directives
          .map((record) => {
            const directive = record.directive;
            const references = directive.references;
            const referenceParts: string[] = [];
            if (references?.activityId !== undefined) referenceParts.push(`${tx.t("coachAudit.refActivity")} ${references.activityId}`);
            if (references?.day !== undefined) referenceParts.push(`${tx.t("coachAudit.refDay")} ${references.day}`);
            if (references?.weekStart !== undefined) referenceParts.push(`${tx.t("coachAudit.refWeek")} ${references.weekStart}`);
            if (references?.sessionIds !== undefined && references.sessionIds.length > 0) {
              referenceParts.push(`${tx.t("coachAudit.refSessions")} ${references.sessionIds.join(", ")}`);
            }
            const focus =
              directive.focus !== undefined && directive.focus.length > 0
                ? `<p class="muted small">${tx.t("coachAudit.focusLabel")} ${escapeHtml(directive.focus.join(", "))}</p>`
                : "";
            const refs =
              referenceParts.length > 0
                ? `<p class="muted small">${tx.t("coachAudit.refsLabel")} ${escapeHtml(referenceParts.join("; "))}</p>`
                : "";
            const background =
              directive.background === undefined
                ? ""
                : `<p class="audit-background">${escapeHtml(directive.background)}</p>`;
            return `<article class="audit-item">
              <div class="audit-head"><span class="chip">${escapeHtml(directive.mode)}</span><span class="chip">${escapeHtml(directive.source)}</span><span class="chip">${directive.allowCalendarWrites ? tx.t("coachAudit.writesAllowed") : tx.t("coachAudit.commentOnly")}</span>${record.blockedWrites > 0 ? `<span class="chip">${tx.t("coachAudit.blockedChip")} ${record.blockedWrites}</span>` : ""}<span class="muted small">${escapeHtml(record.createdAt.replace("T", " ").slice(0, 16))}</span></div>
              <p class="audit-visible">“${escapeHtml(record.visible)}”</p>
              ${focus}
              ${refs}
              ${background}
            </article>`;
          })
          .join("");
  return deps.layout(
    tx.t("coachAudit.title"),
    `<section class="page-head"><p class="eyebrow"><a href="/profile">${tx.t("coachStates.backToProfile")}</a> · <a href="/coach-states">${tx.t("account.coachStates")}</a></p><h1>${tx.t("coachAudit.title")}</h1><p class="muted">${tx.t("coachAudit.intro")}</p></section>
    <section class="card audit-summary"><div class="audit-stats">${auditMetric(tx.t("coachAudit.metricDirectives"), directives.length)}${auditMetric(tx.t("coachAudit.commentOnly"), reviewOnly)}${auditMetric(tx.t("coachAudit.metricBlocked"), blocked)}${auditMetric(tx.t("coachAudit.metricActive"), activeCount)}</div></section>
    <section class="card"><h2>${tx.t("coachAudit.statesHeading")}</h2><p class="muted small">${tx.t("coachAudit.statesBodyPre")}<a href="/coach-states">${tx.t("coachAudit.manageStates")}</a>${tx.t("coachAudit.statesBodyPost")}</p>${stateList}</section>
    <section class="card"><h2>${tx.t("coachAudit.activityHeading")}</h2><p class="muted small">${tx.t("coachAudit.activityBody")}</p>${eventList}</section>
    ${legacyHtml}
    <section class="card"><h2>${tx.t("coachAudit.directivesHeading")}</h2>${directiveList}</section>`,
    user,
    "none",
  );
}

function familyLabel(family: string, tx: Translator): string {
  switch (family) {
    case "race_phase":
      return tx.t("coachStates.familyRacePhase");
    case "load":
      return tx.t("coachStates.familyLoad");
    case "consistency":
      return tx.t("coachStates.familyConsistency");
    case "safety":
      return tx.t("coachStates.familySafety");
    case "life":
      return tx.t("coachStates.familyLife");
    case "wellbeing":
      return tx.t("coachStates.familyWellbeing");
    case "environment":
      return tx.t("coachStates.familyEnvironment");
    case "data":
      return tx.t("coachStates.familyData");
    case "setup":
      return tx.t("coachStates.familySetup");
    case "runner":
      return tx.t("coachStates.familyRunnerFocus");
    default:
      return family;
  }
}

function stateErrorMessage(code?: string, tx: Translator = defaultTranslator): string | undefined {
  switch (code) {
    case undefined:
      return undefined;
    case "invalid-key":
      return tx.t("coachStates.errInvalidKey");
    case "invalid-ttl":
      return tx.t("coachStates.errInvalidTtl");
    case "invalid-note":
      return tx.t("coachStates.errInvalidNote");
    case "not-found":
      return tx.t("coachStates.errNotFound");
    default:
      return tx.t("coachStates.errGeneric");
  }
}

function stateStatusChip(state: CoachStateRecord, tx: Translator): string {
  const label =
    state.status === "active"
      ? tx.t("coachStates.statusActive")
      : state.status === "observing"
        ? tx.t("coachStates.statusProposed")
        : tx.t("coachStates.statusResolved");
  return `<span class="chip state-status state-${state.status}">${label}</span>`;
}

/** The visible question for one coaching state; the hidden discuss-state directive keeps the turn comment-only. */
function coachPromptForState(label: string): string {
  return `How should the ${label} state shape my coming week?`;
}

export function stateChipHtml(state: CoachStateRecord, tx: Translator = defaultTranslator): string {
  return `<a class="chip state-chip state-${state.status}" href="/coach-states" title="${escapeHtml(tx.t(`coachState.desc.${state.key}` as const))}">${escapeHtml(tx.t(`coachState.short.${state.key}` as const))}</a>`;
}

function stateCardHtml(
  state: CoachStateRecord,
  options: { proposed?: boolean; timezone?: string; internal?: boolean } = {},
  tx: Translator = defaultTranslator,
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
      ? `<p class="state-guardrail">${tx.t("coachStates.guardrail")} ${escapeHtml(definition.guardrails.map((rule) => rule.rule).join(" "))}</p>`
      : "";
  const expiry = formatCoachStateDate(state.expiresAt, options.timezone ?? "UTC");
  const expiryText = expiry === "no expiry" ? tx.t("coachStates.expiryNo") : `${tx.t("coachStates.expiryUntil")} ${expiry}`;
  const confidence = internal ? `${tx.t("coachStates.confidence")} ${state.confidence.toFixed(2)} · ` : "";
  const confirm = `<form method="post" action="/coach-states/${encodeURIComponent(state.stateId)}/confirm" class="state-actions"><button class="btn" type="submit">${tx.t("coachStates.confirm")}</button><button class="btn ghost" type="submit" formaction="/coach-states/${encodeURIComponent(state.stateId)}/resolve">${tx.t("coachStates.dismiss")}</button></form>`;
  const resolve = `<form method="post" action="/coach-states/${encodeURIComponent(state.stateId)}/resolve" class="state-actions"><button class="btn ghost" type="submit">${tx.t("coachStates.resolve")}</button></form>`;
  // Every state card can reach the coach in one tap: the action sits beside the data and never chases the runner.
  const askCoach = `<div class="state-actions"><button type="button" class="coach-ask" data-coach-message="${escapeHtml(coachPromptForState(definition.label))}" data-coach-intent="${escapeHtml(JSON.stringify({ kind: "discuss-state", stateId: state.stateId, source: "states-page" }))}">${tx.t("coachStates.askCoach")}</button></div>`;
  return `<article class="state-card state-${state.status}">
    <div class="state-head"><strong>${escapeHtml(tx.t(`coachState.label.${state.key}` as const))}</strong>${keyChip}${stateStatusChip(state, tx)}<span class="chip">${escapeHtml(tx.t(`coachState.source.${state.source}` as const))}</span><span class="muted small">${confidence}${escapeHtml(expiryText)}</span></div>
    <p class="muted small">${escapeHtml(tx.t(`coachState.desc.${state.key}` as const))}</p>
    ${evidence}
    ${guardrails}
    <p class="state-note">${escapeHtml(tx.t(`coachState.note.${state.key}` as const))}</p>
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
  tx: Translator = defaultTranslator,
  selectedTab: "current" | "set" | "history" = "current",
): string {
  const active = sortCoachStates(states.filter((state) => state.status === "active" && state.key !== "no_key"));
  const observing = sortCoachStates(states.filter((state) => state.status === "observing" && state.key !== "no_key"));
  const setup = states.find((state) => state.key === "no_key" && state.status === "active");
  const setupHtml =
    setup === undefined
      ? ""
      : `<section class="card"><h2>${tx.t("coachStates.setupHeading")}</h2><p class="muted small">${tx.t("coachStates.setupPre")}<a href="/calendar?garmin=setup">${tx.t("coachStates.connectGarmin")}</a>${tx.t("coachStates.setupMid")}<a href="/calendar">${tx.t("coachStates.logByHand")}</a>${tx.t("coachStates.setupPost")}</p></section>`;
  const activeHtml =
    active.length === 0
      ? `<p class="muted small">${tx.t("coachStates.noActive")}</p>`
      : active.map((state) => stateCardHtml(state, { timezone: user.timezone }, tx)).join("");
  const observingHtml =
    observing.length === 0
      ? ""
      : `<section class="card"><h2>${tx.t("coachStates.proposedHeading")}</h2><p class="muted small">${tx.t("coachStates.proposedBody")}</p>${observing.map((state) => stateCardHtml(state, { proposed: true, timezone: user.timezone }, tx)).join("")}</section>`;
  const families = new Map<string, string[]>();
  for (const definition of COACH_STATE_DEFINITIONS) {
    if (definition.family === "setup") continue;
    const options = families.get(definition.family) ?? [];
    options.push(
      `<option value="${definition.key}">${escapeHtml(tx.t(`coachState.label.${definition.key}` as const))}${definition.sensitive ? tx.t("coachStates.sensitiveSuffix") : ""}</option>`,
    );
    families.set(definition.family, options);
  }
  const stateOptions = [...families.entries()]
    .map(([family, options]) => `<optgroup label="${escapeHtml(familyLabel(family, tx))}">${options.join("")}</optgroup>`)
    .join("");
  const resolved = history.filter((state) => state.status === "resolved");
  const historyHtml =
    resolved.length === 0
      ? `<p class="muted small">${tx.t("coachStates.noResolved")}</p>`
      : `<ul class="state-history">${resolved
          .map((state) => {
            return `<li><span class="chip">${escapeHtml(tx.t(`coachState.label.${state.key}` as const))}</span> ${escapeHtml(tx.t(`coachState.source.${state.source}` as const))} · ${escapeHtml(localDateTime(state.resolvedAt ?? state.updatedAt, user.timezone))}</li>`;
          })
          .join("")}</ul>`;
  const resolvedCount = resolved.length;
  const errorMessage = stateErrorMessage(error, tx);
  const currentChecked = selectedTab === "current" ? " checked" : "";
  const setChecked = selectedTab === "set" ? " checked" : "";
  const historyChecked = selectedTab === "history" ? " checked" : "";
  const currentPanel = `<div class="seg-panel" data-seg-panel="current"><section class="card"><h2>${tx.t("coachStates.activeHeading")}</h2><form method="post" action="/coach-states/refresh" class="state-refresh"><button class="btn ghost" type="submit" title="${tx.t("coachStates.refreshTitle")}">${tx.t("coachStates.refreshButton")}</button></form>${activeHtml}</section>${observingHtml}</div>`;
  const setPanel = `<div class="seg-panel" data-seg-panel="set"><section class="card" id="state-form-card"><h2>${tx.t("coachStates.setHeading")}</h2><p class="muted small">${tx.t("coachStates.setBody")}</p>
      <form method="post" action="/coach-states" class="state-form">
        <label for="state-key">${tx.t("coachStates.fieldState")}</label><select id="state-key" name="key" required><option value="" disabled selected>${tx.t("coachStates.chooseState")}</option>${stateOptions}</select>
        <label for="state-ttl">${tx.t("coachStates.fieldTtl")}</label><div class="state-ttl-row"><input id="state-ttl" name="ttlDays" type="number" min="1" max="365" value="7" required aria-label="${tx.t("coachStates.ttlAria")}"> <span class="muted small">${tx.t("coachStates.ttlSuffix")}</span></div>
        <label for="state-note">${tx.t("coachStates.fieldNote")} <span class="muted small">(${tx.t("coachStates.optional")})</span></label><input id="state-note" name="note" maxlength="200" autocomplete="off" placeholder="${tx.t("coachStates.notePlaceholder")}">
        <button class="btn" type="submit">${tx.t("coachStates.setStateButton")}</button>
      </form>
      <p class="state-note">${tx.t("coachStates.medicalNote")}</p>
    </section></div>`;
  const historyPanel = `<div class="seg-panel" data-seg-panel="history"><section class="card"><h2>${tx.t("coachStates.historyHeading")}</h2>${historyHtml}</section></div>`;
  // The page is the management surface behind the dock's compact States tab: current first, then the two write/log
  // jobs. Native radios keep it working without script; the URL (`?tab=set`) and the head action deep-link to a panel.
  const tabs = `<div class="seg-tabs coach-states-tabs" role="radiogroup" aria-label="${escapeHtml(tx.t("coachStates.tabsAria"))}"><input class="seg-input" type="radio" name="coach-states-tab" id="coach-states-tab-current" value="current" data-track="page-tab"${currentChecked}><input class="seg-input" type="radio" name="coach-states-tab" id="coach-states-tab-set" value="set" data-track="page-tab"${setChecked}><input class="seg-input" type="radio" name="coach-states-tab" id="coach-states-tab-history" value="history" data-track="page-tab"${historyChecked}><div class="seg-labels"><label class="seg-label" for="coach-states-tab-current">${escapeHtml(tx.t("coachStates.tabCurrent"))}</label><label class="seg-label" for="coach-states-tab-set">${escapeHtml(tx.t("coachStates.tabSet"))}</label><label class="seg-label" for="coach-states-tab-history">${escapeHtml(tx.t("coachStates.tabHistory"))}</label></div><div class="seg-panels">${currentPanel}${setPanel}${historyPanel}</div></div>`;
  return deps.layout(
    tx.t("account.coachStates"),
    `<section class="page-head"><p class="eyebrow"><a href="/profile">${tx.t("coachStates.backToProfile")}</a></p><h1>${tx.t("account.coachStates")}</h1><p class="muted">${tx.t("coachStates.intro")}</p><p class="muted small">${tx.t("coachStates.summary", { active: active.length, proposed: observing.length, resolved: resolvedCount })}</p><div class="head-actions"><a class="chip" data-track="states-set" data-track-value="set" href="/coach-states?tab=set#state-form-card">${escapeHtml(tx.t("coachStates.setAction"))}</a></div>${errorBanner(errorMessage)}</section>
    ${setupHtml}
    ${tabs}`,
    user,
    "none",
  );
}

