/**
 * Standalone accounts for Milebook.
 *
 * Passwords are stored as self-describing scrypt hashes. Sessions are signed
 * cookies: the browser only holds a user id, an expiry and a session version,
 * while the HMAC prevents edits. The store remains the source of truth for the
 * profile, so a cookie alone cannot invent a user.
 *
 * The session version makes revocation possible without server-side sessions:
 * a profile carries `tokenVersion`, a cookie carries the version it was minted
 * with, and a mismatch invalidates the cookie. Changing the password bumps the
 * version (signing out every other device) and reissues a cookie for the device
 * that made the change.
 */
import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { IncomingMessage } from "node:http";
import type { Store, UserProfile, UserProfilePatch } from "./types";

export const AUTH_COOKIE_NAME = "milebook_session";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const HASH_PREFIX = "scrypt";
const SALT_BYTES = 16;
const HASH_BYTES = 64;
/**
 * A fixed, valid scrypt hash of a value no runner knows. An unknown username is verified against it so the login path
 * costs the same whether or not the account exists; without it the response time is a username-enumeration oracle.
 */
const DUMMY_PASSWORD_HASH =
  "scrypt$245826cc344a900ffde02e5c1ffa38a3$a4f8d901375e73be69546a929dc0b5bcfb6f78ed115395400259203a5b641641ee976a9a191f1b246cc6536228e8725655658474f9d2d7050d0d82a2811c146c";
/** The longest username the policy allows; anything longer is not an account, so it never reaches the store. */
const MAX_USERNAME_CHARS = 24;
/**
 * Usernames accept letters of either case (folded to lowercase for storage and uniqueness), digits, dot, underscore,
 * hyphen and at-sign. Spaces, slashes, quotes and other punctuation stay out, so a name is still safe to echo in a
 * heading, a URL query and a throttle key.
 */
const USERNAME_PATTERN = /^[a-z0-9._@\-]{3,24}$/;
const HEX_PATTERN = /^[0-9a-f]+$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+)*$/;

export type AuthErrorCode =
  | "username-taken"
  | "invalid-credentials"
  | "invalid-current-password"
  | "invalid-input"
  | "not-found";

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
  /** A new password; requires `currentPassword` to match the stored hash. */
  password?: string;
  /** The runner's existing password, demanded whenever `password` is set. */
  currentPassword?: string;
}

export interface CookieUser {
  userId: string;
  /** Session version the cookie is minted for; absent means 0 (pre-1.1 accounts). */
  tokenVersion?: number;
}

export interface AuthOptions {
  store: Store;
  secret: string;
  /** Append `Secure` to session cookies; enable whenever the deployment terminates TLS. */
  secureCookies?: boolean;
  now?: () => string | Date;
}

