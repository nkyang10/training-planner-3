import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createAuth, type Auth, type AuthUser } from "../src/auth";
import { GarminError, type GarminClient } from "../src/garmin";
import { createStore, type StoreHandle } from "../src/store";
import type { SessionKind, Store } from "../src/types";
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
}

interface MockGatewayOptions {
  failures?: unknown[];
}

const startMockGateway = async (options: MockGatewayOptions = {}): Promise<MockGateway> => {
  let seenUser: string | undefined;
  let seenMessage: string | undefined;
  let seenRequestId: string | undefined;
  const server = createServer((request, response) => {
    void (async (): Promise<void> => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        messages?: Array<{ role?: string; content?: string }>;
      };
      seenUser = typeof request.headers["x-poc3-user"] === "string" ? request.headers["x-poc3-user"] : undefined;
      seenMessage = body.messages?.[0]?.content;
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
    expect(await calendar.text()).toContain("Welcome back, New Runner");

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
    expect(html).toContain('data-active="none"');

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
    expect(update.headers.get("location")).toBe("/profile?saved=1");
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
    ).json()) as { month: string; days: Record<string, { sessions: Array<{ title: string }>; activities: number }> };
    expect(ownData.month).toBe("2026-11");
    expect(ownData.days["2026-11-06"]?.sessions[0]?.title).toBe("Easy 5 km");
    expect(ownData.days["2026-11-06"]?.activities).toBe(0);
    expect(ownData.days["2026-11-07"]).toBeUndefined();

    const ownDay = await fetch(`${base}/day/2026-11-06`, { headers: { cookie } });
    const ownDayHtml = await ownDay.text();
    expect(ownDayHtml).toContain("Easy 5 km");
    expect(ownDayHtml).toContain('href="/profile"');
    expect(ownDayHtml).toContain("Demo Runner");

    const otherDay = await fetch(`${base}/day/2026-11-07`, { headers: { cookie } });
    const otherDayHtml = await otherDay.text();
    expect(otherDayHtml).not.toContain("Other secret long run");

    const foreignDay = await fetch(`${base}/day/2026-11-07`, { headers: { cookie: otherCookie } });
    expect(await foreignDay.text()).toContain("Other secret long run");
    expect(handle.store.getUser(user.userId)?.username).toBe(USERNAME);
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
    expect(response.headers.get("location")).toBe("/calendar?synced=1");
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
    expect(first.headers.get("location")).toBe("/history?synced=1");
    const second = await sync();
    expect(second.status).toBe(303);
    expect(second.headers.get("location")).toBe("/history?synced=1");
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);

    const historyHtml = await (await fetch(`${base}/history?synced=1`, { headers: { cookie } })).text();
    expect(historyHtml).toContain("Review this run with the coach");
    expect(historyHtml).toContain("Morning run");
  });
});

