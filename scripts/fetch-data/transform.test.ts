import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCalendarBlock, loadCalendarFiles } from "../../lib/calendar/load";
import { validateSchedule } from "../../lib/data/schema";
import { type BannerSection, searchPageSchema, termsPageSchema } from "./banner-client";
import { dedupeSections, type FetchedTerm, selectTermsToFetch, transformTerms } from "./transform";
import { buildScheduleFile } from "./write";
import { section } from "./__fixtures__/sections";

const CALENDAR = buildCalendarBlock(loadCalendarFiles(fileURLToPath(new URL("../../data/calendar", import.meta.url))));

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));
}

function fixturePage(term: string): BannerSection[] {
  return searchPageSchema.parse(fixture(`searchResults-${term}.json`)).data ?? [];
}

const FIXTURE_TERMS: FetchedTerm[] = [
  { code: "202710", description: "Fall 2026 Semester", sections: fixturePage("202710") },
  { code: "202730", description: "Spring 2027 Semester", sections: fixturePage("202730") },
];

/** Transform, assemble and validate; fails the test if the output is invalid. */
function run(fetched: FetchedTerm[], today = "2026-11-09") {
  const result = transformTerms(fetched, today);
  const file = buildScheduleFile({
    entities: result,
    calendar: CALENDAR,
    warnings: result.warnings,
    generatedAt: "2026-11-09T08:00:00.000Z",
  });
  const validation = validateSchedule(file);
  expect(validation.ok ? [] : validation.errors).toEqual([]);
  return { result, file };
}

function term(code: string, sections: BannerSection[], description = `Term ${code}`): FetchedTerm {
  return { code, description, sections };
}

