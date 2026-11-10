import { isIsoDate, type Term } from "@/lib/data/schema";

/** "2026-11-11" -> "Wed, Nov 11". The date is a campus-local calendar date, so no zone shift. */
export function formatShortDate(date: string): string {
  return utcDateOf(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-09-02" -> "Sep 2, 2026". */
function formatLongDate(date: string): string {
  return utcDateOf(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function utcDateOf(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** "Sep 2, 2026 – Dec 20, 2026 and Jan 13, 2027 – May 2, 2027". */
export function formatTermRanges(terms: readonly Term[]): string {
  const ranges = terms.map((term) => `${formatLongDate(term.startDate)} – ${formatLongDate(term.endDate)}`);
  return new Intl.ListFormat("en-US", { type: "conjunction" }).format(ranges);
}

/** `generatedAt` in the viewer's own locale and time zone. */
export function formatUpdatedAt(generatedAt: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(generatedAt),
  );
}

/** Whole days between `generatedAt` and `now`, rounded down. */
export function daysSince(generatedAt: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(generatedAt)) / (24 * 60 * 60 * 1000));
}

/** 600 -> "10:00", the value format of `<input type="time">`. */
export function toTimeValue(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const TIME_VALUE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d(\.\d+)?)?$/;

/** "14:00" -> 840. Null for an empty or malformed value (e.g. a cleared input). */
export function parseTimeValue(value: string): number | null {
  const match = TIME_VALUE.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** The value of `<input type="date">` when it holds a real date, else null. */
export function parseDateValue(value: string): string | null {
  return isIsoDate(value) ? value : null;
}
