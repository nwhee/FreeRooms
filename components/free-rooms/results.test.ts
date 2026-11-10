import { describe, expect, it } from "vitest";
import { validateSchedule, type Building, type Room } from "@/lib/data/schema";
import type { RoomStatus } from "@/lib/free-rooms";
import fixture from "./__fixtures__/schedule.json";
import { groupByBuilding, matchesQuery, type RoomResult } from "./results";

const room = (overrides: Partial<Room>): Room => ({
  id: "SL-117",
  campus: "BOS",
  building: "SL",
  room: "117",
  displayName: "Snell Library 117",
  ...overrides,
});

const free: RoomStatus = { roomId: "x", free: true, freeUntil: null };
const busy: RoomStatus = { roomId: "x", free: false, busyUntil: 700 };

describe("fixture", () => {
  it("is a file validateSchedule accepts", () => {
    expect(validateSchedule(fixture)).toMatchObject({ ok: true });
  });
});

describe("matchesQuery (FR-5 search)", () => {
  it("matches tokens case-insensitively against displayName, building code and room number", () => {
    expect(matchesQuery(room({}), "SNELL")).toBe(true);
    expect(matchesQuery(room({}), "sl 117")).toBe(true);
    expect(matchesQuery(room({}), "  117   sl ")).toBe(true);
    expect(matchesQuery(room({}), "libr")).toBe(true);
  });

  it("requires every token to match", () => {
    expect(matchesQuery(room({}), "sl 118")).toBe(false);
    expect(matchesQuery(room({}), "snell dockser")).toBe(false);
  });

  it("matches everything for a blank query", () => {
    expect(matchesQuery(room({}), "   ")).toBe(true);
  });
});

describe("groupByBuilding", () => {
  const buildings = new Map<string, Building>([
    ["SL", { code: "SL", name: "Snell Library", campus: "BOS", roomCount: 4 }],
    ["DK", { code: "DK", name: "Dockser Hall", campus: "BOS", roomCount: 1 }],
    ["AB", { code: "AB", name: "Ell Hall", campus: "BOS", roomCount: 1 }],
  ]);
  const results: RoomResult[] = [
    { room: room({ id: "SL-1001", room: "1001" }), status: free },
    { room: room({ id: "SL-102", room: "102" }), status: busy },
    { room: room({ id: "SL-101", room: "101" }), status: free },
    { room: room({ id: "DK-240", building: "DK", room: "240" }), status: free },
    { room: room({ id: "AB-1", building: "AB", room: "1" }), status: busy },
  ];

  it("sorts buildings by name and rooms in natural order", () => {
    const groups = groupByBuilding(results, buildings, true);
    expect(groups.map((g) => g.building.name)).toEqual(["Dockser Hall", "Ell Hall", "Snell Library"]);
    expect(groups[2].rooms.map((r) => r.room.room)).toEqual(["101", "102", "1001"]);
  });

  it("drops busy rooms and empty buildings when busy rooms are hidden, and counts free rooms only", () => {
    const groups = groupByBuilding(results, buildings, false);
    expect(groups.map((g) => g.building.name)).toEqual(["Dockser Hall", "Snell Library"]);
    expect(groups[1].rooms.map((r) => r.room.room)).toEqual(["101", "1001"]);
    expect(groupByBuilding(results, buildings, true)[2].freeCount).toBe(2);
  });
});
