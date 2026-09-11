/**
 * Discriminates a PROXY-level gateway failure from a backend-authored one.
 *
 * A dead backend behind a live proxy never produces a fetch rejection:
 * the Vite dev proxy answers 502 text/plain, nginx (docker-compose.prod)
 * answers 502 text/html. Bibliogon's own `ExternalServiceError` (Pandoc /
 * TTS / LanguageTool) maps to HTTP 502 as well - but as
 * `application/json` carrying a `detail` the user must see. The
 * content-type is the discriminator; the body is never read here so the
 * caller still owns the (unconsumed) response stream.
 *
 * Extracted from `http.ts` (#770) so the reachability probe can apply the
 * SAME rule without importing `http.ts` (which imports the probe's module
 * back). Both the request path and the `/api/health` probe must agree, or
 * the probe reads a proxy's 502 as proof the backend answered.
 */

/** Gateway statuses a reverse proxy emits when the backend behind it is
 *  dead. Measured 2026-09-11 (#765): the Vite dev proxy answers 502
 *  `text/plain` with an empty body, nginx (docker-compose.prod) answers
 *  502 `text/html`. Only the "everything down" case (`make dev-down`)
 *  rejects the fetch outright, so without this branch the outage banner
 *  would never appear in the deployed topologies. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** True for a proxy-level gateway failure, false for a backend-authored one. */
export function isProxyGatewayFailure(response: Response): boolean {
  if (!GATEWAY_STATUSES.has(response.status)) return false;
  return !(response.headers.get("Content-Type") || "").includes("application/json");
}
