import { describe, expect, it } from "vitest";
import type { Meeting } from "../data/schema";
import { CALENDAR, makeSchedule, meeting } from "./__fixtures__/schedule";
import { buildIndex } from "./build-index";
import { type RoomStatus, roomStatusesAt } from "./status";

const WED = "2026-11-18";

/** The status of one room at (date, minutes) for a schedule with `meetings`. */
function statusAt(meetings: Meeting[], date: string, minutes: number, roomId = "SL-117"): RoomStatus {
  const index = buildIndex(makeSchedule({ meetings }));
  const campus = index.data.rooms.find((room) => room.id === roomId)?.campus ?? "";
  const status = roomStatusesAt(index, campus, date, minutes).find((s) => s.roomId === roomId);
  if (status === undefined) throw new Error(`no status for ${roomId}`);
  return status;
}

const busy = (busyUntil: number) => ({ roomId: "SL-117", free: false, busyUntil });
const free = (freeUntil: number | null, roomId = "SL-117") => ({ roomId, free: true, freeUntil });

describe("AC1 basic busy and free, end exclusive", () => {
  const mwf = [meeting({ days: 21, start: 630, end: 695 })];

  it.each([630, 694])("is busy at %i with busyUntil 695", (minutes) => {
    expect(statusAt(mwf, WED, minutes)).toEqual(busy(695));
  });

  it.each([695, 629])("is free at %i", (minutes) => {
    expect(statusAt(mwf, WED, minutes).free).toBe(true);
  });
});

describe("AC2 free until", () => {
  const twoMeetings = [meeting({ start: 630, end: 695 }), meeting({ start: 815, end: 880 })];

  it.each([
    [700, 815],
    [900, null],
    [0, 630],
  ])("at %i is free until %s", (minutes, freeUntil) => {
    expect(statusAt(twoMeetings, WED, minutes)).toEqual(free(freeUntil));
  });
});

describe("AC3 weekday and date range", () => {
  // Every day bit set, so only the date range decides on the edge days.
  const everyDay = [meeting({ days: 127, startDate: "2026-11-16", endDate: "2026-11-20" })];

  it("is not busy on Tue 2026-11-17 when the Tuesday bit isn't set", () => {
    expect(statusAt([meeting({ days: 21 })], "2026-11-17", 640)).toEqual(free(null));
  });

  it("is not busy the day before startDate or the day after endDate", () => {
    expect(statusAt(everyDay, "2026-11-15", 640)).toEqual(free(null));
    expect(statusAt(everyDay, "2026-11-21", 640)).toEqual(free(null));
  });

  it("is busy on startDate and endDate themselves", () => {
    expect(statusAt(everyDay, "2026-11-16", 640)).toEqual(busy(695));
    expect(statusAt(everyDay, "2026-11-20", 640)).toEqual(busy(695));
  });
});

describe("AC4 back-to-back blocks", () => {
  it("merges 10:30–11:35 and 11:35–12:40: at 640 busyUntil 760", () => {
    const meetings = [meeting({ start: 630, end: 695 }), meeting({ start: 695, end: 760 })];
    expect(statusAt(meetings, WED, 640)).toEqual(busy(760));
  });

  it("keeps 10:30–11:35 and 11:45–12:50 apart: at 640 busyUntil 695", () => {
    const meetings = [meeting({ start: 630, end: 695 }), meeting({ start: 705, end: 770 })];
    expect(statusAt(meetings, WED, 640)).toEqual(busy(695));
  });

  it("merges overlapping and nested meetings, whatever their file order", () => {
    const meetings = [
      meeting({ start: 700, end: 800, startDate: "2026-09-02" }),
      meeting({ start: 630, end: 720 }),
      meeting({ start: 640, end: 650 }),
    ];
    expect(statusAt(meetings, WED, 645)).toEqual(busy(800));
  });

  it("treats a meeting ending at 1440 as busy until the end of the day", () => {
    expect(statusAt([meeting({ start: 1320, end: 1440 })], WED, 1439)).toEqual(busy(1440));
  });
});

describe("AC5 several terms and parts of term", () => {
  const part2A = meeting({ partOfTerm: "2A", startDate: "2026-09-09", endDate: "2026-10-25" });
  const part2B = meeting({ partOfTerm: "2B", startDate: "2026-11-02", endDate: "2026-12-20" });
  const MON = "2026-11-02";

  it("does not count a 2A meeting ending 2026-10-25 on 2026-11-02", () => {
    expect(statusAt([part2A], MON, 640).free).toBe(true);
  });

  it("counts a 2B meeting starting 2026-11-02 on that date", () => {
    expect(statusAt([part2B], MON, 640)).toEqual(busy(695));
  });

  it("counts a 202710 and a 202730 meeting in the same room only inside their own dates", () => {
    const fall = meeting({ termCode: "202710", start: 630, end: 695 });
    const spring = meeting({
      termCode: "202730",
      start: 815,
      end: 880,
      startDate: "2027-01-13",
      endDate: "2027-05-02",
    });
    const both = [fall, spring];
    // Wed 2026-11-18: only the fall meeting.
    expect(statusAt(both, WED, 640)).toEqual(busy(695));
    expect(statusAt(both, WED, 820)).toEqual(free(null));
    // Wed 2027-02-03: only the spring meeting.
    expect(statusAt(both, "2027-02-03", 640)).toEqual(free(815));
    expect(statusAt(both, "2027-02-03", 820)).toEqual(busy(880));
  });
});

