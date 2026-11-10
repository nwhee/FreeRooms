# FR-2b — Fetch script hardening: placeholder rooms and guard fixes

**Status:** approved (team consensus, 2026-11-10; no user decision needed)
**Owner:** product-manager · **Approved by:** QA, vp-product, vp-engineering, security-reviewer (consensus)
**Depends on:** FR-2 (merged) · **Overview:** `docs/specs/FR-0-overview.md` · **Parent spec:** `docs/specs/FR-2.md`

## Problem
The live 2026-11-10 output lists entries that aren't classrooms as free rooms:

| Room id | Building description | Note |
|---|---|---|
| `BOS-DEPT` | Boston | 70 meetings |
| `XCR-ROOM` | Unidentified campus | |
| `MSI-NA` | | |
| `NY-FND-OS1` … `NY-FND-OS5` | Found | |

A student who walks to "Boston DEPT" finds nothing. The FR-2 review also found smaller gaps:
- warnings are lost when a guard fails
- `--today` accepts impossible dates
- `Retry-After` and paging have no upper bound
- a corrupted existing file silently disables the guards
- an unclear error message.

**Solved when:** a polite live re-run has none of those ids and still has ≥ 400 rooms, and each gap below has a passing test.

## Solution
1. **Placeholder deny-list:** a checked-in file, `scripts/fetch-data/placeholder-rooms.json`:
   ```json
   {
     "buildingCodes": ["XCR"],
     "roomPatterns": ["^DEPT$", "^NA$", "^N/A$", "^ROOM$", "^TBA$", "^TBD$", "^OS\\d+$"]
   }
   ```
   - Building codes are matched exactly. Room patterns are case-insensitive regexes matched against the trimmed `room` value.
   - Excluded meetings are removed **before** building-campus assignment, and count as neither candidate nor roomed (`meetingCount` / `roomedMeetingCount`).
   - The run emits one summary warning: `Excluded <N> placeholder rooms (<M> meetings): <ids, sorted, first 20>`.
   - The file is validated on load. An unknown key, an empty array, or an invalid regex → exit 1.
   - *Why not exclude the buildings `FND`/`DEPT`?* `DEPT` is a room value under building `BOS`, not a building code. `NY-FND` is a real NYC building code in the research notes, so we exclude its `OS<n>` room values rather than the whole building.
2. **Warnings survive failure:** every collected `::warning::` line is printed before the failure message on every exit-1 path.
3. **`--today` validation:** must be a real calendar date in `YYYY-MM-DD`. Otherwise exit 1 with `Invalid --today: <value>`, before any network request.
4. **Bounds:**
   - A `Retry-After` over 300 s (seconds or HTTP-date form) fails the request immediately, without waiting.
   - More than 100 pages for one term fails the run.
5. **Corrupt existing file:** if the existing `--out` file isn't valid JSON or fails `validateSchedule`, exit 1 with `Existing output <path> is invalid; guards cannot run. Re-run with --force to overwrite.` With `--force`, add a warning and continue without comparison guards. A missing file is still fine (first run).
6. **Message:** when discovery yields no usable terms, the failure reads `no terms to fetch`.

## Acceptance criteria
Tests are in `scripts/fetch-data/*.test.ts` with mocked fetch and no network, unless noted.
- [ ] AC1 **Deny-list (fixture):** a fixture with meetings in `BOS`/`DEPT`, `XCR`/`ROOM`, `MSI`/`NA`, `NY-FND`/`OS1`…`OS5`, `SL`/`tba` and a real `SL`/`117`. The output has only `SL-117` among those. One warning reads `Excluded 9 placeholder rooms (<M> meetings): BOS-DEPT, MSI-NA, NY-FND-OS1, …`.
- [ ] AC2 **Room patterns don't over-match:** rooms `NA1`, `ROOM 5`, `OS`, `105A` and `DEPT2` are **kept**, while `os12` and ` NA ` (with spaces) are excluded.
- [ ] AC3 **Counts and campus:** in the AC1 fixture, the excluded meetings are not in `meetingCount` or `roomedMeetingCount`. A building whose only other-campus sections are placeholder meetings gets no multi-campus warning.
- [ ] AC4 **Deny-list validation:** a deny-list with an invalid regex (`"^(OS$"`), an empty `roomPatterns`, or an extra key makes `main()` exit 1 naming the problem.
- [ ] AC5 **Warnings on failure:** a run with an unknown campus name **and** a failing per-term room-drop guard exits 1. Its stdout still contains the `::warning::` line naming the unknown campus, printed before the failure message.
- [ ] AC6 **`--today`:** `2026-13-45`, `2026-02-29`, `2026-11-1` and `tomorrow` each exit 1 with `Invalid --today: <value>`, and the mocked fetch is called 0 times. `2028-02-29` is accepted.
- [ ] AC7 **Retry-After:** `Retry-After: 301` → the run fails without sleeping (the injected sleep is never called with ≥ 301,000). `Retry-After: 300` → sleeps 300,000 ms, then retries. An HTTP-date 10 minutes ahead → fails.
- [ ] AC8 **Page cap:** a term whose mocked pages never end (always 500 rows, `totalCount` 60,000) fails after exactly 100 `searchResults` requests, with a message naming the term.
- [ ] AC9 **Corrupt existing file:** an existing file containing `{not json` and one failing `validateSchedule` each exit 1 with the message above, leaving the file byte-identical. With `--force`, the run exits 0, writes the file, and includes a warning that the guards were skipped.
- [ ] AC10 **No terms:** `getTerms` returning only View Only terms (and no existing file) exits 1, and the message contains `no terms to fetch`.
- [ ] AC11 **Live smoke (manual, once, output pasted in the PR):** one `npm run fetch-data -- --out /tmp/schedule.json` with the default ≥ 2 s delay. `jq` on the output shows:
  - none of `BOS-DEPT`, `XCR-ROOM`, `MSI-NA`, `NY-FND-OS1`…`NY-FND-OS5`
  - ≥ 400 rooms.

  Paste the `Excluded …` warning too.
- [ ] AC12: `npm run check` passes. FR-2's existing tests still pass unchanged, apart from the AC10 message text.

## Edge cases
- A real room that happens to be named like a placeholder (for example, a room literally called `NA`) is excluded. That's accepted. Remove the pattern if it's ever reported.
- New placeholder kinds appear in Banner → the summary warning and the room list reveal them. Fix by editing the JSON, not the code.

## Out of scope
- Changing the FR-0 contract
- UI changes
- Excluding whole buildings by name pattern
- Any change to the guards' thresholds.

## Files likely touched
- `scripts/fetch-data/placeholder-rooms.json` (new)
- `scripts/fetch-data/transform.ts`, `scripts/fetch-data/index.ts`, `scripts/fetch-data/banner-client.ts`
- `scripts/fetch-data/*.test.ts`, `scripts/fetch-data/__fixtures__/*.json`

## Open questions
1. Should `NY-FND` be excluded as a whole building, as first suggested? **No.** Exclude only the `OS<n>` rooms (see Solution 1). Revisit if the live run shows other non-room `NY-FND` entries.
