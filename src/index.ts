/**
 * Milebook entry point (formerly POC3): the coach gateway (OpenAI-compatible, for the calendar's coach bubble) and the
 * private calendar, sharing one store. The web surface owns accounts; the gateway trusts the internal x-milebook-user
 * header.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createAuth } from "./auth";
import { createGateway } from "./gateway";
import { createStore } from "./store";
import { createWeb } from "./web";

/**
 * Configuration is read under the MILEBOOK_* names; the legacy POC3_* names still work, so existing deployments and
 * runbooks keep running through the rename.
 */
function readEnv(name: string): string | undefined {
  return process.env[`MILEBOOK_${name}`] ?? process.env[`POC3_${name}`];
}

/**
 * New installs default to data/milebook.sqlite. A checkout that still has the legacy data/poc3.sqlite keeps using it,
 * so the rename never orphans a developer's local database.
 */
function defaultDatabaseSpec(): string {
  if (existsSync("data/milebook.sqlite")) return "sqlite:data/milebook.sqlite";
  if (existsSync("data/poc3.sqlite")) return "sqlite:data/poc3.sqlite";
  return "sqlite:data/milebook.sqlite";
}

const gatewayPort = Number(readEnv("GATEWAY_PORT") ?? "8090");
const webPort = Number(readEnv("WEB_PORT") ?? "8091");
const databaseSpec = readEnv("DB") ?? defaultDatabaseSpec();
const userId = readEnv("USER_ID") ?? "demo-runner";
const authSecret = readEnv("AUTH_SECRET") ?? "milebook-dev-secret-change-me";
const maxAttemptsValue = Number(readEnv("MAX_ATTEMPTS") ?? "2");
const maxAttempts = Number.isFinite(maxAttemptsValue) ? Math.max(1, Math.floor(maxAttemptsValue)) : 2;

if (databaseSpec.startsWith("sqlite:")) {
  const location = databaseSpec.slice("sqlite:".length);
  if (location !== ":memory:") mkdirSync(dirname(location), { recursive: true });
}

const handle = createStore(databaseSpec);
const auth = createAuth({ store: handle.store, secret: authSecret });

const gateway = createGateway({
  store: handle.store,
  userId,
  modelBaseUrl: readEnv("MODEL_BASE_URL") ?? "http://192.168.1.202:8102/v1",
  modelApiKey: readEnv("MODEL_API_KEY") ?? "",
  modelName: readEnv("MODEL_NAME") ?? "dgx/general",
  modelId: readEnv("MODEL_ID") ?? "milebook-coach",
  maxAttempts,
  autoStates: readEnv("AUTO_STATES") !== "false",
});

const web = createWeb({
  store: handle.store,
  auth,
  gatewayUrl: readEnv("GATEWAY_URL") ?? "http://127.0.0.1:8090",
  modelId: readEnv("MODEL_ID") ?? "milebook-coach",
  autoStates: readEnv("AUTO_STATES") !== "false",
});

gateway.server.listen(gatewayPort, "127.0.0.1", () => {
  console.log(`milebook gateway: listening on 127.0.0.1:${gatewayPort} (model: ${readEnv("MODEL_NAME") ?? "dgx/general"})`);
});
web.server.listen(webPort, "0.0.0.0", () => {
  console.log(`milebook calendar: listening on 0.0.0.0:${webPort}`);
});

const shutdown = (): void => {
  handle.close();
  gateway.server.close();
  web.server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
