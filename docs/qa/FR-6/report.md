# FR-6 QA report

VERDICT: PASS_WITH_NOTES
REVIEWER: qa-tester
SKILLS: qa-testing

Branch `fr-6-calendar` at 13c288f. This ticket has no UI, so I skipped the browser and Playwright and took no screenshots. Instead I wrote an independent probe script (not the engineer's tests). It imports the real modules and runs them against the real data file and against invalid fixtures in temporary directories. Result: 57 checks passed, 0 failed.

## ACCEPTANCE CRITERIA
- [pass] AC1 The 2026-2027.json file contains exactly the spec rows.
  - Probe checks "AC1 noClassDates dates+scopes match exactly", "AC1 examPeriods match exactly incl. labels" and "AC1 noClassDates labels verbatim".
  - There are 17 no-class rows and 6 exam rows. Dates, scopes, labels and partsOfTerm all match both spec tables exactly.
  - The header fields match: academicYear 2026-2027, termYear 2027, the source URL and sourcePostedDate 2026-06-04.
  - The repo unit test `data/calendar/2026-2027.json (FR-6 AC1)` also does this comparison.
- [pass] AC2 loadCalendarFiles validates the files and throws an error that names the file and the field.
  - Malformed JSON gives `<path>/2026-2027.json: malformed JSON (...)`.
  - Bad dates `2026-10-1`, `12/20/2026`, `2027-02-30` and `June 4 2026` all fail with `noClassDates[i].start` (or `examPeriods[i].end`, or `sourcePostedDate`): `must be a date in YYYY-MM-DD format`.
  - start > end is caught in both arrays (`noClassDates[4].end: start 2026-11-30 is after end 2026-11-29`).
  - The unknown tokens `BOSTON`, `UK` and `usa` are rejected with `noClassDates[5].scope[i]: unknown scope token`.
  - Six bad partsOfTerm values are rejected: missing, `[]`, `"1"`, `[1]`, `[""]` and `null`. Each error is at `examPeriods[2].partsOfTerm`, or at `partsOfTerm[0]` for the bad element.
  - File names `2026-27.json` and `2026-2027.json` with academicYear 2027-2028 are rejected.
  - Two files with the same termYear are rejected, and the error names both files.
  - An empty directory returns `[]`. Non-JSON files and a directory named `old.json` are ignored. Two valid files load in file-name order.
- [pass] AC3 buildCalendarBlock expands the scopes correctly and its output passes the schema.
  - The output passes `calendarSchema`, a full `scheduleFileSchema` document and `validateSchedule`.
  - Patriots Day gives `["BOS","BRD","BRL","DDH","NAH","PTL"]`.
  - Fall break gives all 17 campuses, including LDN.
  - USA gives 14 codes, without TOR, VAN or LDN. CAN gives `["TOR","VAN"]`. Good Friday gives `["CHL","TOR","VAN"]`.
  - LDN appears only in the two ALL entries.
  - Overlapping tokens (ALL+USA+BOS+CAN+VAN) give 17 sorted, de-duplicated codes.
  - Entries are sorted by `start`, including when merging several sources. termYears are sorted.
  - An empty source list gives an empty block. The input is not changed.
- [pass] AC4 missingCalendarWarnings returns the right warnings.
  - `["202710","202730"]` gives `[]`.
  - `["202730","202810"]` gives exactly the spec string: `Term 202810 has no academic calendar file (expected data/calendar/2027-2028.json); no-class days and exam periods will be missing.`
  - `["202852"]` gives one warning naming `data/calendar/2027-2028.json`.
  - With no sources, you get one warning per term. A repeated term code gives one warning.
- [pass] AC5 `npm run check` passes when I re-run it myself: exit 0, 6 test files, 118 tests.

## DATA CROSS-CHECK (2026-2027.json vs research notes vs registrar PDF)
I fetched the PDF once (HTTP 200, 11,217 bytes, 3 pages, ReportLab) and extracted its text locally. I compared every "no classes", break and exam-period row in the PDF with the JSON. **There are no mismatches.** Every PDF "no classes" row is in the JSON, and the JSON has no extra rows. All dates agree with the research notes.
- Fall break: the PDF says "First day of fall break" Nov 25 and "Fall classes resume" Nov 30, which gives 11-25 to 11-29. This matches. The PDF has no explicit last-day row, so the end date is inferred.
- Spring break: Mar 8, with classes resuming Mar 15, gives 03-08 to 03-14. This matches.
- Law exam periods: the PDF gives only the first day (Dec 7, Apr 20, Aug 9). The end dates (12-20, 05-02, 08-22) come from the general "last day of final exam period" rows. This is consistent with the spec, but the PDF does not say it directly.
- Patriots Day: the PDF says "Boston and Portland only". The JSON adds BRD, BRL, DDH and NAH, following the spec decision (Open question 2). This is a deliberate choice, not a mismatch.
- sourcePostedDate 2026-06-04: the PDF text has no "posted" line, and its metadata CreationDate is 2026-05-19. The date matches the research notes, but I could not confirm it from the PDF itself. This is informational.

## FOUND BEYOND THE SPEC
- low: termYear is not checked against academicYear. A `2026-2027.json` file with `termYear: "2026"` loads without error. The effect is limited: missingCalendarWarnings would then warn for every 2027xx term, and the AC1 unit test pins the real file's termYear.
- low: A calendar file saved with a UTF-8 BOM (some Windows editors add one) is rejected as `malformed JSON (Unexpected token '﻿' ...)`. The message is clear, but a hand-edited file could fail the build because of it.
- low: A missing `data/calendar/` directory throws a bare `ENOENT: no such file or directory, scandir ...` with no FR-6 context. The spec covers only an empty directory, so FR-2 should make sure the directory exists or handle this error.
- cosmetic: An unparseable `end` date also produces a second, confusing message: `start 2026-12-07 is after end 12/20/2026`.
- cosmetic: Files ending in `.JSON` (upper case) are ignored without any warning.

## HOW TO REPRODUCE
- `cd .claude/worktrees/agent-a6b11e38c0916ff5a && npm run check`
- Probe: `cd .claude/worktrees/agent-a6b11e38c0916ff5a && npx tsx <scratchpad>/probe/fr6-probe.ts`. The probe uses absolute imports into this worktree. Its output is saved next to it as `fr6-probe.out`.
- PDF text: `python3 -I <scratchpad>/tools/pdftext.py <scratchpad>/pdf/cal.pdf` (decodes ASCII85+Flate streams), then extract the `(...) Tj` strings.
