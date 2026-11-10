import type { Building, Room } from "@/lib/data/schema";
import type { RoomStatus } from "@/lib/free-rooms";

export type RoomResult = { room: Room; status: RoomStatus };
export type BuildingResult = { building: Building; rooms: RoomResult[]; freeCount: number };

const naturalOrder = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });

/**
 * FR-5 search: case-insensitive, and every whitespace-separated token must be a
 * substring of the room's displayName, building code or room number.
 */
export function matchesQuery(room: Room, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const fields = [room.displayName, room.building, room.room].map((field) => field.toLowerCase());
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}

/**
 * Groups visible rooms by building: buildings sorted by name, rooms in natural
 * order (101, 102, 1001). Busy rooms are dropped unless `showBusy`; buildings
 * left with no rooms are dropped. `freeCount` counts free rooms only.
 */
export function groupByBuilding(
  results: readonly RoomResult[],
  buildings: ReadonlyMap<string, Building>,
  showBusy: boolean,
): BuildingResult[] {
  const groups = new Map<string, RoomResult[]>();
  for (const result of results) {
    if (!showBusy && !result.status.free) continue;
    const list = groups.get(result.room.building);
    if (list === undefined) groups.set(result.room.building, [result]);
    else list.push(result);
  }
  const out: BuildingResult[] = [];
  for (const [code, rooms] of groups) {
    const building = buildings.get(code);
    if (building === undefined) continue; // validateSchedule guarantees every room's building exists
    rooms.sort((a, b) => naturalOrder.compare(a.room.room, b.room.room));
    out.push({ building, rooms, freeCount: rooms.filter((result) => result.status.free).length });
  }
  return out.sort((a, b) => naturalOrder.compare(a.building.name, b.building.name));
}
