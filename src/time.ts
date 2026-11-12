/**
 * Calendar-day helpers.
 *
 * A coach turn must use the runner's local day, not the server's UTC day: a booking made at 00:30 in Hong Kong is
 * already "today" there even though the UTC clock still says yesterday. The browser and the gateway share these
 * helpers so the month view, the prompt and the validator all agree on what "today" means.
 */

const FALLBACK_TIME_ZONE = "UTC";

/** Return a valid IANA zone, or UTC when the profile has an unusable value. */
export function safeTimeZone(timeZone: string | undefined): string {
  if (timeZone === undefined || timeZone.trim().length === 0) return FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function parts(instant: string, timeZone: string): Record<string, string> {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid instant: ${instant}`);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const result: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") result[part.type] = part.value;
  }
  return result;
}

/** The local calendar day (`YYYY-MM-DD`) for an instant in an IANA timezone. */
export function localDay(instant: string, timeZone: string): string {
  const value = parts(instant, timeZone);
  return `${value["year"]}-${value["month"]}-${value["day"]}`;
}

/** A compact local timestamp used to date-stamp conversation history in the prompt. */
export function localDateTime(instant: string, timeZone: string): string {
  const value = parts(instant, timeZone);
  return `${value["year"]}-${value["month"]}-${value["day"]} ${value["hour"]}:${value["minute"]}`;
}

/** Add calendar days to a `YYYY-MM-DD` day without involving the server timezone. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The English weekday for a date-only value. */
export function weekday(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}
