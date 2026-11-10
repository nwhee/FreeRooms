"use client";

import { useEffect, useState } from "react";

export const NOW_REFRESH_MS = 60_000;

/** Milliseconds from `ms` to the next whole minute (a full minute when already on one). */
export function msToNextMinute(ms: number): number {
  return NOW_REFRESH_MS - (ms % NOW_REFRESH_MS);
}

/**
 * The current instant for FR-5 Now mode. The first refresh lands on the next
 * minute boundary, then it refreshes every 60 s, so the shown minute changes
 * when the wall clock's does.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), NOW_REFRESH_MS);
    }, msToNextMinute(Date.now()));
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);
  return now;
}
