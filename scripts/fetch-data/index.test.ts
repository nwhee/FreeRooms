import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCalendarBlock, loadCalendarFiles } from "../../lib/calendar/load";
import { type ScheduleFile, validateSchedule } from "../../lib/data/schema";
import { type BannerSection, searchPageSchema, termsPageSchema, USER_AGENT } from "./banner-client";
import { main } from "./index";
import { type FetchedTerm, transformTerms } from "./transform";
import { buildScheduleFile, serializeSchedule } from "./write";
import { fakeBanner, type FakeBannerOptions } from "./__fixtures__/fake-banner";
import { roomedSections, section } from "./__fixtures__/sections";

const CALENDAR_DIR = fileURLToPath(new URL("../../data/calendar", import.meta.url));
const NOW = new Date("2026-11-09T08:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));
}
const FIXTURE_TERMS = termsPageSchema.parse(fixture("getTerms.json"));
const fixturePage = (term: string) => searchPageSchema.parse(fixture(`searchResults-${term}.json`));
const fixtureSections = (term: string): BannerSection[] => fixturePage(term).data ?? [];
/** The captured pages, with Banner's own totalCount (the 202730 page repeats one CRN). */
const FIXTURE_BANNER: FakeBannerOptions = {
  terms: FIXTURE_TERMS,
  sections: { "202710": fixtureSections("202710"), "202730": fixtureSections("202730") },
  totalCounts: { "202710": fixturePage("202710").totalCount, "202730": fixturePage("202730").totalCount },
};

const FALL = { code: "202710", description: "Fall 2026 Semester" };
const SPRING = { code: "202730", description: "Spring 2027 Semester" };
const viewOnly = (term: { code: string; description: string }) => ({ ...term, description: `${term.description} (View Only)` });

// FR-2 AC14: no unit test may reach the network. main() gets the fake Banner;
// a real fetch anywhere fails the test.
beforeEach(() => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("unit tests must not make network calls")));
});

const tempDirs: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "fr2-fetch-"));
  tempDirs.push(dir);
  return dir;
}

/** Writes `existing` to a fresh temp `--out` path and returns the path and the exact bytes. */
function existingOut(existing: ScheduleFile | string): { out: string; bytes: string } {
  const dir = tempDir();
  const out = join(dir, "schedule.json");
  const bytes = typeof existing === "string" ? existing : serializeSchedule(existing);
  writeFileSync(out, bytes);
  return { out, bytes };
}

/** A valid schedule built the same way the script builds one. */
function schedule(terms: FetchedTerm[], today: string, generatedAt = NOW.toISOString()): ScheduleFile {
  const entities = transformTerms(terms, today);
  const file = buildScheduleFile({
    entities,
    calendar: buildCalendarBlock(loadCalendarFiles(CALENDAR_DIR)),
    warnings: entities.warnings,
    generatedAt,
  });
  const result = validateSchedule(file);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return file;
}

async function runMain(args: string[], banner: FakeBannerOptions, options: { now?: Date; calendarDir?: string } = {}) {
  const fake = fakeBanner(banner);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const sleeps: number[] = [];
  const code = await main(args, {
    fetch: fake.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now: () => options.now ?? NOW,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    calendarDir: options.calendarDir ?? CALENDAR_DIR,
  });
  return { code, stdout, stderr, sleeps, fake, errorText: stderr.join("\n") };
}

function readOut(out: string): ScheduleFile {
  return JSON.parse(readFileSync(out, "utf8")) as ScheduleFile;
}

/** An existing file whose only term ended in May 2026, so no comparison guard applies in Nov 2026. */
const OLD_SCHEDULE = schedule(
  [{ code: "202630", description: "Spring 2026 Semester", sections: roomedSections("202630", 5, { startDate: "01/07/2026", endDate: "04/28/2026" }) }],
  "2026-02-01",
  "2026-05-01T00:00:00.000Z",
);

