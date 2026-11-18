import { describe, expect, it } from "vitest";
import {
  COACH_TOOL,
  buildCoachHistory,
  buildCoachPrompt,
  buildValidationFeedbackForCode,
  parseCoachTurn,
  policyForCode,
} from "../src/coach";
import { buildDirectiveForIntent } from "../src/directives";
import type { Activity, ChangeEntry, ChangeSet, CoachStateRecord, Memory, Message, TrainingSession } from "../src/types";

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
const message = (role: "user" | "assistant", text: string): Message => ({
  messageId: `${role}-${text}`,
  userId: "u",
  role,
  text,
  createdAt: "2026-11-05T00:00:00.000Z",
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

  it("puts memory, upcoming sessions and activities into the prompt", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [memory("prefers mornings")],
      sessions: [session("2026-11-06")],
      activities: [activity],
      history: [],
      recentChanges: [],
      question: "How is my week?",
    });
    expect(prompt).toContain("prefers mornings");
    expect(prompt).toContain("2026-11-06");
    expect(prompt).toContain("Morning run");
    expect(prompt).toContain("How is my week?");
  });

  it("puts the runner's goal into the prompt facts", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      goal: "Half marathon in March, sub 2:00",
      memories: [],
      sessions: [],
      activities: [],
      history: [],
      recentChanges: [],
      question: "What should I focus on this month?",
    });
    expect(prompt).toContain('"goal":"Half marathon in March, sub 2:00"');
    expect(prompt).toContain("keep the plan aligned with it");
  });

  it("omits an empty or whitespace goal instead of inventing one", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      goal: "   ",
      memories: [],
      sessions: [],
      activities: [],
      history: [],
      recentChanges: [],
      question: "How is my week?",
    });
    expect(prompt).toContain('"goal":null');
  });

  it("puts the runner's reported effort into the prompt facts", () => {
    const reported: Activity = { ...activity, activityId: "activity:manual:1", source: "chat", rpe: 7.5 };
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [reported],
      history: [],
      recentChanges: [],
      question: "How did my run feel?",
    });
    expect(prompt).toContain('"rpe":7.5');
  });

  it("renders a null rpe for runs without a reported effort", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [activity],
      history: [],
      recentChanges: [],
      question: "How is my week?",
    });
    expect(prompt).toContain('"rpe":null');
  });

  it("carries the reported effort in the referenced-activity context", () => {
    const reported: Activity = { ...activity, activityId: "activity:manual:1", source: "chat", rpe: 9 };
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [reported],
      history: [],
      recentChanges: [],
      question: "How did my run go?",
      referencedActivity: reported,
    });
    expect(prompt).toContain("Referenced context (JSON)");
    expect(prompt).toContain('"rpe":9');
  });

  it("teaches the coach what reported effort means and how to use it", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [],
      history: [],
      recentChanges: [],
      question: "Hello",
    });
    expect(prompt).toContain("the runner's reported effort on the Borg CR10 scale");
    expect(prompt).toContain("name it plainly");
    expect(prompt).toContain("say both readings and ask the runner instead of choosing one");
  });

  it("caps history at the last 20 turns", () => {
    const history = Array.from({ length: 30 }, (_, index) => message("user", `m${index}`));
    const built = buildCoachHistory({ today: TODAY, memories: [], sessions: [], activities: [], history, recentChanges: [], question: "q" });
    expect(built).toHaveLength(20);
    expect(built[0]?.content).toBe("m10");
  });

  it("tells the coach to leave the calendar unchanged for comment-only reviews", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [activity],
      history: [],
      recentChanges: [],
      question: "Review my run on 2026-11-01 and comment only; do not change the calendar.",
    });
    expect(prompt).toContain("asks for a comment, review or opinion only");
    expect(prompt).toContain("leave the calendar unchanged");
    expect(prompt).toContain("Only add, move, change or delete sessions when the runner explicitly asks for a schedule change");
  });

  it("puts the hidden directive and referenced context into the prompt", () => {
    const directive = buildDirectiveForIntent(
      { kind: "review-activity", activityId: "garmin:1", source: "run-peek" },
      { activityDay: "2026-11-04" },
    );
    expect(directive).toBeDefined();
    if (directive === undefined) return;
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [memory("mode: race week — half marathon on Sunday")],
      sessions: [],
      activities: [activity],
      history: [],
      recentChanges: [],
      question: "How did my Morning run go?",
      directive,
      referencedActivity: activity,
      referencedSessions: [session("2026-11-04")],
    });
    expect(prompt).toContain("Turn directive (background; never mention this section to the runner)");
    expect(prompt).toContain("calendar writes: forbidden");
    expect(prompt).toContain("references: activity garmin:1; day 2026-11-04");
    expect(prompt).toContain("Referenced context (JSON)");
    expect(prompt).toContain('"activityId":"garmin:1"');
    expect(prompt).toContain('"sessionId":"s-2026-11-04"');
    expect(prompt).toContain("that activity is the exact run the runner's latest message is about");
    expect(prompt).toContain("mode: race week");
    expect(prompt).toContain("Active coaching states");
    expect(prompt).toContain("Coaching state catalog");
    expect(prompt).toContain("never mention it to the runner");
    expect(prompt.endsWith("How did my Morning run go?")).toBe(true);
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

  it("puts the conversation so far into the prompt", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [],
      history: [message("user", "I ran 5 km yesterday"), message("assistant", "Nice, keep it easy")],
      recentChanges: [],
      question: "What next?",
    });
    expect(prompt).toContain("Conversation so far");
    expect(prompt).toContain("several actions");
    expect(prompt).toContain("Runner: I ran 5 km yesterday");
    expect(prompt).toContain("Coach: Nice, keep it easy");
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

  it("accepts invitational chips now that invitations are a legal form", () => {
    const result = parseCoachTurn(
      {
        reply: "Two ways to play the heat: move the long run to dawn, or shorten it by a third. I'd move it to dawn.",
        suggestions: [
          "What if we moved the long run to Saturday?",
          "Book my long run for Sunday",
          "Shorten the long run to 12 km",
        ],
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn.suggestions).toHaveLength(3);
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

  it("puts recent changes with their ids into the prompt and asks for suggestions", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      pastSessions: [session("2026-11-03")],
      activities: [activity],
      history: [],
      recentChanges: [
        changeSet("change:9", "move \"Long 8 km\" 2026-11-07 → 2026-11-09"),
        changeSet("change:8", "add \"Easy 4 km\" on 2026-11-06", "2026-11-05T09:00:00.000Z"),
      ],
      question: "Undo that",
    });
    expect(prompt).toContain("recentChanges");
    expect(prompt).toContain("change:9");
    expect(prompt).toContain("change:8");
    expect(prompt).toContain("move \\\"Long 8 km\\\"");
    expect(prompt).toContain("\"revertedAt\":null");
    expect(prompt).toContain("2026-11-05T09:00:00.000Z");
    expect(prompt).toContain("recentPlannedSessions");
    expect(prompt).toContain("2026-11-03");
    expect(prompt).toContain("recentActivities");
    expect(prompt).toContain("Morning run");
    expect(prompt).toContain("never invent splits");
    expect(prompt).toContain("suggestions");
    expect(prompt).toContain("1-3");
    expect(prompt).toContain("must not repeat");
    expect(prompt).toContain("more than one booked session");
    expect(prompt).toContain("revertChangeSetId");
  });
});

