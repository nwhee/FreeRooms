# FR-2b — Fetch script hardening: placeholder rooms and guard fixes

**Status:** Draft, pending vp-product spec review (revision 2)
**Owner:** product-manager · **Approved by:** pending (product-manager + vp-product consensus)
**Findings from:** QA, vp-product, vp-engineering, security-reviewer (FR-2 review against live data, 2026-11-10)
**Depends on:** FR-2 (merged) · **Overview:** `docs/specs/FR-0-overview.md` · **Parent spec:** `docs/specs/FR-2.md`

## Problem
The live output (`public/data/schedule.json`, 572 rooms) lists 8 entries that aren't classrooms as free rooms:
- `BOS-DEPT` (70 meetings)
- `MSI-NA` (3)
- `NY-FND-OS1` … `NY-FND-OS5` (15, 18, 19, 15, 15)
- `XCR-ROOM` (2)

A student who walks to "Boston DEPT" finds nothing. The FR-2 review also found:
- warnings are lost when a guard fails
- `--today` accepts impossible dates
- `Retry-After` and paging have no upper bound.

**Solved when:** one polite live re-run excludes exactly those 8 rooms and keeps every real room, and each gap below has a passing test.

## Solution
1. **Placeholder deny-list (room patterns only):** a checked-in file, `scripts/fetch-data/placeholder-rooms.json`:
   ```json
   { "roomPatterns": ["^DEPT$", "^NA$", "^N/A$", "^ROOM$", "^TBA$", "^TBD$", "^OS\\d+$"] }
   ```
   - Patterns are case-insensitive regexes matched against the trimmed `room` value. There's no building list: `XCR` contains only `XCR-ROOM`, which `^ROOM$` already covers.
   - The file is validated on load. An unknown key, an empty `roomPatterns`, or an invalid regex → exit 1.
   - Placeholder meetings are removed **before** building-campus assignment, so they never create rooms, buildings, or multi-campus warnings.
   - **Counting (deliberate reading of FR-0):** a placeholder meeting that is otherwise a candidate **counts in `meetingCount` but not in `roomedMeetingCount`**. FR-0 defines roomed as "building and room both non-null", and we read a placeholder room as not a real room, the same as an unassigned one. This keeps the "room assignments incomplete" banner honest.
   - The run emits one summary warning: `Excluded <N> placeholder rooms (<M> meetings): <ids>`. Ids are in source case, sorted by code unit, comma-separated. When there are more than 20, the first 20 are followed by `…and <K> more`.
2. **Warnings survive failure:** on every exit-1 path, every collected `::warning::` line is printed before the failure message.
3. **`--today` validation:** must be a real calendar date in `YYYY-MM-DD`. Otherwise exit 1 with `Invalid --today: <value>`, before any network request.
4. **Bounds:**
   - A `Retry-After` over 300 s (seconds or HTTP-date form) fails the request immediately, without waiting.
   - More than 100 `searchResults` pages for one term fails the run.

5. **One re-fetch on a paging shortfall:** Banner sometimes pages inconsistently. On 2026-11-10, 202710 returned one section twice and skipped another: `fetched 8473 unique sections but Banner reported 8474`. The day before it gave 8474/8474. So when a term's unique sections are fewer than `totalCount`:
   - Re-fetch that term once from scratch (`resetDataForm` → `term/search` → all pages, with the same polite delay), then re-check.
   - Emit `::warning::Term <code>: fetched <n> unique sections but Banner reported <total>; re-fetched once.`
   - If the shortfall persists, fail as FR-2 does today.
   - There's at most one re-fetch per term per run.

FR-2's behaviour for an invalid existing output file stays unchanged. See `docs/decisions.md`.

## Acceptance criteria
Tests are in `scripts/fetch-data/*.test.ts` with mocked fetch and no network, unless noted.
- [ ] AC1 **Deny-list (fixture):** a fixture has one roomed meeting each in `MSI`/`NA`, `NY-FND`/`OS1`…`OS5`, `XCR`/`ROOM`, `SL`/`tba`, plus two in `BOS`/`DEPT`, plus a real `SL`/`117`.
  - Of those, the output contains only `SL-117`.
  - Exactly one warning equals `Excluded 9 placeholder rooms (10 meetings): BOS-DEPT, MSI-NA, NY-FND-OS1, NY-FND-OS2, NY-FND-OS3, NY-FND-OS4, NY-FND-OS5, SL-tba, XCR-ROOM`.
