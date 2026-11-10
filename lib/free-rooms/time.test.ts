import { describe, expect, it } from "vitest";
import { formatMinutes, isStale, localNow, weekdayBit } from "./time";

/** IANA tzdata version of this runtime, e.g. "2026c". Versions compare as text (YYYY + letter). */
const tzdata: string | undefined = process.versions.tz;
const hasBcPermanentDst = tzdata !== undefined && tzdata >= "2026c";

describe("localNow (AC11: timezones and DST)", () => {
  it.each([
    ["America/New_York", "2026-11-18", 600],
    ["Europe/London", "2026-11-18", 900],
    ["America/Los_Angeles", "2026-11-18", 420],
    ["America/Toronto", "2026-11-18", 600],
  ])("reads 2026-11-18T15:00:00Z in %s as %s minute %i", (zone, date, minutes) => {
    expect(localNow(zone, new Date("2026-11-18T15:00:00Z"))).toEqual({ date, minutes, weekday: 3 });
  });

  // FR-0 "Timezone data": under tzdata 2026c+ Vancouver is permanent UTC-7, so 15:00Z is 480.
  it.skipIf(!hasBcPermanentDst)(
    hasBcPermanentDst
      ? "reads 2026-11-18T15:00:00Z in America/Vancouver as 2026-11-18 minute 480"
      : `America/Vancouver 480 skipped: runtime tzdata ${tzdata ?? "unknown"} is older than 2026c`,
    () => {
      expect(localNow("America/Vancouver", new Date("2026-11-18T15:00:00Z"))).toEqual({
        date: "2026-11-18",
        minutes: 480,
        weekday: 3,
      });
    },
  );

  it.each([
    ["America/New_York", 660],
    ["Europe/London", 900],
    ["America/Los_Angeles", 480],
  ])("applies DST on 2027-03-20 (US on DST, UK not yet) in %s -> %i", (zone, minutes) => {
    expect(localNow(zone, new Date("2027-03-20T15:00:00Z"))).toEqual({
      date: "2027-03-20",
      minutes,
      weekday: 6,
    });
  });

  it("rolls the New York date back across midnight while London is already on the next day", () => {
    const instant = new Date("2026-11-19T03:30:00Z");
    expect(localNow("America/New_York", instant)).toEqual({ date: "2026-11-18", minutes: 1350, weekday: 3 });
    expect(localNow("Europe/London", instant)).toEqual({ date: "2026-11-19", minutes: 210, weekday: 4 });
  });

  it("reports local midnight as minute 0, not 1440", () => {
    expect(localNow("America/New_York", new Date("2026-11-18T05:00:00Z"))).toEqual({
      date: "2026-11-18",
      minutes: 0,
      weekday: 3,
    });
  });

  it("throws a RangeError for an unknown zone or an invalid instant", () => {
    expect(() => localNow("Mars/Olympus", new Date())).toThrow(RangeError);
    expect(() => localNow("America/New_York", new Date("nope"))).toThrow(RangeError);
  });
});

describe("weekdayBit", () => {
  it.each([
    ["2026-11-16", 1],
    ["2026-11-17", 2],
    ["2026-11-18", 4],
    ["2026-11-19", 8],
    ["2026-11-20", 16],
    ["2026-11-21", 32],
    ["2026-11-22", 64],
  ])("maps %s to bit %i (Mon=1 … Sun=64)", (date, bit) => {
    expect(weekdayBit(date)).toBe(bit);
  });

  it.each(["2026-02-30", "2026-11-1", "18/11/2026", ""])("throws a RangeError for malformed date %j", (date) => {
    expect(() => weekdayBit(date)).toThrow(RangeError);
  });
});

describe("isStale (AC12)", () => {
  const generatedAt = "2026-11-09T07:00:00.000Z";

  it("is false at exactly 72 h after generatedAt", () => {
    expect(isStale(generatedAt, new Date("2026-11-12T07:00:00.000Z"))).toBe(false);
  });

  it("is true at 72 h + 1 min", () => {
    expect(isStale(generatedAt, new Date("2026-11-12T07:01:00.000Z"))).toBe(true);
  });

  it("throws a RangeError for an unparseable generatedAt", () => {
    expect(() => isStale("yesterday", new Date())).toThrow(RangeError);
  });

  it("throws a RangeError for an invalid now", () => {
    expect(() => isStale(generatedAt, new Date("nope"))).toThrow(RangeError);
  });
});

describe("formatMinutes", () => {
  it.each([
    [630, "10:30 AM"],
    [1440, "12:00 AM"],
    [0, "12:00 AM"],
    [720, "12:00 PM"],
    [815, "1:35 PM"],
    [1439, "11:59 PM"],
    [65, "1:05 AM"],
  ])("formats %i as %j", (m, text) => {
    expect(formatMinutes(m)).toBe(text);
  });

  it.each([-1, 1441, 1.5, Number.NaN])("throws a RangeError for %d", (m) => {
    expect(() => formatMinutes(m)).toThrow(RangeError);
  });
});
