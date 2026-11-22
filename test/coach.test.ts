import { describe, expect, it } from "vitest";
import {
  COACH_PROMPT_VERSION,
  COACH_TOOL,
  MAX_REPLY_CHARS,
  assembleConversation,
  buildCoachSystemPrompt,
  buildContextSnapshot,
  buildTurnSuffix,
  buildValidationFeedbackForCode,
  coachEpoch,
  epochReasons,
  parseCoachTurn,
  policyForCode,
  stripReplyStructure,
  type CoachEpochParts,
} from "../src/coach";
import { buildDirectiveForIntent } from "../src/directives";
import type {
  Activity,
  ChangeEntry,
  ChangeSet,
  CoachPreferences,
  CoachStateRecord,
  Memory,
  Message,
  TrainingSession,
} from "../src/types";

const TODAY = "2026-11-05";

const memory = (text: string): Memory => ({ memoryId: `m-${text}`, userId: "u", text, createdAt: "2026-11-05T00:00:00.000Z" });
const session = (day: string): TrainingSession => ({
  sessionId: `s-${day}`,
  userId: "u",
  day,
  title: "Easy 5 km",
  kind: "easy",
  distanceKm: 5,
  durationMin: 35,
  note: null,
  createdAt: "2026-11-05T00:00:00.000Z",
});
const activity: Activity = {
  activityId: "garmin:1",
  userId: "u",
  day: "2026-11-04",
  title: "Morning run",
  distanceKm: 4.2,
  durationMin: 28,
  paceSecPerKm: 400,
  avgHr: 150,
  source: "garmin",
  createdAt: "2026-11-04T00:00:00.000Z",
};
const message = (role: "user" | "assistant", text: string, at = "2026-11-05T08:00:00.000Z"): Message => ({
  messageId: `${role}-${text}-${at}`,
  userId: "u",
  role,
  text,
  createdAt: at,
});
const changeSet = (changeSetId: string, summary: string, revertedAt: string | null = null): ChangeSet => ({
  changeSetId,
  userId: "u",
  createdAt: "2026-11-05T00:00:00.000Z",
  summary,
  entries: [],
  revertedAt,
});
const SUGGESTIONS = ["Book my long run for Sunday", "Move Thursday to Friday"];

const preferences = (overrides: Partial<CoachPreferences> = {}): CoachPreferences => ({
  userId: "u",
  language: null,
  tone: null,
  replyLength: null,
  nickname: null,
  updatedAt: "2026-11-05T00:00:00.000Z",
  ...overrides,
});

const snapshotInput = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  today: TODAY,
  timezone: "UTC",
  memories: [memory("prefers mornings")],
  sessions: [session("2026-11-06")],
  activities: [activity],
  recentChanges: [changeSet("change:9", 'move "Long 8 km" 2026-11-07 → 2026-11-09')],
  ...overrides,
});

describe("coach turn", () => {
  it("accepts a grounded turn with memories and future sessions", () => {
    const result = parseCoachTurn(
      {
        reply: "I booked an easy week and remembered your 10k goal.",
        memories: ["Training for a 10k in 8 weeks"],
        sessions: [{ day: "2026-11-06", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35, note: "keep it conversational" }],
        suggestions: SUGGESTIONS,
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turn.sessions[0]?.day).toBe("2026-11-06");
      expect(result.turn.memories).toHaveLength(1);
      expect(result.turn.suggestions).toEqual(SUGGESTIONS);
      expect(result.turn.revertChangeSetId).toBeNull();
      expect(result.turn.profileUpdates).toEqual({});
    }
  });

  it("rejects a past session, an unknown kind and extra keys", () => {
    const past = parseCoachTurn({ reply: "x", sessions: [{ day: "2026-11-04", title: "Run", kind: "easy" }] }, TODAY);
    expect(past).toMatchObject({ ok: false, code: "past-session" });
    const kind = parseCoachTurn({ reply: "x", sessions: [{ day: "2026-11-06", title: "Run", kind: "sprint" }] }, TODAY);
    expect(kind).toMatchObject({ ok: false, code: "invalid-session-kind" });
    const extra = parseCoachTurn({ reply: "x", mood: "good" }, TODAY);
    expect(extra).toMatchObject({ ok: false, code: "extra-keys" });
  });

  it("rejects an empty reply and a too-distant session", () => {
    expect(parseCoachTurn({ reply: "  " }, TODAY)).toMatchObject({ ok: false, code: "invalid-reply" });
    expect(parseCoachTurn({ reply: "x", sessions: [{ day: "2027-06-01", title: "Run", kind: "easy" }] }, TODAY)).toMatchObject({
      ok: false,
      code: "session-too-far",
    });
  });

  it("uses the respect-directive policy for comment-only write failures", () => {
    expect(policyForCode("comment-only-write")).toBe("respect-directive");
    const feedback = buildValidationFeedbackForCode(
      "comment-only-write",
      "this turn is comment-only",
      TODAY,
      "UTC",
      1,
      2,
    );
    expect(feedback.policy).toBe("respect-directive");
  });
});

describe("reply style contract (LL-1)", () => {
  it("caps the reply at 480 characters and maps oversize to a repairable code", () => {
    expect(MAX_REPLY_CHARS).toBe(480);
    const long = parseCoachTurn({ reply: "x".repeat(481), suggestions: ["a"] }, TODAY);
    expect(long).toMatchObject({ ok: false, code: "reply-too-long" });
    if (!long.ok) expect(long.policy).toBe("repair-format");
    expect(policyForCode("reply-too-long")).toBe("repair-format");
    const huge = parseCoachTurn({ reply: "y".repeat(2000), suggestions: ["a"] }, TODAY);
    expect(huge).toMatchObject({ ok: false, code: "reply-too-long" });
  });

  it("strips markdown structure from the reply before validating", () => {
    const result = parseCoachTurn(
      {
        reply: "## Week review\n\n- ran 5 km easy\n- felt good\n\n**Keep it easy.**",
        suggestions: ["Book Sunday"],
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turn.reply).toBe("Week review\n\nran 5 km easy\nfelt good\n\nKeep it easy.");
    }
  });

  it("strips bold wrappers, block quotes and numbered lists deterministically", () => {
    expect(stripReplyStructure("**bold** and __also__")).toBe("bold and also");
    expect(stripReplyStructure("> quoted line")).toBe("quoted line");
    expect(stripReplyStructure("1. first\n2. second")).toBe("first\nsecond");
    expect(stripReplyStructure("a\n\n\n\nb")).toBe("a\n\nb");
    expect(stripReplyStructure("  spaced  ")).toBe("spaced");
  });

  it("accepts a four-sentence reply under the cap", () => {
    const reply = "Sunday works. Your week is light. I moved the long run. Keep the rest day.";
    const result = parseCoachTurn({ reply, suggestions: ["Book Sunday"] }, TODAY);
    expect(result.ok).toBe(true);
  });
});

