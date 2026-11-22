import { describe, expect, it } from "vitest";

import { createRateLimiter } from "../src/rate-limit";

const fixedClock = (start = 1_000_000) => {
  let current = start;
  return { now: () => current, advance: (ms: number) => { current += ms; } };
};

describe("the failure limiter", () => {
  it("blocks a key once it reaches the limit inside the window", () => {
    const clock = fixedClock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: clock.now });
    expect(limiter.blocked("a")).toBe(false);
    expect(limiter.fail("a")).toBe(1);
    expect(limiter.fail("a")).toBe(2);
    expect(limiter.blocked("a")).toBe(false);
    expect(limiter.fail("a")).toBe(3);
    expect(limiter.blocked("a")).toBe(true);
    expect(limiter.blocked("b")).toBe(false);
  });

  it("forgets a key when its window expires", () => {
    const clock = fixedClock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: clock.now });
    limiter.fail("a");
    limiter.fail("a");
    expect(limiter.blocked("a")).toBe(true);
    clock.advance(9_999);
    expect(limiter.blocked("a")).toBe(true);
    clock.advance(2);
    expect(limiter.blocked("a")).toBe(false);
    expect(limiter.fail("a")).toBe(1);
  });

  it("clears the count after a success", () => {
    const clock = fixedClock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: clock.now });
    limiter.fail("a");
    limiter.fail("a");
    expect(limiter.blocked("a")).toBe(true);
    limiter.reset("a");
    expect(limiter.blocked("a")).toBe(false);
    expect(limiter.fail("a")).toBe(1);
  });

  it("prunes expired windows so an idle process holds no state", () => {
    const clock = fixedClock();
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, now: clock.now });
    limiter.fail("a");
    limiter.fail("b");
    clock.advance(1_001);
    limiter.prune();
    expect(limiter.fail("a")).toBe(1);
    expect(limiter.blocked("b")).toBe(false);
  });

  it("treats a non-positive limit or window as one attempt / one second", () => {
    const clock = fixedClock();
    const limiter = createRateLimiter({ limit: 0, windowMs: 0, now: clock.now });
    expect(limiter.fail("a")).toBe(1);
    expect(limiter.blocked("a")).toBe(true);
    clock.advance(1_001);
    expect(limiter.blocked("a")).toBe(false);
  });
});
