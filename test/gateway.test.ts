import { afterEach, describe, expect, it } from "vitest";
import { createGateway, type GatewayMeta } from "../src/gateway";
import { createStore, type StoreHandle } from "../src/store";
import type { SessionKind, Store } from "../src/types";

const USER = "demo-runner";
const TODAY = "2026-11-05";
const SUGGESTIONS = ["Book my long run for Sunday", "Move Thursday to Friday"];

interface TurnOverrides {
  reply?: string;
  memories?: string[];
  sessions?: unknown[];
  suggestions?: string[];
  revertChangeSetId?: string | null;
  stateProposals?: unknown[];
}

const turn = (overrides: TurnOverrides = {}): Record<string, unknown> => ({
  reply: "Booked an easy Friday and remembered your 10k goal.",
  memories: ["Goal: 10k in 8 weeks"],
  sessions: [{ day: "2026-11-06", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35, note: "conversational" }],
  suggestions: SUGGESTIONS,
  revertChangeSetId: null,
  stateProposals: [],
  ...overrides,
});

const VALID = turn();

const modelResponse = (content: unknown): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** A response whose content is plain assistant text, not a JSON proposal. */
const textResponse = (text: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** A native OpenAI tool-call response. */
const toolResponse = (args: unknown, id = "call_1", name = "propose_calendar_turn"): Response =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
          },
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

/** A model stub with one fixed answer, used when a turn's answer does not depend on earlier results. */
const modelFetch = (content: unknown): typeof fetch =>
  (async () => modelResponse(content)) as unknown as typeof fetch;

interface QueuedResponses {
  fetchImpl: typeof fetch;
  prompts: string[];
  responses: Response[];
}

/** A model stub whose responses are queued by the test, one per request. */
const queueResponses = (): QueuedResponses => {
  const prompts: string[] = [];
  const responses: Response[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const rawBody = typeof init?.body === "string" ? init.body : "{}";
    const request = JSON.parse(rawBody) as {
      messages?: Array<{ role: string; content?: unknown; tool_calls?: unknown }>;
    };
    prompts.push(
      (request.messages ?? [])
        .map((message) => `${message.role}: ${typeof message.content === "string" ? message.content : JSON.stringify(message)}`)
        .join("\n"),
    );
    const response = responses.shift();
    if (response === undefined) throw new Error("no queued model response");
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, prompts, responses };
};

