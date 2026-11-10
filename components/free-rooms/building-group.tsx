import { useId } from "react";
import { RoomCard } from "./room-card";
import type { BuildingResult } from "./results";

export function BuildingGroup({ group }: { group: BuildingResult }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-base font-semibold break-words text-foreground">
        {group.building.name} · {group.freeCount} free
      </h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {group.rooms.map((result) => (
          <RoomCard key={result.room.id} result={result} />
        ))}
      </ul>
    </section>
  );
}
