# FR-1 — Project scaffold and shared data contract

**Status:** draft (revision 2)
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
- [ ] AC3: Dependencies installed: `next`, `react`, `react-dom`, `zod`, the Tailwind and shadcn/ui peer deps. Dev dependencies: `typescript`, `eslint` + Next config, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `tsx`. No MongoDB or database packages (`grep -i mongo package.json` prints nothing).
- [ ] AC4: shadcn/ui components are present under `components/ui/`: `button`, `card`, `tabs`, `input`, `badge`, `alert`, `switch`, `skeleton`, `label`.
- [ ] AC5: `npm run build` succeeds. `app/page.tsx` and `README.md` do **not** exist (they're FR-5's and FR-3's).
- [ ] AC5b: `git check-ignore public/data/schedule.json` exits 0 (the local data file is gitignored). `.env.example` contains `NEXT_PUBLIC_DATA_URL=` with a comment: unset means `/data/schedule.json`, and production uses the raw URL of the `data` branch (FR-0).
- [ ] AC6: `lib/data/schema.ts` exports a Zod `scheduleFileSchema` matching the FR-0 contract exactly, plus the inferred types `ScheduleFile`, `Term`, `Campus`, `Building`, `Room`, `Meeting`, `Calendar`, `NoClassDate`, `ExamPeriod`.
- [ ] AC7: `lib/data/schema.ts` exports `validateSchedule(json: unknown): { ok: true; data: ScheduleFile } | { ok: false; errors: string[] }`. It runs the Zod parse and then every invariant listed in FR-0. Unit tests show:
  - a valid fixture passes
  - each invariant failure produces a specific error: unknown roomId, unknown building, unknown campus, wrong roomCount, `days` 0 or 128, `start ≥ end`, `end` 1441, `startDate > endDate`, bad date format, invalid timezone, `roomedMeetingCount > meetingCount`, empty exam-period `partsOfTerm`.
- [ ] AC8: `lib/data/campuses.ts` exports `CAMPUSES` with exactly the 17 rooms-capable campuses from the research table (BOS, BRD, BRL, DDH, NAH, PTL, NYC, ARL, CHL, MIA, TOR, LDN, OAK, SFR, SJO, SEA, VAN). Each entry has `code`, `name`, `timezone`, `region` (`"USA" | "CAN" | "UK"`) and `bannerNames` (the description strings Banner uses, e.g. `["Portland, Maine", "Portland Maine"]`). Unit test: every timezone is accepted by `Intl.DateTimeFormat`, TOR/VAN are `CAN`, LDN is `UK`, and OAK/SFR/SJO/SEA are `America/Los_Angeles`.
- [ ] AC9: `lib/data/campuses.ts` exports `campusFromBannerName(name: string): Campus | null`. It's case-insensitive and ignores punctuation and extra spaces. `"Online"`, `"No campus, no room needed"` and unknown names return `null` (unit tested).
- [ ] AC10: Vitest picks up `**/*.test.ts` and `**/*.test.tsx` under `lib/`, `components/` and `scripts/`. Component tests opt in to jsdom with `// @vitest-environment jsdom`.

## Edge cases
- `app/` with only `layout.tsx` must still build (it gives a 404 at `/` until FR-5).
- `lib/data/` is deliberately not `lib/schemas/`, which would map to the MongoDB skill.

## Out of scope
- Any page UI, the fetch logic, free-room logic, or CI workflows.

## Files likely touched
- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`, `vitest.config.ts`, `postcss.config.mjs`, `components.json`, `.gitignore`, `.nvmrc`, `.env.example`
- `app/layout.tsx`, `app/globals.css`, `app/favicon.ico`
- `components/ui/*.tsx`, `lib/utils.ts`
- `lib/data/schema.ts`, `lib/data/schema.test.ts`, `lib/data/campuses.ts`, `lib/data/campuses.test.ts`, `lib/data/__fixtures__/valid-schedule.json`

## Open questions
1. Next.js 15 or 16? **Whichever is current stable on the day of the build.** No feature here depends on the version.
