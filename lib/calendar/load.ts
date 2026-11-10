import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CAMPUSES } from "../data/campuses";
import { isIsoDate, type Calendar } from "../data/schema";

/**
 * Hand-maintained academic calendars, one file per academic year in
 * `data/calendar/<YYYY-YYYY>.json` (docs/specs/FR-6.md). The loader validates
 * the files; `buildCalendarBlock` turns them into the `calendar` block of
 * schedule.json (FR-0), expanding campus scopes into campus codes.
 */

/** Region tokens a `scope` may use besides campus codes. LDN has no region token. */
const REGION_TOKENS = ["USA", "CAN"] as const;
const SCOPE_TOKENS = new Set<string>(["ALL", ...REGION_TOKENS, ...CAMPUSES.map((campus) => campus.code)]);

const isoDateSchema = z.string().refine(isIsoDate, {
  error: (issue) => `must be a date in YYYY-MM-DD format, got ${JSON.stringify(issue.input)}`,
});

const labelSchema = z.string().min(1, { error: "must not be empty" });

/**
 * Adds an error on `end` when `start` is after it. YYYY-MM-DD compares correctly
 * as text. Skipped unless both are valid dates, so a bad date reports only its own error.
 */
function withStartNotAfterEnd<T extends z.ZodType<{ start: string; end: string }>>(schema: T) {
  return schema.superRefine((entry, ctx) => {
    if (isIsoDate(entry.start) && isIsoDate(entry.end) && entry.start > entry.end) {
      ctx.addIssue({ code: "custom", path: ["end"], message: `start ${entry.start} is after end ${entry.end}` });
    }
  });
}

const noClassDateSourceSchema = withStartNotAfterEnd(
  z.strictObject({
    start: isoDateSchema,
    end: isoDateSchema,
    label: labelSchema,
    scope: z
      .array(
        z.string().refine((token) => SCOPE_TOKENS.has(token), {
          error: (issue) =>
            `unknown scope token ${JSON.stringify(issue.input)} (use ALL, USA, CAN or a campus code)`,
        }),
      )
      .min(1, { error: "must not be empty" }),
  }),
);

const examPeriodSourceSchema = withStartNotAfterEnd(
  z.strictObject({
    start: isoDateSchema,
    end: isoDateSchema,
    label: labelSchema,
    partsOfTerm: z
      .array(z.string().min(1, { error: "must not be empty" }), {
        error: "must be a non-empty array of strings",
      })
      .min(1, { error: "must be a non-empty array of strings" }),
  }),
);

const calendarSourceSchema = z
  .strictObject({
    academicYear: z.string().regex(/^\d{4}-\d{4}$/, { error: "must be YYYY-YYYY, e.g. 2026-2027" }),
    termYear: z.string().regex(/^\d{4}$/, { error: "must be a 4-digit year" }),
    source: z.url({ error: "must be a URL" }),
    sourcePostedDate: isoDateSchema,
    noClassDates: z.array(noClassDateSourceSchema),
    examPeriods: z.array(examPeriodSourceSchema),
  })
  .superRefine((source, ctx) => {
    const [first, second] = source.academicYear.split("-").map(Number);
    if (second !== first + 1) {
      ctx.addIssue({
        code: "custom",
        path: ["academicYear"],
        message: `${source.academicYear} is not two consecutive years`,
      });
    } else if (source.termYear !== String(second)) {
      // Term codes carry the year the academic year ends in (Fall 2026 = 202710).
      ctx.addIssue({
        code: "custom",
        path: ["termYear"],
        message: `must be ${second} for academic year ${source.academicYear}, got ${source.termYear}`,
      });
    }
  });

export type CalendarSource = z.infer<typeof calendarSourceSchema>;

/** A calendar file that can't be used. The message names the file and the field. */
export class CalendarFileError extends Error {
  constructor(
    readonly file: string,
    detail: string,
  ) {
    super(`${file}: ${detail}`);
    this.name = "CalendarFileError";
  }
}

/** `["noClassDates", 3, "start"]` -> `"noClassDates[3].start"`. */
function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, key) => {
    if (typeof key === "number") return `${out}[${key}]`;
    const name = String(key);
    return out === "" ? name : `${out}.${name}`;
  }, "");
}