describe("coach system prompt (segment A)", () => {
  const prompt = buildCoachSystemPrompt();

  it("is byte-stable per deploy and carries no per-turn data", () => {
    expect(buildCoachSystemPrompt()).toBe(prompt);
    expect(prompt).not.toContain(TODAY);
    expect(prompt).not.toContain("[Coach context");
  });

  it("casts the coach as a consultant and training friend, never a teacher or taskmaster", () => {
    expect(prompt).toContain("You are the runner's consultant and training friend");
    expect(prompt).toContain("not their teacher or taskmaster");
    expect(prompt).toContain("The runner asks; you respond");
    expect(prompt).toContain("never lecture, never moralize, never grade effort");
    // The bilingual language hierarchy: the message's script wins, the learned profile fills bare follow-ups.
    expect(prompt).toContain("if the latest message contains Chinese characters, reply in Traditional Chinese");
    expect(prompt).toContain("use the language the newest Runner profile block names when it names one");
    expect(prompt).not.toContain("You are the runner's AI coach.");
  });

  it("sets the peer voice: short spoken sentences, no lists, no markdown", () => {
    expect(prompt).toContain("Write like you speak: 2-4 short sentences, usually 2, and at most one question");
    expect(prompt).toContain("No headings, no numbered lists, no bullet lists, no markdown");
    expect(prompt).toContain("Be warm and specific");
  });

  it("obeys the learned tone and reply length", () => {
    expect(prompt).toContain("tone (supportive, direct, brief) and replyLength (short, standard)");
    expect(prompt).toContain("brief tone or short length means one or two sentences");
  });

  it("tells the coach to learn preferences silently, never announcing them", () => {
    expect(prompt).toContain("set profileUpdates and simply start using it");
    expect(prompt).toContain("never announce the update and never ask permission for it");
    expect(prompt).toContain("do not ask the runner to curate or approve memories");
  });

  it("keeps the goal-alignment rule", () => {
    expect(prompt).toContain("keep the plan aligned with it");
  });

  it("states the snapshot authority and the staleness contract", () => {
    expect(prompt).toContain("The newest context block is authoritative for today, weekday, timezone, tomorrow and the booking horizon");
    expect(prompt).toContain("Older context blocks are history");
    expect(prompt).toContain("trust their message over the block");
    expect(prompt).toContain("a run they just did, a change they made by hand, fresh soreness");
  });

  it("keeps the consultant-first protocol with suggestions carrying the menu", () => {
    expect(prompt).toContain("respond as a consultant");
    expect(prompt).toContain("what their recent facts show (volume, load, consistency)");
    expect(prompt).toContain("the tappable suggestions carry the menu, your reply carries the advice");
    expect(prompt).toContain(
      "Book sessions in the same turn only when the message itself explicitly asks to add, move, change or delete a session",
    );
    expect(prompt).toContain("Chit-chat is fine; notice the training intent inside it");
  });

  it("keeps the safety, honesty and calendar-write rules", () => {
    expect(prompt).toContain("Never diagnose, prescribe calories or weight, or guarantee a result");
    expect(prompt).toContain("Answer with exactly one JSON object");
    expect(prompt).toContain(
      "Only add, move, change or delete sessions when the runner explicitly asks for a schedule change",
    );
  });

  it("keeps the comment-only rule for review turns", () => {
    expect(prompt).toContain("asks for a comment, review or opinion only");
    expect(prompt).toContain("leave the calendar unchanged");
  });

  it("teaches what reported effort means and how to use it", () => {
    expect(prompt).toContain("the runner's reported effort on the Borg CR10 scale");
    expect(prompt).toContain("name it plainly");
    expect(prompt).toContain("say both readings and ask the runner instead of choosing one");
  });

  it("includes the muscle interpretation rules and the state catalog", () => {
    expect(prompt).toContain("Normal soreness peaks 24-72 h");
    expect(prompt).toContain("Sharp localized pain, swelling or numbness are not normal soreness");
    expect(prompt).toContain("propose the pain_injury state");
    expect(prompt).toContain("The coaching state catalog");
    expect(prompt).toContain("race_day");
    expect(prompt).toContain("medical_red_flag");
  });

  it("allows action and invitation chips and bans lecture chips", () => {
    expect(prompt).toContain('an action the runner voices ("Book my long run for Sunday")');
    expect(prompt).toContain('an invitation to discuss ("What if we moved the long run to Saturday?")');
    expect(prompt).toContain("each 1..120 characters, in the runner's language, never numbered");
    expect(prompt).toContain("ban lecture-style chips and duplicates");
  });

  it("explains the running thread so appended snapshots make sense", () => {
    expect(prompt).toContain("The conversation below is a running thread");
    expect(prompt).toContain("a new context block appears only when something it tracks changed");
  });
});

