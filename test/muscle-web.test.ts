import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createAuth, type Auth, type AuthUser } from "../src/auth";
import { createStore, type StoreHandle } from "../src/store";
import type { SessionKind, Store } from "../src/types";
import { createWeb } from "../src/web";

const TODAY = "2026-11-05";
const SECRET = "muscle-web-test-secret";
const PASSWORD = "correct-horse-battery";
const USERNAME = "demo_runner";
const DISPLAY_NAME = "Demo Runner";

const cookieFrom = (setCookie: string): string => setCookie.split(";")[0] ?? "";

const formBody = (entries: Array<[string, string]>): string => new URLSearchParams(entries).toString();

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of cleanups.splice(0).reverse()) await stop();
});

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

interface Harness {
  handle: StoreHandle;
  auth: Auth;
  web: ReturnType<typeof createWeb>;
  base: string;
  user: AuthUser;
  cookie: string;
}

const start = async (): Promise<Harness> => {
  const handle = createStore(":memory:");
  const auth = createAuth({ store: handle.store, secret: SECRET, now: () => `${TODAY}T08:00:00.000Z` });
  const signup = auth.signup({
    username: USERNAME,
    password: PASSWORD,
    displayName: DISPLAY_NAME,
    timezone: "Asia/Hong_Kong",
    goal: "Run a half marathon",
  });
  const user = signup.user;
  seedSession(handle.store, user.userId, "session:tempo", TODAY, "Morning tempo", "tempo", 8);
  seedActivity(handle.store, user.userId, "garmin:today-1", TODAY, "Morning tempo", 8);
  const login = auth.login({ username: USERNAME, password: PASSWORD });
  const web = createWeb({
    store: handle.store,
    auth,
    sessionSync: false,
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

const postCheckIn = (base: string, cookie: string, entries: Array<[string, string]>): Promise<Response> =>
  fetch(`${base}/muscle/checkin`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: formBody(entries),
    redirect: "manual",
  });

describe("the muscle tab page", () => {
  it("requires an account and renders the tab, figures and the muscle list", async () => {
    const { base, cookie } = await start();
    const anonymous = await fetch(`${base}/muscle`, { redirect: "manual" });
    expect(anonymous.status).toBe(303);
    expect(anonymous.headers.get("location")).toBe("/login");

    const response = await fetch(`${base}/muscle`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Muscle check-in");
    expect(html).toContain('class="view-switch" data-active="muscle"');
    expect(html).toContain('href="/muscle" aria-current="page"');
    expect(html).toContain('data-muscle="calves"');
    expect(html).toContain('data-muscle="chest"');
    expect(html).toContain('data-muscle="lower-back"');
    expect(html).toContain('name="muscleIds"');
    expect(html).toContain('id="muscle-json"');
    expect(html).toContain("Quick set");
    expect(html).toContain("No check-ins yet");
    expect(html).toContain("not a diagnosis");
    expect(html).toContain('action="/muscle/checkin"');
    expect(html).toContain("app.css?v=20");
  });

  it("saves a shared no-script check-in and renders its reading, heat and drills", async () => {
    const { base, cookie } = await start();
    const saved = await postCheckIn(base, cookie, [
      ["day", TODAY],
      ["muscleIds", "calves"],
      ["muscleIds", "quads"],
      ["soreness", "6"],
      ["conditions", "tight"],
      ["side", "both"],
      ["note", "calves since the hills"],
    ]);
    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/muscle?saved=1");

    const html = await (await fetch(`${base}/muscle?saved=1`, { headers: { cookie } })).text();
    expect(html).toContain("Check-in saved");
    expect(html).toContain("Watch");
    expect(html).toContain("Calves");
    expect(html).toContain("6/10");
    expect(html).toContain("calves since the hills");
    expect(html).toContain('data-muscle="calves" fill="#f5a257"');
    expect(html).toContain('data-muscle="quads" fill="#f5a257"');
    expect(html).toContain("Suggested drills");
    expect(html).toContain("Slow double-leg calf raises");
    expect(html).toContain("review-muscles");
  });

  it("saves the per-muscle script payload with sides, warm-up and per-muscle severity", async () => {
    const { base, cookie } = await start();
    const payload = JSON.stringify([
      { muscleId: "calves", soreness: 7, conditions: ["tight"], side: "left", warmUp: "eases" },
      { muscleId: "quads", soreness: 2, conditions: [], side: "both", warmUp: null },
    ]);
    const saved = await postCheckIn(base, cookie, [["day", TODAY], ["musclesJson", payload]]);
    expect(saved.status).toBe(303);
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(html).toContain("7/10");
    expect(html).toContain("eases once you are moving");
    expect(html).toContain('data-muscle="calves" fill="#f28034"');
    expect(html).toContain('data-muscle="quads" fill="#fde8cf"');
  });

  it("rejects empty, future, too-old and unknown submissions with the right error code", async () => {
    const { base, cookie } = await start();
    const post = async (entries: Array<[string, string]>): Promise<string | null> => {
      const response = await postCheckIn(base, cookie, entries);
      expect(response.status).toBe(303);
      return response.headers.get("location");
    };
    expect(await post([["day", TODAY]])).toBe("/muscle?error=empty");
    expect(await post([["day", "2026-11-09"], ["muscleIds", "calves"], ["soreness", "5"]])).toBe("/muscle?error=day");
    expect(await post([["day", "2026-10-01"], ["muscleIds", "calves"], ["soreness", "5"]])).toBe("/muscle?error=day");
    expect(
      await post([["day", TODAY], ["musclesJson", JSON.stringify([{ muscleId: "nose", soreness: 3 }])]]),
    ).toBe("/muscle?error=muscles");
    expect(
      await post([["day", TODAY], ["musclesJson", JSON.stringify([{ muscleId: "calves", soreness: 42 }])]]),
    ).toBe("/muscle?error=severity");
    expect(
      await post([["day", TODAY], ["muscleIds", "calves"], ["soreness", "5"], ["conditions", "spicy"]]),
    ).toBe("/muscle?error=conditions");
    const tooMany: Array<[string, string]> = [["day", TODAY], ["soreness", "5"]];
    for (let index = 0; index < 21; index += 1) tooMany.push(["muscleIds", "calves"]);
    expect(await post(tooMany)).toBe("/muscle?error=too-many");
  });

  it("links a run from the same day and refuses one from another day", async () => {
    const { base, cookie, handle, user } = await start();
    seedActivity(handle.store, user.userId, "garmin:other-day", "2026-11-01", "Old run", 5);
    const good = await postCheckIn(base, cookie, [
      ["day", TODAY],
      ["activityId", "garmin:today-1"],
      ["muscleIds", "calves"],
      ["soreness", "5"],
    ]);
    expect(good.headers.get("location")).toBe("/muscle?saved=1");
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(html).toContain("the linked run");

    const bad = await postCheckIn(base, cookie, [
      ["day", TODAY],
      ["activityId", "garmin:other-day"],
      ["muscleIds", "calves"],
      ["soreness", "5"],
    ]);
    expect(bad.headers.get("location")).toBe("/muscle?error=activity");
  });

  it("offers the pain state and care copy for a warning, and drills nothing", async () => {
    const { base, cookie } = await start();
    await postCheckIn(base, cookie, [
      ["day", TODAY],
      ["muscleIds", "calves"],
      ["soreness", "4"],
      ["conditions", "sharp_pain"],
    ]);
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(html).toContain("Needs care first");
    expect(html).toContain('name="key" value="pain_injury"');
    expect(html).toContain("Ask coach about my calves");
    expect(html).toContain("see a clinician");
    expect(html).toContain('stroke-dasharray="5 4"');
    expect(html).toContain('class="muscle-region" data-muscle="calves"');

    const calendar = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(calendar).toContain("muscle-calendar-chip");
    expect(calendar).toContain("Muscles · watch");
  });

  it("escalates the rhabdomyolysis pattern to the medical red-flag state", async () => {
    const { base, cookie } = await start();
    await postCheckIn(base, cookie, [
      ["day", TODAY],
      ["muscleIds", "quads"],
      ["soreness", "9"],
      ["conditions", "swelling"],
    ]);
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(html).toContain("Care now");
    expect(html).toContain('name="key" value="medical_red_flag"');
    expect(html).toContain("medical care");
  });

  it("prefills the selection from a run's muscles via ?activity=", async () => {
    const { base, cookie } = await start();
    const response = await fetch(`${base}/muscle?activity=${encodeURIComponent("garmin:today-1")}`, {
      headers: { cookie },
    });
    const html = await response.text();
    expect(html).toContain("Selected the muscles from that run");
    // A tempo run puts the sprint machinery into the primary set.
    expect(html).toContain('class="muscle-region selected" data-muscle="hip-flexors"');
    expect(html).toContain('value="garmin:today-1" selected');
    expect(html).toContain("Morning tempo");
  });

  it("shows the muscles a run worked on the activity detail and links back", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/activity/${encodeURIComponent("garmin:today-1")}`, { headers: { cookie } })).text();
    expect(html).toContain("Muscles worked");
    expect(html).toContain("worked-pair");
    expect(html).toContain(`href="/muscle?activity=${encodeURIComponent("garmin:today-1")}"`);
    expect(html).toContain("Glutes");
  });

  it("lists recent runs with their worked muscles for one-tap tagging", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(html).toContain("From your training");
    expect(html).toContain("Tag these muscles");
    expect(html).toContain('data-tag-activity="garmin:today-1"');
  });

  it("keeps every check-in private to its runner and exports it", async () => {
    const { base, cookie, auth } = await start();
    await postCheckIn(base, cookie, [
      ["day", TODAY],
      ["muscleIds", "calves"],
      ["soreness", "6"],
      ["conditions", "tight"],
    ]);
    auth.signup({
      username: "other_runner",
      password: PASSWORD,
      displayName: "Other",
      timezone: "Asia/Hong_Kong",
      goal: null,
    });
    const otherLogin = auth.login({ username: "other_runner", password: PASSWORD });
    const otherCookie = cookieFrom(otherLogin.cookie);
    const otherHtml = await (await fetch(`${base}/muscle`, { headers: { cookie: otherCookie } })).text();
    expect(otherHtml).toContain("No check-ins yet");
    expect(otherHtml).not.toContain("Calves 6/10");

    const exportResponse = await fetch(`${base}/export.json`, { headers: { cookie } });
    const bundle = (await exportResponse.json()) as {
      muscleCheckIns: Array<{ userId: string; muscles: Array<{ muscleId: string; soreness: number }> }>;
    };
    expect(bundle.muscleCheckIns).toHaveLength(1);
    expect(bundle.muscleCheckIns[0]?.muscles[0]).toMatchObject({ muscleId: "calves", soreness: 6 });
  });

  it("views a past day's check-in from the history row", async () => {
    const { base, cookie } = await start();
    for (const day of ["2026-11-03", TODAY]) {
      await postCheckIn(base, cookie, [["day", day], ["muscleIds", "hamstrings"], ["soreness", "4"]]);
    }
    const latest = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(latest).toContain("worst: Hamstrings 4/10");
    const viewed = await (await fetch(`${base}/muscle?day=2026-11-03`, { headers: { cookie } })).text();
    expect(viewed).toContain("Tue, 3 Nov 2026");
    expect(viewed).toContain("Hamstrings");
  });
});

describe("the coach's view of muscle check-ins", () => {
  const startDirectiveGateway = async (seen: { directive?: unknown }): Promise<string> => {
    const server = createServer((request, response) => {
      void (async (): Promise<void> => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { poc3?: { directive?: unknown } };
        seen.directive = body.poc3?.directive;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            choices: [{ message: { content: "Keep it easy today." } }],
            poc3: { sessions: 0, memories: 0, changes: [], suggestions: ["Plan tomorrow with me"], failures: [] },
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
    return `http://127.0.0.1:${port}`;
  };

  it("forwards a review-muscles intent as a comment-only directive with the muscle reference", async () => {
    const { base, cookie, handle, auth } = await start();
    const seen: { directive?: unknown } = {};
    const gatewayUrl = await startDirectiveGateway(seen);
    const webWithGateway = createWeb({
      store: handle.store,
      auth,
      sessionSync: false,
      gatewayUrl,
      now: () => `${TODAY}T08:00:00.000Z`,
    });
    await new Promise<void>((resolve) => webWithGateway.server.listen(0, "127.0.0.1", resolve));
    const address = webWithGateway.server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    cleanups.push(async () => {
      await webWithGateway.close();
    });
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        message: "My calves are tight and sore after the tempo — what should I do?",
        intent: { kind: "review-muscles", muscleId: "calves", source: "muscle-tab" },
      }),
    });
    expect(response.status).toBe(200);
    expect(base.length).toBeGreaterThan(0);
    const directive = seen.directive as
      | {
          mode: string;
          allowCalendarWrites: boolean;
          source: string;
          references?: { muscleId?: string };
          focus?: string[];
          background?: string;
        }
      | undefined;
    expect(directive?.mode).toBe("review");
    expect(directive?.allowCalendarWrites).toBe(false);
    expect(directive?.source).toBe("muscle-tab");
    expect(directive?.references?.muscleId).toBe("calves");
    expect(directive?.focus).toContain("recovery");
    expect(directive?.background).toContain("Muscle tab");
  });

  it("rejects a review-muscles intent with an unknown muscle", async () => {
    const { base, cookie } = await start();
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        message: "My nose is sore",
        intent: { kind: "review-muscles", muscleId: "nose" },
      }),
    });
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: { detail?: string } };
    expect(payload.error?.detail).toContain("muscleId");
  });
});