/** A model stub whose answers are queued by the test, one per request, and which captures each request's messages. */
const queueModel = (): { fetchImpl: typeof fetch; prompts: string[]; answers: unknown[] } => {
  const prompts: string[] = [];
  const answers: unknown[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const rawBody = typeof init?.body === "string" ? init.body : "{}";
    const request = JSON.parse(rawBody) as {
      messages?: Array<{ role: string; content?: unknown; tool_calls?: unknown }>;
    };
    prompts.push(
      (request.messages ?? [])
        .map((message) => `${message.role}: ${typeof message.content === "string" ? message.content : JSON.stringify(message)}`)
        .join("\n"),
    );
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

interface BaseOptions {
  now?: () => string;
  timezone?: string;
  /** The runner's saved free-text goal, when the test creates a profile. */
  goal?: string | null;
  /** Simulate a state-store failure before the prompt is built. */
  failStateRefresh?: boolean;
}

function failingStateStore(store: Store): Store {
  return new Proxy(store, {
    get(target, property) {
      if (property === "listCoachStates") {
        return () => {
          throw new Error("state store unavailable");
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const base = async (fetchImpl: typeof fetch, options: BaseOptions = {}) => {
  const handle = createStore(":memory:");
  if (options.timezone !== undefined) {
    handle.store.createUser({
      userId: USER,
      username: "demo-runner",
      displayName: "Demo Runner",
      passwordHash: "not-used",
      timezone: options.timezone,
      goal: options.goal ?? null,
      createdAt: `${TODAY}T00:00:00.000Z`,
    });
  }
  const gateway = createGateway({
    store: options.failStateRefresh === true ? failingStateStore(handle.store) : handle.store,
    userId: USER,
    modelBaseUrl: "http://model.test/v1",
    modelApiKey: "test",
    modelName: "test-model",
    now: options.now ?? (() => `${TODAY}T08:00:00.000Z`),
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

  it("does not duplicate the same booking across turns and does not append the calendar url", async () => {
    const { handle, url } = await base(modelFetch(VALID));
    const first = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Plan my week" }] });
    const second = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Same plan again" }] });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const body = (await second.json()) as Completion;
    expect(body.choices[0]?.message.content).not.toContain("http://calendar.test");
    expect(body.choices[0]?.message.content).not.toContain("Your calendar");
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

  it("puts the runner's saved goal into the coach prompt", async () => {
    const model = queueModel();
    const { url } = await base(model.fetchImpl, { timezone: "Asia/Hong_Kong", goal: "Half marathon in March" });
    model.answers.push(VALID);
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "What should I focus on?" }] });
    expect(model.prompts).toHaveLength(1);
    expect(model.prompts[0]).toContain('"goal":"Half marathon in March"');
  });

  it("puts the last 30 activities into the coach prompt", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    for (let index = 1; index <= 12; index += 1) {
      handle.store.appendActivity({
        activityId: `garmin:${index}`,
        userId: USER,
        day: `2026-11-${String(index).padStart(2, "0")}`,
        title: `activity-${String(index).padStart(2, "0")}`,
        distanceKm: 5,
        durationMin: 30,
        paceSecPerKm: 360,
        avgHr: 140,
        source: "garmin",
        createdAt: `${TODAY}T00:00:00.000Z`,
      });
    }
    model.answers.push(turn({ reply: "Reviewed.", memories: [], sessions: [] }));
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Review my month" }] });
    expect(response.status).toBe(200);
    expect(model.prompts).toHaveLength(1);
    expect(model.prompts[0]).toContain("recentActivities");
    expect(model.prompts[0]).toContain("activity-01");
    expect(model.prompts[0]).toContain("activity-12");
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
    expect(body.choices[0]?.message.content).toBe("Changed it.");
    expect(body.poc3.failures).toEqual([
      { action: "update", sessionId: "session:missing", title: "Easy 4 km", day: "2026-11-07", reason: "session-not-found" },
    ]);
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listChangeSets(USER)).toHaveLength(0);
    expect(body.poc3).toMatchObject({ sessions: 0, changeSetId: null, reverted: false });
    const stored = handle.store.listMessages(USER, 10);
    expect(stored.some((message) => message.role === "assistant" && message.text.includes("Note: 1 item could not be found"))).toBe(true);
  });

  it("applies the valid part of a batch and reports the missing session structurally", async () => {
    const answer = turn({
      reply: "Deleted the easy run.",
      memories: [],
      sessions: [
        { action: "remove", sessionId: "session:a", day: "2026-11-06", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35 },
        { action: "remove", sessionId: "session:missing", day: "2026-11-13", title: "15 min drill", kind: "interval", distanceKm: null, durationMin: 15 },
      ],
    });
    const { handle, url } = await base(modelFetch(answer));
    seedSession(handle, "session:a", "2026-11-06", "Easy 5 km", "easy");
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Delete the drill" }] });
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).not.toContain("Note:");
    expect(body.poc3.sessions).toBe(1);
    expect(body.poc3.failures).toEqual([
      { action: "remove", sessionId: "session:missing", title: "15 min drill", day: "2026-11-13", reason: "session-not-found" },
    ]);
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listChangeSets(USER)).toHaveLength(1);
    const stored = handle.store.listMessages(USER, 10);
    expect(stored.some((message) => message.role === "assistant" && message.text.includes("Note: 1 item could not be found"))).toBe(true);
  });

  it("stores the failure note in the reply's language", async () => {
    const answer = turn({
      reply: "好，我幫你刪咗個 drill。",
      memories: [],
      sessions: [
        { action: "remove", sessionId: "session:missing", day: "2026-11-13", title: "15 min drill", kind: "interval", distanceKm: null, durationMin: 15 },
      ],
    });
    const { handle, url } = await base(modelFetch(answer));
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Delete the session on 2026-11-13." }] });
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).toBe("好，我幫你刪咗個 drill。");
    expect(body.poc3.failures).toHaveLength(1);
    const stored = handle.store.listMessages(USER, 10);
    expect(stored.some((message) => message.role === "assistant" && message.text.includes("註：有 1 個項目找不到"))).toBe(true);
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
    expect(secondBody.choices[0]?.message.content).not.toContain("Your calendar");

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

describe("validation feedback loop", () => {
  it("repairs a past-session proposal once and commits the corrected day", async () => {
    const model = queueResponses();
    model.responses.push(
      modelResponse(
        turn({ sessions: [{ day: "2026-11-04", title: "Past", kind: "easy", distanceKm: 5, durationMin: 30 }] }),
      ),
    );
    model.responses.push(modelResponse(VALID));
    const { handle, url } = await base(model.fetchImpl);

    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Change yesterday" }] });
    const body = (await response.json()) as Completion;

    expect(body.choices[0]?.message.content).toContain("Booked an easy Friday");
    expect(body.poc3).toMatchObject({
      attempts: 2,
      outcome: "committed",
      validationCode: null,
      sessions: 1,
    });
    expect(model.prompts).toHaveLength(2);
    expect(model.prompts[1]).toContain("past-session");
    expect(model.prompts[1]).toContain("policy");
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(1);
    expect(handle.store.listChangeSets(USER)).toHaveLength(1);
  });

  it("lets the model ask a clarifying question instead of booking a rejected date", async () => {
    const model = queueResponses();
    model.responses.push(
      modelResponse(
        turn({ sessions: [{ day: "2026-11-04", title: "Past", kind: "easy", distanceKm: 5, durationMin: 30 }] }),
      ),
    );
    model.responses.push(textResponse("Do you want me to book the drill today, 12 Nov, or keep it unbooked?"));
    const { handle, url } = await base(model.fetchImpl);

    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "go" }] });
    const body = (await response.json()) as Completion;

    expect(body.choices[0]?.message.content).toContain("12 Nov");
    expect(body.poc3).toMatchObject({ attempts: 2, outcome: "clarified", validationCode: null, sessions: 0 });
    expect(body.poc3.changeSetId).toBeNull();
    expect(body.poc3.changes).toEqual([]);
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listChangeSets(USER)).toHaveLength(0);
    expect(handle.store.listMessages(USER)).toHaveLength(2);
    expect(handle.store.listMessages(USER)[1]?.text).toContain("12 Nov");
    expect(model.prompts[1]).toContain("past-session");
  });

  it("falls back only after both attempts are rejected, and writes nothing", async () => {
    const invalid = turn({
      sessions: [{ day: "2026-11-04", title: "Past", kind: "easy", distanceKm: 5, durationMin: 30 }],
    });
    const model = queueResponses();
    model.responses.push(modelResponse(invalid));
    model.responses.push(modelResponse(invalid));
    const { handle, url } = await base(model.fetchImpl);

    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "go" }] });
    const body = (await response.json()) as Completion;

    expect(body.choices[0]?.message.content).toContain("nothing was changed");
    expect(body.choices[0]?.message.content).toContain("already passed");
    expect(body.poc3).toMatchObject({ attempts: 2, outcome: "fallback", validationCode: "past-session", sessions: 0 });
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listChangeSets(USER)).toHaveLength(0);
    expect(handle.store.listMessages(USER)).toHaveLength(2);
  });

  it("accepts a native propose_calendar_turn tool call", async () => {
    const model = queueResponses();
    model.responses.push(toolResponse(VALID));
    const { handle, url } = await base(model.fetchImpl);

    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Plan my week" }] });
    const body = (await response.json()) as Completion;

    expect(body.choices[0]?.message.content).toContain("Booked an easy Friday");
    expect(body.poc3).toMatchObject({ attempts: 1, outcome: "committed", sessions: 1 });
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(1);
    expect(model.prompts[0]).toContain("propose_calendar_turn");
  });

  it("feeds a native tool validation result back and accepts the corrected call", async () => {
    const model = queueResponses();
    model.responses.push(
      toolResponse(
        turn({ sessions: [{ day: "2026-11-04", title: "Past", kind: "easy", distanceKm: 5, durationMin: 30 }] }),
        "call_1",
      ),
    );
    model.responses.push(toolResponse(VALID, "call_2"));
    const { handle, url } = await base(model.fetchImpl);

    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "go" }] });
    const body = (await response.json()) as Completion;

    expect(body.poc3).toMatchObject({ attempts: 2, outcome: "committed", sessions: 1 });
    expect(model.prompts[1]).toContain("past-session");
    expect(model.prompts[1]).toContain("tool:");
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(1);
    expect(handle.store.listChangeSets(USER)).toHaveLength(1);
  });

  it("uses the runner's timezone for today instead of the UTC day", async () => {
    const model = queueResponses();
    model.responses.push(
      modelResponse(
        turn({ sessions: [{ day: "2026-11-11", title: "Wrong day", kind: "easy", distanceKm: 5, durationMin: 30 }] }),
      ),
    );
    model.responses.push(
      modelResponse(
        turn({ sessions: [{ day: "2026-11-12", title: "Right day", kind: "easy", distanceKm: 5, durationMin: 30 }] }),
      ),
    );
    const { handle, url } = await base(model.fetchImpl, {
      now: () => "2026-11-11T16:30:00.000Z",
      timezone: "Asia/Hong_Kong",
    });

    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Book today" }] });
    const body = (await response.json()) as Completion;

    expect(body.poc3).toMatchObject({ attempts: 2, outcome: "committed", sessions: 1 });
    expect(model.prompts[0]).toContain('"today":"2026-11-12"');
    expect(model.prompts[0]).toContain('"timezone":"Asia/Hong_Kong"');
    expect(handle.store.listSessions(USER, "2026-11-12", "2026-11-30")).toHaveLength(1);
    expect(handle.store.listSessions(USER, "2026-11-12", "2026-11-30")[0]?.day).toBe("2026-11-12");
  });

  it("date-stamps stale history and keeps the current day authoritative", async () => {
    const model = queueResponses();
    model.responses.push(
      modelResponse(
        turn({ sessions: [{ day: "2026-11-12", title: "Today drill", kind: "cross", distanceKm: null, durationMin: 15 }] }),
      ),
    );
    const { handle, url } = await base(model.fetchImpl, {
      now: () => "2026-11-12T07:50:00.000Z",
      timezone: "Asia/Hong_Kong",
    });
    handle.store.appendMessage({
      messageId: "old-assistant",
      userId: USER,
      role: "assistant",
      text: "今日（11月6日，星期五）做 15 分鐘 drill。",
      createdAt: "2026-11-06T07:49:58.000Z",
    });

    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "go" }] });
    expect(response.status).toBe(200);

    expect(model.prompts[0]).toContain("[2026-11-06 15:49] Coach:");
    expect(model.prompts[0]).toContain('"today":"2026-11-12"');
    expect(model.prompts[0]).toContain("bare follow-up");
  });

  it("treats plain assistant text as a clarification without calling the validator", async () => {
    const model = queueResponses();
    model.responses.push(textResponse("Do you want the drill booked today, or just the drill instructions?"));
    const { handle, url } = await base(model.fetchImpl);

    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "go" }] });
    const body = (await response.json()) as Completion;

    expect(body.poc3).toMatchObject({ attempts: 1, outcome: "clarified", sessions: 0, validationCode: null });
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listMessages(USER)).toHaveLength(2);
  });
});

