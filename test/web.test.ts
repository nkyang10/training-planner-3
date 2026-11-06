import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createAuth, type Auth, type AuthUser } from "../src/auth";
import type { GarminClient } from "../src/garmin";
import { createStore, type StoreHandle } from "../src/store";
import type { ChangeEntry, ChangeSet, SessionKind, Store, TrainingSession } from "../src/types";
import { createWeb } from "../src/web";

const TODAY = "2026-11-05";
const SECRET = "web-test-secret";
const PASSWORD = "correct-horse-battery";
const USERNAME = "demo_runner";
const DISPLAY_NAME = "Demo Runner";

const cookieFrom = (setCookie: string): string => setCookie.split(";")[0] ?? "";

const formBody = (values: Record<string, string>): string => new URLSearchParams(values).toString();

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of cleanups.splice(0).reverse()) await stop();
});

interface StartOptions {
  garmin?: GarminClient;
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

const changeSetFor = (
  userId: string,
  changeSetId: string,
  createdAt: string,
  summary: string,
  revertedAt: string | null,
): ChangeSet => {
  const session: TrainingSession = {
    sessionId: `session:${changeSetId}`,
    userId,
    day: "2026-11-06",
    title: "Easy 5 km",
    kind: "easy",
    distanceKm: 5,
    durationMin: 35,
    note: null,
    createdAt,
  };
  const entry: ChangeEntry = {
    action: "add",
    sessionId: session.sessionId,
    before: null,
    after: session,
    fromDay: null,
    toDay: session.day,
    title: session.title,
    kind: session.kind,
  };
  return { changeSetId, userId, createdAt, summary, entries: [entry], revertedAt };
};

interface MockGateway {
  url: string;
  seenUser(): string | undefined;
  seenMessage(): string | undefined;
}

const startMockGateway = async (): Promise<MockGateway> => {
  let seenUser: string | undefined;
  let seenMessage: string | undefined;
  const server = createServer((request, response) => {
    void (async (): Promise<void> => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        messages?: Array<{ role?: string; content?: string }>;
      };
      seenUser = typeof request.headers["x-poc3-user"] === "string" ? request.headers["x-poc3-user"] : undefined;
      seenMessage = body.messages?.[0]?.content;
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
  return { url: `http://127.0.0.1:${port}`, seenUser: () => seenUser, seenMessage: () => seenMessage };
};

describe("authentication pages", () => {
  it("redirects unauthenticated requests and serves login and signup", async () => {
    const { base } = await start();
    for (const path of ["/calendar", "/day/2026-11-06", "/profile", "/calendar/history", "/calendar/data?month=2026-11"]) {
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
        ];
      },
    };
    const { base, handle, user, cookie } = await start({ garmin });
    const response = await fetch(`${base}/sync`, { method: "POST", headers: { cookie }, redirect: "manual" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/calendar?synced=1");
    expect(handle.store.listActivities(user.userId)).toHaveLength(1);
  });
});

describe("in-calendar coach bubble", () => {
  it("renders suggestion chips and recent-change hooks while keeping the animation", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(html).toContain('id="coach-bubble"');
    expect(html).toContain('id="coach-panel"');
    expect(html).toContain('id="coach-suggestions"');
    expect(html).toContain('id="coach-history"');
    expect(html).not.toContain('id="coach-undo"');
    expect(html).toContain("Recent changes");
    expect(html).toContain("ask in chat");
    expect(html).not.toContain("undo the last change");
    expect(html).toContain("fetch('/calendar/history'");
    expect(html).toContain("data.suggestions");
    expect(html).toContain("chip.className = 'suggestion'");
    expect(html).toContain("fetch('/chat'");
    expect(html).toContain("refreshCalendar");
    expect(html).toContain("animateChanges");
    expect(html).toContain("before.length * 140");
    const css = await (await fetch(`${base}/static/app.css`)).text();
    expect(css).toContain("100dvh");
    expect(css).not.toContain("#coach-undo");
    expect(html).toContain("Calendar updated · 日曆已更新");
    expect(html).toContain('data-month="2026-11"');
    expect(html).toContain('data-day="2026-11-06"');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(() => new Function(scripts[0]?.[1] ?? "")).not.toThrow();
  });

  it("proxies a chat turn and passes suggestions and changes through", async () => {
    const gateway = await startMockGateway();
    const { base, cookie, user } = await start({ gatewayUrl: gateway.url });
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ message: "Plan my week" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      reply: string;
      sessions: number;
      changes: Array<{ action: string; title?: string }>;
      suggestions: string[];
      changeSetId: string | null;
      reverted: boolean;
    };
    expect(body.reply).toBe("Booked two runs.");
    expect(body.sessions).toBe(2);
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]?.action).toBe("add");
    expect(body.suggestions).toEqual(["Book my long run for Sunday", "Move Thursday to Friday"]);
    expect(body.changeSetId).toBe("change:test");
    expect(body.reverted).toBe(false);
    expect(gateway.seenUser()).toBe(user.userId);
    expect(gateway.seenMessage()).toBe("Plan my week");
  });

  it("returns the authenticated user's change history newest first", async () => {
    const { base, auth, handle, user, cookie } = await start();
    const other = auth.signup({
      username: "history_other",
      password: "other-password-123",
      displayName: "History Other",
      timezone: "UTC",
    }).user;
    handle.store.appendChangeSet(changeSetFor(user.userId, "change:older", `${TODAY}T07:00:00.000Z`, 'add "Easy 5 km" on 2026-11-06', null));
    handle.store.appendChangeSet(changeSetFor(user.userId, "change:newer", `${TODAY}T09:00:00.000Z`, 'move "Long run" to 2026-11-08', `${TODAY}T10:00:00.000Z`));
    handle.store.appendChangeSet(changeSetFor(other.userId, "change:foreign", `${TODAY}T11:00:00.000Z`, "other runner's change", null));

    const response = await fetch(`${base}/calendar/history`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      changes: Array<{
        changeSetId: string;
        summary: string;
        createdAt: string;
        revertedAt: string | null;
        entries: Array<{ title: string }>;
      }>;
    };
    expect(body.changes.map((change) => change.changeSetId)).toEqual(["change:newer", "change:older"]);
    expect(body.changes[0]?.summary).toContain("Long run");
    expect(body.changes[0]?.createdAt).toBe(`${TODAY}T09:00:00.000Z`);
    expect(body.changes[0]?.revertedAt).toBe(`${TODAY}T10:00:00.000Z`);
    expect(body.changes[0]?.entries).toHaveLength(1);
    expect(body.changes[1]?.revertedAt).toBeNull();
    expect(body.changes.some((change) => change.changeSetId === "change:foreign")).toBe(false);
  });
});