describe("main() happy path", () => {
  it("writes a valid file from the fixture pages and exits 0", async () => {
    const out = join(tempDir(), "nested", "schedule.json");
    const { code, stdout } = await runMain(["--out", out], FIXTURE_BANNER);
    expect(code).toBe(0);
    expect(validateSchedule(readOut(out)).ok).toBe(true);
    expect(stdout).toContain(`Wrote ${out} (${readFileSync(out).length} bytes).`);
  });
});

describe("politeness through main() (FR-2 AC4)", () => {
  it("sends the exact User-Agent, no @, and sleeps the configured delay between all requests", async () => {
    const out = join(tempDir(), "schedule.json");
    const { code, fake, sleeps } = await runMain(["--out", out, "--delay-ms", "2500"], FIXTURE_BANNER);
    expect(code).toBe(0);
    // getTerms + 2 terms x (reset, term/search, 1 page).
    expect(fake.requests).toHaveLength(7);
    expect(sleeps).toEqual(Array(6).fill(2500));
    for (const request of fake.requests) {
      expect(request.headers.get("user-agent")).toBe(USER_AGENT);
      expect(request.url).not.toContain("@");
      for (const [, value] of request.headers) expect(value).not.toContain("@");
    }
  });

  it("defaults to a 3 s delay and rejects --delay-ms below 1000", async () => {
    const out = join(tempDir(), "schedule.json");
    expect((await runMain(["--out", out], FIXTURE_BANNER)).sleeps.every((ms) => ms === 3_000)).toBe(true);
    const tooFast = await runMain(["--out", out, "--delay-ms", "999"], FIXTURE_BANNER);
    expect(tooFast.code).toBe(1);
    expect(tooFast.errorText).toMatch(/--delay-ms must be an integer of at least 1000/);
  });

  it("fails the run on four consecutive 503s", async () => {
    const { out, bytes } = existingOut(OLD_SCHEDULE);
    const result = await runMain(["--out", out], {
      ...FIXTURE_BANNER,
      intercept: (request) => (request.url.includes("searchResults") ? new Response("", { status: 503 }) : undefined),
    });
    expect(result.code).toBe(1);
    expect(result.sleeps.slice(-3)).toEqual([5_000, 15_000, 45_000]);
    expect(result.errorText).toMatch(/HTTP 503, still failing after 3 retries/);
    expect(readFileSync(out, "utf8")).toBe(bytes);
  });
});

