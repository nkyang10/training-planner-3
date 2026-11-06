/**
 * Mirror the coach's planned sessions into Open WebUI's native Calendar.
 *
 * Open WebUI already ships a month/week/day calendar with reminders. Rather than forking its frontend or iframing it,
 * POC3 writes each booked session as an all-day event on the user's default calendar through the documented API
 * (`/api/v1/calendars/...`). The coach stays the source of truth; the native calendar is a view of it.
 */
export interface OpenWebUiCalendarOptions {
  baseUrl: string;
  email: string;
  password: string;
  /** Local offset used for all-day events, e.g. "+08:00". Defaults to the server's offset. */
  timezoneOffset?: string;
  fetchImpl?: typeof fetch;
}

export interface CalendarEventDraft {
  sessionId: string;
  day: string;
  title: string;
  description: string;
  kind: string;
}

export interface CalendarMirrorResult {
  created: number;
  updated: number;
  skipped: number;
}

export interface CalendarMirror {
  ensureEvents(events: readonly CalendarEventDraft[]): Promise<CalendarMirrorResult>;
  /** Delete the native events that mirror the given POC3 session ids; returns how many were deleted. */
  removeEvents(sessionIds: readonly string[]): Promise<number>;
  /** Delete native events whose session no longer exists in POC3 (stale mirrors); returns how many were deleted. */
  prune?(validSessionIds: readonly string[]): Promise<number>;
}

export class OpenWebUiCalendarError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OpenWebUiCalendarError";
  }
}

interface CalendarRecord {
  id: string;
  name: string;
  is_default?: boolean;
}

interface EventRecord {
  id: string;
  meta?: Record<string, unknown> | null;
}

const TOKEN_TTL_MS = 50 * 60 * 1000;

function localMidnightNs(day: string, offset: string): number {
  const millis = Date.parse(`${day}T00:00:00${offset}`);
  if (Number.isNaN(millis)) throw new OpenWebUiCalendarError(`invalid day: ${day}`, 0);
  return millis * 1_000_000;
}

