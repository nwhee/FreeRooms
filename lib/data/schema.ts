import { z } from "zod";

/**
 * The schedule.json data contract, schemaVersion 1 (docs/specs/FR-0-overview.md).
 * Field-level rules live in the Zod schema; rules that compare fields or
 * entities run in `validateSchedule` after the parse. Objects are strict:
 * unknown keys are rejected, so a typo in the writer fails loudly.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** True when `Intl.DateTimeFormat` accepts the value as a time zone. */
export function isValidTimeZone(value: string): boolean {
  if (value === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const isoDateSchema = z.string().refine(isIsoDate, {
  error: (issue) => `must be a date in YYYY-MM-DD format, got ${JSON.stringify(issue.input)}`,
});

const countSchema = z.int().min(0, { error: "must be a non-negative integer" });

function intRange(min: number, max: number) {
  const error = `must be an integer from ${min} to ${max}`;
  return z.int({ error }).min(min, { error }).max(max, { error });
}

export const partOfTermSchema = z.strictObject({
  code: z.string().min(1),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
});

export const termSchema = z.strictObject({
  code: z.string().min(1),
  description: z.string(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  partsOfTerm: z.array(partOfTermSchema),
  meetingCount: countSchema,
  roomedMeetingCount: countSchema,
});

export const campusSchema = z.strictObject({
  code: z.string().min(1),
  name: z.string(),
  timezone: z.string().refine(isValidTimeZone, {
    error: (issue) =>
      `${JSON.stringify(issue.input)} is not a time zone accepted by Intl.DateTimeFormat`,
  }),
  buildingCount: countSchema,
  roomCount: countSchema,
});

export const buildingSchema = z.strictObject({
  code: z.string().min(1),
  name: z.string(),
  campus: z.string().min(1),
  roomCount: countSchema,
});

export const roomSchema = z.strictObject({
  id: z.string().min(1),
  campus: z.string().min(1),
  building: z.string().min(1),
  room: z.string().min(1),
  displayName: z.string(),
});

export const meetingSchema = z.strictObject({
  roomId: z.string().min(1),
  days: intRange(1, 127),
  start: intRange(0, 1439),
  end: intRange(1, 1440),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  partOfTerm: z.string().min(1),
  termCode: z.string().min(1),
});

export const noClassDateSchema = z.strictObject({
  start: isoDateSchema,
  end: isoDateSchema,
  label: z.string(),
  campuses: z.array(z.string().min(1)),
});

export const examPeriodSchema = z.strictObject({
  start: isoDateSchema,
  end: isoDateSchema,
  label: z.string(),
  partsOfTerm: z.array(z.string().min(1)).min(1, { error: "must not be empty" }),
});

export const calendarSchema = z.strictObject({
  termYears: z.array(z.string().regex(/^\d{4}$/, { error: "must be a 4-digit year" })),
  noClassDates: z.array(noClassDateSchema),
  examPeriods: z.array(examPeriodSchema),
});

export const scheduleFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime({ error: "must be an ISO 8601 UTC timestamp" }),
  terms: z.array(termSchema),
  campuses: z.array(campusSchema),
  buildings: z.array(buildingSchema),
  rooms: z.array(roomSchema),
  meetings: z.array(meetingSchema),
  calendar: calendarSchema,
  warnings: z.array(z.string()),
});

export type ScheduleFile = z.infer<typeof scheduleFileSchema>;
export type Term = z.infer<typeof termSchema>;
export type PartOfTerm = z.infer<typeof partOfTermSchema>;
export type Campus = z.infer<typeof campusSchema>;
export type Building = z.infer<typeof buildingSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type Calendar = z.infer<typeof calendarSchema>;
export type NoClassDate = z.infer<typeof noClassDateSchema>;
export type ExamPeriod = z.infer<typeof examPeriodSchema>;

export type ValidationResult = { ok: true; data: ScheduleFile } | { ok: false; errors: string[] };

/** `["meetings", 3, "days"]` -> `"meetings[3].days"`. */
function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, key) => {
    if (typeof key === "number") return `${out}[${key}]`;
    const name = String(key);
    return out === "" ? name : `${out}.${name}`;
  }, "");
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

/** One error per repeated key, pointing at the repeat and its first occurrence. */
function duplicateErrors<T>(items: readonly T[], list: string, field: string, key: (item: T) => string): string[] {
  const firstIndex = new Map<string, number>();
  const errors: string[] = [];
  items.forEach((item, i) => {
    const value = key(item);
    const first = firstIndex.get(value);
    if (first === undefined) firstIndex.set(value, i);
    else errors.push(`${list}[${i}].${field}: duplicate "${value}" (first at ${list}[${first}])`);
  });
  return errors;
}

