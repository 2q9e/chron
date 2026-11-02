import type { CalendarEventEntry } from "./types.ts";
import { calendarEventEntryKey } from "./types.ts";
import { parseCalendarDate } from "./time.ts";

const CRLF = "\r\n";
const encoder = new TextEncoder();

function escapeText(value: string): string {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new RangeError("Calendar export contains unsupported control characters.");
  }
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/\r\n|\r|\n/gu, "\\n")
    .replace(/([;,])/gu, "\\$1");
}

function foldContentLine(value: string): string {
  const physicalLines: string[] = [];
  let current = "";
  let octets = 0;

  for (const character of value) {
    const characterOctets = encoder.encode(character).length;
    if (octets + characterOctets > 75) {
      physicalLines.push(current);
      current = ` ${character}`;
      octets = 1 + characterOctets;
    } else {
      current += character;
      octets += characterOctets;
    }
  }

  physicalLines.push(current);
  return physicalLines.join(CRLF);
}

function utcDateTime(value: string): string {
  if (!/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/iu.test(value)) {
    throw new RangeError("Calendar export requires timed events with an explicit UTC offset.");
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError("Calendar export contains an invalid timed event instant.");
  }
  return instant.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function dateValue(value: string): string {
  return parseCalendarDate(value).toString().replace(/-/gu, "");
}

function uidFor(entry: CalendarEventEntry): string {
  const identity = calendarEventEntryKey(entry);
  const encoded = encodeURIComponent(identity).replace(/[!'()*]/gu, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  return `${encoded}@chron.uwu.markets`;
}

function eventLines(entry: CalendarEventEntry, stamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uidFor(entry)}`,
    `DTSTAMP:${stamp}`,
  ];

  if (entry.kind === "all-day") {
    const startsOn = dateValue(entry.startDate);
    const endsBefore = dateValue(entry.endDate);
    if (endsBefore <= startsOn) {
      throw new RangeError("Calendar export contains an all-day event without a positive duration.");
    }
    lines.push(`DTSTART;VALUE=DATE:${startsOn}`);
    lines.push(`DTEND;VALUE=DATE:${endsBefore}`);
  } else {
    const startsAt = utcDateTime(entry.startsAt);
    const endsAt = utcDateTime(entry.endsAt);
    if (Date.parse(entry.endsAt) <= Date.parse(entry.startsAt)) {
      throw new RangeError("Calendar export contains a timed event without a positive duration.");
    }
    lines.push(`DTSTART:${startsAt}`);
    lines.push(`DTEND:${endsAt}`);
  }

  lines.push(`SUMMARY:${escapeText(entry.title)}`);
  if (entry.details) lines.push(`DESCRIPTION:${escapeText(entry.details)}`);
  lines.push("END:VEVENT");
  return lines;
}

/** Build an RFC 5545 calendar snapshot from the event entries in one visible range. */
export function buildCalendarIcs(
  entries: readonly CalendarEventEntry[],
  exportedAt: Date = new Date(),
): string {
  const stamp = utcDateTime(exportedAt.toISOString());
  const seenIds = new Set<string>();
  const events = [...entries].sort((left, right) => {
    const leftStart = left.kind === "all-day"
      ? Date.parse(`${left.startDate}T00:00:00.000Z`)
      : Date.parse(left.startsAt);
    const rightStart = right.kind === "all-day"
      ? Date.parse(`${right.startDate}T00:00:00.000Z`)
      : Date.parse(right.startsAt);
    return leftStart - rightStart || uidFor(left).localeCompare(uidFor(right));
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//uwu.markets//Chron Calendar//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
  ];

  for (const event of events) {
    const uid = uidFor(event);
    if (seenIds.has(uid)) throw new RangeError("Calendar export contains a duplicate event instance.");
    seenIds.add(uid);
    lines.push(...eventLines(event, stamp));
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldContentLine).join(CRLF)}${CRLF}`;
}
