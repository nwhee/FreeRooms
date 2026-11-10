// FR-2b QA probe: fake Banner only, no network. Run from the worktree: npx tsx docs/qa/FR-2b/probe.mts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const W = resolve(new URL("../../..", import.meta.url).pathname);
const { main } = await import(`${W}/scripts/fetch-data/index.ts`);
const { fakeBanner } = await import(`${W}/scripts/fetch-data/__fixtures__/fake-banner.ts`);
const CAL = `${W}/data/calendar`;
globalThis.fetch = (() => Promise.reject(new Error("NETWORK CALL"))) as any;

function sec(term: string, crn: number, room: string, opts: any = {}) {
  const [sd, ed] = term === "202710" ? ["09/02/2026", "12/20/2026"] : ["01/13/2027", "05/02/2027"];
  return { term, courseReferenceNumber: String(crn), campusDescription: opts.campus ?? "Boston", partOfTerm: "1",
    meetingsFaculty: [{ meetingTime: { beginTime: "0900", endTime: "1005", building: opts.bldg ?? "QA", buildingDescription: "QA Hall",
      room, startDate: sd, endDate: ed, monday: true, wednesday: true } }] };
}
const rows = (term: string, n: number, base: number) => Array.from({ length: n }, (_, i) => sec(term, base + i, `R${i}`));
const TERMS = [{ code: "202730", description: "Spring 2027 Semester" }, { code: "202710", description: "Fall 2026 Semester" }];
let fails = 0;
const check = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "OK  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`); };

/** Serves passes[term][n] on the n-th term/search for that term; the last pass repeats. */
function paged(passes: Record<string, any[][]>, totals: Record<string, number>, terms = TERMS) {
  const passIdx: Record<string, number> = {}; let current = "";
  return { terms, intercept: (req: any) => {
    if (req.url.includes("term/search")) { current = new URLSearchParams(req.body).get("term")!; passIdx[current] = (passIdx[current] ?? -1) + 1; }
    if (!req.url.includes("searchResults/searchResults")) return undefined;
    const p = new URL(req.url).searchParams; const term = p.get("txt_term")!; const off = Number(p.get("pageOffset"));
    const list = passes[term]; const data = list[Math.min(passIdx[term], list.length - 1)].slice(off, off + 500);
    return new Response(JSON.stringify({ success: true, totalCount: totals[term], data }));
  } };
}
async function run(args: string[], banner: any, now = new Date("2026-11-10T15:00:00Z"), deps: any = {}) {
  const fb = fakeBanner(banner); const log: string[] = []; const sleeps: number[] = [];
  const code = await main(args, { fetch: fb.fetch, sleep: async (ms: number) => { sleeps.push(ms); }, now: () => now,
    stdout: (l: string) => log.push("OUT " + l), stderr: (l: string) => log.push("ERR " + l), calendarDir: CAL, ...deps });
  return { code, log, sleeps, fb };
}
const seqFor = (fb: any, term: string) => {
  // collapse the request log into reset->term->pages sequences per term
  const seqs: string[] = []; let cur = "";
  for (const e of fb.log as string[]) {
    if (e === "reset") { if (cur) seqs.push(cur); cur = "R"; }
    else if (e.startsWith("term:") || e.includes("term/search")) cur += ">T";
    else if (e.includes("searchResults")) cur += ">P";
  }
  if (cur) seqs.push(cur);
  return seqs;
};

