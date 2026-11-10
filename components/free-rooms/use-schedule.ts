"use client";

import { useCallback, useEffect, useState } from "react";
import { LOCAL_DATA_PATH } from "@/lib/data/data-url";
import { validateSchedule } from "@/lib/data/schema";
import { buildIndex, type ScheduleIndex } from "@/lib/free-rooms";

export type ScheduleState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; index: ScheduleIndex };

export class ScheduleLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleLoadError";
  }
}

/**
 * The one place the data URL is read (FR-0 deploy model). Next inlines
 * NEXT_PUBLIC_* at build time; unset, empty or blank means the local file.
 */
export function dataUrl(): string {
  const url = process.env.NEXT_PUBLIC_DATA_URL?.trim();
  return url ? url : LOCAL_DATA_PATH;
}

/**
 * Fetches and validates the schedule. A plain GET with no credentials or
 * custom headers, so a cross-origin data URL needs no CORS preflight.
 */
export async function loadSchedule(url: string): Promise<ScheduleIndex> {
  const response = await fetch(url);
  if (!response.ok) throw new ScheduleLoadError(`GET ${url} returned HTTP ${response.status}`);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ScheduleLoadError(`GET ${url} did not return JSON`);
  }
  const result = validateSchedule(json);
  if (!result.ok) {
    throw new ScheduleLoadError(`${url} failed validation: ${result.errors.slice(0, 5).join("; ")}`);
  }
  return buildIndex(result.data);
}

/** Loads the schedule once on mount; `retry` loads it again. */
export function useSchedule(): { state: ScheduleState; retry: () => void } {
  const [state, setState] = useState<ScheduleState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    loadSchedule(dataUrl()).then(
      (index) => {
        if (current) setState({ status: "ready", index });
      },
      (error: unknown) => {
        console.error("FreeRooms: couldn't load room data.", error);
        if (current) setState({ status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
