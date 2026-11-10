# FR-1 — Project scaffold and shared data contract

**Status:** approved by user 2026-11-09 (revision 4: FR-1 code-review consensus, 2026-11-09)
**Owner:** product-manager · **Approved by:** vp-product, <user>
**Depends on:** — · **Blocks:** every other ticket · **Overview:** `docs/specs/FR-0-overview.md`

## Problem
No code exists yet. Every other ticket needs the same stack and one agreed shape for `schedule.json`. Without a single owner for the scaffold, `package.json` and the types get edited by several threads at once and conflict.

## Solution
- Scaffold Next.js (App Router, current stable), TypeScript strict, Tailwind, shadcn/ui and Vitest.
- Install every dependency v1 needs and define every npm script up front.
- Add the data contract from FR-0 as a Zod schema with inferred types, a `validateSchedule` function that checks the invariants, and the campus table with timezones.

## Acceptance criteria
- [ ] AC1: `npm ci && npm run check` exits 0 on a clean clone. `check` runs typecheck (`tsc --noEmit`), lint (`eslint .`) and tests (`vitest run`) in that order and stops at the first failure.
- [ ] AC2: `package.json` scripts include exactly these names: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `check`, `fetch-data`. `fetch-data` = `tsx scripts/fetch-data/index.ts`. `engines.node` is `>=22`, and `.nvmrc` says `22`.
- [ ] AC3: Dependencies installed: `next`, `react`, `react-dom`, `zod`, and the runtime peer deps of Tailwind and the shadcn/ui components. Dev dependencies: `typescript`, `eslint` + Next config, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `tsx`, `@playwright/test`, and the `shadcn` CLI (a dev dependency, not a runtime one). No MongoDB or database packages (`grep -i mongo package.json` prints nothing). Tailwind runs through Next's built-in pipeline, so there's no `postcss.config.mjs`.
- [ ] AC4: shadcn/ui components are present under `components/ui/`: `button`, `card`, `tabs`, `input`, `badge`, `alert`, `switch`, `skeleton`, `label`.
- [ ] AC5: `npm run build` succeeds. `app/page.tsx` and `README.md` do **not** exist (they're FR-5's and FR-3's).
- [ ] AC5b: `git check-ignore public/data/schedule.json` exits 0 (the local data file is gitignored). `.env.example` contains `NEXT_PUBLIC_DATA_URL=` with a comment: unset means `/data/schedule.json`, and production uses the raw URL of the `data` branch (FR-0).
- [ ] AC5c **Missing data URL warning:** `next.config.ts` exports a phase function. Only in `PHASE_PRODUCTION_BUILD` (that is, `next build` with `NODE_ENV=production`; not `next dev`, not Vitest) and only when `NEXT_PUBLIC_DATA_URL` is unset or empty, it prints `console.warn` with a message starting `WARNING: NEXT_PUBLIC_DATA_URL is not set` and ending `the site will fetch /data/schedule.json, which is not deployed. Set it in Vercel and redeploy via scripts/deploy/.` The build still succeeds. Checks:
  - `env -u NEXT_PUBLIC_DATA_URL npm run build` exits 0 and its output contains `WARNING: NEXT_PUBLIC_DATA_URL is not set`.
  - `NEXT_PUBLIC_DATA_URL=https://example.test/s.json npm run build` output doesn't contain it.
  - `npm run check` output doesn't contain it.
- [ ] AC6: `lib/data/schema.ts` exports a Zod `scheduleFileSchema` matching the FR-0 contract exactly, plus the inferred types `ScheduleFile`, `Term`, `Campus`, `Building`, `Room`, `Meeting`, `Calendar`, `NoClassDate`, `ExamPeriod`.
- [ ] AC7: `lib/data/schema.ts` exports `validateSchedule(json: unknown): { ok: true; data: ScheduleFile } | { ok: false; errors: string[] }`. It runs the Zod parse and then every invariant listed in FR-0. Unit tests show:
  - a valid fixture passes
  - each invariant failure produces a specific error: unknown roomId, unknown building, unknown campus, wrong roomCount, `days` 0 or 128, `start ≥ end`, `end` 1441, `startDate > endDate`, bad date format, invalid timezone, `roomedMeetingCount > meetingCount`, empty exam-period `partsOfTerm`, duplicate term/campus/building code or room id, `room.campus` ≠ its building's campus, `meeting.termCode` not in `terms`, and an unknown key at any level (strict schema).
- [ ] AC8: `lib/data/campuses.ts` exports `CAMPUSES` with exactly the 17 rooms-capable campuses from the research table (BOS, BRD, BRL, DDH, NAH, PTL, NYC, ARL, CHL, MIA, TOR, LDN, OAK, SFR, SJO, SEA, VAN). Each entry has `code`, `name`, `timezone`, `region` (`"USA" | "CAN" | "UK"`) and `bannerNames` (the description strings Banner uses, e.g. `["Portland, Maine", "Portland Maine"]`). Unit test: every timezone is accepted by `Intl.DateTimeFormat`, TOR/VAN are `CAN`, LDN is `UK`, and OAK/SFR/SJO/SEA are `America/Los_Angeles`.
- [ ] AC9: `lib/data/campuses.ts` exports `campusFromBannerName(name: string): CampusDefinition | null`, where `CampusDefinition` is the type of a static `CAMPUSES` entry, not the schedule-file `Campus`. It's case-insensitive and ignores punctuation and extra spaces. `"Online"`, `"No campus, no room needed"` and unknown names return `null` (unit tested).
- [ ] AC10: Vitest picks up `**/*.test.ts` and `**/*.test.tsx` under `lib/`, `components/` and `scripts/`. Component tests opt in to jsdom with `// @vitest-environment jsdom`. `playwright.config.ts` exists for browser checks, and Vitest excludes Playwright specs.
- [ ] AC11 **Base accessibility in `app/globals.css`:**
  - In light mode, `--input` and `--ring` each reach at least 3:1 non-text contrast against `--background`. Record the computed ratios in the PR.
  - Focus rings are opaque: no alpha or `/50` opacity on the ring colour.
  - A `@media (prefers-reduced-motion: reduce)` rule turns animations and transitions off or to near zero.
  - `:root` sets `color-scheme: light`. v1 is light-only.

## Edge cases
- `NEXT_PUBLIC_DATA_URL` is inlined into the client bundle at build time. Changing it in Vercel takes effect only after a redeploy, which a human runs through `scripts/deploy/`.
- `app/` with only `layout.tsx` must still build (it gives a 404 at `/` until FR-5).
- `lib/data/` is deliberately not `lib/schemas/`, which would map to the MongoDB skill.

## Out of scope
- Any page UI, the fetch logic, free-room logic, or CI workflows.

## Files likely touched
- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `components.json`, `.gitignore`, `.nvmrc`, `.env.example`
- `next-env.d.ts` is generated by Next and gitignored. No ticket owns it.
- `app/layout.tsx`, `app/globals.css`, `app/favicon.ico`
- `components/ui/*.tsx`, `lib/utils.ts`
- `lib/data/schema.ts`, `lib/data/schema.test.ts`, `lib/data/campuses.ts`, `lib/data/campuses.test.ts`, `lib/data/__fixtures__/valid-schedule.json`

## Open questions
1. Next.js 15 or 16? **Whichever is current stable on the day of the build.** No feature here depends on the version.
