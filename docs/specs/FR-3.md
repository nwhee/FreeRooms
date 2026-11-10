# FR-3 — Nightly data workflow and README

**Status:** draft (revision 2)
**Owner:** product-manager · **Approved by:** vp-product, <user>
**Depends on:** FR-2 · **Overview:** `docs/specs/FR-0-overview.md`

> **PENDING USER DECISION — deploy model.** This spec follows FR-0's recommended
> default: data is published to a dedicated `data` branch and read at runtime through
> `NEXT_PUBLIC_DATA_URL`, so a data refresh is not a production deploy. Alternative:
> commit to `main` and let Vercel auto-deploy, which requires amending CLAUDE.md first.

## Problem
The data must refresh every night and follow the semester change with no human action, and without a production deploy (CLAUDE.md: production changes go only through `scripts/deploy/`, run by a human). The maintainer must also hear about problems that need a human, such as a missing academic calendar. And they need one place that explains how all of this works.

## Solution
- **`.github/workflows/nightly-data.yml`:** pulls the current data from the `data` branch, runs `npm run fetch-data`, and commits `schedule.json` to the `data` branch when FR-2 rewrote it. It opens or updates one GitHub issue when calendar warnings are present. It has no deploy step and never pushes to `main`.
- **`README.md`:** covers what FreeRooms is, local dev, the nightly update, the semester switch, the yearly calendar chore, and production.

### Workflow
- Triggers: `schedule: cron "0 8 * * *"` (03:00 EST / 04:00 EDT) and `workflow_dispatch`.
- `permissions: { contents: write, issues: write }` only. `concurrency: nightly-data` with `cancel-in-progress: false`.
- Steps:
  1. Check out `main`. Set up `actions/setup-node` with `node-version-file: .nvmrc` and npm cache. Run `npm ci`.
  2. **Seed:** if `origin/data` exists, `git fetch origin data` and `git show origin/data:schedule.json > public/data/schedule.json`. This gives FR-2 the existing file for its guards and write rule. If the branch doesn't exist yet, skip (first run).
  3. `npm run fetch-data`.
  4. **Publish:** if `public/data/schedule.json` differs from the seeded copy, or the `data` branch is missing:
     - check out the `data` branch into a separate worktree (create it as an orphan branch if missing)
     - copy the file to `schedule.json` at the branch root
     - commit as `github-actions[bot]` with the message `data: nightly schedule update (YYYY-MM-DD)`, where the date is `TZ=America/New_York date +%F`
     - `git push origin data`. If the push is rejected: `git pull --rebase origin data`, then push once more. If that also fails, the job fails.
  5. **Calendar issue:** read the calendar warnings with `jq '[.warnings[] | select(contains("has no academic calendar file"))]' public/data/schedule.json`.
     - If there are any, find the open issue with label `calendar-missing` (create the label if missing, using `gh label create --force`). Update its body with the current warnings, or open one titled `Academic calendar file missing` if none is open.
     - If there are none and such an issue is open, close it with the comment `Calendar warnings cleared by run <run URL>.`
     - Use `gh` with `GITHUB_TOKEN`.
- No secrets or env vars other than `GITHUB_TOKEN`.

### README sections (required headings)
1. **What it is:** the data source (public Banner class search, classes only).
2. **Local dev:**
   - `npm ci`, `npm run dev`, `npm run check`, `npm run fetch-data` (and its flags).
   - Without a local fetch, set `NEXT_PUBLIC_DATA_URL` to the `data` branch raw URL in `.env.local`.
3. **Nightly update:**
   - when it runs
   - the `data` branch and the runtime URL
   - the write rule (real changes, plus a 48 h heartbeat)
   - why a failure leaves yesterday's data in place
   - the 3-day stale banner
   - how to run it manually (Actions → nightly-data → Run workflow)
   - **how to re-enable the workflow if GitHub disabled it after 60 days without activity** (Actions → nightly-data → "Enable workflow").
4. **Semester switch:** terms are discovered automatically (any term not marked "View Only", plus current terms from the existing file, with meeting dates overlapping today to +120 days). CPS and Law are inside the semester terms via `partOfTerm`. No code change is needed. Covers the "room assignments incomplete" banner.
5. **Yearly chore:** add `data/calendar/<YYYY-YYYY>.json` from the registrar PDF (link the FR-6 format). The `calendar-missing` issue opens automatically when it's needed and closes when it's fixed.
6. **Production:**
   - Agents never deploy. Code changes ship only through `scripts/deploy/`, run by a human.
   - Data refreshes don't need a deploy.
   - A human sets `NEXT_PUBLIC_DATA_URL` in Vercel once, and the repo must be public.
7. **Data contract:** link to `docs/specs/FR-0-overview.md`.

## Acceptance criteria
- [ ] AC1: The workflow file parses as valid YAML and has exactly the triggers, permissions, concurrency and steps listed above (auditor inspection; `actionlint` passes if available).
- [ ] AC2: These checks all print nothing:
  - `grep -nE "vercel|--prod" .github/workflows/nightly-data.yml`
  - `grep -n "secrets\." .github/workflows/nightly-data.yml | grep -v GITHUB_TOKEN`
  - `grep -nE "push( origin)? (main|HEAD:main)" .github/workflows/nightly-data.yml`
- [ ] AC3: The publish step commits only `schedule.json` on the `data` branch, and runs only when the file changed or the branch is missing. When fetch prints `No change; not writing.`, the job ends green with no commit.
- [ ] AC4: If `npm run fetch-data` exits 1, the job fails (red), no commit is made, and the calendar-issue step doesn't run. There's no `continue-on-error` and no `|| true` on that step.
- [ ] AC5: The push step contains `git pull --rebase origin data` followed by exactly one retry push. The commit message date is computed with `TZ=America/New_York`.
- [ ] AC6 (manual, done by the user after merge, since this needs GitHub):
  - A `workflow_dispatch` run on a repo with no `data` branch finishes green and creates `data` with exactly one file, `schedule.json`.
  - `curl -s https://raw.githubusercontent.com/<owner>/<repo>/data/schedule.json | jq .schemaVersion` prints `1`.
  - `main` has no new commits.
- [ ] AC7 (manual): temporarily rename `data/calendar/2026-2027.json` on a branch and dispatch there. One open issue labelled `calendar-missing` appears and lists 202710 and 202730. A second run updates that issue and doesn't open another. After restoring the file, the next run closes the issue.
- [ ] AC8: `README.md` contains all seven headings above. Its commands match the `package.json` script names, and it includes the re-enable-workflow instruction.
- [ ] AC9: `npm run check` passes.

## Edge cases
- Two runs overlap → the concurrency group queues the second.
- The first run ever has no `data` branch → seed skipped, the FR-2 guards that compare against the old file are skipped, and an orphan `data` branch is created.
- Pushes made with `GITHUB_TOKEN` don't trigger other workflows. This is expected.

## Out of scope
- A PR or CI workflow running `npm run check`
- Notifications other than the calendar issue and GitHub's default failure email
- Any deploy commands or Vercel configuration.

## Files likely touched
- `.github/workflows/nightly-data.yml`
- `README.md`

## Open questions
1. Should v1 also have a CI workflow running `npm run check` on pushes and PRs? **Yes, but as a separate follow-up ticket (FR-7).**
2. Do commits to a non-default branch count as activity for GitHub's 60-day schedule auto-disable? **Not certain. Don't rely on it.** The README documents how to re-enable the workflow, and GitHub emails the owner before it disables one.
