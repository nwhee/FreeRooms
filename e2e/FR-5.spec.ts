import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// FR-5 free-rooms UI, checked in a real browser against a local production build.
// Setup: cp components/free-rooms/__fixtures__/schedule.json public/data/schedule.json
//        NEXT_TELEMETRY_DISABLED=1 npm run build && npx next start -p 3100
// Run:   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/FR-5.spec.ts --workers=1
// The "on-disk data" group edits public/data/schedule.json and restores it, so run with one worker.

const SHOTS = "docs/qa/FR-5";
const DATA_FILE = "public/data/schedule.json";
const FIXTURE = "components/free-rooms/__fixtures__/schedule.json";
/** 10:00 in Boston and Toronto, 15:00 in London, a Wednesday. generatedAt is 07:00Z that day. */
const WED_1500Z = new Date("2026-11-18T15:00:00Z");
const GENERATED_AT = Date.parse("2026-11-18T07:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const WIDTHS = [
  ["desktop", 1280],
  ["phone", 375],
] as const;

test.use({ timezoneId: "America/New_York", locale: "en-US" });

async function open(page: Page, time: Date = WED_1500Z, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.install({ time });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FreeRooms", level: 1 })).toBeVisible();
}

const timeInput = (page: Page, campus = "Boston") => page.getByLabel(`Time (${campus} time)`);
const dateInput = (page: Page, campus = "Boston") => page.getByLabel(`Date (${campus} time)`);
const nowButton = (page: Page) => page.getByRole("button", { name: "Now" });
const banners = (page: Page) => page.getByRole("status");
/** role="alert" elements other than Next's own (empty) route announcer. */
const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const cardTexts = (page: Page) => page.locator("main li").allInnerTexts();

async function noHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

/** Serves a modified copy of the fixture instead of the file on disk. */
async function serveData(page: Page, edit: (data: Record<string, unknown>) => void) {
  const data = JSON.parse(readFileSync(FIXTURE, "utf8"));
  edit(data);
  await page.route("**/data/schedule.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) }),
  );
}

