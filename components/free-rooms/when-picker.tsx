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
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-36 flex-1 flex-col gap-2">
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
      <div className="flex min-w-28 flex-1 flex-col gap-2">
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
      <Button
        type="button"
        variant={isNow ? "default" : "outline"}
        className="h-11 px-4"
        aria-pressed={isNow}
        onClick={onNow}
      >
        Now
      </Button>
    </div>
  );
}
