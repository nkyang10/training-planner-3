import { describe, expect, it } from "vitest";

import { createLogger, parseLogLevel, silentLogger } from "../src/log";

interface Line {
  ts: string;
  level: string;
  event: string;
  [key: string]: unknown;
}

function collector(level: "debug" | "info" | "warn" | "error" | "silent" = "debug"): { lines: Line[]; logger: ReturnType<typeof createLogger> } {
  const lines: Line[] = [];
  const logger = createLogger({
    level,
    now: () => new Date("2026-11-23T02:00:00.000Z"),
    sink: (line) => lines.push(JSON.parse(line) as Line),
  });
  return { lines, logger };
}

describe("logger", () => {
  it("writes one JSON line with a fixed shape", () => {
    const { lines, logger } = collector();
    logger.info("http.request", { method: "GET", path: "/calendar", status: 200 });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      ts: "2026-11-23T02:00:00.000Z",
      level: "info",
      event: "http.request",
      method: "GET",
      path: "/calendar",
      status: 200,
    });
  });

  it("drops lines below the configured level", () => {
    const { lines, logger } = collector("warn");
    logger.debug("debug.event");
    logger.info("info.event");
    logger.warn("warn.event");
    logger.error("error.event");

    expect(lines.map((line) => line.event)).toEqual(["warn.event", "error.event"]);
  });

  it("redacts credential-shaped field names without inspecting values", () => {
    const { lines, logger } = collector();
    logger.info("garmin.key.saved", {
      apiKey: "garmin-secret-value",
      password: "hunter2",
      authorization: "Bearer abc",
      cookie: "milebook_session=...",
      internalToken: "shared-secret",
      status: "ok",
    });

    const line: Line = lines[0] ?? { ts: "", level: "", event: "" };
    expect(line["apiKey"]).toBe("[redacted]");
    expect(line["password"]).toBe("[redacted]");
    expect(line["authorization"]).toBe("[redacted]");
    expect(line["cookie"]).toBe("[redacted]");
    expect(line["internalToken"]).toBe("[redacted]");
    expect(line["status"]).toBe("ok");
    expect(JSON.stringify(line)).not.toContain("garmin-secret-value");
  });

  it("truncates a long value instead of logging a payload", () => {
    const { lines, logger } = collector();
    logger.warn("coach.failed", { detail: "x".repeat(1000) });
    const detail = String(lines[0]?.["detail"] ?? "");
    expect(detail.length).toBeLessThanOrEqual(301);
    expect(detail.endsWith("…")).toBe(true);
  });

  it("carries child bindings on every line", () => {
    const { lines, logger } = collector();
    const child = logger.child({ component: "web", requestId: "req-1" });
    child.info("first");
    child.error("second", { status: 500 });

    expect(lines[0]).toMatchObject({ component: "web", requestId: "req-1", event: "first" });
    expect(lines[1]).toMatchObject({ component: "web", requestId: "req-1", event: "second", status: 500 });
  });

  it("survives a field that cannot be serialized", () => {
    const { lines, logger } = collector();
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    logger.error("bad.field", { circular });

    expect(lines[0]).toMatchObject({ level: "error", event: "bad.field", logError: "unserializable fields" });
  });

  it("parses the level, defaulting to info", () => {
    expect(parseLogLevel("debug")).toBe("debug");
    expect(parseLogLevel(" WARN ")).toBe("warn");
    expect(parseLogLevel("silent")).toBe("silent");
    expect(parseLogLevel(undefined)).toBe("info");
    expect(parseLogLevel("verbose")).toBe("info");
  });

  it("writes nothing when silent", () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "silent", sink: (line) => lines.push(line) });
    logger.error("never");
    silentLogger.error("never");
    expect(lines).toHaveLength(0);
  });
});
