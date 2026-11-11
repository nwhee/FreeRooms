# FR-3 — Weekly data workflow and README

**Status:** revision 6: schedule changed to **weekly** by user decision 2026-11-11, implemented in FR-8. Revision 5 was corrected to match the build by user decision 2026-11-11.

> **Historical names:** the workflow file stays `.github/workflows/nightly-data.yml`, and the concurrency group and Actions UI name stay `nightly-data`, so links, history and the 60-day re-enable path don't break. The names are historical; the schedule is weekly.
**Owner:** product-manager · **Approved by:** user (2026-11-09 and 2026-11-11). On revision 4, vp-product endorsed the content but asked for user sign-off, and security-reviewer called it stricter. The user gave that sign-off by deciding on 2026-11-11 that the spec follows the build.
**Depends on:** FR-2 · **Overview:** `docs/specs/FR-0-overview.md`

> **Deploy model DECIDED by user 2026-11-09.** Data is published to a dedicated `data`
> branch of the public repo `nwhee/FreeRooms` and read at runtime through
> `NEXT_PUBLIC_DATA_URL`, so a data refresh is not a production deploy. The
> alternative, auto-deploy on `main`, was rejected.

## Problem
The data must refresh every week and follow the semester change with no human action, and without a production deploy (CLAUDE.md: production changes go only through `scripts/deploy/`, run by a human). The maintainer must also hear about problems that need a human, such as a missing academic calendar. And they need one place that explains how all of this works.

## Solution
- **`.github/workflows/nightly-data.yml`:** three jobs with per-job least privilege.
  - `fetch` runs `npm run fetch-data` against the current `data` branch file.
  - `publish` commits `schedule.json` to the `data` branch when FR-2 rewrote it.
  - `calendar-issue` opens, updates or closes one GitHub issue for calendar warnings.
  - There's no deploy step, and nothing ever pushes to `main`.
- **`README.md`:** covers what FreeRooms is, local dev, the weekly update, the semester switch, the yearly calendar chore, and production.

### Workflow
- Triggers: `schedule: cron "0 8 * * 1"` (**weekly**, Mondays 08:00 UTC = 03:00 EST / 04:00 EDT) and `workflow_dispatch` (unchanged).
- `workflow_dispatch` takes an input `publish` (boolean, default `true`). Scheduled runs always publish.
- Top-level `permissions: {}`. `concurrency: nightly-data` (historical name, kept) with `cancel-in-progress: false`.
- **Write guard:** `publish` and `calendar-issue` run only if `github.ref == 'refs/heads/main'` **and** `publish` is true (or unset, for the schedule). A dispatch from a feature branch, or with `publish: false`, can never write production data or touch issues.
- No secrets or env vars other than `GITHUB_TOKEN`.

**Job `fetch`:**
- `permissions: { contents: read }`
- It's the only job that runs npm code.
- Steps:
  1. `actions/checkout` of the triggering ref with `persist-credentials: false`. Set up `actions/setup-node` with `node-version-file: .nvmrc` and npm cache. Run `npm ci`.
  2. **Seed:** `git fetch origin data`. If that succeeds, `git show origin/data:schedule.json > public/data/schedule.json`. If the branch doesn't exist (first run), skip. No second checkout is made.
  3. `npm run fetch-data`.
  4. Set the job output `changed` to `true` when `public/data/schedule.json` differs from the seeded copy or no seed existed, and `false` otherwise.
  5. Read the calendar warnings (`jq '[.warnings[] | select(contains("has no academic calendar file"))]'`) and set two job outputs: `calendar_warning_count` (an integer) and `issue_body` (the issue text). Print both. This gives dry runs their evidence.
  6. **Only when `changed` is `true`:** upload `public/data/schedule.json` as the artifact `schedule`.

**Job `publish`:**
- `needs: fetch`, `permissions: { contents: write }`
- It runs no npm code: no `npm`, `npx` or `node` scripts from the repo.
- Runs only under the write guard and when `needs.fetch.outputs.changed == 'true'`.
- Steps:
  1. Download the `schedule` artifact. `publish` is the only job that downloads it.
  2. Check out the `data` branch, or create it as an orphan if it's missing.
  3. Copy the file to `schedule.json` at the branch root.
  4. Commit as `github-actions[bot]` with the message `data: weekly schedule update (YYYY-MM-DD)`, where the date is `TZ=America/New_York date +%F`.
  5. `git push origin data`. If the push is rejected: `git pull --rebase origin data`, then push once more. If that also fails, the job fails.

