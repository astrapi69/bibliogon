/**
 * SPA deep-link restore for sub-path hosts (GitHub Pages).
 *
 * GitHub Pages has no server-side SPA fallback, so a hard refresh on a
 * deep route 404s. ``public/404.html`` bounces the request to the SPA
 * entry as ``${BASE_URL}?redirect=<route>``; this helper reads that
 * param and rewrites the URL back to the intended route via
 * ``history.replaceState`` BEFORE the router mounts, so React Router
 * boots straight onto the route with no extra render.
 *
 * Safe + inert on the Desktop / LAN deploy: there is never a
 * ``?redirect=`` param there (no 404.html bounce), so it is a no-op.
 */
export function restoreSpaRedirect(
  routerBasename: string,
  loc: Pick<Location, "search"> = window.location,
  hist: Pick<History, "replaceState"> = window.history,
): string | null {
  const redirectTo = new URLSearchParams(loc.search).get("redirect");
  // Only same-origin, '/'-relative routes are honoured (no open-redirect
  // to "//evil.com" or "https://…").
  if (!redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return null;
  }
  const prefix = routerBasename === "/" ? "" : routerBasename;
  const target = prefix + redirectTo;
  hist.replaceState(null, "", target);
  return target;
}