export interface Auth {
  signup(input: SignupInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  read(request: IncomingMessage): AuthUser | undefined;
  setCookie(user: CookieUser): string;
  clearCookie(): string;
  /** Applies a profile patch; a password change reissues `cookie` for the calling device. */
  updateProfile(userId: string, patch: ProfileUpdate): Promise<AuthResult>;
  /** Invalidates every outstanding cookie for the user, including the caller's. */
  signOutEverywhere(userId: string): void;
  /**
   * True when `password` matches the account's stored hash. Used to re-authenticate before irreversible actions
   * (password change, account erasure) without exposing the hash itself.
   */
  confirmPassword(userId: string, password: string): Promise<boolean>;
}

function invalid(message: string): AuthError {
  return new AuthError("invalid-input", message);
}

function normalizeUsername(value: string): string {
  if (typeof value !== "string") throw invalid("username is required");
  const username = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw invalid("username must be 3-24 characters: letters, numbers, dot, underscore, hyphen or at-sign");
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

/**
 * scrypt runs on the libuv thread pool, not the event loop: a burst of sign-ins must not stall every other request while
 * a 16 MB-memory hash is computed. The sync variant is deliberately gone from this module.
 */
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(password, salt, HASH_BYTES);
  return `${HASH_PREFIX}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const parts = encoded.split("$");
  if (parts.length !== 3) return false;
  const [prefix, saltHex, hashHex] = parts;
  if (prefix !== HASH_PREFIX || saltHex === undefined || hashHex === undefined) return false;
  if (saltHex.length !== SALT_BYTES * 2 || !HEX_PATTERN.test(saltHex)) return false;
  if (hashHex.length !== HASH_BYTES * 2 || !HEX_PATTERN.test(hashHex)) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), HASH_BYTES);
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
  /** Session version; absent on cookies minted before 1.1, which read as 0. */
  ver: number;
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
  const ver = record["ver"] ?? 0;
  if (typeof userId !== "string" || userId.length === 0) return undefined;
  if (typeof exp !== "number" || !Number.isInteger(exp) || !Number.isFinite(exp)) return undefined;
  if (typeof ver !== "number" || !Number.isInteger(ver) || ver < 0) return undefined;
  return { userId, exp, ver };
}

export function createAuth(options: AuthOptions): Auth {
  const { store, secret } = options;
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("auth secret is required");
  }
  const secureAttribute = options.secureCookies === true ? "; Secure" : "";
  const now = options.now ?? (() => new Date());
  const currentDate = (): Date => toDate(now());
  const currentSeconds = (): number => Math.floor(currentDate().getTime() / 1000);

  const cookieFor = (userId: string, issuedAt: Date, tokenVersion: number): string => {
    const exp = Math.floor(issuedAt.getTime() / 1000) + AUTH_COOKIE_MAX_AGE_SECONDS;
    const payload: CookiePayload = { userId, exp, ver: tokenVersion };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return `${AUTH_COOKIE_NAME}=${encoded}.${signature}; Path=/; HttpOnly; SameSite=Lax${secureAttribute}; Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`;
  };

  const setCookie = (user: CookieUser): string => {
    if (typeof user.userId !== "string" || user.userId.length === 0) {
      throw invalid("user id is required");
    }
    return cookieFor(user.userId, currentDate(), user.tokenVersion ?? 0);
  };

  const clearCookie = (): string =>
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${secureAttribute}; Max-Age=0`;

  const signup = async (input: SignupInput): Promise<AuthResult> => {
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
      passwordHash: await hashPassword(password),
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

    return { user: toAuthUser(profile), cookie: cookieFor(profile.userId, createdAt, profile.tokenVersion ?? 0) };
  };

  const login = async (input: LoginInput): Promise<AuthResult> => {
    const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (username.length > MAX_USERNAME_CHARS) {
      // No account can have this name; spend the same scrypt work anyway so the timing oracle stays closed.
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      throw new AuthError("invalid-credentials", "invalid username or password");
    }
    const profile = username.length === 0 ? undefined : store.getUserByUsername(username);
    if (profile === undefined) {
      // Equalize the work for an unknown name: the response must not be measurably faster than a wrong password.
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      throw new AuthError("invalid-credentials", "invalid username or password");
    }
    if (!(await verifyPassword(password, profile.passwordHash))) {
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
    if (profile === undefined) return undefined;
    // A cookie minted before the last revocation no longer matches the profile's session version.
    if ((profile.tokenVersion ?? 0) !== payload.ver) return undefined;
    return toAuthUser(profile);
  };

  const updateProfile = async (userId: string, input: ProfileUpdate): Promise<AuthResult> => {
    if (typeof userId !== "string" || userId.length === 0) {
      throw new AuthError("not-found", "user not found");
    }
    const existing = store.getUser(userId);
    if (existing === undefined) {
      throw new AuthError("not-found", "user not found");
    }

    const patch: UserProfilePatch = {};
    if (input.displayName !== undefined) patch.displayName = normalizeDisplayName(input.displayName);
    if (input.timezone !== undefined) patch.timezone = normalizeTimezone(input.timezone);
    if (input.goal !== undefined) patch.goal = normalizeGoal(input.goal);
    if (input.password !== undefined) {
      // Validate the new password first (a cheap format check), then re-authenticate before rotating the credential:
      // a hijacked session must not become a permanent takeover.
      const nextPassword = validatePassword(input.password);
      const current = typeof input.currentPassword === "string" ? input.currentPassword : "";
      if (current.length === 0 || !(await verifyPassword(current, existing.passwordHash))) {
        throw new AuthError("invalid-current-password", "current password is incorrect");
      }
      patch.passwordHash = await hashPassword(nextPassword);
      patch.tokenVersion = (existing.tokenVersion ?? 0) + 1;
    }

    const updated = store.updateUser(userId, patch);
    if (updated === undefined) throw new AuthError("not-found", "user not found");
    return { user: toAuthUser(updated), cookie: cookieFor(userId, currentDate(), updated.tokenVersion ?? 0) };
  };

  const signOutEverywhere = (userId: string): void => {
    const existing = store.getUser(userId);
    if (existing === undefined) return;
    store.updateUser(userId, { tokenVersion: (existing.tokenVersion ?? 0) + 1 });
  };

  const confirmPassword = async (userId: string, password: string): Promise<boolean> => {
    const existing = store.getUser(userId);
    if (existing === undefined) return false;
    if (typeof password !== "string" || password.length === 0) return false;
    return await verifyPassword(password, existing.passwordHash);
  };

  return { signup, login, read, setCookie, clearCookie, updateProfile, signOutEverywhere, confirmPassword };
}