/** The FR-0 invariants that compare fields or entities. Assumes a successful parse. */
function checkInvariants(data: ScheduleFile): string[] {
  const errors: string[] = [
    ...duplicateErrors(data.campuses, "campuses", "code", (campus) => campus.code),
    ...duplicateErrors(data.buildings, "buildings", "code", (building) => building.code),
    ...duplicateErrors(data.rooms, "rooms", "id", (room) => room.id),
  ];
  const campusCodes = new Set(data.campuses.map((campus) => campus.code));
  const termCodes = new Set(data.terms.map((term) => term.code));
  const campusOfBuilding = new Map(data.buildings.map((building) => [building.code, building.campus]));
  const roomIds = new Set(data.rooms.map((room) => room.id));

  const checkRange = (path: string, startKey: string, start: string, endKey: string, end: string) => {
    // YYYY-MM-DD strings compare correctly as text.
    if (start > end) errors.push(`${path}: ${startKey} ${start} is after ${endKey} ${end}`);
  };

  data.terms.forEach((term, i) => {
    checkRange(`terms[${i}]`, "startDate", term.startDate, "endDate", term.endDate);
    term.partsOfTerm.forEach((part, j) => {
      checkRange(`terms[${i}].partsOfTerm[${j}]`, "startDate", part.startDate, "endDate", part.endDate);
    });
    if (term.roomedMeetingCount > term.meetingCount) {
      errors.push(
        `terms[${i}].roomedMeetingCount: ${term.roomedMeetingCount} exceeds meetingCount ${term.meetingCount}`,
      );
    }
  });

  const buildingsPerCampus = countBy(data.buildings, (building) => building.campus);
  const roomsPerCampus = countBy(data.rooms, (room) => room.campus);
  const roomsPerBuilding = countBy(data.rooms, (room) => room.building);

  data.campuses.forEach((campus, i) => {
    const buildings = buildingsPerCampus.get(campus.code) ?? 0;
    if (campus.buildingCount !== buildings) {
      errors.push(
        `campuses[${i}].buildingCount: is ${campus.buildingCount} but ${buildings} buildings have campus "${campus.code}"`,
      );
    }
    const rooms = roomsPerCampus.get(campus.code) ?? 0;
    if (campus.roomCount !== rooms) {
      errors.push(
        `campuses[${i}].roomCount: is ${campus.roomCount} but ${rooms} rooms have campus "${campus.code}"`,
      );
    }
    // FR-0: `campuses` lists only campuses with at least one room.
    if (rooms === 0) errors.push(`campuses[${i}]: campus "${campus.code}" has no rooms`);
  });

  data.buildings.forEach((building, i) => {
    if (!campusCodes.has(building.campus)) {
      errors.push(`buildings[${i}].campus: unknown campus "${building.campus}"`);
    }
    const rooms = roomsPerBuilding.get(building.code) ?? 0;
    if (building.roomCount !== rooms) {
      errors.push(
        `buildings[${i}].roomCount: is ${building.roomCount} but ${rooms} rooms have building "${building.code}"`,
      );
    }
  });

  data.rooms.forEach((room, i) => {
    const buildingCampus = campusOfBuilding.get(room.building);
    if (buildingCampus === undefined) {
      errors.push(`rooms[${i}].building: unknown building "${room.building}"`);
    }
    if (!campusCodes.has(room.campus)) {
      errors.push(`rooms[${i}].campus: unknown campus "${room.campus}"`);
    } else if (buildingCampus !== undefined && room.campus !== buildingCampus) {
      errors.push(
        `rooms[${i}].campus: is "${room.campus}" but building "${room.building}" is in campus "${buildingCampus}"`,
      );
    }
  });

  data.meetings.forEach((meeting, i) => {
    if (!roomIds.has(meeting.roomId)) {
      errors.push(`meetings[${i}].roomId: unknown room "${meeting.roomId}"`);
    }
    if (!termCodes.has(meeting.termCode)) {
      errors.push(`meetings[${i}].termCode: unknown term "${meeting.termCode}"`);
    }
    if (meeting.start >= meeting.end) {
      errors.push(`meetings[${i}]: start ${meeting.start} is not before end ${meeting.end}`);
    }
    checkRange(`meetings[${i}]`, "startDate", meeting.startDate, "endDate", meeting.endDate);
  });

  data.calendar.noClassDates.forEach((entry, i) => {
    checkRange(`calendar.noClassDates[${i}]`, "start", entry.start, "end", entry.end);
  });
  data.calendar.examPeriods.forEach((entry, i) => {
    checkRange(`calendar.examPeriods[${i}]`, "start", entry.start, "end", entry.end);
  });

  return errors;
}

/**
 * Parses `json` against the schedule.json contract, then checks every FR-0
 * invariant. Each error names the path of the offending field.
 */
export function validateSchedule(json: unknown): ValidationResult {
  const parsed = scheduleFileSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = formatPath(issue.path);
        return path === "" ? issue.message : `${path}: ${issue.message}`;
      }),
    };
  }
  const errors = checkInvariants(parsed.data);
  return errors.length === 0 ? { ok: true, data: parsed.data } : { ok: false, errors };
}
