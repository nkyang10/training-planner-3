import { describe, expect, it, vi } from "vitest";
import { createGarminClient, GarminError, mapGarminActivity } from "../src/garmin";

const BASE = "https://garmin.test";
const TOKEN_URL = `${BASE}/personalapitoken-service/personal-api/personal-api-key/token`;
const ACTIVITIES_URL = `${BASE}/activitylist-service/activities/search/activities?start=0&limit=2`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createGarminClient", () => {
  it("exchanges the API key at the exact token URL and caches the token", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ access_token: "jwt-abc" }));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    await expect(client.token()).resolves.toBe("jwt-abc");
    await expect(client.token()).resolves.toBe("jwt-abc");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(TOKEN_URL);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe("ApiKey personal-key");
  });

  it("lists activities with the bearer token and requested limit", async () => {
    const activities = [{ activityId: 900001 }, { activityId: 900002 }];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "jwt-abc" }))
      .mockResolvedValueOnce(jsonResponse(activities));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    await expect(client.listActivities(2)).resolves.toEqual(activities);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe(ACTIVITIES_URL);
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jwt-abc");
  });

  it("throws GarminError with the upstream status on a non-2xx token response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("denied", { status: 401 }));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    await expect(client.token()).rejects.toBeInstanceOf(GarminError);
    await expect(client.token()).rejects.toMatchObject({ name: "GarminError", status: 401 });
  });

  it("throws GarminError with the upstream status on a non-2xx activities response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "jwt-abc" }))
      .mockResolvedValueOnce(new Response("boom", { status: 503 }));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    await expect(client.listActivities(2)).rejects.toMatchObject({ name: "GarminError", status: 503 });
  });
});

describe("mapGarminActivity", () => {
  it("maps metres, seconds, pace, heart rate, and the idempotent id", () => {
    const raw = {
      activityId: 900001,
      activityName: "Morning Run",
      startTimeLocal: "2026-11-05 06:30:00",
      distance: 5432,
      duration: 1800,
      averageSpeed: 2.7777778,
      averageHR: 150,
    };

    const activity = mapGarminActivity(raw, "runner-1");

    expect(activity).toMatchObject({
      activityId: "garmin:900001",
      userId: "runner-1",
      day: "2026-11-05",
      title: "Morning Run",
      distanceKm: 5.4,
      durationMin: 30,
      paceSecPerKm: 360,
      avgHr: 150,
      source: "garmin",
    });
    expect(new Date(activity!.createdAt).toISOString()).toBe(activity!.createdAt);
    expect(mapGarminActivity(raw, "runner-1")?.activityId).toBe("garmin:900001");
  });

  it("still maps a zero-distance activity, with null pace and heart rate", () => {
    const activity = mapGarminActivity(
      {
        activityId: 900002,
        startTimeLocal: "2026-11-05 07:00:00",
        distance: 0,
        duration: 0,
        averageSpeed: 0,
        averageHR: 0,
      },
      "runner-1",
    );

    expect(activity).toMatchObject({
      activityId: "garmin:900002",
      title: "Garmin activity",
      distanceKm: 0,
      durationMin: 0,
      paceSecPerKm: null,
      avgHr: null,
    });
  });

  it("returns undefined for an invalid day or a missing activity id", () => {
    expect(
      mapGarminActivity(
        { activityId: 900003, startTimeLocal: "2026/11/05 06:30:00", distance: 1000, duration: 300 },
        "runner-1",
      ),
    ).toBeUndefined();
    expect(
      mapGarminActivity({ startTimeLocal: "2026-11-05 06:30:00", distance: 1000, duration: 300 }, "runner-1"),
    ).toBeUndefined();
  });
});

describe("Garmin token response variants", () => {
  it("accepts the bare JWT the personal-api endpoint actually returns", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("eyJhbGciOiJSUzI1NiJ9.payload.signature", { status: 200, headers: { "Content-Type": "text/plain" } }),
    );
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });
    await expect(client.token()).resolves.toBe("eyJhbGciOiJSUzI1NiJ9.payload.signature");
  });
});

