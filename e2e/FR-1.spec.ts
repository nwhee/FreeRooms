import { expect, test, type Page } from "@playwright/test";

// FR-1 has no pages yet: every route renders the root layout plus Next's 404.
// Run against a local build: `npm run build && npm run start -- -p 3100`,
// then `PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/FR-1.spec.ts`.

/** Resolves any CSS colour (including oklch) to sRGB via a canvas, then returns the WCAG contrast ratio. */
async function contrast(page: Page, fgVar: string, bgVar: string): Promise<number> {
  return page.evaluate(
    ([fg, bg]) => {
      const styles = getComputedStyle(document.documentElement);
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      const rgb = (cssVar: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = styles.getPropertyValue(cssVar).trim();
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        if (a !== 255) throw new Error(`${cssVar} is not opaque (alpha ${a})`);
        return [r, g, b];
      };
      const lum = ([r, g, b]: number[]) => {
        const lin = (c: number) => {
          const s = c / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const [l1, l2] = [lum(rgb(fg)), lum(rgb(bg))].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    },
    [fgVar, bgVar] as const,
  );
}

test.describe("FR-1", () => {
  for (const [label, width] of [["desktop", 1280], ["phone", 390]] as const) {
    test(`AC5 the build serves the root layout with a 404 at / until FR-5 (${label})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const response = await page.goto("/");
      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle(/404|FreeRooms/);
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);
    });
  }

  test("AC5b the gitignored local data file is not served when absent", async ({ request }) => {
    expect((await request.get("/data/schedule.json")).status()).toBe(404);
  });

  test("AC11 --input and --ring reach 3:1 against --background in light mode", async ({ page }) => {
    await page.goto("/");
    expect(await contrast(page, "--input", "--background")).toBeGreaterThanOrEqual(3);
    expect(await contrast(page, "--ring", "--background")).toBeGreaterThanOrEqual(3);
  });

  test("AC11 :root sets color-scheme: light", async ({ page }) => {
    await page.goto("/");
    const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(scheme).toBe("light");
  });

  test("AC11 reduced motion turns transitions and animations to near zero", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const durations = await page.evaluate(() => {
      const el = document.createElement("div");
      el.style.transition = "opacity 300ms";
      el.style.animation = "spin 2s infinite";
      document.body.append(el);
      const cs = getComputedStyle(el);
      return [cs.transitionDuration, cs.animationDuration, cs.animationIterationCount];
    });
    const seconds = (v: string) => (v.endsWith("ms") ? parseFloat(v) / 1000 : parseFloat(v));
    expect(seconds(durations[0])).toBeLessThanOrEqual(0.001);
    expect(seconds(durations[1])).toBeLessThanOrEqual(0.001);
    expect(durations[2]).toBe("1");
  });
});
