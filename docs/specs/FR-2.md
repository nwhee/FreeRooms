# FR-2 — Banner fetch script that writes static JSON

**Status:** approved by user 2026-11-09 (revision 3)
**Owner:** product-manager · **Approved by:** vp-product, <user>
**Depends on:** FR-1, FR-6 · **Blocks:** FR-3 · **Overview:** `docs/specs/FR-0-overview.md`

## Problem
The site needs a fresh, complete `schedule.json` every night, built from Northeastern's public Banner class search. It has to cover every active term (CPS and Law now live inside the semester terms) and switch semesters with no code change. A bad run must never replace good data with empty or partial data, because that makes every room look free.

## Solution
A Node script, `npm run fetch-data` (`tsx scripts/fetch-data/index.ts`), that writes `--out` (default `public/data/schedule.json`, which is gitignored). FR-3 publishes the file to the `data` branch. This script never runs git.

1. **Discover terms:** `GET classSearch/getTerms?searchTerm=&offset=1&max=100`, paging until a short page. Fetch the union of:
   - every term whose description does **not** end in `(View Only)`, with no filtering by code suffix, so legacy CPS and Law suffixes work if they reappear;
   - every term in the existing `--out` file whose `endDate ≥ today`, even if Banner now marks it View Only.
2. **Fetch each term** in one cookie session: `POST classSearch/resetDataForm` → `POST term/search?mode=search` (`term=<code>`) → `GET searchResults/searchResults?txt_term=<code>&pageOffset=<n>&pageMaxSize=500` with `n = 0, 500, …` until fetched ≥ `totalCount` or a page is empty.
3. **Transform** to the FR-0 contract:
   - Dedupe sections by `term + courseReferenceNumber`.
   - Compute term and part-of-term ranges from **all** meetings with dates. Drop terms where `endDate < today` or `startDate > today + 120 days` (today in America/New_York).
   - **Candidate meetings** have non-null `beginTime` and `endTime`, ≥1 day flag, a section `campusDescription` that `campusFromBannerName` maps to a campus (use the section-level campus; the meeting-level one is often null), and `building ≠ "VTL"`. Per term, `meetingCount` = candidates and `roomedMeetingCount` = candidates with non-null `building` and `room`. Only roomed candidates become meetings.
   - Convert `"1030"` → 630 and `MM/DD/YYYY` → `YYYY-MM-DD`.
   - **Hand-roll the HTML entity decoder.** Cover named entities (`&amp; &lt; &gt; &quot; &#39; &apos;`) and numeric ones (`&#NN;` / `&#xNN;`). Add no dependency.
   - Room id = `<building>-<room>`. If one room appears under several campuses, take the campus with the most meetings and add a warning.
   - **Collapse identical meetings** only when they share all of roomId, days, start, end, startDate, endDate **and `partOfTerm`** (for example, cross-listed sections). Keep the lowest `termCode`. Meetings that differ only in `partOfTerm` are all kept, because the calendar can suppress them differently.
   - Build `calendar` with FR-6's `buildCalendarBlock` and append `missingCalendarWarnings`.
4. **Validate and write:** run `validateSchedule` (FR-1), then apply the guards and the write rule below.

### Politeness
- Every request sends `User-Agent: FreeRooms/1.0 (student project; Northeastern free-room finder)`. No email, no auth.
- Wait ≥ 2,000 ms between requests (`--delay-ms`, minimum 1,000).
- On a network error, HTTP 429 or 5xx: retry after 5 s, 15 s, then 45 s, honouring a longer `Retry-After`. After the 3rd retry fails, the run fails.

### Fail loudly (exit 1, existing file untouched, reason printed)
- Zero terms to fetch, or zero terms left after the date window.
- Any request that fails after its retries, or a non-JSON or `success:false` response.
- `totalCount > 0` for a term but the unique sections fetched < `totalCount`.
- `validateSchedule` fails, or the output has 0 rooms or 0 meetings.
- **Vanished-term guard:** a term in the existing file that is still in the window (`endDate ≥ today`) returns 0 sections in the new run, or is missing from the new output. Override with `--force`. This stops a Banner hiccup on one term from wiping that term's rooms and making them look free.
- **Per-term room-drop guard:** for each term present in **both** the existing file and the new output, the distinct rooms with a meeting in that term fall below 50% of the existing count. Override with `--force`.
  - Terms that left the window, or are new, aren't compared, so the semester switch around Dec 21 doesn't trip the guard.

