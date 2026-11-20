import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createAuth, type Auth, type AuthUser } from "../src/auth";
import { GarminError, mapGarminActivity, type GarminClient } from "../src/garmin";
import { createStore, type StoreHandle } from "../src/store";
import type { ChangeSet, CoachStateKey, CoachStateRecord, SessionKind, Store } from "../src/types";
import { createWeb } from "../src/web";

const TODAY = "2026-11-05";
const SECRET = "web-test-secret";
const PASSWORD = "correct-horse-battery";
const USERNAME = "demo_runner";
const DISPLAY_NAME = "Demo Runner";

const cookieFrom = (setCookie: string): string => setCookie.split(";")[0] ?? "";

const sessionCookieFrom = (response: Response): string => {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (response.headers.get("set-cookie") ?? "").split(/,\s*(?=poc3sid=)/);
  return setCookies.find((value) => value.startsWith("poc3sid="))?.split(";")[0] ?? "";
};

const formBody = (values: Record<string, string>): string => new URLSearchParams(values).toString();

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of cleanups.splice(0).reverse()) await stop();
});

interface StartOptions {
  garmin?: GarminClient;
  garminFactory?: (apiKey: string) => GarminClient;
  sessionSync?: boolean;
  /** Large values keep a seeded sync timestamp fresh so sync-aware day states stay testable. */
  autoSyncMinutes?: number;
  gatewayUrl?: string;
  seed?: (store: Store, user: AuthUser) => void;
}

interface Harness {
  handle: StoreHandle;
  auth: Auth;
  web: ReturnType<typeof createWeb>;
  base: string;
  user: AuthUser;
  cookie: string;
}

const seedSession = (
  store: Store,
  userId: string,
  sessionId: string,
  day: string,
  title: string,
  kind: SessionKind,
  distanceKm: number | null,
): void => {
  store.upsertSession({
    sessionId,
    userId,
    day,
    title,
    kind,
    distanceKm,
    durationMin: distanceKm === null ? null : distanceKm * 7,
    note: null,
    createdAt: `${TODAY}T00:00:00.000Z`,
  });
};

const seedActivity = (
  store: Store,
  userId: string,
  activityId: string,
  day: string,
  title: string,
  distanceKm: number | null,
): void => {
  store.appendActivity({
    activityId,
    userId,
    day,
    title,
    distanceKm,
    durationMin: 30,
    paceSecPerKm: 360,
    avgHr: 145,
    source: "garmin",
    createdAt: `${TODAY}T08:00:00.000Z`,
  });
};

const seedCoachState = (
  store: Store,
  userId: string,
  key: CoachStateKey,
  overrides: Partial<CoachStateRecord> = {},
): CoachStateRecord => {
  const record: CoachStateRecord = {
    stateId: `state:${key}`,
    userId,
    key,
    status: "active",
    source: "user",
    confidence: 1,
    evidence: [`${key} evidence`],
    activatedAt: `${TODAY}T07:00:00.000Z`,
    updatedAt: `${TODAY}T07:00:00.000Z`,
    expiresAt: "2026-11-20T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
  store.appendCoachState(record);
  return record;
};

const seedNotification = (store: Store, userId: string, index: number): void => {
  store.appendNotification({
    notificationId: `notification:${index}`,
    userId,
    source: "garmin",
    status: "success",
    title: `Notification ${index}`,
    body: "Body",
    href: "/history",
    createdAt: `${TODAY}T08:00:00.000Z`,
    readAt: null,
  });
};

const garminActivity = {
  activityId: 900001,
  activityName: "Morning run",
  startTimeLocal: "2026-11-04 07:00:00",
  distance: 4200,
  duration: 1680,
  averageSpeed: 2.5,
  averageHR: 150,
};

interface FakeGarminOptions {
  activities?: unknown[];
  error?: Error;
  calls?: { count: number };
}

const fakeGarminClient = (options: FakeGarminOptions = {}): GarminClient => ({
  async token() {
    return "jwt";
  },
  async listActivities() {
    if (options.calls !== undefined) options.calls.count += 1;
    if (options.error !== undefined) throw options.error;
    return options.activities ?? [];
  },
});

const fakeGarminFactory = (options: FakeGarminOptions = {}) => (apiKey: string): GarminClient => {
  if (apiKey !== "valid-key-123") {
    return {
      async token() {
        throw new GarminError("bad key", 401);
      },
      async listActivities() {
        return [];
      },
    };
  }
  return fakeGarminClient(options);
};

const start = async (options: StartOptions = {}): Promise<Harness> => {
  const handle = createStore(":memory:");
  const auth = createAuth({
    store: handle.store,
    secret: SECRET,
    now: () => `${TODAY}T08:00:00.000Z`,
  });
  const signup = auth.signup({
    username: USERNAME,
    password: PASSWORD,
    displayName: DISPLAY_NAME,
    timezone: "Asia/Hong_Kong",
    goal: "Run a half marathon",
  });
  const user = signup.user;
  seedSession(handle.store, user.userId, "session:easy", "2026-11-06", "Easy 5 km", "easy", 5);
  options.seed?.(handle.store, user);
  const login = auth.login({ username: USERNAME, password: PASSWORD });
  const web = createWeb({
    store: handle.store,
    auth,
    ...(options.gatewayUrl === undefined ? {} : { gatewayUrl: options.gatewayUrl }),
    ...(options.garmin === undefined ? {} : { garmin: options.garmin }),
    ...(options.garminFactory === undefined ? {} : { garminFactory: options.garminFactory }),
    ...(options.autoSyncMinutes === undefined ? {} : { autoSyncMinutes: options.autoSyncMinutes }),
    sessionSync: options.sessionSync ?? false,
    now: () => `${TODAY}T08:00:00.000Z`,
  });
  await new Promise<void>((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  const address = web.server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  cleanups.push(async () => {
    await web.close();
    handle.close();
  });
  return { handle, auth, web, base: `http://127.0.0.1:${port}`, user, cookie: cookieFrom(login.cookie) };
};



interface MockGateway {
  url: string;
  seenUser(): string | undefined;
  seenMessage(): string | undefined;
  seenRequestId(): string | undefined;
  seenDirective(): unknown;
}

interface MockGatewayOptions {
  failures?: unknown[];
  poc3?: Record<string, unknown>;
}

const startMockGateway = async (options: MockGatewayOptions = {}): Promise<MockGateway> => {
  let seenUser: string | undefined;
  let seenMessage: string | undefined;
  let seenRequestId: string | undefined;
  let seenDirective: unknown;
  const server = createServer((request, response) => {
    void (async (): Promise<void> => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        messages?: Array<{ role?: string; content?: string }>;
        poc3?: { directive?: unknown };
      };
      seenUser = typeof request.headers["x-poc3-user"] === "string" ? request.headers["x-poc3-user"] : undefined;
      seenMessage = body.messages?.[0]?.content;
      seenDirective = body.poc3?.directive;
      seenRequestId =
        typeof request.headers["x-poc3-request-id"] === "string" ? request.headers["x-poc3-request-id"] : undefined;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          choices: [{ message: { content: "Booked two runs." } }],
          poc3: {
            sessions: 2,
            memories: 1,
            changes: [{ action: "add", toDay: "2026-11-06", title: "Easy 5 km", kind: "easy" }],
            changeSetId: "change:test",
            reverted: false,
            suggestions: ["Book my long run for Sunday", "Move Thursday to Friday"],
            failures: options.failures ?? [],
            ...options.poc3,
          },
        }),
      );
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return {
    url: `http://127.0.0.1:${port}`,
    seenUser: () => seenUser,
    seenMessage: () => seenMessage,
    seenRequestId: () => seenRequestId,
    seenDirective: () => seenDirective,
  };
};

describe("authentication pages", () => {
  it("redirects unauthenticated requests and serves login and signup", async () => {
    const { base } = await start();
    for (const path of ["/calendar", "/day/2026-11-06", "/profile", "/history", "/chat/history", "/calendar/data?month=2026-11"]) {
      const response = await fetch(`${base}${path}`, { redirect: "manual" });
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/login");
    }

    const chat = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hi" }),
      redirect: "manual",
    });
    expect(chat.status).toBe(303);
    expect(chat.headers.get("location")).toBe("/login");

    const loginPage = await fetch(`${base}/login`);
    expect(loginPage.status).toBe(200);
    const loginHtml = await loginPage.text();
    expect(loginHtml).toContain('action="/login"');
    expect(loginHtml).toContain('name="username"');
    expect(loginHtml).toContain('type="password"');
    expect(loginHtml).not.toContain("demo-token");

    const signupPage = await fetch(`${base}/signup`);
    expect(signupPage.status).toBe(200);
    const signupHtml = await signupPage.text();
    expect(signupHtml).toContain('action="/signup"');
    expect(signupHtml).toContain('name="displayName"');
    expect(signupHtml).toContain('value="Asia/Hong_Kong"');
    expect(signupHtml).toContain('name="goal"');
  });

  it("signs up, logs in, rejects a bad password and logs out", async () => {
    const { base, handle } = await start();
    const signup = await fetch(`${base}/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        username: "new_runner",
        displayName: "New Runner",
        password: "new-password-123",
        timezone: "Asia/Taipei",
        goal: "10k in eight weeks",
      }),
      redirect: "manual",
    });
    expect(signup.status).toBe(303);
    expect(signup.headers.get("location")).toBe("/calendar");
    const signupCookie = cookieFrom(signup.headers.get("set-cookie") ?? "");
    expect(signupCookie.startsWith("poc3_session=")).toBe(true);
    expect(handle.store.getUserByUsername("new_runner")?.displayName).toBe("New Runner");
    expect(handle.store.getUserByUsername("new_runner")?.goal).toBe("10k in eight weeks");

    const calendar = await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie: signupCookie } });
    expect(calendar.status).toBe(200);
    const calendarHtml = await calendar.text();
    expect(calendarHtml).toContain("Welcome back, New Runner");
    expect(calendarHtml).toContain("Your training calendar");
    expect(calendarHtml).toContain('class="chip action"');

    const duplicate = await fetch(`${base}/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({
        username: "NEW_RUNNER",
        displayName: "Duplicate",
        password: "new-password-123",
        timezone: "Asia/Taipei",
      }),
      redirect: "manual",
    });
    expect(duplicate.status).toBe(303);
    expect(duplicate.headers.get("location")).toContain("/signup?error=");

    const badLogin = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ username: USERNAME, password: "wrong-password" }),
      redirect: "manual",
    });
    expect(badLogin.status).toBe(303);
    expect(badLogin.headers.get("location")).toContain("/login?error=");

    const login = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ username: USERNAME, password: PASSWORD }),
      redirect: "manual",
    });
    expect(login.status).toBe(303);
    expect(login.headers.get("location")).toBe("/calendar");
    const cookie = cookieFrom(login.headers.get("set-cookie") ?? "");
    const page = await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Welcome back, Demo Runner");

    const logout = await fetch(`${base}/logout`, { headers: { cookie }, redirect: "manual" });
    expect(logout.status).toBe(303);
    expect(logout.headers.get("location")).toBe("/login");
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("shows the username read-only and updates the profile and password", async () => {
    const { base, handle, user, cookie } = await start();
    const page = await fetch(`${base}/profile`, { headers: { cookie } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(USERNAME);
    expect(html).toContain("readonly");
    expect(html).toContain(`value="${DISPLAY_NAME}"`);
    expect(html).toContain('action="/profile"');
    expect(html).not.toContain("view-switch");
    expect(html).not.toContain("view-tab");
    expect(html).toContain('href="/coach-states"');
    expect(html).not.toContain('href="/coach-audit"');
    expect(html).not.toContain("hidden directives");

    const update = await fetch(`${base}/profile`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: formBody({
        displayName: "Updated Runner",
        timezone: "Europe/Berlin",
        goal: "10K plan",
        password: "new-password-456",
      }),
      redirect: "manual",
    });
    expect(update.status).toBe(303);
    // The goal changed, so the redirect also flags the tell-the-coach offer.
    expect(update.headers.get("location")).toBe("/profile?saved=1&goal=1");
    const stored = handle.store.getUser(user.userId);
    expect(stored?.displayName).toBe("Updated Runner");
    expect(stored?.timezone).toBe("Europe/Berlin");
    expect(stored?.goal).toBe("10K plan");

    const updatedPage = await fetch(`${base}/profile?saved=1`, { headers: { cookie } });
    const updatedHtml = await updatedPage.text();
    expect(updatedHtml).toContain("Profile saved.");
    expect(updatedHtml).toContain("Updated Runner");
    expect(updatedHtml).toContain('href="/logout"');

    const oldLogin = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ username: USERNAME, password: PASSWORD }),
      redirect: "manual",
    });
    expect(oldLogin.headers.get("location")).toContain("/login?error=");
    const newLogin = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ username: USERNAME, password: "new-password-456" }),
      redirect: "manual",
    });
    expect(newLogin.headers.get("location")).toBe("/calendar");
  });

  it("serves a no-content favicon so the console stays clean", async () => {
    const { base } = await start();
    const response = await fetch(`${base}/favicon.ico`);
    expect(response.status).toBe(204);
  });
});

describe("private calendar", () => {
  it("shows the authenticated runner's month, day and data only", async () => {
    const { base, auth, handle, user, cookie } = await start();
    const otherSignup = auth.signup({
      username: "other_runner",
      password: "other-password-123",
      displayName: "Other Runner",
      timezone: "UTC",
    });
    const other = otherSignup.user;
    seedSession(handle.store, other.userId, "session:other", "2026-11-07", "Other secret long run", "long", 18);
    const otherCookie = cookieFrom(auth.login({ username: "other_runner", password: "other-password-123" }).cookie);

    const ownPage = await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } });
    expect(ownPage.status).toBe(200);
    const ownHtml = await ownPage.text();
    expect(ownHtml).toContain("Easy 5 km");
    expect(ownHtml).not.toContain("Other secret long run");
    expect(ownHtml).toContain("Welcome back, Demo Runner");
    expect(ownHtml).toContain('href="/profile"');
    expect(ownHtml).toContain('href="/logout"');
    expect(ownHtml).toContain("November 2026");
    expect(ownHtml).toContain('data-active="calendar"');
    expect(ownHtml).toContain('href="/history"');
    expect(ownHtml).toContain("Training log");

    const otherPage = await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie: otherCookie } });
    const otherHtml = await otherPage.text();
    expect(otherHtml).toContain("Other secret long run");
    expect(otherHtml).not.toContain("Easy 5 km");
    expect(otherHtml).toContain("Welcome back, Other Runner");

    const ownData = (await (
      await fetch(`${base}/calendar/data?month=2026-11`, { headers: { cookie } })
    ).json()) as {
      month: string;
      days: Record<string, { items: Array<{ type: string; kind: string; label: string; tooltip: string }> }>;
    };
    expect(ownData.month).toBe("2026-11");
    expect(ownData.days["2026-11-06"]?.items[0]).toMatchObject({
      type: "plan",
      kind: "easy",
      label: "Easy 5 km",
    });
    expect(ownData.days["2026-11-06"]?.items).toHaveLength(1);
    expect(ownData.days["2026-11-07"]).toBeUndefined();

    const ownDay = await fetch(`${base}/day/2026-11-06`, { headers: { cookie } });
    const ownDayHtml = await ownDay.text();
    expect(ownDayHtml).toContain("Easy 5 km");
    expect(ownDayHtml).toContain("Booked by the coach");
    expect(ownDayHtml).toContain("Recorded activities");
    expect(ownDayHtml).not.toContain("Done (Garmin / reported)");
    expect(ownDayHtml).toContain('href="/profile"');
    expect(ownDayHtml).toContain("Demo Runner");

    const otherDay = await fetch(`${base}/day/2026-11-07`, { headers: { cookie } });
    const otherDayHtml = await otherDay.text();
    expect(otherDayHtml).not.toContain("Other secret long run");

    const foreignDay = await fetch(`${base}/day/2026-11-07`, { headers: { cookie: otherCookie } });
    expect(await foreignDay.text()).toContain("Other secret long run");
    expect(handle.store.getUser(user.userId)?.username).toBe(USERNAME);
  });

  it("shows planned and recorded descriptions as pills instead of a tick count", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Morning run", 4.2);
        seedActivity(store, runner.userId, "garmin:2", "2026-11-04", "Evening shakeout", 3);
      },
    });

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('class="cal-pill plan kind-easy"');
    expect(html).toContain("Easy 5 km");
    expect(html).toContain('class="cal-pill record"');
    expect(html).toContain("Morning run");
    expect(html).toContain("Evening shakeout");
    expect(html).toContain("Planned session · Easy · Easy 5 km · 5 km · 35 min");
    expect(html).toContain("Recorded run · Morning run · 4.2 km · 30 min · 6:00/km · 145 bpm · Garmin");
    expect(html).toContain('<span class="cal-meta">4.2 km</span>');
    // "Easy 5 km" already states its distance, so the row keeps the whole title and no second amount.
    expect(html).not.toContain('<span class="cal-meta">35 min</span>');
    expect(html).toContain('<span class="cal-glyph" aria-hidden="true">✓</span>');
    expect(html).toContain('<span class="sr-only">Planned session: </span>');
    expect(html).toContain('<span class="sr-only">Recorded run: </span>');
    expect(html).toContain('<span class="cal-pill record" data-activity-id="garmin:1" data-source="garmin" role="button" tabindex="0" aria-haspopup="dialog"');
    expect(html).toContain("Recorded run: Morning run (4.2 km). Show run details");
    expect(html).not.toContain('class="done"');
    expect(html).not.toContain("✓ 2");

    const data = (await (
      await fetch(`${base}/calendar/data?month=2026-11`, { headers: { cookie } })
    ).json()) as { days: Record<string, { items: Array<{ type: string; activityId?: string }>; html: string }> };
    const recordIds = (data.days["2026-11-04"]?.items ?? [])
      .filter((item) => item.type === "record")
      .map((item) => item.activityId)
      .sort();
    expect(recordIds).toEqual(["garmin:1", "garmin:2"]);
    // The refresh fragment is the same server-rendered row markup as the first paint.
    expect(data.days["2026-11-04"]?.html).toContain('class="cal-pill record"');
    expect(data.days["2026-11-04"]?.html).toContain('<span class="cal-meta">4.2 km</span>');
  });

  it("caps a busy day at four pills and keeps the rest behind an overflow hint", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        for (let index = 1; index <= 5; index += 1) {
          seedActivity(store, runner.userId, `garmin:${index}`, "2026-11-03", `Run ${index}`, 3 + index);
        }
      },
    });

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html.match(/class="cal-pill record"/g) ?? []).toHaveLength(4);
    expect(html).toContain("+1 more");
    expect(html).not.toContain("Run 1");

    const data = (await (
      await fetch(`${base}/calendar/data?month=2026-11`, { headers: { cookie } })
    ).json()) as { days: Record<string, { items: unknown[] }> };
    expect(data.days["2026-11-03"]?.items).toHaveLength(5);
  });

  it("keeps same-titled runs distinguishable and leaves the plan title whole", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:17a", "2026-11-17", "新界 跑步", 1.7);
        seedActivity(store, runner.userId, "garmin:17b", "2026-11-17", "新界 跑步", 4.2);
        seedActivity(store, runner.userId, "garmin:17c", "2026-11-17", "新界 跑步", 2.1);
        seedSession(store, runner.userId, "session:recovery", "2026-11-17", "恢復輕鬆跑", "easy", 6);
      },
    });

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    // Three runs with the same title keep their own amount, so they no longer look like one repeated button.
    expect(html).toContain('<span class="cal-meta">1.7 km</span>');
    expect(html).toContain('<span class="cal-meta">4.2 km</span>');
    expect(html).toContain('<span class="cal-meta">2.1 km</span>');
    // The plan title stays whole; its amount moves into the typed meta slot instead of being cut off inside the label.
    expect(html).toContain('<span class="cal-text">恢復輕鬆跑</span><span class="cal-meta">6 km</span>');
    expect(html).toContain('aria-label="Planned session: Easy, 恢復輕鬆跑 (6 km). Show session details"');
    expect(html).toContain('<span class="cal-items">');

    const data = (await (
      await fetch(`${base}/calendar/data?month=2026-11`, { headers: { cookie } })
    ).json()) as {
      days: Record<string, { items: Array<{ type: string; meta?: string | null }>; html: string }>;
    };
    expect(data.days["2026-11-17"]?.items.map((item) => item.type)).toEqual(["plan", "record", "record", "record"]);
    expect(data.days["2026-11-17"]?.items[0]?.meta).toBe("6 km");
    expect((data.days["2026-11-17"]?.items ?? []).slice(1).map((item) => item.meta).sort()).toEqual([
      "1.7 km",
      "2.1 km",
      "4.2 km",
    ]);
    expect(data.days["2026-11-17"]?.html).toContain('<span class="cal-meta">4.2 km</span>');
    // The first paint and the refresh fragment come from the same renderer; the client only swaps the slot.
    const painted = html.match(/<a class="cell[^"]*" data-day="2026-11-17"[\s\S]*?<span class="cal-items">([\s\S]*?)<\/span>\s*<\/a>/)?.[1];
    expect(painted?.trim()).toBe(data.days["2026-11-17"]?.html);
  });

  it("syncs Garmin activities into the authenticated user's calendar", async () => {
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
          {
            activityId: 900000,
            activityName: "Old run",
            startTimeLocal: "2026-06-01 07:00:00",
            distance: 4200,
            duration: 1680,
            averageSpeed: 2.5,
            averageHR: 150,
          },
        ];
      },
    };
    const { base, handle, user, cookie } = await start({ garmin });
    const response = await fetch(`${base}/sync`, { method: "POST", headers: { cookie }, redirect: "manual" });
    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    const params = new URL(location, "http://localhost").searchParams;
    expect(params.get("synced")).toBe("1");
    expect(params.get("newest")).toBe("garmin:900001");
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);
    expect(handle.store.listActivities(user.userId)[0]?.title).toBe("Morning run");
  });

  it("syncs from the training log and upserts repeated Garmin activities", async () => {
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities() {
        return [
          {
            activityId: 900002,
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
    const { base, handle, user, cookie } = await start({ garmin });
    const sync = (): Promise<Response> => fetch(`${base}/sync`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: "next=%2Fhistory",
      redirect: "manual",
    });
    const first = await sync();
    expect(first.status).toBe(303);
    const firstLocation = first.headers.get("location") ?? "";
    const firstParams = new URL(firstLocation, "http://localhost").searchParams;
    expect(firstParams.get("synced")).toBe("1");
    expect(firstParams.get("newest")).toBe("garmin:900002");
    const second = await sync();
    expect(second.status).toBe(303);
    const secondLocation = second.headers.get("location") ?? "";
    const secondParams = new URL(secondLocation, "http://localhost").searchParams;
    expect(secondParams.get("synced")).toBe("1");
    expect(secondParams.get("newest")).toBeNull();
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);

    const historyHtml = await (await fetch(`${base}${firstLocation}`, { headers: { cookie } })).text();
    expect(historyHtml).toContain("Review this run with the coach");
    expect(historyHtml).toContain("Morning run");
    const secondHtml = await (await fetch(`${base}${secondLocation}`, { headers: { cookie } })).text();
    expect(secondHtml).not.toContain("New run synced");
    expect(secondHtml).not.toContain("Garmin sync: 1 imported");
    const notes = handle.store.listNotifications(user.userId);
    expect(notes.filter((note) => note.title === "Garmin sync: no new activities")).toHaveLength(1);
    expect(notes.filter((note) => note.title === "Garmin sync: 1 new activity")).toHaveLength(1);
  });
});

