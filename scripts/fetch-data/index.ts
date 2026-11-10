import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildCalendarBlock, CalendarFileError, loadCalendarFiles, missingCalendarWarnings } from "../../lib/calendar/load";
import { isIsoDate, type Term, validateSchedule } from "../../lib/data/schema";
import { BannerClient, BannerError, type FetchLike, type Sleep } from "./banner-client";
import { newYorkDate } from "./dates";
import { roomDropProblems, vanishedTermProblems } from "./guards";
import { loadPlaceholderPatterns, PlaceholderListError } from "./placeholders";
import { dedupeSections, type FetchedTerm, selectTermsToFetch, transformTerms } from "./transform";
import { buildScheduleFile, readExisting, serializeSchedule, shouldWrite, withSizeWarning, writeFileAtomic } from "./write";

/**
 * `npm run fetch-data`: Banner -> public/data/schedule.json (docs/specs/FR-2.md).
 * Exits 1 and leaves the existing file untouched when anything looks wrong.
 * Never runs git; FR-3 publishes the file.
 */

export const DEFAULT_OUT = "public/data/schedule.json";
/** The spec's floor is 2,000 ms; the team's politeness rule asks for at least 3 s. */
export const DEFAULT_DELAY_MS = 3_000;
export const MIN_DELAY_MS = 1_000;
const DEFAULT_CALENDAR_DIR = fileURLToPath(new URL("../../data/calendar", import.meta.url));
const DEFAULT_PLACEHOLDER_FILE = fileURLToPath(new URL("./placeholder-rooms.json", import.meta.url));

export type MainDeps = {
  fetch: FetchLike;
  sleep: Sleep;
  now: () => Date;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  calendarDir: string;
  placeholderFile: string;
};

const defaultDeps: MainDeps = {
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  now: () => new Date(),
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  calendarDir: DEFAULT_CALENDAR_DIR,
  placeholderFile: DEFAULT_PLACEHOLDER_FILE,
};

/** A reason to stop with exit 1 and leave the existing file untouched. */
class RunFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunFailure";
  }
}

type Options = { out: string; today: string | null; delayMs: number; force: boolean; dryRun: boolean };

function parseOptions(argv: string[]): Options {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        out: { type: "string" },
        today: { type: "string" },
        "delay-ms": { type: "string" },
        force: { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new RunFailure(error instanceof Error ? error.message : String(error));
  }
  if (values.today !== undefined && !isIsoDate(values.today)) {
    throw new RunFailure(`Invalid --today: ${values.today}`);
  }
  const delayMs = values["delay-ms"] === undefined ? DEFAULT_DELAY_MS : Number(values["delay-ms"]);
  if (!Number.isInteger(delayMs) || delayMs < MIN_DELAY_MS) {
    throw new RunFailure(`--delay-ms must be an integer of at least ${MIN_DELAY_MS}, got ${values["delay-ms"]}`);
  }
  return {
    out: values.out ?? DEFAULT_OUT,
    today: values.today ?? null,
    delayMs,
    force: values.force,
    dryRun: values["dry-run"],
  };
}

export function summaryLine(file: {
  terms: readonly Term[];
  campuses: readonly unknown[];
  buildings: readonly unknown[];
  rooms: readonly unknown[];
  meetings: readonly unknown[];
}): string {
  const terms = file.terms.map((term) => {
    const roomed = term.meetingCount === 0 ? 0 : Math.round((term.roomedMeetingCount / term.meetingCount) * 100);
    return `${term.code} ${term.description} (${term.startDate}..${term.endDate}, ${roomed}% roomed)`;
  });
  return [
    `Terms: ${terms.join(", ")}`,
    `campuses ${file.campuses.length}`,
    `buildings ${file.buildings.length}`,
    `rooms ${file.rooms.length}`,
    `meetings ${file.meetings.length}`,
  ].join(" | ");
}

/** Warnings so far. Owned by main(), so a failed run still prints them (FR-2b). */
type WarningLog = { warnings: string[]; printed: boolean };

function printWarnings(log: WarningLog, print: (line: string) => void): void {
  if (log.printed) return;
  log.printed = true;
  for (const text of log.warnings) print(`::warning::${text}`);
}

