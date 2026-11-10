import { formatMinutes } from "@/lib/free-rooms";
import { cn } from "@/lib/utils";
import type { RoomResult } from "./results";

function statusText({ status }: RoomResult): string {
  if (!status.free) return `In use until ${formatMinutes(status.busyUntil)}`;
  return status.freeUntil === null ? "Free for the rest of the day" : `Free until ${formatMinutes(status.freeUntil)}`;
}

export function RoomCard({ result }: { result: RoomResult }) {
  const free = result.status.free;
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border bg-background px-4 py-3",
        free ? "border-l-4 border-border border-l-primary" : "border-dashed border-input",
      )}
    >
      <span className={cn("font-medium break-words", free ? "text-foreground" : "text-muted-foreground")}>
        {result.room.displayName}
      </span>
      <span className={cn("text-sm", free ? "text-foreground" : "text-muted-foreground")}>
        {statusText(result)}
      </span>
    </li>
  );
}