describe("calendar run peek", () => {
  it("returns display-ready detail, plan match, efforts and actions for one run", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedSession(store, runner.userId, "session:peek", "2026-11-07", "Easy 5 km", "easy", 5);
        store.appendActivity({
          activityId: "garmin:peek-1",
          userId: runner.userId,
          day: "2026-11-07",
          title: "Morning run",
          distanceKm: 5.2,
          durationMin: 34,
          paceSecPerKm: 392,
          avgHr: 146,
          source: "garmin",
          createdAt: `${TODAY}T08:00:00.000Z`,
          trainingLoad: 85,
          trainingEffectLabel: "AEROBIC_BASE",
          fastest1kSec: 320,
          fastest1miSec: 540,
          fastest5kSec: 1700,
          elevationGainM: 42,
          calories: 320,
          maxHr: 172,
          cadenceSpm: 174,
        });
      },
    });

    const response = await fetch(`${base}/activity/${encodeURIComponent("garmin:peek-1")}/peek`, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      peek: {
        activityId: string;
        title: string;
        day: string;
        dayLabel: string;
        source: string;
        sourceLabel: string;
        metrics: string;
        extra: Array<{ label: string; value: string }>;
        efforts: Array<{ label: string; value: string; pr: boolean }>;
        plan: { status: string; label: string; title: string | null; planned: string | null };
        coachPrompt: string;
        coachIntent: { kind: string; activityId: string; source: string };
        links: { detail: string; day: string; week: string };
      };
    };
    expect(body.peek.activityId).toBe("garmin:peek-1");
    expect(body.peek.title).toBe("Morning run");
    expect(body.peek.day).toBe("2026-11-07");
    expect(body.peek.dayLabel).toBe("Sat, 7 Nov 2026");
    expect(body.peek.source).toBe("garmin");
    expect(body.peek.sourceLabel).toBe("Garmin");
    expect(body.peek.metrics).toBe("5.2 km · 34 min · 6:32/km · 146 bpm");
    expect(body.peek.extra).toEqual([
      { label: "Training load", value: "85" },
      { label: "Effect", value: "Aerobic Base" },
      { label: "Elevation", value: "+42 m" },
      { label: "Calories", value: "320 kcal" },
      { label: "Max HR", value: "172 bpm" },
      { label: "Cadence", value: "174 spm" },
    ]);
    expect(body.peek.efforts).toEqual([
      { label: "1 km", value: "5:20", pr: true },
      { label: "1 mi", value: "9:00", pr: true },
      { label: "5 km", value: "28:20", pr: true },
    ]);
    expect(body.peek.plan).toEqual({
      status: "on-plan",
      label: "On plan +0.2 km",
      title: "Easy 5 km",
      planned: "Easy · 5 km · 35 min",
    });
    expect(body.peek.coachPrompt).toBe("How did my Morning run go? (Sat, 7 Nov 2026 · 5.2 km · 34 min)");
    expect(body.peek.coachIntent).toEqual({
      kind: "review-activity",
      activityId: "garmin:peek-1",
      source: "run-peek",
    });
    expect(body.peek.links).toEqual({
      detail: "/activity/garmin%3Apeek-1",
      day: "/day/2026-11-07",
      week: "/history?view=week&period=2026-11-02",
    });
  });

  it("identifies the exact run when several records share the same title", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:same-1", "2026-11-01", "晨跑 跑步", 2.6);
        seedActivity(store, runner.userId, "garmin:same-2", "2026-11-03", "晨跑 跑步", 5.4);
      },
    });
    const read = async (activityId: string): Promise<{ coachPrompt: string; coachIntent: { activityId: string } }> => {
      const response = await fetch(`${base}/activity/${encodeURIComponent(activityId)}/peek`, { headers: { cookie } });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { peek: { coachPrompt: string; coachIntent: { activityId: string } } };
      return body.peek;
    };
    const first = await read("garmin:same-1");
    const second = await read("garmin:same-2");
    expect(first.coachPrompt).toBe("How did my 晨跑 跑步 go? (Sun, 1 Nov 2026 · 2.6 km · 30 min)");
    expect(second.coachPrompt).toBe("How did my 晨跑 跑步 go? (Tue, 3 Nov 2026 · 5.4 km · 30 min)");
    expect(first.coachPrompt).not.toBe(second.coachPrompt);
    expect(first.coachIntent.activityId).toBe("garmin:same-1");
    expect(second.coachIntent.activityId).toBe("garmin:same-2");
  });

  it("marks an unmatched run unplanned and hides another runner's run", async () => {
    const { base, auth, handle, user, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:solo", "2026-11-09", "Solo run", 7);
      },
    });

    const own = await fetch(`${base}/activity/${encodeURIComponent("garmin:solo")}/peek`, { headers: { cookie } });
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as {
      peek: { plan: { status: string; label: string; title: string | null; planned: string | null } };
    };
    expect(ownBody.peek.plan).toEqual({ status: "unplanned", label: "Unplanned", title: null, planned: null });

    const otherSignup = auth.signup({
      username: "other_peek",
      password: "other-password-123",
      displayName: "Other Peek",
      timezone: "UTC",
    });
    seedActivity(handle.store, otherSignup.user.userId, "garmin:other", "2026-11-09", "Other secret run", 6);

    const foreign = await fetch(`${base}/activity/${encodeURIComponent("garmin:other")}/peek`, { headers: { cookie } });
    expect(foreign.status).toBe(404);
    expect(foreign.headers.get("content-type")).toContain("application/json");
    const missing = await fetch(`${base}/activity/${encodeURIComponent("garmin:missing")}/peek`, { headers: { cookie } });
    expect(missing.status).toBe(404);
    const malformed = await fetch(`${base}/activity/%E0%A4%A/peek`, { headers: { cookie } });
    expect(malformed.status).toBe(404);
    expect(handle.store.getUser(user.userId)?.username).toBe(USERNAME);
  });

  it("renders the peek popup hooks and wires the recorded-run pills", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Morning run", 4.2);
      },
    });

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('data-activity-id="garmin:1"');
    expect(html).toContain("openActivityPeek");
    expect(html).toContain("activity-peek");
    expect(html).toContain("peek-actions");
    expect(html).toContain("peek-grid");
    expect(html).toContain("peek-efforts");
    expect(html).toContain("peek-program");
    expect(html).toContain("Training program · Garmin");
    expect(html).toContain("renderPeekSteps");
    expect(html).toContain("peek-step-head");
    expect(html).toContain("programSummary === programTitle");
    expect(html).toContain("summaryText");
    expect(html).not.toContain("renderWorkoutPeek");
    expect(html).not.toContain("/workout/");
    expect(html).not.toContain("data-workout-id");
    expect(html).toContain("Training log week");
    expect(html).toContain("View day");
    expect(html).toContain("Open full detail");
    expect(html).toContain("app.css?v=");

    const css = await (await fetch(`${base}/static/app.css`)).text();
    expect(css).toContain("#activity-peek");
    expect(css).toContain(".peek-grid");
    expect(css).toContain(".peek-program");
    expect(css).toContain(".peek-step-head");
    expect(css).toContain(".peek-effort.pr");
    expect(css).toContain(".peek-actions .btn");
    expect(css).toContain(".cal-pill.record:focus-visible");
  });
});

describe("calendar session peek", () => {
  it("returns the plan, outcome and actions for one upcoming session", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        store.upsertSession({
          sessionId: "session:tempo",
          userId: runner.userId,
          day: "2026-11-12",
          title: "Tempo 8 km",
          kind: "tempo",
          distanceKm: 8,
          durationMin: 50,
          note: "3 ? 10 min at threshold",
          createdAt: `${TODAY}T00:00:00.000Z`,
        });
      },
    });

    const response = await fetch(`${base}/session/${encodeURIComponent("session:tempo")}/peek`, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      peek: {
        sessionId: string;
        title: string;
        day: string;
        dayLabel: string;
        kind: string;
        kindLabel: string;
        metrics: string;
        note: string | null;
        outcome: { status: string; label: string; detail: string | null; activityId: string | null };
        coachPrompt: string;
        coachIntent: { kind: string; day: string; source: string };
        links: { day: string; week: string; activity: string | null };
      };
    };
    expect(body.peek).toEqual({
      sessionId: "session:tempo",
      title: "Tempo 8 km",
      day: "2026-11-12",
      dayLabel: "Thu, 12 Nov 2026",
      kind: "tempo",
      kindLabel: "Tempo",
      metrics: "8 km · 50 min",
      note: "3 ? 10 min at threshold",
      intent: {
        purpose: "Threshold. Teach your body to hold a comfortably hard effort.",
        effort: "Comfortably hard, RPE 6-7/10, roughly an hour-race effort; even splits.",
      },
      outcome: { status: "upcoming", label: "Upcoming", detail: null, activityId: null },
      coachPrompt: "What should I focus on in my Tempo 8 km on Thu, 12 Nov 2026?",
      coachIntent: { kind: "review-day", day: "2026-11-12", source: "session-peek" },
      links: { day: "/day/2026-11-12", week: "/history?view=week&period=2026-11-09", activity: null },
    });
  });

  it("marks a session completed when the day's run matches it", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedSession(store, runner.userId, "session:matched", "2026-11-07", "Easy 5 km", "easy", 5);
        seedActivity(store, runner.userId, "garmin:matched", "2026-11-07", "Morning run", 5.2);
      },
    });

    const response = await fetch(`${base}/session/${encodeURIComponent("session:matched")}/peek`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      peek: {
        outcome: { status: string; label: string; detail: string | null; activityId: string | null };
        coachPrompt: string;
        links: { activity: string | null };
      };
    };
    expect(body.peek.outcome).toEqual({
      status: "completed",
      label: "Completed · On plan +0.2 km",
      detail: "Morning run · 5.2 km · 30 min · 6:00/km · 145 bpm",
      activityId: "garmin:matched",
    });
    expect(body.peek.coachPrompt).toBe("How did my Easy 5 km go? (Sat, 7 Nov 2026)");
    expect(body.peek.links.activity).toBe("/activity/garmin%3Amatched");
  });

  it("distinguishes a missed session from a recorded run that does not match", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedSession(store, runner.userId, "session:missed", "2026-11-01", "Easy 5 km", "easy", 5);
        seedSession(store, runner.userId, "session:unmatched", "2026-11-02", "Easy 2 km", "easy", 2);
        seedActivity(store, runner.userId, "garmin:long", "2026-11-02", "Long run", 10);
      },
    });

    const read = async (sessionId: string): Promise<{
      outcome: { status: string; label: string; detail: string | null; activityId: string | null };
      coachPrompt: string;
      links: { activity: string | null };
    }> => {
      const response = await fetch(`${base}/session/${encodeURIComponent(sessionId)}/peek`, { headers: { cookie } });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        peek: {
          outcome: { status: string; label: string; detail: string | null; activityId: string | null };
          coachPrompt: string;
          links: { activity: string | null };
        };
      };
      return body.peek;
    };

    const missed = await read("session:missed");
    expect(missed.outcome).toEqual({
      status: "missed",
      label: "Not done",
      detail: "No run was logged. The plan does not change and there is nothing to make up.",
      activityId: null,
    });
    expect(missed.coachPrompt).toBe("I planned Easy 5 km on Sun, 1 Nov 2026 but no run was logged. What should I do?");
    expect(missed.links.activity).toBeNull();

    const unmatched = await read("session:unmatched");
    expect(unmatched.outcome).toEqual({
      status: "unmatched",
      label: "Not matched",
      detail: "Recorded: Long run · 10 km · 30 min · 6:00/km · 145 bpm",
      activityId: "garmin:long",
    });
    expect(unmatched.coachPrompt).toBe("I planned Easy 2 km on Mon, 2 Nov 2026, but the recorded run does not match. What should I do?");
    expect(unmatched.links.activity).toBe("/activity/garmin%3Along");
  });

  it("shows a rest day without inventing a run and names the rest-day question", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        store.upsertSession({
          sessionId: "session:rest",
          userId: runner.userId,
          day: "2026-11-08",
          title: "Rest day",
          kind: "rest",
          distanceKm: null,
          durationMin: null,
          note: null,
          createdAt: `${TODAY}T00:00:00.000Z`,
        });
      },
    });

    const response = await fetch(`${base}/session/${encodeURIComponent("session:rest")}/peek`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      peek: {
        kindLabel: string;
        metrics: string;
        outcome: { status: string; label: string; detail: string | null; activityId: string | null };
        coachPrompt: string;
      };
    };
    expect(body.peek.kindLabel).toBe("Rest");
    expect(body.peek.metrics).toBe("");
    expect(body.peek.outcome).toEqual({
      status: "rest",
      label: "Planned rest",
      detail: "No run is expected on this day.",
      activityId: null,
    });
    expect(body.peek.coachPrompt).toBe("What should I do on my rest day, Sun, 8 Nov 2026?");
  });

  it("scopes the session peek to the signed-in runner and rejects bad requests", async () => {
    const { base, auth, handle, cookie } = await start();

    const otherSignup = auth.signup({
      username: "other_session_peek",
      password: "other-password-123",
      displayName: "Other Session Peek",
      timezone: "UTC",
    });
    seedSession(handle.store, otherSignup.user.userId, "session:other", "2026-11-06", "Other secret session", "easy", 5);

    const foreign = await fetch(`${base}/session/${encodeURIComponent("session:other")}/peek`, { headers: { cookie } });
    expect(foreign.status).toBe(404);
    expect(foreign.headers.get("content-type")).toContain("application/json");
    expect(((await foreign.json()) as { error: { detail: string } }).error.detail).toBe("session not found");

    const missing = await fetch(`${base}/session/${encodeURIComponent("session:missing")}/peek`, { headers: { cookie } });
    expect(missing.status).toBe(404);
    const malformed = await fetch(`${base}/session/%E0%A4%A/peek`, { headers: { cookie } });
    expect(malformed.status).toBe(404);
    const wrongMethod = await fetch(`${base}/session/${encodeURIComponent("session:easy")}/peek`, {
      method: "POST",
      headers: { cookie },
    });
    expect(wrongMethod.status).toBe(405);
  });

  it("forwards the session-peek Ask coach intent as a comment-only review-day directive", async () => {
    const gateway = await startMockGateway();
    const { base, cookie } = await start({ gatewayUrl: gateway.url });
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        message: "What should I focus on in my Easy 5 km on Fri, 6 Nov 2026?",
        intent: { kind: "review-day", day: "2026-11-06", source: "session-peek" },
      }),
    });
    expect(response.status).toBe(200);
    expect(gateway.seenDirective()).toMatchObject({
      mode: "review",
      allowCalendarWrites: false,
      source: "session-peek",
      references: { day: "2026-11-06" },
    });
  });

  it("wires the plan pills and the session-peek popup in the calendar grid", async () => {
    const { base, cookie } = await start();

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('class="cal-pill plan kind-easy" data-session-id="session:easy" role="button" tabindex="0" aria-haspopup="dialog"');
    expect(html).toContain("Planned session: Easy, Easy 5 km. Show session details");
    expect(html).toContain("openSessionPeek");
    expect(html).toContain("session-peek");
    expect(html).toContain("Loading session details");
    expect(html).toContain("peek-status-");
    expect(html).toContain("tr('peekViewDay', 'View day') + ' →'");
    expect(html).toContain("app.css?v=");

    const data = (await (
      await fetch(`${base}/calendar/data?month=2026-11`, { headers: { cookie } })
    ).json()) as { days: Record<string, { items: Array<{ type: string; sessionId?: string; activityId?: string }> }> };
    const planIds = (data.days["2026-11-06"]?.items ?? [])
      .filter((item) => item.type === "plan")
      .map((item) => item.sessionId);
    expect(planIds).toEqual(["session:easy"]);

    const css = await (await fetch(`${base}/static/app.css`)).text();
    expect(css).toContain(".cal-pill.plan:focus-visible");
    expect(css).toContain(".chip.kind-tempo");
    expect(css).toContain(".chip.peek-status-completed");
    expect(css).toContain(".chip.peek-status-missed");
  });
});