describe("fail loudly (FR-2 AC5)", () => {
  async function expectFailure(args: string[], banner: FakeBannerOptions, message: RegExp, existing: ScheduleFile = OLD_SCHEDULE) {
    const { out, bytes } = existingOut(existing);
    const result = await runMain(["--out", out, ...args], banner);
    expect(result.errorText).toMatch(message);
    expect(result.code).toBe(1);
    expect(readFileSync(out, "utf8")).toBe(bytes);
    return result;
  }

  it("exits 1 when there are zero terms to fetch", async () => {
    await expectFailure([], { terms: FIXTURE_TERMS.map(viewOnly) }, /no terms to fetch/);
  });

  it("exits 1 when zero terms are left after the date window", async () => {
    await expectFailure(["--today", "2027-06-01"], FIXTURE_BANNER, /No terms left after the date window for 2027-06-01/);
  });

  it("exits 1 when a request fails after its retries", async () => {
    await expectFailure([], { ...FIXTURE_BANNER, intercept: () => new TypeError("fetch failed") }, /network error/);
  });

  it("exits 1 on a non-JSON response", async () => {
    await expectFailure(
      [],
      {
        ...FIXTURE_BANNER,
        intercept: (request) => (request.url.includes("term/search") ? new Response("<html>Maintenance</html>") : undefined),
      },
      /not JSON/,
    );
  });

  it("exits 1 on success:false", async () => {
    await expectFailure(
      [],
      {
        ...FIXTURE_BANNER,
        intercept: (request) =>
          request.url.includes("searchResults") ? new Response(JSON.stringify({ success: false, data: null })) : undefined,
      },
      /success:false/,
    );
  });

  it("exits 1 when unique sections fetched < totalCount", async () => {
    const result = await expectFailure(
      [],
      { ...FIXTURE_BANNER, totalCounts: { "202730": 40 } },
      /Term 202730: fetched 16 unique sections but Banner reported 40/,
    );
    expect(result.fake.log.filter((entry) => entry.startsWith("page:202730"))).toEqual(["page:202730@0", "page:202730@17"]);
  });

  it("exits 1 when validateSchedule fails", async () => {
    // Building "A-B" room "C" and building "A" room "B-C" share the id "A-B-C".
    const sections = [
      section({ crn: "1", meetings: [{ building: "A-B", room: "C" }] }),
      section({ crn: "2", meetings: [{ building: "A", room: "B-C" }] }),
    ];
    await expectFailure([], { terms: [SPRING], sections: { "202730": sections } }, /fails validateSchedule:\n {2}rooms\[1\]\.id: duplicate "A-B-C"/);
  });

  it("exits 1 when the output has 0 rooms or 0 meetings", async () => {
    const unroomed = [section({ crn: "1", meetings: [{ building: null, room: null }] })];
    await expectFailure([], { terms: [SPRING], sections: { "202730": unroomed } }, /has 0 rooms and 0 meetings/);
  });

  it("exits 1 on the vanished-term guard", async () => {
    const existing = schedule(
      [{ ...FALL, sections: roomedSections("202710", 10, { building: "FA" }) }, { ...SPRING, sections: roomedSections("202730", 10, { building: "SP" }) }],
      "2026-11-01",
    );
    await expectFailure(
      ["--today", "2026-11-20"],
      { terms: [SPRING, FALL], sections: { "202730": roomedSections("202730", 10, { building: "SP" }) } },
      /Term 202710 Fall 2026 Semester returned 0 sections, but the existing file has it running until 2026-12-20/,
      existing,
    );
  });

  it("exits 1 on the per-term room-drop guard", async () => {
    const existing = schedule([{ ...SPRING, sections: roomedSections("202730", 10) }], "2026-11-01");
    await expectFailure(
      [],
      { terms: [SPRING], sections: { "202730": roomedSections("202730", 4) } },
      /Term 202730 Spring 2027 Semester has meetings in 4 rooms, down from 10/,
      existing,
    );
  });

  it("leaves no --out file behind when there was none", async () => {
    const out = join(tempDir(), "schedule.json");
    const result = await runMain(["--out", out], { terms: FIXTURE_TERMS.map(viewOnly) });
    expect(result.code).toBe(1);
    expect(existsSync(out)).toBe(false);
  });
});