function parseCalendarFile(file: string, text: string): CalendarSource {
  let json: unknown;
  try {
    // Editors on Windows may save a UTF-8 BOM, which JSON.parse rejects.
    json = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    throw new CalendarFileError(file, `malformed JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  const parsed = calendarSourceSchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => {
      const path = formatPath(issue.path);
      return path === "" ? issue.message : `${path}: ${issue.message}`;
    });
    throw new CalendarFileError(file, details.join("; "));
  }
  return parsed.data;
}

/**
 * Reads and validates every `*.json` file in `dir`, in file-name order.
 * An empty directory gives `[]`. Throws a `CalendarFileError` naming the file
 * and field for the first file that is invalid, or naming `dir` if it can't be read.
 */
export function loadCalendarFiles(dir: string): CalendarSource[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new CalendarFileError(
      dir,
      `cannot read calendar directory (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const fileByTermYear = new Map<string, string>();
  return fileNames.map((fileName) => {
    const file = join(dir, fileName);
    const source = parseCalendarFile(file, readFileSync(file, "utf8"));

    const expectedName = `${source.academicYear}.json`;
    if (fileName !== expectedName) {
      throw new CalendarFileError(
        file,
        `academicYear: is "${source.academicYear}", so the file must be named ${expectedName}`,
      );
    }
    const other = fileByTermYear.get(source.termYear);
    if (other !== undefined) {
      throw new CalendarFileError(file, `termYear: "${source.termYear}" is also used by ${other}`);
    }
    fileByTermYear.set(source.termYear, file);
    return source;
  });
}

const ALL_CAMPUS_CODES = CAMPUSES.map((campus) => campus.code);

/** Campus codes for scope tokens: ALL, a region, or a campus code. Sorted and de-duplicated. */
function expandScope(scope: readonly string[]): string[] {
  const codes = new Set<string>();
  for (const token of scope) {
    if (token === "ALL") {
      ALL_CAMPUS_CODES.forEach((code) => codes.add(code));
    } else if ((REGION_TOKENS as readonly string[]).includes(token)) {
      CAMPUSES.filter((campus) => campus.region === token).forEach((campus) => codes.add(campus.code));
    } else {
      codes.add(token);
    }
  }
  return [...codes].sort();
}

function byStart(a: { start: string; end: string; label: string }, b: { start: string; end: string; label: string }) {
  return a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.label.localeCompare(b.label);
}

/**
 * The `calendar` block of schedule.json: every source's entries with scopes
 * expanded to campus codes, sorted by `start`, plus the sorted term years covered.
 */
export function buildCalendarBlock(sources: readonly CalendarSource[]): Calendar {
  return {
    termYears: sources.map((source) => source.termYear).sort(),
    noClassDates: sources
      .flatMap((source) => source.noClassDates)
      .map(({ start, end, label, scope }) => ({ start, end, label, campuses: expandScope(scope) }))
      .sort(byStart),
    examPeriods: sources
      .flatMap((source) => source.examPeriods)
      .map(({ start, end, label, partsOfTerm }) => ({ start, end, label, partsOfTerm: [...partsOfTerm] }))
      .sort(byStart),
  };
}

/**
 * One warning per term (in input order, duplicates dropped) whose 4-digit year
 * prefix has no calendar source. Term 202810 belongs to academic year 2027-2028.
 */
export function missingCalendarWarnings(termCodes: readonly string[], sources: readonly CalendarSource[]): string[] {
  const covered = new Set(sources.map((source) => source.termYear));
  return [...new Set(termCodes)].flatMap((termCode) => {
    if (!/^\d{4}/.test(termCode)) {
      throw new Error(`Term code ${JSON.stringify(termCode)} does not start with a 4-digit year`);
    }
    const termYear = termCode.slice(0, 4);
    if (covered.has(termYear)) return [];
    const expectedFile = `data/calendar/${Number(termYear) - 1}-${termYear}.json`;
    return [
      `Term ${termCode} has no academic calendar file (expected ${expectedFile}); no-class days and exam periods will be missing.`,
    ];
  });
}