describe("Garmin connection, notifications and session sync", () => {
  it("keeps Sync Garmin enabled and opens the key popup when no key is saved", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('id="garmin-modal"');
    expect(html).toContain('id="garmin-key-toggle"');
    expect(html).toContain('id="notif-btn"');
    expect(html).toContain("Not connected");
    expect(html).toContain("Add key");
    expect(html).toContain(">Sync Garmin</button>");
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
    expect(response.headers.get("location")).toBe("/calendar?month=2026-11&synced=1");
    expect(handle.store.getGarminKey(user.userId)?.apiKey).toBe("valid-key-123");
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);
    expect(handle.store.countUnreadNotifications(user.userId)).toBe(1);
    expect(calls.count).toBe(1);

    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain("Connected · key ••••-123");
    expect(html).toContain("Change key");
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
    expect(html).toContain("Morning run");
    expect(html).toContain("Easy 5 km");
    expect(html).toContain("Planned:");
    expect(html).toContain("On plan");
    expect(html).toContain("Unplanned");
    expect(html).toContain("+0.2 km");
    expect(html).toContain('href="/activity/garmin%3A1"');
    expect(html).toContain("Detail</a>");
    expect(html).toContain("Daily volume");
    expect(html).toContain('aria-label="Daily volume for 2–8 Nov 2026"');
    expect(html).toContain('aria-label="Pace trend for 2–8 Nov 2026"');
    expect(html).toContain('aria-label="Average HR trend for 2–8 Nov 2026"');
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
    expect(html).toContain("Review my week with the coach");
    expect(html).toContain("Review my training week 2–8 Nov 2026");
    expect(html).toContain("Garmin load 200");
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
    expect(html).toContain('data-active="history"');
    expect(html).toContain('href="/history?view=week&period=2026-11-02"');
    expect(html).toContain('aria-label="Planned 5 km versus actual 5.2 km"');
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
    expect(first).toContain("Auto-synced 1 Garmin activity");
    expect(first).toContain("Auto run");
    expect(first).toContain("Review this run with the coach");
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);
    expect(calls).toBe(1);
    expect(seenLimit).toBe(100);

    const second = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(second).not.toContain("Auto-synced");
    expect(calls).toBe(1);
  });

  it("shows an auto-sync failure and backs off", async () => {
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
    const { base, cookie } = await start({
      garmin,
      seed: (store, runner) => {
        store.recordSync(runner.userId, "2026-11-05T06:00:00.000Z");
      },
    });
    const first = await (await fetch(`${base}/history`, { headers: { cookie } })).text();
    expect(first).toContain("Auto-sync failed: Garmin down");
    expect(calls).toBe(1);
    await fetch(`${base}/history`, { headers: { cookie } });
    expect(calls).toBe(1);
  });
});

describe("in-calendar coach bubble", () => {
  it("renders suggestion chips while keeping the animation", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('id="coach-bubble"');
    expect(html).toContain('id="coach-panel"');
    expect(html).toContain('id="coach-minimize"');
    expect(html).toContain('aria-label="Minimize chat"');
    expect(html).toContain(">−</button>");
    expect(html).not.toContain('aria-label="Close chat"');
    expect(html).toContain("minimizePanel");
    expect(html).toContain("Bookings up to 180 days ahead");
    expect(html).toContain('id="coach-suggestions"');
    expect(html).not.toContain('id="coach-undo"');
    expect(html).not.toContain("undo the last change");
    expect(html).toContain("data.suggestions");
    expect(html).toContain("chip.className = 'suggestion'");
    expect(html).toContain("Plan my week");
    expect(html).toContain("Book a 5 km run");
    expect(html).toContain("Review last week");
    expect(html).toContain("showStarters");
    expect(html).toContain("setRetry");
    expect(html).toContain("addFailureCard");
    expect(html).toContain("Not applied · 未套用");
    expect(html).toContain("failure-actions");
    expect(html).toContain("fetch('/chat'");
    expect(html).toContain("fetch('/chat/history'");
    expect(html).toContain("x-poc3-request-id");
    expect(html).toContain("loadConversation");
    expect(html).toContain("refreshCalendar");
    expect(html).toContain("monthGrid.querySelectorAll('.cell[data-day]')");
    expect(html).toContain("a deleted chip stays until reload");
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
    expect(html).toContain("app.css?v=5");
    const cssResponse = await fetch(`${base}/static/app.css`);
    expect(cssResponse.headers.get("cache-control")).toBe("no-store");
    const css = await cssResponse.text();
    expect(css).toContain("100dvh");
    expect(css).toContain("min-height: 0");
    expect(css).toContain(".view-switch");
    expect(css).toContain(".history-summary");
    expect(css).toContain(".history-activity");
    expect(css).toContain(".trend-chart");
    expect(css).toContain(".plan-compare");
    expect(css).toContain(".review-card");
    expect(css).toContain(".chip.match-on-plan");
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
    expect(html).toContain("Calendar updated · 日曆已更新");
    expect(html).toContain('data-month="2026-11"');
    expect(html).toContain('data-day="2026-11-06"');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(3);
    for (const script of scripts) expect(() => new Function(script[1] ?? "")).not.toThrow();
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

