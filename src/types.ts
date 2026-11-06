/** Shared POC3 records. Every record belongs to exactly one runner. */

export type MessageRole = "user" | "assistant";

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

export type SessionKind = "easy" | "long" | "interval" | "tempo" | "rest" | "cross" | "race";

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

export interface Store {
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
  close(): void;
}
