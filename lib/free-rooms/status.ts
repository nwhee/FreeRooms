import type { Meeting } from "../data/schema";
import type { ScheduleIndex } from "./build-index";
import { covers, dayContext } from "./calendar";
import { assertMinuteOfDay, weekdayBit } from "./time";

export type RoomStatus =
  | { roomId: string; free: true; freeUntil: number | null } // null = rest of day
  | { roomId: string; free: false; busyUntil: number };

/** What decides whether a meeting counts on one date at one campus. */
type DayRules = {
  date: string;
  bit: number;
  /** A no-class entry covers this date for this campus. */
  noClass: boolean;
  /** `partOfTerm` codes suppressed by the active exam periods (from the data). */
  examParts: ReadonlySet<string>;
};

/** FR-0 "Counted meeting": occurs on D and isn't suppressed. One-day meetings are never suppressed. */
function counts(meeting: Meeting, rules: DayRules): boolean {
  if ((meeting.days & rules.bit) === 0) return false;
  if (!covers({ start: meeting.startDate, end: meeting.endDate }, rules.date)) return false;
  const recurring = meeting.startDate < meeting.endDate;
  if (!recurring) return true;
  return !rules.noClass && !rules.examParts.has(meeting.partOfTerm);
}

/** Status of one room at `minutes`, given its meetings sorted by start. */
function statusOf(roomId: string, meetings: readonly Meeting[], rules: DayRules, minutes: number): RoomStatus {
  let blockStart = -1;
  let blockEnd = -1;
  for (const meeting of meetings) {
    if (!counts(meeting, rules)) continue;
    if (meeting.start <= blockEnd) {
      // FR-0 "In use until": blocks merge when the next start <= the current block's end.
      blockEnd = Math.max(blockEnd, meeting.end);
      continue;
    }
    // A new block starts; the previous one is closed.
    if (blockStart <= minutes && minutes < blockEnd) return { roomId, free: false, busyUntil: blockEnd };
    if (meeting.start > minutes) return { roomId, free: true, freeUntil: meeting.start };
    blockStart = meeting.start;
    blockEnd = meeting.end;
  }
  if (blockStart <= minutes && minutes < blockEnd) return { roomId, free: false, busyUntil: blockEnd };
  return { roomId, free: true, freeUntil: null };
}

/**
 * One status per room of `campus` at campus-local `date` and `minutes`.
 * An unknown campus gives an empty array. Throws a RangeError for a malformed
 * date or a minute outside 0–1439.
 */
export function roomStatusesAt(
  index: ScheduleIndex,
  campus: string,
  date: string,
  minutes: number,
): RoomStatus[] {
  assertMinuteOfDay(minutes);
  const context = dayContext(index, campus, date);
  const rules: DayRules = {
    date,
    bit: weekdayBit(date),
    noClass: context.noClass !== null,
    examParts: new Set(context.examPeriods.flatMap((period) => period.partsOfTerm)),
  };
  const rooms = index.roomsByCampus.get(campus) ?? [];
  return rooms.map((room) => statusOf(room.id, index.meetingsByRoom.get(room.id) ?? [], rules, minutes));
}