// ---- AC8b case 1: 1000 total, first pass dup one + drop one (999 unique), second pass clean
{
  const clean = rows("202730", 1000, 30000); const drift = clean.map((r, i) => (i === 600 ? clean[599] : r));
  const out = join(mkdtempSync(join(tmpdir(), "qa2b-")), "s.json");
  const r = await run(["--out", out, "--today", "2026-11-10", "--delay-ms", "2000"], paged({ "202730": [drift, clean], "202710": [rows("202710", 10, 10000)] }, { "202730": 1000, "202710": 10 }));
  const f = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  const warn = r.log.find((l) => l.includes("::warning::") && l.includes("202730") && /re-?fetch/i.test(l));
  check("AC8b case1 exit 0", r.code === 0, r.log.filter((l) => l.startsWith("ERR")).join(" | "));
  check("AC8b case1 re-fetch warning names 202730", !!warn, warn);
  check("AC8b case1 dropped section (CRN 30600 / room QA-R600) is in the output", !!f?.rooms.some((x: any) => x.id === "QA-R600"));
  check("AC8b case1 sleeps all >= 2000", r.sleeps.every((s) => s >= 2000), `n=${r.sleeps.length}`);
  const resets = r.fb.requests.filter((q: any) => q.url.includes("resetDataForm")).length;
  check("AC8b case1 resets = 3 (202710 once, 202730 twice)", resets === 3, `resets=${resets}`);
  console.log("     warning text:", warn);
}
// ---- AC8b case 2: both passes short -> exit 1, warning printed before error, exactly one re-fetch
{
  const clean = rows("202730", 1000, 30000); const drift = clean.map((r, i) => (i === 600 ? clean[599] : r));
  const dir = mkdtempSync(join(tmpdir(), "qa2b-")); const out = join(dir, "s.json"); writeFileSync(out, "SENTINEL");
  const r = await run(["--out", out, "--today", "2026-11-10"], paged({ "202730": [drift], "202710": [rows("202710", 10, 10000)] }, { "202730": 1000, "202710": 10 }));
  const wi = r.log.findIndex((l) => l.includes("::warning::") && /re-?fetch/i.test(l)); const ei = r.log.findIndex((l) => l.startsWith("ERR Error:"));
  const seqs = seqFor(r.fb, "202730");
  check("AC8b case2 exit 1", r.code === 1);
  check("AC8b case2 re-fetch warning printed before the error", wi >= 0 && ei > wi, `warn@${wi} err@${ei}`);
  check("AC8b case2 file untouched", readFileSync(out, "utf8") === "SENTINEL");
  const t30 = r.fb.log.filter((e: string) => e === "term:202730").length;
  check("AC8b case2 exactly two term/search for 202730 (one re-fetch)", t30 === 2, `log=${r.fb.log.join(",")}`);
  check("AC8b case2 sleeps all >= 3000 (default)", r.sleeps.every((s) => s >= 3000));
  console.log("     sequences:", seqs.join("  "));
  console.log("     log:", r.log.slice(-4).join(" || "));
}
// ---- AC8b case 3: both terms short on pass 1, clean on pass 2
{
  const c30 = rows("202730", 1000, 30000), d30 = c30.map((r, i) => (i === 10 ? c30[9] : r));
  const c10 = rows("202710", 700, 10000), d10 = c10.map((r, i) => (i === 650 ? c10[649] : r));
  const out = join(mkdtempSync(join(tmpdir(), "qa2b-")), "s.json");
  const r = await run(["--out", out, "--today", "2026-11-10", "--delay-ms", "2500"], paged({ "202730": [d30, c30], "202710": [d10, c10] }, { "202730": 1000, "202710": 700 }));
  const w = r.log.filter((l) => l.includes("::warning::") && /re-?fetch/i.test(l));
  check("AC8b case3 exit 0", r.code === 0, r.log.filter((l) => l.startsWith("ERR")).join(" | "));
  check("AC8b case3 two re-fetch warnings (one per term)", w.length === 2, w.join(" / "));
  check("AC8b case3 each term searched exactly twice", r.fb.log.filter((e: string) => e === "term:202730").length === 2 && r.fb.log.filter((e: string) => e === "term:202710").length === 2);
  check("AC8b case3 sleeps all >= 2500", r.sleeps.every((s) => s >= 2500));
}
// ---- AC5 warnings on failure: unknown campus + vanished term guard -> warning before error, other paths too
{
  const existing = join(mkdtempSync(join(tmpdir(), "qa2b-")), "s.json");
  const ok = await run(["--out", existing, "--today", "2026-11-10"], { terms: TERMS, sections: { "202710": rows("202710", 40, 10000), "202730": rows("202730", 40, 30000) } });
  const bytes = readFileSync(existing);
  const bad = [...rows("202710", 5, 10000), sec("202710", 19999, "X1", { campus: "Mars Campus" })];
  const r = await run(["--out", existing, "--today", "2026-11-10"], { terms: TERMS, sections: { "202710": bad, "202730": rows("202730", 40, 30000) } });
  const wi = r.log.findIndex((l) => l.includes("Mars Campus")); const ei = r.log.findIndex((l) => l.startsWith("ERR Error:"));
  check("AC5 setup run ok", ok.code === 0);
  check("AC5 room-drop exit 1 with unknown-campus warning before error", r.code === 1 && wi >= 0 && ei > wi, `warn@${wi} err@${ei}`);
  check("AC5 file byte-identical", readFileSync(existing).equals(bytes));
}
// ---- AC6 --today: no request on invalid
for (const v of ["2026-13-45", "2026-02-29", "2026-11-1", "tomorrow", "2026-04-31", ""]) {
  const r = await run(["--out", join(tmpdir(), "qa2b-none.json"), "--today", v], { terms: TERMS });
  check(`AC6 --today ${JSON.stringify(v)} -> exit 1, 0 requests`, r.code === 1 && r.fb.requests.length === 0 && r.log.some((l) => l.includes(`Invalid --today: ${v}`)), r.log.join(" | "));
}
{ const r = await run(["--out", join(tmpdir(), "qa2b-none.json"), "--today", "2028-02-29", "--dry-run"], { terms: TERMS, sections: {} });
  check("AC6 2028-02-29 accepted (gets past parsing)", r.log.some((l) => l.includes("Today is 2028-02-29")), r.log.slice(-2).join(" | ")); }
