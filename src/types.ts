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
  /** Optional Garmin metrics; old rows and chat-created activities leave them undefined. */
  elevationGainM?: number | null;
  elevationLossM?: number | null;
  calories?: number | null;
  maxHr?: number | null;
  cadenceSpm?: number | null;
  strideLengthCm?: number | null;
  groundContactMs?: number | null;
  aerobicTrainingEffect?: number | null;
  anaerobicTrainingEffect?: number | null;
  trainingLoad?: number | null;
  trainingEffectLabel?: string | null;
  fastest1kSec?: number | null;
  fastest1miSec?: number | null;
  fastest5kSec?: number | null;
  /** Garmin HR-zone seconds; optional because not every activity has zones. */
  hrZone1Sec?: number | null;
  hrZone2Sec?: number | null;
  hrZone3Sec?: number | null;
  hrZone4Sec?: number | null;
  hrZone5Sec?: number | null;
}

export type NotificationSource = "garmin";
export type NotificationStatus = "success" | "error";

/** One result worth keeping in the top-bar notification tray. */
export interface AppNotification {
  notificationId: string;
  userId: string;
  source: NotificationSource;
  status: NotificationStatus;
  title: string;
  body: string;
  /** Internal path to open from the tray. */
  href: string;
  createdAt: string;
  readAt: string | null;
}

