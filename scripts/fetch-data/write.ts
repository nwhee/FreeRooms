import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type Calendar, type ScheduleFile, validateSchedule } from "../../lib/data/schema";
import type { ScheduleEntities } from "./transform";

/**
 * Assembling, comparing and writing schedule.json (docs/specs/FR-2.md,
 * "Write rule"). Output is minified with arrays sorted as FR-0 specifies.
 */

/** Rewrite unchanged content once the existing file is this old, so it never looks stale. */
export const HEARTBEAT_MS = 48 * 60 * 60 * 1000;
/** FR-0 size budget. */
export const SIZE_WARNING_BYTES = 5_000_000;

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The complete file with every array in FR-0 order. */
export function buildScheduleFile(input: {
  entities: ScheduleEntities;
  calendar: Calendar;
  warnings: readonly string[];
  generatedAt: string;
}): ScheduleFile {
  const { entities } = input;
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    terms: [...entities.terms]
      .map((term) => ({ ...term, partsOfTerm: [...term.partsOfTerm].sort((a, b) => compare(a.code, b.code)) }))
      .sort((a, b) => compare(a.code, b.code)),
    campuses: [...entities.campuses].sort(
      (a, b) => Number(b.code === "BOS") - Number(a.code === "BOS") || compare(a.name, b.name),
    ),
    buildings: [...entities.buildings].sort((a, b) => compare(a.code, b.code)),
    rooms: [...entities.rooms].sort((a, b) => compare(a.id, b.id)),
    meetings: [...entities.meetings].sort(
      (a, b) =>
        compare(a.roomId, b.roomId) ||
        compare(a.startDate, b.startDate) ||
        a.start - b.start ||
        a.end - b.end ||
        compare(a.termCode, b.termCode) ||
        // Not required by FR-0; makes the order total so output is deterministic.
        a.days - b.days ||
        compare(a.endDate, b.endDate) ||
        compare(a.partOfTerm, b.partOfTerm),
    ),
    calendar: input.calendar,
    warnings: [...input.warnings],
  };
}

export function serializeSchedule(file: ScheduleFile): string {
  return JSON.stringify(file);
}

/** The file with a warning added when its minified size is over the budget. */
export function withSizeWarning(file: ScheduleFile, limitBytes = SIZE_WARNING_BYTES): ScheduleFile {
  const bytes = Buffer.byteLength(serializeSchedule(file));
  if (bytes <= limitBytes) return file;
  const warning = `schedule.json is ${(bytes / 1_000_000).toFixed(1)} MB, over the ${limitBytes / 1_000_000} MB budget.`;
  return { ...file, warnings: [...file.warnings, warning] };
}

/** JSON with object keys sorted, so key order can't make equal content look different. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => compare(a, b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentWithoutGeneratedAt(file: ScheduleFile): string {
  return canonical({ ...file, generatedAt: null });
}

export type ExistingFile =
  | { kind: "absent" }
  | { kind: "invalid"; reason: string }
  | { kind: "valid"; schedule: ScheduleFile };

/** The current `--out` file, if any. Guards and the write rule compare against it. */
export function readExisting(path: string): ExistingFile {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { kind: "absent" };
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "invalid", reason: "it is not JSON" };
  }
  const result = validateSchedule(json);
  if (!result.ok) return { kind: "invalid", reason: result.errors.slice(0, 3).join("; ") };
  return { kind: "valid", schedule: result.data };
}

/** Whether to write `next`: content changed, or the existing file is due a heartbeat. */
export function shouldWrite(existing: ExistingFile, next: ScheduleFile, now: Date): boolean {
  if (existing.kind !== "valid") return true;
  if (contentWithoutGeneratedAt(existing.schedule) !== contentWithoutGeneratedAt(next)) return true;
  return now.getTime() - Date.parse(existing.schedule.generatedAt) >= HEARTBEAT_MS;
}

/** Writes through a temp file and a rename, so a crash never leaves a half-written file. */
export function writeFileAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, path);
}