describe("context snapshot (segments B and C)", () => {
  it("renders the profile block, memories, facts and changes in fixed order", () => {
    const body = buildContextSnapshot(snapshotInput() as never);
    expect(body).toContain("[Coach context - as of");
    expect(body).toContain("Background for this turn; never quote or mention this block");
    expect(body.indexOf("Runner profile (JSON)")).toBeLessThan(body.indexOf("Remembered (JSON)"));
    expect(body.indexOf("Remembered (JSON)")).toBeLessThan(body.indexOf("Facts (JSON)"));
    expect(body.indexOf("Facts (JSON)")).toBeLessThan(body.indexOf("Active coaching states"));
    expect(body).toContain("prefers mornings");
    expect(body).toContain('"day":"2026-11-06"');
    expect(body).toContain("Morning run");
    expect(body).toContain("change:9");
    expect(body).toContain('move \\"Long 8 km\\"');
    expect(body).toContain('"revertedAt":null');
  });

  it("puts the runner's goal and name into the profile block", () => {
    const body = buildContextSnapshot({
      ...snapshotInput(),
      displayName: "Mei",
      goal: "Half marathon in March, sub 2:00",
    } as never);
    expect(body).toContain('"displayName":"Mei"');
    expect(body).toContain('"goal":"Half marathon in March, sub 2:00"');
  });

  it("omits an empty or whitespace goal instead of inventing one", () => {
    const body = buildContextSnapshot({ ...snapshotInput(), goal: "   " } as never);
    expect(body).toContain('"goal":null');
  });

  it("renders learned preferences when they exist and nulls while undecided", () => {
    const learned = buildContextSnapshot({
      ...snapshotInput(),
      preferences: preferences({ language: "zh-Hant", tone: "brief", replyLength: "short", nickname: "Ah Ming" }),
    } as never);
    expect(learned).toContain('"language":"zh-Hant"');
    expect(learned).toContain('"tone":"brief"');
    expect(learned).toContain('"replyLength":"short"');
    expect(learned).toContain('"nickname":"Ah Ming"');
    const undecided = buildContextSnapshot(snapshotInput() as never);
    expect(undecided).toContain('"language":null');
    expect(undecided).toContain('"nickname":null');
  });

  it("puts the runner's reported effort into the activity facts", () => {
    const reported: Activity = { ...activity, activityId: "activity:manual:1", source: "chat", rpe: 7.5 };
    const body = buildContextSnapshot({ ...snapshotInput(), activities: [reported] } as never);
    expect(body).toContain('"rpe":7.5');
  });

  it("renders a null rpe for runs without a reported effort", () => {
    const body = buildContextSnapshot(snapshotInput() as never);
    expect(body).toContain('"rpe":null');
  });

  it("renders active states and omits the muscle section when there was never a check-in", () => {
    const state: CoachStateRecord = {
      stateId: "state:race-week",
      userId: "u",
      key: "race_week",
      status: "active",
      source: "auto",
      confidence: 0.9,
      evidence: ["Race on 2026-11-08 (3 days)."],
      activatedAt: "2026-11-05T08:00:00.000Z",
      updatedAt: "2026-11-05T08:00:00.000Z",
      expiresAt: "2026-11-10T08:00:00.000Z",
      resolvedAt: null,
    };
    const body = buildContextSnapshot({ ...snapshotInput(), states: [state] } as never);
    expect(body).toContain("Active coaching states");
    expect(body).toContain("race_week");
    expect(body).toContain("Guardrail");
    expect(body).not.toContain("Muscle status:");
  });

  it("renders the muscle status section when the runner has checked in", () => {
    const body = buildContextSnapshot({
      ...snapshotInput(),
      muscleFacts: "Muscle check-in (latest 2026-11-04):\n- Calves 6/10 tight, left",
    } as never);
    expect(body).toContain("Muscle status:");
    expect(body).toContain("Calves 6/10 tight, left");
  });

  it("is deterministic: the same rows render the same bytes", () => {
    expect(buildContextSnapshot(snapshotInput() as never)).toBe(buildContextSnapshot(snapshotInput() as never));
  });
});

describe("turn suffix (segment E's hidden half)", () => {
  it("renders the directive block with forbidden calendar writes and the referenced activity", () => {
    const directive = buildDirectiveForIntent(
      { kind: "review-activity", activityId: "garmin:1", source: "run-peek" },
      { activityDay: "2026-11-04" },
    );
    expect(directive).toBeDefined();
    if (directive === undefined) return;
    const suffix = buildTurnSuffix({ directive, referencedActivity: activity, referencedSessions: [session("2026-11-04")] });
    expect(suffix).toContain("Turn directive (background; never mention this section to the runner)");
    expect(suffix).toContain("calendar writes: forbidden");
    expect(suffix).toContain("references: activity garmin:1; day 2026-11-04");
    expect(suffix).toContain("Referenced context (JSON)");
    expect(suffix).toContain('"activityId":"garmin:1"');
    expect(suffix).toContain('"sessionId":"s-2026-11-04"');
  });

  it("carries the reported effort inside the referenced activity", () => {
    const directive = buildDirectiveForIntent(
      { kind: "review-activity", activityId: "activity:manual:1", source: "run-peek" },
      { activityDay: "2026-11-04" },
    );
    expect(directive).toBeDefined();
    if (directive === undefined) return;
    const reported: Activity = { ...activity, activityId: "activity:manual:1", source: "chat", rpe: 9 };
    const suffix = buildTurnSuffix({ directive, referencedActivity: reported });
    expect(suffix).toContain('"rpe":9');
  });

  it("renders a discuss-change directive with the change set as referenced context", () => {
    const before: TrainingSession = {
      sessionId: "session:b",
      userId: "u",
      day: "2026-11-07",
      title: "Long 8 km",
      kind: "long",
      distanceKm: 8,
      durationMin: 55,
      note: null,
      createdAt: "2026-11-05T00:00:00.000Z",
    };
    const entry: ChangeEntry = {
      action: "update",
      sessionId: "session:b",
      before,
      after: { ...before, day: "2026-11-09" },
      fromDay: "2026-11-07",
      toDay: "2026-11-09",
      title: "Long 8 km",
      kind: "long",
    };
    const record: ChangeSet = {
      changeSetId: "change:9",
      userId: "u",
      createdAt: "2026-11-05T07:00:00.000Z",
      summary: 'move "Long 8 km" 2026-11-07 → 2026-11-09',
      entries: [entry],
      revertedAt: null,
    };
    const directive = buildDirectiveForIntent({ kind: "discuss-change", changeSetId: "change:9", source: "recent-changes" });
    expect(directive).toBeDefined();
    if (directive === undefined) return;
    const suffix = buildTurnSuffix({ directive, referencedChangeSet: record });
    expect(suffix).toContain("references: change set change:9");
    expect(suffix).toContain("Discuss what the referenced change set did and why the plan moved that way");
    expect(suffix).toContain("This turn is comment-only");
    expect(suffix).toContain('"changeSetId":"change:9"');
    expect(suffix).toContain('"toDay":"2026-11-09"');
  });

  it("renders a discuss-state directive with the state as referenced context", () => {
    const record: CoachStateRecord = {
      stateId: "state:heat",
      userId: "u",
      key: "heat",
      status: "active",
      source: "user",
      confidence: 1,
      evidence: ["Hot week"],
      activatedAt: "2026-11-04T07:00:00.000Z",
      updatedAt: "2026-11-04T07:00:00.000Z",
      expiresAt: "2026-11-12T00:00:00.000Z",
      resolvedAt: null,
    };
    const directive = buildDirectiveForIntent({ kind: "discuss-state", stateId: "state:heat", source: "state-card" });
    expect(directive).toBeDefined();
    if (directive === undefined) return;
    const suffix = buildTurnSuffix({ directive, referencedState: record });
    expect(suffix).toContain("references: state state:heat");
    expect(suffix).toContain("offer options, not orders");
    expect(suffix).toContain('"stateId":"state:heat"');
    expect(suffix).toContain("Hot week");
  });

  it("carries the referenced muscle knowledge for a review-muscles turn", () => {
    const directive = buildDirectiveForIntent({ kind: "review-muscles", muscleId: "calves", source: "muscle-tab" });
    expect(directive).toBeDefined();
    if (directive === undefined) return;
    const suffix = buildTurnSuffix({
      directive,
      referencedMuscle: "Referenced muscle: Calves (legs)\nFunction: Spring the foot off the ground.",
    });
    expect(suffix).toContain("Referenced muscle: Calves (legs)");
    expect(suffix).toContain("Spring the foot off the ground");
  });
});

