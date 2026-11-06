import { afterEach, describe, expect, it } from "vitest";
import { createGateway, type GatewayMeta } from "../src/gateway";
import { createStore, type StoreHandle } from "../src/store";
import type { SessionKind } from "../src/types";

const USER = "demo-runner";
const TODAY = "2026-11-05";
const SUGGESTIONS = ["Book my long run for Sunday", "Move Thursday to Friday"];

interface TurnOverrides {
  reply?: string;
  memories?: string[];
  sessions?: unknown[];
  suggestions?: string[];
  revertChangeSetId?: string | null;
}

const turn = (overrides: TurnOverrides = {}): Record<string, unknown> => ({
  reply: "Booked an easy Friday and remembered your 10k goal.",
  memories: ["Goal: 10k in 8 weeks"],
  sessions: [{ day: "2026-11-06", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35, note: "conversational" }],
  suggestions: SUGGESTIONS,
  revertChangeSetId: null,
  ...overrides,
});

const VALID = turn();

const modelResponse = (content: unknown): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** A model stub with one fixed answer, used when a turn's answer does not depend on earlier results. */
const modelFetch = (content: unknown): typeof fetch =>
  (async () => modelResponse(content)) as unknown as typeof fetch;

/** A model stub whose answers are queued by the test, one per request, and which captures each system prompt. */
const queueModel = (): { fetchImpl: typeof fetch; prompts: string[]; answers: unknown[] } => {
  const prompts: string[] = [];
  const answers: unknown[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const rawBody = typeof init?.body === "string" ? init.body : "{}";
    const request = JSON.parse(rawBody) as { messages?: Array<{ role: string; content: string }> };
    prompts.push(request.messages?.[0]?.content ?? "");
    const answer = answers.shift();
    if (answer === undefined) throw new Error("no queued model answer");
    return modelResponse(answer);
  }) as unknown as typeof fetch;
  return { fetchImpl, prompts, answers };
};

const started: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of started.splice(0).reverse()) await stop();
});

const base = async (fetchImpl: typeof fetch) => {
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
  });
  await new Promise<void>((resolve) => gateway.server.listen(0, "127.0.0.1", resolve));
  const address = gateway.server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  started.push(async () => {
    await gateway.close();
    handle.close();
  });
  return { handle, gateway, url: `http://127.0.0.1:${port}` };
};

const post = async (url: string, body: unknown): Promise<Response> =>
  fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

interface Completion {
  choices: Array<{ message: { content: string } }>;
  poc3: GatewayMeta;
}

const seedSession = (
  handle: StoreHandle,
  sessionId: string,
  day: string,
  title: string,
  kind: SessionKind,
): void => {
  handle.store.upsertSession({
    sessionId,
    userId: USER,
    day,
    title,
    kind,
    distanceKm: 5,
    durationMin: 35,
    note: null,
    createdAt: `${TODAY}T00:00:00.000Z`,
  });
};

const seedTwo = (handle: StoreHandle): void => {
  seedSession(handle, "session:a", "2026-11-06", "Easy 5 km", "easy");
  seedSession(handle, "session:b", "2026-11-07", "Long 8 km", "long");
};

const daysOf = (handle: StoreHandle): string[] =>
  handle.store.listSessions(USER, "2026-11-01", "2026-11-30").map((session) => session.day);

const titlesOf = (handle: StoreHandle): string[] =>
  handle.store.listSessions(USER, "2026-11-01", "2026-11-30").map((session) => session.title);

const moveA = (day = "2026-11-07", title = "Easy 4 km"): Record<string, unknown> => ({
  action: "update",
  sessionId: "session:a",
  day,
  title,
  kind: "easy",
  distanceKm: 4,
  durationMin: 30,
});