### Write rule
- Write minified, sorted JSON only when:
  - the content excluding `generatedAt` differs from the existing file, **or**
  - the existing `generatedAt` is ≥ 48 h old (a heartbeat that keeps the 72 h stale rule from firing while the job is healthy).
- Otherwise print `No change; not writing.` and exit 0.

### CLI flags
- `--out <path>`
- `--today YYYY-MM-DD`
- `--delay-ms <n>`
- `--force`
- `--dry-run`: runs discovery, fetch, transform, validation and guards, prints the summary and warnings, and writes nothing.

## Acceptance criteria
- [ ] AC1 **Transform (fixture test):** given captured Banner pages in `scripts/fetch-data/__fixtures__/`, the output passes `validateSchedule` and all of these hold:
  - Null-room, `VTL`, null-`beginTime`, "Online" and "No campus, no room needed" meetings are excluded.
  - The duplicate CRN appears once.
  - `"Fin Accountg&amp;Reportg"` is decoded to `Fin Accountg&Reportg`, and `&#39;` to `'`.
  - A one-day meeting is kept, with `startDate == endDate`.
  - The `ACCT 1201` sample becomes `{roomId:"SL-117", days:13, start:630, end:695, startDate:"2027-01-13", endDate:"2027-05-02", partOfTerm:"1", termCode:"202730"}`.
  - An unknown campus name is skipped and produces a warning naming it.
  - **CPS and Law:** the fixtures include a 202710 `partOfTerm:"2A"` CPS section (for example PJM) and a `partOfTerm:"1L"` LAW section in a `DK` room. Both appear in `meetings` with their `partOfTerm` kept, and the DK room is in `rooms`.
- [ ] AC2 **Term discovery and window (unit test):**
  - A `(View Only)` term is ignored, and a non-View-Only legacy code `202815` is fetched.
  - A term that is View Only in Banner but in the existing file with `endDate ≥ today` **is** fetched. The same term with `endDate < today` is not.
  - With `--today 2026-12-21`, 202710 (ends 2026-12-20) is dropped and 202730 is kept. With `--today 2026-11-08`, both are kept.
  - Term `startDate` **includes** meetings that have no room: a fixture whose earliest meeting is unroomed sets `startDate` to that meeting's date.
- [ ] AC3 **Session protocol (mocked fetch):** for each term the requests go, in order, `resetDataForm` → `term/search` → `searchResults` pages. The first response's cookie is sent on later requests. `pageMaxSize=500`. Paging stops at `totalCount` (8,632 → 18 pages).
- [ ] AC4 **Politeness (mocked fetch + injected sleep):**
  - Every request has the exact User-Agent above.
  - The sleep between requests is ≥ the configured delay.
  - A 503 then 200 succeeds after one 5 s backoff.
  - Four consecutive 503s fail the run.
  - No request URL or header contains `@`.
- [ ] AC5 **Fail loudly (tests on `main()` with a temp `--out`):** each guard above makes `main()` exit 1 and leaves the existing file byte-identical.
- [ ] AC5b **Semester transition (test):**
  - The existing file has 202710 (600 rooms) and 202730 (150 rooms). The new run with `--today 2026-12-21` has only 202730 (160 rooms), so the total drops 80%. It exits 0 and writes.
  - With the same existing file, a new 202730 with 70 rooms (< 50% of 150) exits 1. With `--force` it exits 0.
  - **Vanished term:** with `--today 2026-11-20`, the existing file has 202710 (endDate 2026-12-20) and 202730. In one case Banner returns `totalCount: 0` for 202710; in another, 202710 is absent from `getTerms`. Both exit 1 and leave the file byte-identical. Both exit 0 with `--force`.
  - **Not vanished:** with `--today 2026-12-21`, the same 202710 (endDate 2026-12-20 < today) is absent, and the run exits 0.
