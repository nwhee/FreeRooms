# QA report FR-5 (qa-tester; saved by manager because the harness blocked QA writing it)

VERDICT: PASS_WITH_NOTES — all 16 ACs pass in a real browser. Playwright `e2e/FR-5.spec.ts`: 43/43 passed (headless Chromium, `next start -p 3100`, fixture data, clock pinned to 2026-11-18T15:00Z, widths 1280 and 375). Screenshots: 15 PNGs in this folder (visual checks and cited findings only; pruned in QA-PRUNE, deleted files remain in git history).

| AC | Result | Evidence |
|---|---|---|
| AC1 loading / error / Retry | pass | skeletons while held; 404, truncated JSON and schemaVersion 2 show "Couldn't load room data" + Retry; Retry recovers (keyboard too). AC1-loading-skeletons-phone.png, AC1-error-missing-file-phone.png |
| AC2 data URL | pass | unset → one GET /data/schedule.json; rebuilt with cross-origin NEXT_PUBLIC_DATA_URL → plain GET, no preflight/cookie, remote data rendered. — |
| AC3 campus tabs | pass | Boston, London, Toronto; Boston selected; London only Devon House. — |
| AC4 per-campus time | pass | Boston 10:00 "Time (Boston time)", London 15:00; 8 card texts equal roomStatusesAt. — |
| AC5 Now / time travel | pass | 14:00 updates results, Now aria-pressed=false; clock +61 s keeps 14:00; Now restores and ticks. — |
| AC6 travel across campuses | pass | 2026-12-02 13:30 kept on London and Toronto. — |
| AC7 free-until text | pass | "Free until 1:35 PM", "Free for the rest of the day". — |
| AC8 rooms-in-use switch | pass | off hides busy; on shows "In use until …"; headers count free only. — |
| AC9 search | pass | "snell", "SL 117", "zzz" → `No rooms match "zzz".` — |
| AC10 header | pass | Covers both terms; "Updated Nov 18, 2026, 2:00 AM" in viewer zone. — |
| AC11 banners | pass | stale 71 h no / 73 h, 95 h "3 days ago" / 97 h "4 days"; no-class Boston 11-11 exact text, not Toronto; exam 12-15 both, 12-08 Law only; outside coverage 12-25; calendar unknown. AC11-stale-stacked-phone.png (banner look, stacked) |
| AC12 incomplete rooms | pass | 2027-02-03 exact sentence (30%); Fall none; edited Fall 50%. — |
| AC13 no free rooms | pass | Toronto 10:00 "No free rooms at this time." AC13-no-free-rooms-phone.png |
| AC13b roles | pass | 3 role=status, no app role=alert; error uses role=alert; no local cn. (Next's route announcer also has role=alert — excluded in the e2e query.) |
| AC14 manual (fixture) | pass | no horizontal scroll at 375 in all states; tabs, Now, Retry, date, time, search all 44 px; 9-campus overflow scrolls inside the tab list; no muted-on-muted text; full keyboard pass incl. **TabsContent 3 px focus ring re-captured via Tab from trigger** (AC14-kbd-2-tabpanel-focus-ring-phone.png). |
| AC15 runtime fetch | pass | `○ /` static; no "meetings" in .next/static or HTML; edited JSON shows on reload without rebuild. |
| AC16 check + build | pass | check exit 0 (270 tests); build exit 0. |

Beyond spec:
- Low: error state renders no page header (only alert + footer). AC1-error-missing-file-phone.png
- Low: switch visual 32×18 px (tap area ~56×34 via after: inset; label also toggles). Not on the 44 px list.
- Info: date/time inputs have one Tab stop per segment (Chromium default).
- Info: panel focus ring sits flush against content (no padding); still visible.
- Pass: reload resets to Boston/Now; clearing time keeps last valid time; 71-char building name wraps at 375; no console errors on happy path.

Reproduce: see e2e/FR-5.spec.ts header; run with `--workers=1` (the on-disk edit group rewrites public/data/schedule.json and restores it).