async function run(options: Options, deps: MainDeps, warningLog: WarningLog): Promise<void> {
  const { warnings } = warningLog;
  const startedAt = deps.now();
  const today = options.today ?? newYorkDate(startedAt);
  const log = deps.stdout;
  const placeholderPatterns = loadPlaceholderPatterns(deps.placeholderFile);

  const existing = readExisting(options.out);
  if (existing.kind === "invalid") {
    warnings.push(`Existing ${options.out} is not a valid schedule (${existing.reason}); comparison guards skipped.`);
  }
  const existingSchedule = existing.kind === "valid" ? existing.schedule : null;
  const existingInWindow = new Set(
    (existingSchedule?.terms ?? []).filter((term) => term.endDate >= today).map((term) => term.code),
  );

  const client = new BannerClient({
    fetch: deps.fetch,
    sleep: deps.sleep,
    delayMs: options.delayMs,
    now: () => deps.now().getTime(),
  });
  const toFetch = selectTermsToFetch(await client.getTerms(), existingSchedule?.terms ?? [], today);
  if (toFetch.length === 0) throw new RunFailure("Banner lists no terms to fetch (every term is View Only).");
  log(`Today is ${today}. Fetching ${toFetch.map((term) => term.code).join(", ")}.`);

  const fetched: FetchedTerm[] = [];
  const emptyTerms = new Set<string>();
  for (const term of toFetch) {
    let { totalCount, sections } = await client.searchTerm(term.code);
    let unique = dedupeSections(sections).length;
    log(`  ${term.code} ${term.description}: ${unique} of ${totalCount} sections.`);
    if (totalCount > 0 && unique < totalCount) {
      // Banner's paging can repeat a row and skip another while data shifts.
      // Re-fetch the term once from scratch (FR-2b Solution 7), then re-check.
      warnings.push(`Term ${term.code}: re-fetched after a paging shortfall (${unique}/${totalCount})`);
      ({ totalCount, sections } = await client.searchTerm(term.code));
      unique = dedupeSections(sections).length;
      log(`  ${term.code} ${term.description}: re-fetched, ${unique} of ${totalCount} sections.`);
    }
    if (totalCount > 0 && unique < totalCount) {
      throw new RunFailure(`Term ${term.code}: fetched ${unique} unique sections but Banner reported ${totalCount}.`);
    }
    if (unique === 0) {
      emptyTerms.add(term.code);
      // An existing in-window term with 0 sections is the vanished-term guard's job.
      if (!existingInWindow.has(term.code)) warnings.push(`Term ${term.code} ${term.description} returned no sections.`);
    }
    fetched.push({ ...term, sections });
  }

  const entities = transformTerms(fetched, today, placeholderPatterns);
  for (const { code, reason } of entities.skipped) log(`  ${code} left out: ${reason}.`);
  warnings.push(...entities.warnings);
  if (entities.terms.length === 0) throw new RunFailure(`No terms left after the date window for ${today}.`);

  const calendarSources = loadCalendarFiles(deps.calendarDir);
  warnings.push(...missingCalendarWarnings(entities.terms.map((term) => term.code), calendarSources));

  if (existingSchedule) {
    const problems = [
      ...vanishedTermProblems(existingSchedule, entities, emptyTerms, today),
      ...roomDropProblems(existingSchedule, entities),
    ];
    if (problems.length > 0 && !options.force) throw new RunFailure(problems.join("\n"));
    warnings.push(...problems.map((problem) => `--force overrode: ${problem}`));
  }

  const file = withSizeWarning(
    buildScheduleFile({
      entities,
      calendar: buildCalendarBlock(calendarSources),
      warnings,
      generatedAt: startedAt.toISOString(),
    }),
  );
  warnings.push(...file.warnings.slice(warnings.length));

  const validation = validateSchedule(file);
  if (!validation.ok) {
    const shown = validation.errors.slice(0, 10).join("\n  ");
    const more = validation.errors.length > 10 ? `\n  ...and ${validation.errors.length - 10} more` : "";
    throw new RunFailure(`The output fails validateSchedule:\n  ${shown}${more}`);
  }
  if (file.rooms.length === 0 || file.meetings.length === 0) {
    throw new RunFailure(`The output has ${file.rooms.length} rooms and ${file.meetings.length} meetings.`);
  }

  printWarnings(warningLog, log);
  log(summaryLine(file));
  const seconds = Math.round((deps.now().getTime() - startedAt.getTime()) / 1000);
  log(`Banner requests: ${client.requestCount} in ${seconds} s.`);

  if (options.dryRun) {
    log("Dry run; not writing.");
  } else if (shouldWrite(existing, file, deps.now())) {
    const text = serializeSchedule(file);
    writeFileAtomic(options.out, text);
    log(`Wrote ${options.out} (${Buffer.byteLength(text)} bytes).`);
  } else {
    log("No change; not writing.");
  }
}

/** Runs the script and returns its exit code. Tests inject `deps`; nothing here calls process.exit. */
export async function main(argv: string[], deps: Partial<MainDeps> = {}): Promise<number> {
  const resolved: MainDeps = { ...defaultDeps, ...deps };
  const warningLog: WarningLog = { warnings: [], printed: false };
  try {
    await run(parseOptions(argv), resolved, warningLog);
    return 0;
  } catch (error) {
    printWarnings(warningLog, resolved.stdout);
    if (
      error instanceof RunFailure ||
      error instanceof BannerError ||
      error instanceof CalendarFileError ||
      error instanceof PlaceholderListError
    ) {
      resolved.stderr(`Error: ${error.message}`);
    } else {
      resolved.stderr(`Error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    }
    resolved.stderr("Existing output left untouched.");
    return 1;
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