describe("AC6 no-class date by campus", () => {
  const VETERANS_DAY = "2026-11-11"; // a Wednesday; entry covers BOS and VAN
  const meetings = [meeting(), meeting({ roomId: "TOR-110" })];

  it("suppresses a BOS room's recurring meeting: free all day, freeUntil null", () => {
    expect(statusAt(meetings, VETERANS_DAY, 0)).toEqual(free(null));
    expect(statusAt(meetings, VETERANS_DAY, 640)).toEqual(free(null));
  });

  it("still counts a TOR room's meeting", () => {
    expect(statusAt(meetings, VETERANS_DAY, 640, "TOR-110")).toEqual({
      roomId: "TOR-110",
      free: false,
      busyUntil: 695,
    });
  });
});

describe("AC7 range no-class (Fall break 2026-11-25…29)", () => {
  const daily = [meeting({ days: 127 })];

  it.each(["2026-11-25", "2026-11-29"])("suppresses recurring meetings on %s", (date) => {
    expect(statusAt(daily, date, 640)).toEqual(free(null));
  });

  it.each(["2026-11-24", "2026-11-30"])("does not suppress them on %s", (date) => {
    expect(statusAt(daily, date, 640)).toEqual(busy(695));
  });
});

describe("AC8 one-day meetings always count", () => {
  it("counts a one-day meeting at a BOS room on the 2026-11-11 no-class date", () => {
    const oneDay = [meeting({ startDate: "2026-11-11", endDate: "2026-11-11" })];
    expect(statusAt(oneDay, "2026-11-11", 640)).toEqual(busy(695));
  });

  it("counts a one-day part-1 meeting on 2026-12-15 during the exam period", () => {
    const oneDay = [meeting({ days: 2, startDate: "2026-12-15", endDate: "2026-12-15" })];
    expect(statusAt(oneDay, "2026-12-15", 640)).toEqual(busy(695));
  });
});

describe("AC9 exam periods (data-driven partsOfTerm)", () => {
  const TUESDAY = 2;
  const examDay = (partOfTerm: string, endDate = "2026-12-20") =>
    meeting({ days: TUESDAY, partOfTerm, startDate: "2026-09-08", endDate });

  it("on 2026-12-15 suppresses a recurring part 1 meeting", () => {
    expect(statusAt([examDay("1")], "2026-12-15", 640)).toEqual(free(null));
  });

  it.each(["2B", "3C"])("on 2026-12-15 still counts a recurring %s meeting", (part) => {
    expect(statusAt([examDay(part)], "2026-12-15", 640)).toEqual(busy(695));
  });

  it("on 2026-12-08 (Law window only) suppresses 1L and still counts part 1", () => {
    expect(statusAt([examDay("1L")], "2026-12-08", 640)).toEqual(free(null));
    expect(statusAt([examDay("1")], "2026-12-08", 640)).toEqual(busy(695));
  });

  it("suppresses whatever parts the data lists, with no hard-coded codes", () => {
    const customExams = {
      ...CALENDAR,
      examPeriods: [{ start: "2026-12-15", end: "2026-12-15", label: "Custom", partsOfTerm: ["2B"] }],
    };
    const index = buildIndex(makeSchedule({ meetings: [examDay("2B")], calendar: customExams }));
    const status = roomStatusesAt(index, "BOS", "2026-12-15", 640).find((s) => s.roomId === "SL-117");
    expect(status).toEqual(free(null));
  });
});

describe("AC13 campus filter", () => {
  const index = buildIndex(makeSchedule({ meetings: [meeting(), meeting({ roomId: "TOR-110" })] }));

  it("returns one status per BOS room and only BOS rooms", () => {
    const statuses = roomStatusesAt(index, "BOS", WED, 640);
    expect(statuses.map((s) => s.roomId)).toEqual(["SL-033", "SL-117"]);
  });

  it("reports rooms with no meetings as free with freeUntil null", () => {
    const statuses = roomStatusesAt(index, "BOS", WED, 640);
    expect(statuses.find((s) => s.roomId === "SL-033")).toEqual(free(null, "SL-033"));
  });

  it("returns an empty array for an unknown campus", () => {
    expect(roomStatusesAt(index, "XYZ", WED, 640)).toEqual([]);
  });
});

describe("roomStatusesAt input checks", () => {
  const index = buildIndex(makeSchedule());

  it.each([-1, 1440, 12.5, Number.NaN])("throws a RangeError for minutes %d", (minutes) => {
    expect(() => roomStatusesAt(index, "BOS", WED, minutes)).toThrow(RangeError);
  });

  it.each(["2026-11-31", "2026/11/18", "tomorrow"])("throws a RangeError for date %j", (date) => {
    expect(() => roomStatusesAt(index, "BOS", date, 600)).toThrow(RangeError);
  });
});
