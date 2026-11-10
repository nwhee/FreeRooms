---
name: review-test-coverage
description: VP Engineering evaluation skill. Checks that tests prove the acceptance criteria and would catch regressions.
---

# Review: test coverage

- Each acceptance criterion has at least one test that would fail without the change.
- Bug fixes include a test that reproduces the bug.
- Error, empty and loading states are tested, not only the happy path.
- Tests query by role/label and assert behaviour, not implementation details.
- No tests that always pass (no assertions, over-mocked, snapshot-only).
- Name the specific untested case, not just "needs more tests".
