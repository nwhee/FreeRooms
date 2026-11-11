import { describe, expect, it } from "vitest";
import type { Term } from "@/lib/data/schema";
import {
  daysSince,
  formatShortDate,
  formatTermRanges,
  parseDateValue,
  parseTimeValue,
  toTimeValue,
} from "./format";

const term = (startDate: string, endDate: string): Term => ({
  code: "202710",
  description: "Fall 2026 Semester",
  startDate,
  endDate,
  partsOfTerm: [],
  meetingCount: 0,
  roomedMeetingCount: 0,
});

describe("format helpers", () => {
  it("formats a campus-local date without shifting it by the viewer's zone", () => {
    expect(formatShortDate("2026-11-11")).toBe("Wed, Nov 11");
  });

  it("lists term ranges", () => {
    expect(formatTermRanges([term("2026-09-02", "2026-12-20"), term("2027-01-13", "2027-05-02")])).toBe(
      "Sep 2, 2026 – Dec 20, 2026 and Jan 13, 2027 – May 2, 2027",
    );
  });

  it("counts whole days, rounding down", () => {
    // Day rounding only. These hours are not the stale threshold (360 h, FR-8), which
    // free-rooms-app.test.tsx and time.test.ts pin.
    const generatedAt = "2026-11-18T07:00:00.000Z";
    expect(daysSince(generatedAt, new Date("2026-11-21T08:00:00Z"))).toBe(3); // 73 h: 3 days 1 h
    expect(daysSince(generatedAt, new Date("2026-11-22T06:00:00Z"))).toBe(3); // 95 h: 3 days 23 h
    expect(daysSince(generatedAt, new Date("2026-11-22T07:00:00Z"))).toBe(4); // 96 h: exactly 4 days
  });

  it("round-trips time input values", () => {
    expect(toTimeValue(0)).toBe("00:00");
    expect(toTimeValue(815)).toBe("13:35");
    expect(parseTimeValue("13:35")).toBe(815);
    expect(parseTimeValue("23:59:30")).toBe(1439);
    expect(parseTimeValue("")).toBeNull();
    expect(parseTimeValue("24:00")).toBeNull();
  });

  it("accepts only real dates from the date input", () => {
    expect(parseDateValue("2026-12-25")).toBe("2026-12-25");
    expect(parseDateValue("")).toBeNull();
    expect(parseDateValue("2026-02-30")).toBeNull();
  });
});
