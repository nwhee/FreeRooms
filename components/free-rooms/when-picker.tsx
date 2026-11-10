"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseDateValue, parseTimeValue, toTimeValue } from "./format";

type Props = {
  campusName: string;
  date: string;
  minutes: number;
  isNow: boolean;
  onDateChange: (date: string) => void;
  onTimeChange: (minutes: number) => void;
  onNow: () => void;
};

export function WhenPicker({ campusName, date, minutes, isNow, onDateChange, onTimeChange, onNow }: Props) {
  const dateId = useId();
  const timeId = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={dateId}>Date ({campusName} time)</Label>
          <Input
            id={dateId}
            type="date"
            className="h-11"
            value={date}
            onChange={(event) => {
              const value = parseDateValue(event.target.value);
              if (value !== null) onDateChange(value);
            }}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={timeId}>Time ({campusName} time)</Label>
          <Input
            id={timeId}
            type="time"
            step={300}
            className="h-11"
            value={toTimeValue(minutes)}
            onChange={(event) => {
              const value = parseTimeValue(event.target.value);
              if (value !== null) onTimeChange(value);
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant={isNow ? "default" : "outline"}
          className="h-11 px-4"
          aria-pressed={isNow}
          onClick={onNow}
        >
          Now
        </Button>
        {/* A plain text cue, deliberately not a live region. */}
        <p className="text-sm text-foreground">{isNow ? "Live" : "Showing a chosen time"}</p>
      </div>
    </div>
  );
}
