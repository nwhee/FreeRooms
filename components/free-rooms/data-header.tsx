import type { ScheduleFile } from "@/lib/data/schema";
import { formatUpdatedAt } from "./format";

export function DataHeader({ data }: { data: ScheduleFile }) {
  const covers = data.terms.map((term) => term.description).join(", ");
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">FreeRooms</h1>
      <p className="text-sm text-muted-foreground">Covers: {covers}</p>
      <p className="text-sm text-muted-foreground">Updated {formatUpdatedAt(data.generatedAt)}</p>
    </header>
  );
}