describe("transform of the captured Banner pages (FR-2 AC1)", () => {
  const { file, result } = run(FIXTURE_TERMS);
  const roomIds = file.rooms.map((room) => room.id);

  it("passes validateSchedule", () => {
    expect(validateSchedule(file).ok).toBe(true);
  });

  it("excludes null-room, VTL, null-beginTime, Online and no-campus meetings", () => {
    expect(roomIds).toEqual([
      "CH-103",
      "DK-240",
      "LDV-4.01",
      "OB-205",
      "RI-300",
      "RP-200",
      "RP-210",
      "RY-155",
      "SL-117",
      "WVH-210",
    ]);
    // RY-155 also has a null-beginTime section (30370); only 30470's two patterns count.
    expect(file.meetings.filter((m) => m.roomId === "RY-155")).toHaveLength(2);
    for (const excluded of ["VTL", "OLB", "NCB", "MX"]) {
      expect(file.buildings.map((b) => b.code)).not.toContain(excluded);
    }
  });

  it("keeps the duplicate CRN once", () => {
    expect(fixturePage("202730").filter((s) => s.courseReferenceNumber === "30351")).toHaveLength(2);
    expect(file.meetings.filter((m) => m.roomId === "SL-117" && m.termCode === "202730")).toHaveLength(1);
  });

  it("decodes &amp; and &#39; in names", () => {
    const byId = new Map(file.rooms.map((room) => [room.id, room]));
    expect(byId.get("RI-300")?.displayName).toBe("Richards Hall & Annex 300");
    expect(byId.get("OB-205")?.displayName).toBe("O'Bryant Institute 205");
    expect(file.buildings.find((b) => b.code === "RI")?.name).toBe("Richards Hall & Annex");
    expect(JSON.stringify(file)).not.toMatch(/&amp;|&#39;/);
  });

  it("keeps a one-day meeting with startDate == endDate", () => {
    expect(file.meetings.filter((m) => m.roomId === "CH-103")).toEqual([
      { roomId: "CH-103", days: 32, start: 540, end: 720, startDate: "2027-02-06", endDate: "2027-02-06", partOfTerm: "1", termCode: "202730" },
    ]);
  });

  it("turns the ACCT 1201 sample into the expected meeting", () => {
    expect(file.meetings).toContainEqual({
      roomId: "SL-117",
      days: 13,
      start: 630,
      end: 695,
      startDate: "2027-01-13",
      endDate: "2027-05-02",
      partOfTerm: "1",
      termCode: "202730",
    });
  });

  it("skips an unknown campus with a warning naming it", () => {
    expect(result.warnings).toContain('Unknown campus "Mars Colony" on 1 meeting; skipped.');
    expect(result.warnings.filter((w) => w.startsWith("Unknown campus"))).toHaveLength(1);
  });

  it("keeps the CPS 2A section and the Law 1L section in Dockser, with their partOfTerm", () => {
    expect(file.meetings).toContainEqual(
      expect.objectContaining({ roomId: "RP-200", partOfTerm: "2A", termCode: "202710", startDate: "2026-09-09", endDate: "2026-10-25" }),
    );
    expect(file.meetings).toContainEqual(
      expect.objectContaining({ roomId: "DK-240", partOfTerm: "1L", termCode: "202710", days: 7 }),
    );
    expect(file.rooms).toContainEqual(
      { id: "DK-240", campus: "BOS", building: "DK", room: "240", displayName: "Dockser Hall 240" },
    );
    expect(file.terms.find((t) => t.code === "202710")?.partsOfTerm.map((p) => p.code)).toEqual(["1", "1L", "2A", "3C"]);
  });

  it("lists London as its own campus, after Boston", () => {
    expect(file.campuses.map((c) => [c.code, c.timezone, c.roomCount])).toEqual([
      ["BOS", "America/New_York", 9],
      ["LDN", "Europe/London", 1],
    ]);
  });

  it("collapses the cross-listed pair to one meeting", () => {
    expect(file.meetings.filter((m) => m.roomId === "WVH-210")).toHaveLength(1);
  });

  it("counts candidate and roomed meetings per term", () => {
    expect(file.terms.map((t) => [t.code, t.meetingCount, t.roomedMeetingCount])).toEqual([
      ["202710", 4, 4],
      ["202730", 12, 11],
    ]);
  });
});

describe("term discovery and window (FR-2 AC2)", () => {
  const bannerTerms = termsPageSchema.parse(fixture("getTerms.json"));

  it("ignores (View Only) terms and fetches a non-View-Only legacy code like 202815", () => {
    const terms = [...bannerTerms, { code: "202815", description: "Fall 2027 CPS Quarter" }];
    expect(selectTermsToFetch(terms, [], "2026-11-09")).toEqual([
      { code: "202710", description: "Fall 2026 Semester" },
      { code: "202730", description: "Spring 2027 Semester" },
      { code: "202815", description: "Fall 2027 CPS Quarter" },
    ]);
  });

  it("fetches a View Only term that the existing file has with endDate >= today, but not one that ended", () => {
    const terms = [{ code: "202710", description: "Fall 2026 Semester (View Only)" }];
    const existing = [{ code: "202710", description: "Fall 2026 Semester", endDate: "2026-12-20" }];
    expect(selectTermsToFetch(terms, existing, "2026-12-20")).toEqual([
      { code: "202710", description: "Fall 2026 Semester" },
    ]);
    expect(selectTermsToFetch(terms, existing, "2026-12-21")).toEqual([]);
  });

  it("fetches an existing in-window term even if Banner no longer lists it", () => {
    const existing = [{ code: "202710", description: "Fall 2026 Semester", endDate: "2026-12-20" }];
    expect(selectTermsToFetch([], existing, "2026-11-20")).toEqual([
      { code: "202710", description: "Fall 2026 Semester" },
    ]);
  });

  it("drops 202710 (ends 2026-12-20) on 2026-12-21 and keeps 202730", () => {
    const { result } = run(FIXTURE_TERMS, "2026-12-21");
    expect(result.terms.map((t) => t.code)).toEqual(["202730"]);
    expect(result.skipped).toEqual([{ code: "202710", reason: "ended 2026-12-20" }]);
    expect(result.meetings.every((m) => m.termCode === "202730")).toBe(true);
  });

  it("keeps both on 2026-11-08", () => {
    const { file } = run(FIXTURE_TERMS, "2026-11-08");
    expect(file.terms.map((t) => [t.code, t.startDate, t.endDate])).toEqual([
      ["202710", "2026-09-02", "2026-12-20"],
      ["202730", "2027-01-13", "2027-05-02"],
    ]);
  });

  it("drops a term that starts more than 120 days after today", () => {
    const later = term("202750", [section({ crn: "1", term: "202750", meetings: [{ startDate: "05/12/2027", endDate: "08/22/2027" }] })]);
    expect(transformTerms([later], "2027-01-11").skipped).toEqual([
      { code: "202750", reason: "starts 2027-05-12, after 2027-05-11" },
    ]);
    expect(transformTerms([later], "2027-01-12").terms.map((t) => t.code)).toEqual(["202750"]);
  });

  it("sets term startDate from the earliest meeting even when it has no room", () => {
    const sections = [
      section({ crn: "1", meetings: [{ building: null, room: null, startDate: "01/06/2027", endDate: "01/20/2027" }] }),
      section({ crn: "2", meetings: [{ startDate: "01/13/2027", endDate: "05/02/2027" }] }),
    ];
    const { file } = run([term("202730", sections)]);
    expect(file.terms[0]).toMatchObject({ startDate: "2027-01-06", endDate: "2027-05-02" });
    expect(file.terms[0].partsOfTerm).toEqual([{ code: "1", startDate: "2027-01-06", endDate: "2027-05-02" }]);
  });
});

describe("room-assignment counts (FR-2 AC6)", () => {
  it("counts 10 candidates with 6 roomed; online and no-time meetings count in neither", () => {
    const sections = [
      ...Array.from({ length: 6 }, (_, i) => section({ crn: `r${i}`, meetings: [{ room: String(100 + i) }] })),
      ...Array.from({ length: 4 }, (_, i) => section({ crn: `u${i}`, meetings: [{ building: null, room: null }] })),
      section({ crn: "vtl", meetings: [{ building: "VTL", room: "ONLINE" }] }),
      section({ crn: "online", campus: "Online", meetings: [{ building: "SL", room: "999" }] }),
      section({ crn: "notime", meetings: [{ beginTime: null, endTime: null, room: "998" }] }),
      section({ crn: "nodays", meetings: [{ days: [], room: "997" }] }),
    ];
    const { file } = run([term("202730", sections)]);
    expect(file.terms[0]).toMatchObject({ meetingCount: 10, roomedMeetingCount: 6 });
    expect(file.rooms).toHaveLength(6);
  });
});

describe("building campus (FR-2 AC6b)", () => {
  function inBuilding(building: string, campuses: string[]) {
    return campuses.map((campus, i) =>
      section({ crn: `${building}${i}`, campus, meetings: [{ building, room: String(100 + i) }] }),
    );
  }

  it("assigns XB the majority campus BOS, on every room, with one warning naming XB, BOS and BRD", () => {
    const { file, result } = run([term("202730", inBuilding("XB", ["Boston", "Boston", "Boston", "Boston - Broad Street"]))]);
    expect(file.buildings).toEqual([{ code: "XB", name: "XB Hall", campus: "BOS", roomCount: 4 }]);
    expect(file.rooms.map((room) => room.campus)).toEqual(["BOS", "BOS", "BOS", "BOS"]);
    expect(result.warnings.filter((w) => w.includes("XB"))).toEqual([
      "Building XB has sections from campuses BOS, BRD; assigned BOS.",
    ]);
  });

  it("breaks a 2-2 BRD/BOS tie to BOS, the lowest code", () => {
    const { file, result } = run([
      term("202730", inBuilding("TB", ["Boston - Broad Street", "Boston - Broad Street", "Boston", "Boston"])),
    ]);
    expect(file.buildings[0].campus).toBe("BOS");
    expect(result.warnings).toContain("Building TB has sections from campuses BOS, BRD; assigned BOS.");
  });

  it("gives no warning when all of a building's sections share a campus", () => {
    const { result } = run([term("202730", inBuilding("YB", ["Boston - Broad Street", "Boston - Broad Street"]))]);
    expect(result.warnings).toEqual([]);
  });

  it("keeps every room's campus equal to its building's (validateSchedule invariant)", () => {
    const { file } = run([
      term("202730", [...inBuilding("XB", ["Boston", "Boston", "Boston - Broad Street"]), ...inBuilding("YB", ["London"])]),
    ]);
    const campusOf = new Map(file.buildings.map((b) => [b.code, b.campus]));
    for (const room of file.rooms) expect(room.campus).toBe(campusOf.get(room.building));
    expect(file.campuses.map((c) => c.code)).toEqual(["BOS", "LDN"]);
  });
});

describe("dedupe (FR-2 AC7)", () => {
  const meetingInput = { building: "SL", room: "117", startDate: "01/13/2027", endDate: "05/02/2027" };

  it("collapses identical part-1 meetings from 202730 and 202710 to one with termCode 202710", () => {
    const { file } = run([
      term("202730", [section({ crn: "1", term: "202730", meetings: [meetingInput] })]),
      term("202710", [section({ crn: "2", term: "202710", meetings: [meetingInput] })]),
    ]);
    expect(file.meetings).toHaveLength(1);
    expect(file.meetings[0].termCode).toBe("202710");
  });

  it("keeps identical meetings with parts 1 and 2B as two", () => {
    const { file } = run([
      term("202730", [
        section({ crn: "1", partOfTerm: "1", meetings: [meetingInput] }),
        section({ crn: "2", partOfTerm: "2B", meetings: [meetingInput] }),
      ]),
    ]);
    expect(file.meetings.map((m) => m.partOfTerm)).toEqual(["1", "2B"]);
  });

  it("drops repeated term + CRN rows but keeps the same CRN in another term", () => {
    const rows = [section({ crn: "1", term: "202730" }), section({ crn: "1", term: "202730" }), section({ crn: "1", term: "202710" })];
    expect(dedupeSections(rows)).toHaveLength(2);
  });
});

describe("transform edge cases", () => {
  it("warns about and skips roomed meetings with inverted times", () => {
    const { file, result } = run([
      term("202730", [section({ crn: "1" }), section({ crn: "2", meetings: [{ beginTime: "1200", endTime: "1100", room: "2" }] })]),
    ]);
    expect(file.meetings).toHaveLength(1);
    expect(result.warnings).toEqual([
      "Term 202730: 1 roomed meeting has unreadable or inverted times or dates; skipped.",
    ]);
  });

  it("treats an empty partOfTerm as the full term", () => {
    const { file } = run([term("202730", [section({ crn: "1", partOfTerm: null })])]);
    expect(file.meetings[0].partOfTerm).toBe("1");
  });

  it("skips a term with no sections", () => {
    expect(transformTerms([term("202715", [])], "2026-11-09")).toMatchObject({
      terms: [],
      skipped: [{ code: "202715", reason: "no sections" }],
    });
  });
});
