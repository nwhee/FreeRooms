import { describe, expect, it } from "vitest";
import { CALENDAR, FALL, SPRING, makeSchedule } from "./__fixtures__/schedule";
import { buildIndex } from "./build-index";
import { dayContext } from "./calendar";

const index = buildIndex(makeSchedule());

describe("AC6 dayContext no-class date by campus", () => {
  it("returns the 2026-11-11 USA + VAN entry for BOS and null for TOR", () => {
    expect(dayContext(index, "BOS", "2026-11-11").noClass).toEqual(CALENDAR.noClassDates[0]);
    expect(dayContext(index, "TOR", "2026-11-11").noClass).toBeNull();
  });

  it("returns the first entry in file order when no-class entries overlap", () => {
    const extra = { start: "2026-11-10", end: "2026-11-12", label: "Later entry", campuses: ["BOS"] };
    const overlapping = buildIndex(
      makeSchedule({ calendar: { ...CALENDAR, noClassDates: [...CALENDAR.noClassDates, extra] } }),
    );
    expect(dayContext(overlapping, "BOS", "2026-11-11").noClass?.label).toBe("Veterans Day / Remembrance Day");
  });

  it("returns null on an ordinary day", () => {
    expect(dayContext(index, "BOS", "2026-11-18").noClass).toBeNull();
  });
});

describe("AC9 dayContext exam periods", () => {
  it("lists every active exam period on 2026-12-15 (main and Law)", () => {
    expect(dayContext(index, "BOS", "2026-12-15").examPeriods.map((p) => p.label)).toEqual([
      "Fall Law exam period",
      "Fall final exam period",
    ]);
  });

  it("lists only the Law window on 2026-12-08, and nothing on 2026-12-06", () => {
    expect(dayContext(index, "BOS", "2026-12-08").examPeriods.map((p) => p.label)).toEqual([
      "Fall Law exam period",
    ]);
    expect(dayContext(index, "BOS", "2026-12-06").examPeriods).toEqual([]);
  });
});

describe("AC10 coverage and calendar", () => {
  it("is out of coverage on 2026-12-25 and in coverage on 2027-01-13", () => {
    expect(dayContext(index, "BOS", "2026-12-25")).toMatchObject({ inCoverage: false, terms: [] });
    expect(dayContext(index, "BOS", "2027-01-13")).toMatchObject({ inCoverage: true, terms: [SPRING] });
  });

  it("knows the calendar on 2026-11-18 when termYears is ['2027'] and not when it's []", () => {
    expect(dayContext(index, "BOS", "2026-11-18").calendarKnown).toBe(true);
    const noYears = buildIndex(makeSchedule({ calendar: { ...CALENDAR, termYears: [] } }));
    expect(dayContext(noYears, "BOS", "2026-11-18").calendarKnown).toBe(false);
  });

  it("does not know the calendar outside coverage", () => {
    expect(dayContext(index, "BOS", "2026-12-25").calendarKnown).toBe(false);
  });
});

describe("AC10b incomplete room assignment", () => {
  const withSpring = (meetingCount: number, roomedMeetingCount: number) =>
    buildIndex(makeSchedule({ terms: [FALL, { ...SPRING, meetingCount, roomedMeetingCount }] }));

  it("lists 202730 at 79% when 790 of 1000 meetings are roomed", () => {
    expect(dayContext(withSpring(1000, 790), "BOS", "2027-02-01").incompleteTerms).toEqual([
      { term: { ...SPRING, meetingCount: 1000, roomedMeetingCount: 790 }, percentRoomed: 79 },
    ]);
  });

  it("treats exactly 80% (800 of 1000) as complete", () => {
    expect(dayContext(withSpring(1000, 800), "BOS", "2027-02-01").incompleteTerms).toEqual([]);
  });

  it("ignores a term with meetingCount 0", () => {
    expect(dayContext(withSpring(0, 0), "BOS", "2027-02-01").incompleteTerms).toEqual([]);
  });

  it("does not list 202730 on 2026-11-18, which it doesn't cover", () => {
    expect(dayContext(withSpring(1000, 790), "BOS", "2026-11-18").incompleteTerms).toEqual([]);
  });

  it("rounds percentRoomed down to an integer", () => {
    const [entry] = dayContext(withSpring(1000, 799), "BOS", "2027-02-01").incompleteTerms;
    expect(entry.percentRoomed).toBe(79);
    const [third] = dayContext(withSpring(3, 2), "BOS", "2027-02-01").incompleteTerms;
    expect(third.percentRoomed).toBe(66);
  });
});

describe("dayContext input checks", () => {
  it("throws a RangeError for a malformed date", () => {
    expect(() => dayContext(index, "BOS", "2026-13-01")).toThrow(RangeError);
  });

  it("returns an empty context for an unknown campus, not an error", () => {
    expect(dayContext(index, "XYZ", "2026-11-11").noClass).toBeNull();
  });
});
