import { CAMPUSES, campusFromBannerName } from "../../lib/data/campuses";
import type { Building, Campus, Meeting, PartOfTerm, Room, Term } from "../../lib/data/schema";
import type { BannerMeetingTime, BannerSection, BannerTerm } from "./banner-client";
import { addDays, parseBannerDate, parseBannerTime } from "./dates";
import { decodeEntities } from "./entities";

/**
 * Banner sections -> the FR-0 schedule.json entities (docs/specs/FR-2.md,
 * Solution step 3). Pure: no I/O, no clock. `today` is a YYYY-MM-DD date.
 * Output order is settled later by `buildScheduleFile` (write.ts).
 */

/** Terms starting more than this many days after today are left out. */
export const LOOK_AHEAD_DAYS = 120;

const VIEW_ONLY_SUFFIX = /\s*\(View Only\)\s*$/;
/** Banner's virtual building, "Virtual Space- Online class". */
const VIRTUAL_BUILDING = "VTL";
/** Section campuses with no rooms. Skipped silently; other unmapped names warn. */
const NON_PHYSICAL_CAMPUSES = new Set(["online", "online contingency", "no campus no room needed"]);
/** Banner leaves partOfTerm empty on a few sections; they run the full term. */
const DEFAULT_PART_OF_TERM = "1";

export type TermToFetch = { code: string; description: string };
export type FetchedTerm = TermToFetch & { sections: BannerSection[] };

export type ScheduleEntities = {
  terms: Term[];
  campuses: Campus[];
  buildings: Building[];
  rooms: Room[];
  meetings: Meeting[];
};

