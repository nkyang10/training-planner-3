/**
 * Standalone accounts for POC3.
 *
 * Passwords are stored as self-describing scrypt hashes. Sessions are stateless
 * signed cookies: the browser only holds a user id and an expiry, while the
 * HMAC prevents edits. The store remains the source of truth for the profile,
 * so a cookie alone cannot invent a user.
 */
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Store, UserProfile, UserProfilePatch } from "./types";

export const AUTH_COOKIE_NAME = "poc3_session";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const HASH_PREFIX = "scrypt";
const SALT_BYTES = 16;
const HASH_BYTES = 64;
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const HEX_PATTERN = /^[0-9a-f]+$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+)*$/;

export type AuthErrorCode = "username-taken" | "invalid-credentials" | "invalid-input" | "not-found";

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

/** The account shape exposed to callers; it deliberately has no password hash. */
export interface AuthUser {
  userId: string;
  username: string;
  displayName: string;
  timezone: string;
  goal: string | null;
  createdAt: string;
}

export interface AuthResult {
  user: AuthUser;
  cookie: string;
}

export interface SignupInput {
  username: string;
  password: string;
  displayName: string;
  timezone?: string;
  goal?: string | null;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface ProfileUpdate {
  displayName?: string;
  timezone?: string;
  goal?: string | null;
  password?: string;
}

export interface CookieUser {
  userId: string;
}

export interface AuthOptions {
  store: Store;
  secret: string;
  now?: () => string | Date;
}

export interface Auth {
  signup(input: SignupInput): AuthResult;
  login(input: LoginInput): AuthResult;
  read(request: IncomingMessage): AuthUser | undefined;
  setCookie(user: CookieUser): string;
  clearCookie(): string;
  updateProfile(userId: string, patch: ProfileUpdate): AuthUser;
}

function invalid(message: string): AuthError {
  return new AuthError("invalid-input", message);
}

function normalizeUsername(value: string): string {
  if (typeof value !== "string") throw invalid("username is required");
  const username = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw invalid("username must be 3-24 characters: lowercase letters, digits or underscore");
  }
  return username;
}

function normalizeDisplayName(value: string): string {
  if (typeof value !== "string") throw invalid("display name is required");
  const displayName = value.trim();
  if (displayName.length < 1 || displayName.length > 60) {
    throw invalid("display name must be 1-60 characters");
  }
  return displayName;
}

function validatePassword(value: string): string {
  if (typeof value !== "string" || value.length < 8) {
    throw invalid("password must be at least 8 characters");
  }
  return value;
}

function normalizeTimezone(value: string): string {
  if (typeof value !== "string") throw invalid("timezone is required");
  const timezone = value.trim();
  if (timezone.length === 0 || !TIMEZONE_PATTERN.test(timezone)) {
    throw invalid("timezone must be an IANA-like zone such as Asia/Hong_Kong");
  }
  try {
    // The pattern rejects path-like garbage; Intl confirms the zone name is real.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw invalid("timezone must be an IANA-like zone such as Asia/Hong_Kong");
  }
  return timezone;
}