describe("account menu", () => {
  it("collapses profile, states, sync, key and sign out behind the runner's name", async () => {
    const { base, cookie } = await start();

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('id="account-btn"');
    expect(html).toContain('aria-haspopup="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="account-menu"');
    expect(html).toContain('class="account-menu" id="account-menu" aria-label="Account" hidden');
    expect(html).toContain("<span class=\"account-name\">Demo Runner</span>");
    expect(html).toContain("@demo_runner");
    expect(html).toContain('href="/profile"');
    expect(html).toContain('href="/coach-states"');
    expect(html).toContain("data-sync-form");
    expect(html).toContain('aria-label="Sync Garmin"');
    expect(html).toContain('href="/calendar?garmin=setup"');
    expect(html).toContain('href="/logout"');
    expect(html).toContain("getElementById('account-menu')");
    expect(html).not.toContain('<a href="/logout">Sign out</a>');
    expect(html).not.toContain('class="profile"');
    expect(html).not.toContain('href="/coach-audit"');

    const profile = await (await fetch(`${base}/profile`, { headers: { cookie } })).text();
    expect(profile).toContain('id="account-btn"');
    expect(profile).toContain('href="/logout"');
  });

  it("keeps the anonymous header as plain sign in and sign up links", async () => {
    const { base } = await start();

    const login = await (await fetch(`${base}/login`)).text();
    expect(login).not.toContain('id="account-btn"');
    expect(login).not.toContain("getElementById('account-btn')");
    expect(login).toContain('class="top-link" href="/login"');
    expect(login).toContain('class="top-link ghost" href="/signup"');
  });

  it("hides the account menu until the name is clicked", async () => {
    const { base } = await start();

    const css = await (await fetch(`${base}/static/app.css`)).text();
    expect(css).toContain(".account-menu[hidden] { display: none; }");
    expect(css).toContain(".account-item:focus-visible");
    expect(css).toContain(".account-signout { color: var(--danger); }");
    expect(css).toContain(".sync-menu-form { margin: 0; }");
    expect(css).not.toContain(".top a:last-child");
    expect(css).not.toContain(".sync-icon-form");
  });
});

describe("Garmin connection, notifications and session sync", () => {
  it("offers a sync row in the account menu and opens the key popup when no key is saved", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('data-sync-form');
    expect(html).toContain('aria-label="Sync Garmin"');
    expect(html).toContain('id="garmin-modal"');
    expect(html).toContain('id="garmin-key-toggle"');
    expect(html).toContain('id="notif-btn"');
    expect(html).toContain('class="notif-footer"');
    expect(html).toContain("Garmin key");
    expect(html).not.toContain('class="garmin-bar"');
    expect(html).not.toContain("Not connected");
    expect(html).not.toContain("GARMIN_PERSONAL_API_KEY is not set");

    const sync = await fetch(`${base}/sync`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ next: "/calendar?month=2026-11" }),
      redirect: "manual",
    });
    expect(sync.status).toBe(303);
    expect(sync.headers.get("location")).toBe("/calendar?month=2026-11&garmin=setup");
  });

  it("verifies and saves a pasted key, then syncs immediately", async () => {
    const calls = { count: 0 };
    const { base, handle, user, cookie } = await start({
      garminFactory: fakeGarminFactory({ activities: [garminActivity], calls }),
    });
    const response = await fetch(`${base}/garmin/key`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ key: "valid-key-123", next: "/calendar?month=2026-11" }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    const params = new URL(location, "http://localhost").searchParams;
    expect(params.get("synced")).toBe("1");
    expect(params.get("newest")).toBe("garmin:900001");
    expect(handle.store.getGarminKey(user.userId)?.apiKey).toBe("valid-key-123");
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);
    expect(handle.store.countUnreadNotifications(user.userId)).toBe(1);
    expect(calls.count).toBe(1);

    // Following the sync redirect shows the one-tap review card on the calendar as well as on the training log.
    const synced = await (await fetch(`${base}${location}`, { headers: { cookie } })).text();
    expect(synced).toContain("New run synced");
    expect(synced).toContain("Review this run with the coach");
    expect(synced).toContain("Morning run");

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain("Replace your Garmin key");
    expect(html).toContain("Current key ••••-123");
    expect(html).toContain('data-sync-form');
    expect(html).not.toContain('class="garmin-bar"');
    expect(html).not.toContain("Change key");
    expect(html).not.toContain("Garmin sync: 1 imported");
  });

  it("confirms a key save when Garmin has no new activities", async () => {
    const { base, handle, user, cookie } = await start({
      garminFactory: fakeGarminFactory({ activities: [garminActivity] }),
      seed: (store, runner) => {
        const mapped = mapGarminActivity(garminActivity, runner.userId);
        if (!mapped) throw new Error("fixture did not map");
        store.appendActivity(mapped);
      },
    });
    const response = await fetch(`${base}/garmin/key`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ key: "valid-key-123", next: "/calendar?month=2026-11" }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    const params = new URL(location, "http://localhost").searchParams;
    expect(params.get("synced")).toBe("1");
    expect(params.get("newest")).toBeNull();
    expect(handle.store.getGarminKey(user.userId)?.apiKey).toBe("valid-key-123");
    const notes = handle.store.listNotifications(user.userId);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe("Garmin sync: no new activities");
    expect(notes[0]?.body).toContain("1 activity checked; nothing new.");
  });

  it("rejects a key Garmin refuses, saves nothing and shows the 401 guidance", async () => {
    const { base, handle, user, cookie } = await start({ garminFactory: fakeGarminFactory() });
    const response = await fetch(`${base}/garmin/key`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ key: "bad-key-12345", next: "/calendar?month=2026-11" }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("garmin=setup");
    expect(location).toContain("keyError=");
    const keyError = new URL(location, "http://localhost").searchParams.get("keyError") ?? "";
    expect(keyError).toContain("expired");
    expect(keyError).toContain("different Garmin account");
    expect(handle.store.getGarminKey(user.userId)).toBeUndefined();
    expect(handle.store.listActivities(user.userId)).toEqual([]);
    expect(handle.store.countUnreadNotifications(user.userId)).toBe(0);

    const html = await (await fetch(`${base}${location}`, { headers: { cookie } })).text();
    expect(html).toContain("Garmin rejected that key (401)");
    expect(html).toContain('id="garmin-key-toggle"');
  });

  it("records a sync success in notifications and marks it read", async () => {
    const { base, handle, user, cookie } = await start({
      garminFactory: fakeGarminFactory({ activities: [garminActivity] }),
    });
    await fetch(`${base}/garmin/key`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ key: "valid-key-123", next: "/calendar?month=2026-11" }),
      redirect: "manual",
    });

    const list = (await (await fetch(`${base}/notifications`, { headers: { cookie } })).json()) as {
      unread: number;
      notifications: Array<{ title: string; body: string; href: string }>;
    };
    expect(list.unread).toBe(1);
    expect(list.notifications[0]?.title).toBe("Garmin sync: 1 new activity");
    expect(list.notifications[0]?.body).toContain("Morning run");
    expect(list.notifications[0]?.href).toBe("/calendar?month=2026-11");

    const read = await fetch(`${base}/notifications/read`, { method: "POST", headers: { cookie } });
    expect(await read.json()).toEqual({ unread: 0 });
    const after = (await (await fetch(`${base}/notifications`, { headers: { cookie } })).json()) as {
      unread: number;
    };
    expect(after.unread).toBe(0);
  });

  it("records a sync error in notifications with the Garmin status", async () => {
    const { base, handle, user, cookie } = await start({
      garminFactory: fakeGarminFactory({ error: new GarminError("down", 503) }),
    });
    const response = await fetch(`${base}/garmin/key`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ key: "valid-key-123", next: "/calendar?month=2026-11" }),
      redirect: "manual",
    });
    expect(response.headers.get("location") ?? "").toContain("syncError=");
    expect(handle.store.getGarminKey(user.userId)?.apiKey).toBe("valid-key-123");

    const list = (await (await fetch(`${base}/notifications`, { headers: { cookie } })).json()) as {
      unread: number;
      notifications: Array<{ status: string; body: string; href: string }>;
    };
    expect(list.unread).toBe(1);
    expect(list.notifications[0]?.status).toBe("error");
    expect(list.notifications[0]?.body).toContain("unavailable");
    expect(list.notifications[0]?.href).toBe("/history");
  });

  it("auto-syncs when a new browser session starts, then reuses the session", async () => {
    const calls = { count: 0 };
    const { base, handle, user, cookie, web } = await start({
      garmin: fakeGarminClient({ activities: [garminActivity], calls }),
      sessionSync: true,
      seed: (store, runner) => {
        store.recordSync(runner.userId, "2026-11-05T06:00:00.000Z");
      },
    });

    const first = await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } });
    const firstHtml = await first.text();
    expect(firstHtml).toContain('id="notif-btn"');
    const sessionCookie = sessionCookieFrom(first);
    expect(sessionCookie).toContain("poc3sid=");
    await web.whenSynced();
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);
    expect(calls.count).toBe(1);
    expect(handle.store.countUnreadNotifications(user.userId)).toBe(1);

    await (await fetch(`${base}/calendar?month=2026-11`, {
      headers: { cookie: `${cookie}; ${sessionCookie}` },
    })).text();
    await web.whenSynced();
    expect(calls.count).toBe(1);
  });

  it("auto-syncs on login when the runner already has a key", async () => {
    const calls = { count: 0 };
    const { base, handle, user, web } = await start({
      garmin: fakeGarminClient({ activities: [garminActivity], calls }),
      sessionSync: true,
      seed: (store, runner) => {
        store.recordSync(runner.userId, "2026-11-05T06:00:00.000Z");
      },
    });

    const response = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ username: USERNAME, password: PASSWORD }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(sessionCookieFrom(response)).toContain("poc3sid=");
    await web.whenSynced();
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);
    expect(calls.count).toBe(1);
  });

  it("does not start a session sync when no key is connected", async () => {
    const { base, handle, user, cookie, web } = await start({ sessionSync: true });
    await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } });
    await web.whenSynced();
    expect(handle.store.listActivities(user.userId)).toEqual([]);
    expect(handle.store.countUnreadNotifications(user.userId)).toBe(0);
  });

  it("does not double-sync a manual sync request that creates a new session", async () => {
    const calls = { count: 0 };
    const { base, handle, user, cookie, web } = await start({
      garmin: fakeGarminClient({ activities: [garminActivity], calls }),
      sessionSync: true,
      seed: (store, runner) => {
        store.recordSync(runner.userId, "2026-11-05T06:00:00.000Z");
      },
    });

    const response = await fetch(`${base}/sync`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ next: "/calendar" }),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    const sessionCookie = sessionCookieFrom(response);
    await web.whenSynced();
    expect(calls.count).toBe(1);
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);

    await (await fetch(`${base}/calendar`, {
      headers: { cookie: `${cookie}; ${sessionCookie}` },
    })).text();
    await web.whenSynced();
    expect(calls.count).toBe(1);
  });
});

