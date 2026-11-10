import type { BannerTerm, FetchLike } from "../banner-client";

/**
 * An in-memory Banner for tests: answers getTerms, resetDataForm,
 * term/search and searchResults the way the live API does, and records every
 * request. No test touches the network.
 */

export type RecordedRequest = { method: string; url: string; headers: Headers; body: string | null };

export type FakeBannerOptions = {
  terms: BannerTerm[];
  /** searchResults rows per term code. Terms not listed return no rows. */
  sections?: Record<string, unknown[]>;
  /** Overrides the reported totalCount per term (defaults to the row count). */
  totalCounts?: Record<string, number>;
  /** Return a Response to override the normal answer for a request. */
  intercept?: (request: RecordedRequest, index: number) => Response | Error | undefined;
};

export const SESSION_COOKIE = "JSESSIONID=fake-session-1";

export type FakeBanner = {
  fetch: FetchLike;
  requests: RecordedRequest[];
  /** Short labels in request order, e.g. "getTerms", "reset", "term:202730", "page:202730@0". */
  log: string[];
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export function fakeBanner(options: FakeBannerOptions): FakeBanner {
  const requests: RecordedRequest[] = [];
  const log: string[] = [];
  let sessionTerm: string | null = null;

  const fetch: FetchLike = async (url, init) => {
    const request: RecordedRequest = {
      method: init.method ?? "GET",
      url,
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? init.body : null,
    };
    const index = requests.length;
    requests.push(request);
    const parsed = new URL(url);
    const endpoint = parsed.pathname.replace(/^.*\/ssb\//, "");

    const override = options.intercept?.(request, index);
    if (override instanceof Error) {
      log.push(`error:${endpoint}`);
      throw override;
    }
    if (override !== undefined) {
      log.push(`override:${endpoint}`);
      return override;
    }

    // The first response opens the session; later ones rely on the cookie.
    const headers: Record<string, string> = index === 0 ? { "Set-Cookie": `${SESSION_COOKIE}; Path=/; HttpOnly` } : {};

    if (endpoint === "classSearch/getTerms") {
      const page = Number(parsed.searchParams.get("offset"));
      const max = Number(parsed.searchParams.get("max"));
      log.push(`getTerms:${page}`);
      return json(options.terms.slice((page - 1) * max, page * max), { headers });
    }
    if (endpoint === "classSearch/resetDataForm") {
      log.push("reset");
      sessionTerm = null;
      return json(true, { headers });
    }
    if (endpoint === "term/search") {
      sessionTerm = new URLSearchParams(request.body ?? "").get("term");
      log.push(`term:${sessionTerm}`);
      return json({ fwdURL: "/StudentRegistrationSsb/ssb/classSearch/classSearch" }, { headers });
    }
    if (endpoint === "searchResults/searchResults") {
      const term = parsed.searchParams.get("txt_term") ?? "";
      const offset = Number(parsed.searchParams.get("pageOffset"));
      const size = Math.min(500, Number(parsed.searchParams.get("pageMaxSize")));
      log.push(`page:${term}@${offset}`);
      // Like Banner, a search without a term POST in this session finds nothing.
      const rows = sessionTerm === term ? (options.sections?.[term] ?? []) : [];
      const totalCount = sessionTerm === term ? (options.totalCounts?.[term] ?? rows.length) : 0;
      return json(
        {
          success: true,
          totalCount,
          pageOffset: offset,
          pageMaxSize: size,
          sectionsFetchedCount: totalCount,
          pathMode: "search",
          data: rows.slice(offset, offset + size),
        },
        { headers },
      );
    }
    return new Response("Not found", { status: 404 });
  };

  return { fetch, requests, log };
}
