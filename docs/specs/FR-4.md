# FR-4 — Free-room logic library

**Status:** approved by user 2026-11-09 (revision 3)
**Owner:** product-manager · **Approved by:** vp-product, <user>
**Depends on:** FR-1 · **Blocks:** FR-5 · **Overview:** `docs/specs/FR-0-overview.md` (see "Definitions")

## Problem
"Is this room free, and until when?" is the product's core answer. It has traps: overlapping terms and sub-terms, holidays scoped to campuses, exam periods, end of day, and campuses in five timezones. If this logic lives inside React components, nobody can test it, and a bug shows rooms as free when a class is in them.

## Solution
Pure, framework-free TypeScript functions in `lib/free-rooms/` that implement the FR-0 definitions exactly. They take no `Date.now()` and no I/O: callers pass the instant or the local date and minute.

### API
```ts
buildIndex(data: ScheduleFile): ScheduleIndex           // meetings grouped by roomId; rooms grouped by campus
localNow(timezone: string, instant: Date): { date: string; minutes: number; weekday: 1..7 }
weekdayBit(date: string): number                       // Mon=1 … Sun=64
dayContext(index, campus: string, date: string): {
  noClass: NoClassDate | null;  examPeriods: ExamPeriod[];
  inCoverage: boolean;  calendarKnown: boolean;  terms: Term[];
  incompleteTerms: { term: Term; percentRoomed: number }[] }   // terms covering date with < 80% roomed (FR-0)
roomStatusesAt(index, campus: string, date: string, minutes: number): RoomStatus[]
type RoomStatus =
  | { roomId: string; free: true;  freeUntil: number | null }   // null = rest of day
  | { roomId: string; free: false; busyUntil: number }
isStale(generatedAt: string, now: Date): boolean      // > 72 h
formatMinutes(m: number): string                      // 630 -> "10:30 AM", 1440 -> "12:00 AM"
```

## Acceptance criteria
Each AC is one or more Vitest cases in `lib/free-rooms/*.test.ts`, using small hand-built fixtures.
- [ ] AC1 **Basic busy and free, end exclusive:** a MWF 10:30–11:35 meeting (`days`=21) on Wed 2026-11-18 means:
  - busy at 630 and 694, with `busyUntil` 695
  - free at 695 and 629.
- [ ] AC2 **Free until:** the same room with another meeting at 13:35–14:40. At 700 → `freeUntil` 815. At 900 → `freeUntil` null (rest of day). At 0 → `freeUntil` 630.
- [ ] AC3 **Weekday and date range:** not busy on Tue 2026-11-17 (no bit), the day before `startDate`, or the day after `endDate`. Busy on `startDate` and `endDate` themselves.
- [ ] AC4 **Back-to-back blocks:** meetings 10:30–11:35 and 11:35–12:40 → at 640, `busyUntil` 760. Meetings 10:30–11:35 and 11:45–12:50 → at 640, `busyUntil` 695.
- [ ] AC5 **Several terms and parts of term:** a 2A meeting ending 2026-10-25 doesn't count on 2026-11-02. A 2B meeting starting 2026-11-02 does. A 202710 and a 202730 meeting in the same room each count only inside their own dates.
- [ ] AC6 **No-class date by campus:** on 2026-11-11, with an entry for USA + VAN:
  - a BOS room's recurring meeting is suppressed (room free all day, `freeUntil` null)
  - a TOR room's meeting still counts
  - `dayContext(BOS).noClass` is that entry, and `dayContext(TOR).noClass` is null.
- [ ] AC7 **Range no-class:** Fall break 2026-11-25…29 suppresses recurring meetings on Nov 25 and Nov 29, but not on Nov 24 or Nov 30.
- [ ] AC8 **One-day meetings always count:** a one-day meeting (startDate == endDate == 2026-11-11) at a BOS room is busy on that no-class date, and a one-day meeting on 2026-12-15 is busy during the exam period.
- [ ] AC9 **Exam periods (FR-0 rule, DECIDED by user 2026-11-09):**
  - On 2026-12-15 (main period, `["1"]`), a recurring part `1` meeting is suppressed, while recurring `2B` and `3C` meetings still count (busy).
  - On 2026-12-08 (Law window `["1L"]` only), a `1L` meeting is suppressed and a part `1` meeting still counts.
  - `dayContext` lists every active exam period.
  - The function reads `partsOfTerm` from the data and hard-codes no part codes (`grep -nE "\"1L\"|'1L'" lib/free-rooms/*.ts --exclude=*.test.ts` prints nothing).
- [ ] AC10 **Coverage and calendar:** with terms 202710 (2026-09-02…2026-12-20) and 202730 (2027-01-13…2027-05-02):
  - `inCoverage` is false on 2026-12-25 and true on 2027-01-13.
  - `calendarKnown` is true on 2026-11-18 when `termYears` = ["2027"], and false when it's [].
- [ ] AC10b **Incomplete room assignment:** on 2027-02-01, with 202730 `meetingCount` 1000:
  - `roomedMeetingCount` 790 → `incompleteTerms` = [{202730, 79}]
  - 800 → `[]` (exactly 80% is complete)
  - `meetingCount` 0 → `[]`.
  - On 2026-11-18 the 202730 term isn't listed (it doesn't cover the date).
  - `percentRoomed` is rounded down to an integer.
- [ ] AC11 **Timezones and DST in `localNow`:**
  - `2026-11-18T15:00:00Z` → America/New_York 2026-11-18, 600. Europe/London 900. America/Los_Angeles 420. America/Vancouver 420. America/Toronto 600.
  - `2027-03-20T15:00:00Z` (US already on DST, UK not yet) → New York 660, London 900, Los Angeles 480.
  - `2026-11-19T03:30:00Z` → New York date 2026-11-18, 1350 (date rolls back across midnight). London 2026-11-19, 210.
- [ ] AC12 **Staleness:** `isStale` is false at exactly 72 h after `generatedAt` and true at 72 h + 1 min.
- [ ] AC13 **Campus filter:** `roomStatusesAt(index, "BOS", …)` returns statuses only for BOS rooms, one per room. Rooms with no meetings are free with `freeUntil` null.
- [ ] AC14 **Performance:** for a generated index of 1,000 rooms and 20,000 meetings, `roomStatusesAt` for one campus and instant has a **median of 5 runs under 500 ms** (after one warm-up run). `buildIndex` runs once, not per call.
- [ ] AC15: `lib/free-rooms/` imports nothing from `react`, `next` or `node:*` (`grep -rE "from ['\"](react|next|node:)" lib/free-rooms` prints nothing). `npm run check` passes.

## Edge cases
- `minutes` outside 0–1439 or a malformed date → throw `RangeError` (tested).
- An unknown campus code → empty array, not an error.
- A meeting ending at 1440 (midnight) makes the room busy until the end of the day. `busyUntil` 1440 formats as "12:00 AM".

## Out of scope
- Rendering, data fetching, the calendar file format (FR-6), looking past midnight for "free until".

## Files likely touched
- `lib/free-rooms/index.ts`, `lib/free-rooms/status.ts`, `lib/free-rooms/time.ts`, `lib/free-rooms/calendar.ts`
- `lib/free-rooms/*.test.ts`, `lib/free-rooms/__fixtures__/*`

## Open questions
None of its own. This ticket implements FR-0's defaults, including the exam-period rule (DECIDED by user 2026-11-09). Suppression is data-driven through `examPeriods[].partsOfTerm`.
