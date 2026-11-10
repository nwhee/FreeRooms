"use client";

import { useEffect, useState } from "react";

export const NOW_REFRESH_MS = 60_000;

/** The current instant, refreshed every 60 s (FR-5 Now mode). */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), NOW_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}