describe("training log", () => {
  it("renders actual activities with the plan, the switcher and coach actions", async () => {
    const { base, auth, handle, user, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-02", "Morning run", 5.2);
        seedActivity(store, runner.userId, "garmin:2", "2026-11-03", "Unplanned run", 3);
        store.upsertSession({
          sessionId: "session:plan",
          userId: runner.userId,
          day: "2026-11-02",
          title: "Easy 5 km",
          kind: "easy",
          distanceKm: 5,
          durationMin: 30,
          note: null,
          createdAt: `${TODAY}T00:00:00.000Z`,
        });
      },
    });
    const other = auth.signup({
      username: "log_other",
      password: "other-password-123",
      displayName: "Log Other",
      timezone: "UTC",
    }).user;
    seedActivity(handle.store, other.userId, "garmin:foreign", "2026-11-03", "Foreign secret run", 9);

    const html = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(html).toContain("Training log");
    expect(html).toContain("Past training");
    expect(html).toContain('data-active="history"');
    expect(html).toContain(">Training log</a>");
    // The period rows come first; load/trend/review live behind the Review tab.
    expect(html).toContain('class="seg-tabs history-tabs" role="radiogroup"');
    expect(html).toContain('id="history-tab-period" value="period" data-track="page-tab" checked');
    expect(html).toContain('id="history-tab-review" value="review" data-track="page-tab"');
    expect(html).toContain('class="chip history-load-chip"');
    expect(html).toContain('data-track="history-load"');
    expect(html).toContain('&tab=review#load-card"');
    expect(html).toContain('id="load-card"');
    expect(html).toContain('data-seg-panel="period"');
    expect(html).toContain('data-seg-panel="review"');
    expect(html).toContain(">Days</label>");
    expect(html).toContain(">Review</label>");
    expect(html.indexOf('data-seg-panel="period"')).toBeLessThan(html.indexOf('data-seg-panel="review"'));
    expect(html.indexOf("Mon, 2 Nov 2026")).toBeLessThan(html.indexOf('data-seg-panel="review"'));
    expect(html.indexOf("Daily volume")).toBeGreaterThan(html.indexOf('data-seg-panel="review"'));
    expect(html).toContain("Morning run");
    expect(html).toContain("Easy 5 km");
    expect(html).toContain("Planned:");
    expect(html).toContain("Completed - on plan (+0.2 km)");
    expect(html).toContain("Unplanned");
    expect(html).toContain("+0.2 km");
    expect(html).toContain('href="/activity/garmin%3A1"');
    expect(html).toContain("Detail</a>");
    expect(html).toContain("Daily volume");
    expect(html).toContain('aria-label="Daily volume for 2–8 Nov 2026"');
    // The tab is server-addressable: the load chip, a shared link and back/forward can land on Review.
    const reviewTab = await (await fetch(`${base}/history?tab=review`, { headers: { cookie } })).text();
    expect(reviewTab).toContain('id="history-tab-review" value="review" data-track="page-tab" checked');
    expect(reviewTab).not.toContain('id="history-tab-period" value="period" data-track="page-tab" checked');
    expect(reviewTab).toContain('id="load-card"');
    expect(html).toContain("Metric trend");
    expect(html).toContain('role="radiogroup" aria-label="Trend metric"');
    expect(html).toContain('data-default="pace"');
    expect(html).toContain('id="trend-metric-pace" value="pace" checked');
    expect(html).toContain('id="trend-metric-hr"');
    expect(html).toContain('id="trend-metric-cadence"');
    expect(html).toContain('aria-label="Pace trend for 2–8 Nov 2026"');
    expect(html).toContain('aria-label="Heart-rate trend for 2–8 Nov 2026"');
    expect(html).toContain('data-metric="cadence"');
    expect(html).toContain("Need at least two runs with cadence data in 2–8 Nov 2026.");
    expect(html).toContain('class="period-mode active" href="/history?view=week&period=2026-11-02"');
    expect(html).toContain('href="/history?view=month&period=2026-11"');
    expect(html).toContain('href="/history?view=year&period=2026"');
    expect(html).toContain('aria-label="Previous week"');
    expect(html).toContain('href="/history?view=week&period=2026-10-26"');
    expect(html).toContain('href="/history?view=week&period=2026-11-09"');
    expect(html).toContain("Mon, 2 Nov 2026");
    expect(html).toContain("Sun, 8 Nov 2026");
    expect(html).toContain("Average pace");
    expect(html).toContain("Consistency");
    expect(html).toContain("% of days");
    expect(html).toContain('class="trend-chart"');
    expect(html).toContain("data-coach-message=");
    expect(html).toContain("Ask coach");
    expect(html).toContain('name="next" value="/history"');
    expect(html).toContain("Week");
    expect(html).toContain("runs");
    expect(html).toContain('id="coach-minimize"');
    expect(html).not.toContain("Foreign secret run");

    const otherLogin = auth.login({ username: "log_other", password: "other-password-123" });
    const otherHtml = await (await fetch(`${base}/history`, { headers: { cookie: cookieFrom(otherLogin.cookie) } })).text();
    expect(otherHtml).toContain("Foreign secret run");
    expect(otherHtml).not.toContain("Morning run");
  });

  it("lists weeks in month view and months in year view", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-02", "Morning run", 5.2);
        seedActivity(store, runner.userId, "garmin:2", "2026-11-03", "Unplanned run", 3);
      },
    });

    const month = await (await fetch(`${base}/history?view=month&period=2026-11`, { headers: { cookie } })).text();
    expect(month).toContain("November 2026");
    expect(month).toContain("Week 2–8 Nov");
    expect(month).toContain("Week 9–15 Nov");
    expect(month).toContain('href="/history?view=week&period=2026-11-02"');
    expect(month).toContain("View week");
    expect(month).toContain("Weekly volume");
    expect(month).toContain('aria-label="Weekly volume for November 2026"');
    expect(month).toContain('class="period-mode active" href="/history?view=month&period=2026-11"');

    const year = await (await fetch(`${base}/history?view=year&period=2026`, { headers: { cookie } })).text();
    expect(year).toContain("November 2026");
    expect(year).toContain('href="/history?view=month&period=2026-11"');
    expect(year).toContain("View month");
    expect(year).toContain("Monthly volume");
    expect(year).toContain('aria-label="Monthly volume for 2026"');
    expect(year).toContain('class="period-mode active" href="/history?view=year&period=2026"');
  });

  it("shows period best efforts in month and year views", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        const baseActivity = {
          userId: runner.userId,
          distanceKm: 5,
          durationMin: 30,
          paceSecPerKm: 360,
          avgHr: 145,
          source: "garmin" as const,
          createdAt: `${TODAY}T08:00:00.000Z`,
        };
        store.appendActivity({ ...baseActivity, activityId: "garmin:oct", day: "2026-10-20", title: "October fast", fastest1kSec: 280, fastest1miSec: 470, fastest5kSec: 1450 });
        store.appendActivity({ ...baseActivity, activityId: "garmin:nov", day: "2026-11-02", title: "November fast", fastest1kSec: 290, fastest1miSec: 490, fastest5kSec: 1500 });
      },
    });

    const month = await (await fetch(`${base}/history?view=month&period=2026-11`, { headers: { cookie } })).text();
    expect(month).toContain("Best efforts");
    expect(month).toContain("November fast");
    expect(month).toContain("4:50");
    expect(month).toContain("8:10");
    expect(month).toContain("25:00");

    const year = await (await fetch(`${base}/history?view=year&period=2026`, { headers: { cookie } })).text();
    expect(year).toContain("Best efforts");
    expect(year).toContain("October fast");
    expect(year).toContain("4:40");
  });

  it("localizes the history cards and footer when the language cookie is zh-HK", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        const baseActivity = {
          userId: runner.userId,
          distanceKm: 5,
          durationMin: 30,
          paceSecPerKm: 360,
          avgHr: 145,
          source: "garmin" as const,
          createdAt: `${TODAY}T08:00:00.000Z`,
        };
        store.appendActivity({ ...baseActivity, activityId: "garmin:nov", day: "2026-11-02", title: "November fast", fastest1kSec: 290 });
      },
    });
    const zh = `${cookie}; poc3_lang=zh-HK`;
    const html = await (await fetch(`${base}/history?view=month&period=2026-11`, { headers: { cookie: zh } })).text();
    expect(html).toContain('<html lang="zh-HK" dir="ltr">');
    expect(html).toContain("最佳表現");
    expect(html).not.toContain("Best efforts");
    expect(html).toContain("November fast");
    expect(html).toContain("繁體中文（香港）");
    expect(html).toContain('class="lang-btn" role="button" aria-current="true"');
    // Trend + load chrome localize too; English labels must not leak through.
    expect(html).toContain("趨勢");
    expect(html).toContain("平均配速");
    expect(html).toContain("摘要");
    expect(html).toContain("1 次跑步");
    expect(html).toContain("指標趨勢");
    expect(html).toContain("趨勢指標");
    expect(html).toContain(">每週</label>");
    expect(html).toContain(">回顧</label>");
    expect(html).not.toContain("Average pace");
    expect(html).not.toContain("Metric trend");
    expect(html).not.toContain("Trend metric");
  });

  it("shows the weekly load card and a weekly coach review prompt", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        const baseActivity = {
          userId: runner.userId,
          distanceKm: 5,
          durationMin: 30,
          paceSecPerKm: 360,
          avgHr: 145,
          source: "garmin" as const,
          createdAt: `${TODAY}T08:00:00.000Z`,
        };
        store.appendActivity({ ...baseActivity, activityId: "garmin:load-1", day: "2026-11-02", title: "Easy run", trainingLoad: 100, trainingEffectLabel: "AEROBIC_BASE" });
        store.appendActivity({ ...baseActivity, activityId: "garmin:load-2", day: "2026-11-04", title: "Tempo run", distanceKm: 6, trainingLoad: 100, trainingEffectLabel: "TEMPO" });
        store.appendActivity({ ...baseActivity, activityId: "garmin:load-3", day: "2026-10-27", title: "Previous run", trainingLoad: 200, trainingEffectLabel: "AEROBIC_BASE" });
        store.appendActivity({ ...baseActivity, activityId: "garmin:load-4", day: "2026-10-20", title: "Earlier run", trainingLoad: 200, trainingEffectLabel: "AEROBIC_BASE" });
        store.appendActivity({ ...baseActivity, activityId: "garmin:load-5", day: "2026-10-13", title: "Earlier run 2", trainingLoad: 200, trainingEffectLabel: "AEROBIC_BASE" });
      },
    });

    const html = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(html).toContain("Week load");
    expect(html).toContain("load-chip steady");
    expect(html).toContain("Steady");
    expect(html).toContain("ACWR");
    expect(html).toContain("1.00");
    expect(html).toContain("Hard 1 run");
    expect(html).toContain("Easy 1 run");
    expect(html).toContain(" km · Easy ");
    expect(html).toContain("<span>split</span>");
    expect(html).toContain(`title="Load: Garmin's training load, or duration x reported effort for runs logged by hand."`);
    expect(html).toContain(`title="ACWR: this week's load compared with your 28-day average."`);
    expect(html).toContain(`title="Hard vs easy kilometres; a reported effort of 7 or above counts as hard."`);
    expect(html).toContain("ACWR compares this week's load with the 28-day average");
    expect(html).toContain("Load is Garmin's training load, or duration x reported effort for runs logged by hand");
    expect(html).toContain("Review my week with the coach");
    expect(html).toContain("Review my training week 2–8 Nov 2026");
    expect(html).toContain("Garmin load 200");
  });

  it("localizes the weekly load card when the language cookie is zh-HK", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        const baseActivity = {
          userId: runner.userId,
          distanceKm: 5,
          durationMin: 30,
          paceSecPerKm: 360,
          avgHr: 145,
          source: "garmin" as const,
          createdAt: `${TODAY}T08:00:00.000Z`,
        };
        store.appendActivity({ ...baseActivity, activityId: "garmin:load-1", day: "2026-11-02", title: "Easy run", trainingLoad: 100, trainingEffectLabel: "AEROBIC_BASE" });
        store.appendActivity({ ...baseActivity, activityId: "garmin:load-2", day: "2026-11-04", title: "Tempo run", distanceKm: 6, trainingLoad: 100, trainingEffectLabel: "TEMPO" });
        store.appendActivity({ ...baseActivity, activityId: "garmin:load-3", day: "2026-10-27", title: "Previous run", trainingLoad: 200, trainingEffectLabel: "AEROBIC_BASE" });
        store.appendActivity({ ...baseActivity, activityId: "garmin:load-4", day: "2026-10-20", title: "Earlier run", trainingLoad: 200, trainingEffectLabel: "AEROBIC_BASE" });
        store.appendActivity({ ...baseActivity, activityId: "garmin:load-5", day: "2026-10-13", title: "Earlier run 2", trainingLoad: 200, trainingEffectLabel: "AEROBIC_BASE" });
      },
    });

    const zh = `${cookie}; poc3_lang=zh-HK`;
    const html = await (await fetch(`${base}/history`, { headers: { cookie: zh } })).text();
    // Load chrome localizes: stat labels, hard/easy split, split label, and the coach review button.
    expect(html).toContain("與教練檢視本週");
    expect(html).not.toContain("Review my week with the coach");
    expect(html).toContain("高強度");
    expect(html).toContain("低強度");
    expect(html).toContain("1 次跑步");
    expect(html).not.toContain("Hard 1 run");
    // ACWR is a universal label and stays; the coach button label is localized while its bound prompt keeps English words.
    expect(html).toContain("ACWR");
    // The signal chip and its note localize too (steady signal from this fixture).
    // The English "Steady" survives only inside the LLM-bound coach prompt (by design), so assert the chip itself.
    expect(html).toContain('class="load-chip steady">平穩</span>');
    expect(html).toContain("負荷喺近期範圍之內");
    expect(html).not.toContain("Load is within the recent range");
  });

  it("omits empty load stats when Garmin did not provide load data", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => seedActivity(store, runner.userId, "garmin:no-load", "2026-11-03", "Easy run", 5),
    });
    const html = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(html).toContain("Week load");
    expect(html).toContain("No load data");
    expect(html).toContain("Garmin did not provide training load for these runs.");
    expect(html).not.toContain('class="load-grid"');
    expect(html).not.toContain('class="load-stat"');
    expect(html).not.toContain("ACWR");
    expect(html).toContain("Review my week with the coach");
  });

  it("renders an activity detail with plan-vs-actual and coach action", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-02", "Morning run", 5.2);
        store.upsertSession({
          sessionId: "session:plan",
          userId: runner.userId,
          day: "2026-11-02",
          title: "Easy 5 km",
          kind: "easy",
          distanceKm: 5,
          durationMin: 30,
          note: null,
          createdAt: `${TODAY}T00:00:00.000Z`,
        });
      },
    });
    const html = await (await fetch(`${base}/activity/${encodeURIComponent("garmin:1")}`, { headers: { cookie } })).text();
    expect(html).toContain("Morning run");
    expect(html).toContain("Plan vs actual");
    expect(html).toContain("On plan");
    expect(html).toContain("+0.2 km");
    expect(html).toContain("Ask coach");
    expect(html).toContain("The coach will compare this run with your plan for the day and comment on effort, pace and what to keep in mind. Your calendar will not change.");
    expect(html).not.toContain("last 30 activities");
    expect(html).not.toContain("This review is comment-only");
    expect(html).toContain('data-active="history"');
    expect(html).toContain('href="/history?view=week&period=2026-11-02"');
    expect(html).toContain('aria-label="Planned 5 km versus actual 5.2 km"');
    // Secondary cards pair up from 1024px, and Ask coach is a head action instead of only the last card.
    expect(html).toContain('class="activity-columns"');
    expect(html).toContain('class="activity-col"');
    expect(html).toContain('class="head-actions" aria-label="Run actions"');
    expect(html).toContain('data-track="activity-muscles"');
    expect(html).toContain('href="#muscles-worked"');
    expect(html).toContain('id="muscles-worked" tabindex="-1"');
    expect(html).toContain(">Muscles</a>");
    expect(html.indexOf("Plan vs actual")).toBeLessThan(html.indexOf('class="activity-columns"'));
    expect(html.indexOf('class="activity-columns"')).toBeLessThan(html.indexOf("Ask the coach about this run"));
  });

  it("shows enriched run metrics and per-kilometre splits on activity detail", async () => {
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities() {
        return [];
      },
      async getActivityDetails(activityId: string) {
        expect(activityId).toBe("1");
        return {
          metricDescriptors: [
            { metricsIndex: 0, key: "sumDistance" },
            { metricsIndex: 1, key: "sumDuration" },
            { metricsIndex: 2, key: "directHeartRate" },
          ],
          activityDetailMetrics: [
            { metrics: [0, 0, 120] },
            { metrics: [1000, 300, 130] },
            { metrics: [1800, 540, 140] },
          ],
        };
      },
    };
    const { base, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        store.appendActivity({
          activityId: "garmin:1",
          userId: runner.userId,
          day: "2026-11-02",
          title: "Morning run",
          distanceKm: 5.4,
          durationMin: 28,
          paceSecPerKm: 311,
          avgHr: 140,
          source: "garmin",
          createdAt: `${TODAY}T08:00:00.000Z`,
          elevationGainM: 12,
          calories: 348,
          maxHr: 151,
          cadenceSpm: 173,
          strideLengthCm: 110.9,
          groundContactMs: 251,
          aerobicTrainingEffect: 3.1,
          anaerobicTrainingEffect: 0.8,
          trainingLoad: 92.6,
          trainingEffectLabel: "AEROBIC_BASE",
          fastest1kSec: 294,
          fastest1miSec: 491,
          fastest5kSec: 1557,
        });
      },
    });

    const html = await (await fetch(`${base}/activity/${encodeURIComponent("garmin:1")}`, { headers: { cookie } })).text();
    expect(html).toContain("Run metrics");
    expect(html).toContain("Elevation");
    expect(html).toContain("+12 m");
    expect(html).toContain("Cadence");
    expect(html).toContain("173 spm");
    expect(html).toContain("Aerobic Base");
    expect(html).toContain("Fastest 1 km");
    expect(html).toContain("4:54");
    expect(html).toContain("Fastest 5 km");
    expect(html).toContain("25:57");
    expect(html).toContain("Per-kilometre splits");
    expect(html).toContain("5:00/km");
    expect(html).toContain("0.8 km");
    expect(html).toContain("125 bpm");
  });

  it("shows Garmin laps, HR zones and PR badges on activity detail", async () => {
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities() {
        return [];
      },
      async getActivityDetails() {
        return {
          metricDescriptors: [
            { metricsIndex: 0, key: "sumDistance" },
            { metricsIndex: 1, key: "sumDuration" },
            { metricsIndex: 2, key: "directHeartRate" },
          ],
          activityDetailMetrics: [
            { metrics: [0, 0, 120] },
            { metrics: [1000, 300, 130] },
            { metrics: [1800, 540, 140] },
          ],
        };
      },
      async getActivitySummary() {
        return {
          splitSummaries: [
            { splitType: "INTERVAL_ACTIVE", distance: 1000, duration: 300, averageHR: 160, elevationGain: 4, averageRunCadence: 180 },
            { splitType: "INTERVAL_RECOVERY", distance: 500, duration: 200, averageHR: 130 },
          ],
        };
      },
    };
    const { base, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        const baseActivity = {
          userId: runner.userId,
          distanceKm: 1.8,
          durationMin: 9,
          paceSecPerKm: 300,
          avgHr: 150,
          source: "garmin" as const,
          createdAt: `${TODAY}T08:00:00.000Z`,
        };
        store.appendActivity({
          ...baseActivity,
          activityId: "garmin:1",
          day: "2026-11-02",
          title: "Interval run",
          fastest1kSec: 294,
          fastest1miSec: 491,
          fastest5kSec: 1557,
          hrZone1Sec: 240,
          hrZone2Sec: 600,
          trainingEffectLabel: "TEMPO",
        });
        store.appendActivity({
          ...baseActivity,
          activityId: "garmin:2",
          day: "2026-11-03",
          title: "Easy run",
          fastest1kSec: 360,
          fastest1miSec: 600,
          fastest5kSec: 1800,
        });
      },
    });

    const html = await (await fetch(`${base}/activity/${encodeURIComponent("garmin:1")}`, { headers: { cookie } })).text();
    expect(html).toContain("Garmin laps / intervals");
    expect(html).toContain("Active");
    expect(html).toContain("Recovery");
    expect(html).toContain("6:40/km");
    expect(html).toContain("HR zones");
    expect(html).toContain("Z1");
    expect(html).toContain("Z2");
    expect(html).toContain("4:00");
    expect(html).toContain("10:00");
    expect(html).toContain("pr-chip");
    expect(html).toContain("Fastest 1 km");
  });

  it("keeps the activity detail usable when Garmin splits fail", async () => {
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities() {
        return [];
      },
      async getActivityDetails() {
        throw new Error("403");
      },
    };
    const { base, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-02", "Morning run", 5.2);
      },
    });

    const html = await (await fetch(`${base}/activity/${encodeURIComponent("garmin:1")}`, { headers: { cookie } })).text();
    expect(html).toContain("Morning run");
    expect(html).toContain("Garmin per-kilometre splits are not available for this run.");
  });

  it("keeps the activity detail usable when Garmin lap summaries fail", async () => {
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities() {
        return [];
      },
      async getActivityDetails() {
        return {
          metricDescriptors: [
            { metricsIndex: 0, key: "sumDistance" },
            { metricsIndex: 1, key: "sumDuration" },
          ],
          activityDetailMetrics: [
            { metrics: [0, 0] },
            { metrics: [1000, 300] },
          ],
        };
      },
      async getActivitySummary() {
        throw new Error("403");
      },
    };
    const { base, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-02", "Morning run", 5.2);
      },
    });

    const html = await (await fetch(`${base}/activity/${encodeURIComponent("garmin:1")}`, { headers: { cookie } })).text();
    expect(html).toContain("Morning run");
    expect(html).toContain("Per-kilometre splits");
    expect(html).toContain("Garmin lap/interval summaries are not available for this run.");
  });

  it("does not expose another runner's activity detail", async () => {
    const { base, auth, handle, cookie } = await start();
    const other = auth.signup({
      username: "detail_other",
      password: "other-password-123",
      displayName: "Detail Other",
      timezone: "UTC",
    }).user;
    seedActivity(handle.store, other.userId, "garmin:foreign", "2026-11-03", "Foreign run", 5);
    const foreign = await fetch(`${base}/activity/${encodeURIComponent("garmin:foreign")}`, { headers: { cookie } });
    expect(foreign.status).toBe(404);
    const missing = await fetch(`${base}/activity/${encodeURIComponent("garmin:missing")}`, { headers: { cookie } });
    expect(missing.status).toBe(404);
  });

  it("auto-syncs stale Garmin data on the training log and then backs off", async () => {
    let calls = 0;
    let seenLimit: number | undefined;
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities(limit?: number) {
        calls += 1;
        seenLimit = limit;
        return [
          {
            activityId: 900010,
            activityName: "Auto run",
            startTimeLocal: "2026-11-04 07:00:00",
            distance: 5000,
            duration: 1800,
            averageSpeed: 2.78,
            averageHR: 145,
          },
        ];
      },
    };
    const { base, handle, user, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        store.recordSync(runner.userId, "2026-11-05T06:00:00.000Z");
      },
    });
    const first = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(first).not.toContain("Auto-synced");
    expect(first).toContain("Auto run");
    expect(first).toContain("Review this run with the coach");
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);
    expect(handle.store.countUnreadNotifications(user.userId)).toBe(1);
    expect(handle.store.listNotifications(user.userId)[0]?.title).toBe("Garmin sync: 1 new activity");
    expect(calls).toBe(1);
    expect(seenLimit).toBe(100);

    const second = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(second).not.toContain("Auto-synced");
    expect(handle.store.countUnreadNotifications(user.userId)).toBe(1);
    expect(calls).toBe(1);
  });

  it("keeps a no-change auto-sync out of the page and bell", async () => {
    const garmin = fakeGarminClient({ activities: [garminActivity] });
    const { base, handle, user, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        const mapped = mapGarminActivity(garminActivity, runner.userId);
        if (!mapped) throw new Error("fixture did not map");
        store.appendActivity(mapped);
        store.recordSync(runner.userId, "2026-11-05T06:00:00.000Z");
      },
    });
    const html = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(html).not.toContain("Auto-synced");
    expect(html).not.toContain("New run synced");
    expect(handle.store.listNotifications(user.userId)).toHaveLength(0);
  });

  it("records an auto-sync failure in the bell without a page banner", async () => {
    let calls = 0;
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities() {
        calls += 1;
        throw new Error("Garmin down");
      },
    };
    const { base, handle, user, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        store.recordSync(runner.userId, "2026-11-05T06:00:00.000Z");
      },
    });
    const first = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(first).not.toContain("Auto-sync failed");
    const notes = handle.store.listNotifications(user.userId);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.status).toBe("error");
    expect(notes[0]?.body).toContain("Garmin down");
    expect(calls).toBe(1);
    await fetch(`${base}/history`, { headers: { cookie } });
    expect(calls).toBe(1);
  });

  it("words the plan-match badge as completed with a signed delta", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedSession(store, runner.userId, "session:on", "2026-11-02", "Easy 5 km", "easy", 5);
        seedActivity(store, runner.userId, "garmin:on", "2026-11-02", "Easy jog", 5.2);
        seedSession(store, runner.userId, "session:short", "2026-11-03", "Long 5 km", "long", 5);
        seedActivity(store, runner.userId, "garmin:short", "2026-11-03", "Cut short", 3.8);
        seedSession(store, runner.userId, "session:over", "2026-11-04", "Tempo 5 km", "tempo", 5);
        seedActivity(store, runner.userId, "garmin:over", "2026-11-04", "Extended tempo", 6.5);
        seedActivity(store, runner.userId, "garmin:solo", "2026-11-05", "Unplanned jog", 4);
      },
    });

    const html = await (await fetch(`${base}/history?view=week&period=2026-11-02`, { headers: { cookie } })).text();
    expect(html).toContain("Completed - on plan (+0.2 km)");
    expect(html).toContain("Completed - 1.2 km short");
    expect(html).toContain("Completed - 1.5 km over");
    expect(html).toContain("Unplanned");
    expect(html).not.toContain("ON PLAN 0 KM");
  });

  it("distinguishes rest, upcoming, awaiting-sync and missed days in the week view", async () => {
    const { base, cookie } = await start({
      autoSyncMinutes: 100000,
      seed: (store, runner) => {
        store.saveGarminKey({ userId: runner.userId, apiKey: "valid-key-123", savedAt: `${TODAY}T06:00:00.000Z` });
        // The last import covers up to 3 Nov in the runner's timezone (Asia/Hong_Kong, UTC+8).
        store.recordSync(runner.userId, "2026-11-03T04:00:00.000Z");
        seedSession(store, runner.userId, "session:rest", "2026-11-03", "Rest day", "rest", null);
        seedSession(store, runner.userId, "session:missed", "2026-11-02", "Easy 5 km", "easy", 5);
        seedSession(store, runner.userId, "session:awaiting", "2026-11-04", "Tempo 6 km", "tempo", 6);
      },
    });

    const html = await (await fetch(`${base}/history?view=week&period=2026-11-02`, { headers: { cookie } })).text();
    expect(html).toContain("Planned rest.");
    expect(html).toContain("Awaiting Garmin sync · a run from this day may not be imported yet.");
    expect(html).toContain("No run logged — the plan does not change.");
    expect(html).toContain("Upcoming.");
    expect(html).toContain("No session or activity.");
  });

  it("counts a hand-logged effort in the week load and says so", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        store.appendActivity({
          activityId: "activity:manual:load",
          userId: runner.userId,
          day: "2026-11-03",
          title: "Treadmill run",
          distanceKm: 5,
          durationMin: 30,
          paceSecPerKm: 360,
          avgHr: null,
          source: "chat",
          createdAt: `${TODAY}T08:00:00.000Z`,
          rpe: 7,
        });
      },
    });

    const html = await (await fetch(`${base}/history?view=week&period=2026-11-02`, { headers: { cookie } })).text();
    expect(html).toContain("Reported effort (duration x RPE) is included for runs without Garmin load.");
    expect(html).toContain("A reported effort of 7 or above counts as hard.");
    expect(html).toContain("Hard 1 run");
  });

  it("shows a garmin-synced chip and a one-line row legend on the calendar", async () => {
    const { base, cookie } = await start({
      autoSyncMinutes: 100000,
      seed: (store, runner) => {
        store.saveGarminKey({ userId: runner.userId, apiKey: "valid-key-123", savedAt: `${TODAY}T06:00:00.000Z` });
        store.recordSync(runner.userId, "2026-11-05T07:30:00.000Z");
      },
    });
    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain("garmin-sync-chip");
    expect(html).toContain("Garmin synced 2026-11-05 15:30");
    expect(html).toContain("The last Garmin pull, shown in your timezone");
    expect(html).not.toContain("Garmin is not connected");
    // The legend sits under the header copy: plan rows, check rows and paired rows in one scannable line.
    expect(html).toContain("cal-legend");
    expect(html).toContain("Colored row: planned session · green ✓ row: recorded run · green+purple ◈ row: recorded run + the Garmin workout it followed.");
    const css = await (await fetch(`${base}/static/app.css`)).text();
    expect(css).toContain(".cal-legend");
    expect(css).toContain(".garmin-sync-chip");

    // Without a saved key there is no freshness to claim and no chip.
    const fresh = await start();
    const freshHtml = await (await fetch(`${fresh.base}/calendar?month=2026-11`, { headers: { cookie: fresh.cookie } })).text();
    expect(freshHtml).not.toContain("garmin-sync-chip");
  });
});