test.describe("FR-5 against the fixture", () => {
  test("AC1 skeletons render while the schedule is loading", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/data/schedule.json", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("/");
    const loading = page.getByRole("status", { name: "Loading room data" });
    await expect(loading).toBeVisible();
    expect(await loading.locator("[data-slot=skeleton]").count()).toBeGreaterThan(3);
    await page.screenshot({ path: `${SHOTS}/AC1-loading-skeletons-phone.png`, fullPage: true, animations: "disabled" });
    release();
    await expect(loading).toBeHidden();
    await expect(page.getByRole("heading", { name: "FreeRooms" })).toBeVisible();
  });

  test("AC1 schemaVersion 2 shows the error state with role alert", async ({ page }) => {
    await serveData(page, (data) => (data.schemaVersion = 2));
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const alert = alerts(page);
    await expect(alert).toContainText("Couldn't load room data. Try again later.");
    await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/AC1-error-schema-version-phone.png`, fullPage: true, animations: "disabled" });
  });

  test("AC2 the build with NEXT_PUBLIC_DATA_URL unset fetches /data/schedule.json once", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("schedule.json")) requests.push(new URL(request.url()).pathname);
    });
    await open(page);
    expect(requests).toEqual(["/data/schedule.json"]);
  });

  for (const [label, width] of WIDTHS) {
    test(`AC3 tabs in fixture order, Boston selected, London shows only LDN rooms (${label})`, async ({ page }) => {
      await open(page, WED_1500Z, width);
      const tabs = page.getByRole("tab");
      await expect(tabs).toHaveText(["Boston", "London", "Toronto"]);
      await expect(page.getByRole("tab", { name: "Boston" })).toHaveAttribute("aria-selected", "true");
      await page.screenshot({ path: `${SHOTS}/AC3-boston-default-${label}.png`, fullPage: true, animations: "disabled" });
      await page.getByRole("tab", { name: "London" }).click();
      await page.getByRole("switch").click();
      const texts = await cardTexts(page);
      expect(texts.length).toBe(2);
      for (const text of texts) expect(text).toMatch(/^Devon House/);
      await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Devon House · 1 free"]);
      await page.screenshot({ path: `${SHOTS}/AC3-london-only-ldn-${label}.png`, fullPage: true, animations: "disabled" });
    });
  }

  for (const [label, width] of WIDTHS) {
    test(`AC4 at 15:00Z Boston reads 10:00 and London reads 15:00 with matching statuses (${label})`, async ({ page }) => {
      await open(page, WED_1500Z, width);
      await expect(dateInput(page)).toHaveValue("2026-11-18");
      await expect(timeInput(page)).toHaveValue("10:00");
      await expect(page.getByText("Time (Boston time)")).toBeVisible();
      await expect(page.getByRole("heading", { level: 2 })).toHaveText([
        "Richards Hall · 1 free",
        "Snell Library · 3 free",
      ]);
      await page.getByRole("switch").click();
      // roomStatusesAt for BOS 2026-11-18 600: DK-240 busy to 700, SL-117 busy to 665, the rest free.
      expect(await cardTexts(page)).toEqual([
        "Dockser Hall 240\nIn use until 11:40 AM",
        "Richards Hall 300\nFree for the rest of the day",
        "Snell Library 033\nFree until 1:35 PM",
        "Snell Library 101\nFree for the rest of the day",
        "Snell Library 117\nIn use until 11:05 AM",
        "Snell Library 1001\nFree until 2:00 PM",
      ]);
      await page.screenshot({ path: `${SHOTS}/AC4-boston-10am-${label}.png`, fullPage: true, animations: "disabled" });
      await page.getByRole("tab", { name: "London" }).click();
      await expect(dateInput(page, "London")).toHaveValue("2026-11-18");
      await expect(timeInput(page, "London")).toHaveValue("15:00");
      await expect(page.getByText("Time (London time)")).toBeVisible();
      expect(await cardTexts(page)).toEqual([
        "Devon House 1.01\nIn use until 4:00 PM",
        "Devon House 1.02\nFree for the rest of the day",
      ]);
      await page.screenshot({ path: `${SHOTS}/AC4-london-3pm-${label}.png`, fullPage: true, animations: "disabled" });
    });
  }

  test("AC5 editing the time leaves Now mode, Now returns to it, Now mode ticks every 60 s", async ({ page }) => {
    await open(page);
    await expect(nowButton(page)).toHaveAttribute("aria-pressed", "true");
    await timeInput(page).fill("14:00");
    await expect(nowButton(page)).toHaveAttribute("aria-pressed", "false");
    // At 14:00 SL-1001 (840-940) is busy, SL-033 (815-915) is busy, SL-117 is free again.
    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Dockser Hall · 1 free",
      "Richards Hall · 1 free",
      "Snell Library · 2 free",
    ]);
    await page.screenshot({ path: `${SHOTS}/AC5-time-travel-2pm-desktop.png`, fullPage: true, animations: "disabled" });
    await page.clock.runFor(61_000);
    await expect(timeInput(page)).toHaveValue("14:00");
    await nowButton(page).click();
    await expect(nowButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(timeInput(page)).toHaveValue("10:01");
    await page.clock.runFor(60_000);
    await expect(timeInput(page)).toHaveValue("10:02");
    await page.screenshot({ path: `${SHOTS}/AC5-back-to-now-desktop.png`, fullPage: true, animations: "disabled" });
  });

  test("AC6 switching campus in time-travel mode keeps the date and time", async ({ page }) => {
    await open(page);
    await dateInput(page).fill("2026-12-02");
    await timeInput(page).fill("13:30");
    await page.getByRole("tab", { name: "London" }).click();
    await expect(dateInput(page, "London")).toHaveValue("2026-12-02");
    await expect(timeInput(page, "London")).toHaveValue("13:30");
    await page.getByRole("tab", { name: "Toronto" }).click();
    await expect(dateInput(page, "Toronto")).toHaveValue("2026-12-02");
    await expect(timeInput(page, "Toronto")).toHaveValue("13:30");
    await expect(nowButton(page)).toHaveAttribute("aria-pressed", "false");
    await page.screenshot({ path: `${SHOTS}/AC6-time-travel-kept-on-toronto-desktop.png`, fullPage: true, animations: "disabled" });
  });

  for (const [label, width] of WIDTHS) {
    test(`AC7 free-until and rest-of-day text (${label})`, async ({ page }) => {
      await open(page, WED_1500Z, width);
      await timeInput(page).fill("12:00");
      await expect(page.locator("li", { hasText: "Snell Library 033" })).toContainText("Free until 1:35 PM");
      await expect(page.locator("li", { hasText: "Snell Library 101" })).toContainText("Free for the rest of the day");
      await page.screenshot({ path: `${SHOTS}/AC7-free-until-${label}.png`, fullPage: true, animations: "disabled" });
    });
  }

  for (const [label, width] of WIDTHS) {
    test(`AC8 the switch shows busy rooms, header counts free only (${label})`, async ({ page }) => {
      await open(page, WED_1500Z, width);
      const switchControl = page.getByRole("switch", { name: "Show rooms in use" });
      await expect(switchControl).toHaveAttribute("aria-checked", "false");
      await expect(page.getByText(/In use until/)).toHaveCount(0);
      await expect(page.getByText("Dockser Hall 240")).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/AC8-switch-off-${label}.png`, fullPage: true, animations: "disabled" });
      await switchControl.click();
      await expect(page.getByText(/In use until/)).toHaveCount(2);
      await expect(page.getByRole("heading", { level: 2 })).toHaveText([
        "Dockser Hall · 0 free",
        "Richards Hall · 1 free",
        "Snell Library · 3 free",
      ]);
      // Busy cards are styled differently (dashed border).
      const busyStyle = await page.locator("li", { hasText: "Dockser Hall 240" }).evaluate((el) => getComputedStyle(el).borderStyle);
      const freeStyle = await page.locator("li", { hasText: "Snell Library 101" }).evaluate((el) => getComputedStyle(el).borderLeftWidth);
      expect(busyStyle).toContain("dashed");
      expect(freeStyle).toBe("4px");
      await page.screenshot({ path: `${SHOTS}/AC8-switch-on-${label}.png`, fullPage: true, animations: "disabled" });
    });
  }

  test("AC9 search: snell, sl 117, and no matches", async ({ page }) => {
    await open(page, WED_1500Z, 375);
    await timeInput(page).fill("12:00");
    const search = page.getByRole("searchbox", { name: "Search rooms" });
    await search.fill("snell");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Snell Library · 4 free"]);
    for (const text of await cardTexts(page)) expect(text).toMatch(/^Snell Library/);
    await page.screenshot({ path: `${SHOTS}/AC9-search-snell-phone.png`, fullPage: true, animations: "disabled" });
    await search.fill("SL 117");
    expect(await cardTexts(page)).toEqual(["Snell Library 117\nFree for the rest of the day"]);
    await page.screenshot({ path: `${SHOTS}/AC9-search-sl-117-phone.png`, fullPage: true, animations: "disabled" });
    await search.fill("zzz");
    await expect(page.getByText('No rooms match "zzz".')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/AC9-search-no-match-phone.png`, fullPage: true, animations: "disabled" });
  });

  test("AC10 header shows term descriptions and generatedAt in the viewer's zone", async ({ page }) => {
    await open(page);
    await expect(page.getByText("Covers: Fall 2026 Semester, Spring 2027 Semester")).toBeVisible();
    // 07:00Z is 2:00 AM in New York (the browser's zone for this run).
    await expect(page.getByText("Updated Nov 18, 2026, 2:00 AM")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/AC10-header-desktop.png`, animations: "disabled" });
  });

  test("AC11 stale banner at 73 h and 95 h, not at 71 h", async ({ page }) => {
    const stale = page.getByText("This data was last updated 3 days ago and may be out of date.");
    await open(page, new Date(GENERATED_AT + 71 * HOUR));
    await expect(stale).toHaveCount(0);
    await page.clock.setSystemTime(new Date(GENERATED_AT + 73 * HOUR));
    await page.reload();
    await expect(stale).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/AC11-stale-73h-desktop.png`, fullPage: true, animations: "disabled" });
    await page.clock.setSystemTime(new Date(GENERATED_AT + 95 * HOUR));
    await page.reload();
    await expect(stale).toBeVisible();
    await page.clock.setSystemTime(new Date(GENERATED_AT + 97 * HOUR));
    await page.reload();
    await expect(page.getByText("This data was last updated 4 days ago and may be out of date.")).toBeVisible();
  });

  for (const [label, width] of WIDTHS) {
    test(`AC11 no-class banner for BOS on 2026-11-11, not TOR (${label})`, async ({ page }) => {
      await open(page, WED_1500Z, width);
      await dateInput(page).fill("2026-11-11");
      await expect(banners(page)).toHaveText([
        "No classes at Boston on Wed, Nov 11 (Veterans Day / Remembrance Day). Rooms show as free, but buildings may be closed.",
      ]);
      await page.screenshot({ path: `${SHOTS}/AC11-no-class-boston-${label}.png`, fullPage: true, animations: "disabled" });
      await page.getByRole("tab", { name: "Toronto" }).click();
      await expect(dateInput(page, "Toronto")).toHaveValue("2026-11-11");
      await expect(banners(page)).toHaveCount(0);
    });
  }

  test("AC11 exam banners on 2026-12-15 and 2026-12-08", async ({ page }) => {
    await open(page, WED_1500Z, 375);
    await dateInput(page).fill("2026-12-15");
    await expect(banners(page)).toHaveText([
      "Fall Law exam period: exams aren't in this data, so free rooms may be in use.",
      "Fall final exam period: exams aren't in this data, so free rooms may be in use.",
    ]);
    await page.screenshot({ path: `${SHOTS}/AC11-exam-dec15-phone.png`, fullPage: true, animations: "disabled" });
    await dateInput(page).fill("2026-12-08");
    await expect(banners(page)).toHaveText([
      "Fall Law exam period: exams aren't in this data, so free rooms may be in use.",
    ]);
    await page.screenshot({ path: `${SHOTS}/AC11-exam-dec08-phone.png`, fullPage: true, animations: "disabled" });
  });

  test("AC11 outside-coverage banner on 2026-12-25", async ({ page }) => {
    await open(page, WED_1500Z, 375);
    await dateInput(page).fill("2026-12-25");
    await expect(banners(page)).toHaveText([
      "No classes are scheduled on this date in the data we have (covers Sep 2, 2026 – Dec 20, 2026 and Jan 13, 2027 – May 2, 2027).",
    ]);
    await page.screenshot({ path: `${SHOTS}/AC11-outside-coverage-phone.png`, fullPage: true, animations: "disabled" });
  });

  test("AC11 no banners on an ordinary in-coverage day", async ({ page }) => {
    await open(page);
    await expect(banners(page)).toHaveCount(0);
  });

  test("AC12 incomplete-rooms banner for Spring 2027, none for Fall 2026", async ({ page }) => {
    await open(page, WED_1500Z, 375);
    await expect(page.getByText(/Room assignments for/)).toHaveCount(0);
    await dateInput(page).fill("2027-02-03");
    await expect(banners(page)).toHaveText([
      "Room assignments for Spring 2027 Semester are incomplete (30% assigned), so some rooms shown free may not be.",
    ]);
    await page.screenshot({ path: `${SHOTS}/AC12-rooms-incomplete-phone.png`, fullPage: true, animations: "disabled" });
  });

  for (const [label, width] of WIDTHS) {
    test(`AC13 no free room shows the empty message and no groups (${label})`, async ({ page }) => {
      await open(page, WED_1500Z, width);
      await page.getByRole("tab", { name: "Toronto" }).click();
      await expect(page.getByText("No free rooms at this time.")).toBeVisible();
      await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/AC13-no-free-rooms-${label}.png`, fullPage: true, animations: "disabled" });
    });
  }

  test("AC13b banners use role status and never alert", async ({ page }) => {
    await open(page, new Date("2026-12-18T15:00:00Z"));
    // Stale (3 days after a generatedAt moved to 12-15) plus both exam periods.
    await page.unrouteAll();
    await serveData(page, (data) => (data.generatedAt = "2026-12-15T07:00:00.000Z"));
    await page.reload();
    await expect(banners(page)).toHaveCount(3);
    await expect(alerts(page)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/AC13b-stale-and-exam-status-desktop.png`, fullPage: true, animations: "disabled" });
  });

  for (const [label, width] of WIDTHS) {
    test(`AC14 one column, no horizontal scroll, 44 px targets (${label})`, async ({ page }) => {
      await open(page, WED_1500Z, width);
      await page.getByRole("switch").click();
      await noHorizontalScroll(page);
      const heights: Record<string, number> = {};
      for (const tab of await page.getByRole("tab").all()) {
        heights[`tab ${await tab.innerText()}`] = (await tab.boundingBox())!.height;
      }
      heights.Now = (await nowButton(page).boundingBox())!.height;
      heights.date = (await dateInput(page).boundingBox())!.height;
      heights.time = (await timeInput(page).boundingBox())!.height;
      heights.search = (await page.getByRole("searchbox").boundingBox())!.height;
      console.log(`AC14 target heights at ${width}px`, JSON.stringify(heights));
      for (const [name, height] of Object.entries(heights)) expect(height, name).toBeGreaterThanOrEqual(44);
      if (width === 375) {
        const columns = await page.locator("main ul").first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
        expect(columns).toBe(1);
      }
      await page.screenshot({ path: `${SHOTS}/AC14-layout-${label}.png`, fullPage: true, animations: "disabled" });
    });
  }

  test("AC14 tab list scrolls sideways at 375 px when it overflows, page does not", async ({ page }) => {
    await serveData(page, (data) => {
      const campuses = data.campuses as Array<Record<string, unknown>>;
      const buildings = data.buildings as Array<Record<string, unknown>>;
      const rooms = data.rooms as Array<Record<string, unknown>>;
      for (const [i, name] of ["Vancouver", "San Francisco", "Seattle", "Silicon Valley", "Charlotte", "Portland"].entries()) {
        const code = `X${i}`;
        campuses.push({ code, name, timezone: "America/Los_Angeles", buildingCount: 1, roomCount: 1 });
        buildings.push({ code: `${code}-B`, name: `${name} Hall`, campus: code, roomCount: 1 });
        rooms.push({ id: `${code}-B-1`, campus: code, building: `${code}-B`, room: "1", displayName: `${name} Hall 1` });
      }
    });
    await open(page, WED_1500Z, 375);
    const list = page.getByRole("tablist", { name: "Campus" });
    const metrics = await list.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(metrics.overflowX).toBe("auto");
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/AC14-tabs-overflow-phone.png`, fullPage: true, animations: "disabled" });
    await page.getByRole("tab", { name: "Portland" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: "Portland" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Portland" })).toBeInViewport();
    await page.screenshot({ path: `${SHOTS}/AC14-tabs-overflow-scrolled-phone.png`, fullPage: true, animations: "disabled" });
  });

  test("AC14 no muted-foreground text sits on a muted background", async ({ page }) => {
    await open(page, WED_1500Z, 375);
    await page.getByRole("switch").click();
    const offenders = await page.evaluate(() => {
      const probe = document.createElement("div");
      document.body.append(probe);
      probe.style.color = "var(--muted-foreground)";
      const mutedFg = getComputedStyle(probe).color;
      probe.style.color = "var(--muted)";
      const muted = getComputedStyle(probe).color;
      probe.remove();
      const bgOf = (el: Element | null): string => {
        for (; el; el = el.parentElement) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        }
        return "none";
      };
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!ownText) continue;
        if (getComputedStyle(el).color === mutedFg && bgOf(el) === muted) out.push(el.textContent!.trim());
      }
      return out;
    });
    expect(offenders).toEqual([]);
  });

  test("AC14 keyboard only: tabs, panel focus ring, date, time, Now, search, switch", async ({ page }) => {
    await open(page, WED_1500Z, 375);
    const focusRing = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const s = getComputedStyle(el);
        return { tag: el.tagName, role: el.getAttribute("role"), label: el.getAttribute("aria-label") ?? el.textContent?.slice(0, 20), boxShadow: s.boxShadow, outline: `${s.outlineStyle} ${s.outlineWidth}` };
      });
    const visible = (r: { boxShadow: string; outline: string }) => r.boxShadow !== "none" || !r.outline.startsWith("none");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("tab", { name: "Boston" })).toBeFocused();
    expect(visible(await focusRing())).toBe(true);
    await page.screenshot({ path: `${SHOTS}/AC14-kbd-1-tab-focus-phone.png`, animations: "disabled" });
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "London" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "London" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Boston" })).toHaveAttribute("aria-selected", "true");

    // Tab from the focused trigger lands on the panel; its ring must be visible (design-reviewer).
    await page.keyboard.press("Tab");
    const panel = await focusRing();
    expect(panel.role).toBe("tabpanel");
    console.log("TabsContent focus style", JSON.stringify(panel));
    expect(visible(panel)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/AC14-kbd-2-tabpanel-focus-ring-phone.png`, animations: "disabled" });

    await page.keyboard.press("Tab");
    await expect(dateInput(page)).toBeFocused();
    expect(visible(await focusRing())).toBe(true);
    // Chromium's date field: Tab steps through month/day/year segments, arrows change the value.
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowUp");
    await expect(dateInput(page)).toHaveValue("2026-11-19");
    await expect(nowButton(page)).toHaveAttribute("aria-pressed", "false");
    // Past the year segment and the calendar-picker button to the time field.
    for (let i = 0; i < 4 && !(await timeInput(page).evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(timeInput(page)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(timeInput(page)).toHaveValue("11:00");
    await page.screenshot({ path: `${SHOTS}/AC14-kbd-3-time-focus-phone.png`, animations: "disabled" });
    // Past hour, minute, AM/PM segments and the picker button to Now.
    for (let i = 0; i < 4 && !(await nowButton(page).evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(nowButton(page)).toBeFocused();
    expect(visible(await focusRing())).toBe(true);
    await page.screenshot({ path: `${SHOTS}/AC14-kbd-4-now-focus-phone.png`, animations: "disabled" });
    await page.keyboard.press("Enter");
    await expect(nowButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(timeInput(page)).toHaveValue("10:00");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("searchbox")).toBeFocused();
    expect(visible(await focusRing())).toBe(true);
    await page.keyboard.type("snell");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Snell Library · 3 free"]);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("switch")).toBeFocused();
    expect(visible(await focusRing())).toBe(true);
    await page.keyboard.press("Space");
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Snell Library 117")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/AC14-kbd-5-switch-on-phone.png`, fullPage: true, animations: "disabled" });
  });

  test("AC15 the HTML is a static shell without schedule data", async ({ page, request }) => {
    const html = await (await request.get("/")).text();
    expect(html).not.toContain('"meetings"');
    expect(html).not.toContain("Snell Library");
    await open(page);
  });

  test("beyond: no console errors or failed requests on the happy path", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (msg) => msg.type() === "error" && problems.push(msg.text()));
    page.on("requestfailed", (r) => problems.push(`failed ${r.url()}`));
    page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
    await open(page);
    await page.getByRole("tab", { name: "London" }).click();
    await page.getByRole("switch").click();
    expect(problems).toEqual([]);
  });

  test("beyond: reload mid-flow returns to Boston in Now mode", async ({ page }) => {
    await open(page);
    await page.getByRole("tab", { name: "London" }).click();
    await timeInput(page, "London").fill("09:00");
    await page.reload();
    await expect(page.getByRole("tab", { name: "Boston" })).toHaveAttribute("aria-selected", "true");
    await expect(nowButton(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("beyond: clearing the time input keeps the last valid time", async ({ page }) => {
    await open(page);
    await timeInput(page).fill("");
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/beyond-cleared-time-desktop.png`, fullPage: true, animations: "disabled" });
  });

  test("beyond: long building names wrap without horizontal scroll at 375 px", async ({ page }) => {
    await serveData(page, (data) => {
      const b = (data.buildings as Array<Record<string, string>>).find((x) => x.code === "SL")!;
      b.name = "Snell Library and Interdisciplinary Science and Engineering Complex Annex";
      for (const r of data.rooms as Array<Record<string, string>>) {
        if (r.building === "SL") r.displayName = `${b.name} ${r.room}`;
      }
    });
    await open(page, WED_1500Z, 375);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/beyond-long-names-phone.png`, fullPage: true, animations: "disabled" });
  });
});