describe("conversation assembly (segments C, D and E)", () => {
  const snapshot = {
    createdAt: "2026-11-05T07:00:00.000Z",
    body: buildContextSnapshot(snapshotInput() as never),
  };

  it("date-stamps every message and ends with the turn message", () => {
    const history = [message("user", "I ran 5 km yesterday"), message("assistant", "Nice, keep it easy")];
    const assembly = assembleConversation({
      history,
      timezone: "UTC",
      snapshots: [snapshot],
      latestSnapshot: snapshot,
      turn: { text: "What next?", createdAt: "2026-11-05T09:00:00.000Z" },
    });
    expect(assembly.compacted).toBe(false);
    const contents = assembly.messages.map((entry) => entry.content);
    expect(assembly.messages[0]?.role).toBe("user");
    expect(assembly.messages[0]?.content).toBe(snapshot.body);
    expect(assembly.messages[1]?.content).toContain("I ran 5 km yesterday");
    expect(assembly.messages[1]?.content).toMatch(/^\[/);
    expect(assembly.messages[2]?.content).toContain("Nice, keep it easy");
    const last = assembly.messages[assembly.messages.length - 1];
    expect(last?.role).toBe("user");
    expect(last?.content).toContain("What next?");
  });

  it("reproduces a directive turn's suffix bytes from the stored suffix map", () => {
    const directive = buildDirectiveForIntent(
      { kind: "review-activity", activityId: "garmin:1", source: "run-peek" },
      { activityDay: "2026-11-04" },
    );
    expect(directive).toBeDefined();
    if (directive === undefined) return;
    const suffix = buildTurnSuffix({ directive, referencedActivity: activity });
    const asked = message("user", "How did my Morning run go?", "2026-11-05T09:00:00.000Z");
    const first = assembleConversation({
      history: [],
      timezone: "UTC",
      snapshots: [snapshot],
      latestSnapshot: snapshot,
      turn: { text: asked.text, createdAt: asked.createdAt, suffix },
    });
    const reproduced = assembleConversation({
      history: [asked],
      timezone: "UTC",
      suffixes: new Map([[asked.messageId, suffix]]),
      snapshots: [snapshot],
      latestSnapshot: snapshot,
      turn: { text: "Thanks", createdAt: "2026-11-05T10:00:00.000Z" },
    });
    // The historical message carries the same suffix bytes the live turn sent, so the next request's prefix is
    // byte-identical for the provider's cache.
    const liveContent = first.messages[first.messages.length - 1]?.content;
    const storedContent = reproduced.messages.find((entry) => entry.content.includes("How did my Morning run go?"))?.content;
    expect(storedContent).toBe(liveContent);
    expect(storedContent).toContain("Turn directive (background");
  });

  it("keeps the prefix byte-identical when only the conversation grows", () => {
    const historyA = [message("user", "Plan my week"), message("assistant", "Your week is light")];
    const turnA = assembleConversation({
      history: historyA,
      timezone: "UTC",
      snapshots: [snapshot],
      latestSnapshot: snapshot,
      turn: { text: "Book Sunday", createdAt: "2026-11-05T09:00:00.000Z" },
    });
    const historyB = [
      ...historyA,
      message("user", "Book Sunday", "2026-11-05T09:00:00.000Z"),
      message("assistant", "Booked.", "2026-11-05T09:01:00.000Z"),
    ];
    const turnB = assembleConversation({
      history: historyB,
      timezone: "UTC",
      snapshots: [snapshot],
      latestSnapshot: snapshot,
      turn: { text: "Move it to Saturday", createdAt: "2026-11-05T10:00:00.000Z" },
    });
    expect(turnB.messages.slice(0, turnA.messages.length)).toEqual(turnA.messages);
  });

  it("appends a newer snapshot after the old conversation instead of rewriting it", () => {
    const historyA = [message("user", "Plan my week")];
    const turnA = assembleConversation({
      history: historyA,
      timezone: "UTC",
      snapshots: [snapshot],
      latestSnapshot: snapshot,
      turn: { text: "Book Sunday", createdAt: "2026-11-05T09:00:00.000Z" },
    });
    const newerSnapshot = {
      createdAt: "2026-11-06T07:00:00.000Z",
      body: buildContextSnapshot({ ...snapshotInput(), today: "2026-11-06" } as never),
    };
    const historyB = [
      ...historyA,
      message("user", "Book Sunday", "2026-11-05T09:00:00.000Z"),
      message("assistant", "Booked.", "2026-11-05T09:01:00.000Z"),
      message("user", "Synced a new run", "2026-11-06T09:00:00.000Z"),
    ];
    const turnB = assembleConversation({
      history: historyB,
      timezone: "UTC",
      snapshots: [snapshot, newerSnapshot],
      latestSnapshot: newerSnapshot,
      turn: { text: "How did it go?", createdAt: "2026-11-06T09:05:00.000Z" },
    });
    // The old prefix survives; the new snapshot lands after the old conversation, never rewriting it.
    expect(turnB.messages.slice(0, turnA.messages.length)).toEqual(turnA.messages);
    const newerIndex = turnB.messages.findIndex((entry) => entry.content === newerSnapshot.body);
    expect(newerIndex).toBe(4);
    expect(turnB.messages[newerIndex - 1]?.content).toContain("Booked.");
    expect(turnB.messages[newerIndex + 1]?.content).toContain("Synced a new run");
  });

  it("always includes the newest snapshot even when it is older than the history window", () => {
    const oldHistory = Array.from({ length: 3 }, (_, index) =>
      message("user", `older ${index}`, `2026-11-05T0${index}:30:00.000Z`),
    );
    const assembly = assembleConversation({
      history: oldHistory,
      timezone: "UTC",
      snapshots: [],
      latestSnapshot: snapshot,
      turn: { text: "Hi again", createdAt: "2026-11-05T11:00:00.000Z" },
    });
    expect(assembly.messages.some((entry) => entry.content === snapshot.body)).toBe(true);
  });

  it("drops the oldest history messages first when the token budget overflows", () => {
    const history = Array.from({ length: 12 }, (_, index) =>
      message("user", `m${index} ${"x".repeat(4000)}`, `2026-11-05T${String(index).padStart(2, "0")}:30:00.000Z`),
    );
    const assembly = assembleConversation({
      history,
      timezone: "UTC",
      snapshots: [snapshot],
      latestSnapshot: snapshot,
      turn: { text: "Hello", createdAt: "2026-11-05T23:00:00.000Z" },
    });
    expect(assembly.compacted).toBe(true);
    const historyMessages = assembly.messages.filter((entry) => /\] m\d+ /.test(entry.content));
    // It keeps the newest ten messages (the assembly floor) and never drops the snapshot or the turn.
    expect(historyMessages).toHaveLength(10);
    expect(historyMessages.some((entry) => entry.content.includes("] m11 "))).toBe(true);
    expect(historyMessages.some((entry) => entry.content.includes("] m0 "))).toBe(false);
    expect(assembly.messages.some((entry) => entry.content === snapshot.body)).toBe(true);
    expect(assembly.messages[assembly.messages.length - 1]?.content).toContain("Hello");
  });
});

