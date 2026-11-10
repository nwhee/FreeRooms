---
name: security-supply-chain
description: Security reviewer skill. Dependencies, lockfiles, GitHub Actions and CI permissions, and anything that runs automatically.
---

# Security: supply chain and CI

**Dependencies**
- Each new package is needed (could a few lines of code do it instead?), widely used,
  recently maintained, and spelled correctly (watch for typosquats).
- Install scripts (`postinstall`) from new packages are called out.
- The lockfile is committed and changed only as the change requires.

**GitHub Actions**
- `permissions:` is set at the top to the least needed (for example
  `contents: read`, or `contents: write` only in the job that commits).
- Third-party actions are pinned to a full commit SHA, not `@main` or `@v1`.
- No `${{ github.event.* }}` or other untrusted input placed directly in `run:`.
  Pass it through `env:` instead.
- No `pull_request_target` with a checkout of PR code.
- Secrets are only given to the steps that need them and are never echoed.
- Scheduled jobs have a timeout (`timeout-minutes`) and a concurrency group, so a stuck run
  can't pile up and burn minutes.
- Anything that could use paid minutes, storage or services is flagged. Spending
  needs the user's permission.
