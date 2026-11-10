import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "./index";
import { isPlaceholderRoom, loadPlaceholderPatterns, PlaceholderListError } from "./placeholders";
import { transformTerms } from "./transform";
import { fakeBanner } from "./__fixtures__/fake-banner";
import { section } from "./__fixtures__/sections";

const PLACEHOLDER_FILE = fileURLToPath(new URL("./placeholder-rooms.json", import.meta.url));
const PATTERNS = loadPlaceholderPatterns(PLACEHOLDER_FILE);

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "fr2b-placeholders-"));
  tempDirs.push(dir);
  return dir;
}

/** One roomed Boston section per [building, room] pair. */
function rooms(pairs: [string, string][], campus = "Boston") {
  return pairs.map(([building, room], i) =>
    section({ crn: `${building}${room}${i}`, campus, meetings: [{ building, room }] }),
  );
}

function run(sections: ReturnType<typeof section>[]) {
  return transformTerms([{ code: "202730", description: "Spring 2027 Semester", sections }], "2026-11-10", PATTERNS);
}

describe("placeholder deny-list (FR-2b AC1)", () => {
  const result = run(
    rooms([
      ["MSI", "NA"],
      ["NY-FND", "OS1"],
      ["NY-FND", "OS2"],
      ["NY-FND", "OS3"],
      ["NY-FND", "OS4"],
      ["NY-FND", "OS5"],
      ["XCR", "ROOM"],
      ["SL", "tba"],
      ["BOS", "DEPT"],
      ["BOS", "DEPT"],
      ["SL", "117"],
    ]),
  );

  it("keeps only SL-117", () => {
    expect(result.rooms.map((room) => room.id)).toEqual(["SL-117"]);
    expect(result.buildings.map((building) => building.code)).toEqual(["SL"]);
    expect(result.meetings.map((meeting) => meeting.roomId)).toEqual(["SL-117"]);
  });

  it("emits exactly one summary warning listing the 9 ids and 10 meetings", () => {
    expect(result.warnings.filter((w) => w.startsWith("Excluded "))).toEqual([
      "Excluded 9 placeholder rooms (10 meetings): BOS-DEPT, MSI-NA, NY-FND-OS1, NY-FND-OS2, NY-FND-OS3, NY-FND-OS4, NY-FND-OS5, SL-tba, XCR-ROOM",
    ]);
  });

  it("the checked-in file holds the spec's patterns", () => {
    expect(PATTERNS.map((pattern) => pattern.source)).toEqual([
      "^DEPT$",
      "^NA$",
      "^N\\/A$",
      "^ROOM$",
      "^TBA$",
      "^TBD$",
      "^OS\\d+$",
    ]);
    expect(PATTERNS.every((pattern) => pattern.flags === "i")).toBe(true);
  });
});

describe("placeholder warning truncation (FR-2b AC1b)", () => {
  it("lists the first 20 of 25 ids, then …and 5 more", () => {
    const pairs = Array.from({ length: 25 }, (_, i): [string, string] => [`B${String(i).padStart(2, "0")}`, "TBA"]);
    const ids = pairs.map(([building, room]) => `${building}-${room}`);
    const result = run(rooms(pairs));
    expect(result.warnings).toEqual([
      `Excluded 25 placeholder rooms (25 meetings): ${ids.slice(0, 20).join(", ")}, …and 5 more`,
    ]);
    expect(result.rooms).toEqual([]);
  });
});

describe("no over-match (FR-2b AC2)", () => {
  it.each(["AUD", "BLBX", "DS", "GHE", "GHW", "THTR", "NA1", "ROOM 5", "OS", "105A", "DEPT2"])("keeps %j", (room) => {
    expect(isPlaceholderRoom(PATTERNS, room)).toBe(false);
    expect(run(rooms([["XB", room]])).rooms.map((r) => r.room)).toEqual([room]);
  });

  it.each(["os12", " NA "])("excludes %j", (room) => {
    expect(isPlaceholderRoom(PATTERNS, room)).toBe(true);
    expect(run(rooms([["XB", room]])).rooms).toEqual([]);
  });
});

describe("placeholder counts and campus (FR-2b AC3)", () => {
  it("counts a placeholder as a candidate but not roomed: 4 candidates, 1 roomed", () => {
    const sections = [
      section({ crn: "1", meetings: [{ building: "SL", room: "117" }] }),
      section({ crn: "2", meetings: [{ building: "BOS", room: "DEPT" }] }),
      section({ crn: "3", meetings: [{ building: "XCR", room: "ROOM" }] }),
      section({ crn: "4", meetings: [{ building: null, room: null }] }),
    ];
    expect(run(sections).terms[0]).toMatchObject({ meetingCount: 4, roomedMeetingCount: 1 });
  });

  it("gives no multi-campus warning when the only other-campus sections are placeholders", () => {
    const sections = [
      ...rooms([["XCR", "101"], ["XCR", "102"]]),
      ...rooms([["XCR", "ROOM"]], "Portland, Maine"),
    ];
    const result = run(sections);
    expect(result.buildings).toEqual([{ code: "XCR", name: "XCR Hall", campus: "BOS", roomCount: 2 }]);
    expect(result.warnings.filter((w) => w.startsWith("Building "))).toEqual([]);
    expect(result.warnings).toEqual(["Excluded 1 placeholder rooms (1 meetings): XCR-ROOM"]);
  });
});

describe("deny-list validation (FR-2b AC4)", () => {
  function denyList(contents: unknown): string {
    const path = join(tempDir(), "placeholder-rooms.json");
    writeFileSync(path, JSON.stringify(contents));
    return path;
  }

  it.each([
    ["an invalid regex", { roomPatterns: ["^(OS$"] }, /roomPatterns\.0: "\^\(OS\$" is not a valid regex/],
    ["an empty roomPatterns", { roomPatterns: [] }, /roomPatterns: must not be empty/],
    ["an extra key", { roomPatterns: ["^NA$"], buildingCodes: ["XCR"] }, /buildingCodes/],
  ])("%s makes main() exit 1 with a message naming the problem", async (_name, contents, message) => {
    const path = denyList(contents);
    expect(() => loadPlaceholderPatterns(path)).toThrow(PlaceholderListError);

    const banner = fakeBanner({ terms: [{ code: "202730", description: "Spring 2027 Semester" }] });
    const stderr: string[] = [];
    const code = await main(["--out", join(tempDir(), "schedule.json")], {
      fetch: banner.fetch,
      sleep: async () => {},
      stdout: () => {},
      stderr: (line) => stderr.push(line),
      placeholderFile: path,
    });
    expect(code).toBe(1);
    expect(stderr.join("\n")).toMatch(message);
    expect(stderr.join("\n")).toContain(path);
    expect(banner.requests).toHaveLength(0);
  });
});
