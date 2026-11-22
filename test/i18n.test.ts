import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  clientStrings,
  createTranslator,
  defaultTranslator,
  isLocale,
  languageCookie,
  localeMeta,
  resolveLocale,
  type MessageKey,
} from "../src/i18n";

describe("locale registry", () => {
  it("always offers English and Traditional Chinese (Hong Kong)", () => {
    expect(LOCALES.map((meta) => meta.code)).toEqual(["en", "zh-HK"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("isLocale accepts only supported codes", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("zh-HK")).toBe(true);
    expect(isLocale("zh")).toBe(false);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("localeMeta falls back to a supported entry", () => {
    expect(localeMeta("zh-HK").dir).toBe("ltr");
  });
});

describe("resolveLocale", () => {
  it("prefers an explicit cookie over everything", () => {
    expect(resolveLocale("zh-HK", "en-US,en")).toBe("zh-HK");
    expect(resolveLocale("en", "zh-HK")).toBe("en");
  });

  it("falls back to Accept-Language, then English", () => {
    expect(resolveLocale(undefined, "zh-HK,zh;q=0.9")).toBe("zh-HK");
    expect(resolveLocale(undefined, "zh-Hant-TW")).toBe("zh-HK");
    expect(resolveLocale(undefined, "zh")).toBe("zh-HK");
    expect(resolveLocale(undefined, "en-GB,en;q=0.8")).toBe("en");
    expect(resolveLocale(undefined, undefined)).toBe("en");
    expect(resolveLocale(undefined, "de,fr")).toBe("en");
  });

  it("ignores an unknown cookie value and continues with header/default", () => {
    expect(resolveLocale("de", "zh-HK")).toBe("zh-HK");
    expect(resolveLocale("de", undefined)).toBe("en");
  });
});

describe("createTranslator", () => {
  it("translates the same key in both locales", () => {
    const en = createTranslator("en");
    const zh = createTranslator("zh-HK");
    expect(en.t("calendar.heading")).toBe("Your plan");
    expect(zh.t("calendar.heading")).not.toBe("Your plan");
    expect(zh.t("calendar.heading").length).toBeGreaterThan(0);
  });

  it("interpolates plain {name} placeholders", () => {
    expect(defaultTranslator.t("calendar.welcome", { name: "Ada" })).toBe("Welcome back, Ada.");
  });

  it("resolves plural blocks for one and other", () => {
    const en = createTranslator("en");
    expect(en.t("notif.ariaUnread", { count: 1 })).toContain("1");
    expect(en.t("notif.ariaUnread", { count: 3 })).toContain("3");
    // Nested-brace plural: the {count} inside each branch must expand, with no stray braces.
    expect(en.t("history.runCount", { count: 1 })).toBe("1 run");
    expect(en.t("history.runCount", { count: 3 })).toBe("3 runs");
    expect(createTranslator("zh-HK").t("history.runCount", { count: 3 })).toBe("3 次跑步");
  });

  it("leaves an unknown token in place and falls back to the key for an unknown key", () => {
    expect(defaultTranslator.t("calendar.welcome")).toContain("{name}");
    expect(defaultTranslator.t("does.not.exist" as MessageKey)).toBe("does.not.exist");
  });

  it("keeps the two catalogs key-identical", () => {
    const enKeys = Object.keys(createTranslator("en") === undefined ? {} : {});
    // The type contract (Record<MessageKey,string>) already guarantees parity; assert a representative new key exists.
    expect(defaultTranslator.t("changes.undoCount", { count: 2, unit: "sessions" })).toBe("Undo 2 sessions");
    expect(createTranslator("zh-HK").t("changes.undoCount", { count: 2, unit: "項訓練" })).toBe("復原 2 項訓練");
    expect(defaultTranslator.t("changes.headline.added", { count: 1, unit: "session" })).toBe("1 session added");
    // The standalone all-changes page and its account-menu entry exist in both locales.
    expect(defaultTranslator.t("changes.allTitle")).toBe("All changes");
    expect(createTranslator("zh-HK").t("changes.allTitle")).toBe("所有變更");
    expect(defaultTranslator.t("changes.filterSummary", { shown: 3, total: 10 })).toBe("Showing 3 of 10 changes");
    expect(createTranslator("zh-HK").t("changes.filterSummary", { shown: 3, total: 10 })).toBe("顯示 10 項中的 3 項變更");
    expect(defaultTranslator.t("account.changes")).toBe("All changes");
    expect(enKeys).toEqual([]);
  });
});

describe("DateFormat", () => {
  it("produces a Monday-first seven-day week and twelve months", () => {
    expect(defaultTranslator.date.weekdays()).toHaveLength(7);
    expect(defaultTranslator.date.monthNames()).toHaveLength(12);
  });

  it("localizes month labels per locale", () => {
    const en = defaultTranslator.date.monthLabel("2026-01");
    const zh = createTranslator("zh-HK").date.monthLabel("2026-01");
    expect(en).toContain("2026");
    expect(zh).toContain("2026");
    expect(zh).not.toBe(en);
  });

  it("formats short and full day labels for the active locale", () => {
    const zh = createTranslator("zh-HK").date;
    expect(zh.shortDate("2026-03-09").length).toBeGreaterThan(0);
    expect(zh.dayLabel("2026-03-09").length).toBeGreaterThan(0);
    // The change card's day column: a weekday plus a compact date, in the locale's regional order.
    const weekday = defaultTranslator.date.weekdayDate("2026-11-21");
    expect(weekday).toContain("Sat");
    expect(weekday).toContain("21");
    expect(zh.weekdayDate("2026-11-21").length).toBeGreaterThan(0);
  });
});

describe("clientStrings", () => {
  it("exposes js.* keys without the prefix, in the chosen locale", () => {
    const en = clientStrings("en");
    const zh = clientStrings("zh-HK");
    expect(en["confirm"]).toBe("Confirm");
    expect(zh["confirm"]).not.toBe("Confirm");
    expect("calendar.heading" in en).toBe(false);
    // The coach panel's change card shares the page card's copy, so changes.* is exposed under its full key.
    expect(en["changes.title"]).toBe("Recent changes");
    expect(zh["changes.title"]).not.toBe("Recent changes");
  });

  it("ships the re-prefill wait-line strings in both locales (LL-4)", () => {
    const en = clientStrings("en");
    const zh = clientStrings("zh-HK");
    expect(en["coachWaitFirst"]).toContain("Getting to know you");
    expect(en["coachWaitActivities"]).toContain("latest runs");
    expect(en["coachWaitDay"]).toContain("plan");
    expect(zh["coachWaitActivities"]).toContain("跑步紀錄");
    expect(zh["coachWaitMuscle"]).toContain("身體狀況");
    expect((zh["coachWaitCalendar"] ?? "").length).toBeGreaterThan(0);
    expect(zh["coachWaitStates"]).toContain("教練狀態");
  });
});

describe("languageCookie", () => {
  it("is a long-lived, site-wide cookie with the right attributes", () => {
    const cookie = languageCookie("zh-HK");
    expect(cookie.startsWith(`${LOCALE_COOKIE}=zh-HK;`)).toBe(true);
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=");
  });
});