describe("Garmin workout surfaces", () => {
  const workoutSteps = [
    {
      stepIndex: 1,
      intensity: "WARMUP",
      durationType: "TIME",
      durationValue: 600,
      targetType: "PACE",
      targetValueLow: 2.6,
      targetValueHigh: 2.9,
    },
    {
      stepIndex: 2,
      intensity: "ACTIVE",
      durationType: "TIME",
      durationValue: 420,
      targetType: "PACE",
      targetValueLow: 3.66,
      targetValueHigh: 3.94,
      notes: "Stay relaxed",
    },
    { stepIndex: 3, intensity: "RECOVERY", durationType: "TIME", durationValue: 120 },
    {
      stepIndex: 4,
      intensity: "ACTIVE",
      durationType: "REPEAT_UNTIL_STEPS_CMPLT",
      durationValue: 2,
      targetValue: 3,
    },
    { stepIndex: 5, intensity: "COOLDOWN", durationType: "TIME", durationValue: 600 },
  ];

  const seedWorkout = (store: Store, userId: string, day = "2026-11-04"): void => {
    store.saveActivityWorkout({
      activityId: "garmin:1",
      userId,
      day,
      name: "Kenosha - Threshold",
      label: "Kenosha - Threshold",
      summary: "Warm-up 10:00 · 3 × (Run 7:00 @ 4:14–4:33/km, Recovery 2:00)",
      steps: [{ index: 1, intensity: "Warm-up", intensityKey: "WARMUP", duration: "10:00", target: null }],
      notes: null,
      status: "ok",
      attempts: 0,
      fetchedAt: `${TODAY}T09:00:00.000Z`,
    });
  };

  it("shows the workout a run followed on the activity detail and stores it", async () => {
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities() {
        return [];
      },
      async getActivityWorkouts(activityId: string) {
        expect(activityId).toBe("1");
        return workoutSteps;
      },
    };
    const { base, handle, user, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Threshold run", 10);
      },
    });

    const html = await (
      await fetch(`${base}/activity/${encodeURIComponent("garmin:1")}`, { headers: { cookie } })
    ).text();

    expect(html).toContain("Training program · Garmin");
    expect(html).toContain("Garmin workout");
    expect(html).toContain("3 × (Run 7:00 @ 4:14–4:33/km, Recovery 2:00)");
    expect(html).toContain("Warm-up");
    expect(html).toContain("back to step 2");
    expect(html).toContain("Stay relaxed");
    expect(html).toContain('aria-label="Garmin workout steps"');
    expect(handle.store.getActivityWorkout(user.userId, "garmin:1")).toMatchObject({
      status: "ok",
      name: null,
      day: "2026-11-04",
    });
  });

  it("keeps the activity detail usable when the workout fetch fails", async () => {
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities() {
        return [];
      },
      async getActivityWorkouts() {
        throw new GarminError("denied", 403);
      },
    };
    const { base, handle, user, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Morning run", 5.2);
      },
    });

    const html = await (
      await fetch(`${base}/activity/${encodeURIComponent("garmin:1")}`, { headers: { cookie } })
    ).text();

    expect(html).toContain("Morning run");
    expect(html).toContain("workout for this run is not available right now.");
    expect(html).toContain("Plan vs actual");
    expect(handle.store.getActivityWorkout(user.userId, "garmin:1")).toMatchObject({
      status: "unavailable",
      attempts: 1,
    });
  });

  it("pairs a recorded run with its Garmin workout in the calendar grid and the data endpoint", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Threshold run", 10);
        seedWorkout(store, runner.userId);
      },
    });

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('class="cal-pill paired" data-activity-id="garmin:1" role="button" tabindex="0"');
    expect(html).toContain('class="cal-pair-part cal-pair-run"');
    expect(html).toContain('class="cal-pair-part cal-pair-workout"');
    expect(html).not.toContain("data-workout-id");
    expect(html).toContain('<span class="cal-meta">10 km</span>');
    expect(html).toContain("Kenosha - Threshold");
    expect(html).toContain('aria-label="Recorded run with Garmin workout: Threshold run (10 km), Kenosha - Threshold. Show run and workout details"');
    // The one-line legend explains the paired row now that the header paragraph is a single welcome line.
    expect(html).toContain("green+purple");
    expect(html).not.toContain('class="cal-pill program"');
    // The pair is one click target: its two lines are not separately focusable or clickable.
    const pairHtml = html.match(/<span class="cal-pill paired"[\s\S]*?<\/span><\/span>/)?.[0] ?? "";
    expect(pairHtml.match(/role="button"/g) ?? []).toHaveLength(1);
    expect(pairHtml.match(/tabindex="0"/g) ?? []).toHaveLength(1);

    const data = (await (
      await fetch(`${base}/calendar/data?month=2026-11`, { headers: { cookie } })
    ).json()) as {
      days: Record<
        string,
        {
          items: Array<{
            type: string;
            activityId?: string;
            run?: { label: string; meta: string | null };
            workout?: { label: string };
            tooltip?: string;
          }>;
          html: string;
        }
      >;
    };
    expect(data.days["2026-11-04"]?.items.map((item) => item.type)).toEqual(["pair"]);
    expect(data.days["2026-11-04"]?.items[0]).toMatchObject({
      type: "pair",
      activityId: "garmin:1",
      run: { label: "Threshold run", meta: "10 km" },
      workout: { label: "Kenosha - Threshold" },
    });
    expect(data.days["2026-11-04"]?.items[0]?.tooltip).toContain("Warm-up 10:00");
    expect(data.days["2026-11-04"]?.html).toContain('class="cal-pair-part cal-pair-workout"');
  });

  it("does not repeat a program label when the workout summary is only that label", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Threshold run", 10);
        store.saveActivityWorkout({
          activityId: "garmin:1",
          userId: runner.userId,
          day: "2026-11-04",
          name: null,
          label: "10 × (Run open, Recovery open)",
          summary: "10 × (Run open, Recovery open)",
          steps: [{ index: 1, intensity: "Run", intensityKey: "ACTIVE", duration: "open", target: null }],
          notes: "300m @ 4:30",
          status: "ok",
          attempts: 0,
          fetchedAt: `${TODAY}T09:00:00.000Z`,
        });
      },
    });

    const data = (await (
      await fetch(`${base}/calendar/data?month=2026-11`, { headers: { cookie } })
    ).json()) as { days: Record<string, { items: Array<{ tooltip?: string }> }> };
    const tooltip = data.days["2026-11-04"]?.items[0]?.tooltip ?? "";
    expect(tooltip.match(/10 × \(Run open, Recovery open\)/g) ?? []).toHaveLength(1);
    expect(tooltip).toContain("300m @ 4:30");
  });

  it("fills the visible month's missing workouts before pairing the grid", async () => {
    let calls = 0;
    const garmin: GarminClient = {
      async token() {
        return "t";
      },
      async listActivities() {
        return [];
      },
      async getActivityWorkouts(activityId: string) {
        calls += 1;
        expect(activityId).toBe("1");
        return {
          workoutName: "Kenosha - Threshold",
          workoutSteps: [{ stepIndex: 1, intensity: "WARMUP", durationType: "TIME", durationValue: 600 }],
        };
      },
    };
    const { base, handle, user, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Threshold run", 10);
      },
    });

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('class="cal-pill paired"');
    expect(html).toContain("Kenosha - Threshold");
    expect(calls).toBe(1);
    expect(handle.store.getActivityWorkout(user.userId, "garmin:1")).toMatchObject({
      status: "ok",
      label: "Kenosha - Threshold",
    });
  });

  it("lists the day's Garmin workout on the day page", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Threshold run", 10);
        seedWorkout(store, runner.userId);
      },
    });

    const html = await (await fetch(`${base}/day/2026-11-04`, { headers: { cookie } })).text();

    expect(html).toContain("Garmin workouts");
    expect(html).toContain("Kenosha - Threshold");
    expect(html).toContain("Warm-up 10:00");
  });

  it("keeps an unavailable workout as a plain record pill", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Threshold run", 10);
        store.saveActivityWorkout({
          activityId: "garmin:1",
          userId: runner.userId,
          day: "2026-11-04",
          name: null,
          label: "",
          summary: "",
          steps: [],
          notes: null,
          status: "unavailable",
          attempts: 2,
          fetchedAt: `${TODAY}T09:00:00.000Z`,
        });
      },
    });

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).not.toContain('class="cal-pill paired"');
    expect(html).not.toContain('class="cal-pill program"');
    expect(html).toContain('class="cal-pill record"');
  });

  it("shows the Garmin workout line on the training-log week card", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Threshold run", 10);
        seedWorkout(store, runner.userId);
      },
    });

    const html = await (
      await fetch(`${base}/history?view=week&period=2026-11-02`, { headers: { cookie } })
    ).text();

    expect(html).toContain('class="history-program"');
    expect(html).toContain("Garmin workout");
    expect(html).toContain("Kenosha - Threshold");
    expect(html).toContain("3 × (Run 7:00 @ 4:14–4:33/km, Recovery 2:00)");
  });

  it("includes the full workout program in the integrated run peek", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Threshold run", 10);
        seedWorkout(store, runner.userId);
      },
    });

    const peek = (await (
      await fetch(`${base}/activity/${encodeURIComponent("garmin:1")}/peek`, { headers: { cookie } })
    ).json()) as {
      peek: {
        program: {
          name: string | null;
          label: string;
          summary: string;
          steps: Array<{ index: number; intensity: string; duration: string; target: string | null }>;
          stepCount: number;
          notes: string | null;
        } | null;
      };
    };

    expect(peek.peek.program).toMatchObject({
      name: "Kenosha - Threshold",
      label: "Kenosha - Threshold",
      summary: "Warm-up 10:00 · 3 × (Run 7:00 @ 4:14–4:33/km, Recovery 2:00)",
      stepCount: 1,
      notes: null,
    });
    expect(peek.peek.program?.steps[0]).toMatchObject({ index: 1, intensity: "Warm-up", duration: "10:00" });
  });

  it("keeps the run peek's program empty when no workout was fetched", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedActivity(store, runner.userId, "garmin:1", "2026-11-04", "Threshold run", 10);
      },
    });

    const peek = (await (
      await fetch(`${base}/activity/${encodeURIComponent("garmin:1")}/peek`, { headers: { cookie } })
    ).json()) as { peek: { program: unknown } };

    expect(peek.peek.program).toBeNull();
  });
});

describe("metric trend picker", () => {
  it("renders one panel per metric and the chips that select them", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        const baseActivity = {
          userId: runner.userId,
          durationMin: 45,
          source: "garmin" as const,
          createdAt: `${TODAY}T08:00:00.000Z`,
        };
        store.appendActivity({
          ...baseActivity,
          activityId: "garmin:t1",
          day: "2026-11-02",
          title: "Intervals",
          distanceKm: 8,
          paceSecPerKm: 300,
          avgHr: 160,
          cadenceSpm: 178,
          trainingLoad: 95,
          elevationGainM: 20,
        });
        store.appendActivity({
          ...baseActivity,
          activityId: "garmin:t2",
          day: "2026-11-04",
          title: "Easy run",
          distanceKm: 6,
          paceSecPerKm: 360,
          avgHr: 140,
          cadenceSpm: 168,
          trainingLoad: 55,
          elevationGainM: 8,
        });
      },
    });

    const html = await (
      await fetch(`${base}/history?view=week&period=2026-11-02`, { headers: { cookie } })
    ).text();

    expect(html).toContain('role="radiogroup" aria-label="Trend metric"');
    expect(html).toContain('data-default="pace"');
    expect(html).toContain('id="trend-metric-pace" value="pace" checked');
    expect(html).toContain(">Pace</label>");
    expect(html).toContain(">Heart rate</label>");
    expect(html).toContain(">Cadence</label>");
    expect(html).toContain(">Load</label>");
    expect(html).toContain(">Distance</label>");
    expect(html).toContain(">Time</label>");
    expect(html).toContain(">Elevation</label>");
    expect(html).toContain('aria-label="Pace trend for 2–8 Nov 2026"');
    expect(html).toContain('aria-label="Heart-rate trend for 2–8 Nov 2026"');
    expect(html).toContain('aria-label="Cadence trend for 2–8 Nov 2026"');
    expect(html).toContain('aria-label="Training-load trend for 2–8 Nov 2026"');
    expect(html).toContain('aria-label="Elevation trend for 2–8 Nov 2026"');
    expect(html).toContain('data-metric="cadence"');
    expect(html).toContain("178 spm");
    expect(html).toContain("Average cadence");
    expect(html).toContain("173 spm");
  });

  it("defaults to the first metric that has data when pace is missing", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        const baseActivity = {
          userId: runner.userId,
          durationMin: 45,
          source: "garmin" as const,
          createdAt: `${TODAY}T08:00:00.000Z`,
        };
        store.appendActivity({
          ...baseActivity,
          activityId: "garmin:t1",
          day: "2026-11-02",
          title: "Reported one",
          distanceKm: 5,
          paceSecPerKm: null,
          avgHr: 150,
        });
        store.appendActivity({
          ...baseActivity,
          activityId: "garmin:t2",
          day: "2026-11-04",
          title: "Reported two",
          distanceKm: 5,
          paceSecPerKm: null,
          avgHr: 160,
        });
      },
    });

    const html = await (
      await fetch(`${base}/history?view=week&period=2026-11-02`, { headers: { cookie } })
    ).text();

    expect(html).toContain('data-default="hr"');
    expect(html).toContain('id="trend-metric-hr" value="hr" checked');
    expect(html).toContain("Need at least two runs with pace data in 2–8 Nov 2026.");
  });
});

