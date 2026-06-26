/**
 * Build provenance, read from Vite build-time literals.
 *
 * Pure, framework-free, no app imports — a Library-Grade helper. Every value
 * is baked in at build time (see frontend/vite.config.ts `define`), so the
 * helper works identically online and offline (Dexie/PWA mode). Settings >
 * About and the preview banner both read it.
 *
 * @example
 * const build = getBuildInfo();
 * if (build.isPreview) showPreviewBanner();
 * // build.commitUrl -> https://github.com/astrapi69/bibliogon/commit/<sha>
 */

/** Owner/repo this build belongs to; used to build GitHub commit links. */
export const REPO_URL = "https://github.com/astrapi69/bibliogon";

export interface BuildInfo {
  /** Branch the build came from (e.g. "develop", "main"). */
  branch: string;
  /** Full git SHA, or "unknown" when undeterminable. */
  commit: string;
  /** Short (8-char) commit hash for display. */
  commitShort: string;
  /** GitHub link to the built commit (falls back to the commits list). */
  commitUrl: string;
  /** ISO timestamp of when the bundle was built, or "unknown". */
  date: string;
  /** True only on the preview/test deploy (VITE_IS_PREVIEW=true). */
  isPreview: boolean;
  /** App version (frontend/package.json). */
  version: string;
}

/**
 * Read the baked-in build provenance.
 *
 * @returns A {@link BuildInfo} snapshot derived from the build-time literals.
 */
export function getBuildInfo(): BuildInfo {
  // Prefer the full SHA (CI sets VITE_BUILD_COMMIT); fall back to the short
  // display hash for local builds that only have `git rev-parse --short`.
  const fullCommit = __BUILD_COMMIT__ || "";
  const shortHash = __BUILD_HASH__ || "";
  const commit = fullCommit || shortHash || "unknown";
  const commitShort = fullCommit
    ? fullCommit.slice(0, 8)
    : shortHash || "unknown";
  const commitUrl = fullCommit
    ? `${REPO_URL}/commit/${fullCommit}`
    : `${REPO_URL}/commits`;
  return {
    branch: __BUILD_BRANCH__ || "unknown",
    commit,
    commitShort,
    commitUrl,
    date: __BUILD_DATE__ || "unknown",
    isPreview: __IS_PREVIEW__ || false,
    version: __APP_VERSION__ || "unknown",
  };
}