describe("prompt epoch (LL-3)", () => {
  const parts: CoachEpochParts = {
    promptVersion: COACH_PROMPT_VERSION,
    today: TODAY,
    latestChangeSetId: null,
    latestActivityId: null,
    activityCount: 0,
    latestMuscleCheckInId: null,
    activeStateKeys: [],
    memoryIds: [],
    profileKey: "p",
    preferenceKey: "q",
  };

  it("hashes equal parts to the same epoch", () => {
    expect(coachEpoch(parts)).toBe(coachEpoch({ ...parts }));
    expect(coachEpoch(parts)).toHaveLength(64);
  });

  it("reports the first turn and the coach update before anything else", () => {
    expect(epochReasons(null, parts)).toEqual(["first-turn"]);
    expect(epochReasons(parts, { ...parts, promptVersion: "older" })).toEqual(["coach-updated"]);
  });

  it("derives one reason per changed part, in the client's loading-line order", () => {
    expect(epochReasons(parts, { ...parts, today: "2026-11-06" })).toEqual(["new-day"]);
    expect(epochReasons(parts, { ...parts, latestActivityId: "garmin:9", activityCount: 1 })).toEqual(["new-activities"]);
    expect(epochReasons(parts, { ...parts, activityCount: 3 })).toEqual(["new-activities"]);
    expect(epochReasons(parts, { ...parts, latestMuscleCheckInId: "check:2" })).toEqual(["new-muscle-check-in"]);
    expect(epochReasons(parts, { ...parts, latestChangeSetId: "change:2" })).toEqual(["calendar-changed"]);
    expect(epochReasons(parts, { ...parts, activeStateKeys: ["taper"] })).toEqual(["states-changed"]);
    expect(epochReasons(parts, { ...parts, memoryIds: ["m1"] })).toEqual(["memories-updated"]);
    expect(epochReasons(parts, { ...parts, profileKey: "p2" })).toEqual(["profile-updated"]);
    expect(epochReasons(parts, { ...parts, preferenceKey: "q2" })).toEqual(["profile-updated"]);
    expect(epochReasons(parts, parts)).toEqual([]);
  });
});

