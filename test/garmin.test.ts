import { describe, expect, it, vi } from "vitest";
import { createGarminClient, GarminError, mapGarminActivity, mapGarminLaps, mapGarminSplits } from "../src/garmin";

const BASE = "https://garmin.test";
const TOKEN_URL = `${BASE}/personalapitoken-service/personal-api/personal-api-key/token`;
const ACTIVITIES_URL = `${BASE}/activitylist-service/activities/search/activities?start=0&limit=2`;
const DETAILS_URL = `${BASE}/activity-service/activity/900001/details?maxChartSize=1000&maxPolylineSize=1000`;
const SUMMARY_URL = `${BASE}/activity-service/activity/900001`;
const WORKOUTS_URL = `${BASE}/activity-service/activity/900001/workouts`;

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

  it("fetches activity details with the bearer token", async () => {
    const details = { metricDescriptors: [], activityDetailMetrics: [] };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "jwt-abc" }))
      .mockResolvedValueOnce(jsonResponse(details));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    await expect(client.getActivityDetails?.("900001")).resolves.toEqual(details);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe(DETAILS_URL);
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jwt-abc");
  });

  it("fetches the activity summary with the bearer token", async () => {
    const summary = { splitSummaries: [] };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "jwt-abc" }))
      .mockResolvedValueOnce(jsonResponse(summary));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    await expect(client.getActivitySummary?.("900001")).resolves.toEqual(summary);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe(SUMMARY_URL);
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jwt-abc");
  });

  it("fetches the activity workouts with the bearer token", async () => {
    const workouts = [{ stepIndex: 1, intensity: "WARMUP", durationType: "TIME", durationValue: 600 }];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "jwt-abc" }))
      .mockResolvedValueOnce(jsonResponse(workouts));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    await expect(client.getActivityWorkouts?.("900001")).resolves.toEqual(workouts);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1]!;
    expect(url).toBe(WORKOUTS_URL);
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jwt-abc");
  });

  it("throws GarminError with the upstream status on a workouts failure", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "jwt-abc" }))
      .mockResolvedValueOnce(new Response("denied", { status: 403 }));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    await expect(client.getActivityWorkouts?.("900001")).rejects.toMatchObject({
      name: "GarminError",
      status: 403,
      body: "denied",
    });
  });

  it("throws GarminError with the upstream status and body on a non-2xx token response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("denied", { status: 401 }));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    const error: unknown = await client.token().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GarminError);
    expect(error).toMatchObject({ name: "GarminError", status: 401, body: "denied" });
  });

  it("throws GarminError with the upstream status and body on a non-2xx activities response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "jwt-abc" }))
      .mockResolvedValueOnce(new Response("boom", { status: 503 }));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    await expect(client.listActivities(2)).rejects.toMatchObject({ name: "GarminError", status: 503, body: "boom" });
  });

  it("captures the token endpoint's rate-limit body", async () => {
    const body = '{"count":6589,"limit":100,"retryInSeconds":-1}';
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 429 }));
    const client = createGarminClient({ apiKey: "personal-key", fetchImpl, baseUrl: BASE });

    await expect(client.token()).rejects.toMatchObject({ name: "GarminError", status: 429, body });
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

  it("maps the richer Garmin list metrics and fastest splits", () => {
    const raw = {
      activityId: 900004,
      activityName: "Tempo Run",
      startTimeLocal: "2026-11-12 18:00:00",
      distance: 6100,
      duration: 2100,
      averageSpeed: 2.9,
      averageHR: 162,
      maxHR: 175,
      elevationGain: 12.3,
      elevationLoss: 8.2,
      calories: 348,
      averageRunningCadenceInStepsPerMinute: 172.86,
      avgStrideLength: 110.94,
      avgGroundContactTime: 250.6,
      aerobicTrainingEffect: 3.14,
      anaerobicTrainingEffect: 0.8,
      activityTrainingLoad: 92.62,
      trainingEffectLabel: "AEROBIC_BASE",
      fastestSplit_1000: 293.86,
      fastestSplit_1609: 491.15,
      fastestSplit_5000: 1557.17,
      hrTimeInZone_1: 120,
      hrTimeInZone_2: 600,
      hrTimeInZone_3: 300,
      hrTimeInZone_4: 0,
      hrTimeInZone_5: 0,
    };

    expect(mapGarminActivity(raw, "runner-1")).toMatchObject({
      elevationGainM: 12,
      elevationLossM: 8,
      calories: 348,
      maxHr: 175,
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
      hrZone1Sec: 120,
      hrZone2Sec: 600,
      hrZone3Sec: 300,
      hrZone4Sec: 0,
      hrZone5Sec: 0,
    });
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

describe("mapGarminSplits", () => {
  const detail = {
    metricDescriptors: [
      { metricsIndex: 0, key: "sumDistance" },
      { metricsIndex: 1, key: "sumDuration" },
      { metricsIndex: 2, key: "directHeartRate" },
    ],
    activityDetailMetrics: [
      { metrics: [0, 0, 100] },
      { metrics: [500, 150, 110] },
      { metrics: [1000, 300, 120] },
      { metrics: [1500, 480, 130] },
      { metrics: [1800, 600, 140] },
    ],
  };

  it("computes full-kilometre splits plus a partial final split", () => {
    const splits = mapGarminSplits(detail);
    expect(splits).toHaveLength(2);
    expect(splits[0]).toMatchObject({
      index: 1,
      distanceKm: 1,
      durationSec: 300,
      paceSecPerKm: 300,
      avgHr: 110,
      partial: false,
    });
    expect(splits[1]).toMatchObject({
      index: 2,
      distanceKm: 0.8,
      durationSec: 300,
      paceSecPerKm: 375,
      avgHr: 135,
      partial: true,
    });
  });

  it("returns an empty list when the payload has no usable descriptors", () => {
    expect(mapGarminSplits({ metricDescriptors: [], activityDetailMetrics: [] })).toEqual([]);
    expect(mapGarminSplits({})).toEqual([]);
  });

  it("keeps splits without heart-rate samples", () => {
    const splits = mapGarminSplits({
      metricDescriptors: [
        { metricsIndex: 0, key: "sumDistance" },
        { metricsIndex: 1, key: "sumDuration" },
      ],
      activityDetailMetrics: [
        { metrics: [0, 0] },
        { metrics: [1000, 300] },
      ],
    });
    expect(splits).toHaveLength(1);
    expect(splits[0]?.avgHr).toBeNull();
  });
});

describe("mapGarminLaps", () => {
  it("maps interval laps with labels, distance, pace, HR and cadence", () => {
    const laps = mapGarminLaps({
      splitSummaries: [
        {
          splitType: "INTERVAL_ACTIVE",
          distance: 1000,
          duration: 300,
          averageHR: 160,
          elevationGain: 4,
          averageRunCadence: 180,
        },
        {
          splitType: "INTERVAL_RECOVERY",
          distance: 500,
          duration: 200,
          averageHR: 130,
        },
      ],
    });

    expect(laps).toHaveLength(2);
    expect(laps[0]).toMatchObject({
      index: 1,
      type: "Active",
      distanceKm: 1,
      durationSec: 300,
      paceSecPerKm: 300,
      avgHr: 160,
      elevationGainM: 4,
      cadenceSpm: 180,
    });
    expect(laps[1]).toMatchObject({
      index: 2,
      type: "Recovery",
      distanceKm: 0.5,
      durationSec: 200,
      paceSecPerKm: 400,
      avgHr: 130,
    });
  });

  it("labels a steady whole-run lap and unknown split types", () => {
    const laps = mapGarminLaps({
      splitSummaries: [
        { splitType: "RWD_RUN", distance: 5400, duration: 1800, averageHR: 145 },
        { splitType: "CUSTOM_LAP", distance: 1000, duration: 320, averageHR: 150 },
      ],
    });

    expect(laps.map((lap) => lap.type)).toEqual(["Run", "Custom Lap"]);
  });

  it("returns an empty list for missing or invalid summaries", () => {
    expect(mapGarminLaps({ splitSummaries: [] })).toEqual([]);
    expect(mapGarminLaps({})).toEqual([]);
    expect(mapGarminLaps({ splitSummaries: [{ splitType: "RWD_RUN", distance: 0, duration: 300 }] })).toEqual([]);
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

