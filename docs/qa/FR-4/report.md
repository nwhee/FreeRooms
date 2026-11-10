# QA FR-4 (qa-tester) — saved by manager from QA's message

VERDICT: PASS_WITH_NOTES. All AC1–AC15 (incl. AC10b) pass at 83587db; independent probe 143/143 (probe.ts, probe-out.txt), npm run check 171/171 (check.txt). No UI, no browser run.

Edge cases probed and passing: meeting ending at 1440; overlapping/nested/chained meetings; non-counting meetings never bridge blocks; room whose only meetings fall on a no-class day; exam periods across campuses (TOR, LDN), overlapping periods, data-driven part codes ("ZZ"); London/Vancouver/LA/NY local midnight around DST; dates outside every term; RangeError validation of minutes, dates, timezones.
AC11: Vancouver 2026-11-18T15:00Z = 480 (tzdata 2026c, permanent UTC-7; spec updated to 480 in 9e43fb3 on main).
AC14: buildIndex 2.4 ms; roomStatusesAt median ~0.4 ms for 600 rooms (budget 500 ms).

Notes (non-blocking):
- Low: Vancouver result depends on runtime tzdata >= 2026c; .nvmrc pins "22", engines >=22; an older Node 22 would give 420 and fail the test.
- Low: time.ts imports runtime values from lib/data/schema.ts, which pulls zod into any client bundle using lib/free-rooms.
- Info: dayContext.noClass returns the first matching entry when two overlap; spec doesn't say which label wins.
