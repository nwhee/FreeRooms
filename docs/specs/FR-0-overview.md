# FR-0 — FreeRooms v1 overview and data contract

**Status:** approved by user 2026-11-09 (revision 3)
**Owner:** product-manager · **Approved by:** vp-product, <user>

Sources: `docs/brief.md` (user decisions, 2026-11-08) and the Banner research notes of
2026-11-08. Where the two differ, the research wins. This doc records those corrections.

## Problem
Northeastern students want an empty classroom to study or meet in. Today they walk the
halls, or use vacantneu.com, which:
- reads only one term, so CPS and Law classes go missing and some rooms show as free when they aren't
- answers only "right now"
- doesn't say how long a room stays free.

**We'll know it's solved when** a student can open the site, pick their campus, and see
which rooms have no class scheduled at the time they chose (now by default) and how long
each stays free. The data must refresh itself every night and switch semesters with no
code change.

## User stories
1. As a student on campus, I open the site and see the free rooms at my campus right now, grouped by building, each with "Free until 2:50 PM".
2. As a student planning ahead, I pick next Tuesday at 2 PM and see what's free then.
3. As a student, I search "snell" and see only Snell Library rooms.
4. As a student at the Vancouver or London campus, "now" and the times shown are my campus's local time.
5. As a student on a holiday or during finals, a banner tells me the class schedule doesn't apply (or might not), so I'm not misled.
6. As a student, I can see which terms the data covers and when it was last updated. I get a warning if it's more than 3 days old, or if a term's room assignments are incomplete.
7. As the maintainer, I never touch the code when Fall turns into Spring. Once a year I add one calendar file. If I forget, a GitHub issue reminds me.

## Corrections to the brief
| Brief said | v1 does | Why |
|---|---|---|
| Fetch CPS and Law as extra terms | Fetch **every term not marked "(View Only)"** (any suffix) and keep every `partOfTerm` | From Fall 2026, CPS and Law sections sit inside 202710/202730 and are told apart by `partOfTerm`. Legacy separate-term suffixes (12/14/15/…) are handled by not filtering on suffix at all. |
| Find a calendar source the job can parse | Checked-in JSON per academic year (FR-6) | The Trumba feeds return 410 or 404, and the PDF is unordered text. |
| Times are always America/New_York | **Each campus has its own IANA timezone.** "Now" and the picker are evaluated in the selected campus's zone | Banner times are local to each campus (London 0900–1530, Oakland 0845–1800, and so on). |

## Deploy and data model — DECIDED by user 2026-11-09
CLAUDE.md says production changes go only through `scripts/deploy/`, which a human runs.
So v1 must not rely on "Vercel deploys on every push". The user chose this model
(repo `nwhee/FreeRooms`, public):
- **Data is decoupled from deploys.** The nightly workflow (FR-3) commits `schedule.json` to the root of a dedicated **`data` branch**. It never commits to `main`.
- **The UI fetches the schedule at runtime** from `process.env.NEXT_PUBLIC_DATA_URL` (FR-5):
  - In production a human sets it in Vercel to `https://raw.githubusercontent.com/nwhee/FreeRooms/data/schedule.json`.
  - `NEXT_PUBLIC_*` values are **inlined at build time**, so after setting or changing it in Vercel, the human must **redeploy through `scripts/deploy/`** (FR-7) for it to take effect. A production build without it logs a loud warning (FR-1 AC5c).
  - When it's unset, the UI falls back to `/data/schedule.json`, so local dev and tests use the local file that FR-2 writes. That file is gitignored.
- A data refresh therefore needs **no production deploy**. Code changes still ship only through `scripts/deploy/`.
- Agents never set production env vars. The human sets `NEXT_PUBLIC_DATA_URL` once.

**Alternative (rejected):** commit data to `main` and let Vercel auto-deploy on push. This would need CLAUDE.md's production rule amended.

## Definitions (normative; FR-4 implements them, FR-5 displays them)
All dates and times are **campus-local wall-clock**: a date `D` as `YYYY-MM-DD` and a minute `M` (0–1439) in the selected campus's timezone.

**Timezone data:** campus local time ("now") follows the runtime's IANA tzdata (`Intl`). Under tzdata 2026c, British Columbia is on permanent UTC-7 from March 2026, so Vancouver no longer matches Los Angeles in winter. A browser or Node with older tzdata may show Vancouver's "now" an hour off. That's accepted for v1. Meeting times themselves are stored as wall-clock and aren't affected.

