# FR-7 — Production deploy script draft

**Status:** approved by user 2026-11-09
**Owner:** product-manager · **Approved by:** <user>
**Depends on:** FR-3 · **Overview:** `docs/specs/FR-0-overview.md` (deploy model)

## Problem
Under the deploy model the user chose, code reaches production only through `scripts/deploy/`, run by a human. No deploy script exists yet. `NEXT_PUBLIC_DATA_URL` is inlined at build time, so a deploy without it ships a site that can't load data. Agents can't write into `scripts/deploy/` (the guard hook blocks it), so the script has to be drafted elsewhere and installed by a human.

## Solution
An agent drafts `docs/deploy-drafts/deploy.sh`. A human reviews it and copies it to `scripts/deploy/deploy.sh`. Agents never run it, in either location. In order, the script:

1. `set -euo pipefail`. Checks that `vercel`, `curl`, `jq` and `npm` are on `PATH`.
2. Refuses to run unless the current branch is `main` and the working tree is clean (`git status --porcelain` is empty).
3. **Checks `NEXT_PUBLIC_DATA_URL`:**
   - `vercel env ls production` must list `NEXT_PUBLIC_DATA_URL`. Otherwise exit 1 with `NEXT_PUBLIC_DATA_URL is not set for production in Vercel. Set it, then re-run.`
   - Then `curl -fsS "${DATA_URL:-https://raw.githubusercontent.com/nwhee/FreeRooms/data/schedule.json}" | jq -e '.schemaVersion == 1'` must succeed. Otherwise exit 1.
4. `npm ci && npm run check`. Exits 1 on failure.
5. Prints what will be deployed (`git rev-parse --short HEAD`) and asks `Deploy to production? [y/N]`. Anything other than `y` exits 0 without deploying.
6. `vercel --prod`.

## Acceptance criteria
- [ ] AC1: `bash -n docs/deploy-drafts/deploy.sh` exits 0. If `shellcheck` is installed, `shellcheck docs/deploy-drafts/deploy.sh` exits 0 with no warnings (record in the PR whether it was available).
- [ ] AC2 (inspection): the steps appear in the order above. `grep -n "vercel --prod" docs/deploy-drafts/deploy.sh` shows exactly one line, and it comes after both the `NEXT_PUBLIC_DATA_URL` check and `npm run check`, and after the `[y/N]` prompt.
- [ ] AC3 (inspection): the first line is `#!/usr/bin/env bash`, `set -euo pipefail` is present, and every failure path prints a message to stderr and exits non-zero.
- [ ] AC4: The script holds no secrets, tokens or production URIs other than the public raw data URL (`grep -nEi "token|secret|mongodb|password" docs/deploy-drafts/deploy.sh` prints nothing).
- [ ] AC5: The ticket adds no file under `scripts/deploy/` (`git diff --name-only <base>...HEAD` lists only `docs/deploy-drafts/deploy.sh`). No agent runs the script. The PR description says a human must review it, copy it to `scripts/deploy/deploy.sh`, and `chmod +x` it.
- [ ] AC6 (manual, by the human after installing): with `NEXT_PUBLIC_DATA_URL` removed from Vercel production, the script exits 1 at step 3 before running `npm run check`. Answering `n` at the prompt exits 0 with no deployment created.

## Edge cases
- The data branch doesn't exist yet → the step 3 curl fails → exit 1 with a hint to run the nightly workflow once with `publish: true`.
- Not logged in to Vercel → `vercel env ls` fails → exit 1.

## Out of scope
- `migrate.sh` and `rollback.sh` (there's no database; rollback is the Vercel dashboard for v1)
- CI deploys
- Editing anything in `scripts/deploy/`.

## Files likely touched
- `docs/deploy-drafts/deploy.sh`

## Open questions
1. Should `deploy.sh` also confirm that the data is less than 3 days old before deploying? **No.** Stale data is a nightly-job problem, not a reason to block a code deploy. The UI already warns about it.