describe("semester transition (FR-2 AC5b)", () => {
  const transitionExisting = () =>
    schedule(
      [
        { ...FALL, sections: roomedSections("202710", 600, { building: "FA" }) },
        { ...SPRING, sections: roomedSections("202730", 150, { building: "SP" }) },
      ],
      "2026-11-01",
    );
  const springBanner = (rooms: number): FakeBannerOptions => ({
    terms: [SPRING, viewOnly(FALL)],
    sections: { "202730": roomedSections("202730", rooms, { building: "SP" }) },
  });

  it("writes on 2026-12-21 when 202710 left the window and 202730 grew, though total rooms fell 79%", async () => {
    const existing = transitionExisting();
    expect(existing.rooms).toHaveLength(750);
    const { out } = existingOut(existing);
    const result = await runMain(["--out", out, "--today", "2026-12-21"], springBanner(160));
    expect(result.errorText).toBe("");
    expect(result.code).toBe(0);
    const written = readOut(out);
    expect(written.terms.map((t) => t.code)).toEqual(["202730"]);
    expect(written.rooms).toHaveLength(160);
  });

  it("exits 1 when 202730 drops to 70 rooms (< 50% of 150), and 0 with --force", async () => {
    const existing = transitionExisting();
    const { out, bytes } = existingOut(existing);
    const blocked = await runMain(["--out", out, "--today", "2026-12-21"], springBanner(70));
    expect(blocked.code).toBe(1);
    expect(blocked.errorText).toMatch(/has meetings in 70 rooms, down from 150/);
    expect(readFileSync(out, "utf8")).toBe(bytes);

    const forced = await runMain(["--out", out, "--today", "2026-12-21", "--force"], springBanner(70));
    expect(forced.code).toBe(0);
    expect(readOut(out).warnings).toContainEqual(expect.stringMatching(/^--force overrode: Term 202730 .* 70 rooms, down from 150/));
  });

  describe("vanished term on 2026-11-20", () => {
    const existing = () =>
      schedule(
        [
          { ...FALL, sections: roomedSections("202710", 20, { building: "FA" }) },
          { ...SPRING, sections: roomedSections("202730", 20, { building: "SP" }) },
        ],
        "2026-11-01",
      );
    const spring = roomedSections("202730", 20, { building: "SP" });
    const cases: [string, FakeBannerOptions, RegExp][] = [
      [
        "Banner returns totalCount 0 for 202710",
        { terms: [SPRING, FALL], sections: { "202730": spring }, totalCounts: { "202710": 0 } },
        /Term 202710 Fall 2026 Semester returned 0 sections/,
      ],
      [
        "202710 is absent from getTerms",
        // Like live Banner for a term it doesn't know: term/search succeeds, totalCount is 0.
        { terms: [SPRING], sections: { "202730": spring } },
        /Term 202710 Fall 2026 Semester (returned 0 sections|is missing from the new output)/,
      ],
    ];

    it.each(cases)("%s: exits 1 and leaves the file byte-identical; --force exits 0", async (_name, banner, message) => {
      const { out, bytes } = existingOut(existing());
      const blocked = await runMain(["--out", out, "--today", "2026-11-20"], banner);
      expect(blocked.errorText).toMatch(message);
      expect(blocked.code).toBe(1);
      expect(readFileSync(out, "utf8")).toBe(bytes);

      const forced = await runMain(["--out", out, "--today", "2026-11-20", "--force"], banner);
      expect(forced.code).toBe(0);
      expect(readOut(out).terms.map((t) => t.code)).toEqual(["202730"]);
    });

    it("absent from getTerms: the term is still asked for, as the existing file has it in the window", async () => {
      const { out } = existingOut(existing());
      const result = await runMain(["--out", out, "--today", "2026-11-20"], cases[1][1]);
      // The guard only works if the script still asks Banner for it.
      expect(result.fake.log).toContain("term:202710");
    });

    it("is not vanished on 2026-12-21, when 202710 (endDate 2026-12-20) has ended", async () => {
      const { out } = existingOut(existing());
      const result = await runMain(["--out", out, "--today", "2026-12-21"], { terms: [SPRING], sections: { "202730": spring } });
      expect(result.errorText).toBe("");
      expect(result.code).toBe(0);
      expect(result.fake.log).not.toContain("term:202710");
    });
  });
});

