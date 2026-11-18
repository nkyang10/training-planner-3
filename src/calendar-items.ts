/**
 * The calendar cell's presentation model.
 *
 * A day cell is a short stack of rows, and every row is exactly one of three well-defined item types: a planned
 * session, a recorded run, or a recorded run paired with the Garmin workout it followed. The union below makes the
 * difference structural instead of a bag of optional fields, so a renderer cannot read a field that does not belong to
 * the item it is drawing, and adding a fourth type becomes a compile error at every switch. A paired row is one click
 * target: it opens one integrated peek with the run and the workout program, instead of two separate half-row popups.
 *
 * The same renderer produces the first paint and the `/calendar/data` fragment the client swaps in after a coach turn.
 * That is deliberate: two renderers drifted apart before, and the browser copy silently lost details the server had.
 */
import { escapeHtml } from "./web-html";
import type { Activity, SessionKind } from "./types";

/** A day cell shows at most this many rows; the rest collapse into "+n more". */
export const CALENDAR_CELL_MAX_ITEMS = 4;

interface CalendarItemBase {
  /** Full description shown on hover, including the metrics and note the row has no room for. */
  tooltip: string;
}

/** A planned session. The runner can open it, but only the coach can change it. */
export interface PlanCalendarItem extends CalendarItemBase {
  type: "plan";
  kind: SessionKind;
  /** Friendly kind name used in the accessible label, e.g. "Easy" or "Long run". */
  kindLabel: string;
  sessionId: string;
  /** Visible title. The amount is kept in `meta` so a long title keeps its own line. */
  label: string;
  /** The amount the title omits: the distance, or the duration when no distance is known; null when there is nothing to add. */
  meta: string | null;
}

/** A recorded run with no known Garmin workout. */
export interface RecordCalendarItem extends CalendarItemBase {
  type: "record";
  source: Activity["source"];
  activityId: string;
  label: string;
  meta: string | null;
}

/** The run line of a paired row. */
export interface CalendarPairRun {
  label: string;
  meta: string | null;
}

/** The Garmin-workout line of a paired row. */
export interface CalendarPairWorkout {
  label: string;
}

/** A recorded run and the Garmin workout it followed, folded into one two-row item with one click target. */
export interface PairedCalendarItem extends CalendarItemBase {
  type: "pair";
  /** The run whose integrated peek opens from anywhere on the row; the workout is read from the same activity. */
  activityId: string;
  run: CalendarPairRun;
  workout: CalendarPairWorkout;
}

/** Every row a day cell can contain. */
export type CalendarItem = PlanCalendarItem | RecordCalendarItem | PairedCalendarItem;

/** One day's payload: structured rows for callers and the rendered rows for the in-place refresh. */
export interface CalendarDayPayload {
  items: CalendarItem[];
  /** Server-rendered rows, so the refresh uses the same renderer as the first paint. */
  html: string;
}

/** The `/calendar/data` response. Days with nothing left are omitted, so the client can clear the rest. */
export interface CalendarMonthPayload {
  month: string;
  days: Record<string, CalendarDayPayload>;
}

function assertNever(item: never): never {
  throw new Error(`Unhandled calendar item: ${JSON.stringify(item)}`);
}

function metaHtml(meta: string | null): string {
  return meta === null ? "" : `<span class="cal-meta">${escapeHtml(meta)}</span>`;
}

function amountSuffix(meta: string | null): string {
  return meta === null ? "" : ` (${meta})`;
}

function renderPlanItem(item: PlanCalendarItem): string {
  const action = `Planned session: ${item.kindLabel}, ${item.label}${amountSuffix(item.meta)}. Show session details`;
  return `<span class="cal-pill plan kind-${escapeHtml(item.kind)}" data-session-id="${escapeHtml(item.sessionId)}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${escapeHtml(action)}" title="${escapeHtml(item.tooltip)}"><span class="sr-only">Planned session: </span><span class="cal-text">${escapeHtml(item.label)}</span>${metaHtml(item.meta)}</span>`;
}

function renderRecordItem(item: RecordCalendarItem): string {
  const action = `Recorded run: ${item.label}${amountSuffix(item.meta)}. Show run details`;
  return `<span class="cal-pill record" data-activity-id="${escapeHtml(item.activityId)}" data-source="${escapeHtml(item.source)}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${escapeHtml(action)}" title="${escapeHtml(item.tooltip)}"><span class="sr-only">Recorded run: </span><span class="cal-glyph" aria-hidden="true">✓</span><span class="cal-text">${escapeHtml(item.label)}</span>${metaHtml(item.meta)}</span>`;
}

function renderPairedItem(item: PairedCalendarItem): string {
  const action = `Recorded run with Garmin workout: ${item.run.label}${amountSuffix(item.run.meta)}, ${item.workout.label}. Show run and workout details`;
  return `<span class="cal-pill paired" data-activity-id="${escapeHtml(item.activityId)}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${escapeHtml(action)}" title="${escapeHtml(item.tooltip)}"><span class="cal-pair-part cal-pair-run"><span class="cal-glyph" aria-hidden="true">✓</span><span class="cal-text">${escapeHtml(item.run.label)}</span>${metaHtml(item.run.meta)}</span><span class="cal-pair-part cal-pair-workout"><span class="cal-glyph" aria-hidden="true">◈</span><span class="cal-text">${escapeHtml(item.workout.label)}</span></span></span>`;
}

/** Render one row. The exhaustive switch is the guard: every union member is handled exactly once. */
export function renderCalendarItem(item: CalendarItem): string {
  switch (item.type) {
    case "plan":
      return renderPlanItem(item);
    case "record":
      return renderRecordItem(item);
    case "pair":
      return renderPairedItem(item);
    default:
      return assertNever(item);
  }
}

/** Render one cell's rows, with the same four-row cap and overflow hint on the server and after a refresh. */
export function renderCalendarItems(items: readonly CalendarItem[]): string {
  const shown = items.slice(0, CALENDAR_CELL_MAX_ITEMS);
  const hidden = items.length - shown.length;
  const more = hidden === 0
    ? ""
    : `<span class="cal-more" title="Open the day to see every session and run">+${hidden} more</span>`;
  return `${shown.map(renderCalendarItem).join("")}${more}`;
}
