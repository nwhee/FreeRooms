import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// V1 check against REAL Banner output in public/data/schedule.json (gitignored, never committed).
// Every expectation is derived from that file at run time by an oracle written here from the
// FR-0 definitions, independent of lib/free-rooms. Skips when the file is absent.
// Run: NEXT_TELEMETRY_DISABLED=1 npm run build && npx next start -p 3100
//      PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/V1-real-data.spec.ts

const DATA_FILE = "public/data/schedule.json";
const SHOTS = "docs/qa/V1";
const PLACEHOLDERS = ["BOS-DEPT", "XCR-ROOM", "MSI-NA", "NY-FND-OS1", "NY-FND-OS2", "NY-FND-OS3", "NY-FND-OS4", "NY-FND-OS5"];

type Meeting = { roomId: string; days: number; start: number; end: number; startDate: string; endDate: string; partOfTerm: string; termCode: string };
type Room = { id: string; campus: string; building: string; room: string; displayName: string };
type Data = {
  generatedAt: string;
  terms: { code: string; description: string; startDate: string; endDate: string; meetingCount: number; roomedMeetingCount: number }[];
  campuses: { code: string; name: string; timezone: string; roomCount: number }[];
  rooms: Room[];
  meetings: Meeting[];
  calendar: {
    noClassDates: { start: string; end: string; label: string; campuses: string[] }[];
    examPeriods: { start: string; end: string; label: string; partsOfTerm: string[] }[];
  };
};

const hasData = existsSync(DATA_FILE);
const data: Data = hasData ? JSON.parse(readFileSync(DATA_FILE, "utf8")) : ({} as Data);
test.skip(!hasData, `${DATA_FILE} is not present (real data is never committed)`);
test.use({ timezoneId: "America/New_York", locale: "en-US" });

/** Tue 2026-11-10 10:00 in Boston: the data is ~6.5 h old, so not stale. */
const NOW = new Date("2026-11-10T15:00:00Z");
const in_ = (r: { start: string; end: string }, d: string) => r.start <= d && d <= r.end;
const fmt = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** FR-0 definitions, re-implemented: card text per displayName for a campus at (date, minute). */
function oracle(campus: string, date: string, minute: number): Map<string, string> {
  const [y, mo, d] = date.split("-").map(Number);
  const bit = 1 << ((new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7);
  const noClass = data.calendar.noClassDates.some((n) => in_(n, date) && n.campuses.includes(campus));
  const examParts = new Set(data.calendar.examPeriods.filter((p) => in_(p, date)).flatMap((p) => p.partsOfTerm));
  const counted = (m: Meeting) =>
    m.startDate <= date && date <= m.endDate && (m.days & bit) !== 0 &&
    (m.startDate === m.endDate || (!noClass && !examParts.has(m.partOfTerm)));
  const byRoom = new Map<string, Meeting[]>();
  for (const m of data.meetings) if (counted(m)) byRoom.set(m.roomId, [...(byRoom.get(m.roomId) ?? []), m]);
  const out = new Map<string, string>();
  for (const room of data.rooms.filter((r) => r.campus === campus)) {
    const ms = (byRoom.get(room.id) ?? []).sort((a, b) => a.start - b.start);
    if (ms.some((m) => m.start <= minute && minute < m.end)) {
      let end = Math.max(...ms.filter((m) => m.start <= minute && minute < m.end).map((m) => m.end));
      for (const m of ms) if (m.start > minute && m.start <= end) end = Math.max(end, m.end);
      out.set(room.displayName, `In use until ${fmt(end)}`);
    } else {
      const next = ms.find((m) => m.start > minute);
      out.set(room.displayName, next ? `Free until ${fmt(next.start)}` : "Free for the rest of the day");
    }
  }
  return out;
}

async function open(page: Page, width = 1280, time = NOW) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.install({ time });
  await page.goto("/");
  await expect(page.getByRole("tab").first()).toBeVisible({ timeout: 15_000 });
}

/** Card text keyed by room name, read from the page with the busy switch on. */
async function cards(page: Page): Promise<Map<string, string>> {
  const sw = page.getByRole("switch", { name: "Show rooms in use" });
  if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
  const texts = await page.locator("main li").allInnerTexts();
  return new Map(texts.map((t) => t.split("\n") as [string, string]));
}

const freeCount = async (page: Page) =>
  (await page.getByRole("heading", { level: 2 }).allInnerTexts()).reduce((n, h) => n + Number(/· (\d+) free/.exec(h)![1]), 0);

const noHScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

