import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CAMPUSES } from "../data/campuses";
import { calendarSchema, scheduleFileSchema } from "../data/schema";
import {
  buildCalendarBlock,
  CalendarFileError,
  type CalendarSource,
  loadCalendarFiles,
  missingCalendarWarnings,
} from "./load";

const CALENDAR_DIR = fileURLToPath(new URL("../../data/calendar", import.meta.url));

/** A small valid source for academic year `first`-`first+1`. */
function validSource(first = 2026): CalendarSource {
  return {
    academicYear: `${first}-${first + 1}`,
    termYear: String(first + 1),
    source: "https://registrar.example.edu/calendar.pdf",
    sourcePostedDate: `${first}-06-04`,
    noClassDates: [{ start: `${first}-09-07`, end: `${first}-09-07`, label: "Labor Day", scope: ["USA"] }],
    examPeriods: [{ start: `${first}-12-14`, end: `${first}-12-20`, label: "Finals", partsOfTerm: ["1"] }],
  };
}

const tempDirs: string[] = [];

/** A fresh temp directory holding `files` (name -> contents; objects are written as JSON). */
function calendarDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "fr6-calendar-"));
  tempDirs.push(dir);
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, name), typeof contents === "string" ? contents : JSON.stringify(contents));
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The error `loadCalendarFiles(dir)` throws, failing the test if it doesn't throw one. */
function loadError(dir: string): CalendarFileError {
  try {
    loadCalendarFiles(dir);
  } catch (error) {
    if (error instanceof CalendarFileError) return error;
    throw error;
  }
  throw new Error("expected loadCalendarFiles to throw");
}

describe("data/calendar/2026-2027.json (FR-6 AC1)", () => {
  const calendars = loadCalendarFiles(CALENDAR_DIR);
  const found = calendars.find((source) => source.academicYear === "2026-2027");
  if (!found) throw new Error("data/calendar/2026-2027.json is missing");
  const calendar = found;

  it("gives every calendar file a unique termYear", () => {
    const termYears = calendars.map((source) => source.termYear);
    expect(new Set(termYears).size).toBe(termYears.length);
  });

  it("covers term year 2027 from the registrar PDF", () => {
    expect(calendar.termYear).toBe("2027");
    expect(calendar.source).toBe(
      "https://registrar.northeastern.edu/wp-content/uploads/sites/9/2026-2027-Academic-Calendar.pdf",
    );
    expect(calendar.sourcePostedDate).toBe("2026-06-04");
  });

  it("contains exactly the no-class rows of the spec table", () => {
    expect(calendar.noClassDates).toEqual([
      { start: "2026-09-07", end: "2026-09-07", label: "Labor Day / Labour Day", scope: ["USA", "CAN"] },
      { start: "2026-09-30", end: "2026-09-30", label: "Truth and Reconciliation Day", scope: ["VAN"] },
      {
        start: "2026-10-12",
        end: "2026-10-12",
        label: "Indigenous Peoples Day / Thanksgiving (CAN)",
        scope: ["USA", "CAN"],
      },
      { start: "2026-11-11", end: "2026-11-11", label: "Veterans Day / Remembrance Day", scope: ["USA", "VAN"] },
      { start: "2026-11-25", end: "2026-11-29", label: "Fall break", scope: ["ALL"] },
      { start: "2027-01-18", end: "2027-01-18", label: "Martin Luther King Jr. Day", scope: ["USA"] },
      { start: "2027-02-15", end: "2027-02-15", label: "Presidents Day / Family Day", scope: ["USA", "CAN"] },
      { start: "2027-03-08", end: "2027-03-14", label: "Spring break", scope: ["ALL"] },
      { start: "2027-03-26", end: "2027-03-26", label: "Good Friday", scope: ["CAN", "CHL"] },
      { start: "2027-03-31", end: "2027-03-31", label: "Farmworkers Day", scope: ["OAK", "SJO"] },
      {
        start: "2027-04-19",
        end: "2027-04-19",
        label: "Patriots Day",
        scope: ["BOS", "BRD", "BRL", "DDH", "NAH", "PTL"],
      },
      { start: "2027-05-24", end: "2027-05-24", label: "Victoria Day", scope: ["CAN"] },
      { start: "2027-05-31", end: "2027-05-31", label: "Memorial Day", scope: ["USA"] },
      { start: "2027-06-18", end: "2027-06-19", label: "Juneteenth (observed)", scope: ["USA"] },
      { start: "2027-07-01", end: "2027-07-01", label: "Canada Day", scope: ["CAN"] },
      { start: "2027-07-04", end: "2027-07-05", label: "Independence Day (observed)", scope: ["USA"] },
      { start: "2027-08-02", end: "2027-08-02", label: "Civic Holiday", scope: ["CAN"] },
    ]);
  });

  it("contains exactly the exam-period rows of the spec table", () => {
    expect(calendar.examPeriods).toEqual([
      { start: "2026-12-14", end: "2026-12-20", label: "Fall final exam period", partsOfTerm: ["1"] },
      { start: "2026-12-07", end: "2026-12-20", label: "Fall Law exam period", partsOfTerm: ["1L"] },
      { start: "2027-04-26", end: "2027-05-02", label: "Spring final exam period", partsOfTerm: ["1"] },
      { start: "2027-04-20", end: "2027-05-02", label: "Spring Law exam period", partsOfTerm: ["1L"] },
      { start: "2027-08-16", end: "2027-08-22", label: "Summer final exam period", partsOfTerm: ["1"] },
      { start: "2027-08-09", end: "2027-08-22", label: "Summer Law exam period", partsOfTerm: ["1L"] },
    ]);
  });
});

