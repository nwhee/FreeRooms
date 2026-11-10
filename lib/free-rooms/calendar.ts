import type { ExamPeriod, NoClassDate, Term } from "../data/schema";
import type { ScheduleIndex } from "./build-index";
import { assertIsoDate } from "./time";

/** FR-0: a term is incomplete when fewer than 80% of its meetings have a room. */
const COMPLETE_NUMERATOR = 4;
const COMPLETE_DENOMINATOR = 5;

export type IncompleteTerm = { term: Term; percentRoomed: number };

export type DayContext = {
  /** The first no-class entry covering the date for this campus, or null. */
  noClass: NoClassDate | null;
  /** Every exam period covering the date (exam periods apply to all campuses). */
  examPeriods: ExamPeriod[];
  /** The date falls inside at least one term's range. */
  inCoverage: boolean;
  /** A term covering the date has its year prefix in `calendar.termYears`. */
  calendarKnown: boolean;
  /** Terms whose range covers the date. */
  terms: Term[];
  /** Covering terms with `meetingCount > 0` and less than 80% of meetings roomed. */
  incompleteTerms: IncompleteTerm[];
};

/** Inclusive range check. YYYY-MM-DD strings compare correctly as text. */
export function covers(range: { start: string; end: string }, date: string): boolean {
  return range.start <= date && date <= range.end;
}

/** The calendar facts for one campus-local date (FR-0 "Definitions"). */
export function dayContext(index: ScheduleIndex, campus: string, date: string): DayContext {
  assertIsoDate(date);
  const { calendar, terms: allTerms } = index.data;

  const noClass =
    calendar.noClassDates.find((entry) => covers(entry, date) && entry.campuses.includes(campus)) ?? null;
  const examPeriods = calendar.examPeriods.filter((period) => covers(period, date));
  const terms = allTerms.filter((term) => covers({ start: term.startDate, end: term.endDate }, date));
  const termYears = new Set(calendar.termYears);

  const incompleteTerms = terms
    .filter(
      (term) =>
        term.meetingCount > 0 &&
        term.roomedMeetingCount * COMPLETE_DENOMINATOR < term.meetingCount * COMPLETE_NUMERATOR,
    )
    .map((term) => ({
      term,
      percentRoomed: Math.floor((term.roomedMeetingCount * 100) / term.meetingCount),
    }));

  return {
    noClass,
    examPeriods,
    inCoverage: terms.length > 0,
    calendarKnown: terms.some((term) => termYears.has(term.code.slice(0, 4))),
    terms,
    incompleteTerms,
  };
}
