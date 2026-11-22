/**
 * A small in-process failure limiter for the credential and model-spend endpoints.
 *
 * It counts *failures* per key inside a fixed window: a successful sign-in clears the key, so a runner who
 * mistypes once is never locked out, while repeated wrong passwords stop being free. The map is pruned on every
 * write, so an idle process holds no state; the whole limiter is bounded by the number of keys seen in a window.
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
  /** Drop expired windows; called by every write. */
  prune(at?: number): void;
}

export interface RateLimiterOptions {
  /** Failures allowed inside one window before the key is blocked. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  now?: () => number;
}

interface Window {
  failures: number;
  resetAt: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const now = options.now ?? (() => Date.now());
  const windows = new Map<string, Window>();

  const prune = (at: number = now()): void => {
    for (const [key, window] of windows) {
      if (window.resetAt <= at) windows.delete(key);
    }
  };

  const current = (key: string, at: number): Window => {
    const existing = windows.get(key);
    if (existing !== undefined && existing.resetAt > at) return existing;
    const fresh: Window = { failures: 0, resetAt: at + windowMs };
    windows.set(key, fresh);
    return fresh;
  };

  return {
    blocked(key) {
      const at = now();
      const window = windows.get(key);
      if (window === undefined) return false;
      if (window.resetAt <= at) {
        windows.delete(key);
        return false;
      }
      return window.failures >= limit;
    },
    fail(key) {
      const at = now();
      prune(at);
      const window = current(key, at);
      window.failures += 1;
      return window.failures;
    },
    reset(key) {
      windows.delete(key);
    },
    prune,
  };
}