describe("coach gateway", () => {
  it("writes memories, sessions and one change set from a validated turn", async () => {
    const { handle, url } = await base(modelFetch(VALID));
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "I want to run a 10k in 8 weeks" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("Booked an easy Friday");
    expect(handle.store.listMemories(USER)).toHaveLength(1);
    expect(handle.store.listSessions(USER, TODAY, "2026-11-30")).toHaveLength(1);
    expect(handle.store.listMessages(USER)).toHaveLength(2);

    expect(body.poc3).toMatchObject({ sessions: 1, memories: 1, reverted: false });
    expect(body.poc3.suggestions).toEqual(SUGGESTIONS);
    expect(body.poc3.changeSetId).toMatch(/^change:/);
    expect(body.poc3.changes).toHaveLength(1);
    expect(body.poc3.changes[0]).toMatchObject({ action: "add", fromDay: null, toDay: "2026-11-06", title: "Easy 5 km", kind: "easy" });
    expect(body.poc3.changes[0]?.before).toBeNull();
    expect(body.poc3.changes[0]?.after?.day).toBe("2026-11-06");
    expect("calendarEvents" in body.poc3).toBe(false);

    const sets = handle.store.listChangeSets(USER);
    expect(sets).toHaveLength(1);
    expect(sets[0]?.changeSetId).toBe(body.poc3.changeSetId);
    expect(sets[0]?.entries).toHaveLength(1);
    expect(sets[0]?.summary).toContain("add");
    expect(sets[0]?.revertedAt).toBeNull();
  });

  it("writes nothing when the model books the past", async () => {
    const invalid = turn({ sessions: [{ day: "2026-11-04", title: "Past", kind: "easy", distanceKm: 5, durationMin: 30 }] });
    const { handle, url } = await base(modelFetch(invalid));
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Change yesterday" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("nothing was changed");
    expect(handle.store.listMemories(USER)).toHaveLength(0);
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listChangeSets(USER)).toHaveLength(0);
    expect(body.poc3).toMatchObject({ sessions: 0, memories: 0, changeSetId: null, reverted: false, suggestions: [] });
    expect(body.poc3.changes).toEqual([]);
  });

  it("streams the reply for the calendar bubble", async () => {
    const { handle, url } = await base(modelFetch(VALID));
    const response = await post(url, { model: "poc3-coach", stream: true, messages: [{ role: "user", content: "Plan my week" }] });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("Booked an easy Friday");
    expect(text).toContain("[DONE]");
    expect(handle.store.listSessions(USER, TODAY, "2026-11-30")).toHaveLength(1);
  });

  it("serves the model list an OpenAI-compatible client needs", async () => {
    const { url } = await base(modelFetch(VALID));
    const response = await fetch(`${url}/v1/models`);
    const body = (await response.json()) as { data: Array<{ id: string }> };
    expect(body.data[0]?.id).toBe("poc3-coach");
  });

  it("does not duplicate the same booking across turns and tells the runner where the calendar is", async () => {
    const { handle, url } = await base(modelFetch(VALID));
    const first = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Plan my week" }] });
    const second = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Same plan again" }] });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const body = (await second.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("http://calendar.test");
    expect(handle.store.listSessions(USER, TODAY, "2026-11-30")).toHaveLength(1);
    expect(handle.store.listChangeSets(USER)).toHaveLength(2);
  });

  it("passes the recent change sets into the next prompt", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(VALID);
    const first = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Plan my week" }] });
    const firstBody = (await first.json()) as Completion;
    const changeSetId = firstBody.poc3.changeSetId;
    expect(changeSetId).not.toBeNull();
    model.answers.push(turn({ reply: "Same plan again." }));
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "What did you just do?" }] });
    expect(model.prompts).toHaveLength(2);
    expect(model.prompts[1]).toContain("recentChanges");
    expect(model.prompts[1]).toContain(changeSetId ?? "missing");
    expect(model.prompts[1]).toContain("suggestions");
    expect(handle.store.listChangeSets(USER)).toHaveLength(2);
  });
});