describe("silent profile updates (LL-5)", () => {
  it("parses valid preference updates and trims the nickname", () => {
    const result = parseCoachTurn(
      {
        reply: "Noted, I will keep it brief.",
        suggestions: ["Book Sunday"],
        profileUpdates: { language: "zh-Hant", tone: "brief", replyLength: "short", nickname: "  Ah Ming  " },
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turn.profileUpdates).toEqual({
        language: "zh-Hant",
        tone: "brief",
        replyLength: "short",
        nickname: "Ah Ming",
      });
    }
  });

  it("treats null preference values as absent", () => {
    const result = parseCoachTurn(
      { reply: "OK.", suggestions: ["Book Sunday"], profileUpdates: { language: null, tone: null } },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn.profileUpdates).toEqual({});
  });

  it("rejects unknown preference keys and invalid values", () => {
    expect(
      parseCoachTurn({ reply: "x", suggestions: ["a"], profileUpdates: { mood: "bright" } }, TODAY),
    ).toMatchObject({ ok: false, code: "invalid-profile-update-key" });
    expect(
      parseCoachTurn({ reply: "x", suggestions: ["a"], profileUpdates: { language: "zh-HK" } }, TODAY),
    ).toMatchObject({ ok: false, code: "invalid-profile-language" });
    expect(
      parseCoachTurn({ reply: "x", suggestions: ["a"], profileUpdates: { tone: "angry" } }, TODAY),
    ).toMatchObject({ ok: false, code: "invalid-profile-tone" });
    expect(
      parseCoachTurn({ reply: "x", suggestions: ["a"], profileUpdates: { replyLength: "tiny" } }, TODAY),
    ).toMatchObject({ ok: false, code: "invalid-profile-length" });
    expect(
      parseCoachTurn({ reply: "x", suggestions: ["a"], profileUpdates: { nickname: "n".repeat(41) } }, TODAY),
    ).toMatchObject({ ok: false, code: "invalid-profile-nickname" });
    expect(
      parseCoachTurn({ reply: "x", suggestions: ["a"], profileUpdates: "brief" }, TODAY),
    ).toMatchObject({ ok: false, code: "invalid-profile-updates" });
  });

  it("exposes profileUpdates in the tool schema without requiring it", () => {
    const parameters = COACH_TOOL.function.parameters;
    const properties = parameters.properties;
    expect(properties).toHaveProperty("profileUpdates");
    expect(parameters.required).not.toContain("profileUpdates");
    const updates = properties.profileUpdates;
    expect(updates.additionalProperties).toBe(false);
    expect(updates.properties.language.enum).toEqual(["en", "zh-Hant"]);
    expect(updates.properties.tone.enum).toEqual(["supportive", "direct", "brief"]);
    expect(updates.properties.replyLength.enum).toEqual(["short", "standard"]);
    expect(updates.properties.nickname.maxLength).toBe(40);
  });
});

describe("coach suggestions", () => {
  it("accepts 1-3 suggestions and trims them", () => {
    const result = parseCoachTurn({ reply: "x", suggestions: ["  Book Sunday  ", "Move Thursday"] }, TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn.suggestions).toEqual(["Book Sunday", "Move Thursday"]);
    const three = parseCoachTurn({ reply: "x", suggestions: ["a", "b", "c"] }, TODAY);
    expect(three.ok).toBe(true);
  });

  it("rejects missing, empty, oversized or too many suggestions", () => {
    expect(parseCoachTurn({ reply: "x" }, TODAY)).toMatchObject({ ok: false, code: "invalid-suggestions" });
    expect(parseCoachTurn({ reply: "x", suggestions: [] }, TODAY)).toMatchObject({ ok: false, code: "invalid-suggestions" });
    expect(parseCoachTurn({ reply: "x", suggestions: ["a", "b", "c", "d"] }, TODAY)).toMatchObject({
      ok: false,
      code: "invalid-suggestions",
    });
    expect(parseCoachTurn({ reply: "x", suggestions: [""] }, TODAY)).toMatchObject({ ok: false, code: "invalid-suggestion" });
    expect(parseCoachTurn({ reply: "x", suggestions: ["a".repeat(121)] }, TODAY)).toMatchObject({
      ok: false,
      code: "invalid-suggestion",
    });
    expect(parseCoachTurn({ reply: "x", suggestions: [42] }, TODAY)).toMatchObject({ ok: false, code: "invalid-suggestion" });
  });
});

describe("coach schedule actions", () => {
  it("accepts update and remove actions that name a session", () => {
    const result = parseCoachTurn(
      {
        reply: "Moved Friday and removed Sunday.",
        sessions: [
          { action: "update", sessionId: "session:a", day: "2026-11-07", title: "Easy 4 km", kind: "easy", distanceKm: 4, durationMin: 30 },
          { action: "remove", sessionId: "session:b" },
        ],
        suggestions: ["Book an easy run for Sunday"],
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turn.sessions[0]?.action).toBe("update");
      expect(result.turn.sessions[0]?.sessionId).toBe("session:a");
      expect(result.turn.sessions[1]?.action).toBe("remove");
    }
  });

  it("rejects an update without a session id and an unknown action", () => {
    expect(parseCoachTurn({ reply: "x", sessions: [{ action: "update", day: "2026-11-07", title: "Run", kind: "easy" }] }, TODAY)).toMatchObject({
      ok: false,
      code: "missing-session-id",
    });
    expect(parseCoachTurn({ reply: "x", sessions: [{ action: "delete", day: "2026-11-07" }] }, TODAY)).toMatchObject({
      ok: false,
      code: "invalid-action",
    });
  });
});

describe("coach revert", () => {
  it("accepts a revert id and keeps it separate from sessions", () => {
    const last = parseCoachTurn({ reply: "Putting it back.", suggestions: ["Plan the week again"], revertChangeSetId: "last" }, TODAY);
    expect(last.ok).toBe(true);
    if (last.ok) {
      expect(last.turn.revertChangeSetId).toBe("last");
      expect(last.turn.sessions).toEqual([]);
    }
    const explicit = parseCoachTurn(
      { reply: "Undone.", suggestions: ["Check Sunday"], revertChangeSetId: "change:9f2a-1b" },
      TODAY,
    );
    expect(explicit.ok).toBe(true);
    if (explicit.ok) expect(explicit.turn.revertChangeSetId).toBe("change:9f2a-1b");
  });

  it("rejects a malformed revert id", () => {
    expect(parseCoachTurn({ reply: "x", suggestions: ["a"], revertChangeSetId: 42 }, TODAY)).toMatchObject({
      ok: false,
      code: "invalid-revert",
    });
    expect(parseCoachTurn({ reply: "x", suggestions: ["a"], revertChangeSetId: "" }, TODAY)).toMatchObject({
      ok: false,
      code: "invalid-revert",
    });
    expect(parseCoachTurn({ reply: "x", suggestions: ["a"], revertChangeSetId: "two words" }, TODAY)).toMatchObject({
      ok: false,
      code: "invalid-revert",
    });
    expect(parseCoachTurn({ reply: "x", suggestions: ["a"], revertChangeSetId: "x".repeat(101) }, TODAY)).toMatchObject({
      ok: false,
      code: "invalid-revert",
    });
  });
});

