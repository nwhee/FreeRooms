import {
  type Calendar,
  type Meeting,
  type Room,
  type ScheduleFile,
  type Term,
  validateSchedule,
} from "../../data/schema";

/**
 * Small hand-built schedules for the FR-4 tests. `makeSchedule` fills in the
 * campus and building counts and runs `validateSchedule`, so every fixture is a
 * file the real loader would accept.
 */

export const MWF = 1 | 4 | 16; // 21

export const FALL: Term = {
  code: "202710",
  description: "Fall 2026 Semester",
  startDate: "2026-09-02",
  endDate: "2026-12-20",
  partsOfTerm: [
    { code: "1", startDate: "2026-09-09", endDate: "2026-12-20" },
    { code: "1L", startDate: "2026-09-02", endDate: "2026-12-04" },
    { code: "2A", startDate: "2026-09-09", endDate: "2026-10-25" },
    { code: "2B", startDate: "2026-11-02", endDate: "2026-12-20" },
    { code: "3C", startDate: "2026-11-16", endDate: "2026-12-20" },
  ],
  meetingCount: 1000,
  roomedMeetingCount: 950,
};

export const SPRING: Term = {
  code: "202730",
  description: "Spring 2027 Semester",
  startDate: "2027-01-13",
  endDate: "2027-05-02",
  partsOfTerm: [{ code: "1", startDate: "2027-01-13", endDate: "2027-05-02" }],
  meetingCount: 1000,
  roomedMeetingCount: 950,
};

/** The 2026-27 rows FR-4's ACs rely on, shaped like FR-6's output. */
export const CALENDAR: Calendar = {
  termYears: ["2027"],
  noClassDates: [
    {
      start: "2026-11-11",
      end: "2026-11-11",
      label: "Veterans Day / Remembrance Day",
      campuses: ["BOS", "VAN"],
    },
    { start: "2026-11-25", end: "2026-11-29", label: "Fall break", campuses: ["BOS", "LDN", "TOR", "VAN"] },
  ],
  examPeriods: [
    { start: "2026-12-07", end: "2026-12-20", label: "Fall Law exam period", partsOfTerm: ["1L"] },
    { start: "2026-12-14", end: "2026-12-20", label: "Fall final exam period", partsOfTerm: ["1"] },
  ],
};

const CAMPUS_ZONES: Record<string, string> = {
  BOS: "America/New_York",
  TOR: "America/Toronto",
  LDN: "Europe/London",
};

export const ROOMS: Room[] = [
  { id: "LDN-DH-1.01", campus: "LDN", building: "LDN-DH", room: "1.01", displayName: "Devon House 1.01" },
  { id: "SL-033", campus: "BOS", building: "SL", room: "033", displayName: "Snell Library 033" },
  { id: "SL-117", campus: "BOS", building: "SL", room: "117", displayName: "Snell Library 117" },
  { id: "TOR-110", campus: "TOR", building: "TOR", room: "110", displayName: "Toronto 110" },
];

/** A recurring full-term MWF meeting in SL-117; override what the test cares about. */
export function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    roomId: "SL-117",
    days: MWF,
    start: 630,
    end: 695,
    startDate: "2026-09-09",
    endDate: "2026-12-20",
    partOfTerm: "1",
    termCode: "202710",
    ...overrides,
  };
}

type ScheduleParts = {
  meetings?: Meeting[];
  terms?: Term[];
  calendar?: Calendar;
  rooms?: Room[];
};

export function makeSchedule({
  meetings = [],
  terms = [FALL, SPRING],
  calendar = CALENDAR,
  rooms = ROOMS,
}: ScheduleParts = {}): ScheduleFile {
  const buildingCodes = [...new Set(rooms.map((room) => room.building))].sort();
  const campusCodes = [...new Set(rooms.map((room) => room.campus))].sort();
  const candidate: ScheduleFile = {
    schemaVersion: 1,
    generatedAt: "2026-11-09T07:00:00.000Z",
    terms,
    campuses: campusCodes.map((code) => ({
      code,
      name: code,
      timezone: CAMPUS_ZONES[code] ?? "America/New_York",
      buildingCount: new Set(rooms.filter((room) => room.campus === code).map((room) => room.building)).size,
      roomCount: rooms.filter((room) => room.campus === code).length,
    })),
    buildings: buildingCodes.map((code) => {
      const inBuilding = rooms.filter((room) => room.building === code);
      return { code, name: code, campus: inBuilding[0].campus, roomCount: inBuilding.length };
    }),
    rooms,
    meetings,
    calendar,
    warnings: [],
  };
  const result = validateSchedule(candidate);
  if (!result.ok) throw new Error(`Invalid test fixture:\n${result.errors.join("\n")}`);
  return result.data;
}