describe("coach schedule CRUD", () => {
  it("moves a session with action=update and reports the change", async () => {
    const answer = turn({ reply: "Moved it.", memories: [], sessions: [moveA()] });
    const { handle, url } = await base(modelFetch(answer));
    seedSession(handle, "session:a", "2026-11-06", "Easy 5 km", "easy");
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move Friday" }] });
    const body = (await response.json()) as Completion;
    expect(body.poc3.changes[0]).toMatchObject({ action: "update", fromDay: "2026-11-06", toDay: "2026-11-07" });
    expect(body.poc3.changes[0]?.before?.title).toBe("Easy 5 km");
    expect(body.poc3.changes[0]?.after?.title).toBe("Easy 4 km");
    const sessions = handle.store.listSessions(USER, TODAY, "2026-12-31");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.day).toBe("2026-11-07");
    expect(sessions[0]?.title).toBe("Easy 4 km");
    const stored = handle.store.listChangeSets(USER);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.entries[0]?.before?.day).toBe("2026-11-06");
    expect(stored[0]?.entries[0]?.after?.day).toBe("2026-11-07");
  });

  it("deletes a session with action=remove", async () => {
    const answer = turn({ reply: "Removed Sunday.", memories: [], sessions: [{ action: "remove", sessionId: "session:a" }] });
    const { handle, url } = await base(modelFetch(answer));
    seedSession(handle, "session:a", "2026-11-06", "Easy 5 km", "easy");
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Remove Sunday" }] });
    const body = (await response.json()) as Completion;
    expect(body.poc3.changes[0]).toMatchObject({ action: "remove", fromDay: "2026-11-06", toDay: null });
    expect(body.poc3.changes[0]?.before?.title).toBe("Easy 5 km");
    expect(body.poc3.changes[0]?.after).toBeNull();
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listChangeSets(USER)).toHaveLength(1);
  });

  it("does not invent a change when the session id is unknown", async () => {
    const answer = turn({ reply: "Changed it.", memories: [], sessions: [{ ...moveA(), sessionId: "session:missing" }] });
    const { handle, url } = await base(modelFetch(answer));
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Change it" }] });
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("could not find");
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listChangeSets(USER)).toHaveLength(0);
    expect(body.poc3).toMatchObject({ sessions: 0, changeSetId: null, reverted: false });
  });
});

describe("batched CRUD across multiple days", () => {
  it("moves two days in one turn and records one change set", async () => {
    const answer = turn({
      reply: "Moved both.",
      memories: [],
      sessions: [
        { ...moveA("2026-11-08", "Easy 5 km") },
        { action: "update", sessionId: "session:b", day: "2026-11-09", title: "Long 8 km", kind: "long", distanceKm: 8, durationMin: 55 },
      ],
    });
    const { handle, url } = await base(modelFetch(answer));
    seedTwo(handle);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move both days" }] });
    const body = (await response.json()) as Completion;
    expect(body.poc3.changes).toHaveLength(2);
    expect(body.poc3.sessions).toBe(2);
    expect(daysOf(handle)).toEqual(["2026-11-08", "2026-11-09"]);
    const stored = handle.store.listChangeSets(USER);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.changeSetId).toBe(body.poc3.changeSetId);
    expect(stored[0]?.entries.map((entry) => entry.action)).toEqual(["update", "update"]);
  });

  it("moves one day, removes another and adds a third in the same turn", async () => {
    const answer = turn({
      reply: "Batch done.",
      memories: [],
      sessions: [
        { ...moveA("2026-11-08", "Easy 5 km") },
        { action: "remove", sessionId: "session:b" },
        { action: "add", day: "2026-11-10", title: "Easy 4 km", kind: "easy", distanceKm: 4, durationMin: 30 },
      ],
    });
    const { handle, url } = await base(modelFetch(answer));
    seedTwo(handle);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Batch" }] });
    const body = (await response.json()) as Completion;
    expect(body.poc3.changes).toHaveLength(3);
    expect(handle.store.getSession(USER, "session:b")).toBeUndefined();
    expect(daysOf(handle)).toEqual(["2026-11-08", "2026-11-10"]);
    const stored = handle.store.listChangeSets(USER);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.entries.map((entry) => entry.action)).toEqual(["update", "remove", "add"]);
    expect(stored[0]?.entries[2]?.before).toBeNull();
    expect(stored[0]?.entries[2]?.after?.day).toBe("2026-11-10");
    expect(stored[0]?.entries[1]?.before?.day).toBe("2026-11-07");
    expect(stored[0]?.entries[1]?.after).toBeNull();
  });

  it("keeps the final snapshot when one batch moves then deletes the same session", async () => {
    const answer = turn({
      reply: "Moved then deleted.",
      memories: [],
      sessions: [moveA("2026-11-08", "Easy 5 km"), { action: "remove", sessionId: "session:a" }],
    });
    const { handle, url } = await base(modelFetch(answer));
    seedTwo(handle);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move then delete" }] });
    const body = (await response.json()) as Completion;
    expect(body.poc3.changes).toHaveLength(2);
    expect(handle.store.getSession(USER, "session:a")).toBeUndefined();
    expect(daysOf(handle)).toEqual(["2026-11-07"]);
    const stored = handle.store.listChangeSets(USER);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.entries[0]?.after?.day).toBe("2026-11-08");
    expect(stored[0]?.entries[1]?.before?.day).toBe("2026-11-08");
    expect(stored[0]?.entries[1]?.after).toBeNull();
  });
});

