# FR-6 — Academic calendar 2026-27, loader, and missing-calendar warning

**Status:** draft (revision 2)
**Owner:** product-manager · **Approved by:** vp-product, <user>
**Depends on:** FR-1 · **Blocks:** FR-2 · **Overview:** `docs/specs/FR-0-overview.md`

## Problem
On holidays, breaks and finals the Banner schedule says rooms are busy when no class meets. No machine-readable academic calendar exists (Trumba feeds return 410/404). Without calendar data, the site gives wrong answers on those days. If next year's calendar is forgotten, nobody notices.

## Solution
- Check in `data/calendar/2026-2027.json`, written by hand from the registrar PDF (posted 2026-06-04).
- Add a Node loader that validates calendar files, expands campus scopes into campus codes, and produces the `calendar` block of the FR-0 contract.
- Add a function that returns a warning for every term with no calendar file.

FR-2 calls both.

### Source file shape (`data/calendar/<YYYY-YYYY>.json`)
```json
{
  "academicYear": "2026-2027",
  "termYear": "2027",
  "source": "https://registrar.northeastern.edu/wp-content/uploads/sites/9/2026-2027-Academic-Calendar.pdf",
  "sourcePostedDate": "2026-06-04",
  "noClassDates": [{ "start": "2026-09-07", "end": "2026-09-07", "label": "Labor Day", "scope": ["USA", "CAN"] }],
  "examPeriods":  [{ "start": "2026-12-14", "end": "2026-12-20", "label": "Fall final exams", "partsOfTerm": ["1"] }]
}
```
- `scope` tokens are `ALL`, `USA`, `CAN`, or campus codes. Region membership comes from `CAMPUSES[].region` (FR-1).
- `termYear` is the 4-digit prefix of the term codes this file covers. 2026-27 covers 2027xx: Fall 202710, Spring 202730, and summer 2027 terms.

### Required content of `2026-2027.json`
| Dates (inclusive) | Label | Scope |
|---|---|---|
| 2026-09-07 | Labor Day / Labour Day | USA, CAN |
| 2026-09-30 | Truth and Reconciliation Day | VAN |
| 2026-10-12 | Indigenous Peoples Day / Thanksgiving (CAN) | USA, CAN |
| 2026-11-11 | Veterans Day / Remembrance Day | USA, VAN |
| 2026-11-25 – 2026-11-29 | Fall break | ALL |
| 2027-01-18 | Martin Luther King Jr. Day | USA |
| 2027-02-15 | Presidents Day / Family Day | USA, CAN |
| 2027-03-08 – 2027-03-14 | Spring break | ALL |
| 2027-03-26 | Good Friday | CAN, CHL |
| 2027-03-31 | Farmworkers Day | OAK, SJO |
| 2027-04-19 | Patriots Day | BOS, BRD, BRL, DDH, NAH, PTL |
| 2027-05-24 | Victoria Day | CAN |
| 2027-05-31 | Memorial Day | USA |
| 2027-06-18 – 2027-06-19 | Juneteenth (observed) | USA |
| 2027-07-01 | Canada Day | CAN |
| 2027-07-04 – 2027-07-05 | Independence Day (observed) | USA |
| 2027-08-02 | Civic Holiday | CAN |

| Exam period | Label | partsOfTerm |
|---|---|---|
| 2026-12-14 – 2026-12-20 | Fall final exams | ["1"] |
| 2026-12-07 – 2026-12-20 | Fall Law exams | ["1L"] |
| 2027-04-26 – 2027-05-02 | Spring final exams | ["1"] |
| 2027-04-20 – 2027-05-02 | Spring Law exams | ["1L"] |
| 2027-08-16 – 2027-08-22 | Summer final exams | ["1"] |
| 2027-08-09 – 2027-08-22 | Summer Law exams | ["1L"] |

The `partsOfTerm` values follow FR-0's exam-period rule (**PENDING USER DECISION**). If the user picks a different rule, only this column changes. Fall 2026 1L meetings already end 12/04, so the Fall Law row has no effect on current data. It's kept for consistency.

## Acceptance criteria
- [ ] AC1: `data/calendar/2026-2027.json` contains exactly the rows in both tables above (unit test compares the dates, scopes and partsOfTerm).
- [ ] AC2: `lib/calendar/load.ts` exports `loadCalendarFiles(dir: string): CalendarSource[]`. It reads every `*.json` file in `dir` and validates it with Zod. It throws an error naming the file and field when:
  - JSON is malformed
  - a date isn't `YYYY-MM-DD`
  - `start > end`
  - a scope token is unknown
  - an exam period's `partsOfTerm` is not a non-empty string array
  - the file name doesn't equal `academicYear` + `.json`
  - two files share a `termYear`.
- [ ] AC3: `buildCalendarBlock(sources: CalendarSource[]): ScheduleFile["calendar"]` expands scopes into sorted, de-duplicated campus codes: `ALL` = all 17, `USA` = 14 codes, `CAN` = TOR, VAN. It sorts entries by `start` and sets `termYears`. The output passes the calendar part of `scheduleFileSchema` (unit test). Test: the Patriots Day entry's campuses = `["BOS","BRD","BRL","DDH","NAH","PTL"]`, and the Fall break entry contains `LDN`.
- [ ] AC4: `missingCalendarWarnings(termCodes: string[], sources: CalendarSource[]): string[]` returns one warning per term whose 4-digit prefix has no source, in this format: `Term 202810 has no academic calendar file (expected data/calendar/2027-2028.json); no-class days and exam periods will be missing.` Tests:
  - `["202710","202730"]` → `[]`
  - `["202730","202810"]` → one warning
  - `["202852"]` (legacy Law suffix) → one warning naming `2027-2028.json`.
- [ ] AC5: `npm run check` passes.

## Edge cases
- An empty `data/calendar/` directory → `loadCalendarFiles` returns `[]` (not an error). FR-2 then emits a warning for every term.
- Overlapping entries (Law exams inside the main exam period) are allowed.

## Out of scope
- Scraping Trumba or the PDF
- Interpreting the calendar for a date (FR-4)
- Calendars for other years (added by hand each year, as described in the README in FR-3).

## Files likely touched
- `data/calendar/2026-2027.json`
- `lib/calendar/load.ts`, `lib/calendar/load.test.ts`, `lib/calendar/__fixtures__/*.json`

## Open questions
1. The London campus likely has its own term dates. Which no-class dates apply to LDN? **Only `ALL` entries (fall and spring break, and exam periods).** No US or Canadian holidays. Check this with NU London when a source exists.
2. Patriots Day is listed as "Boston and Portland only". Do the other MA campuses (BRD, BRL, DDH, NAH) observe it? **Yes, include them.** It's a Massachusetts state holiday.
3. Which parts of term does an exam period suppress? See FR-0 (**PENDING USER DECISION**). Default: **only `"1"` in the main period and `"1L"` in the Law window.** 2B/3C stay busy, accepting false-busy over false-free.