function normalizeGoal(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw invalid("goal must be text or null");
  const goal = value.trim();
  if (goal.length > 120) throw invalid("goal must be 120 characters or fewer");
  return goal.length === 0 ? null : goal;
}

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, HASH_BYTES);
  return `${HASH_PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const parts = encoded.split("$");
  if (parts.length !== 3) return false;
  const [prefix, saltHex, hashHex] = parts;
  if (prefix !== HASH_PREFIX || saltHex === undefined || hashHex === undefined) return false;
  if (saltHex.length !== SALT_BYTES * 2 || !HEX_PATTERN.test(saltHex)) return false;
  if (hashHex.length !== HASH_BYTES * 2 || !HEX_PATTERN.test(hashHex)) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), HASH_BYTES);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function toAuthUser(profile: UserProfile): AuthUser {
  return {
    userId: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    timezone: profile.timezone,
    goal: profile.goal,
    createdAt: profile.createdAt,
  };
}

function toDate(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("auth clock returned an invalid date");
  return date;
}

function readCookieValue(request: IncomingMessage): string | undefined {
  const header = request.headers.cookie;
  if (typeof header !== "string") return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() !== AUTH_COOKIE_NAME) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

interface CookiePayload {
  userId: string;
  exp: number;
}

function decodeBase64Url(value: string): Buffer | undefined {
  if (!BASE64URL_PATTERN.test(value)) return undefined;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return undefined;
  }
}

function parsePayload(encoded: string): CookiePayload | undefined {
  const bytes = decodeBase64Url(encoded);
  if (bytes === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const record = parsed as Record<string, unknown>;
  const userId = record["userId"];
  const exp = record["exp"];
  if (typeof userId !== "string" || userId.length === 0) return undefined;
  if (typeof exp !== "number" || !Number.isInteger(exp) || !Number.isFinite(exp)) return undefined;
  return { userId, exp };
}

export function createAuth(options: AuthOptions): Auth {
  const { store, secret } = options;
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("auth secret is required");
  }
  const now = options.now ?? (() => new Date());
  const currentDate = (): Date => toDate(now());
  const currentSeconds = (): number => Math.floor(currentDate().getTime() / 1000);

  const cookieFor = (userId: string, issuedAt: Date): string => {
    const exp = Math.floor(issuedAt.getTime() / 1000) + AUTH_COOKIE_MAX_AGE_SECONDS;
    const payload: CookiePayload = { userId, exp };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return `${AUTH_COOKIE_NAME}=${encoded}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`;
  };

  const setCookie = (user: CookieUser): string => {
    if (typeof user.userId !== "string" || user.userId.length === 0) {
      throw invalid("user id is required");
    }
    return cookieFor(user.userId, currentDate());
  };

  const clearCookie = (): string =>
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

  const signup = (input: SignupInput): AuthResult => {
    const username = normalizeUsername(input.username);
    const password = validatePassword(input.password);
    const displayName = normalizeDisplayName(input.displayName);
    const timezone = normalizeTimezone(input.timezone ?? "UTC");
    const goal = normalizeGoal(input.goal);

    if (store.getUserByUsername(username) !== undefined) {
      throw new AuthError("username-taken", `username already taken: ${username}`);
    }

    const createdAt = currentDate();
    const profile: UserProfile = {
      userId: randomUUID(),
      username,
      displayName,
      passwordHash: hashPassword(password),
      timezone,
      goal,
      createdAt: createdAt.toISOString(),
    };

    try {
      store.createUser(profile);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("username already taken:")) {
        throw new AuthError("username-taken", `username already taken: ${username}`);
      }
      throw error;
    }

    return { user: toAuthUser(profile), cookie: cookieFor(profile.userId, createdAt) };
  };

  const login = (input: LoginInput): AuthResult => {
    const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    const profile = username.length === 0 ? undefined : store.getUserByUsername(username);
    if (profile === undefined || !verifyPassword(password, profile.passwordHash)) {
      throw new AuthError("invalid-credentials", "invalid username or password");
    }
    return { user: toAuthUser(profile), cookie: setCookie(profile) };
  };

  const read = (request: IncomingMessage): AuthUser | undefined => {
    const token = readCookieValue(request);
    if (token === undefined || token.length === 0) return undefined;
    const parts = token.split(".");
    if (parts.length !== 2) return undefined;
    const [encoded, signature] = parts;
    if (encoded === undefined || signature === undefined) return undefined;

    const supplied = decodeBase64Url(signature);
    if (supplied === undefined) return undefined;
    const expected = createHmac("sha256", secret).update(encoded).digest();
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return undefined;

    const payload = parsePayload(encoded);
    if (payload === undefined || payload.exp <= currentSeconds()) return undefined;
    const profile = store.getUser(payload.userId);
    return profile === undefined ? undefined : toAuthUser(profile);
  };

  const updateProfile = (userId: string, input: ProfileUpdate): AuthUser => {
    if (typeof userId !== "string" || userId.length === 0) {
      throw new AuthError("not-found", "user not found");
    }
    if (store.getUser(userId) === undefined) {
      throw new AuthError("not-found", "user not found");
    }

    const patch: UserProfilePatch = {};
    if (input.displayName !== undefined) patch.displayName = normalizeDisplayName(input.displayName);
    if (input.timezone !== undefined) patch.timezone = normalizeTimezone(input.timezone);
    if (input.goal !== undefined) patch.goal = normalizeGoal(input.goal);
    if (input.password !== undefined) {
      patch.passwordHash = hashPassword(validatePassword(input.password));
    }

    const updated = store.updateUser(userId, patch);
    if (updated === undefined) throw new AuthError("not-found", "user not found");
    return toAuthUser(updated);
  };

  return { signup, login, read, setCookie, clearCookie, updateProfile };
}
