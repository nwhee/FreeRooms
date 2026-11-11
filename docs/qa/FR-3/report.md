# QA report FR-3 (qa-tester; saved by manager because the harness blocked QA writing it)

VERDICT: PASS_WITH_NOTES. Branch fr-3-nightly (c43eed1) against docs/specs/FR-3.md and main 39b93fe. No GitHub run, no push, no Banner, no docker; actionlint not installed.

| AC | Result | Evidence |
|---|---|---|
| AC1 structure | pass, needs a decision | check_workflow.txt — YAML parses; triggers schedule `0 8 * * *` + workflow_dispatch (`publish` boolean, default true); concurrency `nightly-data`, cancel-in-progress false; timeouts 30/10/10; all `uses:` pinned to 40-char SHAs; no `${{ }}` in `run:`; `bash -n` ok. **Deviation:** three jobs with per-job permissions (fetch contents:read, publish contents:write, calendar-issue issues:write) instead of one job with `{contents: write, issues: write}`. |
| AC2 no deploy | pass | ac_greps.txt |
| AC3 publish only on change | pass | sim_git.txt scenarios A, B, C, H1, H2 (orphan data branch with only schedule.json; unchanged → publish skipped, SHA unchanged) |
| AC4 fail loudly | pass (local) | sim_git.txt scenario D; no continue-on-error / `|| true` / always() |
| AC5 rebase + one retry | pass | sim_git.txt E, F, G, G2; date via TZ=America/New_York |
| AC6 first real run | needs GitHub | local scenario A passes |
| AC7a publish input guards | pass | ac_greps.txt |
| AC7b publish:false run | needs GitHub | sim_steps.txt shows the warnings and would-be issue body |
| AC8 README | pass with notes | headings, commands, flags, numbers and links all match main |
| AC9 check after merge | pass | test-merge onto 39b93fe: clean, `npm ci && npm run check` 413 tests (merge-check.txt) |

Beyond the spec:
- Medium: README "Yearly chore" step 3 "Known issue" (calendar test fails with a second file) is out of date since CAL-1 (39b93fe); verified 46/46 calendar tests pass with a fake 2027-2028.json.
- Low: README says Spring 2027 starts 2027-01-13; the live term starts 2027-01-04 (earliest meeting), which is what the window uses.
- Low: README doesn't mention scripts/fetch-data/placeholder-rooms.json (FR-2b deny-list).
- Info: action SHA pins not verified offline.

Needs a real GitHub run: AC6, AC7b, real `gh` label/issue behaviour, artifact hand-off between jobs, `inputs.publish` on scheduled runs, concurrency queueing, credential-less `git ls-remote` (repo must be public), actionlint.