describe("idempotent coach turns", () => {
  it("replays a completed request id without calling the model or writing twice", async () => {
    const model = queueResponses();
    model.responses.push(modelResponse(VALID));
    const { handle, url } = await base(model.fetchImpl);
    const request = {
      model: "poc3-coach",
      request_id: "req-1",
      messages: [{ role: "user", content: "Plan my week" }],
    };

    const first = await post(url, request);
    const firstBody = (await first.json()) as Completion;
    const second = await post(url, request);
    const secondBody = (await second.json()) as Completion;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get("x-poc3-idempotent-replay")).toBe("true");
    expect(secondBody).toEqual(firstBody);
    expect(model.prompts).toHaveLength(1);
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(1);
    expect(handle.store.listChangeSets(USER)).toHaveLength(1);
    expect(handle.store.getCoachTurn(USER, "req-1")).toMatchObject({
      status: "completed",
      attempts: 1,
      outcome: "committed",
    });
  });

  it("refuses a request id that is already running", async () => {
    const model = queueResponses();
    const { handle, url } = await base(model.fetchImpl);
    handle.store.claimCoachTurn({
      requestId: "req-busy",
      userId: USER,
      createdAt: `${TODAY}T08:00:00.000Z`,
      completedAt: null,
      status: "in_progress",
      attempts: 0,
      validationCode: null,
      outcome: null,
      responseJson: null,
      directiveHash: null,
    });

    const response = await post(url, {
      model: "poc3-coach",
      request_id: "req-busy",
      messages: [{ role: "user", content: "Plan my week" }],
    });

    expect(response.status).toBe(409);
    expect(model.prompts).toHaveLength(0);
  });
});

