import { randomUUID } from "node:crypto";

import { GarminError, mapGarminActivity, type GarminClient } from "./garmin";
import { describeGarminError } from "./garmin-errors";
import type { Activity, AppNotification, Store } from "./types";

export interface GarminSyncOptions {
  store: Store;
  /** The runner's own client, or undefined when no Garmin key is saved. */
  clientFor(userId: string): GarminClient | undefined;
  now?: () => string;
  limit?: number;
}

export interface GarminSyncOutcome {
  /** Activities in the 90-day window that were processed (new or updated). */
  imported: number;
  /** Activities that did not exist before this sync; drives success notifications. */
  created: number;
  /** Newest newly created activity, or null when the sync found nothing new. */
  newest: Activity | null;
  error: string | null;
}

export interface GarminSyncCallOptions {
  /** Explicit manual/key syncs confirm "no new activities"; automatic checks stay silent. */
  notifyWhenUnchanged?: boolean;
}

export interface GarminSync {
  sync(userId: string, today: string, options?: GarminSyncCallOptions): Promise<GarminSyncOutcome>;
  syncInBackground(userId: string, today: string): void;
  idle(): Promise<void>;
}

const DEFAULT_LIMIT = 100;
const WINDOW_DAYS = 90;

const EMPTY: GarminSyncOutcome = { imported: 0, created: 0, newest: null, error: null };

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function notification(
  userId: string,
  status: AppNotification["status"],
  title: string,
  body: string,
  href: string,
  createdAt: string,
): AppNotification {
  return {
    notificationId: randomUUID(),
    userId,
    source: "garmin",
    status,
    title,
    body,
    href,
    createdAt,
    readAt: null,
  };
}

function errorHref(error: unknown): string {
  return error instanceof GarminError && (error.status === 401 || error.status === 403)
    ? "/calendar?garmin=setup"
    : "/history";
}

function unchangedNotification(userId: string, imported: number, createdAt: string): AppNotification {
  const body =
    imported === 0
      ? "No Garmin activities found in the last 90 days."
      : `${imported} ${imported === 1 ? "activity" : "activities"} checked; nothing new.`;
  return notification(userId, "success", "Garmin sync: no new activities", body, "/history", createdAt);
}

export function createGarminSync(options: GarminSyncOptions): GarminSync {
  const now = options.now ?? (() => new Date().toISOString());
  const limit =
    options.limit !== undefined && Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(options.limit))
      : DEFAULT_LIMIT;
  const inFlight = new Map<string, Promise<GarminSyncOutcome>>();
  const tasks = new Set<Promise<GarminSyncOutcome>>();

  const run = async (userId: string, today: string): Promise<GarminSyncOutcome> => {
    const client = options.clientFor(userId);
    if (client === undefined) return EMPTY;

    try {
      const raw = await client.listActivities(limit);
      const fromDay = shiftDay(today, -(WINDOW_DAYS - 1));
      let imported = 0;
      let created = 0;
      let newest: Activity | null = null;

      for (const item of raw) {
        const mapped = mapGarminActivity(item, userId);
        if (mapped === undefined || mapped.day < fromDay || mapped.day > today) continue;
        const isNew = options.store.getActivity(userId, mapped.activityId) === undefined;
        options.store.appendActivity(mapped);
        imported += 1;
        if (isNew) {
          created += 1;
          if (
            newest === null ||
            mapped.day > newest.day ||
            (mapped.day === newest.day && mapped.createdAt > newest.createdAt)
          ) {
            newest = mapped;
          }
        }
      }

      const at = now();
      options.store.recordSync(userId, at);
      if (created > 0 && newest !== null) {
        const title = `Garmin sync: ${created} new ${created === 1 ? "activity" : "activities"}`;
        const checked = `${imported} ${imported === 1 ? "activity" : "activities"} checked`;
        const body =
          created === 1
            ? `${newest.title} was added to your calendar (${checked}).`
            : `${created} new activities were added, including ${newest.title} (${checked}).`;
        options.store.appendNotification(
          notification(userId, "success", title, body, `/calendar?month=${newest.day.slice(0, 7)}`, at),
        );
      }
      return { imported, created, newest, error: null };
    } catch (error) {
      const at = now();
      options.store.recordSync(userId, at);
      const message = describeGarminError(error, "sync");
      options.store.appendNotification(
        notification(userId, "error", "Garmin sync failed", message, errorHref(error), at),
      );
      return { imported: 0, created: 0, newest: null, error: message };
    }
  };

  const sync = async (
    userId: string,
    today: string,
    callOptions: GarminSyncCallOptions = {},
  ): Promise<GarminSyncOutcome> => {
    const confirmUnchanged = callOptions.notifyWhenUnchanged === true;
    const existing = inFlight.get(userId);
    if (existing !== undefined) {
      const outcome = await existing;
      if (confirmUnchanged && outcome.error === null && outcome.created === 0) {
        options.store.appendNotification(unchangedNotification(userId, outcome.imported, now()));
      }
      return outcome;
    }

    const task = run(userId, today);
    inFlight.set(userId, task);
    tasks.add(task);
    void task.finally(() => {
      if (inFlight.get(userId) === task) inFlight.delete(userId);
      tasks.delete(task);
    });

    if (!confirmUnchanged) return task;
    const outcome = await task;
    if (outcome.error === null && outcome.created === 0) {
      options.store.appendNotification(unchangedNotification(userId, outcome.imported, now()));
    }
    return outcome;
  };

  const syncInBackground = (userId: string, today: string): void => {
    void sync(userId, today);
  };

  const idle = async (): Promise<void> => {
    while (tasks.size > 0) await Promise.all([...tasks]);
  };

  return { sync, syncInBackground, idle };
}