- **Meeting occurs on D** if `startDate ≤ D ≤ endDate` and the weekday bit for D is set in `days`.
- **One-day meeting:** `startDate == endDate`. It is an explicit booking and **always counts**. Calendar suppression never removes it.
- **Suppressed (recurring meetings only, where `startDate < endDate`):**
  - **No-class date:** D falls in a `noClassDates` entry whose `campuses` includes the room's campus.
  - **Exam period:** D falls in an `examPeriods` entry whose `partsOfTerm` contains the meeting's `partOfTerm`.
- **Exam-period rule — DECIDED by user 2026-11-09:**
  - The main exam period suppresses only `partOfTerm` `"1"` (full term).
  - The Law exam window suppresses only `"1L"`. Fall 1L meetings already end 12/04, before the 12/07 window opens, so in practice this mostly matters for future terms.
  - Every other part of term (2A, 2B, 3A–3C, …) stays busy during finals.
  - *Trade-off:* some CPS sessions that don't actually meet in finals week will show as **busy** (false-busy). Suppressing everything would instead risk showing rooms as **free** when a class meets (false-free). We prefer false-busy.
- **Counted meeting:** occurs on D and isn't suppressed.
- **Busy at (D, M):** some counted meeting for the room has `start ≤ M < end`. End is exclusive.
- **Free at (D, M):** not busy.
- **Free until:** the smallest `start` of a counted meeting on D with `start > M`. If there's none, the room is **"free for the rest of the day"** (until local midnight). We never look past midnight.
- **In use until:** for a busy room, the end of the block of counted meetings that contains M. Blocks merge when the next meeting's `start ≤` the current block's `end`.
- **In coverage:** D falls inside at least one `terms[]` range.
- **Calendar known:** a term covering D has its year prefix (first 4 digits of `code`) in `calendar.termYears`.
- **Incomplete room assignment:** a term covering D has `meetingCount > 0` and `roomedMeetingCount / meetingCount < 0.80`.
- **Stale:** `now − generatedAt > 72 hours`, measured with the viewer's clock.

## Data contract (`schedule.json`, schemaVersion 1)
FR-2 writes one minified file:
- locally to `public/data/schedule.json` (gitignored)
- by FR-3 to `schedule.json` on the `data` branch.

The Zod schema and TS types live in `lib/data/schema.ts` (FR-1). Arrays are sorted as noted so diffs stay meaningful.

```ts
type ScheduleFile = {
  schemaVersion: 1;
  generatedAt: string;               // ISO 8601 UTC
  terms: {                           // sorted by code
    code: string;                    // "202710"
    description: string;             // "Fall 2026 Semester" (" (View Only)" stripped)
    startDate: string;               // min meeting startDate in the term (all meetings, roomed or not)
    endDate: string;                 // max meeting endDate
    partsOfTerm: { code: string; startDate: string; endDate: string }[]; // sorted by code
    meetingCount: number;            // in-person candidate meetings: times + ≥1 day + physical campus + building ≠ VTL
    roomedMeetingCount: number;      // of those, building and room both non-null (≤ meetingCount)
  }[];
  campuses: {                        // only campuses with ≥1 room; BOS first, then by name
    code: string; name: string;
    timezone: string;                // IANA, e.g. "Europe/London"
    buildingCount: number; roomCount: number;
  }[];
  buildings: { code: string; name: string; campus: string; roomCount: number }[]; // sorted by code
  rooms: {                           // sorted by id
    id: string;                      // "<building>-<room>", e.g. "SL-117"
    campus: string; building: string; room: string;
    displayName: string;             // "Snell Library 117"
  }[];
  meetings: {                        // sorted by roomId, startDate, start, end, termCode
    roomId: string;
    days: number;                    // bitmask Mon=1 Tue=2 Wed=4 Thu=8 Fri=16 Sat=32 Sun=64 (1..127)
    start: number;                   // minutes after local midnight ("1030" -> 630)
    end: number;                     // start < end ≤ 1440
    startDate: string;               // "YYYY-MM-DD", campus-local
    endDate: string;                 // ≥ startDate
    partOfTerm: string;              // "1", "1L", "2A", "2B", "3A", "3B", "3C", ...
    termCode: string;
  }[];
  calendar: {
    termYears: string[];             // e.g. ["2027"]
    noClassDates: { start: string; end: string; label: string; campuses: string[] }[]; // inclusive, codes expanded
    examPeriods:  { start: string; end: string; label: string; partsOfTerm: string[] }[];
  };
  warnings: string[];                // fetch-time warnings (debugging and FR-3's issue step)
};
```