describe("in-calendar coach bubble", () => {
  it("renders suggestion chips while keeping the animation", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('id="coach-bubble"');
    expect(html).toContain('id="coach-panel"');
    // The launcher is a disclosure: its open state is programmatic, and the panel is a named region.
    expect(html).toContain('id="coach-bubble" type="button" aria-label="Talk to the coach" aria-expanded="false" aria-controls="coach-panel"');
    expect(html).toContain('id="coach-panel" hidden role="region" aria-label="AI Coach"');
    expect(html).toContain("bubble.setAttribute('aria-expanded', 'true')");
    expect(html).toContain("bubble.setAttribute('aria-expanded', 'false')");
    // Below 1200px the overlay makes the page inert; the dock does not.
    expect(html).toContain("matchMedia('(max-width: 1199px)')");
    expect(html).toContain("matchMedia('(max-width: 720px)')");
    expect(html).toContain("pageMain.inert = open");
    expect(html).toContain("siteFooter.inert = open");
    expect(html).toContain("topbar.inert = open && sheetWidth()");
    expect(html).toContain("window.addEventListener('resize', syncCoachInert)");
    expect(html).toContain('id="coach-minimize"');
    expect(html).toContain('aria-label="Minimize chat"');
    expect(html).toContain(">−</button>");
    expect(html).not.toContain('aria-label="Close chat"');
    // The dock: one coach surface grouped into Chat / States / Changes, with a close control for the floating sheet.
    expect(html).toContain('<div class="app-shell"><main>');
    expect(html).toContain('</main><aside class="coach-dock"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Coach sections"');
    expect(html).toContain('data-coach-tab="chat"');
    expect(html).toContain('data-coach-tab="states"');
    expect(html).toContain('data-coach-tab="changes"');
    expect(html).toContain('id="coach-tabpanel-chat"');
    expect(html).toContain('id="coach-tabpanel-states"');
    expect(html).toContain('id="coach-tabpanel-changes"');
    expect(html).toContain('id="coach-states-list"');
    expect(html).toContain('id="coach-changes-list"');
    expect(html).toContain('id="coach-close"');
    expect(html).toContain('aria-label="Close coach panel"');
    expect(html).toContain("All coaching states");
    expect(html).toContain("Open Recent changes");
    expect(html).toContain("setTab");
    expect(html).toContain("renderStatesTab");
    expect(html).toContain("renderChangesTab");
    expect(html).toContain("coach-open");
    expect(html).toContain("statesBadgeTitle");
    expect(html).toContain("changesBadgeTitle");
    expect(html).toContain("minimizePanel");
    expect(html).not.toContain("Bookings up to 180 days ahead");
    expect(html).not.toContain('href="/coach-audit"');
    expect(html).not.toContain('title="Hidden directives"');
    expect(html).toContain('id="coach-suggestions"');
    expect(html).not.toContain('id="coach-undo"');
    expect(html).not.toContain("undo the last change");
    expect(html).toContain("data.suggestions");
    expect(html).toContain("chip.className = 'suggestion'");
    expect(html).toContain("Can we plan my week together?");
    expect(html).toContain("Where could a 5 km run fit this week?");
    expect(html).toContain("How did last week go?");
    expect(html).toContain("showStarters");
    expect(html).toContain("setRetry");
    expect(html).toContain("addFailureCard");
    expect(html).toContain("Could not apply");
    expect(html).toContain("failure-actions");
    expect(html).toContain("fetch('/chat'");
    expect(html).toContain("fetch('/chat/history'");
    expect(html).toContain("x-poc3-request-id");
    expect(html).toContain("data-coach-intent");
    expect(html).toContain("parseIntent");
    expect(html).toContain("pendingIntent");
    expect(html).toContain("blockedWrites");
    expect(html).toContain("Calendar unchanged");
    expect(html).toContain("That run could not be found.");
    expect(html).toContain("The coach is unavailable right now. Try again.");
    expect(html).not.toContain("data.error.detail");
    expect(html).toContain("that session no longer exists");
    expect(html).not.toContain('href="/coach-audit"');
    expect(html).toContain("loadConversation");
    expect(html).toContain("refreshCalendar");
    expect(html).toContain("monthGrid.querySelectorAll('.cell[data-day]')");
    expect(html).toContain("otherwise a deleted row stays until reload");
    expect(html).toContain("info.html");
    expect(html).toContain('class="cal-items"');
    expect(html).toContain("scrollToLatest");
    expect(html).toContain("day-menu");
    expect(html).toContain("openDayMenu");
    expect(html).toContain("Add a session here");
    expect(html).toContain("Move a session here");
    expect(html).toContain("Delete a session here");
    expect(html).toContain("Ask coach about this day");
    expect(html).toContain("View day details");
    expect(html).not.toContain('id="month-title"');
    expect(html).toContain("data-current-month");
    expect(html).toContain("month-picker");
    expect(html).toContain("month-year-select");
    expect(html).toContain('id="month-current"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("animateChanges");
    expect(html).toContain("before.length * 140");
    expect(html).toContain("app.css?v=");
    // Privacy-safe UI events: components mark the interaction; a host listens for the CustomEvent.
    expect(html).toContain("poc3:track");
    expect(html).toContain('data-track="coach-open"');
    expect(html).toContain("track('coach-tab'");
    expect(html).toContain('data-track="coach-close"');
    expect(html).toContain("window.history.pushState");
    expect(html).toContain("popstate");
    const cssResponse = await fetch(`${base}/static/app.css`);
    expect(cssResponse.headers.get("cache-control")).toBe("no-store");
    const css = await cssResponse.text();
    expect(css).toContain("100dvh");
    expect(css).toContain("min-height: 0");
    expect(css).toContain(".view-switch");
    expect(css).toContain(".history-summary");
    expect(css).toContain(".history-load-chip");
    expect(css).toContain(".seg-tabs");
    expect(css).toContain(".seg-input");
    expect(css).toContain(".seg-panel");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain(".activity-columns");
    expect(css).toContain(".muscle-layout");
    expect(css).toContain("body.coach-open .activity-columns");
    expect(css).toContain("body.coach-open .muscle-layout");
    expect(css).toContain(".history-activity");
    expect(css).toContain(".trend-chart");
    expect(css).toContain(".trend-picker");
    expect(css).toContain(".trend-chip");
    expect(css).toContain(":has(#trend-metric-cadence:checked)");
    expect(css).toContain(".cal-pill.paired");
    expect(css).toContain(".cal-pair-part");
    expect(css).toContain(".cal-pair-workout");
    expect(css).toContain(".peek-workout-summary");
    expect(css).toContain(".peek-steps");
    expect(css).toContain(".workout-card");
    expect(css).toContain(".history-program");
    expect(css).toContain(".plan-compare");
    expect(css).toContain(".review-card");
    expect(css).toContain(".audit-item");
    expect(css).toContain(".audit-background");
    expect(css).toContain(".coach-head-actions");
    // The dock reflows the page into two columns on wide screens and becomes a sheet below 1200px.
    expect(css).toContain(".app-shell");
    expect(css).toContain("body.coach-open .app-shell");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 340px");
    expect(css).toContain(".coach-tabs");
    expect(css).toContain(".coach-tab-panel");
    expect(css).toContain(".coach-tab-body");
    expect(css).toContain(".coach-change");
    expect(css).toContain("#coach-close");
    expect(css).not.toContain(".coach-limit");
    expect(css).not.toContain(".coach-audit-link");
    expect(css).toContain(".period-bar");
    expect(css).toContain(".period-mode");
    expect(css).toContain(".period-row");
    expect(css).toContain(".load-card");
    expect(css).toContain(".load-chip");
    expect(css).toContain(".metric-extra-grid");
    expect(css).toContain(".splits-table");
    expect(css).toContain(".laps-table");
    expect(css).toContain(".zone-bar");
    expect(css).toContain(".best-efforts-card");
    expect(css).toContain(".pr-chip");
    const railRule = css.match(/#coach-suggestions \{[^}]*\}/)?.[0] ?? "";
    expect(railRule).toContain("flex: 0 0 auto");
    expect(railRule).not.toContain("max-height");
    expect(railRule).not.toContain("overflow-y");
    expect(css).toContain(".bubble.failure");
    expect(css).toContain(".failure-actions");
    expect(css).toContain("#day-menu");
    expect(css).toContain("#month-picker");
    expect(css).not.toContain("#coach-undo");
    expect(html).toContain("Calendar updated");
    // A guardrail line is a block, not a success: warning styling plus consultative copy.
    expect(html).toContain("addGuardrail");
    expect(html).toContain("bubble system warn");
    expect(html).toContain("is protecting the plan");
    expect(css).toContain(".bubble.system.warn");
    // The delete animation ends by pointing at the Recent changes card, where the Undo form lives.
    expect(html).toContain("showDeleteToast");
    expect(html).toContain("Deleted");
    expect(html).toContain("Undo in Recent changes");
    expect(css).toContain(".fx-toast");
    // The bubble's state card can open the discussion about how the state shapes the week.
    expect(html).toContain("Discuss this state");
    expect(html).toContain("discuss-state");
    expect(html).toContain("state-card");
    expect(html).toContain('data-month="2026-11"');
    expect(html).toContain('data-day="2026-11-06"');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    // The i18n bootstrap, the coach bubble, notifications, the account menu, the calendar wiring, the muscle attention badge
    // and the privacy-safe UI event hook.
    expect(scripts).toHaveLength(7);
    for (const script of scripts) expect(() => new Function(script[1] ?? "")).not.toThrow();
  });

  it("localizes the dock tabs, footers and close control in Chinese", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie: `${cookie}; poc3_lang=zh-HK` } })).text();
    expect(html).toContain(">對話</button>");
    expect(html).toContain(">狀態<");
    expect(html).toContain(">變更<");
    expect(html).toContain('aria-label="關閉教練面板"');
    expect(html).toContain("所有教練狀態");
    expect(html).toContain("在近期變更中開啟");
    expect(html).not.toContain(">Chat</button>");
  });

  it("tags action buttons with typed intents instead of hidden prose", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => seedActivity(store, runner.userId, "garmin:intent", "2026-11-04", "Morning run", 5),
    });
    const history = await (await fetch(`${base}/history?view=week&period=2026-11-02`, { headers: { cookie } })).text();
    expect(history).toContain("data-coach-intent");
    expect(history).toContain("review-activity");
    expect(history).toContain("review-week");
    expect(history).toContain("How did my Morning run go? (Wed, 4 Nov 2026 · 5 km · 30 min)");
    expect(history).not.toContain("comment-only review: do not add");
    const calendar = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(calendar).toContain("review-day");
    expect(calendar).toContain("data-coach-intent");
  });

  it("proxies a chat turn and passes suggestions and changes through", async () => {
    const gateway = await startMockGateway();
    const { base, cookie, user } = await start({ gatewayUrl: gateway.url });
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, "x-poc3-request-id": "req-web-1" },
      body: JSON.stringify({ message: "Plan my week" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      reply: string;
      sessions: number;
      changes: Array<{ action: string; title?: string }>;
      suggestions: string[];
      failures: unknown[];
      changeSetId: string | null;
      reverted: boolean;
      attempts: number;
      outcome: string;
      validationCode: string | null;
    };
    expect(body.reply).toBe("Booked two runs.");
    expect(body.sessions).toBe(2);
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]?.action).toBe("add");
    expect(body.suggestions).toEqual(["Book my long run for Sunday", "Move Thursday to Friday"]);
    expect(body.failures).toEqual([]);
    expect(body.changeSetId).toBe("change:test");
    expect(body.reverted).toBe(false);
    expect(body.attempts).toBe(1);
    expect(body.outcome).toBe("committed");
    expect(body.validationCode).toBeNull();
    expect(gateway.seenUser()).toBe(user.userId);
    expect(gateway.seenMessage()).toBe("Plan my week");
    expect(gateway.seenRequestId()).toBe("req-web-1");
  });

  it("passes structured failures through without a prose note", async () => {
    const failures = [
      { action: "remove", sessionId: "session:missing", title: "15 min drill", day: "2026-11-13", reason: "session-not-found" },
    ];
    const gateway = await startMockGateway({ failures });
    const { base, cookie } = await start({ gatewayUrl: gateway.url });
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ message: "Delete the session on 2026-11-13." }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { reply: string; failures: unknown[] };
    expect(body.reply).toBe("Booked two runs.");
    expect(body.reply).not.toContain("Note:");
    expect(body.failures).toEqual(failures);
  });

  it("builds directives from typed intents and forwards them", async () => {
    const gateway = await startMockGateway({
      poc3: {
        sessions: 0,
        memories: 0,
        changes: [],
        changeSetId: null,
        mode: "review",
        writesAllowed: false,
        blockedWrites: 1,
        directiveId: "directive:test",
      },
    });
    const { base, cookie, user } = await start({
      gatewayUrl: gateway.url,
      seed: (store, runner) => seedActivity(store, runner.userId, "garmin:review", "2026-11-04", "Morning run", 5),
    });
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        message: "How did my Morning run go?",
        intent: { kind: "review-activity", activityId: "garmin:review", source: "run-peek" },
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      mode: string | null;
      writesAllowed: boolean;
      blockedWrites: number;
      directiveId: string | null;
      sessions: number;
    };
    expect(body.mode).toBe("review");
    expect(body.writesAllowed).toBe(false);
    expect(body.blockedWrites).toBe(1);
    expect(body.directiveId).toBe("directive:test");
    expect(body.sessions).toBe(0);
    expect(gateway.seenMessage()).toBe("How did my Morning run go?");
    expect(gateway.seenUser()).toBe(user.userId);
    expect(gateway.seenDirective()).toMatchObject({
      mode: "review",
      allowCalendarWrites: false,
      references: { activityId: "garmin:review", day: "2026-11-04" },
      source: "run-peek",
    });
    const directive = gateway.seenDirective() as { focus?: string[]; background?: string };
    expect(directive.focus).toContain("schedule");
    expect(directive.background).toContain("Comment only");

    const undo = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ message: "Undo that", intent: { kind: "undo" } }),
    });
    expect(undo.status).toBe(200);
    expect(gateway.seenDirective()).toMatchObject({ mode: "undo", allowCalendarWrites: true, source: "composer" });

    const week = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        message: "Review my week",
        intent: { kind: "review-week", weekStart: "2026-11-11", source: "load-card" },
      }),
    });
    expect(week.status).toBe(200);
    expect(gateway.seenDirective()).toMatchObject({
      mode: "review",
      allowCalendarWrites: false,
      references: { weekStart: "2026-11-09" },
      source: "load-card",
    });

    const plan = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        message: "Add an easy run",
        intent: { kind: "plan", day: "2026-11-20", source: "day-menu" },
      }),
    });
    expect(plan.status).toBe(200);
    expect(gateway.seenDirective()).toMatchObject({
      mode: "plan",
      allowCalendarWrites: true,
      references: { day: "2026-11-20" },
      source: "day-menu",
    });
  });

  it("rejects an invalid intent and a missing run reference without calling the gateway", async () => {
    const gateway = await startMockGateway();
    const { base, cookie } = await start({ gatewayUrl: gateway.url });
    const missing = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ message: "Hi", intent: { kind: "review-activity", activityId: "garmin:missing" } }),
    });
    expect(missing.status).toBe(404);
    const unknown = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ message: "Hi", intent: { kind: "make-me-admin" } }),
    });
    expect(unknown.status).toBe(400);
    expect(gateway.seenMessage()).toBeUndefined();
  });

  it("forwards discuss-change and discuss-state intents as comment-only directives", async () => {
    const gateway = await startMockGateway();
    const { base, cookie } = await start({ gatewayUrl: gateway.url });
    const change = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        message: "Why did the plan change on 5 Nov? (Moved Easy 5 km to Sunday)",
        intent: { kind: "discuss-change", changeSetId: "change:move", source: "recent-changes" },
      }),
    });
    expect(change.status).toBe(200);
    expect(gateway.seenDirective()).toMatchObject({
      mode: "review",
      allowCalendarWrites: false,
      references: { changeSetId: "change:move" },
      source: "recent-changes",
    });
    // The gateway owns reference validation: a foreign id passes through instead of a web-side guess.
    const foreign = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        message: "Why did the plan change on 5 Nov?",
        intent: { kind: "discuss-change", changeSetId: "change:missing" },
      }),
    });
    expect(foreign.status).toBe(200);
    const state = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        message: "How should the Heat state shape my coming week?",
        intent: { kind: "discuss-state", stateId: "state:heat", source: "states-page" },
      }),
    });
    expect(state.status).toBe(200);
    expect(gateway.seenDirective()).toMatchObject({
      mode: "review",
      allowCalendarWrites: false,
      references: { stateId: "state:heat" },
      source: "states-page",
    });
  });

});

describe("coach audit", () => {
  it("shows the owner's hidden directives and coaching states without leaking another runner", async () => {
    const { base, handle, user, auth, cookie } = await start();
    const directive = {
      mode: "review" as const,
      allowCalendarWrites: false,
      allowMemoryWrites: true,
      focus: ["schedule" as const, "pace" as const],
      references: { activityId: "garmin:review", day: "2026-11-04" },
      background: "Comment only: check the day's plan.",
      source: "run-peek" as const,
      style: { language: "auto" as const, tone: "supportive" as const },
    };
    handle.store.appendCoachDirective({
      directiveId: "directive:one",
      userId: user.userId,
      requestId: "req-1",
      messageId: "m-1",
      visible: "How did my Morning run go?",
      directive,
      blockedWrites: 2,
      createdAt: `${TODAY}T09:00:00.000Z`,
    });
    handle.store.appendCoachState({
      stateId: "state:audit-owner",
      userId: user.userId,
      key: "race_week",
      status: "active",
      source: "user",
      confidence: 0.9,
      evidence: ['Race "Half marathon" on 2026-11-08 (2 days).'],
      activatedAt: `${TODAY}T08:00:00.000Z`,
      updatedAt: `${TODAY}T08:00:00.000Z`,
      expiresAt: "2026-11-20T00:00:00.000Z",
      resolvedAt: null,
    });
    handle.store.appendMemory({
      memoryId: "mode-1",
      userId: user.userId,
      text: "mode: legacy race week",
      createdAt: `${TODAY}T08:00:00.000Z`,
    });
    const other = auth.signup({
      username: "audit_other",
      password: "other-password-123",
      displayName: "Audit Other",
      timezone: "UTC",
    }).user;
    handle.store.appendCoachDirective({
      directiveId: "directive:other",
      userId: other.userId,
      requestId: "req-other",
      messageId: "m-other",
      visible: "Other secret",
      directive,
      blockedWrites: 0,
      createdAt: `${TODAY}T09:30:00.000Z`,
    });
    handle.store.appendCoachState({
      stateId: "state:audit-other",
      userId: other.userId,
      key: "illness",
      status: "active",
      source: "user",
      confidence: 1,
      evidence: ["Other secret state"],
      activatedAt: `${TODAY}T08:30:00.000Z`,
      updatedAt: `${TODAY}T08:30:00.000Z`,
      expiresAt: "2026-11-20T00:00:00.000Z",
      resolvedAt: null,
    });
    handle.store.appendMemory({
      memoryId: "mode-2",
      userId: other.userId,
      text: "mode: secret taper",
      createdAt: `${TODAY}T08:30:00.000Z`,
    });

    const html = await (await fetch(`${base}/coach-audit`, { headers: { cookie } })).text();
    expect(html).toContain("Coach audit");
    expect(html).toContain("How did my Morning run go?");
    expect(html).toContain("comment-only");
    expect(html).toContain("blocked 2");
    expect(html).toContain("Comment only: check the day&#39;s plan.");
    expect(html).toContain("Active coaching states");
    expect(html).toContain("Race week");
    expect(html).toContain("race_week");
    expect(html).toContain("Legacy mode memories");
    expect(html).toContain("mode: legacy race week");
    expect(html).toContain("activity garmin:review");
    expect(html).not.toContain("Other secret");
    expect(html).not.toContain("Other secret state");
    expect(html).not.toContain("mode: secret taper");
    expect(html).toContain("confidence 0.90");
    const css = await (await fetch(`${base}/static/app.css`)).text();
    expect(css).toContain(".audit-item");
    expect(css).toContain(".audit-background");
    expect(css).toContain(".state-guardrail");
  });
});

describe("conversation history after refresh", () => {
  it("returns the user's recent messages oldest first and never another runner's", async () => {
    const { base, handle, user, cookie, auth } = await start();
    const other = auth.signup({
      username: "history_other",
      password: "other-password-123",
      displayName: "History Other",
      timezone: "UTC",
    }).user;
    handle.store.appendMessage({ messageId: "m1", userId: user.userId, role: "user", text: "first", createdAt: `${TODAY}T01:00:00.000Z` });
    handle.store.appendMessage({ messageId: "m2", userId: user.userId, role: "assistant", text: "second", createdAt: `${TODAY}T02:00:00.000Z` });
    handle.store.appendMessage({ messageId: "m3", userId: other.userId, role: "user", text: "foreign", createdAt: `${TODAY}T03:00:00.000Z` });

    const response = await fetch(`${base}/chat/history`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: Array<{ role: string; text: string }> };
    expect(body.messages.map((message) => message.text)).toEqual(["first", "second"]);
    expect(body.messages.some((message) => message.text === "foreign")).toBe(false);
  });

  it("returns the change journal for the dock's Changes tab in one request", async () => {
    const { base, cookie, handle, user } = await start();
    const before = {
      sessionId: "session:history-move",
      userId: user.userId,
      day: "2026-11-06",
      title: "Easy 5 km",
      kind: "easy" as const,
      distanceKm: 5,
      durationMin: 35,
      note: null,
      createdAt: `${TODAY}T00:00:00.000Z`,
    };
    const after = { ...before, day: "2026-11-08" };
    const changeSet: ChangeSet = {
      changeSetId: "change:history",
      userId: user.userId,
      createdAt: `${TODAY}T09:00:00.000Z`,
      summary: "Moved Easy 5 km to Sunday",
      entries: [{ action: "update", sessionId: before.sessionId, before, after, fromDay: before.day, toDay: after.day, title: before.title, kind: before.kind }],
      revertedAt: null,
    };
    handle.store.appendChangeSet(changeSet);

    const response = await fetch(`${base}/chat/history`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      changes: Array<{
        changeSetId: string;
        summary: string;
        revertedAt: string | null;
        entries: Array<{ action: string; title: string; fromDay: string | null; toDay: string | null }>;
      }>;
    };
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({ changeSetId: "change:history", summary: "Moved Easy 5 km to Sunday", revertedAt: null });
    expect(body.changes[0]?.entries[0]).toMatchObject({ action: "update", title: "Easy 5 km", fromDay: "2026-11-06", toDay: "2026-11-08" });
  });

  it("greets a fresh runner on first open instead of an empty log, reflecting their goal", async () => {
    const { base } = await start();
    const noGoal = await fetch(`${base}/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ username: "greet_nogoal", displayName: "Greet No Goal", password: "greet-password-123", timezone: "UTC" }),
      redirect: "manual",
    });
    const noGoalCookie = cookieFrom(noGoal.headers.get("set-cookie") ?? "");
    const first = (await (await fetch(`${base}/chat/history`, { headers: { cookie: noGoalCookie } })).json()) as { messages: Array<{ role: string; text: string }> };
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0]?.role).toBe("assistant");
    expect(first.messages[0]?.text).toContain("Hi - I'm your coach");
    expect(first.messages[0]?.text).toContain("I never book anything you didn't ask for");
    expect(first.messages[0]?.text).not.toContain("You told me your goal");

    const withGoal = await fetch(`${base}/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ username: "greet_goal", displayName: "Greet Goal", password: "greet-password-123", timezone: "UTC", goal: "10k in February" }),
      redirect: "manual",
    });
    const goalCookie = cookieFrom(withGoal.headers.get("set-cookie") ?? "");
    const second = (await (await fetch(`${base}/chat/history`, { headers: { cookie: goalCookie } })).json()) as { messages: Array<{ role: string; text: string }> };
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]?.text).toContain('You told me your goal: "10k in February"');
    expect(second.messages[0]?.text).toContain("Want me to sketch a first week toward it?");
  });
});

