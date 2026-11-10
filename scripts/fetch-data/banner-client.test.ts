import { describe, expect, it } from "vitest";
import { BannerClient, BannerError, USER_AGENT } from "./banner-client";
import { fakeBanner, SESSION_COOKIE, type FakeBannerOptions } from "./__fixtures__/fake-banner";
import { section } from "./__fixtures__/sections";

const TERMS = [
  { code: "202730", description: "Spring 2027 Semester" },
  { code: "202710", description: "Fall 2026 Semester" },
];

function setup(options: Partial<FakeBannerOptions> = {}, delayMs = 2_000) {
  const banner = fakeBanner({ terms: TERMS, ...options });
  const events: string[] = [];
  const sleeps: number[] = [];
  const client = new BannerClient({
    fetch: (url, init) => {
      events.push("request");
      return banner.fetch(url, init);
    },
    sleep: async (ms) => {
      events.push(`sleep:${ms}`);
      sleeps.push(ms);
    },
    delayMs,
  });
  return { banner, client, events, sleeps };
}

function manySections(term: string, count: number) {
  return Array.from({ length: count }, (_, i) => section({ crn: String(10_000 + i), term }));
}

describe("BannerClient session protocol (FR-2 AC3)", () => {
  it("goes resetDataForm -> term/search -> searchResults pages for each term, in order", async () => {
    const { banner, client } = setup({
      sections: { "202710": manySections("202710", 3), "202730": manySections("202730", 2) },
    });
    await client.getTerms();
    await client.searchTerm("202710");
    await client.searchTerm("202730");
    expect(banner.log).toEqual([
      "getTerms:1",
      "reset",
      "term:202710",
      "page:202710@0",
      "reset",
      "term:202730",
      "page:202730@0",
    ]);
    const termPost = banner.requests[2];
    expect(termPost.method).toBe("POST");
    expect(termPost.url).toMatch(/\/term\/search\?mode=search$/);
    expect(termPost.body).toBe("term=202710");
    expect(banner.requests[1].method).toBe("POST");
    expect(banner.requests[1].url).toMatch(/\/classSearch\/resetDataForm$/);
  });

  it("sends the first response's cookie on every later request", async () => {
    const { banner, client } = setup({ sections: { "202730": manySections("202730", 1) } });
    await client.getTerms();
    await client.searchTerm("202730");
    expect(banner.requests[0].headers.get("cookie")).toBeNull();
    for (const request of banner.requests.slice(1)) {
      expect(request.headers.get("cookie")).toBe(SESSION_COOKIE);
    }
  });

  it("asks for pageMaxSize=500 and stops paging at totalCount (8,632 -> 18 pages)", async () => {
    const { banner, client } = setup({ sections: { "202730": manySections("202730", 8_632) } });
    const result = await client.searchTerm("202730");
    const pages = banner.requests.filter((request) => request.url.includes("searchResults/searchResults"));
    expect(pages).toHaveLength(18);
    pages.forEach((page, i) => {
      const params = new URL(page.url).searchParams;
      expect(params.get("pageMaxSize")).toBe("500");
      expect(params.get("pageOffset")).toBe(String(i * 500));
      expect(params.get("txt_term")).toBe("202730");
      // No sticky filters other than the term.
      expect([...params.keys()].sort()).toEqual(["pageMaxSize", "pageOffset", "txt_term"]);
    });
    expect(result.totalCount).toBe(8_632);
    expect(result.sections).toHaveLength(8_632);
  });

  it("stops at an empty page even if totalCount promises more", async () => {
    const { banner, client } = setup({
      sections: { "202730": manySections("202730", 500) },
      totalCounts: { "202730": 900 },
    });
    const result = await client.searchTerm("202730");
    expect(banner.log.filter((entry) => entry.startsWith("page:"))).toEqual(["page:202730@0", "page:202730@500"]);
    expect(result).toMatchObject({ totalCount: 900 });
    expect(result.sections).toHaveLength(500);
  });

  it("makes one searchResults request for a term with totalCount 0", async () => {
    const { banner, client } = setup();
    expect(await client.searchTerm("202715")).toEqual({ totalCount: 0, sections: [] });
    expect(banner.log).toEqual(["reset", "term:202715", "page:202715@0"]);
  });

  it("pages getTerms until a short page", async () => {
    const terms = Array.from({ length: 150 }, (_, i) => ({ code: String(202000 + i), description: `T${i} (View Only)` }));
    const { banner, client } = setup({ terms });
    expect(await client.getTerms()).toHaveLength(150);
    expect(banner.log).toEqual(["getTerms:1", "getTerms:2"]);
    expect(banner.requests[0].url).toMatch(/classSearch\/getTerms\?searchTerm=&offset=1&max=100$/);
  });
});

