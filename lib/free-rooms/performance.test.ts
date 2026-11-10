import { describe, expect, it } from "vitest";
import type { Meeting, Room } from "../data/schema";
import { makeSchedule } from "./__fixtures__/schedule";
import { buildIndex } from "./build-index";
import { roomStatusesAt } from "./status";

const ROOM_COUNT = 1000;
const MEETING_COUNT = 20_000;

/** 1,000 BOS rooms in 20 buildings, 20 meetings each, spread over the day and week. */
function generatedSchedule() {
  const rooms: Room[] = Array.from({ length: ROOM_COUNT }, (_, i) => {
    const building = `B${String(i % 20).padStart(2, "0")}`;
    const room = String(i).padStart(4, "0");
    return { id: `${building}-${room}`, campus: "BOS", building, room, displayName: `${building} ${room}` };
  });
  rooms.sort((a, b) => (a.id < b.id ? -1 : 1));
  const meetings: Meeting[] = Array.from({ length: MEETING_COUNT }, (_, i) => {
    const start = 480 + ((i * 37) % 720);
    return {
      roomId: rooms[i % ROOM_COUNT].id,
      days: (i % 127) + 1,
      start,
      end: start + 65,
      startDate: "2026-09-09",
      endDate: "2026-12-20",
      partOfTerm: i % 3 === 0 ? "2B" : "1",
      termCode: "202710",
    };
  });
  return makeSchedule({ rooms, meetings });
}

describe("AC14 performance", () => {
  it("roomStatusesAt for 1,000 rooms / 20,000 meetings has a median of 5 runs under 500 ms", () => {
    // buildIndex runs once; only roomStatusesAt is timed.
    const index = buildIndex(generatedSchedule());
    expect(index.data.meetings).toHaveLength(MEETING_COUNT);

    roomStatusesAt(index, "BOS", "2026-11-18", 600); // warm-up
    const runs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      const statuses = roomStatusesAt(index, "BOS", "2026-11-18", 600 + run);
      runs.push(performance.now() - started);
      expect(statuses).toHaveLength(ROOM_COUNT);
    }
    const median = [...runs].sort((a, b) => a - b)[2];
    expect(median).toBeLessThan(500);
  });
});