/** A runner's own Garmin Personal API key; never shared across accounts. */
export interface GarminKey {
  userId: string;
  apiKey: string;
  savedAt: string;
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

/** What a coach turn is for. The mode is background metadata, never shown in the chat. */
export type CoachMode = "chat" | "review" | "plan" | "undo";

/** What a review should look at. */
export type CoachFocus =
  | "schedule"
  | "pace"
  | "hr"
  | "load"
  | "race_execution"
  | "recovery"
  | "consistency";

/** Where an action-originated turn came from; used for audit, never rendered in the chat. */
export type CoachSource =
  | "composer"
  | "run-peek"
  | "day-menu"
  | "history"
  | "load-card"
  | "auto-sync"
  | "activity-detail";

export type CoachLanguage = "auto" | "en" | "zh-Hant";
export type CoachTone = "supportive" | "direct" | "brief";

/** Server-resolved references; the gateway loads the actual rows. */
export interface CoachDirectiveReferences {
  activityId?: string;
  day?: string;
  weekStart?: string;
  sessionIds?: string[];
}

export interface CoachDirectiveStyle {
  language?: CoachLanguage;
  tone?: CoachTone;
}

/**
 * The hidden stage direction for one coach turn. The browser never supplies this object: the web server builds it
 * from a typed intent and the gateway validates and enforces it. It is not part of the visible conversation.
 */
export interface CoachDirective {
  mode: CoachMode;
  /** When false, the gateway refuses every session/revert proposal for this turn. */
  allowCalendarWrites: boolean;
  /** Defaults to true; false makes a review strictly side-effect-free. */
  allowMemoryWrites?: boolean;
  focus?: CoachFocus[];
  references?: CoachDirectiveReferences;
  /** Short server-authored context; never shown to the runner. */
  background?: string;
  source: CoachSource;
  style?: CoachDirectiveStyle;
}

/** Audit record for one hidden directive; shown only on the owner's audit page. */
export interface CoachDirectiveRecord {
  directiveId: string;
  userId: string;
  requestId: string | null;
  messageId: string | null;
  /** The visible message this directive accompanied. */
  visible: string;
  directive: CoachDirective;
  /** Calendar writes the gateway refused because the directive forbade them. */
  blockedWrites: number;
  createdAt: string;
}

/** Durable coaching situations. These are separate from a turn's review/plan/undo intent. */
export type CoachStateKey =
  | "race_day"
  | "race_week"
  | "taper"
  | "post_race"
  | "load_spike"
  | "high_risk"
  | "under_load"
  | "hard_easy_imbalance"
  | "consistency_guard"
  | "plan_stale"
  | "data_stale"
  | "no_key"
  | "pain_injury"
  | "illness"
  | "return_to_run"
  | "medical_red_flag"
  | "travel"
  | "heat"
  | "time_crunch"
  | "sleep_debt"
  | "high_stress"
  | "motivation_dip"
  | "altitude"
  | "air_quality"
  | "cold_ice"
  | "indoor_treadmill"
  | "beginner"
  | "returning"
  | "masters"
  | "strength_focus"
  | "speed_focus"
  | "pregnancy_postpartum"
  | "menstrual_cycle_support"
  | "low_energy_availability";

export type CoachStateFamily =
  | "race_phase"
  | "load"
  | "consistency"
  | "safety"
  | "life"
  | "wellbeing"
  | "environment"
  | "data"
  | "setup"
  | "runner";

export type CoachStateStatus = "observing" | "active" | "resolved";
export type CoachStateSource = "auto" | "chat" | "user";

/** One durable coaching state for one runner. History is kept; only active/observing rows are current. */
export interface CoachStateRecord {
  stateId: string;
  userId: string;
  key: CoachStateKey;
  status: CoachStateStatus;
  source: CoachStateSource;
  /** 0..1; deterministic detectors are high-confidence, chat proposals lower, user-set 1. */
  confidence: number;
  /** Short, human-readable evidence lines; never a diagnosis. */
  evidence: string[];
  activatedAt: string;
  updatedAt: string;
  expiresAt: string | null;
  resolvedAt: string | null;
}

export type CoachStatePatch = Partial<
  Pick<
    CoachStateRecord,
    "status" | "source" | "confidence" | "evidence" | "expiresAt" | "resolvedAt" | "updatedAt"
  >
>;

export type CoachStateEventAction = "activate" | "update" | "confirm" | "resolve" | "expire" | "set";

/** Immutable transition log; the state row keeps only the latest snapshot. */
export interface CoachStateEvent {
  eventId: string;
  userId: string;
  stateId: string;
  key: CoachStateKey;
  action: CoachStateEventAction;
  fromStatus: CoachStateStatus | null;
  toStatus: CoachStateStatus;
  source: CoachStateSource;
  confidence: number;
  evidence: string[];
  createdAt: string;
}

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
  /** Stable hash of the hidden directive; a replay with a different directive is refused. */
  directiveHash: string | null;
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
  /** One activity by id, scoped to its owner. */
  getActivity(userId: string, activityId: string): Activity | undefined;
  /** Insert or replace one activity by activityId; a repeated Garmin sync updates the row instead of throwing. */
  appendActivity(activity: Activity): void;
  /** ISO timestamp of the last completed Garmin sync for this runner, or null. */
  getLastSync(userId: string): string | null;
  /** Record a completed or attempted sync so automatic sync can back off. */
  recordSync(userId: string, at: string): void;
  /** The runner's saved Garmin key, or undefined when Garmin is not connected. */
  getGarminKey(userId: string): GarminKey | undefined;
  /** Insert or replace the runner's Garmin key. */
  saveGarminKey(key: GarminKey): void;
  /** Newest first. */
  listNotifications(userId: string, limit?: number): AppNotification[];
  countUnreadNotifications(userId: string): number;
  /** Mark every unread notification for one runner as read. */
  markNotificationsRead(userId: string, at: string): void;
  /** Append one sync result to the runner's notification tray. */
  appendNotification(notification: AppNotification): void;
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
  /** Append one hidden-directive audit record. */
  appendCoachDirective(record: CoachDirectiveRecord): void;
  /** Newest first. */
  listCoachDirectives(userId: string, limit?: number): CoachDirectiveRecord[];
  /** Append one coaching state; history is kept. */
  appendCoachState(record: CoachStateRecord): void;
  /** Patch one state row; false when the row is missing or foreign. */
  updateCoachState(userId: string, stateId: string, patch: CoachStatePatch): boolean;
  /** One state row, scoped to one runner. */
  getCoachState(userId: string, stateId: string): CoachStateRecord | undefined;
  /** Newest first, including resolved history. */
  listCoachStates(userId: string, limit?: number): CoachStateRecord[];
  /** Active/observing states whose expiry has not passed, newest first. */
  getActiveCoachStates(userId: string, at: string): CoachStateRecord[];
  appendCoachStateEvent(event: CoachStateEvent): void;
  listCoachStateEvents(userId: string, limit?: number): CoachStateEvent[];
  /** Remove resolved state rows and events older than the retention cutoff. */
  pruneCoachStates(userId: string, before: string): void;
  /** Run a write batch atomically. The callback must not perform HTTP or model calls. */
  transaction<T>(work: () => T): T;
  close(): void;
}