export function createOpenWebUiCalendar(options: OpenWebUiCalendarOptions): CalendarMirror {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const offset = options.timezoneOffset ?? "+08:00";
  let token = "";
  let tokenAt = 0;
  let calendarId: string | undefined;

  const request = async (path: string, init: RequestInit = {}, retry = true): Promise<Response> => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token.length === 0 ? {} : { authorization: `Bearer ${token}` }),
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
    });
    if (response.status === 401 && retry) {
      token = "";
      await signIn();
      return request(path, init, false);
    }
    return response;
  };

  const signIn = async (): Promise<void> => {
    const response = await fetchImpl(`${baseUrl}/api/v1/auths/signin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: options.email, password: options.password }),
    });
    if (!response.ok) throw new OpenWebUiCalendarError(`Open WebUI sign-in answered ${response.status}`, response.status);
    const body = (await response.json()) as { token?: unknown };
    if (typeof body.token !== "string" || body.token.length === 0) {
      throw new OpenWebUiCalendarError("Open WebUI sign-in returned no token", response.status);
    }
    token = body.token;
    tokenAt = Date.now();
  };

  const ensureToken = async (): Promise<void> => {
    if (token.length === 0 || Date.now() - tokenAt > TOKEN_TTL_MS) await signIn();
  };

  const ensureCalendar = async (): Promise<string> => {
    if (calendarId !== undefined) return calendarId;
    const response = await request("/api/v1/calendars/");
    if (!response.ok) throw new OpenWebUiCalendarError(`Open WebUI calendars answered ${response.status}`, response.status);
    const calendars = (await response.json()) as CalendarRecord[];
    const chosen = calendars.find((calendar) => calendar.is_default === true) ?? calendars[0];
    if (chosen === undefined) throw new OpenWebUiCalendarError("Open WebUI has no calendar", 404);
    calendarId = chosen.id;
    return calendarId;
  };

  const listEvents = async (fromDay: string, toDay: string): Promise<EventRecord[]> => {
    const response = await request(
      `/api/v1/calendars/events?start=${encodeURIComponent(`${fromDay}T00:00:00`)}&end=${encodeURIComponent(`${toDay}T23:59:59`)}`,
    );
    if (!response.ok) throw new OpenWebUiCalendarError(`Open WebUI events answered ${response.status}`, response.status);
    return (await response.json()) as EventRecord[];
  };

  const removeByIds = async (sessionIds: readonly string[]): Promise<number> => {
    if (sessionIds.length === 0) return 0;
    await ensureToken();
    const today = new Date();
    const from = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 120 * 86_400_000).toISOString().slice(0, 10);
    const existing = await listEvents(from, to);
    const wanted = new Set(sessionIds);
    let deleted = 0;
    for (const event of existing) {
      const sessionId = event.meta?.["poc3_session_id"];
      if (typeof sessionId !== "string" || !wanted.has(sessionId)) continue;
      const response = await request(`/api/v1/calendars/events/${encodeURIComponent(event.id)}/delete`, { method: "DELETE" });
      if (response.ok) deleted += 1;
    }
    return deleted;
  };

  const pruneStale = async (validSessionIds: readonly string[]): Promise<number> => {
    await ensureToken();
    const today = new Date();
    const from = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 180 * 86_400_000).toISOString().slice(0, 10);
    const existing = await listEvents(from, to);
    const valid = new Set(validSessionIds);
    let deleted = 0;
    for (const event of existing) {
      const sessionId = event.meta?.["poc3_session_id"];
      if (typeof sessionId !== "string" || valid.has(sessionId)) continue;
      const response = await request(`/api/v1/calendars/events/${encodeURIComponent(event.id)}/delete`, { method: "DELETE" });
      if (response.ok) deleted += 1;
    }
    return deleted;
  };

  return {
    removeEvents: removeByIds,
    prune: pruneStale,
    async ensureEvents(events: readonly CalendarEventDraft[]): Promise<CalendarMirrorResult> {
      if (events.length === 0) return { created: 0, updated: 0, skipped: 0 };
      for (const event of events) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(event.day)) throw new OpenWebUiCalendarError(`invalid day: ${event.day}`, 0);
      }
      await ensureToken();
      const calendar = await ensureCalendar();
      const days = events.map((event) => event.day).sort();
      const first = days[0] ?? "";
      const last = days[days.length - 1] ?? "";
      // An update may move a session: the old native event can sit outside the new day range, so list a generous window
      // around both today and the drafted days. Duplicate native events for one session are collapsed to the newest.
      const today = new Date().toISOString().slice(0, 10);
      const shift = (day: string, delta: number): string =>
        new Date(Date.parse(`${day}T00:00:00.000Z`) + delta * 86_400_000).toISOString().slice(0, 10);
      const from = shift(first < today ? first : today, -90);
      const to = shift(last > today ? last : today, 180);
      const existing = await listEvents(from, to);
      const bySession = new Map<string, string[]>();
      for (const event of existing) {
        const sessionId = event.meta?.["poc3_session_id"];
        if (typeof sessionId !== "string") continue;
        const list = bySession.get(sessionId) ?? [];
        list.push(event.id);
        bySession.set(sessionId, list);
      }
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const event of events) {
        const start = localMidnightNs(event.day, offset);
        const payload = {
          calendar_id: calendar,
          title: event.title,
          description: event.description,
          start_at: start,
          end_at: start + 86_400_000_000_000,
          all_day: true,
          meta: { source: "poc3-coach", poc3_session_id: event.sessionId, kind: event.kind },
        };
        const existingIds = bySession.get(event.sessionId) ?? [];
        const existingId = existingIds[0];
        if (existingId === undefined) {
          const response = await request("/api/v1/calendars/events/create", { method: "POST", body: JSON.stringify(payload) });
          if (!response.ok) throw new OpenWebUiCalendarError(`Open WebUI create answered ${response.status}`, response.status);
          created += 1;
        } else {
          const response = await request(`/api/v1/calendars/events/${encodeURIComponent(existingId)}/update`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new OpenWebUiCalendarError(`Open WebUI update answered ${response.status}`, response.status);
          // If a previous mirror left duplicates, delete all but the one just updated.
          for (const duplicateId of existingIds.slice(1)) {
            await request(`/api/v1/calendars/events/${encodeURIComponent(duplicateId)}/delete`, { method: "DELETE" });
          }
          updated += 1;
        }
      }
      skipped += events.length - created - updated;
      return { created, updated, skipped };
    },
  };
}
