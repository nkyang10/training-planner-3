import { describe, expect, it } from "vitest";
import { buildCoachHistory, buildCoachPrompt, parseCoachTurn } from "../src/coach";
import type { Activity, ChangeSet, Memory, Message, TrainingSession } from "../src/types";

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

  it("caps history at the last 20 turns", () => {
    const history = Array.from({ length: 30 }, (_, index) => message("user", `m${index}`));
    const built = buildCoachHistory({ today: TODAY, memories: [], sessions: [], activities: [], history, recentChanges: [], question: "q" });
    expect(built).toHaveLength(20);
    expect(built[0]?.content).toBe("m10");
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
      activities: [],
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
    expect(prompt).toContain("suggestions");
    expect(prompt).toContain("1-3");
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
    expect(parseCoachTurn({ reply: "x", suggestions: ["a"], sessions: [{ day: "2027-06-01", title: "Run", kind: "easy" }] }, TODAY)).toMatchObject({
      ok: false,
      code: "session-too-far",
    });
  });
});

