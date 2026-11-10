import { z } from "zod";

/**
 * A polite client for Northeastern's public Banner class search
 * (docs/specs/FR-2.md, "Politeness"). Requests are strictly sequential, wait
 * `delayMs` between each other, share one cookie jar, and retry network
 * errors, 429 and 5xx after 5 s, 15 s and 45 s.
 */

export const BANNER_BASE_URL = "https://nubanner.neu.edu/StudentRegistrationSsb/ssb";
export const USER_AGENT = "FreeRooms/1.0 (student project; Northeastern free-room finder)";
/** Banner caps searchResults pages at 500 rows. */
export const SEARCH_PAGE_SIZE = 500;
export const TERMS_PAGE_SIZE = 100;
export const RETRY_DELAYS_MS = [5_000, 15_000, 45_000] as const;
const REQUEST_TIMEOUT_MS = 120_000;
/** getTerms has ~150 terms; this only stops a runaway loop. */
const MAX_TERM_PAGES = 20;
/** A term needs ~18 pages; more than this means Banner's paging is broken (FR-2b). */
export const MAX_SEARCH_PAGES = 100;
/** A longer Retry-After fails the request at once instead of waiting (FR-2b). */
export const MAX_RETRY_AFTER_MS = 300_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

/** A Banner request that failed for good. The run must fail. */
export class BannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BannerError";
  }
}

/** Banner term codes are six digits ("202730"); anything else fails the run. */
const termCodeSchema = z.string().regex(/^\d{6}$/, { error: "must be a 6-digit term code" });

const bannerTermSchema = z.object({ code: termCodeSchema, description: z.string() });
export const termsPageSchema = z.array(bannerTermSchema);

const meetingTimeSchema = z.object({
  beginTime: z.string().nullish(),
  endTime: z.string().nullish(),
  building: z.string().nullish(),
  buildingDescription: z.string().nullish(),
  room: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  monday: z.boolean().nullish(),
  tuesday: z.boolean().nullish(),
  wednesday: z.boolean().nullish(),
  thursday: z.boolean().nullish(),
  friday: z.boolean().nullish(),
  saturday: z.boolean().nullish(),
  sunday: z.boolean().nullish(),
});

const sectionSchema = z.object({
  term: termCodeSchema,
  courseReferenceNumber: z.string().min(1),
  campusDescription: z.string().nullish(),
  partOfTerm: z.string().nullish(),
  meetingsFaculty: z.array(z.object({ meetingTime: meetingTimeSchema.nullish() })).nullish(),
});

export const searchPageSchema = z.object({
  success: z.literal(true),
  totalCount: z.int().min(0),
  data: z.array(sectionSchema).nullish(),
});

export type BannerTerm = z.infer<typeof bannerTermSchema>;
export type BannerSection = z.infer<typeof sectionSchema>;
export type BannerMeetingTime = z.infer<typeof meetingTimeSchema>;

/** Every searchResults row Banner returned for a term, in page order (duplicates kept). */
export type TermSearch = { totalCount: number; sections: BannerSection[] };

export type BannerClientOptions = {
  fetch: FetchLike;
  sleep: Sleep;
  delayMs: number;
  baseUrl?: string;
  /** Clock for HTTP-date Retry-After values. Defaults to Date.now. */
  now?: () => number;
};

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** `Retry-After` in ms (delta-seconds or an HTTP date), or 0 if absent or unreadable. */
function retryAfterMs(response: Response, now: number): number {
  const header = response.headers.get("retry-after");
  if (header === null) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? 0 : Math.max(0, date - now);
}

export class BannerClient {
  private readonly cookies = new Map<string, string>();
  private readonly baseUrl: string;
  private count = 0;

  constructor(private readonly options: BannerClientOptions) {
    this.baseUrl = options.baseUrl ?? BANNER_BASE_URL;
  }

  /** How many HTTP requests this client has sent, retries included. */
  get requestCount(): number {
    return this.count;
  }

  /** Every term Banner lists, paging until a short page. */
  async getTerms(): Promise<BannerTerm[]> {
    const terms: BannerTerm[] = [];
    for (let page = 1; page <= MAX_TERM_PAGES; page++) {
      const path = `classSearch/getTerms?searchTerm=&offset=${page}&max=${TERMS_PAGE_SIZE}`;
      const rows = this.parse(path, termsPageSchema, await this.request("GET", path));
      terms.push(...rows);
      if (rows.length < TERMS_PAGE_SIZE) return terms;
    }
    throw new BannerError(`getTerms returned more than ${MAX_TERM_PAGES} full pages`);
  }

