/**
 * Pure free-room logic (docs/specs/FR-4.md), implementing the FR-0 definitions.
 * No clock reads, no I/O: callers pass the instant or the campus-local date and minute.
 */
export { buildIndex, type ScheduleIndex } from "./build-index";
export { dayContext, type DayContext, type IncompleteTerm } from "./calendar";
export { roomStatusesAt, type RoomStatus } from "./status";
export { formatMinutes, isStale, localNow, weekdayBit, type LocalNow, type Weekday } from "./time";