describe("coaching state proposals", () => {
  it("parses a valid state proposal with an optional note", () => {
    const result = parseCoachTurn(
      {
        reply: "Noted.",
        suggestions: ["Plan the week"],
        stateProposals: [
          {
            key: "travel",
            action: "activate",
            confidence: 0.8,
            evidence: ["Travelling next week"],
            ttlDays: 10,
            note: "Tokyo",
          },
        ],
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turn.stateProposals).toHaveLength(1);
      expect(result.turn.stateProposals[0]).toMatchObject({
        key: "travel",
        action: "activate",
        confidence: 0.8,
        evidence: ["Travelling next week"],
        ttlDays: 10,
        note: "Tokyo",
      });
    }
  });

  it("rejects unknown, malformed and excessive state proposals", () => {
    const invalid = (stateProposals: unknown): unknown =>
      parseCoachTurn({ reply: "x", suggestions: ["Plan"], stateProposals }, TODAY);
    expect(
      invalid([{ key: "mode: race week", action: "activate", confidence: 0.8, evidence: ["x"], ttlDays: 7, note: null }]),
    ).toMatchObject({ ok: false, code: "invalid-state-key" });
    expect(
      invalid([{ key: "travel", action: "keep", confidence: 0.8, evidence: ["x"], ttlDays: 7, note: null }]),
    ).toMatchObject({ ok: false, code: "invalid-state-action" });
    expect(
      invalid([{ key: "travel", action: "activate", confidence: 0.2, evidence: ["x"], ttlDays: 7, note: null }]),
    ).toMatchObject({ ok: false, code: "invalid-state-confidence" });
    expect(
      invalid([{ key: "travel", action: "activate", confidence: 0.8, evidence: [], ttlDays: 7, note: null }]),
    ).toMatchObject({ ok: false, code: "invalid-state-evidence" });
    expect(
      invalid([{ key: "travel", action: "activate", confidence: 0.8, evidence: ["x"], ttlDays: 400, note: null }]),
    ).toMatchObject({ ok: false, code: "invalid-state-ttl" });
    expect(invalid("travel")).toMatchObject({ ok: false, code: "invalid-state-proposals" });
    const four = Array.from({ length: 4 }, () => ({
      key: "travel",
      action: "activate",
      confidence: 0.8,
      evidence: ["x"],
      ttlDays: 7,
      note: null,
    }));
    expect(invalid(four)).toMatchObject({ ok: false, code: "invalid-state-proposals" });
    expect(invalid([42])).toMatchObject({ ok: false, code: "invalid-state-proposal" });
  });

  it("exposes the state keys in the tool schema", () => {
    const properties = COACH_TOOL.function.parameters.properties;
    expect(properties).toHaveProperty("stateProposals");
    const proposals = properties.stateProposals;
    expect(proposals.type).toBe("array");
    expect(proposals.maxItems).toBe(3);
    expect(proposals.items.properties.key.enum).toContain("race_week");
    expect(proposals.items.properties.key.enum).toContain("pain_injury");
    expect(proposals.items.properties.action.enum).toEqual(["activate", "resolve"]);
  });

  it("maps a state guardrail failure to a repair instruction that respects the state", () => {
    expect(policyForCode("mode-guardrail")).toBe("respect-state");
    const feedback = buildValidationFeedbackForCode(
      "mode-guardrail",
      "blocked by race week",
      TODAY,
      "UTC",
      1,
      2,
      [{ path: "sessions[0].kind", code: "mode-guardrail", message: "No hard sessions", rejectedValue: "tempo" }],
      "respect-state",
    );
    expect(feedback.policy).toBe("respect-state");
  });
});

