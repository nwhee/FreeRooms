# QA report FR-2 (qa-tester; saved by manager because the harness blocked QA writing it)

VERDICT: PASS_WITH_NOTES — all ACs (AC1–AC14, AC5b, AC6b) pass. No new Banner calls were made by QA. Evidence: FR-2 unit tests (98, verbose), QA's own `main()` runs against the in-memory fake Banner (probe.mts → probe-out.txt, cal.mts), and checks on the one live run's output (live.mts → live-out.txt).

Key results:
- AC5/AC5b guards: vanished term (totalCount 0, and missing from getTerms) exits 1 with file byte-identical; room drop 150→70/74 exits 1, 150→75 passes; 12-21 transition with 600+150→160 exits 0; `--force` overrides; `--dry-run` still exits 1 on a failing guard.
- AC8 write rule: same content 47 h → "No change; not writing.", 48 h and 49 h → rewritten; changed content rewritten; minified, sorted.
- AC12 live (2026-11-10T03:00Z): exit 0, 42 requests, 322 s; 572 rooms, 8456 meetings, 12 DK-* rooms; partOfTerm 1=8120, 2A=149, 2B=116, 1L=71. 202710: 7307 candidates / 7010 roomed; 202730: 5719 / 2297.
- AC13: validateSchedule ok on the live file (1,229,013 bytes); file is gitignored; diff only under scripts/fetch-data/.
- Privacy: no `@`, no instructor fields; sections fed with instructor names/emails did not reach the output.
- Spot checks: DK-240, SH-205, NY-CH-GHE, WVF-020, RY-157, EL-410, RI-440, EXP-311 plausible; 21 long/odd-hour blocks look like real bookings.

Beyond spec:
- Low: `--today 2026-13-45` is accepted (regex only); should reject impossible dates.
- Low / product: placeholder "rooms" appear as free rooms: BOS-DEPT ("Boston DEPT", 70 meetings), XCR-ROOM ("Unidentified campus ROOM"), MSI-NA, NY-FND-OS1..5 ("Found"). Consider a deny-list.
- Info: an invalid existing file is replaced with comparison guards skipped (warns).
- Info: a missing calendar directory exits 1 (FR-6 loader).
- Info: on 12-21, if Banner still lists Fall, it is fetched (~19 requests) then dropped.
