# QA report V1 — final check on real Banner data (qa-tester; saved by manager because the harness blocked QA writing it)

VERDICT: PASS_WITH_NOTES. `main` at af83aef, `npm run build` exit 0 (`/` static, no "meetings" in .next/static), `next start`, headless Chromium at 1280 and 375, browser zone America/New_York. Data: real `public/data/schedule.json` (generatedAt 2026-11-10T08:25:02Z, 564 rooms, 8,299 meetings, terms 202710 + 202730). No Banner calls; the stale check used a route-mocked copy.

`e2e/V1-real-data.spec.ts` (11 tests) uses its own oracle written from the FR-0 definitions (not lib/free-rooms); it reads the data file at run time and skips when the file is absent.

| # | Check | Result |
|---|---|---|
| 1 | Now mode, Boston first, 80/386 free at Tue 2026-11-10 10:00; all 386 cards equal the oracle at both widths. Spot checks: BK-025 "Free for the rest of the day"; 271-252 "In use until 11:20 AM"; BK-007 "Free until 5:45 PM" | pass |
| 2 | Time travel: Wed 11-18 10:00 vs 18:00 (218 vs 137 busy, all cards match); 2027-02-03 "…incomplete (39% assigned)…"; 2026-11-26 Fall-break no-class banner; 2026-12-15 Law + final exam banners | pass |
| 3 | 12 campus tabs (BOS, ARL, BRL, CHL, MIA, NYC, OAK, PTL, SEA, SJO, TOR, VAN), campus-named time labels, room counts and every card match the oracle in campus local time; none of the 8 placeholder ids appear | pass (London absent from data) |
| 4 | Header "Covers: Fall 2026 Semester, Spring 2027 Semester", "Updated Nov 10, 2026, 3:25 AM"; no stale banner on real data; 4-day-old mock shows "…last updated 4 days ago…" | pass |
| 5 | Search "Snell" → Snell Engineering Center + Snell Library; "Ryder" → Ryder Hall; no horizontal scroll at 375 (tab list scrolls internally) | pass |
| 6 | No console errors, no failed requests; schedule.json 1,205,983 B raw / 55 KB gzipped; local results at 147 ms; throttled (1.6 Mbps, 150 ms RTT, 4× CPU) results at 2.35 s | pass |

Beyond the brief:
- Medium (data): no London campus in the real Banner output, although the calendar lists LDN for breaks. Likely London sections are unroomed/online this term; to be confirmed.
- Low: at 375 px long campus names wrap the date/time labels to two lines. 3-campus-VAN-phone.png
- Info: schedule.json served with `Cache-Control: public, max-age=0` locally.

Screenshots: 1 PNG in this folder (the cited finding above; text and data checks rely on the Playwright assertions). Pruned in QA-PRUNE; deleted files remain in git history.