describe("BannerClient politeness (FR-2 AC4)", () => {
  it("sends the exact User-Agent on every request", async () => {
    const { banner, client } = setup({ sections: { "202730": manySections("202730", 2) } });
    await client.getTerms();
    await client.searchTerm("202730");
    expect(banner.requests.length).toBeGreaterThan(0);
    for (const request of banner.requests) {
      expect(request.headers.get("user-agent")).toBe(USER_AGENT);
    }
    expect(USER_AGENT).toBe("FreeRooms/1.0 (student project; Northeastern free-room finder)");
  });

  it("sleeps at least the configured delay between requests, and never before the first", async () => {
    const { client, events } = setup({ sections: { "202730": manySections("202730", 1_200) } }, 3_000);
    await client.getTerms();
    await client.searchTerm("202730");
    expect(events[0]).toBe("request");
    for (let i = 1; i < events.length; i++) {
      if (events[i] === "request") {
        const previous = events[i - 1];
        expect(previous).toMatch(/^sleep:\d+$/);
        expect(Number(previous.slice("sleep:".length))).toBeGreaterThanOrEqual(3_000);
      }
    }
    expect(events.filter((event) => event === "request")).toHaveLength(6);
  });

  it("succeeds on a 503 then 200 after one 5 s backoff", async () => {
    const { client, sleeps, banner } = setup({
      intercept: (_request, index) => (index === 0 ? new Response("busy", { status: 503 }) : undefined),
    });
    expect(await client.getTerms()).toEqual(TERMS);
    expect(sleeps).toEqual([5_000]);
    expect(banner.requests).toHaveLength(2);
    expect(client.requestCount).toBe(2);
  });

  it("retries a network error and a 429, waiting 5 s then 15 s", async () => {
    const { client, sleeps } = setup({
      intercept: (_request, index) =>
        index === 0 ? new TypeError("fetch failed") : index === 1 ? new Response("slow down", { status: 429 }) : undefined,
    });
    expect(await client.getTerms()).toEqual(TERMS);
    expect(sleeps).toEqual([5_000, 15_000]);
  });

  it("honours a Retry-After longer than the backoff", async () => {
    const { client, sleeps } = setup({
      intercept: (_request, index) =>
        index === 0 ? new Response("busy", { status: 503, headers: { "Retry-After": "30" } }) : undefined,
    });
    await client.getTerms();
    expect(sleeps).toEqual([30_000]);
  });

  it("fails after four consecutive 503s (5 s, 15 s, 45 s backoff)", async () => {
    const { client, sleeps } = setup({ intercept: () => new Response("busy", { status: 503 }) });
    await expect(client.getTerms()).rejects.toThrow(
      new BannerError(
        "GET classSearch/getTerms?searchTerm=&offset=1&max=100: HTTP 503, still failing after 3 retries",
      ),
    );
    expect(sleeps).toEqual([5_000, 15_000, 45_000]);
  });

  it("fails at once on a 4xx other than 429", async () => {
    const { client, sleeps } = setup({ intercept: () => new Response("gone", { status: 404 }) });
    await expect(client.getTerms()).rejects.toThrow(/HTTP 404/);
    expect(sleeps).toEqual([]);
  });

  it("fails on a non-JSON response and on success:false", async () => {
    const html = setup({ intercept: () => new Response("<html>login</html>", { status: 200 }) });
    await expect(html.client.getTerms()).rejects.toThrow(/not JSON/);

    const unsuccessful = setup({
      intercept: (request) =>
        request.url.includes("searchResults") ? new Response(JSON.stringify({ success: false })) : undefined,
    });
    await expect(unsuccessful.client.searchTerm("202730")).rejects.toThrow(/success:false/);
  });

  it("fails when a page has an unexpected shape", async () => {
    const { client } = setup({
      intercept: (request) =>
        request.url.includes("searchResults")
          ? new Response(JSON.stringify({ success: true, totalCount: "many", data: [] }))
          : undefined,
    });
    await expect(client.searchTerm("202730")).rejects.toThrow(/unexpected response shape at totalCount/);
  });

  it("puts no @ in any request URL or header", async () => {
    const { banner, client } = setup({ sections: { "202730": manySections("202730", 3) } });
    await client.getTerms();
    await client.searchTerm("202730");
    for (const request of banner.requests) {
      expect(request.url).not.toContain("@");
      for (const [name, value] of request.headers) {
        expect(name).not.toContain("@");
        expect(value).not.toContain("@");
      }
    }
  });
});

