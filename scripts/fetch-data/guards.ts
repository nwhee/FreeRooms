import type { Meeting, ScheduleFile, Term } from "../../lib/data/schema";

/**
 * Guards that compare a new run with the existing file (docs/specs/FR-2.md,
 * "Fail loudly"). Each returns one problem per offending term; `--force`
 * turns problems into warnings. A Banner hiccup on one term must never wipe
 * that term's rooms and make them look free.
 */

/** A term below this share of its existing room count fails the run. */
export const MIN_ROOM_SHARE = 0.5;

type NewRun = { terms: readonly Pick<Term, "code">[]; meetings: readonly Pick<Meeting, "roomId" | "termCode">[] };

/**
 * Terms the existing file has in the window (`endDate >= today`) that the new
 * output lacks, whether Banner returned 0 sections or the term fell out.
 */
export function vanishedTermProblems(
  existing: ScheduleFile,
  next: NewRun,
  emptyTerms: ReadonlySet<string>,
  today: string,
): string[] {
  const nextCodes = new Set(next.terms.map((term) => term.code));
  return existing.terms
    .filter((term) => term.endDate >= today && !nextCodes.has(term.code))
    .map((term) => {
      const what = emptyTerms.has(term.code) ? "returned 0 sections" : "is missing from the new output";
      return `Term ${term.code} ${term.description} ${what}, but the existing file has it running until ${term.endDate}. Use --force if this is expected.`;
    });
}

function roomsPerTerm(meetings: NewRun["meetings"]): Map<string, Set<string>> {
  const rooms = new Map<string, Set<string>>();
  for (const meeting of meetings) {
    if (!rooms.has(meeting.termCode)) rooms.set(meeting.termCode, new Set());
    rooms.get(meeting.termCode)?.add(meeting.roomId);
  }
  return rooms;
}

/**
 * Terms in both files whose distinct rooms with a meeting fell below 50% of
 * the existing count. New terms and terms that left the window aren't
 * compared, so the semester switch doesn't trip this.
 */
export function roomDropProblems(existing: ScheduleFile, next: NewRun): string[] {
  const before = roomsPerTerm(existing.meetings);
  const after = roomsPerTerm(next.meetings);
  const nextCodes = new Set(next.terms.map((term) => term.code));
  return existing.terms.flatMap((term) => {
    if (!nextCodes.has(term.code)) return [];
    const was = before.get(term.code)?.size ?? 0;
    const now = after.get(term.code)?.size ?? 0;
    if (now >= was * MIN_ROOM_SHARE) return [];
    return [
      `Term ${term.code} ${term.description} has meetings in ${now} rooms, down from ${was} (below ${MIN_ROOM_SHARE * 100}%). Use --force if this is expected.`,
    ];
  });
}
