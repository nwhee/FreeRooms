# Decision log

| Date | Ticket | Decision | Who agreed |
|---|---|---|---|
| 2026-11-08 | brief | Static JSON plus a nightly job, no database. All campuses, Boston first. Classes only (no events). v1 adds "free until", time travel, and CPS/Law coverage. Stack: Next.js App Router, TypeScript, Tailwind, shadcn/ui, Vercel. | User |
| 2026-11-09 | FR-0, FR-3, FR-5, FR-7 | **Deploy model:** the nightly job commits `schedule.json` to a dedicated `data` branch, and the UI fetches it at runtime from `NEXT_PUBLIC_DATA_URL` (raw.githubusercontent.com). Data refreshes need no production deploy. Code deploys go only through `scripts/deploy/`, run by a human. Rejected: Vercel auto-deploy on `main`. | User |
| 2026-11-09 | FR-0, FR-3 | The repo `nwhee/FreeRooms` will be public, so the raw data URL needs no auth. | User |
| 2026-11-09 | FR-0, FR-4, FR-6 | **Exam rule:** the main exam period hides only recurring part `"1"` meetings, and the Law exam window hides only `"1L"`. Other parts stay busy, accepting false-busy over false-free. | User |
| 2026-11-09 | FR-0 | The specs were approved with the recommended defaults after the vp-product fix round, and the final fixes were applied with no third review round. | User |
| 2026-11-08 | FR-0 | CPS and Law are covered by fetching every term not marked View Only and keeping every `partOfTerm`, with no filtering by suffix. Times are campus-local, with one IANA timezone per campus. | product-manager, vp-product (consensus; approved by user 2026-11-09) |
| 2026-11-08 | FR-1 | The data contract lives in `lib/data/` (not `lib/schemas/`, which maps to the MongoDB skill). FR-1 owns every dependency and npm script. | product-manager, vp-product (consensus; approved by user 2026-11-09) |
| 2026-11-08 | FR-6 | Academic calendars are checked-in JSON files keyed by term year (`termYear` = first 4 digits of the term code, e.g. `2026-2027.json` → `2027`). A missing file gives a fetch warning and a GitHub issue. | product-manager, vp-product (consensus; approved by user 2026-11-09) |
| 2026-11-08 | FR-2 | 48 h rewrite rule: the fetch writes the file when the content changes, or as a heartbeat when the existing `generatedAt` is at least 48 h old, so the 72 h stale banner only fires when runs are actually failing. | product-manager, vp-product (consensus; approved by user 2026-11-09) |
| 2026-11-08 | FR-0, FR-4 | Calendar suppression (no-class dates and exam periods) applies to recurring meetings only. One-day meetings always count. | product-manager, vp-product (consensus; approved by user 2026-11-09) |
