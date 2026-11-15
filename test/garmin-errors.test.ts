import { describe, expect, it } from "vitest";

import { GarminError } from "../src/garmin";
import { describeGarminError } from "../src/garmin-errors";

describe("describeGarminError", () => {
  it("explains a 401 as an invalid, expired, revoked, or wrong-account key", () => {
    const keyMessage = describeGarminError(
      new GarminError("Garmin token request failed with status 401", 401),
      "key",
    );
    expect(keyMessage).toContain("invalid, expired, revoked");
    expect(keyMessage).toContain("different Garmin account");
    expect(keyMessage).toContain("GCDC_");

    const syncMessage = describeGarminError(
      new GarminError("Garmin token request failed with status 401", 401),
      "sync",
    );
    expect(syncMessage).toContain("saved key");
    expect(syncMessage).toContain("Open the Garmin key popup");
  });

  it("surfaces a Garmin rate-limit block body with its counters", () => {
    const message = describeGarminError(
      new GarminError("Garmin token request failed with status 429", 429, '{"count":6589,"limit":100,"retryInSeconds":-1}'),
      "sync",
    );
    expect(message).toContain("blocked");
    expect(message).toContain("6589/100");
    expect(message).toContain("Garmin support");
  });

  it("converts a positive retryInSeconds into a wait", () => {
    const message = describeGarminError(
      new GarminError("Garmin token request failed with status 429", 429, '{"retryInSeconds":30}'),
      "key",
    );
    expect(message).toContain("30 seconds");
  });

  it("keeps an unfamiliar response body for diagnosis", () => {
    const message = describeGarminError(
      new GarminError("Garmin token request failed with status 400", 400, '{"error":"Authentication missing","status":400}'),
      "key",
    );
    expect(message).toContain("HTTP 400");
    expect(message).toContain("Authentication missing");
  });

  it("handles network and non-Garmin failures", () => {
    expect(describeGarminError(new GarminError("offline", 0), "sync")).toContain("Could not reach Garmin");
    expect(describeGarminError(new Error("socket closed"), "sync")).toBe("socket closed");
    expect(describeGarminError("nope", "sync")).toBe("Garmin request failed.");
  });
});
