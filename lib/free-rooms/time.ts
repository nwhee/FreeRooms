import { isIsoDate, isValidTimeZone } from "../data/schema";

/**
 * Campus-local wall-clock helpers (docs/specs/FR-0-overview.md, "Definitions").
 * Pure: callers pass the instant; nothing here reads the clock.
 */

export const MINUTES_PER_DAY = 1440;
const STALE_AFTER_MS = 360 * 60 * 60 * 1000;

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type LocalNow = { date: string; minutes: number; weekday: Weekday };

/** Throws a RangeError unless `date` is a real calendar date written as YYYY-MM-DD. */
export function assertIsoDate(date: string): void {
  if (!isIsoDate(date)) {
    throw new RangeError(`Expected a date in YYYY-MM-DD format, got ${JSON.stringify(date)}`);
  }
}

/** Throws a RangeError unless `minutes` is an integer minute of the day (0–1439). */
export function assertMinuteOfDay(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= MINUTES_PER_DAY) {
    throw new RangeError(`Expected an integer minute from 0 to 1439, got ${minutes}`);
  }
}

/** ISO weekday of a YYYY-MM-DD date: Mon=1 … Sun=7. */
function isoWeekday(date: string): Weekday {
  assertIsoDate(date);
  const [year, month, day] = date.split("-").map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // Sun=0
  return (utcDay === 0 ? 7 : utcDay) as Weekday;
}

/** The `days` bitmask bit for a date: Mon=1, Tue=2, Wed=4, … Sun=64. */
export function weekdayBit(date: string): number {
  return 1 << (isoWeekday(date) - 1);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (formatter === undefined) {
    if (!isValidTimeZone(timezone)) throw new RangeError(`Unknown time zone ${JSON.stringify(timezone)}`);
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

/** The campus-local date, minute of day and weekday of `instant` in `timezone`. */
export function localNow(timezone: string, instant: Date): LocalNow {
  if (Number.isNaN(instant.getTime())) throw new RangeError("Expected a valid Date instant");
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of formatterFor(timezone).formatToParts(instant)) parts[part.type] = part.value;
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { date, minutes, weekday: isoWeekday(date) };
}

/** FR-0 "Stale": more than 360 hours (15 days) between `generatedAt` and the viewer's `now`. */
export function isStale(generatedAt: string, now: Date): boolean {
  if (Number.isNaN(now.getTime())) throw new RangeError("Expected a valid Date for now");
  const generated = Date.parse(generatedAt);
  if (Number.isNaN(generated)) {
    throw new RangeError(`Expected an ISO 8601 timestamp, got ${JSON.stringify(generatedAt)}`);
  }
  return now.getTime() - generated > STALE_AFTER_MS;
}

/** 630 -> "10:30 AM"; 0 and 1440 (end of day) -> "12:00 AM". */
export function formatMinutes(m: number): string {
  if (!Number.isInteger(m) || m < 0 || m > MINUTES_PER_DAY) {
    throw new RangeError(`Expected an integer minute from 0 to 1440, got ${m}`);
  }
  const hour = Math.floor(m / 60) % 24;
  const minute = m % 60;
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
