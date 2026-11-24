import type { IncomingMessage } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  AuthError,
  createAuth,
  type Auth,
  type AuthUser,
} from "../src/auth";
import { createStore } from "../src/store";
import type { Store } from "../src/types";

const handles: Array<ReturnType<typeof createStore>> = [];

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
});

interface Harness {
  auth: Auth;
  store: Store;
  setNow(value: string): void;
}

function start(initialNow = "2026-01-01T00:00:00.000Z"): Harness {
  const handle = createStore(":memory:");
  handles.push(handle);
  let current = new Date(initialNow);
  return {
    auth: createAuth({
      store: handle.store,
      secret: "unit-test-secret",
      now: () => current,
    }),
    store: handle.store,
    setNow(value: string) {
      current = new Date(value);
    },
  };
}

function cookieFrom(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

function tokenFrom(setCookie: string): string {
  const pair = cookieFrom(setCookie);
  const separator = pair.indexOf("=");
  return separator < 0 ? "" : pair.slice(separator + 1);
}

function request(cookie?: string): IncomingMessage {
  const headers: { cookie?: string } = {};
  if (cookie !== undefined) headers.cookie = cookie;
  return { headers } as unknown as IncomingMessage;
}

/** The auth surface is async now (scrypt runs on the thread pool), so the helper awaits the action it is given. */
async function catchAuthError(action: () => Promise<unknown>): Promise<AuthError> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AuthError);
  if (!(caught instanceof AuthError)) throw new Error("expected an AuthError");
  return caught;
}

function tamperToken(token: string, part: 0 | 1): string {
  const pieces = token.split(".");
  const target = pieces[part];
  if (target === undefined || target.length === 0) throw new Error("token part is missing");
  // Change a middle character: the unused trailing bits of a base64url group can make a last-character edit decode
  // to the same bytes, which would make this tamper check pass or fail depending on the random user id.
  const index = Math.floor(target.length / 2);
  const replacement = target[index] === "A" ? "B" : "A";
  pieces[part] = target.slice(0, index) + replacement + target.slice(index + 1);
  return pieces.join(".");
}

function payloadOf(setCookie: string): { userId: string; exp: number } {
  const encoded = tokenFrom(setCookie).split(".")[0] ?? "";
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    userId: string;
    exp: number;
  };
}

const SIGNUP = {
  username: "Alice_99",
  password: "correct-horse-battery",
  displayName: "Alice Runner",
  timezone: "Asia/Hong_Kong",
  goal: "Run a half marathon",
};

