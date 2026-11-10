# FR-5 — Free-rooms UI

**Status:** approved by user 2026-11-09 (revision 3)
**Owner:** product-manager · **Approved by:** vp-product, <user>
**Depends on:** FR-1, FR-4 · **Overview:** `docs/specs/FR-0-overview.md`

## Problem
A student needs to see, in a few seconds and on a phone, which rooms at their campus are free at the time they care about and for how long. They also need to know when the answer can't be trusted: stale data, a holiday, finals, or a date outside the data.

## Solution
A single page at `/`, a client component that fetches the schedule once **at runtime from `process.env.NEXT_PUBLIC_DATA_URL`, or `/data/schedule.json` when that's unset or empty** (FR-0 deploy model, DECIDED by user 2026-11-09). It builds the FR-4 index and renders:

1. **Header:**
   - "FreeRooms" title
   - "Covers: Fall 2026 Semester, Spring 2027 Semester" (from `terms[].description`)
   - "Updated <date, time>" (`generatedAt` in the viewer's locale and zone).
2. **Campus tabs:** one per `campuses[]` entry in file order (Boston first). Each shows the campus name. Default tab is BOS.
3. **When picker:**
   - Native `<input type="date">` and `<input type="time" step="300">`, labelled with the campus zone, e.g. "Time (London time)".
   - A **Now** button.
   - Default is Now mode: the inputs show the campus's current local date and time, and the view refreshes every 60 s.
   - Editing either input leaves Now mode. Pressing Now returns to it.
4. **Search box:** case-insensitive. Every whitespace-separated token must appear as a substring in the room's `displayName`, building code, or room number.
5. **"Show rooms in use" switch:** off by default.
6. **Results:**
   - Rooms grouped by building, buildings sorted by name. Each building header shows "<name> · N free".
   - Rooms inside a group are in natural order (101, 102, 1001).
   - A free card shows `displayName` and "Free until 2:50 PM" or "Free for the rest of the day".
   - With the switch on, busy cards also appear, styled differently, with "In use until 11:35 AM".
   - Buildings with no visible rooms are hidden.
7. **Banners** (shadcn `Alert`, above the results; more than one can show):
   - **Stale** (`isStale`): "This data was last updated N days ago and may be out of date." N = `floor((now − generatedAt) / 24 h)`, so it's always ≥ 3 when this banner shows.
   - **No-class day** (`dayContext.noClass`): "No classes at <campus> on <Wed, Nov 11> (<label>). Rooms show as free, but buildings may be closed."
   - **Exam period** (per active period, text taken from the data `label`, no part codes hard-coded): "<label>: exams aren't in this data, so free rooms may be in use." FR-6 labels are "Fall final exam period", "Fall Law exam period" and so on.
   - **Outside coverage** (`!inCoverage`): "No classes are scheduled on this date in the data we have (covers <term ranges>)."
   - **Calendar unknown** (`inCoverage && !calendarKnown`): "Holidays and exam dates for this term aren't loaded yet, so results may be wrong on those days."
   - **Rooms incomplete** (per entry in `dayContext.incompleteTerms`): "Room assignments for <Spring 2027 Semester> are incomplete (<N>% assigned), so some rooms shown free may not be."
8. **Footer:** "Shows scheduled classes only. Rooms may be locked or booked for events."

## Acceptance criteria
Component tests (Vitest + Testing Library, jsdom) use a fixture `components/free-rooms/__fixtures__/schedule.json` and a mocked clock and `fetch`, unless the AC says otherwise.
- [ ] AC1: While loading, skeletons render. If the fetch fails or `schemaVersion ≠ 1`, the page shows "Couldn't load room data. Try again later." with a Retry button that fetches again.
- [ ] AC2: With `NEXT_PUBLIC_DATA_URL` stubbed to `https://example.test/schedule.json`, the mocked `fetch` is called with exactly that URL. With it unset or `""`, it's called with `/data/schedule.json`. The URL is read in one place (`use-schedule.ts`).
- [ ] AC3: Tabs render in fixture order with Boston first and selected. Selecting "London" shows only LDN rooms.
- [ ] AC4: With the clock at `2026-11-18T15:00:00Z`:
  - BOS tab: the inputs read 2026-11-18 / 10:00 and the label says "Boston time".
  - Switching to London: the inputs read 15:00 and the label says "London time".
  - Room statuses match `roomStatusesAt` for those values.
- [ ] AC5:
  - Changing the time to 14:00 updates the results and turns off Now mode.
  - Advancing the mocked clock 60 s doesn't change the inputs.
  - Pressing Now restores the current time.
  - In Now mode, advancing the clock 60 s updates the inputs.
- [ ] AC6: In time-travel mode, switching campus keeps the same date and time values (FR-0 Q4).
- [ ] AC7: A room free until 815 shows "Free until 1:35 PM". A room with no later meeting shows "Free for the rest of the day".
- [ ] AC8: With the switch off, busy rooms aren't rendered. With it on, they render with "In use until …". The building header count counts free rooms only.
- [ ] AC9: The query "snell" shows only Snell Library rooms. "sl 117" shows SL-117. A query with no matches shows "No rooms match "<query>"."
- [ ] AC10: The header shows the fixture's term descriptions and its formatted `generatedAt`.
- [ ] AC11: Each banner appears exactly when its condition holds:
  - stale: clock 73 h after `generatedAt` reads "3 days ago"; at 95 h it still reads "3 days ago"; not shown at 71 h
  - no-class: BOS on 2026-11-11; not TOR that day
  - exam: 2026-12-15 shows "Fall final exam period: …"; 2026-12-08 shows "Fall Law exam period: …"
  - outside coverage: 2026-12-25
  - calendar unknown: fixture with `termYears: []`.
- [ ] AC12: For a date in 202730 where the fixture has `meetingCount: 1000, roomedMeetingCount: 300`, the banner reads exactly "Room assignments for Spring 2027 Semester are incomplete (30% assigned), so some rooms shown free may not be." For a date in 202710 (fixture 95% roomed), no such banner appears.
- [ ] AC13: When no room is free (and the switch is off), the page shows "No free rooms at this time." and no empty building groups.
- [ ] AC14 (screen state, checked by hand against real data with `npm run dev`):
  - At 375 px width the page is one column with no horizontal scroll.
  - Tabs scroll horizontally if they overflow.
  - All controls work with the keyboard only (Tab, arrow keys between tabs, Enter or Space).
- [ ] AC15: `app/page.tsx` is a thin server component that renders the client component. The schedule is fetched in the browser at runtime, not embedded in the HTML or bundle:
  - `npm run build` output shows `/` as static
  - `grep -r '"meetings"' .next/static` prints nothing
  - a new `schedule.json` at the data URL shows up on reload with no rebuild.
- [ ] AC16: `npm run check` and `npm run build` pass.

## Edge cases
- No local data file (fetch never run) and no `NEXT_PUBLIC_DATA_URL` → 404 → the AC1 error state.
- The data URL is cross-origin (raw.githubusercontent.com) → a plain `fetch` with no credentials or custom headers, so no CORS preflight.
- A campus with a single building or room still renders correctly.
- The date picker allows any date. Dates outside coverage show the banner instead of being blocked.
- A long building name wraps without breaking the card layout.

## Out of scope
- URL or shareable state, map, `/browse`, events, dark-mode toggle, room details pages, saving favourites.

## Files likely touched
- `app/page.tsx`
- `components/free-rooms/free-rooms-app.tsx`, `campus-tabs.tsx`, `when-picker.tsx`, `room-search.tsx`, `building-group.tsx`, `room-card.tsx`, `status-banners.tsx`, `data-header.tsx`, `use-schedule.ts`, `use-now.ts`
- `components/free-rooms/*.test.tsx`, `components/free-rooms/__fixtures__/schedule.json`

## Open questions
1. Should the time format follow the campus (24 h for London)? **No. Use 12 h with AM/PM everywhere for v1.**
2. Should the selected campus be remembered between visits? **No for v1.** Always open on Boston. It's cheap to add later with localStorage.
