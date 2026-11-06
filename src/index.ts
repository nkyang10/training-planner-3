/**
 * POC3 entry point: the coach gateway (OpenAI-compatible, for Open WebUI) and the private calendar, sharing one store.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createGarminClient } from "./garmin";
import { createOpenWebUiCalendar } from "./openwebui-calendar";
import { createGateway } from "./gateway";
import { createStore } from "./store";
import { createWeb } from "./web";

const gatewayPort = Number(process.env["POC3_GATEWAY_PORT"] ?? "8090");
const webPort = Number(process.env["POC3_WEB_PORT"] ?? "8091");
const databaseSpec = process.env["POC3_DB"] ?? "sqlite:data/poc3.sqlite";
const userId = process.env["POC3_USER_ID"] ?? "demo-runner";
const tokens = JSON.parse(process.env["POC3_TOKENS"] ?? '{"demo-token":"demo-runner"}') as Record<string, string>;
const garminKey = process.env["GARMIN_PERSONAL_API_KEY"];

if (databaseSpec.startsWith("sqlite:")) {
  const location = databaseSpec.slice("sqlite:".length);
  if (location !== ":memory:") mkdirSync(dirname(location), { recursive: true });
}

const handle = createStore(databaseSpec);
const garmin = garminKey === undefined || garminKey.length === 0 ? undefined : createGarminClient({ apiKey: garminKey });

const openWebUiUrl = process.env["OPENWEBUI_URL"];
const openWebUiEmail = process.env["OPENWEBUI_EMAIL"];
const openWebUiPassword = process.env["OPENWEBUI_PASSWORD"];
const calendarMirror =
  openWebUiUrl === undefined || openWebUiEmail === undefined || openWebUiPassword === undefined
    ? undefined
    : createOpenWebUiCalendar({
        baseUrl: openWebUiUrl,
        email: openWebUiEmail,
        password: openWebUiPassword,
        ...(process.env["POC3_TIMEZONE_OFFSET"] === undefined ? {} : { timezoneOffset: process.env["POC3_TIMEZONE_OFFSET"] }),
      });

const gateway = createGateway({
  store: handle.store,
  userId,
  modelBaseUrl: process.env["POC3_MODEL_BASE_URL"] ?? "http://192.168.1.202:8102/v1",
  modelApiKey: process.env["POC3_MODEL_API_KEY"] ?? "",
  modelName: process.env["POC3_MODEL_NAME"] ?? "dgx/general",
  modelId: process.env["POC3_MODEL_ID"] ?? "poc3-coach",
  calendarUrl: process.env["POC3_CALENDAR_URL"] ?? "http://127.0.0.1:8091/calendar",
  ...(calendarMirror === undefined ? {} : { calendarMirror }),
});

const web = createWeb({
  store: handle.store,
  tokens,
  gatewayUrl: process.env["POC3_GATEWAY_URL"] ?? "http://127.0.0.1:8090",
  modelId: process.env["POC3_MODEL_ID"] ?? "poc3-coach",
  chatUrl: process.env["POC3_CHAT_URL"] ?? "",
  ...(garmin === undefined ? {} : { garmin }),
});

gateway.server.listen(gatewayPort, "127.0.0.1", () => {
  console.log(`poc3 gateway: listening on 127.0.0.1:${gatewayPort} (model: ${process.env["POC3_MODEL_NAME"] ?? "dgx/general"})`);
});
web.server.listen(webPort, "0.0.0.0", () => {
  console.log(`poc3 calendar: listening on 0.0.0.0:${webPort}`);
});

const shutdown = (): void => {
  handle.close();
  gateway.server.close();
  web.server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