Invariants (checked by `validateSchedule` in FR-1):
- every `meeting.roomId` is in `rooms`
- every `room.building` is in `buildings`
- every `building.campus` and `room.campus` is in `campuses`
- counts match
- `days` is in 1..127
- `0 ≤ start < end ≤ 1440`
- `startDate ≤ endDate`
- dates match `YYYY-MM-DD`
- `timezone` is accepted by `Intl.DateTimeFormat`
- `0 ≤ roomedMeetingCount ≤ meetingCount`
- `partsOfTerm` in exam periods is non-empty
- term codes, campus codes, building codes and room ids are each unique
- every `room.campus` equals its building's `campus` (one campus per building; FR-2 picks it)
- every `meeting.termCode` is in `terms`
- every campus in `campuses` has ≥ 1 room
- the schema is **strict**: unknown keys are rejected at every level.

Size budget: about 2–3 MB minified. FR-2 warns if the file is over 5 MB.

## Where files live
| Path | What | Owner |
|---|---|---|
| `public/data/schedule.json` | Local output of `npm run fetch-data`, **gitignored** | written by FR-2's script; not tracked on main |
| `data` branch: `schedule.json` | Production data, committed nightly | FR-3 (workflow) |
| `data/calendar/<YYYY-YYYY>.json` | Hand-maintained academic calendar, one per academic year | FR-6 |
| `lib/data/` | Contract schema, types, campus table | FR-1 |
| `lib/free-rooms/` | Pure free-room logic | FR-4 |

## Tickets, dependencies, file ownership
| Ticket | Title | Depends on | Owns (no file is owned by two tickets) |
|---|---|---|---|
| FR-1 | Scaffold + data contract | — | `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `components.json`, `.gitignore`, `.nvmrc`, `.env.example`, `app/layout.tsx`, `app/globals.css`, `app/favicon.ico`, `components/ui/**`, `lib/utils.ts`, `lib/data/**` |
| FR-6 | Academic calendar 2026-27 + loader | FR-1 | `data/calendar/**`, `lib/calendar/**` |
| FR-4 | Free-room logic library | FR-1 | `lib/free-rooms/**` |
| FR-2 | Banner fetch script | FR-1, FR-6 | `scripts/fetch-data/**` |
| FR-5 | UI | FR-1, FR-4 | `app/page.tsx`, `components/free-rooms/**` |
| FR-3 | Nightly workflow + README | FR-2 | `.github/workflows/nightly-data.yml`, `README.md` |
| FR-7 | Deploy script draft (human installs it) | FR-3 | `docs/deploy-drafts/deploy.sh` |

Waves: **1:** FR-1 → **2:** FR-4 and FR-6 in parallel → **3:** FR-2 and FR-5 in parallel → **4:** FR-3 → **5:** FR-7.

The decision log is in `docs/decisions.md`.

Unowned: `next-env.d.ts` (generated by Next, gitignored). There's no `postcss.config.mjs`.

**QA files (per ticket):** QA owns `e2e/FR-<n>.spec.ts` and `docs/qa/FR-<n>/` for each ticket `FR-<n>`. The QA evidence (report and screenshots) is committed with its ticket. These paths never overlap with doer-owned files.

Rules that keep ownership clean:
- FR-1 installs **every** npm dependency v1 needs and defines every npm script, so no later ticket edits `package.json`. If a later ticket needs a new dependency, it stops and raises it as an open question.
- FR-1 deletes the scaffold's `app/page.tsx` and `README.md`. They belong to FR-5 and FR-3.

## Out of scope for v1
- Events (Engage, 25Live)
- Map view, `/browse` page
- Room capacity or features
- Shareable URLs for a chosen time
- Accounts
- Any database
- Any production deploy or production env var change by an agent.

## Open questions (recommended default in **bold**)
1. Deploy model: **DECIDED by user 2026-11-09:** `data` branch + `NEXT_PUBLIC_DATA_URL`.
2. Exam periods: **DECIDED by user 2026-11-09:** only part `"1"` in the main period, and `"1L"` in the Law window.
3. Repo visibility: **DECIDED by user 2026-11-09: `nwhee/FreeRooms` is public**, so raw.githubusercontent.com serves the data with no auth and with permissive CORS.
4. In time-travel mode, when the user switches campus, does the picked time stay as the same wall-clock time or the same instant? **The same wall-clock date and time, read in the new campus's zone.**
5. raw.githubusercontent.com caches for about 5 minutes. Is that acceptable? **Yes.** The data changes nightly.
