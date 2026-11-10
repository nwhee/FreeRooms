"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  showBusy: boolean;
  onShowBusyChange: (showBusy: boolean) => void;
};

export function RoomSearch({ query, onQueryChange, showBusy, onShowBusyChange }: Props) {
  const searchId = useId();
  const switchId = useId();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor={searchId}>Search rooms</Label>
        <Input
          id={searchId}
          type="search"
          className="h-11"
          placeholder="Building or room, e.g. snell 117"
          autoComplete="off"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="flex h-11 items-center gap-3">
        <Switch id={switchId} checked={showBusy} onCheckedChange={onShowBusyChange} />
        <Label htmlFor={switchId}>Show rooms in use</Label>
      </div>
    </div>
  );
}