describe("hidden coach directives", () => {
  const seedRun = (handle: StoreHandle): void => {
    handle.store.appendActivity({
      activityId: "garmin:run-1",
      userId: USER,
      day: "2026-11-04",
      title: "Morning run",
      distanceKm: 5,
      durationMin: 30,
      paceSecPerKm: 360,
      avgHr: 145,
      source: "garmin",
      createdAt: `${TODAY}T00:00:00.000Z`,
    });
  };

  it("blocks a calendar write on a comment-only turn and repairs to a comment", async () => {
    const model = queueResponses();
    const { handle, url } = await base(model.fetchImpl);
    seedRun(handle);
    model.responses.push(
      modelResponse(
        turn({
          reply: "I would book an easy run.",
          memories: [],
          sessions: [{ day: "2026-11-06", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35, note: null }],
        }),
      ),
      textResponse("You ran 5 km at an easy effort. Keep the effort relaxed and check the plan for the day."),
    );

    const response = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "How did my Morning run go?" }],
      poc3: {
        directive: {
          mode: "review",
          allowCalendarWrites: false,
          allowMemoryWrites: true,
          focus: ["schedule", "pace"],
          references: { activityId: "garmin:run-1", day: "2026-11-04" },
          background: "Comment only: check the day's plan.",
          source: "run-peek",
          style: { language: "auto", tone: "supportive" },
        },
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("Keep the effort relaxed");
    expect(body.poc3).toMatchObject({
      sessions: 0,
      memories: 0,
      changes: [],
      changeSetId: null,
      mode: "review",
      writesAllowed: false,
      blockedWrites: 1,
      attempts: 2,
      outcome: "clarified",
      validationCode: null,
    });
    expect(body.poc3.directiveId).toMatch(/^directive:/);
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listChangeSets(USER)).toHaveLength(0);
    expect(handle.store.listCoachDirectives(USER)).toHaveLength(1);
    expect(handle.store.listCoachDirectives(USER)[0]).toMatchObject({
      visible: "How did my Morning run go?",
      blockedWrites: 1,
      directive: { mode: "review", allowCalendarWrites: false },
    });
    expect(model.prompts).toHaveLength(2);
    expect(model.prompts[0]).toContain("Turn directive");
    expect(model.prompts[0]).toContain("calendar writes: forbidden");
    expect(model.prompts[0]).toContain("Referenced context");
    expect(model.prompts[0]).toContain("Morning run");
    expect(model.prompts[0]).toContain("that activity is the exact run the runner's latest message is about");
    expect(model.prompts[1]).toContain("comment-only");
  });

  it("accepts a plain-text comment on a comment-only turn without touching the calendar", async () => {
    const model = queueResponses();
    const { handle, url } = await base(model.fetchImpl);
    model.responses.push(textResponse("Nice easy run. Keep the effort relaxed."));

    const response = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "What do you think?" }],
      poc3: { directive: { mode: "review", allowCalendarWrites: false, source: "composer" } },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).toBe("Nice easy run. Keep the effort relaxed.");
    expect(body.poc3).toMatchObject({
      sessions: 0,
      changes: [],
      changeSetId: null,
      mode: "review",
      writesAllowed: false,
      blockedWrites: 0,
      attempts: 1,
      outcome: "clarified",
    });
    expect(handle.store.listMessages(USER, 10).map((message) => message.text)).toEqual([
      "What do you think?",
      "Nice easy run. Keep the effort relaxed.",
    ]);
    expect(handle.store.listCoachDirectives(USER)).toHaveLength(1);
  });

  it("lets a plan directive write and records the directive", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(
      turn({
        reply: "Booked an easy Friday.",
        memories: [],
        sessions: [{ day: "2026-11-06", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35, note: null }],
      }),
    );

    const response = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "Add an easy run on 2026-11-06." }],
      poc3: {
        directive: {
          mode: "plan",
          allowCalendarWrites: true,
          references: { day: "2026-11-06" },
          source: "day-menu",
        },
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3).toMatchObject({
      sessions: 1,
      mode: "plan",
      writesAllowed: true,
      blockedWrites: 0,
      outcome: "committed",
    });
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(1);
    expect(handle.store.listCoachDirectives(USER)[0]?.blockedWrites).toBe(0);
  });

  it("rejects a missing or foreign reference before calling the model", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    const missing = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "How did my run go?" }],
      poc3: {
        directive: {
          mode: "review",
          allowCalendarWrites: false,
          references: { activityId: "garmin:missing" },
          source: "run-peek",
        },
      },
    });
    expect(missing.status).toBe(404);
    expect(model.prompts).toHaveLength(0);
    expect(handle.store.listMessages(USER, 10)).toHaveLength(0);
    expect(handle.store.listCoachDirectives(USER)).toHaveLength(0);

    handle.store.appendActivity({
      activityId: "garmin:foreign",
      userId: "someone-else",
      day: "2026-11-04",
      title: "Foreign run",
      distanceKm: 5,
      durationMin: 30,
      paceSecPerKm: 360,
      avgHr: 145,
      source: "garmin",
      createdAt: `${TODAY}T00:00:00.000Z`,
    });
    const foreign = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "How did my run go?" }],
      poc3: {
        directive: {
          mode: "review",
          allowCalendarWrites: false,
          references: { activityId: "garmin:foreign" },
          source: "run-peek",
        },
      },
    });
    expect(foreign.status).toBe(404);
    expect(model.prompts).toHaveLength(0);
  });

  it("refuses a replay whose directive differs from the original turn", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(turn({ reply: "Comment only.", memories: [], sessions: [] }));

    const first = await post(url, {
      model: "poc3-coach",
      request_id: "req-directive",
      messages: [{ role: "user", content: "How did my run go?" }],
      poc3: { directive: { mode: "review", allowCalendarWrites: false, source: "run-peek" } },
    });
    expect(first.status).toBe(200);

    const second = await post(url, {
      model: "poc3-coach",
      request_id: "req-directive",
      messages: [{ role: "user", content: "How did my run go?" }],
      poc3: { directive: { mode: "plan", allowCalendarWrites: true, source: "day-menu" } },
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("directive-mismatch");
    expect(model.prompts).toHaveLength(1);
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
  });

  it("drops memories when the directive forbids memory writes", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(turn({ reply: "Noted.", memories: ["Should not be stored"], sessions: [] }));

    const response = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "Comment only." }],
      poc3: {
        directive: {
          mode: "review",
          allowCalendarWrites: false,
          allowMemoryWrites: false,
          source: "composer",
        },
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3).toMatchObject({ memories: 0, sessions: 0, writesAllowed: false });
    expect(handle.store.listMemories(USER, 100)).toHaveLength(0);
  });

  it("rejects an invalid directive before the model call", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    const response = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "Hi" }],
      poc3: { directive: { mode: "review", allowCalendarWrites: "no", source: "run-peek" } },
    });
    expect(response.status).toBe(400);
    expect(model.prompts).toHaveLength(0);
    expect(handle.store.listMessages(USER, 10)).toHaveLength(0);
  });
});

