"use client";

import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Campus } from "@/lib/data/schema";
import { localNow, roomStatusesAt, type ScheduleIndex } from "@/lib/free-rooms";
import { BuildingGroup } from "./building-group";
import { CampusTabs } from "./campus-tabs";
import { DataHeader } from "./data-header";
import { groupByBuilding, matchesQuery, type RoomResult } from "./results";
import { RoomSearch } from "./room-search";
import { StatusBanners } from "./status-banners";
import { useNow } from "./use-now";
import { useSchedule } from "./use-schedule";
import { WhenPicker } from "./when-picker";

/**
 * Now mode follows the selected campus's clock. Time-travel mode keeps a
 * wall-clock date and time that is read in whichever campus is selected (FR-0 Q4).
 */
type When = { mode: "now" } | { mode: "fixed"; date: string; minutes: number };

export function FreeRoomsApp() {
  const { state, retry } = useSchedule();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState onRetry={retry} />}
      {state.status === "ready" && <FreeRoomsView index={state.index} />}
      <footer className="mt-auto text-sm text-muted-foreground">
        Shows scheduled classes only. Rooms may be locked or booked for events.
      </footer>
    </main>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-label="Loading room data" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive" role="alert" className="flex flex-col items-start gap-3 px-4 py-3">
      <AlertDescription className="text-destructive">Couldn&apos;t load room data. Try again later.</AlertDescription>
      <Button type="button" variant="outline" className="h-11 px-4" onClick={onRetry}>
        Retry
      </Button>
    </Alert>
  );
}

function FreeRoomsView({ index }: { index: ScheduleIndex }) {
  const { campuses } = index.data;
  const [campusCode, setCampusCode] = useState(
    () => (campuses.find((campus) => campus.code === "BOS") ?? campuses[0]).code,
  );
  const [when, setWhen] = useState<When>({ mode: "now" });
  const [query, setQuery] = useState("");
  const [showBusy, setShowBusy] = useState(false);
  const now = useNow();

  return (
    <>
      <DataHeader data={index.data} />
      <CampusTabs campuses={campuses} value={campusCode} onValueChange={setCampusCode}>
        {(campus) => {
          const { date, minutes } = when.mode === "now" ? localNow(campus.timezone, now) : when;
          return (
            <>
              <WhenPicker
                campusName={campus.name}
                date={date}
                minutes={minutes}
                isNow={when.mode === "now"}
                onDateChange={(next) => setWhen({ mode: "fixed", date: next, minutes })}
                onTimeChange={(next) => setWhen({ mode: "fixed", date, minutes: next })}
                onNow={() => setWhen({ mode: "now" })}
              />
              <RoomSearch
                query={query}
                onQueryChange={setQuery}
                showBusy={showBusy}
                onShowBusyChange={setShowBusy}
              />
              <StatusBanners index={index} campus={campus} date={date} now={now} />
              <CampusResults
                index={index}
                campus={campus}
                date={date}
                minutes={minutes}
                query={query}
                showBusy={showBusy}
              />
            </>
          );
        }}
      </CampusTabs>
    </>
  );
}

type ResultsProps = {
  index: ScheduleIndex;
  campus: Campus;
  date: string;
  minutes: number;
  query: string;
  showBusy: boolean;
};

function CampusResults({ index, campus, date, minutes, query, showBusy }: ResultsProps) {
  const buildings = useMemo(
    () => new Map(index.data.buildings.map((building) => [building.code, building])),
    [index],
  );
  const results = useMemo<RoomResult[]>(() => {
    const rooms = index.roomsByCampus.get(campus.code) ?? [];
    const statuses = roomStatusesAt(index, campus.code, date, minutes);
    return rooms.map((room, i) => ({ room, status: statuses[i] }));
  }, [index, campus.code, date, minutes]);

  const trimmed = query.trim();
  const matched = trimmed === "" ? results : results.filter((result) => matchesQuery(result.room, trimmed));
  const groups = groupByBuilding(matched, buildings, showBusy);

  if (matched.length === 0) {
    return <p className="text-foreground">No rooms match &quot;{trimmed}&quot;.</p>;
  }
  if (groups.length === 0) {
    return <p className="text-foreground">No free rooms at this time.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <BuildingGroup key={group.building.code} group={group} />
      ))}
    </div>
  );
}
