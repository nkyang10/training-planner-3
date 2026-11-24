/** Shared Milebook records. Every record belongs to exactly one runner. */

import type { MuscleCheckIn } from "./muscles";
import type { MuscleProposal, MuscleProposalStatus } from "./muscle-proposals";
import type { MuscleStatusControl } from "./muscle-status";

export type { MuscleCheckIn, MuscleProposal, MuscleProposalStatus, MuscleStatusControl };

export type MessageRole = "user" | "assistant";

/**
 * A standalone Milebook account. The profile is deliberately separate from the training rows: the account is created
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
  /**
   * Session version. A cookie carries the version it was minted with; bumping this value invalidates every
   * outstanding cookie for the account (password change, "sign out everywhere"). Absent means 0.
   */
  tokenVersion?: number;
}

/** The mutable part of a profile; the id, username and createdAt are immutable. */
export type UserProfilePatch = Partial<
  Pick<UserProfile, "displayName" | "passwordHash" | "timezone" | "goal" | "tokenVersion">
>;

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
  /**
   * Runner-reported post-run effort on the Borg CR10 scale, 0-10 in half steps. The manual form sets it; Garmin
   * rows and rows logged before the field existed leave it undefined. Session-RPE load (durationMin x rpe) is the
   * fallback load for runs without a Garmin training load, and rpe >= 7 counts as hard work.
   */
  rpe?: number | null;
}

/** One step of the Garmin workout an activity followed. */
export interface ActivityWorkoutStep {
  /** 1-based position in the workout; repeat rows keep their own position too. */
  index: number;
  /** Human label for the step, e.g. "Warm-up", "Run", "Recovery" or "Repeat". */
  intensity: string;
  /** Raw Garmin intensity key, kept for styling and tests. */
  intensityKey: string;
  /** Time, distance or repeat text, e.g. "10:00", "1.0 km" or "3 ×". */
  duration: string;
  /** Target text, e.g. "5:30–5:50/km"; null when the step has no target. */
  target: string | null;
}

/** "ok" = Garmin has a planned workout for the run; "none" = it has none; "unavailable" = the fetch failed. */
export type ActivityWorkoutStatus = "ok" | "none" | "unavailable";

/**
 * The Garmin workout a completed activity followed, normalized for Milebook. Garmin's Personal API returns this through
 * `GET /activity-service/activity/{id}/workouts`; the field names of that payload are not fully published, so the
 * mapper accepts the observed shape plus close variants. It is a read-only overlay: it never changes the activity.
 */
export interface ActivityWorkout {
  activityId: string;
  userId: string;
  /** The activity's day; the calendar groups program pills by it. */
  day: string;
  /** Garmin's workout name, when the payload carries one. */
  name: string | null;
  /** Short pill/peek label: the workout name, else the main repeat group, else the first step. */
  label: string;
  /** One-line human summary of the steps, e.g. "Warm-up 10:00 · 3 × 7:00 @ 5:30–5:50/km". */
  summary: string;
  steps: ActivityWorkoutStep[];
  /** Garmin's coach notes, when present. */
  notes: string | null;
  status: ActivityWorkoutStatus;
  /** Failed fetch attempts; 0 for a found workout or a confirmed "none". */
  attempts: number;
  /** ISO timestamp of the last fetch attempt. */
  fetchedAt: string;
}

