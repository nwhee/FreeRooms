import { describe, expect, it } from "vitest";

// Vite's import.meta.glob (resolved by Vitest at transform time). Declared here so the
// test needs neither `node:fs` (AC15) nor project-wide vite/client types.
declare global {
  interface ImportMeta {
    glob(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, string>;
  }
}

/** Every file in lib/free-rooms, tests and fixtures included (the AC15 grep is recursive). */
const allFiles = import.meta.glob(["./**/*.ts", "./**/*.json"], {
  query: "?raw",
  import: "default",
  eager: true,
});
/** Top-level library sources, tests excluded (the AC9 grep). */
const librarySources = import.meta.glob(["./*.ts", "!./*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("source rules", () => {
  it("finds the library sources", () => {
    expect(Object.keys(librarySources).sort()).toEqual([
      "./build-index.ts",
      "./calendar.ts",
      "./index.ts",
      "./status.ts",
      "./time.ts",
    ]);
  });

  it("AC9: hard-codes no part-of-term codes (no \"1L\" / '1L' in library sources)", () => {
    for (const [path, text] of Object.entries(librarySources)) {
      expect(text, path).not.toMatch(/"1L"|'1L'/);
    }
  });

  it("AC15: imports nothing from react, next or node:*", () => {
    expect(Object.keys(allFiles).length).toBeGreaterThan(5);
    for (const [path, text] of Object.entries(allFiles)) {
      expect(text, path).not.toMatch(/from ['"](react|next|node:)/);
    }
  });
});
