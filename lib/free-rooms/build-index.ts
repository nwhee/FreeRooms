import type { Meeting, Room, ScheduleFile } from "../data/schema";

/**
 * A lookup structure over one schedule file. Build it once per loaded file with
 * `buildIndex`, then pass it to every `dayContext` / `roomStatusesAt` call.
 */
export type ScheduleIndex = {
  readonly data: ScheduleFile;
  /** Rooms per campus code, in file order (sorted by id). */
  readonly roomsByCampus: ReadonlyMap<string, readonly Room[]>;
  /** Meetings per room id, sorted by `start` then `end`. */
  readonly meetingsByRoom: ReadonlyMap<string, readonly Meeting[]>;
};

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/** Groups meetings by room and rooms by campus. Assumes `data` passed `validateSchedule`. */
export function buildIndex(data: ScheduleFile): ScheduleIndex {
  const roomsByCampus = new Map<string, Room[]>();
  for (const room of data.rooms) push(roomsByCampus, room.campus, room);

  const meetingsByRoom = new Map<string, Meeting[]>();
  for (const meeting of data.meetings) push(meetingsByRoom, meeting.roomId, meeting);
  for (const meetings of meetingsByRoom.values()) {
    meetings.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  return { data, roomsByCampus, meetingsByRoom };
}