describe("write rule (FR-2 AC8)", () => {
  async function firstRun() {
    const out = join(tempDir(), "schedule.json");
    expect((await runMain(["--out", out], FIXTURE_BANNER)).code).toBe(0);
    return { out, bytes: readFileSync(out, "utf8") };
  }

  it("does not rewrite the same content with a fresh generatedAt", async () => {
    const { out, bytes } = await firstRun();
    const result = await runMain(["--out", out], FIXTURE_BANNER, { now: new Date(NOW.getTime() + 47 * HOUR) });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("No change; not writing.");
    expect(readFileSync(out, "utf8")).toBe(bytes);
  });

  it("rewrites the same content when generatedAt is 49 h old", async () => {
    const { out } = await firstRun();
    const later = new Date(NOW.getTime() + 49 * HOUR);
    const result = await runMain(["--out", out], FIXTURE_BANNER, { now: later });
    expect(result.stdout).not.toContain("No change; not writing.");
    expect(readOut(out).generatedAt).toBe(later.toISOString());
  });

  it("rewrites changed content", async () => {
    const { out } = await firstRun();
    const changed: FakeBannerOptions = {
      ...FIXTURE_BANNER,
      sections: { ...FIXTURE_BANNER.sections, "202730": [...fixtureSections("202730"), section({ crn: "39999", meetings: [{ building: "NEW", room: "1" }] })] },
    };
    const later = new Date(NOW.getTime() + HOUR);
    const result = await runMain(["--out", out], changed, { now: later });
    expect(result.stdout).not.toContain("No change; not writing.");
    const written = readOut(out);
    expect(written.generatedAt).toBe(later.toISOString());
    expect(written.rooms.map((r) => r.id)).toContain("NEW-1");
  });

  it("writes minified JSON with arrays sorted as FR-0 specifies, whatever order Banner uses", async () => {
    const out = join(tempDir(), "schedule.json");
    const reversed: FakeBannerOptions = {
      terms: [...FIXTURE_TERMS].reverse(),
      sections: { "202710": fixtureSections("202710").reverse(), "202730": fixtureSections("202730").reverse() },
      totalCounts: FIXTURE_BANNER.totalCounts,
    };
    expect((await runMain(["--out", out], reversed)).code).toBe(0);
    const text = readFileSync(out, "utf8");
    expect(text).not.toMatch(/\n/);
    const file = JSON.parse(text) as ScheduleFile;

    const sortedBy = <T>(items: T[], key: (item: T) => string) =>
      expect(items.map(key)).toEqual([...items.map(key)].sort());
    sortedBy(file.terms, (t) => t.code);
    file.terms.forEach((t) => sortedBy(t.partsOfTerm, (p) => p.code));
    sortedBy(file.buildings, (b) => b.code);
    sortedBy(file.rooms, (r) => r.id);
    expect(file.campuses[0].code).toBe("BOS");
    sortedBy(file.campuses.slice(1), (c) => c.name);
    const meetingKey = (m: ScheduleFile["meetings"][number]) =>
      [m.roomId, m.startDate, String(m.start).padStart(4, "0"), String(m.end).padStart(4, "0"), m.termCode].join("|");
    sortedBy(file.meetings, meetingKey);

    // The same data in Banner's normal order gives byte-identical output.
    const normal = join(tempDir(), "schedule.json");
    await runMain(["--out", normal], FIXTURE_BANNER);
    expect(readFileSync(normal, "utf8")).toBe(text);
  });
});

describe("dry run (FR-2 AC9)", () => {
  it("prints the summary, exits 0 and leaves an absent file absent", async () => {
    const out = join(tempDir(), "schedule.json");
    const result = await runMain(["--out", out, "--dry-run"], FIXTURE_BANNER);
    expect(result.code).toBe(0);
    expect(result.stdout.some((line) => line.startsWith("Terms: 202710 Fall 2026 Semester"))).toBe(true);
    expect(result.stdout).toContain("Dry run; not writing.");
    expect(existsSync(out)).toBe(false);
  });

  it("leaves an existing file byte-identical", async () => {
    const { out, bytes } = existingOut(OLD_SCHEDULE);
    const result = await runMain(["--out", out, "--dry-run"], FIXTURE_BANNER);
    expect(result.code).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(bytes);
  });

  it("still exits 1 when a guard fails", async () => {
    const existing = schedule([{ ...SPRING, sections: roomedSections("202730", 10) }], "2026-11-01");
    const { out, bytes } = existingOut(existing);
    const result = await runMain(["--out", out, "--dry-run"], { terms: [SPRING], sections: { "202730": roomedSections("202730", 2) } });
    expect(result.code).toBe(1);
    expect(readFileSync(out, "utf8")).toBe(bytes);
  });
});

