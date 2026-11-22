import { describe, expect, it } from "vitest";

import { buildCalendarIcs, buildExportBundle } from "../src/export";
import type { Activity, ChangeSet, MuscleProposal, TrainingSession } from "../src/types";

const session = (overrides: Partial<TrainingSession> = {}): TrainingSession => ({
  sessionId: "session:easy",
  userId: "u1",
  day: "2026-11-06",
  title: "Easy 5 km",
  kind: "easy",
  distanceKm: 5,
  durationMin: 35,
  note: "Keep it conversational",
  createdAt: "2026-11-05T00:00:00.000Z",
  ...overrides,
});

const activity: Activity = {
  activityId: "activity:manual:1",
  userId: "u1",
  day: "2026-11-06",
  title: "Morning run",
  distanceKm: 5.1,
  durationMin: 34,
  paceSecPerKm: 400,
  avgHr: null,
  source: "chat",
  createdAt: "2026-11-06T07:00:00.000Z",
};

const changeSet: ChangeSet = {
  changeSetId: "change:1",
  userId: "u1",
  createdAt: "2026-11-05T09:00:00.000Z",
  summary: "Booked an easy week",
  entries: [],
  revertedAt: null,
};

const muscleProposal: MuscleProposal = {
  proposalId: "muscle-proposal:1",
  userId: "u1",
  action: "report",
  muscleId: "calves",
  soreness: 6,
  conditions: ["tight"],
  side: "left",
  warmUp: "eases",
  note: null,
  activityId: null,
  evidence: ["my calf is tight"],
  confidence: 0.8,
  day: "2026-11-05",
  status: "confirmed",
  createdAt: "2026-11-05T08:00:00.000Z",
  updatedAt: "2026-11-05T09:00:00.000Z",
  decidedAt: "2026-11-05T09:00:00.000Z",
};

describe("export bundle", () => {
  it("exports the profile without a password hash and with only the runner's rows", () => {
    const bundle = buildExportBundle({
      exportedAt: "2026-11-18T08:00:00.000Z",
      profile: {
        userId: "u1",
        username: "demo",
        displayName: "Demo Runner",
        timezone: "Asia/Hong_Kong",
        goal: "Half marathon",
        createdAt: "2026-11-01T00:00:00.000Z",
      },
      sessions: [session()],
      activities: [activity],
      changeSets: [changeSet],
      muscleProposals: [muscleProposal],
    });
    expect(bundle.app).toBe("Milebook");
    expect(bundle.profile).toEqual({
      userId: "u1",
      username: "demo",
      displayName: "Demo Runner",
      timezone: "Asia/Hong_Kong",
      goal: "Half marathon",
      createdAt: "2026-11-01T00:00:00.000Z",
    });
    expect(JSON.stringify(bundle)).not.toContain("passwordHash");
    expect(JSON.stringify(bundle)).not.toContain("apiKey");
    expect(bundle.sessions).toHaveLength(1);
    expect(bundle.activities[0]?.source).toBe("chat");
    // The coach's suggestions and the runner's decisions on them leave with the rest of the runner's data.
    expect(bundle.muscleProposals).toHaveLength(1);
    expect(bundle.muscleProposals[0]).toMatchObject({
      proposalId: "muscle-proposal:1",
      muscleId: "calves",
      status: "confirmed",
    });
    expect(bundle.muscleCheckIns).toEqual([]);
    expect(bundle.muscleStatusControls).toEqual([]);
  });
});

describe("calendar ICS", () => {
  it("writes all-day events with escaped text and a stable UID", () => {
    const ics = buildCalendarIcs({
      sessions: [
        session({ sessionId: "session:tempo", day: "2026-11-12", title: "Tempo 8 km", note: "3 x 10 min; threshold" }),
        session({ sessionId: "session:long", day: "2026-11-08", title: "Long run" }),
      ],
      calendarName: "Demo Runner",
      now: "2026-11-18T08:00:00.000Z",
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261108");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261112");
    expect(ics).toContain("UID:session:long@milebook");
    expect(ics).toContain("SUMMARY:Tempo 8 km");
    expect(ics).toContain("min\\; threshold");
    expect(ics.indexOf("DTSTART;VALUE=DATE:20261108")).toBeLessThan(ics.indexOf("DTSTART;VALUE=DATE:20261112"));
  });

  it("keeps the file empty but valid when there are no sessions", () => {
    const ics = buildCalendarIcs({ sessions: [], calendarName: "Empty", now: "2026-11-18T08:00:00.000Z" });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
