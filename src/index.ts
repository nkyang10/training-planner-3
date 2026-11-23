/**
 * Milebook entry point: the coach gateway (OpenAI-compatible, for the calendar's coach bubble) and the private
 * calendar, sharing one store. The web surface owns accounts; the gateway trusts the internal x-milebook-user header
 * and the shared internal token that only this process and the web surface know.
 *
 * Configuration is read under the MILEBOOK_* names. Production fails closed: a missing auth secret or model
 * endpoint stops the process instead of starting with a development default.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { createAuth } from "./auth";
import { createGateway } from "./gateway";
import { createStore } from "./store";
import { createSecretBox, parseSecretKey } from "./secrets";
import { createLogger, parseLogLevel } from "./log";
import { createWeb } from "./web";

/**
 * Load a `.env` file for keys that are not already in the environment. Real environment variables win, so a service
 * manager or container can override a file without editing it. The format is deliberately small: `KEY=VALUE` lines,
 * `#` comments, optional surrounding quotes; no expansion, no multi-line values.
 */
function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(".env");

function readEnv(name: string): string | undefined {
  const value = process.env[`MILEBOOK_${name}`];
  return value === undefined || value.trim().length === 0 ? undefined : value.trim();
}

/** A required setting; the process refuses to start rather than silently using a development value. */
function requireEnv(name: string, hint: string): string {
  const value = readEnv(name);
  if (value === undefined) throw new Error(`MILEBOOK_${name} is required: ${hint}`);
  return value;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = readEnv(name);
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function readPort(name: string, fallback: number): number {
  const value = readEnv(name);
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`MILEBOOK_${name} must be a port number, got ${JSON.stringify(value)}`);
  }
  return port;
}

const gatewayPort = readPort("GATEWAY_PORT", 8090);
const webPort = readPort("WEB_PORT", 8091);
const databaseSpec = readEnv("DB") ?? "sqlite:data/milebook.sqlite";
const userId = readEnv("DEFAULT_USER") ?? "system";
const authSecret = requireEnv("AUTH_SECRET", "generate one with `node -e \"console.log(require('node:crypto').randomBytes(32).toString('hex'))\"`");
if (authSecret.length < 32) {
  throw new Error("MILEBOOK_AUTH_SECRET must be at least 32 characters: it signs every session cookie");
}
const modelBaseUrl = requireEnv("MODEL_BASE_URL", "the OpenAI-compatible base URL, e.g. http://127.0.0.1:8102/v1");
const modelName = requireEnv("MODEL_NAME", "the model id to request, e.g. dgx/general");
const maxAttemptsValue = Number(readEnv("MAX_ATTEMPTS") ?? "2");
const maxAttempts = Number.isFinite(maxAttemptsValue) ? Math.max(1, Math.floor(maxAttemptsValue)) : 2;
/**
 * Shared secret between the web surface and the gateway. Generated per start when not supplied, so a restart
 * rotates it and a stray process cannot impersonate the web surface on the gateway port.
 */
const internalToken = readEnv("INTERNAL_TOKEN") ?? randomBytes(32).toString("hex");
/** Session cookies carry Secure when the deployment terminates TLS (directly or through a proxy). */
const cookieSecure = readBoolean("COOKIE_SECURE", false);
const autoStates = readBoolean("AUTO_STATES", true);

if (databaseSpec.startsWith("sqlite:")) {
  const location = databaseSpec.slice("sqlite:".length);
  if (location !== ":memory:") mkdirSync(dirname(location), { recursive: true });
}
if (databaseSpec.startsWith("sqlite:") && !existsSync(databaseSpec.slice("sqlite:".length)) && databaseSpec !== "sqlite::memory:") {
  console.log(`milebook: creating a new database at ${databaseSpec.slice("sqlite:".length)}`);
}

/**
 * At-rest sealing for Garmin keys. Without a key the store keeps plaintext and the boot log says so; with one, every
 * legacy row is sealed during store construction, so a stale plaintext key never survives a restart.
 */
const garminKeyRaw = readEnv("GARMIN_KEY");
const secretBox = garminKeyRaw === undefined ? undefined : createSecretBox(parseSecretKey(garminKeyRaw));
if (secretBox === undefined) {
  console.warn("milebook: MILEBOOK_GARMIN_KEY is not set; Garmin API keys are stored as plaintext in the database");
}

const handle = createStore(databaseSpec, secretBox === undefined ? {} : { secretBox });
if (handle.migrations.applied.length > 0) {
  console.log(
    `milebook: schema ${handle.migrations.from} -> ${handle.migrations.to} (${handle.migrations.applied.join("; ")})`,
  );
}
const log = createLogger({ level: parseLogLevel(readEnv("LOG_LEVEL")) });
const auth = createAuth({ store: handle.store, secret: authSecret, secureCookies: cookieSecure });

const gateway = createGateway({
  store: handle.store,
  userId,
  modelBaseUrl,
  modelApiKey: readEnv("MODEL_API_KEY") ?? "",
  modelName,
  modelId: readEnv("MODEL_ID") ?? "milebook-coach",
  maxAttempts,
  autoStates,
  internalToken,
  logger: log.child({ component: "gateway" }),
});

const web = createWeb({
  store: handle.store,
  auth,
  gatewayUrl: readEnv("GATEWAY_URL") ?? `http://127.0.0.1:${gatewayPort}`,
  gatewayToken: internalToken,
  modelId: readEnv("MODEL_ID") ?? "milebook-coach",
  autoStates,
  cookieSecure,
  logger: log.child({ component: "web" }),
});

gateway.server.listen(gatewayPort, "127.0.0.1", () => {
  console.log(`milebook gateway: listening on 127.0.0.1:${gatewayPort} (model: ${modelName})`);
  log.info("boot", { component: "gateway", port: gatewayPort, model: modelName, logLevel: parseLogLevel(readEnv("LOG_LEVEL")) });
});
web.server.listen(webPort, "0.0.0.0", () => {
  console.log(`milebook calendar: listening on 0.0.0.0:${webPort}`);
  log.info("boot", { component: "web", port: webPort });
});

let shuttingDown = false;
const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`milebook: ${signal} received, draining`);
  const deadline = setTimeout(() => process.exit(1), 15_000);
  deadline.unref();
  handle.close();
  gateway.server.close();
  web.server.close(() => {
    clearTimeout(deadline);
    process.exit(0);
  });
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("milebook: unhandled rejection", reason);
});
process.on("uncaughtException", (error) => {
  console.error("milebook: uncaught exception", error);
  shutdown("uncaughtException");
});