- [ ] AC1b **Truncation:** a fixture with 25 placeholder rooms (one meeting each) produces a warning that lists the first 20 ids, then `…and 5 more`.
- [ ] AC2 **No over-match:** rooms `AUD`, `BLBX`, `DS`, `GHE`, `GHW`, `THTR`, `NA1`, `ROOM 5`, `OS`, `105A` and `DEPT2` are all **kept**. Rooms `os12` and ` NA ` (with surrounding spaces) are excluded.
- [ ] AC3 **Counts and campus:** in a term with 4 candidate meetings (1 real roomed, 2 placeholder, 1 unassigned), the output has `meetingCount: 4, roomedMeetingCount: 1`. A building whose only other-campus sections are placeholder meetings gets no multi-campus warning.
- [ ] AC4 **Deny-list validation:** a deny-list with an invalid regex (`"^(OS$"`), an empty `roomPatterns`, or an extra key (e.g. `buildingCodes`) makes `main()` exit 1 with a message naming the problem.
- [ ] AC5 **Warnings on failure:** the test captures stdout and stderr together into **one ordered log**. The run has an unknown campus name **and** a failing per-term room-drop guard. It exits 1, and the log has the `::warning::` line naming the unknown campus **before** the failure message.
- [ ] AC6 **`--today`:** `2026-13-45`, `2026-02-29`, `2026-11-1` and `tomorrow` each exit 1 with `Invalid --today: <value>`, and the mocked fetch is called 0 times. `2028-02-29` is accepted.
- [ ] AC7 **Retry-After:** with an injected clock or fake timers:
  - `Retry-After: 301` fails without sleeping (the injected sleep is never called with ≥ 301,000).
  - `Retry-After: 300` sleeps 300,000 ms, then retries.
  - An HTTP-date 10 minutes after the injected "now" fails, and one 60 s after it sleeps 60,000 ms.
- [ ] AC8 **Page cap:** a term whose mocked pages never end (always 500 rows, `totalCount` 60,000) fails after exactly 100 `searchResults` requests, with a message naming the term.
- [ ] AC8b **Re-fetch on shortfall (fake Banner, request log):**
  - Case 1: the first pass for term T has one row duplicated and one dropped (`totalCount` 1,000, 999 unique), and the second pass is clean. The run exits 0, prints the re-fetch `::warning::` naming T, and the output contains the previously dropped section.
  - Case 2: both passes are short. The run exits 1, still printing the warning, and the request log shows exactly two `resetDataForm` → `term/search` → pages sequences for T, so exactly one re-fetch.
  - Case 3: two terms are both short on their first pass and clean on the second. Each is re-fetched once.
  - In every case, the injected sleep between requests stays ≥ the configured delay.
- [ ] AC9 **Live smoke (manual, a single polite run, output pasted in the PR):** first record `P` = the room count of the current `public/data/schedule.json`. Then run `npm run fetch-data -- --out /tmp/schedule.json` once, with the default ≥ 2 s delay. The run may include up to one re-fetch per term (Solution 5). If it does, paste the re-fetch warning. A shortfall after the re-fetch fails the AC; don't re-run it repeatedly.
  - The `Excluded …` warning lists exactly `BOS-DEPT, MSI-NA, NY-FND-OS1, NY-FND-OS2, NY-FND-OS3, NY-FND-OS4, NY-FND-OS5, XCR-ROOM`. Any other id in that list fails this AC and goes back to the PM to adjust the patterns.
  - `jq '.rooms | length'` is within ±5% of `P − 8` (for P = 572: 536–592).
  - `jq` confirms that `EL-AUD`, `NY-CH-BLBX`, `NY-CH-DS`, `NY-CH-GHE`, `NY-CH-GHW` and `NY-NH-THTR` are still present, if they're in the current file.
- [ ] AC10 **Existing tests:** `npm run check` passes. The only FR-2 test expected to change is `scripts/fetch-data/index.test.ts:494` (the `--today` message, now `Invalid --today: <value>`). Every other FR-2 test, including `index.test.ts:467` (the invalid-existing-file behaviour), passes unchanged.

## Edge cases
- A real room that happens to be named like a placeholder (a room literally called `NA`) is excluded. Accepted; remove the pattern if it's ever reported.
- New placeholder kinds appear in Banner → they show up in the room list. Fix by editing the JSON, not the code.

## Out of scope
- Changing the FR-0 contract
- UI changes
- Excluding by building code or building name
- Changing the guard thresholds or the invalid-existing-file behaviour
- The "no terms to fetch" message (already implemented in FR-2, `index.ts:123`).

## Files likely touched
- `scripts/fetch-data/placeholder-rooms.json` (new)
- `scripts/fetch-data/transform.ts`, `scripts/fetch-data/index.ts`, `scripts/fetch-data/banner-client.ts`
- `scripts/fetch-data/*.test.ts`, `scripts/fetch-data/__fixtures__/*.json`

## Open questions
None. Every item is decided by product-manager and vp-product consensus, pending this review.