describe("loadCalendarFiles (FR-6 AC2)", () => {
  it("reads and validates every *.json file in file-name order, ignoring other files", () => {
    const dir = calendarDir({
      "2027-2028.json": validSource(2027),
      "2026-2027.json": validSource(2026),
      "README.md": "not a calendar",
    });
    expect(loadCalendarFiles(dir)).toEqual([validSource(2026), validSource(2027)]);
  });

  it("returns [] for an empty directory", () => {
    expect(loadCalendarFiles(calendarDir({}))).toEqual([]);
  });

  it("allows overlapping entries (Law exams inside the main exam period)", () => {
    const source = validSource();
    source.examPeriods.push({ start: "2026-12-07", end: "2026-12-20", label: "Law", partsOfTerm: ["1L"] });
    expect(loadCalendarFiles(calendarDir({ "2026-2027.json": source }))).toEqual([source]);
  });

  it("throws naming the file when the JSON is malformed", () => {
    const dir = calendarDir({ "2026-2027.json": '{ "academicYear": "2026-2027", ' });
    const error = loadError(dir);
    expect(error.file).toBe(join(dir, "2026-2027.json"));
    expect(error.message).toMatch(/2026-2027\.json: malformed JSON/);
  });

  it.each(["2026-9-07", "09/07/2026", "2026-02-30"])("throws naming the field when a date is %j", (date) => {
    const source = validSource();
    source.noClassDates[0].start = date;
    expect(loadError(calendarDir({ "2026-2027.json": source })).message).toMatch(
      /2026-2027\.json: noClassDates\[0\]\.start: must be a date in YYYY-MM-DD format/,
    );
  });

  it("throws naming the field when sourcePostedDate isn't YYYY-MM-DD", () => {
    const source = { ...validSource(), sourcePostedDate: "June 4, 2026" };
    expect(loadError(calendarDir({ "2026-2027.json": source })).message).toMatch(
      /2026-2027\.json: sourcePostedDate: must be a date in YYYY-MM-DD format/,
    );
  });

  it("throws naming the entry when start > end, for no-class dates and exam periods", () => {
    const noClass = validSource();
    noClass.noClassDates[0] = { ...noClass.noClassDates[0], start: "2026-09-08", end: "2026-09-07" };
    expect(loadError(calendarDir({ "2026-2027.json": noClass })).message).toMatch(
      /2026-2027\.json: noClassDates\[0\]\.end: start 2026-09-08 is after end 2026-09-07/,
    );

    const exam = validSource();
    exam.examPeriods[0] = { ...exam.examPeriods[0], start: "2026-12-21" };
    expect(loadError(calendarDir({ "2026-2027.json": exam })).message).toMatch(
      /2026-2027\.json: examPeriods\[0\]\.end: start 2026-12-21 is after end 2026-12-20/,
    );
  });

  it.each(["UK", "usa", "Boston", "XYZ", ""])("throws naming the field for unknown scope token %j", (token) => {
    const source = validSource();
    source.noClassDates[0].scope = ["USA", token];
    expect(loadError(calendarDir({ "2026-2027.json": source })).message).toMatch(
      /2026-2027\.json: noClassDates\[0\]\.scope\[1\]: unknown scope token/,
    );
  });

  it("accepts ALL, USA, CAN and every campus code as scope tokens", () => {
    const source = validSource();
    source.noClassDates[0].scope = ["ALL", "USA", "CAN", ...CAMPUSES.map((campus) => campus.code)];
    expect(loadCalendarFiles(calendarDir({ "2026-2027.json": source }))).toEqual([source]);
  });

  it.each([
    ["an empty array", []],
    ["a string", "1"],
    ["an array with a number", [1]],
    ["missing", undefined],
  ])("throws naming the field when an exam period's partsOfTerm is %s", (_name, partsOfTerm) => {
    const source = validSource();
    const examPeriods: unknown[] = [{ ...source.examPeriods[0], partsOfTerm }];
    expect(loadError(calendarDir({ "2026-2027.json": { ...source, examPeriods } })).message).toMatch(
      /2026-2027\.json: examPeriods\[0\]\.partsOfTerm(\[0\])?: /,
    );
  });

  it("throws when the file name doesn't equal academicYear + .json", () => {
    const dir = calendarDir({ "2026-27.json": validSource(2026) });
    expect(loadError(dir).message).toBe(
      `${join(dir, "2026-27.json")}: academicYear: is "2026-2027", so the file must be named 2026-2027.json`,
    );
  });

  it("throws naming the offending file when two files share a termYear", () => {
    // The usual slip: next year's file copied from this year's without bumping termYear.
    // The termYear/academicYear rule fires first; the duplicate check stays as defence in depth.
    const dir = calendarDir({
      "2026-2027.json": validSource(2026),
      "2027-2028.json": { ...validSource(2027), termYear: "2027" },
    });
    expect(loadError(dir).message).toBe(
      `${join(dir, "2027-2028.json")}: termYear: must be 2028 for academic year 2027-2028, got 2027`,
    );
  });

  it("throws when termYear isn't the year the academic year ends in, even as the only file", () => {
    const dir = calendarDir({ "2027-2028.json": { ...validSource(2027), termYear: "2027" } });
    const error = loadError(dir);
    expect(error.file).toBe(join(dir, "2027-2028.json"));
    expect(error.message).toMatch(/2027-2028\.json: termYear: must be 2028 for academic year 2027-2028, got 2027$/);
  });

  it("strips a leading UTF-8 BOM before parsing", () => {
    const dir = calendarDir({ "2026-2027.json": `﻿${JSON.stringify(validSource())}` });
    expect(loadCalendarFiles(dir)).toEqual([validSource()]);
  });

  it("reports a bad end date once, without a start/end comparison", () => {
    const source = validSource();
    source.noClassDates[0].end = "2026-9-07";
    const detail = loadError(calendarDir({ "2026-2027.json": source })).message.split(": ").slice(1).join(": ");
    expect(detail).toBe('noClassDates[0].end: must be a date in YYYY-MM-DD format, got "2026-9-07"');
  });

  it("throws a CalendarFileError naming the directory when it doesn't exist", () => {
    const dir = join(calendarDir({}), "missing");
    const error = loadError(dir);
    expect(error.file).toBe(dir);
    expect(error.message).toMatch(new RegExp(`^${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: cannot read calendar directory`));
  });

  it("throws when academicYear isn't two consecutive years", () => {
    const source = { ...validSource(2026), academicYear: "2026-2028" };
    expect(loadError(calendarDir({ "2026-2028.json": source })).message).toMatch(
      /2026-2028\.json: academicYear: 2026-2028 is not two consecutive years/,
    );
  });

  it("rejects unknown keys", () => {
    const source = { ...validSource(), notes: "typo" };
    expect(loadError(calendarDir({ "2026-2027.json": source })).message).toMatch(/2026-2027\.json: .*notes/);
  });
});