**Job `calendar-issue`:**
- `needs: fetch`, `permissions: { issues: write }`
- It runs no npm code and only runs under the write guard.
- Steps:
  1. Read `needs.fetch.outputs.calendar_warning_count` and `needs.fetch.outputs.issue_body`. It downloads no artifact.
  2. If the count is > 0, find the open issue with label `calendar-missing` (create the label if missing, using `gh label create --force`). Set its body to `issue_body`, or open one titled `Academic calendar file missing` with that body if none is open.
  3. If the count is 0 and such an issue is open, close it with the comment `Calendar warnings cleared by run <run URL>.`
  4. Use `gh` with `GITHUB_TOKEN`.
- **Accepted side effect:** `calendar-issue` runs alongside `publish`, not after it. So the issue can be updated even when the `data` push fails. That's fine: the warnings come from a successful fetch either way.

Together the three jobs grant exactly what the earlier single job did (`contents: write` + `issues: write`), split so each job holds only what it needs.

### Production prerequisite (before the first push to GitHub)
Merging this workflow to `main` on GitHub starts the weekly schedule. So **before the first push to GitHub**:
- The maintainer checks `https://nubanner.neu.edu/robots.txt` and Northeastern's acceptable-use policy (Policy 700 and any IT acceptable-use policy).
- **The result is recorded in `docs/qa/FR-3/`:** what was checked, the date, and the conclusion.
- If either forbids the weekly fetch, stop and raise it with the user. Don't push.

### README sections (required headings)
1. **What it is:** the data source (public Banner class search, classes only).
2. **Local dev:**
   - `npm ci`, `npm run dev`, `npm run check`, `npm run fetch-data` (and its flags).
   - Without a local fetch, set `NEXT_PUBLIC_DATA_URL` to the `data` branch raw URL in `.env.local`.
3. **Weekly update:**
   - when it runs (Mondays 08:00 UTC)
   - why the file and job are still called `nightly-data` (historical)
   - the three jobs and their permissions
   - the `data` branch and the runtime URL
   - the write rule (real changes, plus a 6-day / 144 h heartbeat)
   - why a failure leaves last week's data in place
   - the 8-day stale banner
   - how to run it manually (Actions → nightly-data → Run workflow; only from `main` publishes)
   - **how to switch back to nightly:** change three values together:
     - the cron to `0 8 * * *`
     - `HEARTBEAT_MS` in `scripts/fetch-data/write.ts` to 48 h
     - `STALE_AFTER_MS` in `lib/free-rooms/time.ts` to 72 h
     - then update the tests that pin them.
   - **how to re-enable the workflow if GitHub disabled it after 60 days without activity** (Actions → nightly-data → "Enable workflow").
4. **Semester switch:** terms are discovered automatically (any term not marked "View Only", plus current terms from the existing file, with meeting dates overlapping today to +120 days). CPS and Law are inside the semester terms via `partOfTerm`. No code change is needed. Covers the "room assignments incomplete" banner.
5. **Yearly chore:** add `data/calendar/<YYYY-YYYY>.json` from the registrar PDF (link the FR-6 format). The `calendar-missing` issue opens automatically when it's needed and closes when it's fixed.
6. **Production:**
   - Agents never deploy. Code changes ship only through `scripts/deploy/`, run by a human.
   - Data refreshes don't need a deploy.
   - A human sets `NEXT_PUBLIC_DATA_URL=https://raw.githubusercontent.com/nwhee/FreeRooms/data/schedule.json` in Vercel once. The repo must stay public.
   - **The value is inlined at build time.** After setting or changing it, the human must redeploy through `scripts/deploy/deploy.sh` (FR-7) for it to take effect. A build without it prints a loud `WARNING: NEXT_PUBLIC_DATA_URL is not set`.
   - Test the workflow with `workflow_dispatch` and `publish: false`, or from a non-main branch.
   - **Before the first push to GitHub:** check Banner's `robots.txt` and Northeastern's acceptable-use policy, and record the result in `docs/qa/FR-3/` (see "Production prerequisite"). Merging to `main` starts the weekly schedule.
7. **Data contract:** link to `docs/specs/FR-0-overview.md`.

