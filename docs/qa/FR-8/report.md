# QA report FR-8 — weekly schedule (qa-tester; saved by manager because the harness blocked QA writing it)

VERDICT: PASS_WITH_NOTES. Branch fr-8-weekly at b03e946; `npm run build` exit 0; `next start` on port 3100; headless Chromium, browser zone America/New_York; no Banner calls (older data copies were route mocks).

| AC | Result | Evidence |
|---|---|---|
| AC1 cron + README headings | pass | one cron line `0 8 * * 1`; README has exactly 7 `##` headings (What it is, Local dev, Weekly update, Semester switch, Yearly chore, Production, Data contract); `### Switch back to nightly` subsection; re-enable instruction; pre-push policy check; every `npm run X` exists |
| AC2 stale boundaries in the browser | pass | 359 h none; 361 h "15 days ago"; 383 h "15 days ago"; 384 h "16 days ago" (—) |
| AC3 no old constants | pass | `grep -rnE "(72|48) \* 60" lib/free-rooms scripts/fetch-data` empty |
| AC4 "nightly" in workflow | pass | only the historical-name comment, `name: nightly-data`, `group: nightly-data`; header, issue body and commit message say weekly |
| AC5 README old wording | pass | matches only historical names and the switch-back subsection |
| AC6 time.ts | pass | no "72"; STALE_AFTER_MS = 360 h; HEARTBEAT_MS = 24 h with `>=` |
| AC7 npm run check | pass | exit 0, 415 tests |
| AC8 browser specs | pass | e2e/V1-real-data.spec.ts 11/11 on real data (14-day mock no banner, 16-day mock banner); e2e/FR-5.spec.ts 43/43 (`--workers=1`, fixture data; AC13b generatedAt 2026-12-03T14:00Z, 361 h before its clock) |

Screenshots: 0 PNGs in this folder. The six copies here were byte-identical duplicates of files in docs/qa/FR-5 and docs/qa/V1 and were removed in QA-PRUNE (they remain in git history); the stale banner look is in docs/qa/FR-5/AC11-stale-stacked-phone.png. Renamed: docs/qa/FR-5/AC11-stale-73h → AC11-stale-361h; docs/qa/V1/4-stale-4-days → 4-stale-16-days.

Notes:
- Low: FR-5 and V1 specs need different files at public/data/schedule.json, so they can't run in one Playwright invocation. Follow-up: serve FR-5's fixture via a route mock.
- Info: workflow line numbers are 3 lower than the spec cites; content matches.
