# FreeRooms

Find an empty classroom at Northeastern: pick a campus, see which rooms have no class
scheduled at the time you chose (now by default), and how long each one stays free.

## What it is

- **Data source:** Northeastern's public Banner class search
  (`nubanner.neu.edu/StudentRegistrationSsb`), read without logging in. Only
  **class meetings** are covered. Events, club bookings and exams outside the class
  schedule are not, so a room shown as free may still be booked.
- **How it works:** a nightly GitHub Actions job turns Banner's class search into one
  static file, `schedule.json`. The Next.js UI downloads that file and works out the
  free rooms in the browser. There's no database and no server-side API.
- **Coverage:** every campus with rooms, Boston first. CPS and Law classes are included
  (see [Semester switch](#semester-switch)). Times are shown in each campus's local
  timezone.

## Local dev

Requires Node 22 (see `.nvmrc`).

```bash
npm ci                 # install exact dependencies
npm run fetch-data     # fetch Banner into public/data/schedule.json (takes a few minutes)
npm run dev            # start the app at http://localhost:3000
npm run check          # typecheck + lint + unit tests; must be green before you commit
```

Other scripts: `npm run build`, `npm run start`, `npm run test`, `npm run typecheck`,
`npm run lint`.

`npm run fetch-data` writes `public/data/schedule.json`, which is gitignored. With no
`NEXT_PUBLIC_DATA_URL` set, the app reads that local file. Pass flags after `--`:

| Flag | What it does |
|---|---|
| `--out <path>` | Write somewhere else (default `public/data/schedule.json`). |
| `--today YYYY-MM-DD` | Pretend today is this date when choosing terms (for testing the semester switch). |
| `--delay-ms <n>` | Wait between Banner requests (default 3000, minimum 1000). Be polite. |
| `--force` | Override the vanished-term and room-drop guards. Only use after checking Banner yourself. |
| `--dry-run` | Do everything except write the file; prints the summary and warnings. |

Example: `npm run fetch-data -- --dry-run --today 2026-12-21`.

The script exits 1 and leaves the existing file untouched when anything looks wrong:
a failed request, an incomplete term, a validation error, or a guard tripping. Warnings
(printed as `::warning::...`) never fail the run.

**Fake room codes:** Banner lists some "rooms" that aren't classrooms (`DEPT`, `TBA`,
`OS1`…). They're dropped using the deny-list in `scripts/fetch-data/placeholder-rooms.json`.
To drop a new kind, add a case-insensitive regex to its `roomPatterns` array (for example
`"^ONLINE$"`). It's a data change, not a code change.

**Without a local fetch,** point the app at the published data instead. Put this in
`.env.local` and restart `npm run dev`:

```bash
NEXT_PUBLIC_DATA_URL=https://raw.githubusercontent.com/nwhee/FreeRooms/data/schedule.json
```

## Nightly update

> **Before you push this workflow to `main` on GitHub:** check Banner's `robots.txt`
> (`https://nubanner.neu.edu/robots.txt`) and Northeastern's acceptable-use policy for
> IT resources, and make sure a nightly automated read of the public class search is
> allowed. **Pushing `.github/workflows/nightly-data.yml` to `main` on GitHub starts the
> nightly runs.** There's no separate switch, so do the check first, and record the
> result in `docs/qa/FR-3/` (see [Production](#production)). To pause it later,
> use **Actions → nightly-data → ⋯ → Disable workflow**.

**When it runs:** every day at 08:00 UTC (03:00 EST / 04:00 EDT), from
`.github/workflows/nightly-data.yml`. One run at a time: an overlapping run waits in a
queue, and nothing gets cancelled.

**What it does:**

1. Checks out the triggering ref (`main` for the nightly run) and runs `npm ci`.
2. Copies the current `schedule.json` from the `data` branch into
   `public/data/schedule.json`, so the fetch script can compare against it. On the very
   first run there's no `data` branch yet, and this step is skipped.
3. Runs `npm run fetch-data`.
4. If the file changed (or the `data` branch doesn't exist yet), commits `schedule.json`
   to the **`data` branch** as `github-actions[bot]`, with the message
   `data: nightly schedule update (YYYY-MM-DD)`. The workflow never pushes to `main`
   and never deploys.
5. Opens, updates or closes the `calendar-missing` issue (see
   [Yearly chore](#yearly-chore)).

The jobs are split so each one gets only the token permission it needs: the fetch job
can only read, the publish job can only write repository contents, and the issue job
can only write issues. The only secret used is the built-in `GITHUB_TOKEN`.

**The `data` branch and the runtime URL:** the `data` branch holds exactly one file,
`schedule.json`. It has no shared history with `main`. The production site downloads it
at runtime from

```
https://raw.githubusercontent.com/nwhee/FreeRooms/data/schedule.json
```

(the `NEXT_PUBLIC_DATA_URL` value; see [Production](#production)). So a data refresh
reaches users within about 5 minutes (GitHub's raw cache), with no deploy.

**Write rule:** the fetch script rewrites the file only when the content (everything
except `generatedAt`) really changed, **or** when the existing file is at least 48 hours
old. That 48 h heartbeat keeps the file fresh while the job is healthy. When nothing
changed, the log says `No change; not writing.`, the job ends green, and there's no
commit.

**Why a failure leaves yesterday's data in place:** if Banner is down, returns a partial
term, or the output fails validation, the fetch exits 1. The job goes red (GitHub emails
the repo owner), and the publish and issue jobs don't run. The `data` branch keeps the
last good `schedule.json`, so the site keeps working on slightly old data instead of
showing every room as free. Two guards catch a bad run that "succeeds": a term that's
still in progress coming back empty (vanished term), or a term's rooms dropping below 50%
of the previous count. The workflow has no `--force` option on purpose. A human checks
Banner and decides.

**Stale banner:** the UI shows a warning when `generatedAt` is more than 3 days (72 h)
old. With the 48 h heartbeat, it only appears when nightly runs have been failing for
about a day or more, so a red run should be fixed within a day or two.

**Running it by hand:** **Actions → nightly-data → Run workflow**, pick a branch, then:

- **`publish` ticked** (the default) **on `main`:** a real run. It pushes to `data` and
  updates the issue, exactly like the nightly run.
- **`publish` unticked, or any branch other than `main`:** a test run. It fetches and
  checks everything, but it doesn't push to `data` and doesn't touch issues. Only `main`
  can publish. A test run prints the calendar warnings and the issue body it would have
  written. Use this to try out workflow changes on a branch.

**If GitHub disabled the workflow:** GitHub turns off scheduled workflows in a public
repo after 60 days with no repository activity. It emails the owner first. Commits to
the `data` branch may not count as activity, so don't rely on them. To turn the workflow
back on, go to **Actions → nightly-data** and click **"Enable workflow"** in the banner.
Then run it once by hand (above) to refresh the data straight away.

## Semester switch

No code change is needed when Fall turns into Spring (or Spring into Summer).

- **Terms are discovered automatically.** Each run asks Banner for its term list and
  fetches every term **not** marked "(View Only)". It also re-fetches any term in the
  existing file that hasn't ended yet, even if Banner has since marked it View Only.
- **Date window:** each term's range runs from its earliest to its latest meeting date
  in Banner. A term is kept only if that range overlaps **today to today + 120 days**
  (today in America/New_York). So the next semester appears once Banner lists it and its
  earliest meeting is within 120 days. The old semester drops out the day after its
  latest meeting.
- **CPS and Law** don't need special handling. Their sections sit inside the semester
  terms (for example 202710 and 202730) and are told apart by `partOfTerm` (`1`, `1L`,
  `2A`, `2B`, `3A`…). Every part of term is kept.
- **The room-drop guard compares a term only with itself**, so Fall's rooms leaving the
  file at the end of the semester doesn't trip it.
- **"Room assignments incomplete" banner:** early on, Banner often lists next semester's
  classes before rooms are assigned. If fewer than 80% of a term's in-person meetings
  have a room, the UI shows a banner such as *Room assignments for Spring 2027 Semester
  are incomplete (30% assigned)*. Rooms without assignments can look free, so treat
  results with care. The banner goes away on its own as the registrar assigns rooms.

## Yearly chore

Once a year, add the next academic calendar so holidays, breaks and exam periods don't
show classes that aren't meeting.

1. Download the registrar's academic calendar PDF for the year (for example
   [2026-2027](https://registrar.northeastern.edu/wp-content/uploads/sites/9/2026-2027-Academic-Calendar.pdf)).
2. Add `data/calendar/<YYYY-YYYY>.json` (for example `data/calendar/2027-2028.json`,
   with `termYear` `"2028"`), using the format in
   [docs/specs/FR-6.md](docs/specs/FR-6.md#source-file-shape-datacalendaryyyy-yyyyjson).
   Copy `data/calendar/2026-2027.json` as a starting point.
3. Run `npm run check`, which loads and validates every file in `data/calendar/`, then
   merge to `main`.

**You'll be reminded.** When a fetched term has no calendar file, the nightly run opens
a GitHub issue titled **Academic calendar file missing** (label `calendar-missing`),
listing the terms and the file it expected. Later runs update that issue, and the first
run after you add the file closes it automatically. Until then the site still works, but
it doesn't know about holidays or finals for that term.

## Production

- **Agents never deploy.** Code changes ship only through the scripts in
  `scripts/deploy/`, and a human runs them. The deploy script, `scripts/deploy/deploy.sh`,
  is drafted in FR-7 (`docs/deploy-drafts/deploy.sh`), and a human installs it.
- **Data refreshes don't need a deploy.** The nightly job only updates the `data`
  branch, and the live site reads it at runtime.
- **One-time setup (a human does this):** in the Vercel project settings, set

  ```
  NEXT_PUBLIC_DATA_URL=https://raw.githubusercontent.com/nwhee/FreeRooms/data/schedule.json
  ```

  for the Production environment. The repo **must stay public**, because the site reads
  the raw URL with no authentication.
- **The value is inlined at build time.** Setting or changing `NEXT_PUBLIC_DATA_URL`
  doesn't affect the running site until the next build. **After setting or changing it,
  a human must redeploy through `scripts/deploy/deploy.sh`.** A build without it prints a
  loud `WARNING: NEXT_PUBLIC_DATA_URL is not set`, and the site would then look for a
  local `/data/schedule.json` that doesn't exist in production.
- **Before pushing the workflow to `main` on GitHub:** check Banner's `robots.txt`
  (`https://nubanner.neu.edu/robots.txt`) and Northeastern's acceptable-use policy for IT
  resources. Pushing `.github/workflows/nightly-data.yml` to `main` starts the nightly
  runs, so this check comes first. Record the result (date, what you checked, the
  outcome) in `docs/qa/FR-3/`.
- **Bootstrap order:** run the workflow once by hand **from `main`** with `publish`
  ticked, so the `data` branch exists. From any other branch it's a test run and creates
  no `data` branch. Check that the raw URL above serves the file, then set the env var
  and redeploy.
- **Testing workflow changes:** use **Run workflow** with **`publish` unticked**, **or**
  run it from a branch other than `main`. Either way the test never changes production
  data.

## Data contract

The format of `schedule.json` (schemaVersion 1), the definitions of "free", "free until",
"stale" and "incomplete", and where every file lives are in
[docs/specs/FR-0-overview.md](docs/specs/FR-0-overview.md). The Zod schema that enforces
the contract is `lib/data/schema.ts`.