- [ ] AC6 **Room-assignment counts (test):** a fixture term with 10 candidate meetings, 6 of them roomed, gets `meetingCount: 10, roomedMeetingCount: 6`. Online (VTL or Online campus) and no-time meetings are counted in neither.
- [ ] AC7 **Dedupe (test):**
  - Two identical meetings with the same `partOfTerm "1"` from terms 202730 and 202710 collapse to one with `termCode "202710"`.
  - Identical meetings with parts `1` and `2B` stay as two meetings.
- [ ] AC8 **Write rule (tests):**
  - Same content and a fresh `generatedAt` → file not rewritten and `No change; not writing.` printed.
  - Same content and a `generatedAt` 49 h old → rewritten.
  - Changed content → rewritten.
  - Arrays are sorted as FR-0 specifies.
- [ ] AC9 **Dry run (test):** `--dry-run` with mocked Banner prints the summary line and exits 0. The `--out` file is byte-identical, or still absent if it didn't exist. A failing guard under `--dry-run` still exits 1.
- [ ] AC10 **Warnings:**
  - Each warning is printed as `::warning::<text>` and stored in `warnings[]`.
  - A missing calendar file produces FR-6's exact warning text.
  - A file over 5 MB adds a warning.
  - Warnings never cause exit 1.
- [ ] AC11 **Summary line:** a successful run prints one line in this format (dates and counts here are format examples only, not expected values):
  `Terms: 202710 Fall 2026 Semester (2026-09-02..2026-12-20, 87% roomed), 202730 Spring 2027 Semester (2027-01-13..2027-05-02, 30% roomed) | campuses N | buildings N | rooms N | meetings N`
- [ ] AC12 **Live smoke (manual, run once by the engineer and output pasted in the PR):** `npm run fetch-data -- --out /tmp/schedule.json` exits 0 and makes fewer than 100 requests. The pasted output and a `jq` check on the file show:
  - ≥ 400 rooms and ≥ 5,000 meetings
  - at least one room with an id starting `DK-` (Law, Dockser)
  - at least one meeting with `partOfTerm` in `2A`, `2B`, `3A`, `3B` or `3C` (CPS sessions).
- [ ] AC13: Running the script locally produces `public/data/schedule.json` that passes `validateSchedule`. Git doesn't track it (`git check-ignore public/data/schedule.json` exits 0, and `git status` stays clean). No file outside `scripts/fetch-data/` is committed by this ticket.
- [ ] AC14: Unit tests make no network calls. `npm run check` passes.

## Edge cases
- A term **not in the existing file** with `totalCount: 0` (newly created) → warning. Not a failure unless it leaves zero terms. For a term that is in the existing file and still in the window, 0 sections is a failure (vanished-term guard).
- **Window edge (accepted):** "today" is the America/New_York date on the runner. Terms are added or dropped on New York midnight, so a West Coast or London term's last evening can drop up to a day early or late. The UI still filters each meeting by its own dates, so the only effect is that one term's data may disappear a day early. Accepted for v1.
- Banner renames a campus → the meetings are skipped with a warning. The per-term guard catches a mass loss within a term.
- Spring rooms not yet assigned → shows up as a low `roomedMeetingCount`, which FR-5 surfaces as a banner.
- Sticky session filters → the script never sends filters other than `txt_term`, and always resets between terms.
- No existing `--out` file (first run, or a fresh CI checkout without data) → the guards that compare against it are skipped.

## Out of scope
- Events, the subject/title/instructor fields, Banner endpoints other than the ones above, git and publishing (FR-3).

## Files likely touched
- `scripts/fetch-data/index.ts`, `banner-client.ts`, `transform.ts`, `entities.ts`, `write.ts`
- `scripts/fetch-data/*.test.ts`, `scripts/fetch-data/__fixtures__/*.json`

## Open questions
1. 120-day look-ahead: is it enough to pick up Spring in early November? **Yes.** Spring starts 2027-01-13, 66 days after today.
2. If a campus can't be mapped, should the run fail instead of warning? **Warn.** The per-term guard covers mass breakage.