describe("buildCalendarBlock (FR-6 AC3)", () => {
  const block = buildCalendarBlock(
    loadCalendarFiles(CALENDAR_DIR).filter((source) => source.academicYear === "2026-2027"),
  );
  const entry = (label: string) => block.noClassDates.find((item) => item.label === label);

  it("passes the calendar part of scheduleFileSchema", () => {
    expect(scheduleFileSchema.shape.calendar.safeParse(block).success).toBe(true);
    expect(calendarSchema.parse(block)).toEqual(block);
  });

  it("sets termYears", () => {
    expect(block.termYears).toEqual(["2027"]);
  });

  it("expands Patriots Day to the six Massachusetts and Maine campuses", () => {
    expect(entry("Patriots Day")?.campuses).toEqual(["BOS", "BRD", "BRL", "DDH", "NAH", "PTL"]);
  });

  it("expands ALL to all 17 campuses, so Fall break contains LDN", () => {
    const campuses = entry("Fall break")?.campuses;
    expect(campuses).toContain("LDN");
    expect(campuses).toEqual(CAMPUSES.map((campus) => campus.code).sort());
    expect(campuses).toHaveLength(17);
  });

  it("expands USA to 14 codes and CAN to TOR and VAN", () => {
    expect(entry("Martin Luther King Jr. Day")?.campuses).toEqual([
      "ARL", "BOS", "BRD", "BRL", "CHL", "DDH", "MIA", "NAH", "NYC", "OAK", "PTL", "SEA", "SFR", "SJO",
    ]);
    expect(entry("Victoria Day")?.campuses).toEqual(["TOR", "VAN"]);
  });

  it("gives LDN only the ALL entries", () => {
    expect(block.noClassDates.filter((item) => item.campuses.includes("LDN")).map((item) => item.label)).toEqual([
      "Fall break",
      "Spring break",
    ]);
  });

  it("sorts and de-duplicates campus codes when tokens overlap", () => {
    expect(entry("Veterans Day / Remembrance Day")?.campuses).toHaveLength(15);
    expect(entry("Good Friday")?.campuses).toEqual(["CHL", "TOR", "VAN"]);

    const source = validSource();
    source.noClassDates[0].scope = ["VAN", "CAN", "TOR", "ALL"];
    const [expanded] = buildCalendarBlock([source]).noClassDates;
    expect(expanded.campuses).toEqual([...new Set(expanded.campuses)].sort());
    expect(expanded.campuses).toHaveLength(17);
  });

  it("sorts entries by start across sources", () => {
    const result = buildCalendarBlock([validSource(2027), validSource(2026)]);
    expect(result.termYears).toEqual(["2027", "2028"]);
    expect(result.noClassDates.map((item) => item.start)).toEqual(["2026-09-07", "2027-09-07"]);
    expect(result.examPeriods.map((item) => item.start)).toEqual(["2026-12-14", "2027-12-14"]);

    const starts = block.noClassDates.map((item) => item.start);
    expect(starts).toEqual([...starts].sort());
    expect(block.examPeriods.map((item) => item.label)).toEqual([
      "Fall Law exam period",
      "Fall final exam period",
      "Spring Law exam period",
      "Spring final exam period",
      "Summer Law exam period",
      "Summer final exam period",
    ]);
  });

  it("returns an empty block for no sources", () => {
    expect(buildCalendarBlock([])).toEqual({ termYears: [], noClassDates: [], examPeriods: [] });
  });
});