describe("Retry-After cap (FR-2b AC7)", () => {
  const NOW_MS = Date.parse("2026-11-10T12:00:00Z");

  function retryAfter(value: string) {
    const banner = fakeBanner({
      terms: TERMS,
      intercept: (_request, index) =>
        index === 0 ? new Response("busy", { status: 503, headers: { "Retry-After": value } }) : undefined,
    });
    const sleeps: number[] = [];
    const client = new BannerClient({
      fetch: banner.fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      delayMs: 2_000,
      now: () => NOW_MS,
    });
    return { client, sleeps, banner };
  }

  it("fails on Retry-After: 301 without sleeping", async () => {
    const { client, sleeps, banner } = retryAfter("301");
    await expect(client.getTerms()).rejects.toThrow(/retry after 301 s, over the 300 s limit/);
    expect(sleeps.filter((ms) => ms >= 301_000)).toEqual([]);
    expect(banner.requests).toHaveLength(1);
  });

  it("sleeps 300,000 ms on Retry-After: 300, then retries", async () => {
    const { client, sleeps, banner } = retryAfter("300");
    expect(await client.getTerms()).toEqual(TERMS);
    expect(sleeps).toEqual([300_000]);
    expect(banner.requests).toHaveLength(2);
  });

  it("fails on an HTTP date 10 minutes after now", async () => {
    const { client, sleeps } = retryAfter(new Date(NOW_MS + 600_000).toUTCString());
    await expect(client.getTerms()).rejects.toThrow(/retry after 600 s, over the 300 s limit/);
    expect(sleeps).toEqual([]);
  });

  it("sleeps 60,000 ms on an HTTP date 60 s after now", async () => {
    const { client, sleeps } = retryAfter(new Date(NOW_MS + 60_000).toUTCString());
    expect(await client.getTerms()).toEqual(TERMS);
    expect(sleeps).toEqual([60_000]);
  });
});

describe("page cap (FR-2b AC8)", () => {
  it("fails a term whose pages never end after exactly 100 searchResults requests, naming the term", async () => {
    const rows = manySections("202730", 500);
    const { client, banner } = setup({
      intercept: (request) =>
        request.url.includes("searchResults/searchResults")
          ? new Response(JSON.stringify({ success: true, totalCount: 60_000, data: rows }))
          : undefined,
    });
    await expect(client.searchTerm("202730")).rejects.toThrow(
      new BannerError("Term 202730: still short of totalCount 60000 after 100 searchResults pages"),
    );
    expect(banner.requests.filter((request) => request.url.includes("searchResults/searchResults"))).toHaveLength(100);
  });
});
