// Turns the planned talks into a calendar file (RFC 5545) the phone can import.
// Pure: same plan in, same text out. Nothing is sent anywhere.
//
// Each talk becomes one event with three display alarms, 20, 10 and 2 minutes before.
// The 20 minute one says seating is first come, first served: that wording is the
// official NA 2026 schedule page's own.
// Times are written in UTC with a Z, converted from the plan's own offsets, so
// Denver's clock change never matters.

import type { PlanItem } from "./reconcile";

export const ICS_FILENAME = "grace-period-my-day.ics";

const CRLF = "\r\n";
const encoder = new TextEncoder();

// Backslash first, so the backslashes added for the other characters stay single.
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Lines are at most 75 octets. A fold is CRLF plus one space, and that space
// counts toward the next line. Never cut inside a multi-byte character.
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + n > limit) {
      parts.push(current);
      current = ch;
      size = n;
    } else {
      current += ch;
      size += n;
    }
  }
  parts.push(current);
  return parts.join(CRLF + " ");
}

const utc = (iso: string): string =>
  new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

function alarm(trigger: string, text: string): string[] {
  return ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(text)}`, `TRIGGER:${trigger}`, "END:VALARM"];
}

export function buildIcs(plan: readonly PlanItem[], stamp: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Effulgent Point//Grace Period//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const sorted = [...plan].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  for (const t of sorted) {
    lines.push(
      "BEGIN:VEVENT",
      // Stable per talk, so importing twice updates the event instead of doubling it.
      // Only safe characters: an id with a line break must not add its own iCalendar line.
      `UID:grace-period-${String(t.id).replace(/[^\w.-]/g, "")}@effulgentpoint.com`,
      `DTSTAMP:${utc(stamp.toISOString())}`,
      `DTSTART:${utc(t.starts_at)}`,
      `DTEND:${utc(t.ends_at)}`,
      `SUMMARY:${escapeText(t.title)}`,
      `LOCATION:${escapeText(t.room)}`,
      ...alarm("-PT20M", `Popular rooms fill early. Seating is first come, first served: head to ${t.room} now.`),
      ...alarm("-PT10M", `Next talk in 10 minutes: ${t.title}, ${t.room}`),
      ...alarm("-PT2M", `Time to head to ${t.room}`),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
