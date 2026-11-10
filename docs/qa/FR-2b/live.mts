// FR-2b AC9 checks on the live output. Usage: npx tsx docs/qa/FR-2b/live.mts <fr2b-schedule.json> <fr2-schedule.json>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const W = resolve(new URL("../../..", import.meta.url).pathname);
const { validateSchedule } = await import(`${W}/lib/data/schema.ts`);
const [newPath, oldPath] = process.argv.slice(2);
const txt = readFileSync(newPath, "utf8"); const f = JSON.parse(txt); const o = JSON.parse(readFileSync(oldPath, "utf8"));
const v = validateSchedule(f); console.log("validateSchedule ok:", v.ok, v.ok ? "" : v.errors.slice(0, 5));
const EXPECT = "BOS-DEPT, MSI-NA, NY-FND-OS1, NY-FND-OS2, NY-FND-OS3, NY-FND-OS4, NY-FND-OS5, XCR-ROOM";
const ex = f.warnings.filter((w: string) => w.startsWith("Excluded"));
console.log("Excluded warnings:", ex);
console.log("Excluded ids exactly the 8:", ex.length === 1 && ex[0].endsWith(": " + EXPECT));
const P = o.rooms.length, n = f.rooms.length; const lo = Math.ceil((P - 8) * 0.95), hi = Math.floor((P - 8) * 1.05);
console.log(`rooms ${n}, P=${P}, window ${lo}-${hi}:`, n >= lo && n <= hi);
const ids = new Set(f.rooms.map((r: any) => r.id)); const oldIds = new Set(o.rooms.map((r: any) => r.id));
for (const id of ["EL-AUD", "NY-CH-BLBX", "NY-CH-DS", "NY-CH-GHE", "NY-CH-GHW", "NY-NH-THTR"]) console.log(`  ${id}: in FR-2 file=${oldIds.has(id)} in FR-2b file=${ids.has(id)}`);
const placeholders = EXPECT.split(", "); console.log("placeholder ids still present:", placeholders.filter((p) => ids.has(p)));
console.log("placeholder meetings left:", f.meetings.filter((m: any) => placeholders.includes(m.roomId)).length);
const gone = [...oldIds].filter((x) => !ids.has(x)); const added = [...ids].filter((x) => !oldIds.has(x));
console.log(`rooms gone vs FR-2 (${gone.length}):`, gone.join(","), `| added (${added.length}):`, added.join(","));
const noDigit = f.rooms.filter((r: any) => !/\d/.test(r.room)).map((r: any) => r.id); console.log("rooms with no digit in room:", noDigit.join(","));
const oldPh = o.meetings.filter((m: any) => placeholders.includes(m.roomId));
const phByTerm: Record<string, number> = {}; for (const m of oldPh) phByTerm[m.termCode] = (phByTerm[m.termCode] ?? 0) + 1;
console.log("FR-2 file placeholder meetings per term (after collapse):", JSON.stringify(phByTerm));
for (const t of f.terms) { const ot = o.terms.find((x: any) => x.code === t.code);
  console.log(`term ${t.code}: meetingCount ${ot?.meetingCount} -> ${t.meetingCount} (Δ${t.meetingCount - ot?.meetingCount}); roomed ${ot?.roomedMeetingCount} -> ${t.roomedMeetingCount} (Δ${t.roomedMeetingCount - ot?.roomedMeetingCount})`); }
console.log("warnings:", JSON.stringify(f.warnings));
console.log("'@' count:", (txt.match(/@/g) ?? []).length, "bytes", txt.length, "generatedAt", f.generatedAt);