describe("change history and revert", () => {
  it("reverts the last batch and records an audit change set", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedTwo(handle);
    model.answers.push(
      turn({
        reply: "Moved both.",
        memories: [],
        sessions: [
          moveA("2026-11-08", "Easy 5 km"),
          { action: "update", sessionId: "session:b", day: "2026-11-09", title: "Long 8 km", kind: "long", distanceKm: 8, durationMin: 55 },
        ],
      }),
    );
    const first = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move both days" }] });
    const firstBody = (await first.json()) as Completion;
    const originalId = firstBody.poc3.changeSetId;
    expect(originalId).not.toBeNull();

    model.answers.push(turn({ reply: "Put both back.", memories: [], sessions: [], suggestions: ["Plan next week"], revertChangeSetId: "last" }));
    const second = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo that" }] });
    const secondBody = (await second.json()) as Completion;
    expect(secondBody.poc3.reverted).toBe(true);
    expect(secondBody.poc3.changes).toHaveLength(2);
    expect(secondBody.poc3.changes.map((change) => change.action)).toEqual(["revert", "revert"]);
    expect(secondBody.poc3.suggestions).toEqual(["Plan next week"]);
    expect(secondBody.poc3.changeSetId).not.toBeNull();
    expect(secondBody.poc3.changeSetId).not.toBe(originalId);
    expect(secondBody.choices[0]?.message.content).toContain("Put both back.");
    expect(secondBody.choices[0]?.message.content).toContain("http://calendar.test");

    expect(daysOf(handle)).toEqual(["2026-11-06", "2026-11-07"]);
    expect(titlesOf(handle)).toEqual(["Easy 5 km", "Long 8 km"]);
    const sets = handle.store.listChangeSets(USER);
    expect(sets).toHaveLength(2);
    expect(sets[0]?.changeSetId).toBe(secondBody.poc3.changeSetId);
    expect(sets[0]?.entries.map((change) => change.action)).toEqual(["revert", "revert"]);
    expect(sets[0]?.revertedAt).toBeNull();
    expect(sets[1]?.changeSetId).toBe(originalId);
    expect(sets[1]?.revertedAt).toBe(`${TODAY}T08:00:00.000Z`);
  });

  it("reverts an explicit change set id", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "session:a", "2026-11-06", "Easy 5 km", "easy");
    model.answers.push(turn({ reply: "Moved it.", memories: [], sessions: [moveA()] }));
    const first = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move Friday" }] });
    const firstBody = (await first.json()) as Completion;
    const changeSetId = firstBody.poc3.changeSetId ?? "missing";

    model.answers.push(turn({ reply: "Back to Friday.", memories: [], sessions: [], revertChangeSetId: changeSetId }));
    const second = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo that" }] });
    const secondBody = (await second.json()) as Completion;
    expect(secondBody.poc3.reverted).toBe(true);
    expect(daysOf(handle)).toEqual(["2026-11-06"]);
    expect(titlesOf(handle)).toEqual(["Easy 5 km"]);
    expect(handle.store.getChangeSet(USER, changeSetId)?.revertedAt).toBe(`${TODAY}T08:00:00.000Z`);
  });

  it("undoes an add by deleting the session", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(VALID);
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Book Friday" }] });
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(1);
    model.answers.push(turn({ reply: "Removed it again.", memories: [], sessions: [], revertChangeSetId: "last" }));
    const second = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo that" }] });
    const body = (await second.json()) as Completion;
    expect(body.poc3.reverted).toBe(true);
    expect(body.poc3.changes[0]).toMatchObject({ action: "revert", fromDay: "2026-11-06", toDay: null });
    expect(body.poc3.changes[0]?.before?.day).toBe("2026-11-06");
    expect(body.poc3.changes[0]?.after).toBeNull();
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
  });

  it("undoes a remove by restoring the original snapshot", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "session:a", "2026-11-06", "Easy 5 km", "easy");
    model.answers.push(turn({ reply: "Removed it.", memories: [], sessions: [{ action: "remove", sessionId: "session:a" }] }));
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Remove Friday" }] });
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    model.answers.push(turn({ reply: "Restored it.", memories: [], sessions: [], revertChangeSetId: "last" }));
    const second = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo that" }] });
    const body = (await second.json()) as Completion;
    expect(body.poc3.reverted).toBe(true);
    expect(body.poc3.changes[0]).toMatchObject({ action: "revert", fromDay: null, toDay: "2026-11-06" });
    expect(body.poc3.changes[0]?.after?.title).toBe("Easy 5 km");
    expect(titlesOf(handle)).toEqual(["Easy 5 km"]);
    expect(daysOf(handle)).toEqual(["2026-11-06"]);
  });

  it("undoes an update by restoring the previous snapshot", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "session:a", "2026-11-06", "Easy 5 km", "easy");
    model.answers.push(turn({ reply: "Moved it.", memories: [], sessions: [moveA()] }));
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move Friday" }] });
    expect(daysOf(handle)).toEqual(["2026-11-07"]);
    model.answers.push(turn({ reply: "Back to Friday.", memories: [], sessions: [], revertChangeSetId: "last" }));
    const second = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo that" }] });
    const body = (await second.json()) as Completion;
    expect(body.poc3.reverted).toBe(true);
    expect(body.poc3.changes[0]).toMatchObject({ action: "revert", fromDay: "2026-11-07", toDay: "2026-11-06" });
    expect(daysOf(handle)).toEqual(["2026-11-06"]);
    expect(titlesOf(handle)).toEqual(["Easy 5 km"]);
  });

  it("reverts a revert, because the audit change set is a change set too", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "session:a", "2026-11-06", "Easy 5 km", "easy");
    model.answers.push(turn({ reply: "Moved it.", memories: [], sessions: [moveA()] }));
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move Friday" }] });
    model.answers.push(turn({ reply: "Back to Friday.", memories: [], sessions: [], revertChangeSetId: "last" }));
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo that" }] });
    expect(daysOf(handle)).toEqual(["2026-11-06"]);
    model.answers.push(turn({ reply: "Moved it again.", memories: [], sessions: [], revertChangeSetId: "last" }));
    const third = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo the undo" }] });
    const body = (await third.json()) as Completion;
    expect(body.poc3.reverted).toBe(true);
    expect(daysOf(handle)).toEqual(["2026-11-07"]);
    expect(titlesOf(handle)).toEqual(["Easy 4 km"]);
    expect(handle.store.listChangeSets(USER)).toHaveLength(3);
  });

  it("rejects a turn that combines a revert with sessions and writes nothing", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(VALID);
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Book Friday" }] });
    expect(handle.store.listChangeSets(USER)).toHaveLength(1);
    model.answers.push(
      turn({
        reply: "I will undo and book at once.",
        memories: ["tried a mixed turn"],
        sessions: [{ action: "add", day: "2026-11-10", title: "Easy 4 km", kind: "easy", distanceKm: 4, durationMin: 30 }],
        revertChangeSetId: "last",
      }),
    );
    const second = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo and book" }] });
    const body = (await second.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("nothing was changed");
    expect(body.choices[0]?.message.content).toContain("cannot share");
    expect(body.poc3).toMatchObject({ sessions: 0, memories: 0, changeSetId: null, reverted: false, suggestions: [] });
    expect(body.poc3.changes).toEqual([]);
    expect(handle.store.listChangeSets(USER)).toHaveLength(1);
    expect(handle.store.listMemories(USER)).toHaveLength(1);
    expect(daysOf(handle)).toEqual(["2026-11-06"]);
  });

  it("refuses an unknown change set id without touching the calendar", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(VALID);
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Book Friday" }] });
    model.answers.push(turn({ reply: "Undone.", memories: [], sessions: [], revertChangeSetId: "change:missing" }));
    const second = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo the missing one" }] });
    const body = (await second.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("could not find the change");
    expect(body.poc3).toMatchObject({ reverted: false, changeSetId: null, sessions: 0 });
    expect(handle.store.listChangeSets(USER)).toHaveLength(1);
    expect(daysOf(handle)).toEqual(["2026-11-06"]);
  });

  it("refuses an already reverted change set", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "session:a", "2026-11-06", "Easy 5 km", "easy");
    model.answers.push(turn({ reply: "Moved it.", memories: [], sessions: [moveA()] }));
    const first = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move Friday" }] });
    const firstBody = (await first.json()) as Completion;
    const originalId = firstBody.poc3.changeSetId ?? "missing";
    model.answers.push(turn({ reply: "Undone.", memories: [], sessions: [], revertChangeSetId: "last" }));
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo that" }] });
    expect(handle.store.listChangeSets(USER)).toHaveLength(2);
    model.answers.push(turn({ reply: "Again.", memories: [], sessions: [], revertChangeSetId: originalId }));
    const third = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo again" }] });
    const body = (await third.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("already undone");
    expect(body.poc3.reverted).toBe(false);
    expect(handle.store.listChangeSets(USER)).toHaveLength(2);
    expect(handle.store.getChangeSet(USER, originalId)?.revertedAt).not.toBeNull();
  });

  it("reports no revert when there is nothing to undo", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(turn({ reply: "Nothing to undo.", memories: [], sessions: [], revertChangeSetId: "last" }));
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo the last change" }] });
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("could not find the change");
    expect(body.poc3.reverted).toBe(false);
    expect(body.poc3.changeSetId).toBeNull();
    expect(handle.store.listChangeSets(USER)).toHaveLength(0);
  });
});

describe("schema echo repair", () => {
  it("asks once more when the model repeats the JSON schema", async () => {
    const model = queueModel();
    model.answers.push({
      reply: "string",
      memories: ["string"],
      sessions: [{ action: "add", sessionId: null, day: "YYYY-MM-DD", title: "string", kind: "easy", distanceKm: 0, durationMin: null, note: "string" }],
      suggestions: ["string"],
      revertChangeSetId: null,
    });
    model.answers.push(VALID);
    const { handle, url } = await base(model.fetchImpl);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Race on Jan 15" }] });
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("Booked an easy Friday");
    expect(model.prompts).toHaveLength(2);
    expect(model.prompts[1]).toContain("schema template");
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(1);
  });
});