## Acceptance criteria
- [ ] AC1 (inspection; `actionlint` passes if available): the workflow file parses as valid YAML and has:
  - exactly the triggers and the `publish` input above. `grep -n "cron" .github/workflows/nightly-data.yml` shows exactly one line, `0 8 * * 1`.
  - top-level `permissions: {}` and the `concurrency` block
  - exactly three jobs, `fetch`, `publish` and `calendar-issue`, with these permissions:
    - `fetch`: `contents: read`, with `persist-credentials: false` on every checkout
    - `publish`: `contents: write`, `needs: fetch`
    - `calendar-issue`: `issues: write`, `needs: fetch`
  - no other permission anywhere
  - `npm` appears only in `fetch` (`npm`, `npx` and repo `node` scripts don't appear in `publish` or `calendar-issue`)
  - `fetch` uploads the `schedule` artifact only when `changed` is `true`, and only `publish` downloads it
  - `fetch` exposes the outputs `changed`, `calendar_warning_count` and `issue_body`, and `calendar-issue` reads only those outputs (no artifact download).
- [ ] AC2: These checks all print nothing:
  - `grep -nE "vercel|--prod" .github/workflows/nightly-data.yml`
  - `grep -n "secrets\." .github/workflows/nightly-data.yml | grep -v GITHUB_TOKEN`
  - `grep -nE "push( origin)? (main|HEAD:main)" .github/workflows/nightly-data.yml`
- [ ] AC3: `publish` commits only `schedule.json` on the `data` branch, and runs only when `needs.fetch.outputs.changed == 'true'`. When fetch prints `No change; not writing.`, the run ends green with `publish` skipped and no commit.
- [ ] AC4: If `npm run fetch-data` exits 1, `fetch` fails (red), and `publish` and `calendar-issue` don't run. There's no `continue-on-error` and no `|| true` on that step.
- [ ] AC5: The push step contains `git pull --rebase origin data` followed by exactly one retry push. The commit message date is computed with `TZ=America/New_York`.
- [ ] AC6 (manual, done by the user, since this needs GitHub):
  - Requires the "Production prerequisite" above to be done and recorded in `docs/qa/FR-3/` first.
  - Then: a `workflow_dispatch` run on `main` with `publish: true` (the bootstrap, started by the human), on a repo with no `data` branch, finishes green and creates `data` with exactly one file, `schedule.json`.
  - `curl -s https://raw.githubusercontent.com/nwhee/FreeRooms/data/schedule.json | jq .schemaVersion` prints `1`.
  - `main` has no new commits.
- [ ] AC7a (inspection): both `publish` and `calendar-issue` have an `if:` requiring `github.ref == 'refs/heads/main'` **and** the `publish` input being true or unset. `grep -n "publish" .github/workflows/nightly-data.yml` shows the input with `type: boolean` and `default: true`. `grep -n "refs/heads/main" .github/workflows/nightly-data.yml` shows the guard on both jobs.
- [ ] AC7b (manual): on a test branch, temporarily rename `data/calendar/2026-2027.json` and dispatch there with `publish: false`. Then:
  - The run is green, `publish` and `calendar-issue` show as skipped, and the `fetch` log shows the calendar warnings for 202710 and 202730 plus the issue body it would have written.
  - `git ls-remote origin data` shows the same SHA as before the run.
  - No `calendar-missing` issue was created or changed.
  - A second dispatch from the same test branch with `publish: true` also skips both jobs, because of the ref guard.
  - (The real open, update and close behaviour is exercised by the first scheduled run after a calendar actually goes missing. The issue-job logic is kept small and reviewed by inspection.)
- [ ] AC8: `README.md` contains all seven headings above. Its commands match the `package.json` script names, and it includes the re-enable-workflow instruction, the switch-back-to-nightly instruction (cron plus both thresholds, naming `HEARTBEAT_MS` and `STALE_AFTER_MS`), and the pre-push robots.txt and policy check.
- [ ] AC9: `npm run check` passes.

## Edge cases
- Two runs overlap → the concurrency group queues the second.
- The first run ever has no `data` branch → seed skipped, the FR-2 guards that compare against the old file are skipped, `changed=true`, and `publish` creates an orphan `data` branch.
- The `data` push fails, but `calendar-issue` has already updated the issue → accepted (see above). The run is red because of `publish`.
- Pushes made with `GITHUB_TOKEN` don't trigger other workflows. This is expected.

## Out of scope
- A PR or CI workflow running `npm run check`
- Notifications other than the calendar issue and GitHub's default failure email
- Any deploy commands or Vercel configuration.

## Files likely touched
- `.github/workflows/nightly-data.yml`
- `README.md`

## Open questions
1. Should v1 also have a CI workflow running `npm run check` on pushes and PRs? **Yes, but as a separate follow-up ticket (FR-9).** FR-7 is the deploy-script draft, and FR-8 is the weekly schedule change.
2. Do commits to a non-default branch count as activity for GitHub's 60-day schedule auto-disable? **Not certain. Don't rely on it.** The README documents how to re-enable the workflow, and GitHub emails the owner before it disables one.