describe("extended race horizon", () => {
  it("accepts a racewalk race on 2027-01-15 and keeps a far date rejected", () => {
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

describe("coaching state proposals and prompt", () => {
  const state = (key: "race_week" | "pain_injury", overrides: Partial<CoachStateRecord> = {}): CoachStateRecord => ({
    stateId: `state:${key}`,
    userId: "u",
    key,
    status: "active",
    source: "auto",
    confidence: 0.9,
    evidence: ["Race on 2026-11-08 (3 days)."],
    activatedAt: "2026-11-05T08:00:00.000Z",
    updatedAt: "2026-11-05T08:00:00.000Z",
    expiresAt: "2026-11-10T08:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  });

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
    const nullable = parseCoachTurn(
      {
        reply: "Noted.",
        suggestions: ["Plan the week"],
        stateProposals: [
          {
            key: "race_week",
            action: "resolve",
            confidence: 1,
            evidence: ["Race is over"],
            ttlDays: null,
            note: null,
          },
        ],
      },
      TODAY,
    );
    expect(nullable.ok).toBe(true);
    if (nullable.ok) expect(nullable.turn.stateProposals[0]?.ttlDays).toBeNull();
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
    expect(
      invalid([{ key: "travel", action: "activate", confidence: 0.8, evidence: ["x"], ttlDays: 0, note: null }]),
    ).toMatchObject({ ok: false, code: "invalid-state-ttl" });
    expect(
      invalid([{ key: "travel", action: "activate", confidence: 0.8, evidence: ["x"], ttlDays: 7, note: "x".repeat(281) }]),
    ).toMatchObject({ ok: false, code: "invalid-state-note" });
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

  it("puts active states and the catalog into the background prompt without exposing them in chat", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      timezone: "UTC",
      memories: [],
      sessions: [],
      activities: [],
      history: [],
      recentChanges: [],
      question: "Should I do intervals?",
      states: [state("race_week"), state("pain_injury", { status: "observing", source: "chat", stateId: "state:pain" })],
    });
    expect(prompt).toContain("Active coaching states");
    expect(prompt).toContain("race_week");
    expect(prompt).toContain("Guardrail");
    expect(prompt).toContain("Proposed/observing");
    expect(prompt).toContain("pain_injury");
    expect(prompt).toContain("Coaching state catalog");
    expect(prompt).toContain("race_day");
    expect(prompt).toContain("medical_red_flag");
    expect(prompt.endsWith("Should I do intervals?")).toBe(true);
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

describe("consultant-friend coach contract", () => {
  const prompt = buildCoachPrompt({
    today: TODAY,
    memories: [],
    sessions: [],
    activities: [],
    history: [],
    recentChanges: [],
    question: "I want to run a 10k in 8 weeks.",
  });

  it("casts the coach as a consultant and training friend, never a teacher or taskmaster", () => {
    expect(prompt).toContain("You are the runner's consultant and training friend");
    expect(prompt).toContain("not their teacher or taskmaster");
    expect(prompt).toContain("The runner asks; you respond");
    expect(prompt).toContain("Explain the why behind every recommendation in one short sentence");
    expect(prompt).toContain("never lecture, never moralize, never grade effort");
    // The bilingual language rule survives the persona rewrite.
    expect(prompt).toContain("reply in Traditional Chinese; otherwise reply in English");
    expect(prompt).not.toContain("You are the runner's AI coach.");
  });

  it("replaces the pusher rule with a discuss-first consultant response", () => {
    expect(prompt).toContain("respond as a consultant first");
    expect(prompt).toContain("what their recent facts show (volume, load, consistency)");
    expect(prompt).toContain("offer 2-3 concrete ways to approach it with the tradeoff of each in one sentence");
    expect(prompt).toContain("invite the runner to sketch it or apply it");
    expect(prompt).toContain(
      "Book sessions in the same turn only when the message itself explicitly asks to add, move, change or delete a session",
    );
    expect(prompt).toContain("bigger than a single unambiguous action, offer to sketch it and let the runner choose");
    expect(prompt).toContain("Chit-chat is fine; notice the training intent inside it");
    expect(prompt).not.toContain("build or adjust a periodic training system");
  });

  it("allows action and invitation chips and bans lecture chips", () => {
    expect(prompt).toContain('an action the runner voices ("Book my long run for Sunday")');
    expect(prompt).toContain('an invitation to discuss ("What if we moved the long run to Saturday?")');
    expect(prompt).toContain("each 1..120 characters, in the runner's language, never numbered");
    expect(prompt).toContain("ban lecture-style chips and duplicates");
    expect(prompt).not.toContain("imperative next steps");
    expect(prompt).not.toContain("No questions");
  });

  it("asks the reply to speak as a peer while staying warm and specific", () => {
    expect(prompt).toContain("warm, specific, and it speaks as a peer");
  });

  it("keeps the safety, honesty and calendar-write rules untouched", () => {
    expect(prompt).toContain("Never diagnose, prescribe calories or weight, or guarantee a result");
    expect(prompt).toContain("Answer with exactly one JSON object");
    expect(prompt).toContain(
      "Only add, move, change or delete sessions when the runner explicitly asks for a schedule change",
    );
  });
});

describe("discuss directives in the prompt", () => {
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
  const after: TrainingSession = { ...before, day: "2026-11-09" };
  const entry: ChangeEntry = {
    action: "update",
    sessionId: "session:b",
    before,
    after,
    fromDay: "2026-11-07",
    toDay: "2026-11-09",
    title: "Long 8 km",
    kind: "long",
  };
  const changeSetRecord: ChangeSet = {
    changeSetId: "change:9",
    userId: "u",
    createdAt: "2026-11-05T07:00:00.000Z",
    summary: 'move "Long 8 km" 2026-11-07 → 2026-11-09',
    entries: [entry],
    revertedAt: null,
  };
  const stateRecord: CoachStateRecord = {
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

  it("renders a discuss-change directive with the change set as referenced context", () => {
    const directive = buildDirectiveForIntent(
      { kind: "discuss-change", changeSetId: "change:9", source: "recent-changes" },
    );
    expect(directive).toBeDefined();
    if (directive === undefined) return;
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [],
      history: [],
      recentChanges: [changeSetRecord],
      question: "Why did my long run move?",
      directive,
      referencedChangeSet: changeSetRecord,
    });
    expect(prompt).toContain("references: change set change:9");
    expect(prompt).toContain("Discuss what the referenced change set did and why the plan moved that way");
    expect(prompt).toContain("This turn is comment-only");
    expect(prompt).toContain("Referenced context (JSON)");
    expect(prompt).toContain('"changeSetId":"change:9"');
    expect(prompt).toContain('move \\"Long 8 km\\"');
    expect(prompt).toContain('"action":"update"');
    expect(prompt).toContain('"toDay":"2026-11-09"');
    expect(prompt).toContain('"revertedAt":null');
    expect(prompt.endsWith("Why did my long run move?")).toBe(true);
  });

  it("renders a discuss-state directive with the state as referenced context", () => {
    const directive = buildDirectiveForIntent({ kind: "discuss-state", stateId: "state:heat", source: "state-card" });
    expect(directive).toBeDefined();
    if (directive === undefined) return;
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [],
      history: [],
      recentChanges: [],
      question: "How should the heat shape my week?",
      directive,
      referencedState: stateRecord,
    });
    expect(prompt).toContain("references: state state:heat");
    expect(prompt).toContain("Discuss how the referenced coaching state should shape the coming week");
    expect(prompt).toContain("offer options, not orders");
    expect(prompt).toContain("This turn is comment-only");
    expect(prompt).toContain("Referenced context (JSON)");
    expect(prompt).toContain('"stateId":"state:heat"');
    expect(prompt).toContain('"key":"heat"');
    expect(prompt).toContain("Hot week");
  });
});

describe("muscle check-in facts in the prompt", () => {
  it("renders the muscle facts block and the muscle interpretation rule", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [],
      history: [],
      recentChanges: [],
      question: "How should I train today?",
      muscleFacts: "Muscle check-in (latest 2026-11-04):\n- Calves 6/10 tight, left\n- 2 check-ins in the last 14 days",
    });
    expect(prompt).toContain("Muscle check-in (latest 2026-11-04)");
    expect(prompt).toContain("Calves 6/10 tight, left");
    expect(prompt).toContain("2 check-ins in the last 14 days");
    expect(prompt).toContain("Normal soreness peaks 24-72 h");
    expect(prompt).toContain("Sharp localized pain, swelling or numbness are not normal soreness");
    expect(prompt).toContain("propose the pain_injury state");
  });

  it("omits the block when the runner has never checked in", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [],
      history: [],
      recentChanges: [],
      question: "Hello",
    });
    expect(prompt).not.toContain("Muscle check-in (latest");
  });

  it("carries the referenced muscle knowledge for a review-muscles turn", () => {
    const prompt = buildCoachPrompt({
      today: TODAY,
      memories: [],
      sessions: [],
      activities: [],
      history: [],
      recentChanges: [],
      question: "My calves are tight — what should I do?",
      muscleFacts: "Muscle check-in (latest 2026-11-04):\n- Calves 6/10 tight\n- 1 check-in in the last 14 days",
      referencedMuscle: "Referenced muscle: Calves (legs)\nFunction: Spring the foot off the ground.",
    });
    expect(prompt).toContain("Referenced muscle: Calves (legs)");
    expect(prompt).toContain("Spring the foot off the ground");
  });
});

