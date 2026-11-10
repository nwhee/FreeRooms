import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/schedule.json";
import { dataUrl, loadSchedule, ScheduleLoadError } from "./use-schedule";

function stubFetch(body: unknown, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AC2: data URL", () => {
  it("fetches exactly NEXT_PUBLIC_DATA_URL when it is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_URL", "https://example.test/schedule.json");
    const fetchMock = stubFetch(fixture);
    await loadSchedule(dataUrl());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://example.test/schedule.json");
  });

  it.each([undefined, "", "   "])("falls back to /data/schedule.json when it is %j", async (value) => {
    vi.stubEnv("NEXT_PUBLIC_DATA_URL", value);
    const fetchMock = stubFetch(fixture);
    await loadSchedule(dataUrl());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/data/schedule.json");
  });

  it("is read in one place, use-schedule.ts", () => {
    const dir = __dirname;
    const readers = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(join(dir, file), "utf8").includes("NEXT_PUBLIC_DATA_URL"));
    expect(readers).toEqual(["use-schedule.ts"]);
  });
});

describe("AC1: loadSchedule rejects bad data", () => {
  it("rejects an HTTP error such as a missing local file", async () => {
    stubFetch({}, { status: 404 });
    await expect(loadSchedule("/data/schedule.json")).rejects.toThrow(ScheduleLoadError);
  });

  it("rejects schemaVersion 2", async () => {
    stubFetch({ ...fixture, schemaVersion: 2 });
    await expect(loadSchedule("/data/schedule.json")).rejects.toThrow(/failed validation/);
  });

  it("rejects a body that isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    await expect(loadSchedule("/data/schedule.json")).rejects.toThrow(/did not return JSON/);
  });

  it("builds the index for a valid file", async () => {
    stubFetch(fixture);
    const index = await loadSchedule("/data/schedule.json");
    expect(index.roomsByCampus.get("BOS")).toHaveLength(6);
  });
});
