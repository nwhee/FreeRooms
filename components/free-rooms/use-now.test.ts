// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { msToNextMinute, useNow } from "./use-now";

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow: minute-aligned refresh", () => {
  it("computes the delay to the next minute boundary", () => {
    expect(msToNextMinute(Date.parse("2026-11-18T15:00:30.000Z"))).toBe(30_000);
    expect(msToNextMinute(Date.parse("2026-11-18T15:00:59.999Z"))).toBe(1);
    expect(msToNextMinute(Date.parse("2026-11-18T15:00:00.000Z"))).toBe(60_000);
  });

  it("first ticks on the next minute boundary, then every 60 s, and clears its timers", () => {
    vi.useFakeTimers({ now: new Date("2026-11-18T15:00:30.000Z") });
    const { result, unmount } = renderHook(() => useNow());
    expect(result.current.toISOString()).toBe("2026-11-18T15:00:30.000Z");

    act(() => vi.advanceTimersByTime(29_999));
    expect(result.current.toISOString()).toBe("2026-11-18T15:00:30.000Z");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toISOString()).toBe("2026-11-18T15:01:00.000Z");

    act(() => vi.advanceTimersByTime(59_999));
    expect(result.current.toISOString()).toBe("2026-11-18T15:01:00.000Z");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toISOString()).toBe("2026-11-18T15:02:00.000Z");

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