describe("missingCalendarWarnings (FR-6 AC4)", () => {
  const sources = [validSource(2026)];

  it("returns [] when every term has a calendar", () => {
    expect(missingCalendarWarnings(["202710", "202730"], sources)).toEqual([]);
  });

  it("returns one warning for the term without a calendar", () => {
    expect(missingCalendarWarnings(["202730", "202810"], sources)).toEqual([
      "Term 202810 has no academic calendar file (expected data/calendar/2027-2028.json); no-class days and exam periods will be missing.",
    ]);
  });

  it("names 2027-2028.json for a legacy Law suffix term", () => {
    expect(missingCalendarWarnings(["202852"], sources)).toEqual([
      "Term 202852 has no academic calendar file (expected data/calendar/2027-2028.json); no-class days and exam periods will be missing.",
    ]);
  });

  it("warns for every term when there are no sources", () => {
    expect(missingCalendarWarnings(["202710", "202730"], [])).toHaveLength(2);
  });

  it("warns once per term when a code is repeated", () => {
    expect(missingCalendarWarnings(["202810", "202810"], sources)).toHaveLength(1);
  });

  it("throws for a term code without a 4-digit year", () => {
    expect(() => missingCalendarWarnings(["FALL"], sources)).toThrow(/does not start with a 4-digit year/);
  });
});
