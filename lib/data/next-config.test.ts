import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
  PHASE_TEST,
} from "next/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "../../next.config";
import { MISSING_DATA_URL_WARNING } from "./data-url";

// FR-1 AC5c: the missing-URL warning fires only in a production build.
describe("next.config phase gating", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([undefined, ""])("warns in PHASE_PRODUCTION_BUILD when the URL is %j", (value) => {
    vi.stubEnv("NEXT_PUBLIC_DATA_URL", value);

    config(PHASE_PRODUCTION_BUILD);

    expect(console.warn).toHaveBeenCalledExactlyOnceWith(MISSING_DATA_URL_WARNING);
  });

  it("doesn't warn in PHASE_PRODUCTION_BUILD when the URL is set", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_URL", "https://example.test/s.json");

    config(PHASE_PRODUCTION_BUILD);

    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER, PHASE_TEST])(
    "doesn't warn in %s with the URL unset",
    (phase) => {
      vi.stubEnv("NEXT_PUBLIC_DATA_URL", undefined);

      config(phase);

      expect(console.warn).not.toHaveBeenCalled();
    },
  );

  it("returns the same config in every phase", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_URL", undefined);
    expect(config(PHASE_PRODUCTION_BUILD)).toEqual(config(PHASE_DEVELOPMENT_SERVER));
  });
});
