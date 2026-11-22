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
  it("requires an account and renders the tabbed muscle plugin and the list", async () => {
    const { base, cookie } = await start();
    const anonymous = await fetch(`${base}/muscle`, { redirect: "manual" });
    expect(anonymous.status).toBe(303);
    expect(anonymous.headers.get("location")).toBe("/login");

    const response = await fetch(`${base}/muscle`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Muscle check-in");
    expect(html).toContain('data-track="muscle-checkin"');
    expect(html).toContain('class="view-switch" data-active="muscle"');
    expect(html).toContain('href="/muscle" aria-current="page"');
    // From 1024px the status/readings rail sits beside the check-in figure; DOM order keeps status → form → readings
    // for the phone.
    expect(html).toContain('class="muscle-layout"');
    expect(html).toContain('class="muscle-status-slot"');
    expect(html).toContain('class="muscle-form-slot"');
    expect(html).toContain('class="muscle-readings-slot"');
    expect(html.indexOf('class="muscle-status-slot"')).toBeLessThan(html.indexOf('class="muscle-form-slot"'));
    expect(html.indexOf('class="muscle-form-slot"')).toBeLessThan(html.indexOf('class="muscle-readings-slot"'));
    // The reusable 3D muscle plugin: a tab strip over the figure and the text list.
    expect(html).toContain('id="muscle-plugin"');
    expect(html).toContain('role="tablist" aria-label="3D muscle figure or muscle list"');
    expect(html).toContain('id="muscle-tab-figure"');
    expect(html).toContain('id="muscle-tab-list"');
    expect(html).toContain('id="muscle-viewer"');
    expect(html).toContain('name="muscleIds"');
    expect(html).toContain('value="calves"');
    expect(html).toContain('value="lower-back"');
    expect(html).toContain('id="muscle-json"');
    expect(html).toContain("Quick set");
    expect(html).toContain("No check-ins yet");
    expect(html).toContain("not a diagnosis");
    expect(html).toContain('action="/muscle/checkin"');
    expect(html).toContain("app.css?v=");
  });

  it("ships the 3D viewer with an import map, controls and the list as the no-script path", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(html).toContain('<script type="importmap">{"imports":{"three":"/static/three.module.js"}}</script>');
    expect(html).toContain("import { OrbitControls } from '/static/orbit-controls.js'");
    expect(html).toContain('id="muscle-viewer"');
    expect(html).toContain('id="muscle-rotation"');
    expect(html).toContain("Pause rotation");
    expect(html).toContain('id="muscle-front"');
    expect(html).toContain('id="muscle-back"');
    expect(html).toContain('id="muscle-reset"');
    expect(html).toContain('id="muscle-tooltip"');
    // The bridge keeps both surfaces on one selection state.
    expect(html).toContain("window.__muscleTabBridge");
    expect(html).toContain("window.__muscleViewer");
    expect(html).toContain("__muscleViewer.syncMuscle");
    // The flat figure is retired: the plugin's list tab is the text representation and the no-script path.
    expect(html).not.toContain("muscle-2d-fallback");
    expect(html).not.toContain("muscle-region");
    expect(html).toContain("needs JavaScript and WebGL");
    expect(html).toContain('id="muscle-list"');
    // The rig travels with the page so the viewer builds every catalog muscle.
    expect(html).toContain('"id":"calves"');
    expect(html).toContain('"kind":"lathe"');
  });

  it("serves the vendored three.js builds as static scripts", async () => {
    const { base, cookie } = await start();
    const three = await fetch(`${base}/static/three.module.js`, { headers: { cookie } });
    expect(three.status).toBe(200);
    expect(three.headers.get("content-type")).toContain("text/javascript");
    expect(three.headers.get("cache-control")).toBe("no-store");
    const threeText = await three.text();
    expect(threeText).toContain("SPDX-License-Identifier: MIT");
    expect(threeText).toContain("Three.js Authors");

    const controls = await fetch(`${base}/static/orbit-controls.js`, { headers: { cookie } });
    expect(controls.status).toBe(200);
    const controlsText = await controls.text();
    expect(controlsText).toContain("OrbitControls");
    expect(controlsText).toContain("from 'three'");
  });

  it("serves the loader chain and the real anatomy asset behind the viewer", async () => {
    const { base, cookie } = await start();
    const loader = await fetch(`${base}/static/gltf-loader.js`, { headers: { cookie } });
    expect(loader.status).toBe(200);
    const loaderText = await loader.text();
    expect(loaderText).toContain("GLTFLoader");
    expect(loaderText).toContain("from './utils/BufferGeometryUtils.js'");

    const utils = await fetch(`${base}/static/utils/BufferGeometryUtils.js`, { headers: { cookie } });
    expect(utils.status).toBe(200);
    const utilsText = await utils.text();
    expect(utilsText).toContain("toTrianglesDrawMode");

    const anatomy = await fetch(`${base}/static/anatomy-muscles.glb`, { headers: { cookie } });
    expect(anatomy.status).toBe(200);
    expect(anatomy.headers.get("content-type")).toContain("model/gltf-binary");
    const bytes = await anatomy.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(1_000_000);
    expect(new DataView(bytes).getUint32(0, true)).toBe(0x46546c67); // "glTF"
  });

  it("wires the viewer to load the real anatomy first and fall back to the sculpt", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(html).toContain("import('/static/gltf-loader.js')");
    expect(html).toContain("'/static/anatomy-muscles.glb'");
    expect(html).toContain("RegionMuscle-");
    expect(html).toContain("userData.region");
    expect(html).toContain("buildProcedural");
    // Hover paints the same ember as a click-select, and the trailing edge lands the resting cursor.
    expect(html).toContain("hovered || selected ? EMBER");
    expect(html).toContain("const EMBER = '#ff5a1f'");
    expect(html).toContain("applyHover");
    expect(html).toContain("trailingHover");
    // Hovering never creates tags: the viewer reads through the read-only peek.
    expect(html).toContain("peek: (id) => state.get(id) ?? null");
    expect(html).not.toContain("bridge.tagOf(");
    // The ready marker only fires after a figure is built, so captures can never fire early.
    expect(html).toContain("container.dataset.viewerReady = '1'");
    // The plugin's tab strip carries the surface, and the warning heat pulses without relying on hue alone.
    const css = await (await fetch(`${base}/static/app.css`)).text();
    expect(css).toContain(".muscle-plugin-tabs");
    expect(css).toContain(".muscle-viewer.compact");
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
    // The status heat rides in the plugin's REGIONS payload and paints on the 3D surfaces.
    expect(html).toContain('"calves":{"fill":"#f5a257"');
    expect(html).toContain('"quads":{"fill":"#f5a257"');
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
    expect(html).toContain('"calves":{"fill":"#f28034"');
    expect(html).toContain('"quads":{"fill":"#fde8cf"');
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
    // Needs-care muscles carry the dashed flag: the low red pulse never relies on hue alone.
    expect(html).toContain('"calves":{"fill":"#fbd5a8","dashed":true');

    const calendar = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(calendar).toContain("muscle-calendar-chip");
    expect(calendar).toContain("Muscles · needs care");
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
    // A tempo run puts the sprint machinery into the primary set, checked in the plugin's list tab.
    expect(html).toContain('name="muscleIds" value="hip-flexors" checked');
    expect(html).toContain('name="muscleIds" value="hamstrings" checked');
    // The run itself is preselected in the "About which run?" select.
    expect(html).toContain('value="garmin:today-1" selected');
    expect(html).toContain("Morning tempo");
  });

  it("still prefills a run older than the check-in window and says so", async () => {
    const { base, cookie, handle, user } = await start();
    seedActivity(handle.store, user.userId, "garmin:ancient", "2026-10-15", "Ancient long run", 21);
    const response = await fetch(`${base}/muscle?activity=${encodeURIComponent("garmin:ancient")}`, {
      headers: { cookie },
    });
    const html = await response.text();
    // The run cannot be linked (its day is outside the window), so the report is for today — but the muscles
    // it worked are still selected, and the form says what happened instead of dropping the run silently.
    expect(html).toContain("older than the 14-day check-in window");
    expect(html).toContain('name="muscleIds" value="quads" checked');
    expect(html).toContain('name="muscleIds" value="glutes" checked');
    expect(html).toContain(`value="${TODAY}"`);
    expect(html).not.toContain('value="garmin:ancient" selected');
  });

  it("shows the muscles a run worked on the activity detail in 3D and links back", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/activity/${encodeURIComponent("garmin:today-1")}`, { headers: { cookie } })).text();
    expect(html).toContain("Muscles worked");
    // English pages must not leak the Chinese half of the old bilingual stopgap.
    expect(html).not.toContain("訓練到的肌肉");
    expect(html).not.toContain("回報感覺");
    // The same reusable 3D plugin, in link mode: click a muscle to report it, list tab for the text.
    expect(html).toContain('id="worked-plugin"');
    expect(html).toContain('id="worked-viewer"');
    expect(html).toContain('class="muscle-viewer compact"');
    expect(html).toContain('const MODE = "link"');
    expect(html).toContain("location.href = LINK_HREF + encodeURIComponent(region)");
    expect(html).toContain('"glutes":{"fill":"#f28034","note":"primary mover"');
    expect(html).toContain("Worked list");
    expect(html).toContain(`href="/muscle?activity=${encodeURIComponent("garmin:today-1")}"`);
    expect(html).toContain("Glutes");
  });

  it("renders the worked card in Chinese when the language cookie is zh-HK", async () => {
    const { base, cookie } = await start();
    const zh = `${cookie}; milebook_lang=zh-HK`;
    const html = await (await fetch(`${base}/activity/${encodeURIComponent("garmin:today-1")}`, { headers: { cookie: zh } })).text();
    expect(html).toContain("訓練到的肌肉");
    expect(html).toContain("回報感覺");
    expect(html).toContain("受力清單");
    expect(html).not.toContain("Muscles worked");
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
      muscleStatusControls: Array<{ userId: string; muscleId: string; hold: boolean }>;
    };
    expect(bundle.muscleCheckIns).toHaveLength(1);
    expect(bundle.muscleCheckIns[0]?.muscles[0]).toMatchObject({ muscleId: "calves", soreness: 6 });
    expect(Array.isArray(bundle.muscleStatusControls)).toBe(true);
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

describe("the muscle status layer", () => {
  const postStatus = (base: string, cookie: string, entries: Array<[string, string]>): Promise<Response> =>
    fetch(`${base}/muscle/status`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: formBody(entries),
      redirect: "manual",
    });

  const attention = (base: string, cookie: string): Promise<{ count: number; items: Array<{ muscleId: string; current: number; href: string; level: string; hold: boolean }> }> =>
    fetch(`${base}/muscle/attention.json`, { headers: { cookie } }).then(
      (response) =>
        response.json() as Promise<{ count: number; items: Array<{ muscleId: string; current: number; href: string; level: string; hold: boolean }> }>,
    );

  it("starts a dated status from a check-in and shows the one-tap controls", async () => {
    const { base, cookie } = await start();
    await postCheckIn(base, cookie, [["day", TODAY], ["muscleIds", "calves"], ["soreness", "7"]]);
    const html = await (await fetch(`${base}/muscle?saved=1`, { headers: { cookie } })).text();
    expect(html).toContain("Check-in saved");
    expect(html).toContain("Muscle status");
    expect(html).not.toContain("肌肉狀態");
    expect(html).toContain('class="attention-badge"');
    expect(html).toContain("1 muscle");
    expect(html).toContain("fades on its own from here, expected clear by");
    expect(html).toContain('action="/muscle/status"');
    expect(html).toContain('name="action" value="hold"');
    expect(html).toContain("Hold constant");
    expect(html).toContain('name="action" value="resolve"');
    expect(html).toContain("All better");
    expect(html).toContain('href="/muscle?focus=calves#check-in"');
    expect(html).toContain("Ask coach about this status");
  });

  it("renders the muscle tab in Chinese when the language cookie is zh-HK", async () => {
    const { base, cookie } = await start();
    const zh = `${cookie}; milebook_lang=zh-HK`;
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie: zh } })).text();
    expect(html).toContain("肌肉回報");
    expect(html).toContain("肌肉狀態");
    expect(html).toContain("最新回報");
    expect(html).toContain("儲存回報");
    expect(html).not.toContain("Muscle check-in");
    expect(html).not.toContain("Muscle status");
    expect(html).not.toContain("Latest check-in");
    expect(html).not.toContain("Save check-in");
  });

  it("localizes muscle names, soreness and condition labels to Cantonese on a seeded check-in", async () => {
    const { base, cookie } = await start();
    await postCheckIn(base, cookie, [
      ["day", TODAY],
      ["muscleIds", "calves"],
      ["soreness", "6"],
      ["conditions", "tight"],
    ]);
    const zh = `${cookie}; milebook_lang=zh-HK`;
    const html = await (await fetch(`${base}/muscle?saved=1`, { headers: { cookie: zh } })).text();
    expect(html).toContain('<html lang="zh-HK" dir="ltr">');
    // The status row renders the localized muscle name inside a <strong>; the English name
    // also appears inside the editor <script> payload, so only the visible strong form is checked.
    expect(html).toContain("<strong>小腿</strong>");
    expect(html).not.toContain("<strong>Calves</strong>");
    // 6/10 maps to the clearDoms soreness bucket; the tight condition label renders in Cantonese.
    expect(html).toContain("6/10 明顯延遲性酸痛");
    expect(html).toContain("緊繃／僵硬");
  });

  it("localizes drill-card guidance, drill names and how-text to Cantonese with no English left on the cards", async () => {
    const { base, cookie } = await start();
    await postCheckIn(base, cookie, [
      ["day", TODAY],
      ["muscleIds", "calves"],
      ["soreness", "6"],
      ["conditions", "tight"],
    ]);
    const zh = `${cookie}; milebook_lang=zh-HK`;
    const html = await (await fetch(`${base}/muscle?saved=1`, { headers: { cookie: zh } })).text();
    expect(html).toContain('<html lang="zh-HK" dir="ltr">');
    // A soreness-6 tight calves check-in yields a watch card carrying the mobility and activation drills.
    expect(html).toContain("<strong>慢速雙腿提踵</strong>");
    expect(html).toContain("<strong>牆邊小腿伸展</strong>");
    expect(html).toContain('<span class="muted small">2 × 15，受控節奏</span>');
    expect(html).toContain('<span class="muted small">每邊直膝 30 秒、曲膝 30 秒</span>');
    // The editor payload now carries the locale's text, so the English drill literals are gone from
    // the rendered markup entirely; the absence checks stay scoped to the card markup forms.
    expect(html).not.toContain("<strong>Slow double-leg calf raises</strong>");
    expect(html).not.toContain("<strong>Wall calf stretch</strong>");
    expect(html).not.toContain('<span class="muted small">2 × 15, controlled tempo</span>');
    expect(html).not.toContain('<span class="muted small">30 s straight-knee and 30 s bent-knee per side</span>');
    // The readings row above carries the same guidance sentence untranslated (that section is untouched by
    // this change), so the guidance check is scoped to the drill card itself.
    const cardStart = html.indexOf('<article class="muscle-drill-card">');
    expect(cardStart).toBeGreaterThanOrEqual(0);
    const card = html.slice(cardStart, html.indexOf("</article>", cardStart));
    expect(card).toContain("緊繃是活動受限，不是損傷");
    expect(card).not.toContain("Tightness is restriction, not damage");
  });

  it("localizes the interactive editor payload to Cantonese — drill names, how-text, condition labels and muscle names", async () => {
    const { base, cookie } = await start();
    const zh = `${cookie}; milebook_lang=zh-HK`;
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie: zh } })).text();
    expect(html).toContain('<html lang="zh-HK" dir="ltr">');
    // The serialized editor payload is embedded in the page source. Scope assertions to the MUSCLES/CONDITIONS
    // JSON so unrelated English prose (the knowledge fields, which stay English) cannot false-fail the checks.
    const payloadStart = html.indexOf("const MUSCLES = ");
    expect(payloadStart).toBeGreaterThanOrEqual(0);
    const payload = html.slice(payloadStart, html.indexOf("const TRAINING = ", payloadStart));
    // Cantonese muscle name, drill name, drill how-text and condition label now ride inside the payload.
    expect(payload).toContain('"name":"小腿"');
    expect(payload).toContain('"name":"慢速雙腿提踵"');
    expect(payload).toContain('"how":"2 × 15，受控節奏"');
    expect(payload).toContain('"label":"緊繃／僵硬"');
    // The English catalog literals are gone from the payload — display values were swapped to the locale's text.
    expect(payload).not.toContain('"name":"Calves"');
    expect(payload).not.toContain('"name":"Slow double-leg calf raises"');
    expect(payload).not.toContain('"how":"2 × 15, controlled tempo"');
    expect(payload).not.toContain('"label":"Tight / stiff"');
    // Client logic keys off the unlocalized key/id fields, which remain untouched.
    expect(payload).toContain('"key":"tight"');
    expect(payload).toContain('"id":"calves"');
    expect(payload).toContain('"category":"activation"');
  });

  it("localizes the muscle readings and care guidance to Cantonese with no English guidance left in the lists", async () => {
    const { base, cookie } = await start();
    // quads sharp pain → warning (care) guidance; calves soreness 2 → the "normal training response" guidance.
    const payload = JSON.stringify([
      { muscleId: "quads", soreness: 6, conditions: ["sharp_pain"] },
      { muscleId: "calves", soreness: 2, conditions: [] },
    ]);
    await postCheckIn(base, cookie, [["day", TODAY], ["musclesJson", payload]]);
    const zh = `${cookie}; milebook_lang=zh-HK`;
    const html = await (await fetch(`${base}/muscle?saved=1`, { headers: { cookie: zh } })).text();
    expect(html).toContain('<html lang="zh-HK" dir="ltr">');
    // English guidance still rides inside the editor script/JSON payloads, so the absence check is scoped to the
    // rendered muscle reading lists: the latest-check-in list and the care list (both share the list class).
    const listStarts = [...html.matchAll(/<ul class="muscle-reading-list">/g)].map((match) => match.index);
    expect(listStarts.length).toBeGreaterThanOrEqual(2);
    const rendered = listStarts.map((start) => html.slice(start, html.indexOf("</ul>", start))).join("\n");
    // Cantonese care guidance (sharp pain reads as a possible strain) and the normal-response guidance both appear.
    expect(rendered).toContain("應視為可能嘅拉傷");
    expect(rendered).toContain("照原本嘅計劃練就可以");
    // The care row is present and carries the care-level instruction in Cantonese.
    const careStart = html.indexOf('class="muscle-reading care"');
    expect(careStart).toBeGreaterThanOrEqual(0);
    const careRow = html.slice(careStart, html.indexOf("</li>", careStart));
    expect(careRow).toContain("請去見臨床人員");
    // No English guidance sentence leaks into the rendered reading lists.
    expect(rendered).not.toContain("Sharp, localized pain");
    expect(rendered).not.toContain("possible strain");
    expect(rendered).not.toContain("A normal training response");
    expect(rendered).not.toContain("Keep your plan as it is");
  });

  it("claims all better and returns the muscle to perfect condition", async () => {
    const { base, cookie, handle, user } = await start();
    await postCheckIn(base, cookie, [["day", TODAY], ["muscleIds", "calves"], ["soreness", "7"]]);
    const resolved = await postStatus(base, cookie, [["action", "resolve"], ["muscleId", "calves"]]);
    expect(resolved.status).toBe(303);
    expect(resolved.headers.get("location")).toBe("/muscle?saved=status");
    const html = await (await fetch(`${base}/muscle?saved=status`, { headers: { cookie } })).text();
    expect(html).toContain("Muscle status updated");
    expect(html).toContain("All perfect");
    expect(html).toContain("Every muscle is in perfect condition");
    const controls = handle.store.listMuscleStatusControls(user.userId);
    expect(controls.find((control) => control.muscleId === "calves")).toMatchObject({ resolvedDay: TODAY, hold: false });
  });

  it("holds a level constant, then lets it fade again", async () => {
    const { base, cookie } = await start();
    await postCheckIn(base, cookie, [["day", TODAY], ["muscleIds", "calves"], ["soreness", "7"]]);
    await postStatus(base, cookie, [["action", "hold"], ["muscleId", "calves"]]);
    const held = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(held).toContain("Held constant since");
    expect(held).toContain("it stays 7/10 until you change it");
    expect(held).toContain('name="action" value="release"');
    expect(held).toContain("Let it fade");
    await postStatus(base, cookie, [["action", "release"], ["muscleId", "calves"]]);
    const fading = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(fading).toContain("fades on its own from here, expected clear by");
  });

  it("resolves everything at once", async () => {
    const { base, cookie, handle, user } = await start();
    await postCheckIn(base, cookie, [["day", TODAY], ["muscleIds", "calves"], ["soreness", "7"], ["muscleIds", "quads"], ["soreness", "5"]]);
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(html).toContain("Everything's better");
    const resolved = await postStatus(base, cookie, [["action", "resolve-all"]]);
    expect(resolved.headers.get("location")).toBe("/muscle?saved=status");
    const controls = handle.store.listMuscleStatusControls(user.userId);
    expect(controls.filter((control) => control.resolvedDay === TODAY)).toHaveLength(2);
    const cleared = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(cleared).toContain("All perfect");
  });

  it("keeps the hold choice from the check-in form", async () => {
    const { base, cookie, handle, user } = await start();
    await postCheckIn(base, cookie, [["day", TODAY], ["muscleIds", "calves"], ["soreness", "6"], ["hold", "1"]]);
    const controls = handle.store.listMuscleStatusControls(user.userId);
    expect(controls.find((control) => control.muscleId === "calves")).toMatchObject({ hold: true, resolvedDay: null });
    const html = await (await fetch(`${base}/muscle`, { headers: { cookie } })).text();
    expect(html).toContain("Held constant since");
  });

  it("feeds the app-bar badge with the attention count and rows", async () => {
    const { base, cookie } = await start();
    expect((await attention(base, cookie)).count).toBe(0);
    await postCheckIn(base, cookie, [["day", TODAY], ["muscleIds", "calves"], ["soreness", "7"]]);
    const feed = await attention(base, cookie);
    expect(feed.count).toBe(1);
    expect(feed.items[0]).toMatchObject({
      muscleId: "calves",
      current: 7,
      level: "heavy",
      hold: false,
      href: "/muscle?focus=calves#check-in",
    });
    await postStatus(base, cookie, [["action", "resolve"], ["muscleId", "calves"]]);
    expect((await attention(base, cookie)).count).toBe(0);
  });

  it("keeps a badge script on every page for signed-in runners", async () => {
    const { base, cookie } = await start();
    const calendar = await (await fetch(`${base}/calendar`, { headers: { cookie } })).text();
    expect(calendar).toContain("/muscle/attention.json");
    expect(calendar).toContain('view-badge');
    const anonymous = await (await fetch(`${base}/login`)).text();
    expect(anonymous).not.toContain("/muscle/attention.json");
  });

  it("counts the sore muscles on the calendar chip and drops it when perfect", async () => {
    const { base, cookie } = await start();
    await postCheckIn(base, cookie, [["day", TODAY], ["muscleIds", "calves"], ["soreness", "5"]]);
    const calendar = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(calendar).toContain("Muscles · 1 sore");
    await postStatus(base, cookie, [["action", "resolve"], ["muscleId", "calves"]]);
    const cleared = await (await fetch(`${base}/calendar?month=2026-11`, { headers: { cookie } })).text();
    expect(cleared).not.toContain("muscle-calendar-chip");
  });

  it("carries today's status onto the activity detail with the linked report", async () => {
    const { base, cookie } = await start();
    await postCheckIn(base, cookie, [
      ["day", TODAY],
      ["activityId", "garmin:today-1"],
      ["muscleIds", "calves"],
      ["soreness", "6"],
    ]);
    const html = await (await fetch(`${base}/activity/${encodeURIComponent("garmin:today-1")}`, { headers: { cookie } })).text();
    expect(html).toContain("From these muscles now");
    expect(html).toContain("Calves · 6/10");
    expect(html).toContain('href="/muscle?focus=calves#check-in"');
    expect(html).toContain("You reported after this run");
    expect(html).toContain(`href="/muscle?day=${TODAY}"`);
  });

  it("opens the form focused on one muscle via ?focus=", async () => {
    const { base, cookie } = await start();
    const html = await (await fetch(`${base}/muscle?focus=calves`, { headers: { cookie } })).text();
    expect(html).toContain("Updating");
    expect(html).toContain('name="muscleIds" value="calves" checked');
    const unknown = await (await fetch(`${base}/muscle?focus=nose`, { headers: { cookie } })).text();
    expect(unknown).toContain("All perfect");
  });

  it("rejects status posts with an unknown muscle or action", async () => {
    const { base, cookie } = await start();
    expect((await postStatus(base, cookie, [["action", "resolve"], ["muscleId", "nose"]])).headers.get("location")).toBe("/muscle?error=muscles");
    expect((await postStatus(base, cookie, [["action", "shrink"], ["muscleId", "calves"]])).headers.get("location")).toBe("/muscle?error=conditions");
  });

  it("never leaks one runner's statuses to another", async () => {
    const { base, cookie, auth } = await start();
    await postCheckIn(base, cookie, [["day", TODAY], ["muscleIds", "calves"], ["soreness", "7"]]);
    auth.signup({
      username: "status_other",
      password: PASSWORD,
      displayName: "Other",
      timezone: "Asia/Hong_Kong",
      goal: null,
    });
    const otherCookie = cookieFrom(auth.login({ username: "status_other", password: PASSWORD }).cookie);
    const feed = await attention(base, otherCookie);
    expect(feed.count).toBe(0);
    expect(feed.items).toHaveLength(0);
    const otherHtml = await (await fetch(`${base}/muscle`, { headers: { cookie: otherCookie } })).text();
    expect(otherHtml).toContain("All perfect");
    // The first runner's status row is specific to them; the catalog name alone is shared, so check the row text.
    expect(otherHtml).not.toContain("Calves 7/10");
  });
});

describe("the coach's view of muscle check-ins", () => {
  const startDirectiveGateway = async (seen: { directive?: unknown }): Promise<string> => {
    const server = createServer((request, response) => {
      void (async (): Promise<void> => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { milebook?: { directive?: unknown } };
        seen.directive = body.milebook?.directive;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            choices: [{ message: { content: "Keep it easy today." } }],
            milebook: { sessions: 0, memories: 0, changes: [], suggestions: ["Plan tomorrow with me"], failures: [] },
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
