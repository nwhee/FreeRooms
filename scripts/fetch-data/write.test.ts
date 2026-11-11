import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ScheduleFile } from "../../lib/data/schema";
import { readExisting, serializeSchedule, shouldWrite, SIZE_WARNING_BYTES, withSizeWarning, writeFileAtomic } from "./write";

const BASE: ScheduleFile = JSON.parse(
  readFileSync(new URL("../../lib/data/__fixtures__/valid-schedule.json", import.meta.url), "utf8"),
) as ScheduleFile;

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempFile(contents?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fr2-write-"));
  tempDirs.push(dir);
  const path = join(dir, "schedule.json");
  if (contents !== undefined) writeFileSync(path, contents);
  return path;
}

describe("size warning (FR-2 AC10)", () => {
  it("adds a warning when the file is over 5 MB", () => {
    const meeting = BASE.meetings[0];
    const big: ScheduleFile = { ...BASE, meetings: Array.from({ length: 60_000 }, () => meeting) };
    expect(Buffer.byteLength(serializeSchedule(big))).toBeGreaterThan(SIZE_WARNING_BYTES);
    const { file, warning } = withSizeWarning(big);
    expect(warning).toMatch(/^schedule\.json is \d+\.\d MB, over the 5 MB budget\.$/);
    expect(file.warnings.at(-1)).toBe(warning);
  });

  it("adds nothing at or under 5 MB", () => {
    expect(withSizeWarning(BASE)).toEqual({ file: BASE, warning: null });
  });
});

describe("shouldWrite (FR-2 AC8)", () => {
  const generatedAt = Date.parse(BASE.generatedAt);
  const at = (hours: number) => new Date(generatedAt + hours * 3_600_000);
  const later = (hours: number): ScheduleFile => ({ ...BASE, generatedAt: at(hours).toISOString() });

  it("skips equal content 23 h old and rewrites it 25 h old", () => {
    const existing = { kind: "valid", schedule: BASE } as const;
    expect(shouldWrite(existing, later(23), at(23))).toBe(false);
    expect(shouldWrite(existing, later(25), at(25))).toBe(true);
  });

  it("rewrites equal content at exactly 24 h (the rule is >= HEARTBEAT_MS)", () => {
    const existing = { kind: "valid", schedule: BASE } as const;
    expect(shouldWrite(existing, later(24), at(24))).toBe(true);
  });

  it("ignores key order when comparing content", () => {
    const reverseKeys = <T extends object>(value: T): T =>
      Object.fromEntries(Object.entries(value).reverse()) as T;
    const reordered = reverseKeys({ ...BASE, meetings: BASE.meetings.map(reverseKeys) });
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(BASE));
    expect(shouldWrite({ kind: "valid", schedule: reordered }, later(1), at(1))).toBe(false);
  });

  it("writes when content differs, or the existing file is absent or invalid", () => {
    const changed = { ...later(1), warnings: ["new"] };
    expect(shouldWrite({ kind: "valid", schedule: BASE }, changed, at(1))).toBe(true);
    expect(shouldWrite({ kind: "absent" }, BASE, at(1))).toBe(true);
    expect(shouldWrite({ kind: "invalid", reason: "x" }, BASE, at(1))).toBe(true);
  });
});

describe("readExisting and writeFileAtomic", () => {
  it("reads absent, invalid and valid files", () => {
    expect(readExisting(tempFile())).toEqual({ kind: "absent" });
    expect(readExisting(tempFile('{"schemaVersion":2}'))).toMatchObject({ kind: "invalid" });
    expect(readExisting(tempFile(serializeSchedule(BASE)))).toMatchObject({ kind: "valid" });
  });

  it("creates missing directories and leaves no temp file", () => {
    const path = join(tempFile(), "..", "deep", "out.json");
    writeFileAtomic(path, "{}");
    expect(readFileSync(path, "utf8")).toBe("{}");
  });
});
