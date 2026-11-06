import { afterEach, describe, expect, it } from "vitest";
import { createStore } from "../src/store";
import { createWeb } from "../src/web";
import type { GarminClient } from "../src/garmin";

const USER = "demo-runner";
const TODAY = "2026-11-05";

const start = async (garmin?: GarminClient) => {
  const handle = createStore(":memory:");
  handle.store.upsertSession({
    sessionId: "s1",
    userId: USER,
    day: "2026-11-06",
    title: "Easy 5 km",
    kind: "easy",
    distanceKm: 5,
    durationMin: 35,
    note: "conversational",
    createdAt: `${TODAY}T00:00:00.000Z`,
  });
  const web = createWeb({
    store: handle.store,
    tokens: { "demo-token": USER },
    chatUrl: "http://chat.test",
    now: () => `${TODAY}T08:00:00.000Z`,
    ...(garmin === undefined ? {} : { garmin }),
  });
  await new Promise<void>((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  const address = web.server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { handle, web, base: `http://127.0.0.1:${port}` };
};

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("private calendar", () => {
  it("requires a token and then shows the month", async () => {
    const { handle, web, base } = await start();
    cleanup = async () => {
      await web.close();
      handle.close();
    };
    const denied = await fetch(`${base}/calendar`, { redirect: "manual" });
    expect(denied.status).toBe(303);
    expect(denied.headers.get("location")).toBe("/login");

    const login = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "token=demo-token",
      redirect: "manual",
    });
    expect(login.status).toBe(303);
    expect(login.headers.get("location")).toBe("/calendar");
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

    const page = await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } });
    const html = await page.text();
    expect(html).toContain("Easy 5 km");
    expect(html).toContain("November 2026");
  });

  it("shows a day with the booked session and a chat link", async () => {
    const { handle, web, base } = await start();
    cleanup = async () => {
      await web.close();
      handle.close();
    };
    const page = await fetch(`${base}/day/2026-11-06`, { headers: { cookie: "poc3=demo-token" } });
    const html = await page.text();
    expect(html).toContain("Easy 5 km");
    expect(html).toContain("http://chat.test");
  });

  it("syncs Garmin activities into the calendar", async () => {
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities() {
        return [
          {
            activityId: 900001,
            activityName: "Morning run",
            startTimeLocal: "2026-11-04 07:00:00",
            distance: 4200,
            duration: 1680,
            averageSpeed: 2.5,
            averageHR: 150,
          },
        ];
      },
    };
    const { handle, web, base } = await start(garmin);
    cleanup = async () => {
      await web.close();
      handle.close();
    };
    const response = await fetch(`${base}/sync`, { method: "POST", headers: { cookie: "poc3=demo-token" }, redirect: "manual" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/calendar?synced=1");
    expect(handle.store.listActivities(USER)).toHaveLength(1);
  });
});

describe("in-calendar coach bubble", () => {
  it("renders the bubble on the calendar page", async () => {
    const { handle, web, base } = await start();
    cleanup = async () => {
      await web.close();
      handle.close();
    };
    const page = await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie: "poc3=demo-token" } });
    const html = await page.text();
    expect(html).toContain('id="coach-bubble"');
    expect(html).toContain("fetch('/chat'");
    expect(html).toContain('id="coach-panel"');
    expect(html).toContain('data-month="2026-11"');
    expect(html).toContain('data-day="2026-11-06"');
    expect(html).toContain("refreshCalendar");
    expect(html).toContain("animateChanges");
    expect(html).toContain("before.length * 140");
  });

  it("proxies a chat turn through the calendar origin", async () => {
    const handle = createStore(":memory:");
    const web = createWeb({
      store: handle.store,
      tokens: { "demo-token": USER },
      chatUrl: "http://chat.test",
      gatewayUrl: "http://gateway.test",
      modelId: "poc3-coach",
      now: () => `${TODAY}T08:00:00.000Z`,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "Booked two runs." } }], poc3: { sessions: 2, changes: [{ action: "add", toDay: "2026-11-06", title: "Easy 5 km", kind: "easy" }] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });
    await new Promise<void>((resolve) => web.server.listen(0, "127.0.0.1", resolve));
    const address = web.server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    cleanup = async () => {
      await web.close();
      handle.close();
    };
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "poc3=demo-token" },
      body: JSON.stringify({ message: "Plan my week" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { reply: string; sessions: number; changes: unknown[] };
    expect(body.reply).toBe("Booked two runs.");
    expect(body.sessions).toBe(2);
    expect(body.changes).toHaveLength(1);
  });

  it("refuses chat without a session", async () => {
    const { handle, web, base } = await start();
    cleanup = async () => {
      await web.close();
      handle.close();
    };
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hi" }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
  });
});

describe("calendar auto-refresh data", () => {
  it("returns sessions and activity counts for the month grid", async () => {
    const { handle, web, base } = await start();
    cleanup = async () => {
      await web.close();
      handle.close();
    };
    const response = await fetch(`${base}/calendar/data?month=2026-11`, { headers: { cookie: "poc3=demo-token" } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { month: string; days: Record<string, { sessions: Array<{ title: string }>; activities: number }> };
    expect(body.month).toBe("2026-11");
    expect(body.days["2026-11-06"]?.sessions[0]?.title).toBe("Easy 5 km");
    expect(body.days["2026-11-06"]?.activities).toBe(0);
  });

  it("refuses the data endpoint without a session", async () => {
    const { handle, web, base } = await start();
    cleanup = async () => {
      await web.close();
      handle.close();
    };
    const response = await fetch(`${base}/calendar/data?month=2026-11`, { redirect: "manual" });
    expect(response.status).toBe(303);
  });
});