describe("discuss directives", () => {
  const seedChangeSet = (handle: StoreHandle, changeSetId: string, userId = USER): void => {
    handle.store.appendChangeSet({
      changeSetId,
      userId,
      createdAt: `${TODAY}T07:00:00.000Z`,
      summary: "move Long 8 km 2026-11-07 → 2026-11-09",
      entries: [
        {
          action: "update",
          sessionId: "session:b",
          before: null,
          after: null,
          fromDay: "2026-11-07",
          toDay: "2026-11-09",
          title: "Long 8 km",
          kind: "long",
        },
      ],
      revertedAt: null,
    });
  };

  const seedState = (handle: StoreHandle, stateId: string, userId = USER): void => {
    handle.store.appendCoachState({
      stateId,
      userId,
      key: "heat",
      status: "active",
      source: "user",
      confidence: 1,
      evidence: ["Hot week"],
      activatedAt: `${TODAY}T07:00:00.000Z`,
      updatedAt: `${TODAY}T07:00:00.000Z`,
      expiresAt: "2026-11-12T00:00:00.000Z",
      resolvedAt: null,
    });
  };

  const discussChangeDirective = (changeSetId: string): Record<string, unknown> => ({
    mode: "review",
    allowCalendarWrites: false,
    allowMemoryWrites: true,
    references: { changeSetId },
    background:
      "Discuss what the referenced change set did and why the plan moved that way, using its summary and dates. Comment only: the calendar stays unchanged.",
    source: "recent-changes",
    style: { language: "auto", tone: "supportive" },
  });

  const discussStateDirective = (stateId: string): Record<string, unknown> => ({
    mode: "review",
    allowCalendarWrites: false,
    allowMemoryWrites: true,
    references: { stateId },
    background:
      "Discuss how the referenced coaching state should shape the coming week: offer options, not orders, and never diagnose. Comment only: the calendar stays unchanged.",
    source: "state-card",
    style: { language: "auto", tone: "supportive" },
  });

  it("rejects a missing or foreign change set reference before calling the model", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    const missing = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "Why did the plan change?" }],
      poc3: { directive: discussChangeDirective("change:missing") },
    });
    expect(missing.status).toBe(404);
    const missingBody = (await missing.json()) as { error?: { code?: string; detail?: string } };
    expect(missingBody.error?.code).toBe("reference-not-found");
    expect(missingBody.error?.detail).toContain("change:missing");
    expect(model.prompts).toHaveLength(0);
    expect(handle.store.listMessages(USER, 10)).toHaveLength(0);
    expect(handle.store.listCoachDirectives(USER)).toHaveLength(0);

    seedChangeSet(handle, "change:foreign", "someone-else");
    const foreign = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "Why did the plan change?" }],
      poc3: { directive: discussChangeDirective("change:foreign") },
    });
    expect(foreign.status).toBe(404);
    expect(model.prompts).toHaveLength(0);
    expect(handle.store.listCoachDirectives(USER)).toHaveLength(0);
  });

  it("rejects a missing or foreign state reference before calling the model", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    const missing = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "How should this state shape my week?" }],
      poc3: { directive: discussStateDirective("state:missing") },
    });
    expect(missing.status).toBe(404);
    const missingBody = (await missing.json()) as { error?: { code?: string; detail?: string } };
    expect(missingBody.error?.code).toBe("reference-not-found");
    expect(missingBody.error?.detail).toContain("state:missing");
    expect(model.prompts).toHaveLength(0);
    expect(handle.store.listMessages(USER, 10)).toHaveLength(0);

    seedState(handle, "state:foreign", "someone-else");
    const foreign = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "How should this state shape my week?" }],
      poc3: { directive: discussStateDirective("state:foreign") },
    });
    expect(foreign.status).toBe(404);
    expect(model.prompts).toHaveLength(0);
    expect(handle.store.listCoachDirectives(USER)).toHaveLength(0);
  });

  it("discusses a change set comment-only with the referenced rows in the prompt", async () => {
    const model = queueResponses();
    const { handle, url } = await base(model.fetchImpl);
    seedChangeSet(handle, "change:9");
    model.responses.push(
      textResponse(
        "That change moved the long run to Monday so it no longer lands on your race day; the rest of the week is untouched.",
      ),
    );
    const response = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "Why did my long run move?" }],
      poc3: { directive: discussChangeDirective("change:9") },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("moved the long run");
    expect(body.poc3).toMatchObject({
      sessions: 0,
      memories: 0,
      changes: [],
      changeSetId: null,
      mode: "review",
      writesAllowed: false,
      blockedWrites: 0,
      outcome: "clarified",
    });
    expect(model.prompts).toHaveLength(1);
    expect(model.prompts[0]).toContain("Turn directive");
    expect(model.prompts[0]).toContain("references: change set change:9");
    expect(model.prompts[0]).toContain("Discuss what the referenced change set did");
    expect(model.prompts[0]).toContain("This turn is comment-only");
    expect(model.prompts[0]).toContain("Referenced context");
    expect(model.prompts[0]).toContain('"changeSetId":"change:9"');
    expect(model.prompts[0]).toContain("Long 8 km");
    expect(model.prompts[0]).toContain("2026-11-09");
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listChangeSets(USER)).toHaveLength(1);
    expect(handle.store.listCoachDirectives(USER)).toHaveLength(1);
  });

  it("discusses a coaching state comment-only with the referenced rows in the prompt", async () => {
    const model = queueResponses();
    const { handle, url } = await base(model.fetchImpl);
    seedState(handle, "state:heat");
    model.responses.push(
      textResponse(
        "With the heat, I would move the long run to early morning or shorten it by a third and keep the effort easy; your call.",
      ),
    );
    const response = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "How should the heat shape this week?" }],
      poc3: { directive: discussStateDirective("state:heat") },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3).toMatchObject({
      sessions: 0,
      changes: [],
      changeSetId: null,
      mode: "review",
      writesAllowed: false,
      blockedWrites: 0,
      outcome: "clarified",
    });
    expect(model.prompts).toHaveLength(1);
    expect(model.prompts[0]).toContain("references: state state:heat");
    expect(model.prompts[0]).toContain("Discuss how the referenced coaching state should shape the coming week");
    expect(model.prompts[0]).toContain("This turn is comment-only");
    expect(model.prompts[0]).toContain("Referenced context");
    expect(model.prompts[0]).toContain('"stateId":"state:heat"');
    expect(model.prompts[0]).toContain('"key":"heat"');
    expect(model.prompts[0]).toContain("Hot week");
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listCoachDirectives(USER)).toHaveLength(1);
  });

  it("keeps a discuss-change turn comment-only when the model proposes sessions", async () => {
    const model = queueResponses();
    const { handle, url } = await base(model.fetchImpl);
    seedChangeSet(handle, "change:9");
    model.responses.push(
      modelResponse(
        turn({
          reply: "I would book an easy run.",
          memories: [],
          sessions: [{ day: "2026-11-06", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35, note: null }],
        }),
      ),
    );
    model.responses.push(textResponse("The move kept the long run off your race day; nothing else changed."));
    const response = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "Why did my long run move?" }],
      poc3: { directive: discussChangeDirective("change:9") },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.choices[0]?.message.content).toContain("nothing else changed");
    expect(body.poc3).toMatchObject({
      sessions: 0,
      writesAllowed: false,
      blockedWrites: 1,
      attempts: 2,
      outcome: "clarified",
    });
    expect(handle.store.listSessions(USER, TODAY, "2026-12-31")).toHaveLength(0);
    expect(handle.store.listChangeSets(USER)).toHaveLength(1);
    expect(handle.store.listCoachDirectives(USER)[0]?.blockedWrites).toBe(1);
  });

  it("replays a discuss-change turn idempotently with the same directive", async () => {
    const model = queueResponses();
    const { handle, url } = await base(model.fetchImpl);
    seedChangeSet(handle, "change:9");
    model.responses.push(textResponse("It moved the long run past the race."));
    const request = {
      model: "poc3-coach",
      request_id: "req-discuss-change",
      messages: [{ role: "user", content: "Why did my long run move?" }],
      poc3: { directive: discussChangeDirective("change:9") },
    };
    const first = await post(url, request);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as Completion;
    const second = await post(url, request);
    expect(second.status).toBe(200);
    expect(second.headers.get("x-poc3-idempotent-replay")).toBe("true");
    const secondBody = (await second.json()) as Completion;
    expect(secondBody).toEqual(firstBody);
    expect(model.prompts).toHaveLength(1);
    expect(handle.store.listMessages(USER)).toHaveLength(2);
    expect(handle.store.getCoachTurn(USER, "req-discuss-change")).toMatchObject({
      status: "completed",
      outcome: "clarified",
    });
  });
});

