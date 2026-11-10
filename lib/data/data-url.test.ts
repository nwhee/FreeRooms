import { describe, expect, it } from "vitest";
import { LOCAL_DATA_PATH, missingDataUrlWarning } from "./data-url";

describe("missingDataUrlWarning (FR-1 AC5c)", () => {
  it.each([undefined, "", "   "])("warns when the data URL is %j", (value) => {
    const warning = missingDataUrlWarning(value);
    expect(warning).toMatch(/^WARNING: NEXT_PUBLIC_DATA_URL is not set/);
    expect(warning).toMatch(
      /the site will fetch \/data\/schedule\.json, which is not deployed\. Set it in Vercel and redeploy via scripts\/deploy\/\.$/,
    );
  });

  it("is silent when the data URL is set", () => {
    expect(missingDataUrlWarning("https://example.test/s.json")).toBeNull();
  });

  it("falls back to the local file path from FR-0", () => {
    expect(LOCAL_DATA_PATH).toBe("/data/schedule.json");
  });
});
