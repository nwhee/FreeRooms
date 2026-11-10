# FreeRooms — project brief

A site that shows which Northeastern classrooms have nothing scheduled in them, now or
at any chosen time. It's inspired by vacantneu.com, with improvements, and it updates
by itself when the semester changes.

## Decisions (from the user, 2026-11-08)

| Topic | Decision |
|---|---|
| Data store | **Static JSON + nightly job.** No database. A scheduled GitHub Action pulls Banner data and commits JSON; the site reads it. |
| Campuses | **All campuses** Banner lists (Boston plus ~10 others), Boston first in the UI. |
| Events (Engage) | **Classes only for v1.** Engage needs a login; revisit later. |
| v1 improvements | **"Free until" + time travel** (pick any day/time). **Include CPS and Law terms** alongside the semester term. |
| Stack | Next.js App Router, TypeScript, Tailwind, shadcn/ui, Vercel (from the Setup kit). MongoDB **not** used. |

## What vacantNEU does (studied 2026-11-08)

- Next.js site loading static files: `/data/schedule.json`, `/data/events.json`,
  `/data/buildings.geojson`. Pages: home (search, campus tabs, rooms by building),
  `/browse`, `/events`, `/map`.
- `schedule.json` shape: `term {code, description}`, `generatedAt`, `campuses[]`
  (code, name, buildingCount, roomCount), `buildings[]` (code, name, campus, roomCount),
  `rooms[]` (id `BLDG-ROOM`, campus, building, room, displayName), `meetings[]`
  (roomId, kind, `days` bitmask, `start`/`end` minutes after midnight, startDate,
  endDate, label, detail), `calendar {noClassDates[], examPeriods[]}`.
  Fall 2026: 565 rooms, 6,930 meetings, 67 buildings, 11 campuses.
- Weaknesses found:
  - It reads **one term only** (202710 Fall 2026 Semester). CPS quarter and Law
    classes in the same rooms are missed, so some rooms show as free when they aren't.
  - Its events file was last generated 2026-09-06 and matched only 18 of 238 events to rooms.
  - It only answers "right now". You can't ask about a future time.
  - Room cards say "Open / Nothing else scheduled today" but not how long a room stays free.
- Reddit thread (r/NEU 1wbsaaq) couldn't be read: reddit.com is blocked for our tools.

## Data source: Banner (public, no login)

Base: `https://nubanner.neu.edu/StudentRegistrationSsb/ssb`

1. `GET classSearch/getTerms?searchTerm=&offset=1&max=50` lists terms, e.g.
   `202730 Spring 2027 Semester`, `202710 Fall 2026 Semester`,
   `202655 Summer 2026 CPS Quarter (View Only)`. Codes ending 10/30/40/50/60 are semesters;
   others include CPS quarters and Law. Check the full list for Law term naming.
2. `POST term/search?mode=search` with `term=<code>` (keep the session cookie).
3. `GET searchResults/searchResults?txt_term=<code>&pageOffset=N&pageMaxSize=500`
   pages through every section. Each has `campusDescription` and `meetingsFaculty[].meetingTime`
   with `buildingDescription`, `building`, `room`, `beginTime`/`endTime` ("1030"),
   `startDate`/`endDate` ("01/13/2027"), and day booleans `monday`…`sunday`.
   Spring 2027 already had 8,632 sections on 2026-11-08.
- Be polite: page slowly, retry with backoff, and set a clear User-Agent naming the project.
  Watch for `resetDataForm` being needed between terms.

## Event sources (researched 2026-11-08, not in v1)

Events are **out of scope for v1**. These are the options for later:

- **Scraping Engage with a login: don't.** Engage's own terms (CampusGroups / Ready
  Education, updated 2018) don't ban scraping, but Northeastern Policy 700 bans
  sharing access tokens and makes you responsible for all use under your ID.
- **Engage public iCal feed:** `https://engage.northeastern.edu/ical/northeastern/ical_northeastern.ics`.
  It's linked from the public `/events` page, needs no login, and has `X-PUBLISHED-TTL:PT1H`.
  On 2026-11-08 it had 2,325 events (2026-08-28 to 2027-05-13), 902 of them upcoming.
  **But 820 of the 902 upcoming have `LOCATION: Sign in to download the location`.**
  Only ~70 have a location, using codes like `RY 243`, `SH 105`, `DG 140`, `EXP 202`,
  `RI 238`, `Hastings 105, HS 105`. These would need mapping to Banner building codes.
  Low coverage, but it's official and needs no login.
- **25Live (registrar's room booking system), public anonymous API:**
  `https://25live.collegenet.com/25live/data/northeastern/run/`
  - `spaces.xml` lists the spaces it shows anonymously.
  - `rm_reservations.xml?start_dt=YYYYMMDD&end_dt=YYYYMMDD` returns reservations with
    space, building and start/end times. Event names are mostly `(Private)`.
  - On Tue 2026-11-10 it showed 295 reservations, including events Banner doesn't have.
    It only covers a **subset of rooms**: Behrakis, Churchill, EXP, Forsyth, Hayden,
    West Village H, Ruggles, Hurtig and a few Oakland rooms, but **not Ryder or Snell
    Library**.
  - It's the best "busy" signal for the rooms it covers. We'd show only "booked", never
    the name. Before using it, ask the Registrar (who runs 25Live) whether it's OK,
    and keep the request rate low.
- **calendar.northeastern.edu** runs on Localist and has iCal/RSS feeds. It holds
  university events, not room bookings. Not checked further.
- **Asking for official access:** OIS@northeastern.edu, the Registrar (25Live), or the
  Center for Student Involvement (Engage).

## How the semester switch should work

- The nightly job fetches **every term whose dates overlap today through the next ~120
  days** (current and upcoming semester, CPS quarters, Law), not only "the current term".
- Meetings keep their own `startDate`/`endDate`, so the site filters by the date being
  viewed. When Fall ends and Spring starts, the right classes appear with no code change
  or redeploy.
- No-class dates and exam periods come from the academic calendar (registrar). Find a
  source the job can parse, or keep a small checked-in file per term as a fallback,
  and have the job warn when a term has no calendar entry.
- The UI shows which term(s) the data covers and when it was last updated. If the data is
  more than 3 days old, it shows a warning.
- Times are always America/New_York (Boston), even for other campuses, until the data
  says otherwise. Check the timezone for the NYC/Oakland/Seattle/London/Toronto campuses.
