---
name: review-spec-quality
description: VP Product evaluation skill. Checks a spec, or finished work against a spec, for product fit and testable scope.
---

# Review: spec quality and product fit

- The problem, the user and the success signal are stated.
- The solution solves the stated problem, and nothing extra was snuck in.
- Every acceptance criterion is testable and unambiguous.
- Out-of-scope is explicit. Scope fits one ticket.
- Edge cases: empty states, errors, permissions, mobile widths, first-time user.
- Consistent with how the product already behaves (check the code).
- Build review: walk every criterion against the diff and mark met / not met /
  can't tell.
