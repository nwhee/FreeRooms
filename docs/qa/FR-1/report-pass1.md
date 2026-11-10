# QA report FR-1 (qa-tester, verbatim findings; saved by manager because the harness blocked QA writing report.md)

VERDICT: PASS_WITH_NOTES — all 12 ACs (AC1–AC10, AC5b, AC5c) pass on a fresh clone of fr-1-scaffold (bd5472d), Node 24, telemetry off.
Evidence: docs/qa/FR-1/ (screenshots AC5-build-serves-404-{desktop,phone}.png, evidence/qa-check.txt, qa-build-unset.txt, qa-build-empty.txt, qa-build-set.txt, qa-dev.txt, qa-probe.txt, FR-1.spec.ts.txt).

AC5c: warning present for unset and empty NEXT_PUBLIC_DATA_URL builds, absent when set, absent in check / next dev / next start; all builds exit 0.
AC7: independent probe broke each FR-0 invariant one at a time; each returns a specific path-named error; null/undefined/string/number/array return ok:false without throwing.

Found beyond spec:
1. Medium — @playwright/test is not a dependency and tsconfig includes **/*.ts, so any spec committed to e2e/ breaks typecheck/check. FR-0 says only FR-1 edits package.json. Recommend FR-1 add @playwright/test devDependency (or exclude e2e/ from tsc+eslint).
2. Low — schema uses non-strict z.object; unknown keys accepted and stripped.
3. Low — campusFromBannerName returns CampusDefinition | null (spec says Campus | null); looks deliberate.
4. Low — missing-URL warning prints twice per build.
5. Info — timezone check accepts "EST".
6. Info — next-env.d.ts gitignored although listed as owned.
7. Info — browser: / returns 404 with default not-found at 1280px and 390px, no horizontal scroll, favicon 200, /data/schedule.json 404 when absent. Playwright: 4 passed.
