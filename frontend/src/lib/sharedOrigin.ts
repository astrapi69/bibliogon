/**
 * Whether this build is served from an origin it shares with other sites
 * (#991).
 *
 * An origin is scheme, host and port - the path is not part of it. GitHub
 * Pages serves every project site of an account from one host under a
 * path, so `astrapi69.github.io/bibliogon/` shares its `localStorage`,
 * its IndexedDB and its cookie jar with every sibling project site on
 * that account. A credential typed into the app on such a host is
 * readable by anything else served from it, which is why #880 treats one
 * as exposed regardless of how carefully the app itself handles it.
 *
 * The desktop and Docker builds are served from `localhost` and the LAN
 * build from a private address; those are the app's own origin and the
 * notice would be noise there. Only a custom domain removes the sharing
 * on a Pages deploy - this function reports it, it does not fix it.
 *
 * @example
 * if (isSharedOrigin(window.location.hostname)) {
 *     // tell the user before they type a token
 * }
 */

/** Hosts that serve many independent sites under one origin. */
const SHARED_HOST_SUFFIXES = [".github.io", ".gitlab.io", ".pages.dev", ".netlify.app"];

/** True when `hostname` serves other sites from the same origin. */
export function isSharedOrigin(hostname: string): boolean {
    const host = hostname.trim().toLowerCase();
    if (!host) return false;
    if (host === "github.io" || host === "gitlab.io") return true;
    return SHARED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** True when the page this code runs in is on a shared origin. */
export function onSharedOrigin(): boolean {
    if (typeof window === "undefined") return false;
    return isSharedOrigin(window.location.hostname);
}