describe("coaching states in the gateway", () => {
  it("detects race week and injects it into the prompt", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "race:1", "2026-11-08", "Half marathon", "race");
    model.answers.push(turn({ reply: "Race week noted.", memories: [], sessions: [] }));
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "What should I do this week?" }] });
    expect(response.status).toBe(200);
    expect(model.prompts[0]).toContain("Active coaching states");
    expect(model.prompts[0]).toContain("race_week");
    expect(model.prompts[0]).toContain("Race week");
    const states = handle.store.getActiveCoachStates(USER, "2026-11-05T08:00:00.000Z");
    expect(states.some((state) => state.key === "race_week" && state.source === "auto")).toBe(true);
    const body = (await response.json()) as Completion;
    expect(body.poc3.states).toEqual([]);
    expect(body.poc3.blockedByStates).toEqual([]);
  });

  it("refuses a tempo session in race week and accepts the repaired easy session", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "race:1", "2026-11-07", "Half marathon", "race");
    model.answers.push(
      turn({
        reply: "Tempo booked.",
        memories: [],
        sessions: [{ day: "2026-11-06", title: "Tempo", kind: "tempo", distanceKm: 5, durationMin: 30 }],
      }),
    );
    model.answers.push(
      turn({
        reply: "Easy instead.",
        memories: [],
        sessions: [{ day: "2026-11-06", title: "Easy", kind: "easy", distanceKm: 5, durationMin: 30 }],
      }),
    );
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Book a tempo run Friday" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.attempts).toBe(2);
    expect(body.poc3.sessions).toBe(1);
    expect(body.poc3.validationCode).toBeNull();
    expect(body.poc3.blockedByStates).toEqual([]);
    expect(model.prompts[1]).toContain("active coaching state");
    expect(handle.store.listSessions(USER, "2026-11-06", "2026-11-06").map((session) => session.kind)).toEqual(["easy"]);
  });

  it("falls back without writing when the model keeps the race-week violation", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "race:1", "2026-11-07", "Half marathon", "race");
    const blocked = turn({
      reply: "Tempo booked.",
      memories: [],
      sessions: [{ day: "2026-11-06", title: "Tempo", kind: "tempo", distanceKm: 5, durationMin: 30 }],
    });
    model.answers.push(blocked);
    model.answers.push(blocked);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Book a tempo run Friday" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.validationCode).toBe("mode-guardrail");
    expect(body.poc3.blockedByStates).toEqual(["race_week"]);
    expect(body.poc3.sessions).toBe(0);
    expect(body.choices[0]?.message.content).toContain("coaching state does not allow it");
    expect(handle.store.listSessions(USER, "2026-11-06", "2026-11-06")).toHaveLength(0);
  });

  it("applies an ordinary state proposal and returns the state change", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(
      turn({
        reply: "Travel noted.",
        memories: [],
        sessions: [],
        stateProposals: [
          {
            key: "travel",
            action: "activate",
            confidence: 0.8,
            evidence: ["Travelling to Tokyo"],
            ttlDays: 10,
            note: "Tokyo",
          },
        ],
      }),
    );
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "I am travelling next week" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.states).toHaveLength(1);
    expect(body.poc3.states[0]).toMatchObject({ key: "travel", status: "active", action: "activate" });
    expect(body.poc3.states[0]?.stateId).toMatch(/^state:/);
    const active = handle.store.getActiveCoachStates(USER, "2026-11-05T08:00:00.000Z");
    expect(active.find((state) => state.key === "travel")).toMatchObject({ source: "chat", confidence: 0.8 });
    expect(active.find((state) => state.key === "travel")?.evidence).toContain("Tokyo");
    expect(handle.store.listCoachStateEvents(USER, 10).some((event) => event.action === "activate" && event.key === "travel")).toBe(true);
  });

  it("keeps a sensitive proposal observing until the runner confirms", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(
      turn({
        reply: "I am sorry about the knee. Please see a clinician if it worsens.",
        memories: [],
        sessions: [],
        stateProposals: [
          {
            key: "pain_injury",
            action: "activate",
            confidence: 0.6,
            evidence: ["Knee pain after the run"],
            ttlDays: 14,
            note: null,
          },
        ],
      }),
    );
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "My knee hurts after runs" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.states[0]).toMatchObject({ key: "pain_injury", status: "observing" });
    const active = handle.store.getActiveCoachStates(USER, "2026-11-05T08:00:00.000Z");
    expect(active.find((state) => state.key === "pain_injury")).toMatchObject({ status: "observing", source: "chat" });
  });

  it("blocks easy training while an active user illness state is set and accepts rest", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    handle.store.appendCoachState({
      stateId: "state:illness",
      userId: USER,
      key: "illness",
      status: "active",
      source: "user",
      confidence: 1,
      evidence: ["Fever"],
      activatedAt: "2026-11-05T07:00:00.000Z",
      updatedAt: "2026-11-05T07:00:00.000Z",
      expiresAt: "2026-11-12T00:00:00.000Z",
      resolvedAt: null,
    });
    model.answers.push(
      turn({
        reply: "Easy run booked.",
        memories: [],
        sessions: [{ day: "2026-11-06", title: "Easy", kind: "easy", distanceKm: 5, durationMin: 30 }],
      }),
    );
    model.answers.push(
      turn({
        reply: "Rest instead.",
        memories: [],
        sessions: [{ day: "2026-11-06", title: "Rest", kind: "rest", distanceKm: null, durationMin: null }],
      }),
    );
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "I have a fever" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.attempts).toBe(2);
    expect(body.poc3.sessions).toBe(1);
    expect(body.poc3.validationCode).toBeNull();
    expect(model.prompts[0]).toContain("illness");
    expect(model.prompts[1]).toContain("active coaching state");
    expect(handle.store.listSessions(USER, "2026-11-06", "2026-11-06").map((session) => session.kind)).toEqual(["rest"]);
  });

  it("resolves a state through a proposal", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    handle.store.appendCoachState({
      stateId: "state:heat",
      userId: USER,
      key: "heat",
      status: "active",
      source: "user",
      confidence: 1,
      evidence: ["Hot week"],
      activatedAt: "2026-11-04T07:00:00.000Z",
      updatedAt: "2026-11-04T07:00:00.000Z",
      expiresAt: "2026-11-12T00:00:00.000Z",
      resolvedAt: null,
    });
    model.answers.push(
      turn({
        reply: "Heat resolved.",
        memories: [],
        sessions: [],
        stateProposals: [
          {
            key: "heat",
            action: "resolve",
            confidence: 1,
            evidence: ["Cooler weather"],
            ttlDays: null,
            note: null,
          },
        ],
      }),
    );
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "It is cooler now" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.states[0]).toMatchObject({ key: "heat", status: "resolved", action: "resolve" });
    expect(handle.store.getActiveCoachStates(USER, "2026-11-05T08:00:00.000Z").some((state) => state.key === "heat")).toBe(false);
    expect(handle.store.listCoachStateEvents(USER, 10).some((event) => event.action === "resolve" && event.key === "heat")).toBe(true);
  });

  it("allows a session after the race window even while race week is active", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "race:1", "2026-11-07", "Half marathon", "race");
    model.answers.push(
      turn({
        reply: "Tempo after the race.",
        memories: [],
        sessions: [{ day: "2026-11-10", title: "Tempo", kind: "tempo", distanceKm: 5, durationMin: 30 }],
      }),
    );
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Book a tempo for after the race" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.validationCode).toBeNull();
    expect(body.poc3.sessions).toBe(1);
    expect(handle.store.listSessions(USER, "2026-11-10", "2026-11-10").map((session) => session.kind)).toEqual(["tempo"]);
  });

  it("blocks a race move that would make a tempo session fall inside race week", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "race:1", "2026-11-07", "Half marathon", "race");
    const blocked = turn({
      reply: "Moved the race and booked a tempo.",
      memories: [],
      sessions: [
        {
          action: "update",
          sessionId: "race:1",
          day: "2026-11-10",
          title: "Half marathon",
          kind: "race",
          distanceKm: 21.1,
          durationMin: 120,
          note: null,
        },
        { action: "add", day: "2026-11-08", title: "Tempo", kind: "tempo", distanceKm: 5, durationMin: 30, note: null },
      ],
    });
    model.answers.push(blocked, blocked);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Move the race to Tuesday" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.validationCode).toBe("mode-guardrail");
    expect(body.poc3.blockedByStates).toEqual(["race_week"]);
    expect(handle.store.listSessions(USER, "2026-11-08", "2026-11-08")).toHaveLength(0);
    expect(handle.store.getSession(USER, "race:1")?.day).toBe("2026-11-07");
  });

  it("blocks a revert that would restore a tempo session during injury", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedSession(handle, "tempo:1", "2026-11-06", "Tempo", "tempo");
    const tempo = handle.store.getSession(USER, "tempo:1");
    handle.store.deleteSession(USER, "tempo:1");
    handle.store.appendChangeSet({
      changeSetId: "change:remove-tempo",
      userId: USER,
      createdAt: `${TODAY}T07:00:00.000Z`,
      summary: "Removed tempo",
      entries: [
        {
          action: "remove",
          sessionId: "tempo:1",
          before: tempo ?? null,
          after: null,
          fromDay: "2026-11-06",
          toDay: null,
          title: "Tempo",
          kind: "tempo",
        },
      ],
      revertedAt: null,
    });
    handle.store.appendCoachState({
      stateId: "state:pain",
      userId: USER,
      key: "pain_injury",
      status: "active",
      source: "user",
      confidence: 1,
      evidence: ["Knee pain"],
      activatedAt: `${TODAY}T07:00:00.000Z`,
      updatedAt: `${TODAY}T07:00:00.000Z`,
      expiresAt: "2026-11-20T00:00:00.000Z",
      resolvedAt: null,
    });
    const blocked = turn({
      reply: "Restored the tempo.",
      memories: [],
      sessions: [],
      revertChangeSetId: "change:remove-tempo",
    });
    model.answers.push(blocked, blocked);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Undo removing the tempo" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.validationCode).toBe("mode-guardrail");
    expect(body.poc3.blockedByStates).toEqual(["pain_injury"]);
    expect(handle.store.getSession(USER, "tempo:1")).toBeUndefined();
    expect(handle.store.getChangeSet(USER, "change:remove-tempo")?.revertedAt).toBeNull();
  });

  it("does not let a chat proposal overwrite a runner-set state", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    handle.store.appendCoachState({
      stateId: "state:user-travel",
      userId: USER,
      key: "travel",
      status: "active",
      source: "user",
      confidence: 1,
      evidence: ["Runner: Tokyo"],
      activatedAt: `${TODAY}T07:00:00.000Z`,
      updatedAt: `${TODAY}T07:00:00.000Z`,
      expiresAt: "2026-11-15T00:00:00.000Z",
      resolvedAt: null,
    });
    model.answers.push(
      turn({
        reply: "Travel noted.",
        memories: [],
        sessions: [],
        stateProposals: [{ key: "travel", action: "activate", confidence: 0.5, evidence: ["Model guess"], ttlDays: 3, note: null }],
      }),
    );
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "I am travelling" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.states).toEqual([]);
    expect(handle.store.getCoachState(USER, "state:user-travel")).toMatchObject({
      source: "user",
      confidence: 1,
      evidence: ["Runner: Tokyo"],
    });
  });

  it("keeps state proposals on a comment-only turn as durable context", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    model.answers.push(
      turn({
        reply: "Travel noted; the calendar stays as it is.",
        memories: [],
        sessions: [],
        stateProposals: [
          { key: "travel", action: "activate", confidence: 0.8, evidence: ["Tokyo next week"], ttlDays: 7, note: null },
        ],
      }),
    );
    const response = await post(url, {
      model: "poc3-coach",
      poc3: { directive: { mode: "review", allowCalendarWrites: false, source: "composer" } },
      messages: [{ role: "user", content: "I am travelling next week" }],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.writesAllowed).toBe(false);
    expect(body.poc3.states[0]).toMatchObject({ key: "travel", status: "active" });
    expect(handle.store.getActiveCoachStates(USER, "2026-11-05T08:00:00.000Z").some((state) => state.key === "travel")).toBe(true);
    expect(handle.store.listSessions(USER, "2026-11-05", "2026-11-30")).toHaveLength(0);
  });

  it("keeps a sensitive proposal as a confirmation card when the guardrail forces a fallback", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    const blocked = turn({
      reply: "Pain noted; tempo booked.",
      memories: [],
      sessions: [{ day: "2026-11-06", title: "Tempo", kind: "tempo", distanceKm: 5, durationMin: 30 }],
      stateProposals: [
        { key: "pain_injury", action: "activate", confidence: 0.6, evidence: ["Knee pain"], ttlDays: 14, note: null },
      ],
    });
    model.answers.push(blocked, blocked);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "My knee hurts; book a tempo" }] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Completion;
    expect(body.poc3.validationCode).toBe("mode-guardrail");
    expect(body.poc3.blockedByStates).toEqual(["pain_injury"]);
    expect(body.poc3.states[0]).toMatchObject({ key: "pain_injury", status: "observing" });
    expect(body.choices[0]?.message.content).toContain("coaching state does not allow it");
    expect(handle.store.getActiveCoachStates(USER, "2026-11-05T08:00:00.000Z").find((state) => state.key === "pain_injury")).toMatchObject({
      status: "observing",
      source: "chat",
    });
    expect(handle.store.listSessions(USER, "2026-11-06", "2026-11-06")).toHaveLength(0);
  });

  it("fails the turn claim when state refresh throws before the prompt", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl, { failStateRefresh: true });
    const response = await post(url, {
      model: "poc3-coach",
      request_id: "req-state-refresh-failure",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("gateway-failed");
    expect(handle.store.getCoachTurn(USER, "req-state-refresh-failure")?.status).toBe("failed");
  });
});

