import { describe, expect, it } from "vitest";
import { createOpenWebUiCalendar, OpenWebUiCalendarError } from "../src/openwebui-calendar";

const BASE = "http://webui.test";
const calls: Array<{ url: string; method: string; body?: string }> = [];

function fakeFetch(): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, ...(typeof init?.body === "string" ? { body: init.body } : {}) });
    if (url.endsWith("/api/v1/auths/signin")) {
      return new Response(JSON.stringify({ token: "jwt-1" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/api/v1/calendars/")) {
      return new Response(JSON.stringify([{ id: "cal-1", name: "Personal", is_default: true }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/v1/calendars/events?start=")) {
      return new Response(JSON.stringify([{ id: "event-a", meta: { poc3_session_id: "session:a" } }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/api/v1/calendars/events/create")) {
      return new Response(JSON.stringify({ id: "event-b" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/api/v1/calendars/events/event-a/delete")) {
      return new Response(JSON.stringify({ status: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/api/v1/calendars/events/event-a/update")) {
      return new Response(JSON.stringify({ id: "event-a" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("Open WebUI native calendar mirror", () => {
  it("creates a new event and updates an existing one, using nanosecond all-day timestamps", async () => {
    calls.length = 0;
    const mirror = createOpenWebUiCalendar({
      baseUrl: BASE,
      email: "owner@example.com",
      password: "secret",
      timezoneOffset: "+08:00",
      fetchImpl: fakeFetch(),
    });
    const result = await mirror.ensureEvents([
      { sessionId: "session:a", day: "2026-11-10", title: "Easy 5 km", description: "Conversational", kind: "easy" },
      { sessionId: "session:b", day: "2026-11-12", title: "Intervals", description: "6 x 400 m", kind: "interval" },
    ]);
    expect(result).toEqual({ created: 1, updated: 1, skipped: 0 });

    const signin = calls.find((call) => call.url.endsWith("/api/v1/auths/signin"));
    expect(signin?.method).toBe("POST");
    expect(JSON.parse(signin?.body ?? "{}")).toMatchObject({ email: "owner@example.com" });

    const create = calls.find((call) => call.url.endsWith("/api/v1/calendars/events/create"));
    const payload = JSON.parse(create?.body ?? "{}") as Record<string, unknown>;
    expect(payload["calendar_id"]).toBe("cal-1");
    expect(payload["title"]).toBe("Intervals");
    expect(payload["all_day"]).toBe(true);
    expect(payload["start_at"]).toBe(Date.parse("2026-11-12T00:00:00+08:00") * 1_000_000);
    expect((payload["meta"] as Record<string, unknown>)["poc3_session_id"]).toBe("session:b");

    const update = calls.find((call) => call.url.includes("/event-a/update"));
    expect(JSON.parse(update?.body ?? "{}")).toMatchObject({ title: "Easy 5 km", calendar_id: "cal-1" });
  });

  it("rejects an invalid day before calling Open WebUI", async () => {
    const mirror = createOpenWebUiCalendar({
      baseUrl: BASE,
      email: "owner@example.com",
      password: "secret",
      fetchImpl: fakeFetch(),
    });
    await expect(
      mirror.ensureEvents([{ sessionId: "session:c", day: "not-a-day", title: "Run", description: "", kind: "easy" }]),
    ).rejects.toBeInstanceOf(OpenWebUiCalendarError);
  });
});

describe("stale native event pruning", () => {
  it("deletes native events whose session is no longer in POC3", async () => {
    calls.length = 0;
    const mirror = createOpenWebUiCalendar({
      baseUrl: BASE,
      email: "owner@example.com",
      password: "secret",
      fetchImpl: fakeFetch(),
    });
    const deleted = await mirror.prune?.(["session:other"]);
    expect(deleted).toBe(1);
    expect(calls.some((call) => call.url.includes("/event-a/delete") && call.method === "DELETE")).toBe(true);
    const kept = await mirror.prune?.(["session:a"]);
    expect(kept).toBe(0);
  });
});

