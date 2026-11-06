import { afterEach, describe, expect, it } from "vitest";
import { createGateway } from "../src/gateway";
import { createStore } from "../src/store";

const USER = "demo-runner";
const TODAY = "2026-11-05";
const VALID = {
  reply: "Booked an easy Friday and remembered your 10k goal.",
  memories: ["Goal: 10k in 8 weeks"],
  sessions: [{ day: "2026-11-06", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35, note: "conversational" }],
};

const modelFetch = (content: unknown): typeof fetch =>
  (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

const base = async (fetchImpl: typeof fetch, calendarMirror?: { ensureEvents(events: readonly { sessionId: string; day: string; title: string; description: string; kind: string }[]): Promise<{ created: number; updated: number; skipped: number }>; removeEvents(sessionIds: readonly string[]): Promise<number> }) => {
  const handle = createStore(":memory:");
  const gateway = createGateway({
    store: handle.store,
    userId: USER,
    modelBaseUrl: "http://model.test/v1",
    modelApiKey: "test",
    modelName: "test-model",
    calendarUrl: "http://calendar.test",
    now: () => `${TODAY}T08:00:00.000Z`,
    fetchImpl,
    ...(calendarMirror === undefined ? {} : { calendarMirror }),
  });
  await new Promise<void>((resolve) => gateway.server.listen(0, "127.0.0.1", resolve));
  const address = gateway.server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { handle, gateway, url: `http://127.0.0.1:${port}` };
};

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

const post = async (url: string, body: unknown): Promise<Response> =>
  fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("coach gateway", () => {
  it("writes memories and sessions only from a validated turn", async () => {
    const { handle, gateway, url } = await base(modelFetch(VALID));
    cleanup = async () => {
      await gateway.close();
      handle.close();
    };
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "I want to run a 10k in 8 weeks" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    expect(body.choices[0]?.message.content).toContain("Booked an easy Friday");
    expect(handle.store.listMemories(USER)).toHaveLength(1);
    expect(handle.store.listSessions(USER, TODAY, "2026-11-30")).toHaveLength(1);
    expect(handle.store.listMessages(USER)).toHaveLength(2);
  });

  it("writes nothing when the model books the past", async () => {
    const invalid = { ...VALID, sessions: [{ day: "2026-11-04", title: "Past", kind: "easy", distanceKm: 5, durationMin: 30 }] };
    const { handle, gateway, url } = await base(modelFetch(invalid));
    cleanup = async () => {
      await gateway.close();
      handle.close();
    };
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Change yesterday" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    expect(body.choices[0]?.message.content).toContain("nothing was changed");
    expect(handle.store.listMemories(USER)).toHaveLength(0);
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
  });

  it("streams the reply for Open WebUI", async () => {
    const { handle, gateway, url } = await base(modelFetch(VALID));
    cleanup = async () => {
      await gateway.close();
      handle.close();
    };
    const response = await post(url, { model: "poc3-coach", stream: true, messages: [{ role: "user", content: "Plan my week" }] });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("Booked an easy Friday");
    expect(text).toContain("[DONE]");
  });

  it("serves the model list Open WebUI needs", async () => {
    const { handle, gateway, url } = await base(modelFetch(VALID));
    cleanup = async () => {
      await gateway.close();
      handle.close();
    };
    const response = await fetch(`${url}/v1/models`);
    const body = (await response.json()) as { data: Array<{ id: string }> };
    expect(body.data[0]?.id).toBe("poc3-coach");
  });
});

describe("coach dedupe and calendar link", () => {
  it("does not duplicate the same booking across turns and tells the runner where the calendar is", async () => {
    const { handle, gateway, url } = await base(modelFetch(VALID));
    cleanup = async () => {
      await gateway.close();
      handle.close();
    };
    const first = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Plan my week" }] });
    const second = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Same plan again" }] });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const body = (await second.json()) as { choices: Array<{ message: { content: string } }> };
    expect(body.choices[0]?.message.content).toContain("http://calendar.test");
    expect(handle.store.listSessions(USER, TODAY, "2026-11-30")).toHaveLength(1);
  });
});

describe("native calendar mirror metadata", () => {
  it("reports mirrored events without changing the chat reply", async () => {
    let mirrored = 0;
    const { handle, gateway, url } = await base(modelFetch(VALID), {
      async ensureEvents(events) {
        mirrored = events.length;
        return { created: events.length, updated: 0, skipped: 0 };
      },
      async removeEvents() {
        return 0;
      },
    });
    cleanup = async () => {
      await gateway.close();
      handle.close();
    };
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Plan my week" }] });
    const body = (await response.json()) as { choices: Array<{ message: { content: string } }>; poc3: { calendarEvents: number } };
    expect(body.choices[0]?.message.content).toContain("Booked an easy Friday");
    expect(body.poc3.calendarEvents).toBe(1);
    expect(mirrored).toBe(1);
  });
});

describe("coach schedule CRUD", () => {
  const seed = (handle: ReturnType<typeof createStore>) => {
    handle.store.upsertSession({
      sessionId: "session:a",
      userId: USER,
      day: "2026-11-06",
      title: "Easy 5 km",
      kind: "easy",
      distanceKm: 5,
      durationMin: 35,
      note: null,
      createdAt: `${TODAY}T00:00:00.000Z`,
    });
  };

  it("moves a session with action=update and reports the change", async () => {
    const turn = { reply: "Moved it.", sessions: [{ action: "update", sessionId: "session:a", day: "2026-11-07", title: "Easy 4 km", kind: "easy", distanceKm: 4, durationMin: 30 }] };
    const { handle, gateway, url } = await base(modelFetch(turn));
    cleanup = async () => { await gateway.close(); handle.close(); };
    seed(handle);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move Friday" }] });
    const body = (await response.json()) as { poc3: { changes: Array<Record<string, unknown>> } };
    expect(body.poc3.changes[0]).toMatchObject({ action: "update", fromDay: "2026-11-06", toDay: "2026-11-07" });
    const sessions = handle.store.listSessions(USER, TODAY, "2026-12-31");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.day).toBe("2026-11-07");
    expect(sessions[0]?.title).toBe("Easy 4 km");
  });

  it("deletes a session with action=remove", async () => {
    const turn = { reply: "Removed Sunday.", sessions: [{ action: "remove", sessionId: "session:a" }] };
    const { handle, gateway, url } = await base(modelFetch(turn));
    cleanup = async () => { await gateway.close(); handle.close(); };
    seed(handle);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Remove Sunday" }] });
    const body = (await response.json()) as { poc3: { changes: Array<Record<string, unknown>> } };
    expect(body.poc3.changes[0]).toMatchObject({ action: "remove", fromDay: "2026-11-06" });
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
  });

  it("does not invent a change when the session id is unknown", async () => {
    const turn = { reply: "Changed it.", sessions: [{ action: "update", sessionId: "session:missing", day: "2026-11-07", title: "Easy 4 km", kind: "easy", distanceKm: 4, durationMin: 30 }] };
    const { handle, gateway, url } = await base(modelFetch(turn));
    cleanup = async () => { await gateway.close(); handle.close(); };
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Change it" }] });
    const body = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    expect(body.choices[0]?.message.content).toContain("could not find");
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
  });
});