test.describe("FR-5 on-disk data edits", () => {
  test.describe.configure({ mode: "serial" });
  let original = "";
  test.beforeAll(() => {
    original = readFileSync(DATA_FILE, "utf8");
  });
  test.afterEach(() => {
    if (!existsSync(DATA_FILE) && existsSync(`${DATA_FILE}.qa-moved`)) renameSync(`${DATA_FILE}.qa-moved`, DATA_FILE);
    writeFileSync(DATA_FILE, original);
  });

  for (const [label, width] of WIDTHS) {
    test(`AC1 missing file shows the error, Retry by keyboard loads it once restored (${label})`, async ({ page }) => {
      renameSync(DATA_FILE, `${DATA_FILE}.qa-moved`);
      await open404(page, width);
      const alert = alerts(page);
      await expect(alert).toContainText("Couldn't load room data. Try again later.");
      const retry = page.getByRole("button", { name: "Retry" });
      expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await noHorizontalScroll(page);
      await page.screenshot({ path: `${SHOTS}/AC1-error-missing-file-${label}.png`, fullPage: true, animations: "disabled" });
      // Retry while still missing: error again.
      await retry.click();
      await expect(alerts(page)).toBeVisible();
      renameSync(`${DATA_FILE}.qa-moved`, DATA_FILE);
      await page.keyboard.press("Tab");
      await expect(retry).toBeFocused();
      await page.screenshot({ path: `${SHOTS}/AC14-kbd-retry-focus-${label}.png`, animations: "disabled" });
      await page.keyboard.press("Enter");
      await expect(page.getByRole("tab", { name: "Boston" })).toBeVisible();
      await expect(alerts(page)).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/AC1-retry-recovered-${label}.png`, fullPage: true, animations: "disabled" });
    });
  }

  test("AC1 invalid JSON shows the error and Retry recovers", async ({ page }) => {
    writeFileSync(DATA_FILE, '{"schemaVersion": 1, "terms": [');
    await open404(page, 375);
    await expect(alerts(page)).toContainText("Couldn't load room data");
    await page.screenshot({ path: `${SHOTS}/AC1-error-invalid-json-phone.png`, fullPage: true, animations: "disabled" });
    writeFileSync(DATA_FILE, original);
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("heading", { name: "FreeRooms" })).toBeVisible();
  });

  test("AC1 schemaVersion 2 on disk shows the error", async ({ page }) => {
    writeFileSync(DATA_FILE, original.replace('"schemaVersion": 1', '"schemaVersion": 2'));
    await open404(page, 1280);
    await expect(alerts(page)).toContainText("Couldn't load room data");
  });

  test("AC11 calendar-unknown banner with termYears []", async ({ page }) => {
    const data = JSON.parse(original);
    data.calendar.termYears = [];
    writeFileSync(DATA_FILE, JSON.stringify(data));
    await open(page, WED_1500Z, 375);
    await expect(banners(page)).toHaveText([
      "Holidays and exam dates for this term aren't loaded yet, so results may be wrong on those days.",
    ]);
    await page.screenshot({ path: `${SHOTS}/AC11-calendar-unknown-phone.png`, fullPage: true, animations: "disabled" });
    // Outside coverage takes precedence over calendar unknown.
    await dateInput(page).fill("2026-12-25");
    await expect(banners(page)).toHaveCount(1);
    await expect(banners(page)).toContainText("No classes are scheduled on this date");
  });

  test("AC11 stale banner from an edited generatedAt, stacked with others", async ({ page }) => {
    const data = JSON.parse(original);
    data.generatedAt = "2026-11-01T07:00:00.000Z";
    writeFileSync(DATA_FILE, JSON.stringify(data));
    await open(page, WED_1500Z, 375);
    await dateInput(page).fill("2026-12-15");
    await expect(banners(page)).toHaveText([
      "This data was last updated 17 days ago and may be out of date.",
      "Fall Law exam period: exams aren't in this data, so free rooms may be in use.",
      "Fall final exam period: exams aren't in this data, so free rooms may be in use.",
    ]);
    await page.screenshot({ path: `${SHOTS}/AC11-stale-stacked-phone.png`, fullPage: true, animations: "disabled" });
  });

  test("AC12 incomplete banner follows an edited roomedMeetingCount", async ({ page }) => {
    const data = JSON.parse(original);
    data.terms[0].roomedMeetingCount = 500;
    writeFileSync(DATA_FILE, JSON.stringify(data));
    await open(page, WED_1500Z, 375);
    await expect(banners(page)).toHaveText([
      "Room assignments for Fall 2026 Semester are incomplete (50% assigned), so some rooms shown free may not be.",
    ]);
  });

  test("AC15 a new schedule.json shows up on reload with no rebuild", async ({ page }) => {
    await open(page);
    await expect(page.getByText("Snell Library 101")).toBeVisible();
    writeFileSync(DATA_FILE, original.replace('"displayName": "Snell Library 101"', '"displayName": "Snell Library 101 (edited on disk)"'));
    await page.reload();
    await expect(page.getByText("Snell Library 101 (edited on disk)")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/AC15-new-data-on-reload-desktop.png`, fullPage: true, animations: "disabled" });
  });
});

async function open404(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.clock.install({ time: WED_1500Z });
  await page.goto("/");
}

// Keep the fixture copy in place for anyone running the suite from a clean checkout.
test.beforeAll(() => {
  if (!existsSync(DATA_FILE) && !existsSync(`${DATA_FILE}.qa-moved`)) copyFileSync(FIXTURE, DATA_FILE);
});