describe("warnings (FR-2 AC10)", () => {
  it("prints each warning as ::warning::<text> and stores it in warnings[], without failing", async () => {
    const out = join(tempDir(), "schedule.json");
    const result = await runMain(["--out", out], FIXTURE_BANNER);
    expect(result.code).toBe(0);
    const { warnings } = readOut(out);
    expect(warnings).toContain('Unknown campus "Mars Colony" on 1 meeting; skipped.');
    expect(result.stdout.filter((line) => line.startsWith("::warning::"))).toEqual(warnings.map((w) => `::warning::${w}`));
  });

  it("adds FR-6's exact text for a missing calendar file", async () => {
    const out = join(tempDir(), "schedule.json");
    const result = await runMain(["--out", out], FIXTURE_BANNER, { calendarDir: tempDir() });
    expect(result.code).toBe(0);
    const expected =
      "Term 202710 has no academic calendar file (expected data/calendar/2026-2027.json); no-class days and exam periods will be missing.";
    expect(readOut(out).warnings).toContain(expected);
    expect(result.stdout).toContain(`::warning::${expected}`);
  });

  it("warns, without failing, about a new term with no sections", async () => {
    const out = join(tempDir(), "schedule.json");
    const result = await runMain(["--out", out], {
      ...FIXTURE_BANNER,
      terms: [...FIXTURE_TERMS, { code: "202750", description: "Summer 2027 Semester" }],
    });
    expect(result.code).toBe(0);
    expect(readOut(out).warnings).toContain("Term 202750 Summer 2027 Semester returned no sections.");
  });

  it("warns about an existing file that isn't a valid schedule, and replaces it", async () => {
    const { out } = existingOut("{not json");
    const result = await runMain(["--out", out], FIXTURE_BANNER);
    expect(result.code).toBe(0);
    expect(readOut(out).warnings).toContain(
      `Existing ${out} is not a valid schedule (it is not JSON); comparison guards skipped.`,
    );
  });
});

describe("summary line (FR-2 AC11)", () => {
  it("prints one line in the spec's format", async () => {
    const out = join(tempDir(), "schedule.json");
    const { stdout } = await runMain(["--out", out], FIXTURE_BANNER);
    const lines = stdout.filter((line) => line.startsWith("Terms: "));
    expect(lines).toEqual([
      "Terms: 202710 Fall 2026 Semester (2026-09-02..2026-12-20, 100% roomed), 202730 Spring 2027 Semester (2027-01-13..2027-05-02, 92% roomed) | campuses 2 | buildings 9 | rooms 10 | meetings 14",
    ]);
    expect(lines[0]).toMatch(
      /^Terms: (\d{6} [^(]+ \(\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}, \d+% roomed\)(, )?)+ \| campuses \d+ \| buildings \d+ \| rooms \d+ \| meetings \d+$/,
    );
  });
});

describe("CLI arguments", () => {
  it("rejects a malformed --today and unknown flags", async () => {
    const out = join(tempDir(), "schedule.json");
    expect((await runMain(["--out", out, "--today", "11/09/2026"], FIXTURE_BANNER)).errorText).toMatch(/Invalid --today: 11\/09\/2026/);
    expect((await runMain(["--out", out, "--nope"], FIXTURE_BANNER)).code).toBe(1);
  });
});

describe("no network in unit tests (FR-2 AC14)", () => {
  it("would hit the stubbed global fetch, and fail, if no fake Banner were injected", async () => {
    const stderr: string[] = [];
    const code = await main(["--out", join(tempDir(), "schedule.json"), "--dry-run"], {
      sleep: async () => {},
      stdout: () => {},
      stderr: (line) => stderr.push(line),
    });
    expect(code).toBe(1);
    expect(stderr.join("\n")).toMatch(/unit tests must not make network calls/);
  });
});