describe("batched CRUD across multiple days", () => {
  const seedTwo = (handle: ReturnType<typeof createStore>) => {
    for (const [id, day, title] of [["session:a", "2026-11-06", "Easy 5 km"], ["session:b", "2026-11-07", "Long 8 km"]] as const) {
      handle.store.upsertSession({
        sessionId: id,
        userId: USER,
        day,
        title,
        kind: day.endsWith("07") ? "long" : "easy",
        distanceKm: 5,
        durationMin: 35,
        note: null,
        createdAt: `${TODAY}T00:00:00.000Z`,
      });
    }
  };

  it("moves two days in one turn", async () => {
    const turn = {
      reply: "Moved both.",
      sessions: [
        { action: "update", sessionId: "session:a", day: "2026-11-08", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35 },
        { action: "update", sessionId: "session:b", day: "2026-11-09", title: "Long 8 km", kind: "long", distanceKm: 8, durationMin: 55 },
      ],
    };
    const { handle, gateway, url } = await base(modelFetch(turn));
    cleanup = async () => { await gateway.close(); handle.close(); };
    seedTwo(handle);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move both days" }] });
    const body = (await response.json()) as { poc3: { changes: Array<Record<string, unknown>> } };
    expect(body.poc3.changes).toHaveLength(2);
    expect(handle.store.listSessions(USER, "2026-11-06", "2026-11-09").map((session) => session.day)).toEqual(["2026-11-08", "2026-11-09"]);
  });

  it("moves one day, removes another and adds a third in the same turn", async () => {
    let mirrored: string[] = [];
    let removed: string[] = [];
    const turn = {
      reply: "Batch done.",
      sessions: [
        { action: "update", sessionId: "session:a", day: "2026-11-08", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35 },
        { action: "remove", sessionId: "session:b" },
        { action: "add", day: "2026-11-10", title: "Easy 4 km", kind: "easy", distanceKm: 4, durationMin: 30 },
      ],
    };
    const { handle, gateway, url } = await base(modelFetch(turn), {
      async ensureEvents(events) {
        mirrored = events.map((event) => event.sessionId);
        return { created: events.length, updated: 0, skipped: 0 };
      },
      async removeEvents(sessionIds) {
        removed = [...sessionIds];
        return sessionIds.length;
      },
    });
    cleanup = async () => { await gateway.close(); handle.close(); };
    seedTwo(handle);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Batch" }] });
    const body = (await response.json()) as { poc3: { changes: Array<Record<string, unknown>> } };
    expect(body.poc3.changes).toHaveLength(3);
    expect(handle.store.getSession(USER, "session:b")).toBeUndefined();
    expect(handle.store.listSessions(USER, "2026-11-01", "2026-11-30").map((session) => session.day)).toEqual(["2026-11-08", "2026-11-10"]);
    expect(mirrored).toHaveLength(2);
    expect(removed).toEqual(["session:b"]);
  });

  it("mirrors the final state when one batch moves then deletes the same session", async () => {
    let mirrored = 0;
    let removed: string[] = [];
    const turn = {
      reply: "Moved then deleted.",
      sessions: [
        { action: "update", sessionId: "session:a", day: "2026-11-08", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35 },
        { action: "remove", sessionId: "session:a" },
      ],
    };
    const { handle, gateway, url } = await base(modelFetch(turn), {
      async ensureEvents(events) {
        mirrored = events.length;
        return { created: events.length, updated: 0, skipped: 0 };
      },
      async removeEvents(sessionIds) {
        removed = [...sessionIds];
        return sessionIds.length;
      },
    });
    cleanup = async () => { await gateway.close(); handle.close(); };
    seedTwo(handle);
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move then delete" }] });
    expect(handle.store.getSession(USER, "session:a")).toBeUndefined();
    expect(mirrored).toBe(0);
    expect(removed).toEqual(["session:a"]);
  });
});