describe("month navigation label", () => {
  it("shows the viewed month in the middle nav", async () => {
    const { base, cookie } = await start();
    const current = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(current).toContain('id="month-current"');
    expect(current).toContain(">November 2026</a>");
    expect(current).not.toContain("<h1>November 2026</h1>");
    expect(current).not.toContain('id="month-this"');
    const other = await (await fetch(`${base}/calendar?month=2026-12`, { headers: { cookie } })).text();
    expect(other).toContain(">December 2026</a>");
    expect(other).not.toContain('id="month-this"');
    expect(other).not.toContain("Back to November 2026");
  });
});

describe("month picker", () => {
  it("renders the viewed-month nav as a year/month picker", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).not.toContain('id="month-title"');
    expect(html).toContain('data-month="2026-11"');
    expect(html).toContain('data-current-month="2026-11"');
    expect(html).toContain("month-picker");
    expect(html).toContain("month-year-select");
    expect(html).toContain("month-picker-grid");
    expect(html).toContain('id="month-current"');
  });
});

describe("coach states page", () => {
  it("renders active, proposed and historical states without leaking another runner", async () => {
    const { base, handle, user, cookie, auth } = await start({
      seed: (store, owner) => {
        seedCoachState(store, owner.userId, "heat", { evidence: ["Hot and humid"] });
        seedCoachState(store, owner.userId, "pain_injury", {
          stateId: "state:pain",
          status: "observing",
          source: "chat",
          confidence: 0.6,
          evidence: ["Knee pain after the run"],
        });
        seedCoachState(store, owner.userId, "travel", {
          stateId: "state:old",
          status: "resolved",
          resolvedAt: `${TODAY}T07:00:00.000Z`,
          updatedAt: `${TODAY}T07:00:00.000Z`,
        });
      },
    });
    const other = auth.signup({
      username: "state_other",
      password: "other-password-123",
      displayName: "State Other",
      timezone: "UTC",
    }).user;
    seedCoachState(handle.store, other.userId, "illness", { stateId: "state:other", evidence: ["Other secret"] });

    const response = await fetch(`${base}/coach-states`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Coaching states");
    expect(html).toContain("Active states");
    // The page is grouped into Current / Set / History so the write and log jobs stop stretching it.
    expect(html).toContain('class="seg-tabs coach-states-tabs" role="radiogroup"');
    expect(html).toContain('id="coach-states-tab-current" value="current" data-track="page-tab" checked');
    expect(html).toContain('id="coach-states-tab-set" value="set" data-track="page-tab"');
    expect(html).toContain('id="coach-states-tab-history" value="history" data-track="page-tab"');
    expect(html).toContain('id="state-form-card"');
    expect(html).toContain('data-track="states-set"');
    expect(html).toContain('href="/coach-states?tab=set#state-form-card"');
    expect(html).toContain('data-seg-panel="current"');
    expect(html).toContain('data-seg-panel="set"');
    expect(html).toContain('data-seg-panel="history"');
    expect(html).toContain(">Current</label>");
    expect(html).toContain(">Set a state</label>");
    expect(html).toContain(">History</label>");
    expect(html.indexOf('data-seg-panel="current"')).toBeLessThan(html.indexOf('data-seg-panel="set"'));
    expect(html.indexOf('data-seg-panel="set"')).toBeLessThan(html.indexOf('data-seg-panel="history"'));
    expect(html).toContain("Heat");
    expect(html).toContain("Hot and humid");
    expect(html).toContain("Pain / injury");
    expect(html).toContain("Knee pain after the run");
    expect(html).toContain("Confirm");
    expect(html).toContain("Dismiss");
    expect(html).toContain("Set a state");
    expect(html).toContain("Covers the next N days");
    expect(html).toContain("days, starting today");
    expect(html).toContain("Choose a state...");
    expect(html).toContain("never lock your calendar");
    // The head action and a shared link land on the Set panel, not just the tab strip.
    const setTab = await (await fetch(`${base}/coach-states?tab=set`, { headers: { cookie } })).text();
    expect(setTab).toContain('id="coach-states-tab-set" value="set" data-track="page-tab" checked');
    expect(setTab).not.toContain('id="coach-states-tab-current" value="current" data-track="page-tab" checked');
    expect(html).toContain("Not medical advice");
    expect(html).toContain("Recent state history");
    expect(html).toContain("Travel");
    expect(html).toContain("state%3Apain");
    expect(html).toContain("Temporary situations");
    // Each state can reach the coach in one tap, with the stateId referenced by a typed discuss-state intent.
    expect(html).toContain("Ask coach about this state");
    expect(html).not.toContain("問問教練");
    expect(html).toContain("How should the Heat state shape my coming week?");
    expect(html).toContain("How should the Pain / injury state shape my coming week?");
    expect(html).toContain("discuss-state");
    expect(html).toContain("states-page");
    expect(html).not.toContain("confidence");
    expect(html).not.toContain("Guardrail:");
    expect(html).not.toContain('<span class="chip">heat</span>');
    expect(html).not.toContain('href="/coach-audit"');
    expect(html).not.toContain("Other secret");
    expect(user.userId).not.toBe(other.userId);
  });

  it("localizes the coaching states page chrome when the language cookie is zh-HK", async () => {
    const { base, cookie } = await start();
    const zh = `${cookie}; poc3_lang=zh-HK`;
    const html = await (await fetch(`${base}/coach-states`, { headers: { cookie: zh } })).text();
    expect(html).toContain('<html lang="zh-HK" dir="ltr">');
    expect(html).toContain("教練狀態");
    expect(html).toContain("生效狀態");
    expect(html).toContain("設定狀態");
    expect(html).toContain(">現況</label>");
    expect(html).toContain(">設定狀態</label>");
    expect(html).toContain(">記錄</label>");
    // English chrome must not leak through into the zh-HK render.
    expect(html).not.toContain("Active states");
    expect(html).not.toContain("Set a state");
  });

  it("renders Cantonese state catalog data when locale is zh-HK", async () => {
    const { base, cookie } = await start({
      seed: (store, owner) => {
        seedCoachState(store, owner.userId, "heat");
      },
    });
    const zh = `${cookie}; poc3_lang=zh-HK`;
    const html = await (await fetch(`${base}/coach-states`, { headers: { cookie: zh } })).text();
    // Cantonese label and description must appear.
    expect(html).toContain("高溫");
    expect(html).toContain("高溫天氣");
    // English label must NOT appear as card text.
    expect(html).not.toContain("<strong>Heat</strong>");
    // English description must not leak.
    expect(html).not.toContain("Hot conditions.");
    // The coach prompt stays English (data-coach-message).
    expect(html).toContain("How should the Heat state shape my coming week?");
  });

  it("sets a state from the form and reports validation errors", async () => {
    const { base, handle, user, cookie } = await start();
    const saved = await fetch(`${base}/coach-states`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: formBody({ key: "travel", ttlDays: "10", note: "Tokyo" }),
      redirect: "manual",
    });
    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/coach-states");
    const active = handle.store.getActiveCoachStates(user.userId, `${TODAY}T08:00:00.000Z`);
    expect(active.find((state) => state.key === "travel")).toMatchObject({ source: "user", evidence: ["Tokyo"] });

    const page = await (await fetch(`${base}/coach-states`, { headers: { cookie } })).text();
    expect(page).toContain("Tokyo");

    const badKey = await fetch(`${base}/coach-states`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: formBody({ key: "mode: race week", ttlDays: "7" }),
      redirect: "manual",
    });
    expect(badKey.status).toBe(303);
    expect(badKey.headers.get("location")).toBe("/coach-states?error=invalid-key");

    const badTtl = await fetch(`${base}/coach-states`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: formBody({ key: "heat", ttlDays: "0" }),
      redirect: "manual",
    });
    expect(badTtl.status).toBe(303);
    expect(badTtl.headers.get("location")).toBe("/coach-states?error=invalid-ttl");
    expect(handle.store.getActiveCoachStates(user.userId, `${TODAY}T08:00:00.000Z`).some((state) => state.key === "heat")).toBe(false);

    const badNote = await fetch(`${base}/coach-states`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: formBody({ key: "heat", ttlDays: "7", note: "x".repeat(201) }),
      redirect: "manual",
    });
    expect(badNote.status).toBe(303);
    expect(badNote.headers.get("location")).toBe("/coach-states?error=invalid-note");
  });

  it("refreshes auto states only through the explicit refresh action", async () => {
    const { base, cookie } = await start({
      seed: (store, owner) => {
        seedSession(store, owner.userId, "race:web", "2026-11-08", "Half marathon", "race", 21.1);
      },
    });
    const before = await (await fetch(`${base}/coach-states`, { headers: { cookie } })).text();
    expect(before).toContain("Refresh");
    expect(before).not.toContain("更新");
    expect(before).not.toContain("2026-11-08");

    const refreshed = await fetch(`${base}/coach-states/refresh`, {
      method: "POST",
      headers: { cookie },
      redirect: "manual",
    });
    expect(refreshed.status).toBe(303);
    expect(refreshed.headers.get("location")).toBe("/coach-states");

    const after = await (await fetch(`${base}/coach-states`, { headers: { cookie } })).text();
    expect(after).toContain("2026-11-08");
    expect(after).toContain("Race week");
    expect(after).toContain("Setup");
    expect(after).not.toContain("設定");
    expect(after).toContain("Connect Garmin");
  });

  it("rejects a cross-origin state POST and keeps the state unchanged", async () => {
    const { base, handle, user, cookie } = await start();
    const response = await fetch(`${base}/coach-states`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie,
        origin: "http://evil.test",
      },
      body: formBody({ key: "travel", ttlDays: "7", note: "Cross origin" }),
      redirect: "manual",
    });
    expect(response.status).toBe(403);
    expect(handle.store.getActiveCoachStates(user.userId, `${TODAY}T08:00:00.000Z`).some((state) => state.key === "travel")).toBe(false);
  });

  it("shows immutable state events on the audit page", async () => {
    const { base, cookie } = await start();
    const saved = await fetch(`${base}/coach-states`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: formBody({ key: "travel", ttlDays: "7", note: "Tokyo" }),
      redirect: "manual",
    });
    expect(saved.status).toBe(303);
    const html = await (await fetch(`${base}/coach-audit`, { headers: { cookie } })).text();
    expect(html).toContain("State activity");
    expect(html).toContain("set");
    expect(html).toContain("Travel");
  });

  it("requires auth for the state manager and audit pages", async () => {
    const { base } = await start();
    for (const path of ["/coach-states", "/coach-audit"]) {
      const response = await fetch(`${base}${path}`, { redirect: "manual" });
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/login");
    }
  });

  it("confirms and resolves a proposed state, scoped to the owner", async () => {
    const { base, handle, user, cookie, auth } = await start({
      seed: (store, owner) => {
        seedCoachState(store, owner.userId, "pain_injury", {
          stateId: "state:confirm",
          status: "observing",
          source: "chat",
          evidence: ["Knee pain"],
        });
      },
    });
    const other = auth.signup({
      username: "confirm_other",
      password: "other-password-123",
      displayName: "Confirm Other",
      timezone: "UTC",
    }).user;
    seedCoachState(handle.store, other.userId, "illness", {
      stateId: "state:foreign",
      status: "observing",
      source: "chat",
    });

    const confirm = await fetch(`${base}/coach-states/${encodeURIComponent("state:confirm")}/confirm`, {
      method: "POST",
      headers: { cookie },
      redirect: "manual",
    });
    expect(confirm.status).toBe(303);
    expect(handle.store.getCoachState(user.userId, "state:confirm")?.status).toBe("active");
    expect(handle.store.listCoachStateEvents(user.userId, 10).some((event) => event.action === "confirm")).toBe(true);

    const resolve = await fetch(`${base}/coach-states/${encodeURIComponent("state:confirm")}/resolve`, {
      method: "POST",
      headers: { cookie },
      redirect: "manual",
    });
    expect(resolve.status).toBe(303);
    expect(handle.store.getCoachState(user.userId, "state:confirm")).toMatchObject({ status: "resolved", source: "user" });
    expect(handle.store.listCoachStateEvents(user.userId, 10).some((event) => event.action === "resolve")).toBe(true);

    const foreign = await fetch(`${base}/coach-states/${encodeURIComponent("state:foreign")}/confirm`, {
      method: "POST",
      headers: { cookie },
      redirect: "manual",
    });
    expect(foreign.status).toBe(303);
    expect(foreign.headers.get("location")).toContain("/coach-states?error=");
    expect(handle.store.getCoachState(other.userId, "state:foreign")?.status).toBe("observing");

    const get = await fetch(`${base}/coach-states/${encodeURIComponent("state:confirm")}/confirm`, {
      headers: { cookie },
    });
    expect(get.status).toBe(405);
  });

  it("shows active state chips on the calendar and links to the manager", async () => {
    const { base, cookie } = await start({
      seed: (store, owner) => {
        seedCoachState(store, owner.userId, "heat", { evidence: ["Hot week"] });
      },
    });
    const html = await (await fetch(`${base}/calendar`, { headers: { cookie } })).text();
    expect(html).toContain('class="state-chips"');
    expect(html).toContain("state-chip");
    expect(html).toContain("Heat");
    expect(html).toContain("/coach-states");
    expect(html).toContain("States");
  });

  it("omits the chip row when there are no active states", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/calendar`, { headers: { cookie } })).text();
    expect(html).not.toContain('class="state-chips"');
  });

  it("forwards state changes and blocked-state labels to the chat bubble", async () => {
    const gateway = await startMockGateway({
      poc3: {
        states: [{ stateId: "state:web-travel", key: "travel", status: "active", action: "activate" }],
        blockedByStates: ["race_week"],
      },
    });
    const { base, cookie } = await start({
      gatewayUrl: gateway.url,
      seed: (store, owner) => {
        seedCoachState(store, owner.userId, "travel", {
          stateId: "state:web-travel",
          evidence: ["Tokyo trip"],
        });
      },
    });
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, "x-poc3-request-id": "req-web-state" },
      body: JSON.stringify({ message: "I am travelling next week" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      states?: Array<{ stateId?: string; key?: string; label?: string; status?: string; source?: string; evidence?: string[] }>;
      blockedByStates?: Array<{ key?: string; label?: string }>;
    };
    expect(body.states).toHaveLength(1);
    expect(body.states?.[0]).toMatchObject({
      stateId: "state:web-travel",
      key: "travel",
      label: "Travel",
      status: "active",
      source: "user",
      evidence: ["Tokyo trip"],
    });
    expect(body.blockedByStates).toEqual([{ key: "race_week", label: "Race week" }]);

    const page = await (await fetch(`${base}/calendar`, { headers: { cookie } })).text();
    expect(page).toContain("addStateCards");
    expect(page).toContain("state-bubble-head");
    expect(page).toContain("Calendar unchanged — ");
    // The guardrail line keeps its meaning but speaks as a consultant: what is protected, then the offer to discuss.
    expect(page).toContain("is protecting the plan · want to talk through what would work instead?");
    const css = await (await fetch(`${base}/static/app.css`)).text();
    expect(css).toContain(".state-card");
    expect(css).toContain(".state-form");
    expect(css).toContain(".state-bubble-head");
  });
});

describe("involve the coach actions", () => {
  it("adds a friend-voiced ramp chip and warning when the load signal is high", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        const baseActivity = {
          userId: runner.userId,
          distanceKm: 5,
          durationMin: 30,
          paceSecPerKm: 360,
          avgHr: 145,
          source: "garmin" as const,
          createdAt: `${TODAY}T08:00:00.000Z`,
          trainingEffectLabel: "AEROBIC_BASE",
        };
        store.appendActivity({ ...baseActivity, activityId: "garmin:burst-1", day: "2026-11-02", title: "Easy one", trainingLoad: 100 });
        store.appendActivity({ ...baseActivity, activityId: "garmin:burst-2", day: "2026-11-04", title: "Tempo one", distanceKm: 6, trainingLoad: 100, trainingEffectLabel: "TEMPO" });
        store.appendActivity({ ...baseActivity, activityId: "garmin:burst-3", day: "2026-11-05", title: "Another one", trainingLoad: 100 });
        store.appendActivity({ ...baseActivity, activityId: "garmin:prev-1", day: "2026-10-27", title: "Previous run", trainingLoad: 100 });
        store.appendActivity({ ...baseActivity, activityId: "garmin:old-1", day: "2026-10-13", title: "Earlier run", trainingLoad: 100 });
        store.appendActivity({ ...baseActivity, activityId: "garmin:old-2", day: "2026-10-20", title: "Earlier run 2", trainingLoad: 100 });
      },
    });

    const html = await (await fetch(`${base}/history?view=week&period=2026-11-02`, { headers: { cookie } })).text();
    expect(html).toContain('class="load-chip high"');
    expect(html).toContain("High ramp");
    // The warning line is consultative and data-accurate: the runner's own numbers, then the decision handed back.
    expect(html).toContain("This week&#39;s load is high (+200% versus last week, ACWR 2.00) - want to talk it through?");
    expect(html).toContain("load-warning");
    expect(html).toContain("Talk through this ramp");
    expect(html).toContain("The last week or two ramped up - can we talk it through?");
    // The ramp chip reuses the main button's review-week wiring: the same intent and the same weekStart.
    expect((html.match(/&quot;review-week&quot;/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((html.match(/&quot;weekStart&quot;:&quot;2026-11-02&quot;/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Hard 1 run");
    // Where the hard/easy split is shown, the reported-effort rule is stated once.
    expect(html).toContain("A reported effort of 7 or above counts as hard.");
  });

  it("adds the same ramp chip when the signal is only watch", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        const baseActivity = {
          userId: runner.userId,
          distanceKm: 5,
          durationMin: 30,
          paceSecPerKm: 360,
          avgHr: 145,
          source: "garmin" as const,
          createdAt: `${TODAY}T08:00:00.000Z`,
          trainingEffectLabel: "AEROBIC_BASE",
        };
        store.appendActivity({ ...baseActivity, activityId: "garmin:drift-1", day: "2026-11-02", title: "Easy one", trainingLoad: 125 });
        store.appendActivity({ ...baseActivity, activityId: "garmin:drift-prev", day: "2026-10-27", title: "Previous run", trainingLoad: 100 });
        store.appendActivity({ ...baseActivity, activityId: "garmin:drift-old1", day: "2026-10-13", title: "Earlier run", trainingLoad: 100 });
        store.appendActivity({ ...baseActivity, activityId: "garmin:drift-old2", day: "2026-10-20", title: "Earlier run 2", trainingLoad: 100 });
      },
    });

    const html = await (await fetch(`${base}/history?view=week&period=2026-11-02`, { headers: { cookie } })).text();
    expect(html).toContain('class="load-chip watch"');
    expect(html).toContain("Watch the ramp");
    expect(html).toContain("This week&#39;s load is ramping up (+25% versus last week, ACWR 1.18) - worth talking through before it gets steep?");
    expect(html).toContain("Talk through this ramp");
  });

  it("offers to tell the coach about a new goal after the goal changes", async () => {
    const { base, cookie } = await start();
    const update = await fetch(`${base}/profile`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: formBody({ goal: "Marathon in spring" }),
      redirect: "manual",
    });
    expect(update.status).toBe(303);
    expect(update.headers.get("location")).toBe("/profile?saved=1&goal=1");
    const page = await (await fetch(`${base}/profile?saved=1&goal=1`, { headers: { cookie } })).text();
    expect(page).toContain("New goal saved");
    expect(page).toContain("Tell the coach about your new goal");
    // The prefilled message carries the new goal text and waits for the runner's edit before sending.
    expect(page).toContain("My new goal is Marathon in spring. Can you help me plan toward it?");
    expect(page).toContain('data-coach-send="false"');
    const offer = page.match(/<button[^>]*>Tell the coach about your new goal<\/button>/)?.[0] ?? "";
    expect(offer).not.toContain("data-coach-intent");

    // Re-saving the same goal does not repeat the offer; a plain profile save stays quiet.
    const again = await fetch(`${base}/profile`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: formBody({ goal: "Marathon in spring" }),
      redirect: "manual",
    });
    expect(again.headers.get("location")).toBe("/profile?saved=1");
    const againPage = await (await fetch(`${base}/profile?saved=1`, { headers: { cookie } })).text();
    expect(againPage).not.toContain("Tell the coach about your new goal");
  });
});

describe("page titles", () => {
  it("puts the current nav and page before the site name and unread count", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        for (let index = 1; index <= 3; index += 1) seedNotification(store, runner.userId, index);
        seedActivity(store, runner.userId, "a1", "2026-11-06", "Morning run", 5);
      },
    });

    const calendar = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(calendar).toContain("<title>Plan · AI Coach Calendar (3)</title>");
    expect(calendar).toContain('data-site-name="AI Coach Calendar"');
    expect(calendar).toContain('data-page-context="Plan"');
    expect(calendar).toContain("document.title =");

    const history = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(history).toContain("<title>Training log · AI Coach Calendar (3)</title>");

    const activity = await (await fetch(`${base}/activity/a1`, { headers: { cookie } })).text();
    expect(activity).toContain("<title>Training log · Activity · AI Coach Calendar (3)</title>");

    const day = await (await fetch(`${base}/day/2026-11-06`, { headers: { cookie } })).text();
    expect(day).toContain("<title>Plan · Fri, 6 Nov 2026 · AI Coach Calendar (3)</title>");

    const profile = await (await fetch(`${base}/profile`, { headers: { cookie } })).text();
    expect(profile).toContain("<title>Profile · AI Coach Calendar (3)</title>");

    const states = await (await fetch(`${base}/coach-states`, { headers: { cookie } })).text();
    expect(states).toContain("<title>Coaching states · AI Coach Calendar (3)</title>");

    const audit = await (await fetch(`${base}/coach-audit`, { headers: { cookie } })).text();
    expect(audit).toContain("<title>Coach audit · AI Coach Calendar (3)</title>");
  });

  it("shows the view switch inside the app bar only on pages that name a view", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => seedActivity(store, runner.userId, "a1", "2026-11-06", "Morning run", 5),
    });

    const calendar = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(calendar).toContain('</a><nav class="view-switch" data-active="calendar"');
    expect(calendar).toContain('href="/calendar" aria-current="page">Plan</a>');
    expect(calendar).toContain('class="view-tab" href="/history">Training log</a>');

    const day = await (await fetch(`${base}/day/2026-11-06`, { headers: { cookie } })).text();
    expect(day).toContain('data-active="calendar"');
    expect(day).toContain('aria-current="page">Plan</a>');

    const history = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(history).toContain('<nav class="view-switch" data-active="history"');
    expect(history).toContain('class="view-tab" href="/calendar">Plan</a>');
    expect(history).toContain('href="/history" aria-current="page">Training log</a>');

    const activity = await (await fetch(`${base}/activity/a1`, { headers: { cookie } })).text();
    expect(activity).toContain('data-active="history"');
    expect(activity).toContain('aria-current="page">Training log</a>');

    for (const path of ["/profile", "/coach-states", "/coach-audit", "/missing-page"]) {
      const html = await (await fetch(`${base}${path}`, { headers: { cookie } })).text();
      expect(html).not.toContain("view-switch");
      expect(html).not.toContain("view-tab");
    }

    const login = await (await fetch(`${base}/login`)).text();
    expect(login).not.toContain("view-switch");
  });

  it("caps the title count at 99+ and drops it after notifications are read", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        for (let index = 1; index <= 100; index += 1) seedNotification(store, runner.userId, index);
      },
    });

    const before = await (await fetch(`${base}/profile`, { headers: { cookie } })).text();
    expect(before).toContain("<title>Profile · AI Coach Calendar (99+)</title>");

    await fetch(`${base}/notifications/read`, { method: "POST", headers: { cookie } });
    const after = await (await fetch(`${base}/profile`, { headers: { cookie } })).text();
    expect(after).toContain("<title>Profile · AI Coach Calendar</title>");

    const calendar = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(calendar).toContain("<title>Plan · AI Coach Calendar</title>");
  });

  it("shows the site name without a count on signed-out and error pages", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => seedNotification(store, runner.userId, 1),
    });

    const login = await (await fetch(`${base}/login`)).text();
    expect(login).toContain("<title>Sign in · AI Coach Calendar</title>");

    const signup = await (await fetch(`${base}/signup`)).text();
    expect(signup).toContain("<title>Create an account · AI Coach Calendar</title>");

    const missing = await (await fetch(`${base}/missing-page`, { headers: { cookie } })).text();
    expect(missing).toContain("<title>Not found · AI Coach Calendar (1)</title>");
    expect(missing).not.toContain("<title>Plan · Not found");
  });
});

describe("honest demo slice", () => {
  const postForm = async (url: string, cookie: string, values: Record<string, string>): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: formBody(values),
      redirect: "manual",
    });

  it("logs a reported run and shows it on the calendar, day page and training log", async () => {
    const { base, cookie, handle, user } = await start();
    const response = await postForm(`${base}/activities`, cookie, {
      day: "2026-11-04",
      title: "Treadmill run",
      distanceKm: "5",
      durationMin: "30",
      requestId: "request-abcdef12",
      next: "/day/2026-11-04",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("logged=1");
    const stored = handle.store.listActivities(user.userId, 10);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      title: "Treadmill run",
      day: "2026-11-04",
      distanceKm: 5,
      durationMin: 30,
      paceSecPerKm: 360,
      source: "chat",
    });
    // A log without the optional effort stores null, not a guess.
    expect(stored[0]?.rpe).toBeNull();

    const calendar = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(calendar).toContain("Treadmill run");
    expect(calendar).toContain("Log a run");
    const day = await (await fetch(`${base}/day/2026-11-04`, { headers: { cookie } })).text();
    expect(day).toContain("Treadmill run");
    expect(day).toContain("Log a run");
    const history = await (await fetch(`${base}/history?view=week&period=2026-11-02`, { headers: { cookie } })).text();
    expect(history).toContain("Treadmill run");
  });

  it("replaces a double submit instead of duplicating it and rejects a future run", async () => {
    const { base, cookie, handle, user } = await start();
    const values = { day: "2026-11-04", title: "Commute", distanceKm: "4", durationMin: "24", requestId: "request-idem-1234", next: "/day/2026-11-04" };
    await postForm(`${base}/activities`, cookie, values);
    await postForm(`${base}/activities`, cookie, { ...values, title: "Commute home" });
    const stored = handle.store.listActivities(user.userId, 10);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.title).toBe("Commute home");

    const future = await postForm(`${base}/activities`, cookie, { day: "2026-11-20", distanceKm: "5", durationMin: "30", requestId: "request-future-1", next: "/day/2026-11-20" });
    expect(future.status).toBe(303);
    const futureLocation = new URL(future.headers.get("location") ?? "/", base);
    expect(futureLocation.searchParams.get("logError")).toBe("A run cannot be logged in the future.");
    expect(handle.store.listActivities(user.userId, 10)).toHaveLength(1);
  });

  it("keeps reported runs scoped to the runner who logged them", async () => {
    const { base, auth, cookie } = await start();
    await postForm(`${base}/activities`, cookie, { day: "2026-11-04", title: "Private treadmill", distanceKm: "5", durationMin: "30", requestId: "request-private1", next: "/day/2026-11-04" });
    auth.signup({ username: "other_runner", password: "other-password-123", displayName: "Other Runner", timezone: "UTC" });
    const otherCookie = cookieFrom(auth.login({ username: "other_runner", password: "other-password-123" }).cookie);
    const otherCalendar = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie: otherCookie } })).text();
    expect(otherCalendar).not.toContain("Private treadmill");
  });

  it("logs a run with its effort and offers the same review card a synced run gets", async () => {
    const { base, cookie, handle, user } = await start();
    const response = await postForm(`${base}/activities`, cookie, {
      day: "2026-11-04",
      title: "Treadmill run",
      distanceKm: "5",
      durationMin: "30",
      rpe: "7",
      requestId: "request-rpe-0001",
      next: "/day/2026-11-04",
    });
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "/", base);
    // The day page's own log form returns to that day, carrying the id of the run just logged.
    expect(location.pathname).toBe("/day/2026-11-04");
    expect(location.searchParams.get("logged")).toBe("1");
    const activityId = location.searchParams.get("review") ?? "";
    expect(activityId.startsWith("activity:manual:")).toBe(true);
    expect(handle.store.getActivity(user.userId, activityId)).toMatchObject({ title: "Treadmill run", rpe: 7 });
    const day = await (await fetch(`${base}${location.pathname}${location.search}`, { headers: { cookie } })).text();
    expect(day).toContain("Run logged. It is now part of your calendar and training log.");
    expect(day).toContain("Review this run with the coach");
    expect(day).toContain("review-activity");
    expect(day).toContain("Treadmill run");
    // The manual log form carries the optional effort field with the exact name and bounds the builder validates.
    expect(day).toContain('name="rpe"');
    expect(day).toContain('id="log-rpe" name="rpe" type="number" min="0" max="10" step="0.5"');
    expect(day).toContain("How did it feel? (0-10, optional)");
    // The same one-tap card renders on the training log the form can also return to.
    const historyLog = await postForm(`${base}/activities`, cookie, {
      day: "2026-11-03",
      title: "Commute run",
      distanceKm: "4",
      durationMin: "24",
      requestId: "request-rpe-0002",
      next: "/history?view=week&period=2026-11-02",
    });
    const historyLocation = new URL(historyLog.headers.get("location") ?? "/", base);
    expect(historyLocation.pathname).toBe("/history");
    const historyHtml = await (await fetch(`${base}${historyLocation.pathname}${historyLocation.search}`, { headers: { cookie } })).text();
    expect(historyHtml).toContain("Review this run with the coach");
    expect(historyHtml).toContain("Commute run");
    // The effort the runner reported shows where the run is read: the detail page and the calendar peek.
    const detail = await (await fetch(`${base}/activity/${encodeURIComponent(activityId)}`, { headers: { cookie } })).text();
    expect(detail).toContain("Felt 7/10 - hard");
    const peek = (await (
      await fetch(`${base}/activity/${encodeURIComponent(activityId)}/peek`, { headers: { cookie } })
    ).json()) as { peek: { extra: Array<{ label: string; value: string }> } };
    expect(peek.peek.extra).toEqual(expect.arrayContaining([{ label: "Felt", value: "Felt 7/10 - hard" }]));
  });

  it("rejects an effort outside the half-step scale and shows the banner on the day page", async () => {
    const { base, cookie, handle, user } = await start();
    const response = await postForm(`${base}/activities`, cookie, {
      day: "2026-11-04",
      title: "Odd effort",
      distanceKm: "5",
      durationMin: "30",
      rpe: "7.25",
      requestId: "request-rpe-bad1",
      next: "/day/2026-11-04",
    });
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "/", base);
    expect(location.searchParams.get("logError")).toBe("RPE must be between 0 and 10 in half steps.");
    expect(handle.store.listActivities(user.userId, 10)).toHaveLength(0);
    const day = await (await fetch(`${base}${location.pathname}${location.search}`, { headers: { cookie } })).text();
    expect(day).toContain("Could not log the run: RPE must be between 0 and 10 in half steps.");
  });

  it("shows the sync result, the key deletion and the horizon", async () => {
    const { base, cookie, handle, user } = await start();
    const synced = await (await fetch(`${base}/calendar?synced=2`, { headers: { cookie } })).text();
    expect(synced).toContain("Garmin sync finished: 2 new activities.");
    const failed = await (await fetch(`${base}/calendar?syncError=HTTP%20401`, { headers: { cookie } })).text();
    expect(failed).toContain("Garmin sync failed: HTTP 401");
    expect(synced).toContain("Books up to 180 days ahead");
    expect(synced).toContain('data-timezone="Asia/Hong_Kong"');

    handle.store.saveGarminKey({ userId: user.userId, apiKey: "valid-key-123", savedAt: `${TODAY}T07:00:00.000Z` });
    const deleted = await postForm(`${base}/garmin/key/delete`, cookie, { next: "/calendar" });
    expect(deleted.status).toBe(303);
    expect(deleted.headers.get("location")).toContain("garmin=deleted");
    expect(handle.store.getGarminKey(user.userId)).toBeUndefined();
    const after = await (await fetch(`${base}/calendar?garmin=deleted`, { headers: { cookie } })).text();
    expect(after).toContain("Garmin key removed. Sync is off until you connect again.");
    expect(after).toContain("Garmin is not connected");
  });

  it("keeps a pending sensitive state confirmable after a refresh", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        seedCoachState(store, runner.userId, "pain_injury", {
          stateId: "state:pain",
          status: "observing",
          source: "chat",
          evidence: ["Left knee hurts after the long run"],
        });
      },
    });
    const response = await fetch(`${base}/chat/history`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: unknown[]; states: Array<{ stateId: string; status: string; key: string }> };
    expect(body.states).toEqual(expect.arrayContaining([
      expect.objectContaining({ stateId: "state:pain", status: "observing", key: "pain_injury" }),
    ]));
  });

  it("shows the recent change set and undoes it through the audited path", async () => {
    const { base, cookie, handle, user } = await start();
    const before = {
      sessionId: "session:move",
      userId: user.userId,
      day: "2026-11-06",
      title: "Easy 5 km",
      kind: "easy" as const,
      distanceKm: 5,
      durationMin: 35,
      note: null,
      createdAt: `${TODAY}T00:00:00.000Z`,
    };
    const after = { ...before, day: "2026-11-08" };
    handle.store.upsertSession(after);
    const changeSet: ChangeSet = {
      changeSetId: "change:move",
      userId: user.userId,
      createdAt: `${TODAY}T09:00:00.000Z`,
      summary: "Moved Easy 5 km to Sunday",
      entries: [{ action: "update", sessionId: before.sessionId, before, after, fromDay: before.day, toDay: after.day, title: before.title, kind: before.kind }],
      revertedAt: null,
    };
    handle.store.appendChangeSet(changeSet);

    const calendar = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(calendar).toContain("Recent changes");
    expect(calendar).toContain("Moved Easy 5 km to Sunday");
    expect(calendar).toContain("Undo this change");
    // Each change set also opens a comment-only discussion about what it did and why.
    expect(calendar).toContain("Discuss this change");
    expect(calendar).toContain("Why did the plan change on 5 Nov? (Moved Easy 5 km to Sunday)");
    expect(calendar).toContain("discuss-change");
    expect(calendar).toContain("recent-changes");
    // The card carries the change-set id so the dock can mark it undone in place without a reload.
    expect(calendar).toContain('data-change-set="change:move"');
    expect(calendar).toContain(`title="Chat with the coach about what this change did. Your calendar will not change."`);

    const undo = await postForm(`${base}/calendar/changes/change%3Amove/revert`, cookie, { next: "/calendar" });
    expect(undo.status).toBe(303);
    expect(undo.headers.get("location")).toContain("undone=1");
    expect(handle.store.getSession(user.userId, before.sessionId)?.day).toBe("2026-11-06");
    expect(handle.store.listChangeSets(user.userId, 10).some((set) => set.summary.startsWith("Undo:"))).toBe(true);

    const again = await postForm(`${base}/calendar/changes/change%3Amove/revert`, cookie, { next: "/calendar" });
    const againLocation = new URL(again.headers.get("location") ?? "/", base);
    expect(againLocation.searchParams.get("undoError")).toBe("that change was already undone");
  });

  it("exports only the runner's own data as JSON and ICS", async () => {
    const { base, auth, cookie, handle, user } = await start({
      seed: (store, runner) => seedActivity(store, runner.userId, "garmin:export", "2026-11-04", "Export run", 6),
    });
    const jsonResponse = await fetch(`${base}/export.json`, { headers: { cookie } });
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get("content-disposition")).toContain("attachment");
    const text = await jsonResponse.text();
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("apiKey");
    const bundle = JSON.parse(text) as { profile: { username: string }; sessions: unknown[]; activities: Array<{ title: string }> };
    expect(bundle.profile.username).toBe(USERNAME);
    expect(bundle.sessions).toHaveLength(1);
    expect(bundle.activities[0]?.title).toBe("Export run");

    const icsResponse = await fetch(`${base}/export.ics`, { headers: { cookie } });
    expect(icsResponse.status).toBe(200);
    expect(icsResponse.headers.get("content-type")).toContain("text/calendar");
    const ics = await icsResponse.text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261106");

    auth.signup({ username: "other_runner", password: "other-password-123", displayName: "Other Runner", timezone: "UTC" });
    const otherCookie = cookieFrom(auth.login({ username: "other_runner", password: "other-password-123" }).cookie);
    const other = await (await fetch(`${base}/export.json`, { headers: { cookie: otherCookie } })).json() as { sessions: unknown[]; activities: unknown[] };
    expect(other.sessions).toHaveLength(0);
    expect(other.activities).toHaveLength(0);
    expect(handle.store.listActivities(user.userId, 10)).toHaveLength(1);
  });

  it("validates a malformed month instead of returning a 500", async () => {
    const { base, cookie } = await start();
    const page = await fetch(`${base}/calendar?month=2026-13`, { headers: { cookie } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("November 2026");
    const data = await (await fetch(`${base}/calendar/data?month=nope`, { headers: { cookie } })).json() as { month: string };
    expect(data.month).toBe("2026-11");
  });

  it("labels the trend window and the PR scope", async () => {
    const { base, cookie } = await start({
      seed: (store, runner) => {
        for (let index = 1; index <= 13; index += 1) {
          seedActivity(store, runner.userId, `garmin:trend-${index}`, `2026-11-${String(index).padStart(2, "0")}`, `Run ${index}`, 5);
        }
      },
    });
    const html = await (await fetch(`${base}/history?view=month&period=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain("The trend plots the last 12 runs with the selected metric");
    expect(html).toContain("within your stored history");
  });

  it("serves reduced-motion CSS and session intent copy", async () => {
    const { base, cookie } = await start();
    const css = await (await fetch(`${base}/static/app.css`)).text();
    expect(css).toContain("prefers-reduced-motion");
    const day = await (await fetch(`${base}/day/2026-11-06`, { headers: { cookie } })).text();
    expect(day).toContain("Aerobic base");
    expect(day).toContain("Conversational");
  });
});

