---
name: spec-writing
description: Default PM skill. How to run discovery and write a spec with testable acceptance criteria, using docs/specs/TEMPLATE.md.
---

# Spec writing

- Discovery: ask 1–2 questions at a time. Answer from the code what you can.
- Use `docs/specs/TEMPLATE.md`. Fill in every section, or write "n/a" with a reason.
- **Problem before solution.** State who has the problem and how you'll know it's
  solved.
- **Acceptance criteria are testable.** "Given / When / Then", or a concrete check.
  Bad: "the page is fast". Good: "the list renders 500 rows with no layout shift".
- **Out of scope** is a required section. It stops scope creep and gives the auditors
  something to check against.
- **Files likely touched** is required. The manager uses it to load skills and assign
  file ownership.
- Keep it short. One ticket fits on one screen. If it doesn't, split it.