export type TransformResult = ScheduleEntities & {
  warnings: string[];
  /** Terms left out of the output, with why. For the log; not warnings. */
  skipped: { code: string; reason: string }[];
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function stripViewOnly(description: string): string {
  return decodeEntities(description).replace(VIEW_ONLY_SUFFIX, "").trim();
}

/**
 * The terms to fetch, sorted by code: every Banner term not marked
 * "(View Only)" (any code suffix), plus every term in the existing file that
 * hasn't ended, even if Banner now marks it View Only or no longer lists it.
 */
export function selectTermsToFetch(
  bannerTerms: readonly BannerTerm[],
  existingTerms: readonly Pick<Term, "code" | "description" | "endDate">[],
  today: string,
): TermToFetch[] {
  const selected = new Map<string, TermToFetch>();
  const bannerByCode = new Map(bannerTerms.map((term) => [term.code, term]));
  for (const term of bannerTerms) {
    if (!VIEW_ONLY_SUFFIX.test(term.description)) {
      selected.set(term.code, { code: term.code, description: stripViewOnly(term.description) });
    }
  }
  for (const term of existingTerms) {
    if (term.endDate >= today && !selected.has(term.code)) {
      const banner = bannerByCode.get(term.code);
      selected.set(term.code, {
        code: term.code,
        description: banner ? stripViewOnly(banner.description) : term.description,
      });
    }
  }
  return [...selected.values()].sort((a, b) => compare(a.code, b.code));
}

/** Sections with a repeated `term + courseReferenceNumber` dropped (first one kept). */
export function dedupeSections(sections: readonly BannerSection[]): BannerSection[] {
  const seen = new Set<string>();
  return sections.filter((section) => {
    const key = `${section.term}\u0000${section.courseReferenceNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Code-unit string order, so output order doesn't depend on the locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const DAY_BITS: [keyof BannerMeetingTime, number][] = [
  ["monday", 1],
  ["tuesday", 2],
  ["wednesday", 4],
  ["thursday", 8],
  ["friday", 16],
  ["saturday", 32],
  ["sunday", 64],
];

function dayMask(meetingTime: BannerMeetingTime): number {
  return DAY_BITS.reduce((mask, [day, bit]) => (meetingTime[day] === true ? mask | bit : mask), 0);
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function meetingTimes(section: BannerSection): BannerMeetingTime[] {
  return (section.meetingsFaculty ?? []).flatMap((entry) => (entry.meetingTime ? [entry.meetingTime] : []));
}

type DateRange = { startDate: string; endDate: string };

function widen(range: DateRange | undefined, startDate: string, endDate: string): DateRange {
  if (!range) return { startDate, endDate };
  return {
    startDate: startDate < range.startDate ? startDate : range.startDate,
    endDate: endDate > range.endDate ? endDate : range.endDate,
  };
}

/** Term and part-of-term ranges from every dated meeting, roomed or not. */
function termRanges(sections: readonly BannerSection[]) {
  let term: DateRange | undefined;
  const parts = new Map<string, DateRange>();
  for (const section of sections) {
    const part = nonEmpty(section.partOfTerm) ?? DEFAULT_PART_OF_TERM;
    for (const meetingTime of meetingTimes(section)) {
      const startDate = parseBannerDate(meetingTime.startDate);
      const endDate = parseBannerDate(meetingTime.endDate);
      if (startDate === null || endDate === null || startDate > endDate) continue;
      term = widen(term, startDate, endDate);
      parts.set(part, widen(parts.get(part), startDate, endDate));
    }
  }
  const partsOfTerm: PartOfTerm[] = [...parts]
    .map(([code, range]) => ({ code, ...range }))
    .sort((a, b) => compare(a.code, b.code));
  return { range: term, partsOfTerm };
}

/** A roomed candidate meeting before building campuses are settled and duplicates collapse. */
type RawMeeting = Meeting & { building: string; buildingName: string | null; room: string; campus: string };

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Keys by count, highest first, ties by lowest key. */
function rankByCount(counts: Map<string, number>): string[] {
  return [...counts].sort((a, b) => b[1] - a[1] || compare(a[0], b[0])).map(([key]) => key);
}

export function transformTerms(fetched: readonly FetchedTerm[], today: string): TransformResult {
  const warnings: string[] = [];
  const skipped: TransformResult["skipped"] = [];
  const terms: Term[] = [];
  const rawMeetings: RawMeeting[] = [];
  const unknownCampuses = new Map<string, number>();
  const lastStart = addDays(today, LOOK_AHEAD_DAYS);

  for (const fetchedTerm of fetched) {
    const sections = dedupeSections(fetchedTerm.sections);
    if (sections.length === 0) {
      skipped.push({ code: fetchedTerm.code, reason: "no sections" });
      continue;
    }
    const { range, partsOfTerm } = termRanges(sections);
    if (!range) {
      skipped.push({ code: fetchedTerm.code, reason: "no dated meetings" });
      warnings.push(`Term ${fetchedTerm.code} ${fetchedTerm.description} has no dated meetings; skipped.`);
      continue;
    }
    if (range.endDate < today) {
      skipped.push({ code: fetchedTerm.code, reason: `ended ${range.endDate}` });
      continue;
    }
    if (range.startDate > lastStart) {
      skipped.push({ code: fetchedTerm.code, reason: `starts ${range.startDate}, after ${lastStart}` });
      continue;
    }

    let meetingCount = 0;
    let roomedMeetingCount = 0;
    let unusable = 0;
    for (const section of sections) {
      const campusName = decodeEntities(section.campusDescription ?? "").trim();
      const campus = campusFromBannerName(campusName);
      const partOfTerm = nonEmpty(section.partOfTerm) ?? DEFAULT_PART_OF_TERM;
      for (const meetingTime of meetingTimes(section)) {
        const days = dayMask(meetingTime);
        if (meetingTime.beginTime == null || meetingTime.endTime == null || days === 0) continue;
        const building = nonEmpty(meetingTime.building);
        if (building === VIRTUAL_BUILDING) continue;
        if (!campus) {
          if (!NON_PHYSICAL_CAMPUSES.has(normalizeName(campusName))) {
            increment(unknownCampuses, campusName === "" ? "(none)" : campusName);
          }
          continue;
        }
        meetingCount++;
        const room = nonEmpty(meetingTime.room);
        if (building === null || room === null) continue;
        roomedMeetingCount++;

        const start = parseBannerTime(meetingTime.beginTime);
        const end = parseBannerTime(meetingTime.endTime);
        const startDate = parseBannerDate(meetingTime.startDate);
        const endDate = parseBannerDate(meetingTime.endDate);
        if (start === null || end === null || start >= end || startDate === null || endDate === null || startDate > endDate) {
          unusable++;
          continue;
        }
        const buildingName = nonEmpty(meetingTime.buildingDescription);
        rawMeetings.push({
          roomId: `${building}-${room}`,
          days,
          start,
          end,
          startDate,
          endDate,
          partOfTerm,
          termCode: fetchedTerm.code,
          building,
          buildingName: buildingName === null ? null : decodeEntities(buildingName),
          room,
          campus: campus.code,
        });
      }
    }
    if (unusable > 0) {
      warnings.push(
        `Term ${fetchedTerm.code}: ${unusable} roomed meeting${unusable === 1 ? " has" : "s have"} unreadable or inverted times or dates; skipped.`,
      );
    }
    terms.push({
      code: fetchedTerm.code,
      description: fetchedTerm.description,
      ...range,
      partsOfTerm,
      meetingCount,
      roomedMeetingCount,
    });
  }

  for (const [name, count] of [...unknownCampuses].sort((a, b) => compare(a[0], b[0]))) {
    warnings.push(`Unknown campus "${name}" on ${count} meeting${count === 1 ? "" : "s"}; skipped.`);
  }

  // One campus per building: the most common section campus, ties to the lowest code.
  const campusCounts = new Map<string, Map<string, number>>();
  const nameCounts = new Map<string, Map<string, number>>();
  for (const meeting of rawMeetings) {
    if (!campusCounts.has(meeting.building)) campusCounts.set(meeting.building, new Map());
    increment(campusCounts.get(meeting.building)!, meeting.campus);
    if (meeting.buildingName !== null) {
      if (!nameCounts.has(meeting.building)) nameCounts.set(meeting.building, new Map());
      increment(nameCounts.get(meeting.building)!, meeting.buildingName);
    }
  }
  const campusOfBuilding = new Map<string, string>();
  for (const [building, counts] of [...campusCounts].sort((a, b) => compare(a[0], b[0]))) {
    const ranked = rankByCount(counts);
    campusOfBuilding.set(building, ranked[0]);
    if (ranked.length > 1) {
      warnings.push(`Building ${building} has sections from campuses ${ranked.join(", ")}; assigned ${ranked[0]}.`);
    }
  }
  const buildingName = (code: string) => {
    const names = nameCounts.get(code);
    return names ? rankByCount(names)[0] : code;
  };

  // Keyed by building and room, not by id, so two rooms that share an id
  // reach validateSchedule as a duplicate instead of merging silently.
  const roomsByKey = new Map<string, Room>();
  for (const meeting of rawMeetings) {
    const key = `${meeting.building}\u0000${meeting.room}`;
    if (!roomsByKey.has(key)) {
      roomsByKey.set(key, {
        id: meeting.roomId,
        campus: campusOfBuilding.get(meeting.building)!,
        building: meeting.building,
        room: meeting.room,
        displayName: `${buildingName(meeting.building)} ${meeting.room}`,
      });
    }
  }
  const rooms = [...roomsByKey.values()];

  const roomsPerBuilding = new Map<string, number>();
  rooms.forEach((room) => increment(roomsPerBuilding, room.building));
  const buildings: Building[] = [...campusOfBuilding].map(([code, campus]) => ({
    code,
    name: buildingName(code),
    campus,
    roomCount: roomsPerBuilding.get(code) ?? 0,
  }));

  const campuses: Campus[] = CAMPUSES.flatMap((definition) => {
    const roomCount = rooms.filter((room) => room.campus === definition.code).length;
    if (roomCount === 0) return [];
    return [
      {
        code: definition.code,
        name: definition.name,
        timezone: definition.timezone,
        buildingCount: buildings.filter((building) => building.campus === definition.code).length,
        roomCount,
      },
    ];
  });

  // Collapse identical meetings (cross-listed sections, the same class in two
  // terms), keeping the lowest term code. A different partOfTerm keeps both.
  const collapsed = new Map<string, Meeting>();
  for (const raw of rawMeetings) {
    const { roomId, days, start, end, startDate, endDate, partOfTerm, termCode } = raw;
    const key = [roomId, days, start, end, startDate, endDate, partOfTerm].join("\u0000");
    const existing = collapsed.get(key);
    if (!existing || termCode < existing.termCode) {
      collapsed.set(key, { roomId, days, start, end, startDate, endDate, partOfTerm, termCode });
    }
  }

  return { terms, campuses, buildings, rooms, meetings: [...collapsed.values()], warnings, skipped };
}
