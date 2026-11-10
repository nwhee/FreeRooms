/**
 * Northeastern campuses that can have rooms, from the Banner research of
 * 2026-11-08 (`classSearch/get_campus`). Online (VTL, VTC) and
 * "No campus, no room needed" are deliberately absent.
 * Banner meeting times are local to each campus, so each has its own IANA zone.
 */

export type CampusRegion = "USA" | "CAN" | "UK";

/** A row of the campus table. Not the same shape as `Campus` in `schema.ts`. */
export type CampusDefinition = {
  code: string;
  name: string;
  timezone: string;
  region: CampusRegion;
  /** Description strings Banner uses for this campus (`get_campus` and section-level). */
  bannerNames: readonly string[];
};

export const CAMPUSES: readonly CampusDefinition[] = [
  { code: "BOS", name: "Boston", timezone: "America/New_York", region: "USA", bannerNames: ["Boston"] },
  {
    code: "BRD",
    name: "Boston - Broad Street",
    timezone: "America/New_York",
    region: "USA",
    bannerNames: ["Boston - Broad Street"],
  },
  { code: "BRL", name: "Burlington", timezone: "America/New_York", region: "USA", bannerNames: ["Burlington"] },
  { code: "DDH", name: "Dedham", timezone: "America/New_York", region: "USA", bannerNames: ["Dedham"] },
  { code: "NAH", name: "Nahant", timezone: "America/New_York", region: "USA", bannerNames: ["Nahant"] },
  {
    code: "PTL",
    name: "Portland, Maine",
    timezone: "America/New_York",
    region: "USA",
    bannerNames: ["Portland, Maine", "Portland Maine"],
  },
  {
    code: "NYC",
    name: "New York, NY",
    timezone: "America/New_York",
    region: "USA",
    bannerNames: ["New York, NY", "New York NY"],
  },
  {
    code: "ARL",
    name: "Arlington, VA",
    timezone: "America/New_York",
    region: "USA",
    bannerNames: ["Arlington, VA", "Arlington VA"],
  },
  {
    code: "CHL",
    name: "Charlotte, NC",
    timezone: "America/New_York",
    region: "USA",
    bannerNames: ["Charlotte, NC", "Charlotte NC"],
  },
  {
    code: "MIA",
    name: "Miami, FL",
    timezone: "America/New_York",
    region: "USA",
    bannerNames: ["Miami, FL", "Miami FL"],
  },
  {
    code: "TOR",
    name: "Toronto, Canada",
    timezone: "America/Toronto",
    region: "CAN",
    bannerNames: ["Toronto, Canada", "Toronto Canada"],
  },
  { code: "LDN", name: "London", timezone: "Europe/London", region: "UK", bannerNames: ["London"] },
  {
    code: "OAK",
    name: "Oakland, CA",
    timezone: "America/Los_Angeles",
    region: "USA",
    bannerNames: ["Oakland, CA", "Oakland CA"],
  },
  {
    code: "SFR",
    name: "San Francisco, CA",
    timezone: "America/Los_Angeles",
    region: "USA",
    bannerNames: ["San Francisco, CA", "San Francisco CA"],
  },
  {
    code: "SJO",
    name: "Silicon Valley, CA",
    timezone: "America/Los_Angeles",
    region: "USA",
    bannerNames: ["Silicon Valley, CA", "Silicon Valley CA"],
  },
  {
    code: "SEA",
    name: "Seattle, WA",
    timezone: "America/Los_Angeles",
    region: "USA",
    bannerNames: ["Seattle, WA", "Seattle WA"],
  },
  {
    code: "VAN",
    name: "Vancouver, Canada",
    timezone: "America/Vancouver",
    region: "CAN",
    bannerNames: ["Vancouver, Canada", "Vancouver Canada"],
  },
];

/** Lower-cases, turns punctuation into spaces and collapses runs of spaces. */
function normalizeBannerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const campusByBannerName = new Map<string, CampusDefinition>(
  CAMPUSES.flatMap((campus) =>
    campus.bannerNames.map((bannerName) => [normalizeBannerName(bannerName), campus] as const),
  ),
);

/**
 * The campus for a Banner campus description, e.g. "Portland Maine" -> PTL.
 * Case, punctuation and extra spaces are ignored. Online, "No campus, no room
 * needed" and unknown names return null.
 */
export function campusFromBannerName(name: string): CampusDefinition | null {
  return campusByBannerName.get(normalizeBannerName(name)) ?? null;
}
