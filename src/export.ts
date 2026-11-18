/**
 * Take the runner's data out of POC3.
 *
 * The product's pitch is that the calendar belongs to the runner. That is only literally true if the plan, the log and
 * the change history can leave the app. Two formats are enough for a PoC: a complete JSON bundle and an all-day ICS
 * calendar that Google/Apple/Outlook can import.
 *
 * No secret is exported: the profile omits the password hash and the Garmin key is never included.
 */
import type { Activity, ChangeSet, MuscleCheckIn, TrainingSession } from "./types";

export interface ExportProfile {
  userId: string;
  username: string;
  displayName: string;
  timezone: string;
  goal: string | null;
  createdAt: string;
}

export interface ExportBundle {
  app: "POC3";
  exportedAt: string;
  profile: ExportProfile;
  sessions: TrainingSession[];
  activities: Activity[];
  changeSets: ChangeSet[];
  /** Per-muscle check-ins, newest first; part of the runner's own data. */
  muscleCheckIns: MuscleCheckIn[];
}

export interface ExportInput {
  exportedAt: string;
  profile: ExportProfile;
  sessions: readonly TrainingSession[];
  activities: readonly Activity[];
  changeSets: readonly ChangeSet[];
  muscleCheckIns?: readonly MuscleCheckIn[];
}

export function buildExportBundle(input: ExportInput): ExportBundle {
  return {
    app: "POC3",
    exportedAt: input.exportedAt,
    profile: {
      userId: input.profile.userId,
      username: input.profile.username,
      displayName: input.profile.displayName,
      timezone: input.profile.timezone,
      goal: input.profile.goal,
      createdAt: input.profile.createdAt,
    },
    sessions: [...input.sessions],
    activities: [...input.activities],
    changeSets: [...input.changeSets],
    muscleCheckIns: [...(input.muscleCheckIns ?? [])],
  };
}

const ICS_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function icsDay(day: string): string {
  const match = ICS_DAY.exec(day);
  if (match === null) return day.replace(/-/g, "");
  return `${match[1]}${match[2]}${match[3]}`;
}

function addOneDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsLine(name: string, value: string): string {
  const line = `${name}:${value}`;
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

function sessionDescription(session: TrainingSession): string {
  const parts = [
    `Kind: ${session.kind}`,
    session.distanceKm === null ? "" : `Distance: ${session.distanceKm} km`,
    session.durationMin === null ? "" : `Duration: ${session.durationMin} min`,
    session.note === null ? "" : `Note: ${session.note}`,
  ].filter((part) => part.length > 0);
  return parts.join(" | ");
}

/** All-day events, one per planned session, in the order the calendar shows them. */
export function buildCalendarIcs(input: {
  sessions: readonly TrainingSession[];
  calendarName: string;
  now: string;
}): string {
  const stamp = input.now.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//POC3//AI Coach Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    icsLine("X-WR-CALNAME", icsText(input.calendarName)),
  ];
  const ordered = [...input.sessions].sort((left, right) => left.day.localeCompare(right.day) || left.title.localeCompare(right.title));
  for (const session of ordered) {
    lines.push(
      "BEGIN:VEVENT",
      icsLine("UID", `${session.sessionId}@poc3`),
      icsLine("DTSTAMP", stamp),
      `DTSTART;VALUE=DATE:${icsDay(session.day)}`,
      `DTEND;VALUE=DATE:${icsDay(addOneDay(session.day))}`,
      icsLine("SUMMARY", icsText(session.title)),
      icsLine("DESCRIPTION", icsText(sessionDescription(session))),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
