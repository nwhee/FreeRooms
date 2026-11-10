const W = "/Users/jonathanding/Documents/Coding/VSCode/Projects/Claude/FreeRooms/.claude/worktrees/agent-a388033982bdfade0";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const { main } = await import(`${W}/scripts/fetch-data/index.ts`);
const { fakeBanner } = await import(`${W}/scripts/fetch-data/__fixtures__/fake-banner.ts`);
const { missingCalendarWarnings } = await import(`${W}/lib/calendar/load.ts`);
const sec = (term: string, i: number) => ({ term, courseReferenceNumber: String(i), campusDescription: "Boston", partOfTerm: "1",
  meetingsFaculty: [{ meetingTime: { beginTime: "0900", endTime: "1000", building: "QA", room: "R" + i, startDate: "09/02/2026", endDate: "12/20/2026", monday: true } }] });
for (const dir of [mkdtempSync(join(tmpdir(), "qa-cal-")), "/nonexistent/qa-cal"]) {
  const so: string[] = [], se: string[] = [];
  const fb = fakeBanner({ terms: [{ code: "202710", description: "Fall 2026 Semester" }], sections: { "202710": [sec("202710", 1)] } });
  const code = await main(["--today", "2026-11-09", "--dry-run", "--out", join(tmpdir(), "qa-none.json")], { fetch: fb.fetch, sleep: async () => {}, now: () => new Date(), stdout: (l: string) => so.push(l), stderr: (l: string) => se.push(l), calendarDir: dir });
  console.log(dir, "exit", code, so.filter((l) => l.startsWith("::warning::")), se);
}
console.log("FR-6 expected:", missingCalendarWarnings(["202710"], []));
