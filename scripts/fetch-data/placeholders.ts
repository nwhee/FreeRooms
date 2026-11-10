import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * The placeholder-room deny-list (docs/specs/FR-2b.md): Banner "rooms" such
 * as DEPT, NA or OS1 that aren't classrooms. Patterns live in
 * placeholder-rooms.json so new kinds are fixed by editing data, not code.
 */

/** Summary warnings list at most this many room ids. */
export const MAX_LISTED_PLACEHOLDERS = 20;

/** The deny-list file can't be used. The run must fail. */
export class PlaceholderListError extends Error {
  constructor(file: string, detail: string) {
    super(`${file}: ${detail}`);
    this.name = "PlaceholderListError";
  }
}

const placeholderListSchema = z.strictObject({
  roomPatterns: z.array(z.string().min(1, { error: "must not be empty" })).min(1, { error: "must not be empty" }),
});

/** Case-insensitive regexes from the file at `path`, validated. */
export function loadPlaceholderPatterns(path: string): RegExp[] {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new PlaceholderListError(path, `cannot read deny-list (${error instanceof Error ? error.message : String(error)})`);
  }
  const parsed = placeholderListSchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    );
    throw new PlaceholderListError(path, details.join("; "));
  }
  return parsed.data.roomPatterns.map((pattern, i) => {
    try {
      return new RegExp(pattern, "i");
    } catch (error) {
      throw new PlaceholderListError(
        path,
        `roomPatterns.${i}: ${JSON.stringify(pattern)} is not a valid regex (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  });
}

/** True when the trimmed `room` matches a deny-list pattern. */
export function isPlaceholderRoom(patterns: readonly RegExp[], room: string): boolean {
  const trimmed = room.trim();
  return patterns.some((pattern) => pattern.test(trimmed));
}

/** `Excluded <N> placeholder rooms (<M> meetings): <ids>`, listing at most 20 ids. */
export function placeholderWarning(meetingsByRoomId: ReadonlyMap<string, number>): string | null {
  if (meetingsByRoomId.size === 0) return null;
  const ids = [...meetingsByRoomId.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const meetings = [...meetingsByRoomId.values()].reduce((sum, count) => sum + count, 0);
  const listed = ids.slice(0, MAX_LISTED_PLACEHOLDERS);
  if (ids.length > MAX_LISTED_PLACEHOLDERS) listed.push(`…and ${ids.length - MAX_LISTED_PLACEHOLDERS} more`);
  return `Excluded ${ids.length} placeholder rooms (${meetings} meetings): ${listed.join(", ")}`;
}
