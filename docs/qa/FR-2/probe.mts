const W = "/Users/jonathanding/Documents/Coding/VSCode/Projects/Claude/FreeRooms/.claude/worktrees/agent-a388033982bdfade0";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { main } = await import(`${W}/scripts/fetch-data/index.ts`);
const { fakeBanner } = await import(`${W}/scripts/fetch-data/__fixtures__/fake-banner.ts`);
const { transformTerms } = await import(`${W}/scripts/fetch-data/transform.ts`);
const { buildScheduleFile, serializeSchedule } = await import(`${W}/scripts/fetch-data/write.ts`);
const { buildCalendarBlock, loadCalendarFiles } = await import(`${W}/lib/calendar/load.ts`);
const { validateSchedule } = await import(`${W}/lib/data/schema.ts`);
const CAL = `${W}/data/calendar`;

// Hand-built Banner rows (independent of the engineer's builders).
function sec(term: string, crn: number, room: string, sd: string, ed: string, opts: any = {}) {
  return {
    term, courseReferenceNumber: String(crn), campusDescription: opts.campus ?? "Boston", partOfTerm: opts.part ?? "1",
    instructor: "SHOULD NOT LEAK", faculty: [{ displayName: "Prof Secret", emailAddress: "x@northeastern.edu" }],
    meetingsFaculty: [{ meetingTime: { beginTime: "0900", endTime: "1005", building: opts.bldg ?? "QA", buildingDescription: "QA Hall",
      room, startDate: sd, endDate: ed, monday: true, tuesday: false, wednesday: true, thursday: false, friday: false, saturday: false, sunday: false } }],
  };
}
const FALL = (n: number, off = 0) => Array.from({ length: n }, (_, i) => sec("202710", 10000 + i + off, `F${i}`, "09/02/2026", "12/20/2026"));
const SPR = (n: number, off = 0) => Array.from({ length: n }, (_, i) => sec("202730", 30000 + i + off, `S${i}`, "01/13/2027", "05/02/2027"));
const TERMS = [{ code: "202730", description: "Spring 2027 Semester" }, { code: "202710", description: "Fall 2026 Semester" }];

