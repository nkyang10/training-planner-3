/**
 * Structured JSON logs.
 *
 * One line per event, so a log file can be read by a human and by `jq` without a parser. The shape is stable:
 * `{ ts, level, event, ...fields }`, plus any bindings a child logger adds.
 *
 * Two rules keep the log safe to keep around: field names that look like credentials are redacted by name (the value is
 * never inspected, so a renamed key still cannot leak), and long values are truncated, so a stray payload cannot turn one
 * request into a megabyte of log.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/** Names whose value is replaced by `[redacted]`; the match is case-insensitive and substring-based. */
const SECRET_NAME = /pass|secret|token|key|authorization|cookie|session/i;
const MAX_VALUE_LENGTH = 300;

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  /** A logger that adds fixed fields to every line, e.g. the component name. */
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  /** Lines below this level are dropped. Default `info`. */
  readonly level?: LogLevel;
  /** Where a finished line goes. Default `process.stdout.write`. */
  readonly sink?: (line: string) => void;
  /** Clock, injected so a test can pin the timestamp. */
  readonly now?: () => Date;
}

/** Read `MILEBOOK_LOG_LEVEL`; an unknown value falls back to `info` rather than silencing the log. */
export function parseLogLevel(value: string | undefined): LogLevel {
  const candidate = (value ?? "").trim().toLowerCase();
  if (candidate === "debug" || candidate === "info" || candidate === "warn" || candidate === "error" || candidate === "silent") {
    return candidate;
  }
  return "info";
}

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (SECRET_NAME.test(name)) {
      safe[name] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.length > MAX_VALUE_LENGTH) {
      safe[name] = `${value.slice(0, MAX_VALUE_LENGTH)}…`;
      continue;
    }
    safe[name] = value;
  }
  return safe;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const threshold = LEVEL_WEIGHT[level];
  const sink = options.sink ?? ((line: string): void => void process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => new Date());

  const write = (bindings: Record<string, unknown>, lineLevel: LogLevel) => (event: string, fields: Record<string, unknown> = {}): void => {
    if (LEVEL_WEIGHT[lineLevel] < threshold) return;
    const record = {
      ts: now().toISOString(),
      level: lineLevel,
      event,
      ...redact(bindings),
      ...redact(fields),
    };
    let serialized: string;
    try {
      serialized = JSON.stringify(record);
    } catch {
      // A field that cannot be serialized must not take the request down with it.
      serialized = JSON.stringify({ ts: record.ts, level: lineLevel, event, logError: "unserializable fields" });
    }
    sink(serialized);
  };

  const make = (bindings: Record<string, unknown>): Logger => ({
    debug: write(bindings, "debug"),
    info: write(bindings, "info"),
    warn: write(bindings, "warn"),
    error: write(bindings, "error"),
    child: (extra) => make({ ...bindings, ...extra }),
  });

  return make({});
}

/** A logger that drops everything; the default in tests and for a `silent` level. */
export const silentLogger: Logger = createLogger({ level: "silent" });
