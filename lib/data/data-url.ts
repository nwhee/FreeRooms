/** Where the UI fetches the schedule when NEXT_PUBLIC_DATA_URL is unset (FR-0). */
export const LOCAL_DATA_PATH = "/data/schedule.json";

export const MISSING_DATA_URL_WARNING =
  "WARNING: NEXT_PUBLIC_DATA_URL is not set. It is inlined at build time, so " +
  `without it the site will fetch ${LOCAL_DATA_PATH}, which is not deployed. ` +
  "Set it in Vercel and redeploy via scripts/deploy/.";

/**
 * The warning a production build prints when the data URL is missing, or null
 * when the URL is set. Unset, empty and whitespace-only values all count as missing.
 */
export function missingDataUrlWarning(dataUrl: string | undefined): string | null {
  return dataUrl === undefined || dataUrl.trim() === "" ? MISSING_DATA_URL_WARNING : null;
}
