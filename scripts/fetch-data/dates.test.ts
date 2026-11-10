import { describe, expect, it } from "vitest";
import { addDays, newYorkDate, parseBannerDate, parseBannerTime } from "./dates";

describe("dates", () => {
  it('converts "1030" to 630 and rejects bad times', () => {
    expect(parseBannerTime("1030")).toBe(630);
    expect(parseBannerTime("0000")).toBe(0);
    expect(parseBannerTime("2400")).toBe(1440);
    for (const bad of ["2401", "1060", "930", "10:30", "", null, undefined]) {
      expect(parseBannerTime(bad)).toBeNull();
    }
  });

  it("converts MM/DD/YYYY to YYYY-MM-DD and rejects impossible dates", () => {
    expect(parseBannerDate("01/13/2027")).toBe("2027-01-13");
    for (const bad of ["02/30/2027", "2027-01-13", "1/13/2027", null, undefined]) {
      expect(parseBannerDate(bad)).toBeNull();
    }
  });

  it("uses the America/New_York date for today", () => {
    // 03:00 UTC on Dec 21 is still Dec 20 in New York.
    expect(newYorkDate(new Date("2026-12-21T03:00:00Z"))).toBe("2026-12-20");
    expect(newYorkDate(new Date("2026-12-21T06:00:00Z"))).toBe("2026-12-21");
  });

  it("adds calendar days across month and year ends", () => {
    expect(addDays("2026-11-08", 120)).toBe("2027-03-08");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
