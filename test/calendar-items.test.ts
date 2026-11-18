import { describe, expect, it } from "vitest";

import {
  CALENDAR_CELL_MAX_ITEMS,
  renderCalendarItem,
  renderCalendarItems,
  type CalendarItem,
  type PairedCalendarItem,
  type PlanCalendarItem,
  type RecordCalendarItem,
} from "../src/calendar-items";

const plan: PlanCalendarItem = {
  type: "plan",
  kind: "easy",
  kindLabel: "Easy",
  sessionId: "session:recovery",
  label: "恢復輕鬆跑",
  meta: "6 km",
  tooltip: "Planned session · Easy · 恢復輕鬆跑 · 6 km",
};

const run: RecordCalendarItem = {
  type: "record",
  source: "garmin",
  activityId: "garmin:17a",
  label: "新界 跑步",
  meta: "1.7 km",
  tooltip: "Recorded run · 新界 跑步 · 1.7 km",
};

const pair: PairedCalendarItem = {
  type: "pair",
  activityId: "garmin:17b",
  run: {
    label: "新界 跑步",
    meta: "4.2 km",
  },
  workout: {
    label: "10 × (Run open, Recovery open)",
  },
  tooltip: "Recorded run with Garmin workout · 新界 跑步 · 4.2 km · Program: 10 × (Run open, Recovery open)",
};

describe("calendar item rows", () => {
  it("renders a plan with a kind rail, a whole title and a typed amount", () => {
    const html = renderCalendarItem(plan);
    expect(html).toContain('class="cal-pill plan kind-easy"');
    expect(html).toContain('data-session-id="session:recovery"');
    expect(html).toContain('<span class="cal-text">恢復輕鬆跑</span><span class="cal-meta">6 km</span>');
    expect(html).toContain('aria-label="Planned session: Easy, 恢復輕鬆跑 (6 km). Show session details"');
    expect(html).not.toContain("cal-glyph");
  });

  it("renders a recorded run with a check, a title and the amount that distinguishes it", () => {
    const html = renderCalendarItem(run);
    expect(html).toContain('class="cal-pill record"');
    expect(html).toContain('data-activity-id="garmin:17a"');
    expect(html).toContain('data-source="garmin"');
    expect(html).toContain('<span class="cal-glyph" aria-hidden="true">✓</span>');
    expect(html).toContain('<span class="cal-meta">1.7 km</span>');
    expect(html).toContain('aria-label="Recorded run: 新界 跑步 (1.7 km). Show run details"');
  });

  it("renders a paired run as one click target that opens the integrated run and workout view", () => {
    const html = renderCalendarItem(pair);
    expect(html).toContain('class="cal-pill paired" data-activity-id="garmin:17b" role="button" tabindex="0"');
    expect(html).toContain('class="cal-pair-part cal-pair-run"');
    expect(html).toContain('class="cal-pair-part cal-pair-workout"');
    expect(html).not.toContain("data-workout-id");
    expect(html).not.toContain("Garmin workout: 10 ×");
    expect(html).toContain('<span class="cal-meta">4.2 km</span>');
    expect(html).toContain("10 × (Run open, Recovery open)");
    expect(html).toContain('aria-label="Recorded run with Garmin workout: 新界 跑步 (4.2 km), 10 × (Run open, Recovery open). Show run and workout details"');
    expect(html.match(/role="button"/g) ?? []).toHaveLength(1);
    expect(html.match(/cal-meta/g) ?? []).toHaveLength(1);
  });

  it("omits the amount slot when an item has no amount", () => {
    const html = renderCalendarItem({ ...run, meta: null });
    expect(html).not.toContain("cal-meta");
    expect(html).toContain("Recorded run: 新界 跑步. Show run details");
  });

  it("escapes labels and tooltips before they reach the cell", () => {
    const html = renderCalendarItem({
      ...run,
      label: 'A < B & "C"',
      tooltip: '<script>alert(1)</script>',
    });
    expect(html).toContain("A &lt; B &amp; &quot;C&quot;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("caps a cell at four rows and counts a pair as one row", () => {
    const five = Array.from({ length: CALENDAR_CELL_MAX_ITEMS + 1 }, (_, index) => ({
      ...run,
      activityId: `garmin:${index + 1}`,
      label: `Run ${index + 1}`,
    })) satisfies CalendarItem[];
    const capped = renderCalendarItems(five);
    expect(capped.match(/class="cal-pill record"/g) ?? []).toHaveLength(CALENDAR_CELL_MAX_ITEMS);
    expect(capped).toContain("+1 more");
    expect(capped).not.toContain("Run 5");

    const four = [plan, run, pair, run];
    expect(renderCalendarItems(four)).not.toContain("more");
    expect(renderCalendarItems(four).match(/class="cal-pill/g) ?? []).toHaveLength(4);
  });

  it("fails loudly when a new item type is added without a renderer branch", () => {
    const rogue = { type: "rogue" } as unknown as CalendarItem;
    expect(() => renderCalendarItem(rogue)).toThrow(/Unhandled calendar item/);
  });
});
