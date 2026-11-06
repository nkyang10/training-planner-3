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
}

export class GarminError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GarminError";
  }
}

const DEFAULT_BASE_URL = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const ACTIVITIES_PATH = "/activitylist-service/activities/search/activities";
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
      throw new GarminError(`Garmin token request failed with status ${response.status}`, response.status);
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
        throw new GarminError(`Garmin activities request failed with status ${response.status}`, response.status);
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
  };
}

/** Map one raw Garmin activity to the POC3 Activity record; undefined when it has no usable day. */
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

  const metres = typeof raw.distance === "number" && Number.isFinite(raw.distance) ? raw.distance : 0;
  const seconds = typeof raw.duration === "number" && Number.isFinite(raw.duration) ? raw.duration : null;
  const speed = typeof raw.averageSpeed === "number" && Number.isFinite(raw.averageSpeed) ? raw.averageSpeed : null;
  const hr = typeof raw.averageHR === "number" && Number.isFinite(raw.averageHR) ? raw.averageHR : null;
  const title = typeof raw.activityName === "string" && raw.activityName.length > 0 ? raw.activityName : "Garmin activity";

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
  };
}
