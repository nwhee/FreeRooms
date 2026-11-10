// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleFile } from "@/lib/data/schema";
import { buildIndex, formatMinutes, roomStatusesAt } from "@/lib/free-rooms";
import fixtureJson from "./__fixtures__/schedule.json";
import { FreeRoomsApp } from "./free-rooms-app";

const fixture = fixtureJson as ScheduleFile;
const GENERATED_AT = Date.parse(fixture.generatedAt);
const HOUR = 60 * 60 * 1000;

/**
 * Clock at `iso`. Timers are faked so the Now-mode tick only fires on
 * `advanceTimersByTime`; `shouldAdvanceTime` lets Testing Library's waits run.
 */
function setClock(iso: string | number) {
  vi.useFakeTimers({
    now: new Date(iso),
    toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    shouldAdvanceTime: true,
  });
}

function stubFetch(...bodies: unknown[]) {
  const queue = [...bodies];
  const fetchMock = vi.fn(async () => {
    const body = queue.length > 1 ? queue.shift() : queue[0];
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderApp(data: unknown = fixture) {
  stubFetch(data);
  render(<FreeRoomsApp />);
  await screen.findByRole("tab", { name: "Boston" });
}

const timeInput = () => screen.getByLabelText(/^Time \(/) as HTMLInputElement;
const dateInput = () => screen.getByLabelText(/^Date \(/) as HTMLInputElement;
const cardTexts = () => screen.queryAllByRole("listitem").map((item) => item.textContent);
const statusTexts = () => screen.queryAllByRole("status").map((item) => item.textContent ?? "");

function setDate(value: string) {
  fireEvent.change(dateInput(), { target: { value } });
}
function setTime(value: string) {
  fireEvent.change(timeInput(), { target: { value } });
}
async function showBusy() {
  await userEvent.click(screen.getByRole("switch", { name: "Show rooms in use" }));
}

beforeEach(() => {
  setClock("2026-11-18T15:00:00Z"); // Wed: 10:00 in Boston and Toronto, 15:00 in London
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AC1: loading and load errors", () => {
  it("renders skeletons while loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    render(<FreeRoomsApp />);
    const loading = screen.getByRole("status", { name: "Loading room data" });
    expect(loading.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it.each([
    ["the fetch fails", new TypeError("Failed to fetch")],
    ["schemaVersion is not 1", { ...fixture, schemaVersion: 2 }],
  ])("shows the error and a Retry button that fetches again when %s", async (_, firstBody) => {
    const fetchMock = stubFetch(firstBody, fixture);
    render(<FreeRoomsApp />);

    expect(await screen.findByText("Couldn't load room data. Try again later.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("tab", { name: "Boston" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows the error when the data file is missing (404)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404 })));
    render(<FreeRoomsApp />);
    expect(await screen.findByText("Couldn't load room data. Try again later.")).toBeInTheDocument();
  });
});

describe("AC2: the page fetches the data URL", () => {
  it("calls fetch with NEXT_PUBLIC_DATA_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_URL", "https://example.test/schedule.json");
    const fetchMock = stubFetch(fixture);
    render(<FreeRoomsApp />);
    await screen.findByRole("tab", { name: "Boston" });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://example.test/schedule.json");
  });

  it.each([undefined, ""])("calls fetch with /data/schedule.json when the URL is %j", async (value) => {
    vi.stubEnv("NEXT_PUBLIC_DATA_URL", value);
    const fetchMock = stubFetch(fixture);
    render(<FreeRoomsApp />);
    await screen.findByRole("tab", { name: "Boston" });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/data/schedule.json");
  });
});

describe("AC3: campus tabs", () => {
  it("renders tabs in file order with Boston selected, and London shows only London rooms", async () => {
    await renderApp();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Boston", "London", "Toronto"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.click(screen.getByRole("tab", { name: "London" }));
    await showBusy();

    expect(screen.getByRole("tab", { name: "London" })).toHaveAttribute("aria-selected", "true");
    expect(cardTexts()).toHaveLength(2);
    expect(cardTexts().every((text) => text?.startsWith("Devon House"))).toBe(true);
  });
});

describe("AC4: Now mode reads the selected campus's clock", () => {
  function expectedCards(campus: string, date: string, minutes: number): string[] {
    const index = buildIndex(fixture);
    const rooms = index.roomsByCampus.get(campus) ?? [];
    return roomStatusesAt(index, campus, date, minutes)
      .map((status, i) => {
        const text = status.free
          ? status.freeUntil === null
            ? "Free for the rest of the day"
            : `Free until ${formatMinutes(status.freeUntil)}`
          : `In use until ${formatMinutes(status.busyUntil)}`;
        return rooms[i].displayName + text;
      })
      .sort();
  }

  it("shows Boston and London local time and matching statuses", async () => {
    await renderApp();
    await showBusy();

    expect(screen.getByLabelText("Time (Boston time)")).toHaveValue("10:00");
    expect(dateInput()).toHaveValue("2026-11-18");
    expect([...cardTexts()].sort()).toEqual(expectedCards("BOS", "2026-11-18", 600));

    await userEvent.click(screen.getByRole("tab", { name: "London" }));
    expect(screen.getByLabelText("Time (London time)")).toHaveValue("15:00");
    expect(dateInput()).toHaveValue("2026-11-18");
    expect([...cardTexts()].sort()).toEqual(expectedCards("LDN", "2026-11-18", 900));
  });
});

describe("AC5: leaving and returning to Now mode", () => {
  it("time-travels on edit, ignores the clock, and Now restores it", async () => {
    await renderApp();
    expect(screen.getByText("Snell Library 1001")).toBeInTheDocument(); // free until 2:00 PM at 10:00

    setTime("14:00");
    expect(timeInput()).toHaveValue("14:00");
    expect(screen.queryByText("Snell Library 1001")).not.toBeInTheDocument(); // busy at 14:00
    expect(screen.getByRole("button", { name: "Now" })).toHaveAttribute("aria-pressed", "false");

    act(() => vi.advanceTimersByTime(60_000));
    expect(timeInput()).toHaveValue("14:00");

    expect(screen.getByText("Showing a chosen time")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Now" }));
    expect(timeInput()).toHaveValue("10:01");
    expect(screen.getByRole("button", { name: "Now" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByText("Showing a chosen time")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(60_000));
    expect(timeInput()).toHaveValue("10:02");
  });

  it("editing the date also leaves Now mode", async () => {
    await renderApp();
    setDate("2026-11-20");
    act(() => vi.advanceTimersByTime(60_000));
    expect(dateInput()).toHaveValue("2026-11-20");
    expect(timeInput()).toHaveValue("10:00");
  });
});

describe("AC6: switching campus in time-travel mode", () => {
  it("keeps the same wall-clock date and time", async () => {
    await renderApp();
    setDate("2026-11-20");
    setTime("14:30");

    await userEvent.click(screen.getByRole("tab", { name: "London" }));
    expect(dateInput()).toHaveValue("2026-11-20");
    expect(screen.getByLabelText("Time (London time)")).toHaveValue("14:30");
    // 14:30 London wall-clock: 1.01 has class 14:30–16:00. (The same instant, 19:30, would be free.)
    expect(cardTexts()).toEqual(["Devon House 1.02Free for the rest of the day"]);
  });
});

describe("AC7: free-until text", () => {
  it("shows the next meeting start or the rest of the day", async () => {
    await renderApp();
    expect(cardTexts()).toContain("Snell Library 033Free until 1:35 PM");
    expect(cardTexts()).toContain("Snell Library 101Free for the rest of the day");
  });
});

describe("AC8: show rooms in use", () => {
  it("hides busy rooms by default and shows them with In use until when switched on", async () => {
    await renderApp();
    expect(screen.queryByText("Snell Library 117")).not.toBeInTheDocument();
    expect(screen.queryByText(/In use until/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Dockser Hall/ })).not.toBeInTheDocument();

    await showBusy();
    expect(cardTexts()).toContain("Snell Library 117In use until 11:05 AM");
    expect(cardTexts()).toContain("Dockser Hall 240In use until 11:40 AM");
    expect(screen.getByRole("heading", { name: "Snell Library · 3 free" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dockser Hall · 0 free" })).toBeInTheDocument();
  });

  it("orders buildings by name and rooms naturally", async () => {
    await renderApp();
    await showBusy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Dockser Hall · 0 free",
      "Richards Hall · 1 free",
      "Snell Library · 3 free",
    ]);
    const snell = screen.getByRole("region", { name: /Snell Library/ });
    expect(within(snell).getAllByRole("listitem").map((li) => li.firstChild?.textContent)).toEqual([
      "Snell Library 033",
      "Snell Library 101",
      "Snell Library 117",
      "Snell Library 1001",
    ]);
  });
});

describe("AC9: search", () => {
  it("filters by building name, by building code plus room, and says when nothing matches", async () => {
    await renderApp();
    await showBusy();
    const search = screen.getByRole("searchbox", { name: "Search rooms" });

    await userEvent.type(search, "snell");
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(cardTexts().every((text) => text?.startsWith("Snell Library"))).toBe(true);
    expect(cardTexts()).toHaveLength(4);

    await userEvent.clear(search);
    await userEvent.type(search, "sl 117");
    expect(cardTexts()).toEqual(["Snell Library 117In use until 11:05 AM"]);

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(screen.getByText('No rooms match "zzz".')).toBeInTheDocument();
    expect(screen.queryAllByRole("region")).toHaveLength(0);
  });
});

describe("AC10: header", () => {
  it("shows the term descriptions and the formatted generatedAt", async () => {
    await renderApp();
    expect(screen.getByRole("heading", { level: 1, name: "FreeRooms" })).toBeInTheDocument();
    expect(screen.getByText("Covers: Fall 2026 Semester, Spring 2027 Semester")).toBeInTheDocument();
    const updated = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(fixture.generatedAt),
    );
    expect(screen.getByText(`Updated ${updated}`)).toBeInTheDocument();
  });

  it("shows the footer", async () => {
    await renderApp();
    expect(
      screen.getByText("Shows scheduled classes only. Rooms may be locked or booked for events."),
    ).toBeInTheDocument();
  });
});

describe("AC11: banners", () => {
  const stale = /^This data was last updated \d+ days ago and may be out of date\.$/;

  it.each([
    [73, "This data was last updated 3 days ago and may be out of date."],
    [95, "This data was last updated 3 days ago and may be out of date."],
  ])("stale: %i h after generatedAt", async (hours, text) => {
    setClock(GENERATED_AT + hours * HOUR);
    await renderApp();
    expect(statusTexts()).toContain(text);
  });

  it("stale: not shown at 71 h", async () => {
    setClock(GENERATED_AT + 71 * HOUR);
    await renderApp();
    expect(statusTexts().some((text) => stale.test(text))).toBe(false);
  });

  it("no-class: Boston on 2026-11-11 but not Toronto", async () => {
    await renderApp();
    setDate("2026-11-11");
    expect(statusTexts()).toContain(
      "No classes at Boston on Wed, Nov 11 (Veterans Day / Remembrance Day). " +
        "Rooms show as free, but buildings may be closed.",
    );
    await userEvent.click(screen.getByRole("tab", { name: "Toronto" }));
    expect(statusTexts().some((text) => text.startsWith("No classes at"))).toBe(false);
  });

  it("exam: final and Law exam periods use the data labels", async () => {
    await renderApp();
    setDate("2026-12-15"); // inside both windows: the full banner set, in data order
    expect(statusTexts()).toEqual([
      "Fall Law exam period: exams aren't in this data, so free rooms may be in use.",
      "Fall final exam period: exams aren't in this data, so free rooms may be in use.",
    ]);
    setDate("2026-12-08");
    expect(statusTexts()).toEqual([
      "Fall Law exam period: exams aren't in this data, so free rooms may be in use.",
    ]);
  });

  it("outside coverage: 2026-12-25", async () => {
    await renderApp();
    expect(statusTexts()).toEqual([]);
    setDate("2026-12-25");
    expect(statusTexts()).toEqual([
      "No classes are scheduled on this date in the data we have " +
        "(covers Sep 2, 2026 – Dec 20, 2026 and Jan 13, 2027 – May 2, 2027).",
    ]);
  });

  it("calendar unknown: termYears is empty", async () => {
    await renderApp({ ...fixture, calendar: { ...fixture.calendar, termYears: [] } });
    expect(statusTexts()).toEqual([
      "Holidays and exam dates for this term aren't loaded yet, so results may be wrong on those days.",
    ]);
    setDate("2026-12-25"); // outside coverage wins; calendar-unknown needs inCoverage
    expect(statusTexts().some((text) => text.startsWith("Holidays"))).toBe(false);
  });
});

describe("AC12: incomplete room assignments", () => {
  it("shows the exact banner for Spring (30%) and none for Fall (95%)", async () => {
    await renderApp();
    expect(statusTexts().some((text) => text.startsWith("Room assignments"))).toBe(false);
    setDate("2027-02-03");
    expect(statusTexts()).toEqual([
      "Room assignments for Spring 2027 Semester are incomplete (30% assigned), " +
        "so some rooms shown free may not be.",
    ]);
  });
});

describe("AC13: no free rooms", () => {
  it("says so and renders no empty building groups", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("tab", { name: "Toronto" }));
    expect(screen.getByText("No free rooms at this time.")).toBeInTheDocument();
    expect(screen.getByText("Turn on Show rooms in use to see when rooms free up.")).toBeInTheDocument();
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });

  it("a single-room campus still renders its room when the switch is on", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("tab", { name: "Toronto" }));
    await showBusy();
    expect(cardTexts()).toEqual(["Toronto 110In use until 6:00 PM"]);
  });
});

describe("AC13b: roles", () => {
  it("informational banners are status, not alert", async () => {
    setClock(Date.parse("2026-12-15T15:00:00Z")); // stale and inside the final exam period
    await renderApp();
    const statuses = screen.getAllByRole("status");
    expect(statuses.map((s) => s.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^This data was last updated 27 days ago/),
        expect.stringMatching(/^Fall final exam period:/),
      ]),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    // The Now/time-travel cue is plain text, not another live region.
    expect(statuses.some((s) => s.textContent === "Live")).toBe(false);
  });

  it("banners carry an icon and a tone: warning for stale, info for exam", async () => {
    setClock(Date.parse("2026-12-15T15:00:00Z"));
    await renderApp();
    const [staleBanner, lawBanner] = screen.getAllByRole("status");
    expect(staleBanner).toHaveAttribute("data-tone", "warning");
    expect(staleBanner.querySelector("svg.lucide-triangle-alert")).not.toBeNull();
    expect(lawBanner).toHaveAttribute("data-tone", "info");
    expect(lawBanner.querySelector("svg.lucide-info")).not.toBeNull();
  });

  it("the load error is an alert", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    render(<FreeRoomsApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load room data");
    expect(screen.getByRole("heading", { level: 1, name: "FreeRooms" })).toBeInTheDocument();
  });

  it("no file in components/free-rooms defines its own cn", () => {
    // Built at runtime so this file doesn't match the spec's literal grep itself.
    const needle = ["function", "cn"].join(" ");
    const offenders = readdirSync(__dirname, { recursive: true, encoding: "utf8" }).filter(
      (file) => /\.tsx?$/.test(file) && readFileSync(join(__dirname, file), "utf8").includes(needle),
    );
    expect(offenders).toEqual([]);
  });
});

describe("keyboard", () => {
  it("arrow keys move between campus tabs", async () => {
    await renderApp();
    screen.getByRole("tab", { name: "Boston" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "London" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Time (London time)")).toBeInTheDocument();
  });
});
