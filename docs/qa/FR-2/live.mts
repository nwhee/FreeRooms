const W = "/Users/jonathanding/Documents/Coding/VSCode/Projects/Claude/FreeRooms/.claude/worktrees/agent-a388033982bdfade0";
import { readFileSync } from "node:fs";
const { validateSchedule } = await import(`${W}/lib/data/schema.ts`);
const txt = readFileSync(`${W}/public/data/schedule.json`, "utf8");
const f = JSON.parse(txt);
const v = validateSchedule(f);
console.log("validateSchedule ok:", v.ok, v.ok ? "" : v.errors.slice(0, 5));
console.log("bytes", txt.length, "minified", !txt.includes("\n"), "generatedAt", f.generatedAt, "schemaVersion", f.schemaVersion);
console.log("rooms", f.rooms.length, "meetings", f.meetings.length, "buildings", f.buildings.length, "campuses", f.campuses.map((c: any) => `${c.code}:${c.roomCount}`).join(" "));
console.log("DK rooms", f.rooms.filter((r: any) => r.id.startsWith("DK-")).map((r: any) => r.id + "/" + r.campus).join(", "));
const parts: Record<string, number> = {}; for (const m of f.meetings) parts[m.partOfTerm] = (parts[m.partOfTerm] ?? 0) + 1;
console.log("partOfTerm counts", JSON.stringify(parts));
console.log("terms", JSON.stringify(f.terms.map((t: any) => ({ ...t, partsOfTerm: t.partsOfTerm.map((p: any) => `${p.code}:${p.startDate}..${p.endDate}`) }))));
console.log("warnings", JSON.stringify(f.warnings));
console.log("calendar keys", Object.keys(f.calendar ?? {}));
// personal data
const emails = txt.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g); console.log("emails", emails?.slice(0, 5) ?? "none", "'@' count", (txt.match(/@/g) ?? []).length);
const keys = new Set<string>(); const walk = (o: any) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") for (const k of Object.keys(o)) { keys.add(k); walk(o[k]); } }; walk(f);
console.log("all keys", [...keys].sort().join(","));
console.log("faculty/instructor substrings", /faculty|instructor|displayName"|bannerId|email/i.test(txt));
// plausibility
let bad = 0; const byTerm = new Map(f.terms.map((t: any) => [t.code, t]));
for (const m of f.meetings) {
  const t: any = byTerm.get(m.termCode);
  if (!(m.start >= 6 * 60 && m.end <= 23 * 60 && m.start < m.end && m.end - m.start <= 6 * 60 && m.days >= 1 && m.days <= 127 && m.startDate <= m.endDate && t && m.startDate >= t.startDate && m.endDate <= t.endDate)) bad++;
}
console.log("implausible meetings (outside 06:00-23:00, >6h, outside term):", bad);
const early = f.meetings.filter((m: any) => m.start < 7 * 60 || m.end > 22 * 60).length; console.log("meetings before 07:00 or after 22:00:", early);
const roomIds = new Set(f.rooms.map((r: any) => r.id)); console.log("meetings with unknown roomId", f.meetings.filter((m: any) => !roomIds.has(m.roomId)).length, "rooms with no meetings", f.rooms.filter((r: any) => !f.meetings.some((m: any) => m.roomId === r.id)).length);
const bc = new Map(f.buildings.map((b: any) => [b.code, b.campus])); console.log("room.campus != building.campus", f.rooms.filter((r: any) => bc.get(r.building) !== r.campus).length);
// random sample (seeded)
let seed = 20261109; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const dayStr = (d: number) => ["M", "T", "W", "R", "F", "S", "U"].filter((_, i) => d & (1 << i)).join("");
for (let i = 0; i < 5; i++) {
  const r = f.rooms[Math.floor(rnd() * f.rooms.length)];
  const ms = f.meetings.filter((m: any) => m.roomId === r.id);
  const m = ms[Math.floor(rnd() * ms.length)];
  console.log(`ROOM ${JSON.stringify(r)} meetings=${ms.length}\n   sample: ${dayStr(m.days)} ${fmt(m.start)}-${fmt(m.end)} ${m.startDate}..${m.endDate} part ${m.partOfTerm} term ${m.termCode}`);
}
for (let i = 0; i < 5; i++) { const m = f.meetings[Math.floor(rnd() * f.meetings.length)]; console.log(`MEETING ${m.roomId} ${dayStr(m.days)} ${fmt(m.start)}-${fmt(m.end)} ${m.startDate}..${m.endDate} part ${m.partOfTerm} term ${m.termCode}`); }
const cps = f.meetings.filter((m: any) => ["2A","2B","3A","3B","3C"].includes(m.partOfTerm)).slice(0, 3); console.log("CPS samples", JSON.stringify(cps));
const dk = f.meetings.filter((m: any) => m.roomId.startsWith("DK-")).slice(0, 3); console.log("DK samples", JSON.stringify(dk));