for (const [label, width] of [["desktop", 1280], ["phone", 375]] as const) {
  test(`1 Now mode loads real data, Boston first, statuses match the JSON (${label})`, async ({ page }) => {
    await open(page, width);
    await expect(page.getByRole("tab").first()).toHaveText("Boston");
    await expect(page.getByRole("tab", { name: "Boston" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Now" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Time (Boston time)")).toHaveValue("10:00");
    await expect(page.getByLabel("Date (Boston time)")).toHaveValue("2026-11-10");
    expect(await freeCount(page)).toBeGreaterThan(0);
    const expected = oracle("BOS", "2026-11-10", 600);
    const actual = await cards(page);
    expect(actual.size).toBe(expected.size);
    expect(Object.fromEntries(actual)).toEqual(Object.fromEntries(expected));
    await noHScroll(page);
  });
}

test("1 spot-check three Boston rooms against their meetings (Tue 11-10 10:00)", async ({ page }) => {
  await open(page);
  const expected = oracle("BOS", "2026-11-10", 600);
  const pick = (re: RegExp) => [...expected].find(([, s]) => re.test(s))!;
  const picks = [pick(/^Free for the rest/), pick(/^In use until/), pick(/^Free until (1[0-2]|[1-9]):\d\d PM/)];
  const search = page.getByRole("searchbox", { name: "Search rooms" });
  await page.getByRole("switch", { name: "Show rooms in use" }).click();
  for (const [name, status] of picks) {
    const room = data.rooms.find((r) => r.displayName === name)!;
    const meetings = data.meetings.filter((m) => m.roomId === room.id && (m.days & 2) && m.startDate <= "2026-11-10" && "2026-11-10" <= m.endDate);
    console.log(`SPOT ${name} -> "${status}"; Tue meetings: ${meetings.map((m) => `${fmt(m.start)}-${fmt(m.end)} (${m.termCode} pt ${m.partOfTerm})`).join(", ") || "none"}`);
    await search.fill(`${room.building} ${room.room}`);
    await expect(page.locator("li", { hasText: name }).first()).toContainText(status);
  }
});

test("2 time travel: Fall weekday 10:00 differs from 18:00 and both match the JSON", async ({ page }) => {
  await open(page);
  await page.getByLabel("Date (Boston time)").fill("2026-11-18");
  await page.getByLabel("Time (Boston time)").fill("10:00");
  await expect(page.getByRole("button", { name: "Now" })).toHaveAttribute("aria-pressed", "false");
  const at10 = await cards(page);
  expect(Object.fromEntries(at10)).toEqual(Object.fromEntries(oracle("BOS", "2026-11-18", 600)));
  await page.getByLabel("Time (Boston time)").fill("18:00");
  const at18 = await cards(page);
  expect(Object.fromEntries(at18)).toEqual(Object.fromEntries(oracle("BOS", "2026-11-18", 1080)));
  const changed = [...at10].filter(([n, s]) => at18.get(n) !== s).length;
  console.log(`Fall Wed 11-18: busy at 10:00 = ${[...at10.values()].filter((s) => s.startsWith("In use")).length}, busy at 18:00 = ${[...at18.values()].filter((s) => s.startsWith("In use")).length}, cards changed = ${changed}`);
  expect(changed).toBeGreaterThan(0);
});

for (const [label, width] of [["desktop", 1280], ["phone", 375]] as const) {
  test(`2 banners: Spring incomplete, fall break, exams (${label})`, async ({ page }) => {
    await open(page, width);
    const date = page.getByLabel("Date (Boston time)");
    const spring = data.terms.find((t) => t.code === "202730")!;
    const pct = Math.floor((spring.roomedMeetingCount / spring.meetingCount) * 100);
    console.log(`Spring roomed ${spring.roomedMeetingCount}/${spring.meetingCount} = ${pct}%`);
    await date.fill("2027-02-03");
    await expect(page.getByRole("status")).toContainText([
      `Room assignments for Spring 2027 Semester are incomplete (${pct}% assigned), so some rooms shown free may not be.`,
    ]);
    await date.fill("2026-11-26");
    await expect(page.getByRole("status")).toHaveText([
      "No classes at Boston on Thu, Nov 26 (Fall break). Rooms show as free, but buildings may be closed.",
    ]);
    await date.fill("2026-12-15");
    await expect(page.getByRole("status")).toHaveText([
      "Fall Law exam period: exams aren't in this data, so free rooms may be in use.",
      "Fall final exam period: exams aren't in this data, so free rooms may be in use.",
    ]);
    expect(Object.fromEntries(await cards(page))).toEqual(Object.fromEntries(oracle("BOS", "2026-12-15", 600)));
  });
}

test("3 every campus renders, labels name it, statuses match, no placeholder rooms", async ({ page }) => {
  await open(page, 375);
  await expect(page.getByRole("tab")).toHaveText(data.campuses.map((c) => c.name));
  for (const campus of data.campuses) {
    await page.getByRole("tab", { name: campus.name, exact: true }).click();
    await expect(page.getByText(`Time (${campus.name} time)`)).toBeVisible();
    const time = await page.getByLabel(`Time (${campus.name} time)`).inputValue();
    const [h, m] = time.split(":").map(Number);
    const date = await page.getByLabel(`Date (${campus.name} time)`).inputValue();
    const actual = await cards(page);
    expect(actual.size, campus.code).toBe(campus.roomCount);
    expect(Object.fromEntries(actual), campus.code).toEqual(Object.fromEntries(oracle(campus.code, date, h * 60 + m)));
    const text = await page.locator("main").innerText();
    for (const p of PLACEHOLDERS) expect(text, `${campus.code} shows ${p}`).not.toContain(p);
    console.log(`CAMPUS ${campus.code} ${campus.name}: ${date} ${time}, ${actual.size} rooms, ${await freeCount(page)} free`);
    await noHScroll(page);
    if (campus.code === "VAN") await page.screenshot({ path: `${SHOTS}/3-campus-${campus.code}-phone.png`, animations: "disabled" });
  }
  expect(data.rooms.some((r) => PLACEHOLDERS.some((p) => r.id.includes(p)))).toBe(false);
});

test("4 header, and the stale banner: none at 14 days, shown at 16 days (route mocks)", async ({ page }) => {
  await open(page);
  await expect(page.getByText("Covers: Fall 2026 Semester, Spring 2027 Semester")).toBeVisible();
  await expect(page.getByText(/^Updated /)).toHaveText(`Updated ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(data.generatedAt))}`);
  await expect(page.getByText(/last updated/)).toHaveCount(0);
  // FR-8: stale means more than 360 h (15 days). Serve in-memory copies with an older generatedAt.
  const serveAged = async (days: number) => {
    const copy = { ...data, generatedAt: new Date(NOW.getTime() - days * 24 * 3600 * 1000).toISOString() };
    await page.unrouteAll();
    await page.route("**/data/schedule.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(copy) }));
    await page.reload();
    await expect(page.getByRole("tab").first()).toBeVisible();
  };
  await serveAged(14);
  await expect(page.getByText(/last updated/)).toHaveCount(0);
  await serveAged(16);
  await expect(page.getByRole("status")).toContainText(["This data was last updated 16 days ago and may be out of date."]);
});

for (const [label, width] of [["desktop", 1280], ["phone", 375]] as const) {
  test(`5 search Snell and Ryder, no horizontal scroll (${label})`, async ({ page }) => {
    await open(page, width);
    const search = page.getByRole("searchbox", { name: "Search rooms" });
    await cards(page);
    for (const [q, buildings] of [["Snell", ["Snell Engineering Center", "Snell Library"]], ["Ryder", ["Ryder Hall"]]] as const) {
      await search.fill(q);
      const heads = await page.getByRole("heading", { level: 2 }).allInnerTexts();
      expect(heads.map((h) => h.replace(/ · \d+ free$/, ""))).toEqual(buildings);
      const names = (await page.locator("main li").allInnerTexts()).map((t) => t.split("\n")[0]);
      const want = data.rooms.filter((r) => r.campus === "BOS" && r.displayName.toLowerCase().includes(q.toLowerCase()));
      expect(names.length).toBe(want.length);
      await noHScroll(page);
    }
  });
}

test("6 console, load time and data size", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  // No fake clock here: it replaces the performance timeline. Real today is 2026-11-10.
  const t0 = Date.now();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({ timeout: 15_000 });
  const toResults = Date.now() - t0;
  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const res = performance.getEntriesByType("resource").find((e) => e.name.includes("schedule.json")) as PerformanceResourceTiming;
    return { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), dataFetchMs: Math.round(res.duration), transfer: res.transferSize, encoded: res.encodedBodySize, decoded: res.decodedBodySize };
  });
  // Switch on: render all 386 Boston cards and time it.
  const s = Date.now();
  await page.getByRole("switch").click();
  await expect(page.locator("main li")).toHaveCount(data.campuses[0].roomCount);
  console.log(`PERF ${JSON.stringify({ ...perf, wallToFirstResultsMs: toResults, switchOnRenderMs: Date.now() - s })}`);
  console.log(`CONSOLE ${JSON.stringify(problems)}`);
  expect(problems).toEqual([]);
  expect(toResults).toBeLessThan(5000);
});