/** One activity whose workout is missing or may be retried after a failed fetch. */
export interface WorkoutCandidate {
  activity: Activity;
  /** Failed attempts so far; 0 when the activity has no workout row at all. */
  attempts: number;
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
  | "session-peek"
  | "day-menu"
  | "today-strip"
  | "history"
  | "load-card"
  | "auto-sync"
  | "activity-detail"
  | "recent-changes"
  | "states-page"
  | "state-card"
  | "coach-dock"
  | "muscle-tab";

export type CoachLanguage = "auto" | "en" | "zh-Hant";
export type CoachTone = "supportive" | "direct" | "brief";

/** Server-resolved references; the gateway loads the actual rows. */
export interface CoachDirectiveReferences {
  activityId?: string;
  day?: string;
  weekStart?: string;
  sessionIds?: string[];
  /** The change set a discuss-change turn talks about, resolved from the store. */
  changeSetId?: string;
  /** The coaching state a discuss-state turn talks about, resolved from the store. */
  stateId?: string;
  /** The catalog muscle a review-muscles turn zooms in on; validated against the muscle catalog. */
  muscleId?: string;
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
  /**
   * The exact hidden suffix this turn's user message carried after the visible text (directive block plus
   * referenced context), persisted so the next turn can reproduce the same prompt bytes for the provider's
   * prefix cache. Null for plain chat turns.
   */
  renderedPromptSuffix: string | null;
  /** Calendar writes the gateway refused because the directive forbade them. */
  blockedWrites: number;
  createdAt: string;
}

/**
 * The silently maintained preference profile: what the coach learned about how this runner wants to be talked
 * to. Never rendered in the chat; the audit page is the owner's transparency surface. A null value means
 * undecided, and the prompt falls back to its per-message heuristic.
 */
export interface CoachPreferences {
  userId: string;
  /** Reply language the coach has learned, or null while it is still detecting. */
  language: Exclude<CoachLanguage, "auto"> | null;
  tone: CoachTone | null;
  replyLength: "short" | "standard" | null;
  /** What the runner calls themselves, when they have said so. */
  nickname: string | null;
  updatedAt: string;
}

/** The mutable preference fields; undefined keys are left untouched. */
export type CoachPreferencesPatch = Partial<Omit<CoachPreferences, "userId" | "updatedAt">>;

/**
 * One dated context snapshot appended to the coach conversation: the profile block and the facts as of its
 * creation day. Snapshots are append-only rows - the gateway never edits one - because the provider's prefix
 * cache requires the earlier prompt bytes to stay identical turn after turn.
 */
export interface PromptSnapshot {
  snapshotId: string;
  userId: string;
  /** sha256 of the epoch's structured parts, compared to decide whether a new snapshot is needed. */
  epoch: string;
  /** The structured epoch parts, JSON-encoded, so the refresh reasons stay derivable. */
  epochJson: string;
  /** Short reason codes for the epoch bump, e.g. ["new-day", "new-activities"]. */
  reasons: string[];
  /** The rendered context block, byte-frozen at creation. */
  body: string;
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

/**
 * What an account erasure removed. `tables` is keyed by table name; `users` is last, so a reader can see the account
 * row went too. `total` is the sum, which is what a confirmation page reports.
 */
export interface ErasureReport {
  readonly tables: Readonly<Record<string, number>>;
  readonly total: number;
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
  /** The stored Garmin workout for one activity, or undefined when it was never fetched. */
  getActivityWorkout(userId: string, activityId: string): ActivityWorkout | undefined;
  /** Insert or replace one activity workout, including a failed attempt. */
  saveActivityWorkout(workout: ActivityWorkout): void;
  /** Workouts for activities whose day is in the inclusive range, oldest first. */
  listActivityWorkouts(userId: string, fromDay: string, toDay: string): ActivityWorkout[];
  /**
   * Activities in the inclusive range whose workout is missing, or whose fetch failed fewer than maxAttempts times.
   * Newest first, so a sync enriches the runs a runner is most likely to open.
   */
  listWorkoutCandidates(
    userId: string,
    fromDay: string,
    toDay: string,
    limit: number,
    maxAttempts: number,
  ): WorkoutCandidate[];
  /** ISO timestamp of the last completed Garmin sync for this runner, or null. */
  getLastSync(userId: string): string | null;
  /** Record a completed or attempted sync so automatic sync can back off. */
  recordSync(userId: string, at: string): void;
  /** The runner's saved Garmin key, or undefined when Garmin is not connected. */
  getGarminKey(userId: string): GarminKey | undefined;
  /** Insert or replace the runner's Garmin key. */
  saveGarminKey(key: GarminKey): void;
  /** Remove the saved key; returns whether a row was deleted. */
  deleteGarminKey(userId: string): boolean;
  /** Newest first. */
  listNotifications(userId: string, limit?: number): AppNotification[];
  countUnreadNotifications(userId: string): number;
  /** Mark every unread notification for one runner as read. */
  markNotificationsRead(userId: string, at: string): void;
  /** Append one sync result to the runner's notification tray. */
  appendNotification(notification: AppNotification): void;
  /** Append one muscle check-in; check-ins are append-only, history is kept. */
  appendMuscleCheckIn(checkIn: MuscleCheckIn): void;
  /** One check-in by id, scoped to its owner. */
  getMuscleCheckIn(userId: string, checkInId: string): MuscleCheckIn | undefined;
  /** Newest first. */
  listMuscleCheckIns(userId: string, limit?: number): MuscleCheckIn[];
  /**
   * Per-muscle status controls (hold-constant and the user-claimed end). One row per muscle at most; a check-in
   * that mentions the muscle resets its control, so the stored row always belongs to the newest report.
   */
  listMuscleStatusControls(userId: string): MuscleStatusControl[];
  /** Insert or replace one muscle's status control. */
  upsertMuscleStatusControl(control: MuscleStatusControl): void;
  /** Append one coach muscle suggestion; pending rows are what the runner can still confirm or dismiss. */
  appendMuscleProposal(proposal: MuscleProposal): void;
  /** One suggestion by id, scoped to its owner. */
  getMuscleProposal(userId: string, proposalId: string): MuscleProposal | undefined;
  /** Newest first; when a status is given, only rows in that status. */
  listMuscleProposals(userId: string, status?: MuscleProposalStatus, limit?: number): MuscleProposal[];
  /** Replace one suggestion after a decision (confirmed or dismissed). */
  updateMuscleProposal(proposal: MuscleProposal): void;
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
  /**
   * The rendered prompt suffix of every recent directive turn, keyed by the message it accompanied, so prompt
   * assembly reproduces the exact bytes the provider already cached. Rows without a suffix are skipped.
   */
  listCoachDirectiveSuffixes(userId: string, limit?: number): Array<{ messageId: string; suffix: string }>;
  /** The runner's silently maintained preference profile, or undefined before the first write. */
  getCoachPreferences(userId: string): CoachPreferences | undefined;
  /** Patch the preference profile; undefined keys are left untouched. Returns the stored value. */
  patchCoachPreferences(userId: string, patch: CoachPreferencesPatch, at: string): CoachPreferences;
  /** Append one context snapshot row and prune the table to the newest few per runner. */
  appendPromptSnapshot(snapshot: PromptSnapshot): void;
  /** The newest stored snapshot, or undefined before the first one. */
  getLatestPromptSnapshot(userId: string): PromptSnapshot | undefined;
  /** Oldest first, newest last; only the pruned window. */
  listPromptSnapshots(userId: string, limit?: number): PromptSnapshot[];
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
  /**
   * Erase one account and every row it owns in one transaction: all 18 user-scoped tables, then the account row.
   * Idempotent for an unknown id (every count is zero). The same transaction records a deletion marker so an in-flight
   * sync or coach turn cannot re-insert rows for the erased id. This is the erasure path behind the profile page.
   */
  deleteAccount(userId: string, at?: string): ErasureReport;
  /** Record that an account was erased, so late writers skip the id. */
  markUserDeleted(userId: string, at: string): void;
  /** True when the id belongs to an erased account. */
  isUserDeleted(userId: string): boolean;
  /** True when a trivial query succeeds; false once the connection is closed or broken. Backs the health check. */
  ping(): boolean;
  close(): void;
}
