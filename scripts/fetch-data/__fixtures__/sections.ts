import type { BannerSection } from "../banner-client";

/**
 * Builders for Banner-shaped sections, for tests that need many sections
 * (room counts, guards). The captured-shape pages live in the JSON fixtures.
 */

type Day = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type MeetingInput = {
  beginTime?: string | null;
  endTime?: string | null;
  building?: string | null;
  buildingDescription?: string | null;
  room?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  days?: Day[];
};

export type SectionInput = {
  crn: string;
  term?: string;
  campus?: string | null;
  partOfTerm?: string | null;
  meetings?: MeetingInput[];
};

const ALL_DAYS: Day[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** A meetingsFaculty entry with Banner's extra keys, defaulting to a roomed Boston class. */
export function meeting(input: MeetingInput = {}) {
  const days = input.days ?? ["monday", "wednesday"];
  const building = input.building === undefined ? "SL" : input.building;
  return {
    category: "01",
    courseReferenceNumber: "0",
    faculty: [],
    meetingTime: {
      beginTime: input.beginTime === undefined ? "1030" : input.beginTime,
      endTime: input.endTime === undefined ? "1135" : input.endTime,
      building,
      buildingDescription:
        input.buildingDescription === undefined ? (building === null ? null : `${building} Hall`) : input.buildingDescription,
      room: input.room === undefined ? "101" : input.room,
      campus: null,
      campusDescription: null,
      startDate: input.startDate === undefined ? "01/13/2027" : input.startDate,
      endDate: input.endDate === undefined ? "05/02/2027" : input.endDate,
      meetingType: "CLAS",
      meetingTypeDescription: "Class",
      hoursWeek: 2.17,
      ...Object.fromEntries(ALL_DAYS.map((day) => [day, days.includes(day)])),
    },
  };
}

/** A searchResults row. Defaults: term 202730, Boston, part of term "1", one roomed meeting. */
export function section(input: SectionInput): BannerSection & Record<string, unknown> {
  return {
    id: Number(input.crn),
    term: input.term ?? "202730",
    termDesc: "Spring 2027 Semester",
    courseReferenceNumber: input.crn,
    subject: "TEST",
    courseNumber: "1000",
    courseTitle: "Test Course",
    campusDescription: input.campus === undefined ? "Boston" : input.campus,
    scheduleTypeDescription: "Lecture",
    instructionalMethodDescription: "Traditional",
    partOfTerm: input.partOfTerm === undefined ? "1" : input.partOfTerm,
    meetingsFaculty: (input.meetings ?? [{}]).map(meeting),
  };
}

/**
 * `count` sections in `term`, each in its own room `<building>-<n>`, so the
 * term has exactly `count` distinct rooms.
 */
export function roomedSections(
  term: string,
  count: number,
  options: { building?: string; startDate?: string; endDate?: string; crnBase?: number } = {},
): ReturnType<typeof section>[] {
  const building = options.building ?? "RM";
  const crnBase = options.crnBase ?? Number(term.slice(-2)) * 10_000;
  return Array.from({ length: count }, (_, i) =>
    section({
      crn: String(crnBase + i),
      term,
      meetings: [
        {
          building,
          room: String(100 + i),
          startDate: options.startDate ?? (term.endsWith("10") ? "09/09/2026" : "01/13/2027"),
          endDate: options.endDate ?? (term.endsWith("10") ? "12/20/2026" : "05/02/2027"),
        },
      ],
    }),
  );
}
