# QA report FR-2b (qa-tester; saved by manager because the harness blocked QA writing it)

VERDICT: PASS_WITH_NOTES — every AC (AC1–AC10, AC1b, AC8b) passes in the committed tests (133 fetch-data tests) and in QA's own `main()` runs against the fake Banner (probe.mts → probe-out.txt: ALL OK). No Banner calls by QA.

- AC1/AC1b/AC2: deny-list excludes DEPT, NA, N/A, ROOM, TBA, TBD, OS<n> (case-insensitive, trimmed); keeps AUD, BLBX, DS, GHE, GHW, THTR, NA1, `ROOM 5`, OS, 105A, DEPT2; truncation "…and 5 more".
- AC3: placeholder meetings count in meetingCount, not roomedMeetingCount; no spurious multi-campus warning.
- AC4: invalid regex, empty list, extra `buildingCodes` key, non-JSON, empty pattern → exit 1, 0 requests.
- AC5: `::warning::` printed before `Error:` in one ordered log; file byte-identical.
- AC6: impossible `--today` values rejected with `Invalid --today: <value>`; 2028-02-29 accepted.
- AC7/AC8: Retry-After cap (301 fails, 300 sleeps, HTTP-date cases); page cap at exactly 100 requests.
- AC8b: re-fetch recovers (exit 0, warning, dropped section present); still short → exit 1 after exactly one re-fetch; two-term case OK; every sleep ≥ configured delay.
- AC9 live (fr2b-live-run-2.log, 2026-11-10T08:25Z, exit 0, 42 requests, 290 s): excluded exactly BOS-DEPT, MSI-NA, NY-FND-OS1..5, XCR-ROOM (168 meetings); 564 rooms (window 536–592); six real no-digit rooms present; validateSchedule ok; 0 `@`. Roomed counts fell by exactly 168 (202710 7010→6907, 202730 2297→2232) while meetingCount unchanged.
- AC10: npm run check exit 0, 406 tests.

Notes (low):
1. Re-fetch warning text differs from the spec's Solution 5 wording (AC8b only requires a warning naming the term).
2. A second FR-2 assertion changed (shortfall test now expects two passes) — follows from AC8b; AC10 wording should allow it.
3. Committed tests cover AC8b cases 1–2; case 3 and "sleep ≥ delay" covered only by QA probes.
4. The re-fetch path has not yet run against live Banner (second live run had no shortfall).