describe("muscle check-ins in the gateway", () => {
  const seedCheckIn = (handle: StoreHandle): void => {
    handle.store.appendMuscleCheckIn({
      checkInId: "checkin:1",
      userId: USER,
      day: TODAY,
      activityId: null,
      muscles: [
        { muscleId: "calves", soreness: 6, conditions: ["tight"], side: "left", warmUp: "eases" },
        { muscleId: "quads", soreness: 4, conditions: [], side: "both", warmUp: null },
      ],
      note: "since Thursday's hills",
      createdAt: `${TODAY}T07:00:00.000Z`,
    });
  };

  const reviewMusclesDirective = (muscleId?: string): Record<string, unknown> => ({
    mode: "review",
    allowCalendarWrites: false,
    allowMemoryWrites: true,
    ...(muscleId === undefined ? {} : { references: { muscleId } }),
    background:
      "The runner used the Muscle tab. Read their tags with the check-in guidance and refer warning signs. Comment only.",
    source: "muscle-tab",
    style: { language: "auto", tone: "supportive" },
  });

  it("puts the latest muscle check-in into every prompt", async () => {
    const model = queueModel();
    const { handle, url } = await base(model.fetchImpl);
    seedCheckIn(handle);
    model.answers.push(VALID);
    const response = await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Plan my week" }] });
    expect(response.status).toBe(200);
    expect(model.prompts).toHaveLength(1);
    expect(model.prompts[0]).toContain("Muscle check-in (latest 2026-11-05,");
    expect(model.prompts[0]).toContain("Calves 6/10 tight, left, eases with warm-up");
    expect(model.prompts[0]).toContain("Quads 4/10");
    expect(model.prompts[0]).toContain("since Thursday's hills");
    expect(model.prompts[0]).toContain("1 check-in in the last 14 days");
    expect(model.prompts[0]).toContain("Sharp localized pain, swelling or numbness are not normal soreness");
  });

  it("keeps the muscle block out of prompts when the runner never checked in", async () => {
    const model = queueModel();
    const { url } = await base(model.fetchImpl);
    model.answers.push(VALID);
    await post(url, { model: "poc3-coach", messages: [{ role: "user", content: "Hello" }] });
    expect(model.prompts[0]).not.toContain("Muscle check-in (latest");
  });

  it("resolves a review-muscles directive into the muscle's knowledge and tags", async () => {
    const model = queueResponses();
    const { handle, url } = await base(model.fetchImpl);
    seedCheckIn(handle);
    // A comment-only directive needs a plain-text answer: a write proposal would trigger the repair loop.
    model.responses.push(textResponse("Keep it easy today; an easy spin and calf mobility tomorrow."));
    const response = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "My calves are tight after the tempo — what should I do?" }],
      poc3: { directive: reviewMusclesDirective("calves") },
    });
    expect(response.status).toBe(200);
    expect(model.prompts).toHaveLength(1);
    expect(model.prompts[0]).toContain("Referenced muscle: Calves — group legs");
    expect(model.prompts[0]).toContain("Function: Spring the foot off the ground");
    expect(model.prompts[0]).toContain("The runner's tags for it");
    expect(model.prompts[0]).toContain("2026-11-05: Calves 6/10 tight, left");
    expect(model.prompts[0]).toContain("Comment only");
  });

  it("rejects an unknown muscle reference before calling the model", async () => {
    const model = queueModel();
    const { url } = await base(model.fetchImpl);
    const response = await post(url, {
      model: "poc3-coach",
      messages: [{ role: "user", content: "My nose is sore" }],
      poc3: { directive: reviewMusclesDirective("nose") },
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error?: { code?: string; detail?: string } };
    expect(body.error?.code).toBe("reference-not-found");
    expect(body.error?.detail).toContain("unknown muscle");
    expect(model.prompts).toHaveLength(0);
  });
});

