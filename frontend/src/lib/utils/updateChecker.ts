/**
 * GitHub Releases update checker (#477).
 *
 * Library-grade: pure + framework-free, no app imports. Lets the desktop
 * builds (PyInstaller / Docker) — which have no Service Worker — discover a
 * newer release by querying the PUBLIC GitHub Releases API (no token, 60
 * req/h unauthenticated rate limit is ample for a once-a-day check).
 *
 * Semver comparison is a deliberate stage-1 (own code) choice: Bibliogon
 * tags are plain `vMAJOR.MINOR.PATCH`, so three numeric segments cover every
 * real case and a `semver` dependency would be 30kB for a five-line compare.
 *
 * @example
 * const result = await checkForUpdate("0.56.0");
 * if (result.status === "update-available") open(result.releaseUrl!);
 */

/** GitHub "latest release" endpoint for the public Bibliogon repo. */
export const RELEASES_LATEST_URL =
  "https://api.github.com/repos/astrapi69/bibliogon/releases/latest";

/** Base URL for a specific release tag page (fallback when the API omits
 *  `html_url`). */
export const RELEASE_TAG_BASE_URL =
  "https://github.com/astrapi69/bibliogon/releases/tag/";

/** The one-liner that re-runs the installer to the latest version. */
export const INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash";

export interface UpdateCheckResult {
  status: "up-to-date" | "update-available" | "error";
  /** The running version (passed in by the caller). */
  currentVersion: string;
  /** Latest published tag (e.g. "v0.57.0"), when the check succeeded. */
  latestVersion?: string;
  /** Link to the release page. */
  releaseUrl?: string;
  /** Raw Markdown release notes (the API `body`). */
  releaseNotes?: string;
  /** ISO timestamp the release was published. */
  publishedAt?: string;
}

/**
 * Compare two 3-segment semver strings. A leading `v` is tolerated and
 * missing segments count as 0.
 *
 * @returns `1` if `a > b`, `-1` if `a < b`, `0` if equal.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Query the GitHub Releases API for the latest release and classify it
 * against `currentVersion`. Never throws — a network / parse / non-OK
 * response resolves to `status: "error"`.
 */
export async function checkForUpdate(
  currentVersion: string,
): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(RELEASES_LATEST_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      return { status: "error", currentVersion };
    }
    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      body?: string;
      published_at?: string;
    };
    const latestVersion = data.tag_name;
    if (!latestVersion) {
      return { status: "error", currentVersion };
    }
    const isNewer = compareVersions(latestVersion, currentVersion) > 0;
    return {
      status: isNewer ? "update-available" : "up-to-date",
      currentVersion,
      latestVersion,
      releaseUrl: data.html_url || `${RELEASE_TAG_BASE_URL}${latestVersion}`,
      releaseNotes: data.body || undefined,
      publishedAt: data.published_at || undefined,
    };
  } catch {
    return { status: "error", currentVersion };
  }
}
