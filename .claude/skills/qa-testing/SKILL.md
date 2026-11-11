---
name: qa-testing
description: Default QA tester skill. How to run the app locally, check acceptance criteria in a browser with Playwright, and record evidence.
---

# QA testing

**Running the app**
- Install once with `npm ci`, then `npx playwright install chromium` if browsers are
  missing. Both are free.
- Start it in the background: `npm run build && npm run start -- -p 3100`, or
  `npm run dev -- -p 3100` if the build is slow. Wait until `curl -s localhost:3100`
  answers. Use port 3100 so you don't clash with the user's own dev server.
- Stop it when you're done (kill the process you started, and only that one).

**Writing checks**
- Playwright tests in `e2e/<ticket-id>.spec.ts`, one `test()` per acceptance
  criterion, named after it.
- Query by role and label, like a user would. Assert what's on screen.
- Screenshots only when needed, so they don't bloat the public repo. Take one when a
  criterion is visual (layout, responsive width, contrast, focus, how a banner or state
  looks) or to show a failure or finding. Checks of text, logic or data rely on the
  Playwright assertions and the pasted summary, with no screenshot.
- When you do take one, capture the relevant viewport or element, not the full page
  (unless the full page is the point), into `docs/qa/<ticket-id>/`. Take both 1280px and
  390px widths only when the criterion is about responsive layout.
- For time-dependent features, fix the clock (`page.clock.setFixedTime`) instead of
  depending on today.
- Run with `npx playwright test e2e/<ticket-id>.spec.ts`, and paste the summary into
  the report.

**Beyond the spec**
- Try the empty state, an error state (block the data request with `page.route`), the
  keyboard only (Tab, Enter, Esc), a page reload, and a 390px screen.
- Check the browser console for errors and failed requests.
