---
name: testing-patterns
description: Default engineer skill. How to write tests here — Vitest and Testing Library for units and components, Playwright for key flows.
---

# Testing patterns

- **Unit and component tests:** Vitest with React Testing Library, next to the file
  (`foo.ts` → `foo.test.ts`).
- **End-to-end:** Playwright in `e2e/`, only for the critical user flows named in the
  spec's acceptance criteria.
- **Test behaviour, not implementation.** Query by role and label
  (`getByRole('button', { name: 'Save' })`), not by class or test id, unless there's
  no accessible name.
- **One acceptance criterion → at least one test.** Name the test after the criterion.
- **Database tests** use `mongodb-memory-server`, never a shared or remote database.
- **Every bug fix starts with a failing test** that reproduces the bug.
- Cover the empty, error and loading states, not just the happy path.
- `npm run check` must be green before you report done.