// ---- AC1/AC2/AC3 through main(): placeholder rooms, over-match, counts
{
  const rs = ["DEPT", "NA", "OS1", "ROOM", "tba", " NA ", "os12", "N/A", "TBD", "117", "AUD", "BLBX", "NA1", "ROOM 5", "OS", "105A", "DEPT2"];
  const secs = rs.map((room, i) => sec("202710", 10000 + i, room));
  secs.push(sec("202710", 10900, "DEPT", { bldg: "QB", campus: "Burlington" })); // only other-campus section in building QB is a placeholder
  secs.push(sec("202710", 10901, "200", { bldg: "QB" }));
  const unassigned = sec("202710", 10902, "", {}); (unassigned.meetingsFaculty[0].meetingTime as any).room = null; secs.push(unassigned);
  const out = join(mkdtempSync(join(tmpdir(), "qa2b-")), "s.json");
  const r = await run(["--out", out, "--today", "2026-11-10"], { terms: [TERMS[1]], sections: { "202710": secs } });
  const f = JSON.parse(readFileSync(out, "utf8"));
  const ids = f.rooms.map((x: any) => x.id).sort();
  check("AC1/2 kept rooms", JSON.stringify(ids) === JSON.stringify(["QA-105A", "QA-117", "QA-AUD", "QA-BLBX", "QA-DEPT2", "QA-NA1", "QA-OS", "QA-ROOM 5", "QB-200"].sort()), ids.join(","));
  const w = f.warnings.filter((x: string) => x.startsWith("Excluded"));
  check("AC1 one Excluded warning", w.length === 1, w[0]);
  check("AC3 no multi-campus warning for QB", !f.warnings.some((x: string) => x.startsWith("Building QB")));
  const t = f.terms[0];
  check("AC3 meetingCount counts placeholders + unassigned; roomed excludes them", t.meetingCount === secs.length && t.roomedMeetingCount === 9, `meetingCount=${t.meetingCount} roomed=${t.roomedMeetingCount} (sections=${secs.length})`);
  check("AC1 no OAK campus created by placeholder", !f.campuses.some((c: any) => c.code === "OAK"));
}
// ---- AC4 deny-list validation via main()
for (const [name, body] of [["invalid regex", '{"roomPatterns":["^(OS$"]}'], ["empty", '{"roomPatterns":[]}'], ["extra key", '{"roomPatterns":["^NA$"],"buildingCodes":["XCR"]}'], ["not JSON", "{"], ["empty string pattern", '{"roomPatterns":[""]}']]) {
  const p = join(mkdtempSync(join(tmpdir(), "qa2b-")), "deny.json"); writeFileSync(p, body);
  const r = await run(["--out", join(tmpdir(), "qa2b-none.json"), "--today", "2026-11-10"], { terms: TERMS }, undefined, { placeholderFile: p });
  check(`AC4 deny-list ${name} -> exit 1, 0 requests`, r.code === 1 && r.fb.requests.length === 0, r.log.find((l) => l.startsWith("ERR Error")));
}
// ---- AC7 Retry-After via main(): 301 fails without long sleep
{
  let n = 0;
  const r = await run(["--out", join(tmpdir(), "qa2b-none.json"), "--today", "2026-11-10"], { terms: TERMS, intercept: () => (n++ === 0 ? new Response("busy", { status: 503, headers: { "Retry-After": "301" } }) : undefined) });
  check("AC7 Retry-After 301 -> exit 1, no sleep >= 301000, one request", r.code === 1 && !r.sleeps.some((s) => s >= 301000) && r.fb.requests.length === 1, r.log.find((l) => l.startsWith("ERR Error")));
}
console.log(fails === 0 ? "ALL OK" : `${fails} FAILED`);
