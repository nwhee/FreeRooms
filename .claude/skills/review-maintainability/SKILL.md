---
name: review-maintainability
description: VP Engineering evaluation skill. Checks the change follows existing patterns and stays easy to change.
---

# Review: maintainability

- Does it follow an existing pattern in the codebase? If it adds a new one, is there
  a reason?
- Is it in the right layer (`lib/db`, `lib/schemas`, `components`, `app`)?
- Duplication: is there an existing helper or component that should have been reused?
- Names say what things are. No vague `data`, `handle`, `utils2`.
- Types: no `any`, no `@ts-ignore`, no unchecked casts.
- No dead code, commented-out blocks or leftover debug logs.
