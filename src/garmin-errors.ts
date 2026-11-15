/**
 * One place for runner-facing Garmin errors. The token endpoint distinguishes a missing header (400) from a
 * rejected key (401), and its rate-limit block body carries retryInSeconds; both are worth saying plainly.
 */
import { GarminError } from "./garmin";

export type GarminErrorContext = "key" | "sync";

interface GarminBlock {
  count?: number;
  limit?: number;
  retryInSeconds?: number;
}

function parseBlock(body: string): GarminBlock | undefined {
  if (body.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    const retry = record["retryInSeconds"];
    if (typeof retry !== "number") return undefined;
    return {
      ...(typeof record["count"] === "number" ? { count: record["count"] } : {}),
      ...(typeof record["limit"] === "number" ? { limit: record["limit"] } : {}),
      retryInSeconds: retry,
    };
  } catch {
    return undefined;
  }
}

function blockMessage(block: GarminBlock): string {
  const retry = block.retryInSeconds ?? 0;
  const stats =
    block.count !== undefined && block.limit !== undefined
      ? ` (${block.count}/${block.limit} requests)`
      : "";
  if (retry < 0) {
    return `Garmin has blocked Personal API token requests for this account/key${stats}. Wait for Garmin to lift the block, or contact Garmin support.`;
  }
  if (retry === 0) {
    return "Garmin is rate-limiting Personal API requests. Try again shortly.";
  }
  const wait = retry >= 120 ? `${Math.ceil(retry / 60)} minutes` : `${retry} seconds`;
  return `Garmin is rate-limiting Personal API requests. Try again in ${wait}.`;
}

function snippet(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
}

export function describeGarminError(error: unknown, context: GarminErrorContext): string {
  const subject = context === "key" ? "that key" : "the saved key";
  if (error instanceof GarminError) {
    const block = parseBlock(error.body);
    if (block !== undefined) return blockMessage(block);
    if (error.status === 401) {
      return context === "key"
        ? "Garmin rejected that key (401). It may be invalid, expired, revoked, or created under a different Garmin account. Check that the full key was copied (it is long and usually starts with GCDC_), then create a fresh Personal API key while signed in to the same Garmin account."
        : "Garmin rejected the saved key (401). It may be invalid, expired, revoked, or from a different Garmin account. Open the Garmin key popup to create a fresh Personal API key.";
    }
    if (error.status === 403) {
      return `Garmin denied access to ${subject} (403). Check that the key is active and belongs to the same Garmin account.`;
    }
    if (error.status === 429) {
      return "Garmin is rate-limiting Personal API requests. Try again in a minute.";
    }
    if (error.status === 0) {
      return "Could not reach Garmin. Check this server's connection and try again.";
    }
    if (error.status >= 500) {
      return `Garmin is unavailable right now (HTTP ${error.status}). Try again later.`;
    }
    const detail = snippet(error.body);
    return detail.length > 0
      ? `Garmin request failed (HTTP ${error.status}): ${detail}`
      : `Garmin request failed (HTTP ${error.status}).`;
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length === 0 ? "Garmin request failed." : message;
  }
  return "Garmin request failed.";
}