  /**
   * All sections of one term: resetDataForm, then term/search, then
   * searchResults pages until the rows fetched reach `totalCount` or a page is empty.
   * The reset clears Banner's sticky search filters from the previous term.
   */
  async searchTerm(termCode: string): Promise<TermSearch> {
    await this.request("POST", "classSearch/resetDataForm");
    await this.request("POST", "term/search?mode=search", new URLSearchParams({ term: termCode }));

    const sections: BannerSection[] = [];
    let totalCount: number | null = null;
    for (let pages = 0; totalCount === null || sections.length < totalCount; pages++) {
      if (pages === MAX_SEARCH_PAGES) {
        throw new BannerError(
          `Term ${termCode}: still short of totalCount ${totalCount} after ${MAX_SEARCH_PAGES} searchResults pages`,
        );
      }
      const query = new URLSearchParams({
        txt_term: termCode,
        pageOffset: String(sections.length),
        pageMaxSize: String(SEARCH_PAGE_SIZE),
      });
      const path = `searchResults/searchResults?${query.toString()}`;
      const page = this.parse(path, searchPageSchema, await this.request("GET", path));
      totalCount ??= page.totalCount;
      const rows = page.data ?? [];
      if (rows.length === 0) break;
      sections.push(...rows);
    }
    return { totalCount: totalCount ?? 0, sections };
  }

  private parse<T>(path: string, schema: z.ZodType<T>, json: unknown): T {
    const parsed = schema.safeParse(json);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? ` at ${issue.path.join(".")}` : "";
    throw new BannerError(`${path}: unexpected response shape${where}: ${issue?.message ?? "invalid"}`);
  }

  private storeCookies(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private headers(hasBody: boolean): Headers {
    const headers = new Headers({ "User-Agent": USER_AGENT, Accept: "application/json" });
    if (hasBody) headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
    if (this.cookies.size > 0) {
      headers.set(
        "Cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    return headers;
  }

  /** One logical request with retries. Returns the parsed JSON body. */
  private async request(method: "GET" | "POST", path: string, body?: URLSearchParams): Promise<unknown> {
    const url = `${this.baseUrl}/${path}`;
    let wait = this.options.delayMs;
    for (let attempt = 0; ; attempt++) {
      if (this.count > 0) await this.options.sleep(wait);
      this.count++;

      let failure: string;
      let minWait = 0;
      try {
        const response = await this.options.fetch(url, {
          method,
          headers: this.headers(body !== undefined),
          body: body?.toString(),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        this.storeCookies(response);
        if (response.ok) return this.readJson(method, path, response);
        if (!isRetryableStatus(response.status)) {
          throw new BannerError(`${method} ${path}: HTTP ${response.status}`);
        }
        failure = `HTTP ${response.status}`;
        minWait = retryAfterMs(response, (this.options.now ?? Date.now)());
        if (minWait > MAX_RETRY_AFTER_MS) {
          throw new BannerError(
            `${method} ${path}: HTTP ${response.status} asks to retry after ${Math.ceil(minWait / 1000)} s, over the ${MAX_RETRY_AFTER_MS / 1000} s limit`,
          );
        }
      } catch (error) {
        if (error instanceof BannerError) throw error;
        failure = `network error (${error instanceof Error ? error.message : String(error)})`;
      }

      const backoff = RETRY_DELAYS_MS[attempt];
      if (backoff === undefined) {
        throw new BannerError(
          `${method} ${path}: ${failure}, still failing after ${RETRY_DELAYS_MS.length} retries`,
        );
      }
      wait = Math.max(backoff, minWait, this.options.delayMs);
    }
  }

  private async readJson(method: string, path: string, response: Response): Promise<unknown> {
    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new BannerError(`${method} ${path}: response is not JSON (starts ${JSON.stringify(text.slice(0, 60))})`);
    }
    if (typeof json === "object" && json !== null && "success" in json && json.success === false) {
      throw new BannerError(`${method} ${path}: Banner returned success:false`);
    }
    return json;
  }
}
