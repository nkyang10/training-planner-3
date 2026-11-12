/** Shared POC3 records. Every record belongs to exactly one runner. */

export type MessageRole = "user" | "assistant";

/**
 * A standalone POC3 account. The profile is deliberately separate from the training rows: the account is created
 * once (signup), while messages, memories, sessions and activities all hang off the same `userId`.
 */
export interface UserProfile {
  userId: string;
  /** Login name; unique case-insensitively, stored exactly as the runner chose it. */
  username: string;
  displayName: string;
  /** Hash produced by the auth module; plaintext passwords are never stored here. */
  passwordHash: string;
  /** IANA timezone, e.g. "Asia/Taipei". */
  timezone: string;
  /** Free-text training goal, or null when the runner has not written one yet. */
  goal: string | null;
  createdAt: string;
}

/** The mutable part of a profile; the id, username and createdAt are immutable. */
export type UserProfilePatch = Partial<Pick<UserProfile, "displayName" | "passwordHash" | "timezone" | "goal">>;

export interface Message {
  messageId: string;
  userId: string;
  role: MessageRole;
  text: string;
  createdAt: string;
}

export interface Memory {
  memoryId: string;
  userId: string;
  /** A short fact the coach chose to remember, in the runner's language. */
  text: string;
  createdAt: string;
}

export type SessionKind = "easy" | "long" | "interval" | "tempo" | "rest" | "cross" | "race" | "racewalk";

export interface TrainingSession {
  sessionId: string;
  userId: string;
  /** ISO day the session is booked for; never in the past. */
  day: string;
  title: string;
  kind: SessionKind;
  distanceKm: number | null;
  durationMin: number | null;
  note: string | null;
  createdAt: string;
}

export interface Activity {
  activityId: string;
  userId: string;
  /** ISO day the activity happened. */
  day: string;
  title: string;
  distanceKm: number | null;
  durationMin: number | null;
  paceSecPerKm: number | null;
  avgHr: number | null;
  source: "garmin" | "chat";
  createdAt: string;
}

/**
 * One session mutation inside a change set. `before` and `after` are full snapshots, so a change set is enough to
 * rebuild the exact calendar state on either side of a batch — that is what makes an undo possible without a diff
 * language. `action` is the model's verb for a batch ("add" | "update" | "remove") and "revert" for the audit set a
 * revert appends.
 */
export type ChangeAction = "add" | "update" | "remove" | "revert";

export interface ChangeEntry {
  action: ChangeAction;
  sessionId: string;
  before: TrainingSession | null;
  after: TrainingSession | null;
  fromDay: string | null;
  toDay: string | null;
  title: string;
  kind: SessionKind;
}

/** One coach turn's batch of calendar writes, kept forever so the runner can read and undo it. */
export interface ChangeSet {
  changeSetId: string;
  userId: string;
  createdAt: string;
  /** Short human-readable description of the batch. */
  summary: string;
  entries: ChangeEntry[];
  /** ISO timestamp when the runner undid this batch, or null while it still stands. */
  revertedAt: string | null;
}

export type CoachTurnStatus = "in_progress" | "completed" | "failed";

/**
 * Durable idempotency and audit record for one gateway request. The response is cached only after the turn is
 * committed, so a network retry cannot write the same booking twice.
 */
export interface CoachTurnRecord {
  requestId: string;
  userId: string;
  createdAt: string;
  completedAt: string | null;
  status: CoachTurnStatus;
  attempts: number;
  validationCode: string | null;
  outcome: string | null;
  responseJson: string | null;
}

export interface CoachTurnCompletion {
  completedAt: string;
  attempts: number;
  validationCode: string | null;
  outcome: string;
  responseJson: string;
}

export interface Store {
  /** One account by id, or undefined when no such account exists. */
  getUser(userId: string): UserProfile | undefined;
  /** Case-insensitive lookup by login name. */
  getUserByUsername(username: string): UserProfile | undefined;
  /** Insert a new account. Throws when the username is already taken (case-insensitive). */
  createUser(profile: UserProfile): void;
  /** Patch the mutable profile fields; returns the updated profile, or undefined when the account is missing. */
  updateUser(userId: string, patch: UserProfilePatch): UserProfile | undefined;
  appendMessage(message: Message): void;
  listMessages(userId: string, limit?: number): Message[];
  appendMemory(memory: Memory): void;
  listMemories(userId: string, limit?: number): Memory[];
  listSessions(userId: string, fromDay: string, toDay: string): TrainingSession[];
  getSession(userId: string, sessionId: string): TrainingSession | undefined;
  upsertSession(session: TrainingSession): void;
  /** Remove one booked session (a coach "remove" action); returns whether a row was deleted. */
  deleteSession(userId: string, sessionId: string): boolean;
  /** Replace future sessions only; past sessions are never touched. */
  replaceFutureSessions(userId: string, fromDay: string, sessions: readonly TrainingSession[]): void;
  listActivities(userId: string, limit?: number): Activity[];
  appendActivity(activity: Activity): void;
  /** Record one batch of calendar writes; a revert is recorded as its own change set. */
  appendChangeSet(changeSet: ChangeSet): void;
  /** Newest first. */
  listChangeSets(userId: string, limit?: number): ChangeSet[];
  getChangeSet(userId: string, changeSetId: string): ChangeSet | undefined;
  /** Mark a batch as undone; returns false when it is missing, foreign, or already marked. */
  markChangeSetReverted(userId: string, changeSetId: string, at: string): boolean;
  /** Claim a request id for one in-flight turn. False means it is already running or completed. */
  claimCoachTurn(record: CoachTurnRecord): boolean;
  /** Cache the completed response and audit metadata for a request id. */
  completeCoachTurn(userId: string, requestId: string, completion: CoachTurnCompletion): void;
  /** Mark a claimed request as failed so a later retry with the same id can start a new attempt. */
  failCoachTurn(userId: string, requestId: string, completedAt: string): void;
  /** Read a turn audit record, scoped to one user. */
  getCoachTurn(userId: string, requestId: string): CoachTurnRecord | undefined;
  /** Run a write batch atomically. The callback must not perform HTTP or model calls. */
  transaction<T>(work: () => T): T;
  close(): void;
}
