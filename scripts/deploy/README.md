# Deploy scripts

Production changes go only through scripts in this folder, and **a human runs them**.

- Agents can read these scripts but can't run or edit them. `.claude/scripts/guard-prod.sh`
  blocks both.
- To change one, have an agent draft the new version in a different file (for example
  `docs/deploy-drafts/`), review it, then copy it in yourself.
- Once tested, they're left alone until a change is needed.

Suggested scripts: `deploy.sh` (build + `vercel --prod`), `migrate.sh` (run
`migrations/` against production MongoDB), `rollback.sh`.
