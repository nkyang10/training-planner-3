import { randomUUID } from "node:crypto";

import { GarminError, mapGarminActivity, type GarminClient } from "./garmin";
import { describeGarminError } from "./garmin-errors";
import { failedGarminWorkout, mapGarminWorkout } from "./garmin-workout";
import type { Activity, AppNotification, Store } from "./types";

export interface GarminSyncOptions {
  store: Store;
  /** The runner's own client, or undefined when no Garmin key is saved. */
  clientFor(userId: string): GarminClient | undefined;
  now?: () => string;
  limit?: number;
  /** How many workout lookups one sync may make; the activity sync never waits on a failure. */
  workoutFetchLimit?: number;
  /** A failed workout lookup is retried on later syncs up to this many attempts, then left alone. */
  maxWorkoutAttempts?: number;
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
const DEFAULT_WORKOUT_FETCH_LIMIT = 3;
const DEFAULT_MAX_WORKOUT_ATTEMPTS = 2;
const WINDOW_DAYS = 90;

const EMPTY: GarminSyncOutcome = { imported: 0, created: 0, newest: null, error: null };

/** The bare Garmin id behind a stored POC3 activity id, or "" for a reported activity. */
function garminActivityId(activityId: string): string {
  return activityId.startsWith("garmin:") ? activityId.slice("garmin:".length) : "";
}

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
  const workoutFetchLimit =
    options.workoutFetchLimit !== undefined && Number.isFinite(options.workoutFetchLimit)
      ? Math.max(0, Math.floor(options.workoutFetchLimit))
      : DEFAULT_WORKOUT_FETCH_LIMIT;
  const maxWorkoutAttempts =
    options.maxWorkoutAttempts !== undefined && Number.isFinite(options.maxWorkoutAttempts)
      ? Math.max(1, Math.floor(options.maxWorkoutAttempts))
      : DEFAULT_MAX_WORKOUT_ATTEMPTS;
  const inFlight = new Map<string, Promise<GarminSyncOutcome>>();
  const tasks = new Set<Promise<GarminSyncOutcome>>();

  /**
   * Fetch the workout a run followed for a few activities per sync. This is a read-only overlay: the activity rows are
   * already stored, the batch is capped, and every failure is kept as a retryable row instead of an error.
   */
  const enrichWorkouts = async (
    client: GarminClient,
    userId: string,
    fromDay: string,
    toDay: string,
  ): Promise<void> => {
    const fetchWorkouts = client.getActivityWorkouts;
    if (fetchWorkouts === undefined || workoutFetchLimit === 0) return;
    const candidates = options.store.listWorkoutCandidates(
      userId,
      fromDay,
      toDay,
      workoutFetchLimit,
      maxWorkoutAttempts,
    );
    for (const candidate of candidates) {
      const garminId = garminActivityId(candidate.activity.activityId);
      if (garminId.length === 0) continue;
      const at = now();
      try {
        const raw = await fetchWorkouts.call(client, garminId);
        options.store.saveActivityWorkout(mapGarminWorkout(raw, candidate.activity, at));
      } catch (error) {
        if (error instanceof GarminError && error.status === 404) {
          // A 404 is Garmin saying this activity has no planned workout; a confirmed "none" ends the retries.
          options.store.saveActivityWorkout(mapGarminWorkout([], candidate.activity, at));
        } else {
          options.store.saveActivityWorkout(
            failedGarminWorkout(candidate.activity, candidate.attempts + 1, at),
          );
        }
      }
    }
  };

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

      try {
        await enrichWorkouts(client, userId, fromDay, today);
      } catch {
        // The activity rows are already committed; a workout overlay must never turn a good sync into a failure.
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