describe("muscle-condition suggestions", () => {
  const proposal = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    action: "report",
    muscleId: "calves",
    soreness: 6,
    conditions: ["tight"],
    side: "right",
    warmUp: "eases",
    note: null,
    evidence: ["my right calf is 6/10 and tight"],
    confidence: 0.8,
    ...overrides,
  });
  const parse = (muscleProposals: unknown): unknown =>
    parseCoachTurn({ reply: "Noted.", suggestions: ["Plan the week"], muscleProposals }, TODAY);

  it("parses a valid report and defaults the absent fields", () => {
    const result = parseCoachTurn(
      {
        reply: "Noted.",
        suggestions: ["Plan the week"],
        muscleProposals: [proposal(), { ...proposal({ muscleId: "hamstrings", action: "resolve", soreness: null }) }],
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turn.muscleProposals).toHaveLength(2);
      expect(result.turn.muscleProposals[0]).toMatchObject({
        action: "report",
        muscleId: "calves",
        soreness: 6,
        conditions: ["tight"],
        side: "right",
        warmUp: "eases",
        evidence: ["my right calf is 6/10 and tight"],
        confidence: 0.8,
      });
      expect(result.turn.muscleProposals[1]).toMatchObject({ action: "resolve", muscleId: "hamstrings", soreness: null });
    }
  });

  it("defaults to no suggestions and rejects a non-array list", () => {
    expect(parseCoachTurn({ reply: "x", suggestions: ["a"] }, TODAY)).toMatchObject({ ok: true, turn: { muscleProposals: [] } });
    expect(parseCoachTurn({ reply: "x", suggestions: ["a"], muscleProposals: null }, TODAY)).toMatchObject({
      ok: false,
      code: "invalid-muscle-proposals",
    });
  });

  it("rejects unknown muscles, bad levels, bad actions and missing evidence", () => {
    expect(parse([proposal({ muscleId: "tail" })])).toMatchObject({ ok: false, code: "invalid-muscle-proposal" });
    expect(parse([proposal({ soreness: 12 })])).toMatchObject({ ok: false, code: "invalid-muscle-proposal" });
    expect(parse([proposal({ action: "log" })])).toMatchObject({ ok: false, code: "invalid-muscle-proposal" });
    expect(parse([proposal({ evidence: [] })])).toMatchObject({ ok: false, code: "invalid-muscle-proposal" });
    expect(parse([proposal({ conditions: ["bruised"] })])).toMatchObject({ ok: false, code: "invalid-muscle-proposal" });
    expect(parse([proposal({ diagnosis: "strain" })])).toMatchObject({ ok: false, code: "invalid-muscle-proposal" });
    expect(parse([proposal({ confidence: 0.1 })])).toMatchObject({ ok: false, code: "invalid-muscle-proposal" });
  });

  it("rejects the same muscle twice, more than six items and a non-array", () => {
    expect(parse([proposal(), proposal()])).toMatchObject({ ok: false, code: "duplicate-muscle-proposal" });
    expect(parse("calves")).toMatchObject({ ok: false, code: "invalid-muscle-proposals" });
    expect(
      parse(
        Array.from({ length: 7 }, (_value, index) =>
          proposal({
            muscleId: ["calves", "quads", "glutes", "hamstrings", "adductors", "abductors", "tibialis"][index],
          }),
        ),
      ),
    ).toMatchObject({ ok: false, code: "invalid-muscle-proposals" });
    expect(parse([42])).toMatchObject({ ok: false, code: "invalid-muscle-proposal" });
  });

  it("accepts six suggestions in one turn — a full-body grumble is not silently truncated", () => {
    const ids = ["calves", "quads", "glutes", "hamstrings", "adductors", "abductors"];
    const result = parseCoachTurn(
      {
        reply: "Legs are trashed - the Muscle tab is the one-tap place for the rest.",
        suggestions: ["Plan an easy week"],
        muscleProposals: ids.map((muscleId) => proposal({ muscleId })),
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn.muscleProposals).toHaveLength(6);
  });

  it("names the field path in the validation issue", () => {
    const result = parseCoachTurn(
      { reply: "Noted.", suggestions: ["Plan"], muscleProposals: [proposal({ muscleId: "tail" })] },
      TODAY,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe("muscleProposals[0].muscleId");
    }
  });

  it("exposes the muscle ids and actions in the tool schema", () => {
    const properties = COACH_TOOL.function.parameters.properties;
    expect(properties).toHaveProperty("muscleProposals");
    const proposals = properties.muscleProposals;
    expect(proposals.type).toBe("array");
    expect(proposals.maxItems).toBe(6);
    expect(proposals.items.properties.action.enum).toEqual(["report", "hold", "release", "resolve"]);
    expect(proposals.items.properties.muscleId.enum).toContain("calves");
    expect(proposals.items.properties.muscleId.enum).toContain("hamstrings");
    expect(proposals.items.properties.conditions.items.enum).toContain("sharp_pain");
    expect(proposals.items.required).toContain("evidence");
    expect(proposals.items.required).toContain("activityId");
    expect(proposals.items.properties.activityId.type).toEqual(["string", "null"]);
  });

  it("teaches the confirm-first rule and the no-diagnosis limit in the system prompt", () => {
    const prompt = buildCoachSystemPrompt();
    expect(prompt).toContain("muscleProposals");
    expect(prompt).toContain("The runner confirms with one tap");
    expect(prompt).toContain("A muscle suggestion is not a diagnosis");
    expect(prompt).toContain("do not propose a report, a resolve or a lower level");
  });

  it("keeps the friend voice when a suggestion rides along (tone guard)", () => {
    const prompt = buildCoachSystemPrompt();
    // The consultant-friend persona survives the growing rule mass: a suggestion turn is still a friend
    // passing a note, never a form reporting its own plumbing.
    expect(prompt).toContain("A suggestion rides along; it never changes your voice");
    expect(prompt).toContain("the way a friend passes a note");
    expect(prompt).toContain("Never announce plumbing");
    // The jargon the first pass shipped is gone; the day rule and the cap rule speak plainly.
    expect(prompt).not.toContain("the local today of the newest context block");
    expect(prompt).not.toContain("the one-tap place");
    expect(prompt).toContain("the day the newest context block calls today");
    expect(prompt).toContain("the Muscle tab can take the rest in one tap");
    expect(prompt).toContain("never let it sound like a system message");
  });

  it("renders the pending suggestions in the newest context snapshot only when there are some", () => {
    const base = {
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [],
      recentChanges: [],
    };
    expect(buildContextSnapshot(base)).not.toContain("Pending muscle suggestions");
    const withPending = buildContextSnapshot({
      ...base,
      pendingMuscleProposals: "Pending muscle suggestions (the runner has not confirmed these):\n- Calves: report 6/10 clear doms",
    });
    expect(withPending).toContain("Pending muscle suggestions:");
    expect(withPending).toContain("- Calves: report 6/10 clear doms");
  });

  it("adds a muscle-suggestion reason to the epoch diff", () => {
    const parts: CoachEpochParts = {
      promptVersion: COACH_PROMPT_VERSION,
      today: TODAY,
      latestChangeSetId: null,
      latestActivityId: null,
      activityCount: 0,
      latestMuscleCheckInId: null,
      pendingMuscleProposalIds: [],
      activeStateKeys: [],
      memoryIds: [],
      profileKey: "p",
      preferenceKey: "q",
    };
    expect(epochReasons(parts, { ...parts, pendingMuscleProposalIds: ["muscle-proposal:1"] })).toEqual([
      "muscle-suggestion-changed",
    ]);
    // An older snapshot without the field is not a change of its own.
    const legacy = { ...parts } as CoachEpochParts;
    delete legacy.pendingMuscleProposalIds;
    expect(epochReasons(legacy, parts)).toEqual([]);
  });
});

describe("extended race horizon", () => {  it("accepts a racewalk race on 2027-01-15 and keeps a far date rejected", () => {
    const race = parseCoachTurn(
      {
        reply: "Booked the race walk.",
        suggestions: ["Book the race-week plan"],
        revertChangeSetId: null,
        sessions: [
          {
            action: "add",
            day: "2027-01-15",
            title: "10K Race Walk",
            kind: "racewalk",
            distanceKm: 10,
            durationMin: 90,
          },
        ],
      },
      TODAY,
    );
    expect(race.ok).toBe(true);
    expect(parseCoachTurn({ reply: "x", suggestions: ["a"], sessions: [{ day: "2027-04-01", title: "Run", kind: "easy" }] }, TODAY)).toMatchObject({
      ok: true,
    });
    expect(parseCoachTurn({ reply: "x", suggestions: ["a"], sessions: [{ day: "2027-06-01", title: "Run", kind: "easy" }] }, TODAY)).toMatchObject({
      ok: false,
      code: "session-too-far",
    });
  });
});
