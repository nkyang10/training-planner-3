import { describe, expect, it } from "vitest";
import { buildCoachHistory, buildCoachPrompt, parseCoachTurn } from "../src/coach";
import type { Activity, Memory, Message, TrainingSession } from "../src/types";

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

describe("coach turn", () => {
  it("accepts a grounded turn with memories and future sessions", () => {
    const result = parseCoachTurn(
      {
        reply: "I booked an easy week and remembered your 10k goal.",
        memories: ["Training for a 10k in 8 weeks"],
        sessions: [{ day: "2026-11-06", title: "Easy 5 km", kind: "easy", distanceKm: 5, durationMin: 35, note: "keep it conversational" }],
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turn.sessions[0]?.day).toBe("2026-11-06");
      expect(result.turn.memories).toHaveLength(1);
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
      question: "How is my week?",
    });
    expect(prompt).toContain("prefers mornings");
    expect(prompt).toContain("2026-11-06");
    expect(prompt).toContain("Morning run");
    expect(prompt).toContain("How is my week?");
  });

  it("caps history at the last 20 turns", () => {
    const history = Array.from({ length: 30 }, (_, index) => message("user", `m${index}`));
    const built = buildCoachHistory({ today: TODAY, memories: [], sessions: [], activities: [], history, question: "q" });
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
      question: "What next?",
    });
    expect(prompt).toContain("Conversation so far");
    expect(prompt).toContain("several actions");
    expect(prompt).toContain("Runner: I ran 5 km yesterday");
    expect(prompt).toContain("Coach: Nice, keep it easy");
  });
});

