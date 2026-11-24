/**
 * A small in-process failure limiter for the credential and model-spend endpoints.
 *
 * It counts *failures* per key inside a fixed window: a successful sign-in clears the key, so a runner who
 * mistypes once is never locked out, while repeated wrong passwords stop being free. Expired windows are pruned on
 * write (a large map at most once a second), and the map has a hard key ceiling, so a stream of distinct names cannot
 * grow the process without bound.
 *
 * Single-process by design: the app is one Node process per database (see docs/LIMITS.md). A multi-process
 * deployment must move this state to the shared store.
 */
export interface RateLimiter {
  /** True while the key is at or over its failure budget for the current window. */
  blocked(key: string): boolean;
  /** Record one failed attempt and return the failure count for the current window. */
  fail(key: string): number;
  /** Clear a key after a successful attempt. */
  reset(key: string): void;
  /** Drop expired windows immediately; writes also prune a large map at most once a second. */
  prune(at?: number): void;
  /** How many windows are currently held; exposed so a test can prove the map is bounded. */
  size(): number;
}

export interface RateLimiterOptions {
  /** Failures allowed inside one window before the key is blocked. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Hard cap on retained windows; the oldest is evicted first. Defaults to 10 000. */
  maxKeys?: number;
  now?: () => number;
}

interface Window {
  failures: number;
  resetAt: number;
}

/** A caller passes an attacker-influenced key (a username, a user id); only this much of it is retained. */
const MAX_KEY_CHARS = 128;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  // A key is attacker-controlled (it carries the attempted username), so the map needs a hard ceiling as well as a
  // time window: without one, a stream of distinct long usernames grows the process for as long as the window lasts.
  const maxKeys = Math.max(1, Math.floor(options.maxKeys ?? 10_000));
  const now = options.now ?? (() => Date.now());
  const windows = new Map<string, Window>();
  const bounded = (key: string): string => (key.length > MAX_KEY_CHARS ? key.slice(0, MAX_KEY_CHARS) : key);

  const prune = (at: number = now()): void => {
    for (const [key, window] of windows) {
      if (window.resetAt <= at) windows.delete(key);
    }
  };

  /**
   * Every write used to scan the whole map, which is O(n) once an attacker has filled it. A small map is cheap to scan
   * on each write; a large one is pruned at most once a second (the explicit `prune()` still scans immediately).
   */
  let lastPruneAt = 0;
  const maybePrune = (at: number): void => {
    if (windows.size < 256 || at - lastPruneAt < 1_000) return;
    lastPruneAt = at;
    prune(at);
  };

  const current = (key: string, at: number): Window => {
    const existing = windows.get(key);
    if (existing !== undefined && existing.resetAt > at) return existing;
    // Insertion order is the eviction order: the oldest key goes first once the ceiling is reached.
    if (!windows.has(key)) {
      while (windows.size >= maxKeys) {
        const oldest = windows.keys().next().value;
        if (oldest === undefined) break;
        windows.delete(oldest);
      }
    }
    const fresh: Window = { failures: 0, resetAt: at + windowMs };
    windows.set(key, fresh);
    return fresh;
  };

  return {
    blocked(rawKey) {
      const key = bounded(rawKey);
      const at = now();
      const window = windows.get(key);
      if (window === undefined) return false;
      if (window.resetAt <= at) {
        windows.delete(key);
        return false;
      }
      return window.failures >= limit;
    },
    fail(rawKey) {
      const key = bounded(rawKey);
      const at = now();
      maybePrune(at);
      const window = current(key, at);
      window.failures += 1;
      return window.failures;
    },
    reset(rawKey) {
      windows.delete(bounded(rawKey));
    },
    prune,
    size() {
      return windows.size;
    },
  };
}