describe("signup and login", () => {
  it("creates a normalized account, hashes the password and restores the session", async () => {
    const { auth, store } = start();
    const signup = await auth.signup({ ...SIGNUP, displayName: "  Alice Runner  " });

    expect(signup.user).toMatchObject({
      username: "alice_99",
      displayName: "Alice Runner",
      timezone: "Asia/Hong_Kong",
      goal: "Run a half marathon",
    });
    expect(signup.user.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(signup.cookie.startsWith(`${AUTH_COOKIE_NAME}=`)).toBe(true);
    expect(signup.cookie).toContain("Path=/");
    expect(signup.cookie).toContain("HttpOnly");
    expect(signup.cookie).toContain("SameSite=Lax");
    expect(signup.cookie).toContain(`Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`);

    const stored = store.getUserByUsername("ALICE_99");
    expect(stored?.passwordHash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(stored?.passwordHash).not.toContain(SIGNUP.password);

    expect(auth.read(request(cookieFrom(signup.cookie)))).toEqual(signup.user);
    expect(auth.read(request(cookieFrom(auth.setCookie(signup.user))))).toEqual(signup.user);

    const login = await auth.login({ username: "ALICE_99", password: SIGNUP.password });
    expect(login.user).toEqual(signup.user);
    expect(auth.read(request(cookieFrom(login.cookie)))).toEqual(signup.user);
  });

  it("accepts dots, hyphens, at-signs and uppercase, folding the name to lowercase", async () => {
    const { auth, store } = start();
    const signup = await auth.signup({ ...SIGNUP, username: "Case.User-1@Corp" });

    expect(signup.user.username).toBe("case.user-1@corp");
    expect(store.getUserByUsername("CASE.USER-1@CORP")?.userId).toBe(signup.user.userId);

    const login = await auth.login({ username: "CASE.USER-1@CORP", password: SIGNUP.password });
    expect(login.user).toEqual(signup.user);
  });

  it("defaults the timezone to UTC when signup omits it", async () => {
    const { auth } = start();
    const result = await auth.signup({
      username: "runner",
      password: "password123",
      displayName: "Runner",
    });
    expect(result.user.timezone).toBe("UTC");
    expect(result.user.goal).toBeNull();
  });

  it("rejects a duplicate username regardless of case", async () => {
    const { auth, store } = start();
    await auth.signup(SIGNUP);

    const error = await catchAuthError(async () => await auth.signup({ ...SIGNUP, username: "ALICE_99" }));
    expect(error.code).toBe("username-taken");
    expect(store.getUserByUsername("alice_99")?.displayName).toBe(SIGNUP.displayName);
  });

  it("rejects a wrong password with a generic credentials error", async () => {
    const { auth } = start();
    await auth.signup(SIGNUP);

    const wrongPassword = await catchAuthError(async () =>
      await auth.login({ username: "alice_99", password: "wrong-password" }),
    );
    const missingUser = await catchAuthError(async () =>
      await auth.login({ username: "nobody", password: SIGNUP.password }),
    );

    expect(wrongPassword.code).toBe("invalid-credentials");
    expect(missingUser.code).toBe("invalid-credentials");
    expect(wrongPassword.message).toBe(missingUser.message);
  });

  it("rejects malformed, tampered and expired cookies", async () => {
    const { auth, setNow } = start();
    const signup = await auth.signup(SIGNUP);
    const token = tokenFrom(signup.cookie);

    expect(auth.read(request(`${AUTH_COOKIE_NAME}=garbage`))).toBeUndefined();
    expect(auth.read(request(`${AUTH_COOKIE_NAME}=a.b.c`))).toBeUndefined();
    expect(auth.read(request(`${AUTH_COOKIE_NAME}=!!!.???`))).toBeUndefined();
    expect(auth.read(request(`${AUTH_COOKIE_NAME}=${tamperToken(token, 0)}`))).toBeUndefined();
    expect(auth.read(request(`${AUTH_COOKIE_NAME}=${tamperToken(token, 1)}`))).toBeUndefined();

    setNow("2026-01-30T23:59:59.000Z");
    expect(auth.read(request(cookieFrom(signup.cookie)))).toEqual(signup.user);

    setNow("2026-01-31T00:00:00.000Z");
    expect(auth.read(request(cookieFrom(signup.cookie)))).toBeUndefined();
  });

  it("signs a payload with a thirty-day expiry and clears with Max-Age=0", async () => {
    const { auth } = start();
    const signup = await auth.signup(SIGNUP);
    const payload = payloadOf(signup.cookie);

    expect(payload.userId).toBe(signup.user.userId);
    expect(payload.exp).toBe(Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000) + AUTH_COOKIE_MAX_AGE_SECONDS);
    expect(auth.read(request(`${AUTH_COOKIE_NAME}=`))).toBeUndefined();

    const cleared = auth.clearCookie();
    expect(cleared.startsWith(`${AUTH_COOKIE_NAME}=;`)).toBe(true);
    expect(cleared).toContain("Path=/");
    expect(cleared).toContain("HttpOnly");
    expect(cleared).toContain("SameSite=Lax");
    expect(cleared).toContain("Max-Age=0");
  });
});

describe("profile", () => {
  it("updates the mutable profile fields and reads them back through the cookie", async () => {
    const { auth, store } = start();
    const signup = await auth.signup(SIGNUP);

    const updated = await auth.updateProfile(signup.user.userId, {
      displayName: "Alice Liddell",
      timezone: "Europe/Berlin",
      goal: "10 km in eight weeks",
    });

    expect(updated.user).toMatchObject({
      userId: signup.user.userId,
      username: "alice_99",
      displayName: "Alice Liddell",
      timezone: "Europe/Berlin",
      goal: "10 km in eight weeks",
      createdAt: signup.user.createdAt,
    });
    expect(updated.user).not.toHaveProperty("passwordHash");
    expect(auth.read(request(cookieFrom(signup.cookie)))).toEqual(updated.user);
    expect(store.getUser(signup.user.userId)?.displayName).toBe("Alice Liddell");

    const cleared = await auth.updateProfile(signup.user.userId, { goal: null });
    expect(cleared.user.goal).toBeNull();
    expect(store.getUser(signup.user.userId)?.goal).toBeNull();
  });

  it("reports a missing profile as not-found", async () => {
    const { auth } = start();
    const error = await catchAuthError(async () => await auth.updateProfile("missing-user", { displayName: "Nobody" }));
    expect(error.code).toBe("not-found");
  });

  it("changes the password so the old password is rejected and the new one accepted", async () => {
    const { auth, store } = start();
    const signup = await auth.signup(SIGNUP);
    const oldHash = store.getUser(signup.user.userId)?.passwordHash;

    const updated = await auth.updateProfile(signup.user.userId, {
      password: "new-password-456",
      currentPassword: SIGNUP.password,
    });
    expect(updated.user).not.toHaveProperty("passwordHash");
    expect(store.getUser(signup.user.userId)?.passwordHash).not.toBe(oldHash);
    expect(store.getUser(signup.user.userId)?.passwordHash).not.toContain("new-password-456");

    const rejected = await catchAuthError(async () =>
      await auth.login({ username: "alice_99", password: SIGNUP.password }),
    );
    expect(rejected.code).toBe("invalid-credentials");

    const accepted = await auth.login({ username: "alice_99", password: "new-password-456" });
    expect(accepted.user).toEqual(updated.user);
  });

  it("demands the current password before changing it", async () => {
    const { auth, store } = start();
    const signup = await auth.signup(SIGNUP);
    const before = store.getUser(signup.user.userId)?.passwordHash;

    const missing = await catchAuthError(async () =>
      await auth.updateProfile(signup.user.userId, { password: "new-password-456" }),
    );
    const wrong = await catchAuthError(async () =>
      await auth.updateProfile(signup.user.userId, { password: "new-password-456", currentPassword: "not-it-000" }),
    );

    expect(missing.code).toBe("invalid-current-password");
    expect(wrong.code).toBe("invalid-current-password");
    expect(store.getUser(signup.user.userId)?.passwordHash).toBe(before);
    expect(store.getUser(signup.user.userId)?.tokenVersion ?? 0).toBe(0);
  });

  it("rotates the session version on a password change, ending every other session", async () => {
    const { auth, store } = start();
    const signup = await auth.signup(SIGNUP);
    const otherDevice = await auth.login({ username: SIGNUP.username, password: SIGNUP.password });

    const changed = await auth.updateProfile(signup.user.userId, {
      password: "new-password-456",
      currentPassword: SIGNUP.password,
    });

    expect(store.getUser(signup.user.userId)?.tokenVersion).toBe(1);
    expect(auth.read(request(cookieFrom(signup.cookie)))).toBeUndefined();
    expect(auth.read(request(cookieFrom(otherDevice.cookie)))).toBeUndefined();
    expect(auth.read(request(cookieFrom(changed.cookie)))).toEqual(changed.user);
  });

  it("signs out every device without touching the password", async () => {
    const { auth, store } = start();
    const signup = await auth.signup(SIGNUP);
    const before = store.getUser(signup.user.userId)?.passwordHash;

    auth.signOutEverywhere(signup.user.userId);

    expect(store.getUser(signup.user.userId)?.tokenVersion).toBe(1);
    expect(store.getUser(signup.user.userId)?.passwordHash).toBe(before);
    expect(auth.read(request(cookieFrom(signup.cookie)))).toBeUndefined();
    const fresh = await auth.login({ username: SIGNUP.username, password: SIGNUP.password });
    expect(auth.read(request(cookieFrom(fresh.cookie)))).toEqual(fresh.user);
  });

  it("confirms a password without exposing the hash", async () => {
    const { auth } = start();
    const signup = await auth.signup(SIGNUP);

    expect(await auth.confirmPassword(signup.user.userId, SIGNUP.password)).toBe(true);
    expect(await auth.confirmPassword(signup.user.userId, "not-the-password")).toBe(false);
    expect(await auth.confirmPassword(signup.user.userId, "")).toBe(false);
    expect(await auth.confirmPassword("missing-user", SIGNUP.password)).toBe(false);
  });
});

describe("validation", () => {
  it("rejects invalid signup fields with invalid-input", async () => {
    const { auth } = start();
    const cases: Array<{ field: string; input: typeof SIGNUP }> = [
      { field: "username", input: { ...SIGNUP, username: "ab" } },
      { field: "username", input: { ...SIGNUP, username: "bad name" } },
      { field: "username", input: { ...SIGNUP, username: "bad/name" } },
      { field: "username", input: { ...SIGNUP, username: "bad!name" } },
      { field: "username", input: { ...SIGNUP, username: "x".repeat(25) } },
      { field: "displayName", input: { ...SIGNUP, displayName: "   " } },
      { field: "displayName", input: { ...SIGNUP, displayName: "x".repeat(61) } },
      { field: "password", input: { ...SIGNUP, password: "short" } },
      { field: "timezone", input: { ...SIGNUP, timezone: "" } },
      { field: "timezone", input: { ...SIGNUP, timezone: "Mars/Olympus" } },
      { field: "goal", input: { ...SIGNUP, goal: "x".repeat(121) } },
    ];

    for (const testCase of cases) {
      const error = await catchAuthError(async () => await auth.signup(testCase.input));
      expect(error.code).toBe("invalid-input");
    }
  });

  it("rejects invalid profile changes without mutating the stored profile", async () => {
    const { auth, store } = start();
    const signup = await auth.signup(SIGNUP);

    const badName = await catchAuthError(async () =>
      await auth.updateProfile(signup.user.userId, { displayName: "x".repeat(61) }),
    );
    const badTimezone = await catchAuthError(async () =>
      await auth.updateProfile(signup.user.userId, { timezone: "not/a-zone" }),
    );
    const badGoal = await catchAuthError(async () =>
      await auth.updateProfile(signup.user.userId, { goal: "x".repeat(121) }),
    );
    const badPassword = await catchAuthError(async () =>
      await auth.updateProfile(signup.user.userId, { password: "short" }),
    );

    expect(badName.code).toBe("invalid-input");
    expect(badTimezone.code).toBe("invalid-input");
    expect(badGoal.code).toBe("invalid-input");
    expect(badPassword.code).toBe("invalid-input");
    expect(store.getUser(signup.user.userId)?.displayName).toBe(SIGNUP.displayName);
    expect(store.getUser(signup.user.userId)?.timezone).toBe(SIGNUP.timezone);
    expect(store.getUser(signup.user.userId)?.goal).toBe(SIGNUP.goal);
  });
});

describe("password hash exposure", () => {
  it("never includes passwordHash in signup, login, read or update results", async () => {
    const { auth, store } = start();
    const signup = await auth.signup(SIGNUP);
    const login = await auth.login({ username: SIGNUP.username, password: SIGNUP.password });
    const update = await auth.updateProfile(signup.user.userId, {
      displayName: "Alice Updated",
      password: "another-password-789",
      currentPassword: SIGNUP.password,
    });
    const read = auth.read(request(cookieFrom(login.cookie)));

    const returned: AuthUser[] = [signup.user, login.user, update.user];
    if (read !== undefined) returned.push(read);

    const storedHash = store.getUser(signup.user.userId)?.passwordHash ?? "";
    expect(storedHash.length).toBeGreaterThan(0);
    for (const user of returned) {
      expect(Object.keys(user)).not.toContain("passwordHash");
      expect(JSON.stringify(user)).not.toContain("passwordHash");
      expect(JSON.stringify(user)).not.toContain(storedHash);
      expect(JSON.stringify(user)).not.toContain("scrypt$");
    }
  });
});
