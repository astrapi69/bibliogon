/**
 * Optional GitHub personal-access-token storage for the GitHub import (#353).
 *
 * The token is stored client-side only (localStorage) and is NEVER sent
 * anywhere but `api.github.com` / `raw.githubusercontent.com`. It lifts the
 * unauthenticated rate limit (60 requests/hour) to the authenticated one
 * (5000/hour) and unlocks private repositories. It is optional: public-repo
 * import works with no token at all.
 */

const TOKEN_KEY = "bibliogon.github_token";

/** Read the stored GitHub token, or an empty string when none is set. */
export function getGitHubToken(): string {
    try {
        return localStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
        return "";
    }
}

/** Persist (or clear, when empty) the GitHub token in localStorage. */
export function setGitHubToken(token: string): void {
    try {
        const trimmed = token.trim();
        if (trimmed) {
            localStorage.setItem(TOKEN_KEY, trimmed);
        } else {
            localStorage.removeItem(TOKEN_KEY);
        }
    } catch {
        // localStorage may be unavailable (private mode); ignore — the token
        // simply isn't remembered across reloads.
    }
}
