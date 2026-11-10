import { isIsoDate } from "../../lib/data/schema";

/** The date ("today") the term window uses: the America/New_York date of `now`. */
export function newYorkDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** `date` (YYYY-MM-DD) plus `days` calendar days. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Banner's "MM/DD/YYYY" -> "YYYY-MM-DD", or null if it isn't a real date. */
export function parseBannerDate(value: string | null | undefined): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? "");
  if (!match) return null;
  const iso = `${match[3]}-${match[1]}-${match[2]}`;
  return isIsoDate(iso) ? iso : null;
}

/** Banner's "HHMM" -> minutes after midnight ("1030" -> 630), or null if invalid. */
export function parseBannerTime(value: string | null | undefined): number | null {
  const match = /^(\d{2})(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[2]) < 60 && minutes <= 1440 ? minutes : null;
}
