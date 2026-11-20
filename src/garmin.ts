import type { Activity } from "./types";

export interface GarminClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Base URL for the personal API; default https://personal.connectapi.garmin.com */
  baseUrl?: string;
}

export interface GarminClient {
  /** Exchange the personal API key for a 24h JWT; throws GarminError on failure. */
  token(): Promise<string>;
  /** Raw activities from the activity list endpoint (no mapping). */
  listActivities(limit?: number): Promise<unknown[]>;
  /** Raw activity-detail samples for one activity; optional so simple test doubles stay small. */
  getActivityDetails?(activityId: string): Promise<unknown>;
  /** Raw activity summary/laps for one activity; optional so simple test doubles stay small. */
  getActivitySummary?(activityId: string): Promise<unknown>;
  /**
   * The workout an activity followed, from `GET /activity-service/activity/{id}/workouts`; optional so simple test
   * doubles stay small. An empty list means the run followed no planned workout.
   */
  getActivityWorkouts?(activityId: string): Promise<unknown>;
}

/** One computed per-kilometre split from the Garmin activity-detail sample stream. */
export interface ActivitySplit {
  index: number;
  distanceKm: number;
  durationSec: number;
  paceSecPerKm: number;
  avgHr: number | null;
  partial: boolean;
}

/** One Garmin lap or interval summary from the activity summary endpoint. */
export interface ActivityLap {
  index: number;
  type: string;
  distanceKm: number;
  durationSec: number;
  paceSecPerKm: number;
  avgHr: number | null;
  elevationGainM: number | null;
  cadenceSpm: number | null;
}

export class GarminError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Raw response body from Garmin, when there is one; useful for rate-limit diagnostics. */
    readonly body: string = "",
  ) {
    super(message);
    this.name = "GarminError";
  }
}

const DEFAULT_BASE_URL = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const ACTIVITIES_PATH = "/activitylist-service/activities/search/activities";
const ACTIVITY_DETAILS_PATH = "/activity-service/activity";
const DETAILS_QUERY = "?maxChartSize=1000&maxPolylineSize=1000";
const TOKEN_TTL_MS = 20 * 60 * 1000;

interface TokenResponse {
  access_token?: unknown;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

export function createGarminClient(options: GarminClientOptions): GarminClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

  let cachedToken: string | undefined;
  let cachedUntil = 0;

  const token = async (): Promise<string> => {
    const now = Date.now();
    if (cachedToken !== undefined && now < cachedUntil) return cachedToken;

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${TOKEN_PATH}`, {
        method: "POST",
        headers: { Authorization: `ApiKey ${options.apiKey}` },
      });
    } catch (error) {
      throw new GarminError(
        `Garmin token request failed: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GarminError(`Garmin token request failed with status ${response.status}`, response.status, body);
    }

    const text = await response.text();
    let accessToken: unknown;
    try {
      const parsed = JSON.parse(text) as unknown;
      accessToken = record(parsed)?.["access_token"] ?? record(parsed)?.["token"] ?? record(parsed)?.["accessToken"];
    } catch {
      // The personal-api token endpoint answers with a bare JWT (text/plain), not JSON.
      accessToken = text.trim();
    }
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw new GarminError("Garmin token response did not contain an access token", response.status);
    }

    cachedToken = accessToken;
    cachedUntil = now + TOKEN_TTL_MS;
    return accessToken;
  };

  return {
    token,

    async listActivities(limit = 50): Promise<unknown[]> {
      const bearer = await token();
      const url = `${baseUrl}${ACTIVITIES_PATH}?start=0&limit=${limit}`;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${bearer}` },
        });
      } catch (error) {
        throw new GarminError(
          `Garmin activities request failed: ${error instanceof Error ? error.message : String(error)}`,
          0,
        );
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new GarminError(`Garmin activities request failed with status ${response.status}`, response.status, body);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new GarminError("Garmin activities response was not valid JSON", response.status);
      }
      if (!Array.isArray(body)) {
        throw new GarminError("Garmin activities response was not an array", response.status);
      }
      return body;
    },

    async getActivityDetails(activityId: string): Promise<unknown> {
      const bearer = await token();
      const url = `${baseUrl}${ACTIVITY_DETAILS_PATH}/${encodeURIComponent(activityId)}/details${DETAILS_QUERY}`;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${bearer}` },
        });
      } catch (error) {
        throw new GarminError(
          `Garmin activity details request failed: ${error instanceof Error ? error.message : String(error)}`,
          0,
        );
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new GarminError(`Garmin activity details request failed with status ${response.status}`, response.status, body);
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new GarminError("Garmin activity details response was not valid JSON", response.status);
      }
    },

    async getActivitySummary(activityId: string): Promise<unknown> {
      const bearer = await token();
      const url = `${baseUrl}${ACTIVITY_DETAILS_PATH}/${encodeURIComponent(activityId)}`;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${bearer}` },
        });
      } catch (error) {
        throw new GarminError(
          `Garmin activity summary request failed: ${error instanceof Error ? error.message : String(error)}`,
          0,
        );
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new GarminError(`Garmin activity summary request failed with status ${response.status}`, response.status, body);
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new GarminError("Garmin activity summary response was not valid JSON", response.status);
      }
    },

    async getActivityWorkouts(activityId: string): Promise<unknown> {
      const bearer = await token();
      const url = `${baseUrl}${ACTIVITY_DETAILS_PATH}/${encodeURIComponent(activityId)}/workouts`;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${bearer}` },
        });
      } catch (error) {
        throw new GarminError(
          `Garmin activity workouts request failed: ${error instanceof Error ? error.message : String(error)}`,
          0,
        );
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new GarminError(`Garmin activity workouts request failed with status ${response.status}`, response.status, body);
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new GarminError("Garmin activity workouts response was not valid JSON", response.status);
      }
    },
  };
}

function metricNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rounded(value: number | null, digits = 0): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function metricAt(values: readonly unknown[], index: number): number | null {
  if (index < 0 || index >= values.length) return null;
  const value = values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function averageHr(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Map one raw Garmin activity to the Milebook Activity record; undefined when it has no usable day. */
export function mapGarminActivity(activity: unknown, userId: string): Activity | undefined {
  const raw = record(activity);
  if (raw === undefined) return undefined;

  const startTimeLocal = raw.startTimeLocal;
  const day = typeof startTimeLocal === "string" ? startTimeLocal.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;

  const rawId = raw.activityId;
  if (
    rawId === undefined ||
    rawId === null ||
    (typeof rawId !== "string" && typeof rawId !== "number") ||
    String(rawId).length === 0
  ) {
    return undefined;
  }

  const metres = metricNumber(raw.distance) ?? 0;
  const seconds = metricNumber(raw.duration);
  const speed = metricNumber(raw.averageSpeed);
  const hr = metricNumber(raw.averageHR);
  const title = typeof raw.activityName === "string" && raw.activityName.length > 0 ? raw.activityName : "Garmin activity";
  const trainingEffectLabel = typeof raw.trainingEffectLabel === "string" && raw.trainingEffectLabel.length > 0
    ? raw.trainingEffectLabel
    : null;

  return {
    activityId: `garmin:${rawId}`,
    userId,
    day,
    title,
    distanceKm: Math.round(metres / 100) / 10,
    durationMin: seconds === null ? null : Math.round(seconds / 60),
    paceSecPerKm: speed !== null && speed > 0 ? Math.round(1000 / speed) : null,
    avgHr: hr !== null && hr > 0 ? Math.round(hr) : null,
    source: "garmin",
    createdAt: new Date().toISOString(),
    elevationGainM: rounded(metricNumber(raw.elevationGain)),
    elevationLossM: rounded(metricNumber(raw.elevationLoss)),
    calories: rounded(metricNumber(raw.calories)),
    maxHr: rounded(metricNumber(raw.maxHR)),
    cadenceSpm: rounded(metricNumber(raw.averageRunningCadenceInStepsPerMinute)),
    strideLengthCm: rounded(metricNumber(raw.avgStrideLength), 1),
    groundContactMs: rounded(metricNumber(raw.avgGroundContactTime)),
    aerobicTrainingEffect: rounded(metricNumber(raw.aerobicTrainingEffect), 1),
    anaerobicTrainingEffect: rounded(metricNumber(raw.anaerobicTrainingEffect), 1),
    trainingLoad: rounded(metricNumber(raw.activityTrainingLoad), 1),
    trainingEffectLabel,
    fastest1kSec: rounded(metricNumber(raw.fastestSplit_1000)),
    fastest1miSec: rounded(metricNumber(raw.fastestSplit_1609)),
    fastest5kSec: rounded(metricNumber(raw.fastestSplit_5000)),
    hrZone1Sec: rounded(metricNumber(raw.hrTimeInZone_1)),
    hrZone2Sec: rounded(metricNumber(raw.hrTimeInZone_2)),
    hrZone3Sec: rounded(metricNumber(raw.hrTimeInZone_3)),
    hrZone4Sec: rounded(metricNumber(raw.hrTimeInZone_4)),
    hrZone5Sec: rounded(metricNumber(raw.hrTimeInZone_5)),
  };
}

/**
 * Compute per-kilometre splits from Garmin's activity-detail sample stream. The stream carries cumulative distance
 * and duration; each 1,000 m crossing is interpolated, and a final partial kilometre is kept when the run ends
 * between markers. Returns an empty list when the payload has no usable descriptors or samples.
 */
export function mapGarminSplits(detail: unknown): ActivitySplit[] {
  const root = record(detail);
  if (root === undefined) return [];
  const descriptors = Array.isArray(root.metricDescriptors) ? root.metricDescriptors : [];
  const samples = Array.isArray(root.activityDetailMetrics) ? root.activityDetailMetrics : [];
  const indexes = new Map<string, number>();
  for (const descriptor of descriptors) {
    const item = record(descriptor);
    if (item === undefined) continue;
    const key = item.key;
    const index = item.metricsIndex;
    if (typeof key === "string" && typeof index === "number" && Number.isInteger(index) && index >= 0) {
      indexes.set(key, index);
    }
  }
  const distanceIndex = indexes.get("sumDistance");
  const durationIndex = indexes.get("sumDuration");
  const hrIndex = indexes.get("directHeartRate");
  if (distanceIndex === undefined || durationIndex === undefined) return [];

  const splits: ActivitySplit[] = [];
  let splitStartTime = 0;
  let splitStartDistance = 0;
  let splitHr: number[] = [];
  let lastTime = 0;
  let lastDistance = 0;
  let target = 1000;

  for (const sample of samples) {
    const item = record(sample);
    const values = item?.metrics;
    if (!Array.isArray(values)) continue;
    const distance = metricAt(values, distanceIndex);
    const duration = metricAt(values, durationIndex);
    if (distance === null || duration === null || distance < 0 || duration < 0) continue;
    if (distance < lastDistance || duration < lastTime) continue;

    const hr = hrIndex === undefined ? null : metricAt(values, hrIndex);
    if (hr !== null && hr > 0) splitHr.push(hr);

    while (distance >= target) {
      const span = distance - lastDistance;
      const ratio = span <= 0 ? 0 : (target - lastDistance) / span;
      const clamped = Math.max(0, Math.min(1, ratio));
      const crossTime = lastTime + (duration - lastTime) * clamped;
      const splitDuration = crossTime - splitStartTime;
      if (splitDuration > 0) {
        splits.push({
          index: splits.length + 1,
          distanceKm: 1,
          durationSec: Math.round(splitDuration * 10) / 10,
          paceSecPerKm: Math.round(splitDuration),
          avgHr: averageHr(splitHr),
          partial: false,
        });
        if (splits.length >= 100) return splits;
      }
      splitStartTime = crossTime;
      splitStartDistance = target;
      splitHr = [];
      target += 1000;
    }

    lastTime = duration;
    lastDistance = distance;
  }

  if (lastDistance > splitStartDistance) {
    const remainingKm = (lastDistance - splitStartDistance) / 1000;
    const splitDuration = lastTime - splitStartTime;
    if (remainingKm > 0.01 && splitDuration > 0) {
      splits.push({
        index: splits.length + 1,
        distanceKm: Math.round(remainingKm * 100) / 100,
        durationSec: Math.round(splitDuration * 10) / 10,
        paceSecPerKm: Math.round(splitDuration / remainingKm),
        avgHr: averageHr(splitHr),
        partial: true,
      });
    }
  }

  return splits;
}

function lapTypeLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "Lap";
  const labels: Record<string, string> = {
    RWD_RUN: "Run",
    INTERVAL_ACTIVE: "Active",
    INTERVAL_RECOVERY: "Recovery",
    INTERVAL_COOLDOWN: "Cooldown",
    INTERVAL_WARMUP: "Warm-up",
  };
  const known = labels[value];
  if (known !== undefined) return known;
  const humanized = value
    .toLowerCase()
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return humanized.length === 0 ? "Lap" : humanized;
}

/**
 * Map Garmin's own lap/interval summaries. These are separate from the computed per-kilometre splits: a steady run
 * usually has one whole-run lap, while an interval session has active/recovery/cooldown laps.
 */
export function mapGarminLaps(summary: unknown): ActivityLap[] {
  const root = record(summary);
  if (root === undefined) return [];
  const rawLaps = Array.isArray(root.splitSummaries) ? root.splitSummaries : [];
  const laps: ActivityLap[] = [];
  for (const raw of rawLaps) {
    const item = record(raw);
    if (item === undefined) continue;
    const metres = metricNumber(item.distance);
    const duration = metricNumber(item.duration);
    if (metres === null || duration === null || metres <= 0 || duration <= 0) continue;
    laps.push({
      index: laps.length + 1,
      type: lapTypeLabel(item.splitType),
      distanceKm: Math.round((metres / 1000) * 100) / 100,
      durationSec: Math.round(duration * 10) / 10,
      paceSecPerKm: Math.round(duration / (metres / 1000)),
      avgHr: rounded(metricNumber(item.averageHR)),
      elevationGainM: rounded(metricNumber(item.elevationGain)),
      cadenceSpm: rounded(metricNumber(item.averageRunCadence)),
    });
    if (laps.length >= 50) break;
  }
  return laps;
}