function sched(fetched: any[], today: string, gen: string) {
  const e = transformTerms(fetched, today);
  const f = buildScheduleFile({ entities: e, calendar: buildCalendarBlock(loadCalendarFiles(CAL)), warnings: e.warnings, generatedAt: gen });
  if (!validateSchedule(f).ok) throw new Error("bad");
  return f;
}
function out(file?: any) {
  const p = join(mkdtempSync(join(tmpdir(), "qa-fr2-")), "schedule.json");
  if (file) writeFileSync(p, typeof file === "string" ? file : serializeSchedule(file));
  return p;
}
async function run(name: string, args: string[], banner: any, now: Date, path: string, expectCode: number, expectWrite: boolean | null) {
  const before = existsSync(path) ? readFileSync(path) : null;
  const so: string[] = [], se: string[] = [];
  const fb = fakeBanner(banner);
  const code = await main([...args, "--out", path], { fetch: fb.fetch, sleep: async () => {}, now: () => now, stdout: (l: string) => so.push(l), stderr: (l: string) => se.push(l), calendarDir: CAL });
  const after = existsSync(path) ? readFileSync(path) : null;
  const changed = !(before === null ? after === null : after !== null && before.equals(after));
  const ok = code === expectCode && (expectWrite === null || changed === expectWrite);
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: exit=${code} fileChanged=${changed}`);
  const msg = [...se, ...so.filter((l) => /No change|Dry run|Wrote|::warning::|Terms:/.test(l))].map((l) => l.slice(0, 200));
  for (const l of msg) console.log("       " + l);
  return { code, so, se, path };
}
const NOV9 = new Date("2026-11-09T15:00:00Z"), NOV20 = new Date("2026-11-20T15:00:00Z"), DEC21 = new Date("2026-12-21T15:00:00Z");

// --- 12-21 transition: existing 600 fall + 150 spring; new only spring 160
const existTrans = sched([{ ...TERMS[1], sections: FALL(600) }, { ...TERMS[0], sections: SPR(150) }], "2026-11-09", "2026-12-20T08:00:00.000Z");
await run("transition 12-21 (600+150 -> 160)", ["--today", "2026-12-21"], { terms: TERMS, sections: { "202710": FALL(600), "202730": SPR(160) } }, DEC21, out(existTrans), 0, true);
// Banner on 12-21 likely marks fall View Only
await run("transition 12-21, Fall now View Only", ["--today", "2026-12-21"], { terms: [TERMS[0], { code: "202710", description: "Fall 2026 Semester (View Only)" }], sections: { "202730": SPR(160) } }, DEC21, out(existTrans), 0, true);
// room drop
await run("room-drop 202730 150 -> 70", ["--today", "2026-12-21"], { terms: TERMS, sections: { "202730": SPR(70) } }, DEC21, out(existTrans), 1, false);
await run("room-drop 150 -> 70 --force", ["--today", "2026-12-21", "--force"], { terms: TERMS, sections: { "202730": SPR(70) } }, DEC21, out(existTrans), 0, true);
await run("room-drop boundary 150 -> 75 (exactly 50%)", ["--today", "2026-12-21"], { terms: TERMS, sections: { "202730": SPR(75) } }, DEC21, out(existTrans), 0, true);
await run("room-drop boundary 150 -> 74", ["--today", "2026-12-21"], { terms: TERMS, sections: { "202730": SPR(74) } }, DEC21, out(existTrans), 1, false);
await run("room-drop under --dry-run", ["--today", "2026-12-21", "--dry-run"], { terms: TERMS, sections: { "202730": SPR(70) } }, DEC21, out(existTrans), 1, false);
await run("room-drop --force --dry-run (writes nothing)", ["--today", "2026-12-21", "--dry-run", "--force"], { terms: TERMS, sections: { "202730": SPR(70) } }, DEC21, out(existTrans), 0, false);

// --- vanished term on 11-20
const existNov = sched([{ ...TERMS[1], sections: FALL(40) }, { ...TERMS[0], sections: SPR(30) }], "2026-11-19", "2026-11-19T08:00:00.000Z");
await run("vanished: totalCount 0 for 202710", ["--today", "2026-11-20"], { terms: TERMS, sections: { "202730": SPR(30) } }, NOV20, out(existNov), 1, false);
await run("vanished: totalCount 0 --force", ["--today", "2026-11-20", "--force"], { terms: TERMS, sections: { "202730": SPR(30) } }, NOV20, out(existNov), 0, true);
await run("vanished: 202710 absent from getTerms (Banner still has rows if asked)", ["--today", "2026-11-20"], { terms: [TERMS[0]], sections: { "202730": SPR(30), "202710": FALL(40) } }, NOV20, out(existNov), 0, null);
await run("vanished: 202710 absent from getTerms, no rows", ["--today", "2026-11-20"], { terms: [TERMS[0]], sections: { "202730": SPR(30) } }, NOV20, out(existNov), 1, false);
await run("vanished: absent --force", ["--today", "2026-11-20", "--force"], { terms: [TERMS[0]], sections: { "202730": SPR(30) } }, NOV20, out(existNov), 0, true);
await run("not vanished on 12-21 (202710 ended 12-20, absent)", ["--today", "2026-12-21"], { terms: [TERMS[0]], sections: { "202730": SPR(30) } }, DEC21, out(existNov), 0, true);
// term present but every meeting's campus renamed -> 0 rooms in that term
const renamed = FALL(40).map((s) => ({ ...s, campusDescription: "Boston Main Campus (renamed)" }));
await run("campus renamed for whole fall term", ["--today", "2026-11-20"], { terms: TERMS, sections: { "202710": renamed, "202730": SPR(30) } }, NOV20, out(existNov), 1, false);
await run("vanished under --dry-run", ["--today", "2026-11-20", "--dry-run"], { terms: TERMS, sections: { "202730": SPR(30) } }, NOV20, out(existNov), 1, false);

// --- write rule 47h / 48h / 49h
const base = { terms: TERMS, sections: { "202710": FALL(10), "202730": SPR(10) } };
for (const h of [47, 48, 49]) {
  const gen = new Date(NOV9.getTime() - h * 3600e3).toISOString();
  const p = out(sched([{ ...TERMS[1], sections: FALL(10) }, { ...TERMS[0], sections: SPR(10) }], "2026-11-09", gen));
  await run(`write rule same content, ${h} h old`, ["--today", "2026-11-09"], base, NOV9, p, 0, h >= 48);
}
{
  const p = out(sched([{ ...TERMS[1], sections: FALL(10) }, { ...TERMS[0], sections: SPR(10) }], "2026-11-09", new Date(NOV9.getTime() - 3600e3).toISOString()));
  await run("write rule changed content (11 fall rooms)", ["--today", "2026-11-09"], { terms: TERMS, sections: { "202710": FALL(11), "202730": SPR(10) } }, NOV9, p, 0, true);
  // personal data check on written file
  const txt = readFileSync(p, "utf8");
  console.log(`       leak check: SHOULD NOT LEAK=${txt.includes("SHOULD NOT LEAK")} Prof=${txt.includes("Prof Secret")} @=${txt.includes("@")}`);
  // sorted check
  const f = JSON.parse(txt);
  const ids = f.rooms.map((r: any) => r.id); console.log(`       rooms sorted=${JSON.stringify(ids) === JSON.stringify([...ids].sort())} minified=${!txt.includes("\n")}`);
}
// dry run with no file
{ const p = out(); await run("dry-run, absent file stays absent", ["--today", "2026-11-09", "--dry-run"], base, NOV9, p, 0, false); }
// existing corrupt file
await run("existing file is not JSON (guards skipped, replaced)", ["--today", "2026-11-09"], base, NOV9, out("{oops"), 0, true);
// new term 0 sections, not in existing
await run("new term 202735 with 0 sections", ["--today", "2026-11-09"], { terms: [...TERMS, { code: "202735", description: "Spring 2027 Law" }], sections: base.sections }, NOV9, out(), 0, true);
// bogus --today
await run("--today 2026-13-45", ["--today", "2026-13-45"], base, NOV9, out(), 1, null);
await run("--delay-ms 1000 accepted", ["--today", "2026-11-09", "--delay-ms", "1000", "--dry-run"], base, NOV9, out(), 0, false);
await run("missing calendar dir", ["--today", "2026-11-09", "--dry-run"], base, NOV9, out(), 0, false);
