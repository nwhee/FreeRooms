import { describe, expect, it } from "vitest";
import validFixture from "./__fixtures__/valid-schedule.json";
import { isIsoDate, isValidTimeZone, type ScheduleFile, validateSchedule } from "./schema";

/** A fresh, mutable copy of the valid fixture. */
function fixture(): ScheduleFile {
  return structuredClone(validFixture) as ScheduleFile;
}

/** Validates `data` and returns its errors, failing the test if it passed. */
function errorsFor(data: unknown): string[] {
  const result = validateSchedule(data);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("validateSchedule (FR-1 AC7)", () => {
  it("accepts the valid fixture and returns the parsed data", () => {
    const result = validateSchedule(fixture());
    expect(result).toEqual({ ok: true, data: fixture() });
  });

  it("rejects input that isn't a schedule object", () => {
    expect(errorsFor(null).length).toBeGreaterThan(0);
    expect(errorsFor({ ...fixture(), schemaVersion: 2 })).toEqual([
      expect.stringMatching(/^schemaVersion: /),
    ]);
  });

  it("reports a meeting with an unknown roomId", () => {
    const data = fixture();
    data.meetings[1].roomId = "XX-999";
    expect(errorsFor(data)).toEqual(['meetings[1].roomId: unknown room "XX-999"']);
  });

  it("reports a room in an unknown building", () => {
    const data = fixture();
    data.rooms[0].building = "ZZ";
    expect(errorsFor(data)).toContain('rooms[0].building: unknown building "ZZ"');
  });

  it("reports a building in an unknown campus", () => {
    const data = fixture();
    data.buildings[0].campus = "XYZ";
    expect(errorsFor(data)).toContain('buildings[0].campus: unknown campus "XYZ"');
  });

  it("reports a room in an unknown campus", () => {
    const data = fixture();
    data.rooms[0].campus = "XYZ";
    expect(errorsFor(data)).toContain('rooms[0].campus: unknown campus "XYZ"');
  });

  it("reports a building whose roomCount doesn't match its rooms", () => {
    const data = fixture();
    data.buildings[2].roomCount = 3;
    expect(errorsFor(data)).toEqual([
      'buildings[2].roomCount: is 3 but 2 rooms have building "SL"',
    ]);
  });

  it("reports a campus whose roomCount or buildingCount doesn't match", () => {
    const data = fixture();
    data.campuses[0].roomCount = 4;
    data.campuses[1].buildingCount = 0;
    expect(errorsFor(data)).toEqual([
      'campuses[0].roomCount: is 4 but 3 rooms have campus "BOS"',
      'campuses[1].buildingCount: is 0 but 1 buildings have campus "LDN"',
    ]);
  });

  it.each([0, 128])("reports days %i as outside 1..127", (days) => {
    const data = fixture();
    data.meetings[0].days = days;
    expect(errorsFor(data)).toEqual(["meetings[0].days: must be an integer from 1 to 127"]);
  });

  it("reports a non-integer days value", () => {
    const data = fixture();
    data.meetings[0].days = 1.5;
    expect(errorsFor(data)).toEqual(["meetings[0].days: must be an integer from 1 to 127"]);
  });

  it.each([
    [700, 700],
    [800, 700],
  ])("reports start %i not before end %i", (start, end) => {
    const data = fixture();
    data.meetings[0].start = start;
    data.meetings[0].end = end;
    expect(errorsFor(data)).toEqual([`meetings[0]: start ${start} is not before end ${end}`]);
  });

  it("reports end 1441 as past midnight, and accepts end 1440", () => {
    const data = fixture();
    data.meetings[0].end = 1441;
    expect(errorsFor(data)).toEqual(["meetings[0].end: must be an integer from 1 to 1440"]);

    data.meetings[0].end = 1440;
    expect(validateSchedule(data).ok).toBe(true);
  });

  it("reports a negative start", () => {
    const data = fixture();
    data.meetings[0].start = -1;
    expect(errorsFor(data)).toEqual(["meetings[0].start: must be an integer from 0 to 1439"]);
  });

  it("reports startDate after endDate on a meeting", () => {
    const data = fixture();
    data.meetings[0].startDate = "2026-12-05";
    expect(errorsFor(data)).toEqual([
      "meetings[0]: startDate 2026-12-05 is after endDate 2026-12-04",
    ]);
  });

  it("reports startDate after endDate on terms, parts of term and calendar entries", () => {
    const data = fixture();
    data.terms[0].startDate = "2026-12-21";
    data.terms[0].partsOfTerm[0].endDate = "2026-09-01";
    data.calendar.noClassDates[1].end = "2026-11-24";
    data.calendar.examPeriods[0].start = "2026-12-21";
    expect(errorsFor(data)).toEqual([
      "terms[0]: startDate 2026-12-21 is after endDate 2026-12-20",
      "terms[0].partsOfTerm[0]: startDate 2026-09-09 is after endDate 2026-09-01",
      "calendar.noClassDates[1]: start 2026-11-25 is after end 2026-11-24",
      "calendar.examPeriods[0]: start 2026-12-21 is after end 2026-12-20",
    ]);
  });

  it.each(["11/11/2026", "2026-1-05", "2026-02-30", "2026-13-01", ""])(
    "reports bad date format %j",
    (value) => {
      const data = fixture();
      data.meetings[2].startDate = value;
      expect(errorsFor(data)).toEqual([
        `meetings[2].startDate: must be a date in YYYY-MM-DD format, got ${JSON.stringify(value)}`,
      ]);
    },
  );

  it("reports an invalid timezone", () => {
    const data = fixture();
    data.campuses[1].timezone = "Mars/Olympus_Mons";
    expect(errorsFor(data)).toEqual([
      'campuses[1].timezone: "Mars/Olympus_Mons" is not a time zone accepted by Intl.DateTimeFormat',
    ]);
  });

  it("reports roomedMeetingCount greater than meetingCount", () => {
    const data = fixture();
    data.terms[0].roomedMeetingCount = 6;
    expect(errorsFor(data)).toEqual(["terms[0].roomedMeetingCount: 6 exceeds meetingCount 5"]);
  });

  it("reports a negative count", () => {
    const data = fixture();
    data.terms[0].roomedMeetingCount = -1;
    expect(errorsFor(data)).toEqual(["terms[0].roomedMeetingCount: must be a non-negative integer"]);
  });

  it("reports an exam period with empty partsOfTerm", () => {
    const data = fixture();
    data.calendar.examPeriods[1].partsOfTerm = [];
    expect(errorsFor(data)).toEqual(["calendar.examPeriods[1].partsOfTerm: must not be empty"]);
  });

  it("reports a generatedAt that isn't an ISO UTC timestamp", () => {
    const data = fixture();
    data.generatedAt = "yesterday";
    expect(errorsFor(data)).toEqual(["generatedAt: must be an ISO 8601 UTC timestamp"]);
  });

  it("rejects a non-UTC generatedAt and accepts UTC without milliseconds", () => {
    const data = fixture();
    data.generatedAt = "2026-11-09T07:00:00+01:00";
    expect(errorsFor(data)).toEqual(["generatedAt: must be an ISO 8601 UTC timestamp"]);

    data.generatedAt = "2026-11-09T07:00:00Z";
    expect(validateSchedule(data).ok).toBe(true);
  });

  it("reports a duplicate term code", () => {
    const data = fixture();
    data.terms.push({ ...structuredClone(data.terms[0]), description: "Fall 2026 again" });
    expect(errorsFor(data)).toEqual(['terms[1].code: duplicate "202710" (first at terms[0])']);
  });

  it("reports a duplicate campus code", () => {
    const data = fixture();
    data.campuses[1].code = "BOS";
    expect(errorsFor(data)).toContain('campuses[1].code: duplicate "BOS" (first at campuses[0])');
  });

  it("reports a duplicate building code", () => {
    const data = fixture();
    data.buildings[2].code = "DK";
    expect(errorsFor(data)).toContain('buildings[2].code: duplicate "DK" (first at buildings[0])');
  });

  it("reports a duplicate room id", () => {
    const data = fixture();
    data.rooms[3].id = "SL-033";
    expect(errorsFor(data)).toContain('rooms[3].id: duplicate "SL-033" (first at rooms[2])');
  });

  it("reports a room whose campus differs from its building's campus", () => {
    const data = fixture();
    // Counts stay consistent, so the campus mismatch is the only error.
    data.rooms[2].campus = "LDN";
    data.campuses[0].roomCount = 2;
    data.campuses[1].roomCount = 2;
    expect(errorsFor(data)).toEqual([
      'rooms[2].campus: is "LDN" but building "SL" is in campus "BOS"',
    ]);
  });

  it("reports a meeting with an unknown termCode", () => {
    const data = fixture();
    data.meetings[0].termCode = "202799";
    expect(errorsFor(data)).toEqual(['meetings[0].termCode: unknown term "202799"']);
  });

  it("rejects unknown keys at the top level and in nested objects", () => {
    expect(errorsFor({ ...fixture(), extra: true })).toEqual([
      expect.stringMatching(/^Unrecognized key.*"extra"/),
    ]);

    const data = fixture();
    Object.assign(data.rooms[0], { capacity: 30 });
    Object.assign(data.calendar, { source: "pdf" });
    expect(errorsFor(data)).toEqual([
      expect.stringMatching(/^rooms\[0\]: Unrecognized key.*"capacity"/),
      expect.stringMatching(/^calendar: Unrecognized key.*"source"/),
    ]);
  });

  it("accepts empty campuses, buildings, rooms and meetings when counts are consistent", () => {
    // FR-0 has no non-empty invariant; FR-2 refuses to write 0 rooms or 0 meetings itself.
    const data = fixture();
    data.campuses = [];
    data.buildings = [];
    data.rooms = [];
    data.meetings = [];
    expect(validateSchedule(data)).toEqual({ ok: true, data });
  });

  it("reports a campus with no rooms (FR-0: only campuses with at least one room)", () => {
    const data = fixture();
    data.campuses.push({
      code: "VAN",
      name: "Vancouver, Canada",
      timezone: "America/Vancouver",
      buildingCount: 0,
      roomCount: 0,
    });
    expect(errorsFor(data)).toEqual(['campuses[2]: campus "VAN" has no rooms']);
  });

  it("reports every failure at once", () => {
    const data = fixture();
    data.meetings[0].roomId = "XX-1";
    data.terms[0].roomedMeetingCount = 9;
    expect(errorsFor(data)).toHaveLength(2);
  });
});

describe("isIsoDate", () => {
  it("accepts real dates, including leap days", () => {
    expect(isIsoDate("2026-11-09")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects impossible dates", () => {
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-00-10")).toBe(false);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
