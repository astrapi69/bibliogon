/**
 * Vite plugin: serve the canonical security headers from the dev and
 * preview servers (#986).
 *
 * The CSP goes on the PREVIEW server only, and that asymmetry is the
 * point. `vite preview` serves the real built bundle, which is what
 * every deployment ships and what the static-smoke gate measures. The
 * dev server does not: `@vitejs/plugin-react` injects the React-Refresh
 * preamble as an INLINE module script, so `script-src 'self'` is
 * violated on every dev page load - by a script that exists in no
 * shipped artifact. Sending the policy there would train developers to
 * ignore CSP violations, which is worse than not sending it.
 *
 * The static headers have no such divergence and go on both.
 *
 * No plugin dependency: the whole job is "read a text file, set a
 * response header", which Vite's own middleware hooks do directly
 * (stage 2 of the dependency hierarchy). The published CSP plugins
 * compute script hashes and rewrite the HTML - more than this needs, and
 * a second place for the policy to live.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";

const POLICY_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "csp.txt");

/**
 * The canonical policy as a single header value.
 *
 * Reads `security/csp.txt`, drops `#` comments and blank lines, and joins
 * the remaining directives with `; `. Read per server start, not cached
 * across them: a stale in-memory copy would make an edited policy look
 * like it had no effect.
 *
 * @example
 * res.setHeader("Content-Security-Policy-Report-Only", cspPolicy());
 */
export function cspPolicy(): string {
  return readFileSync(POLICY_FILE, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .join("; ");
}

/** The headers that carry no policy text, so nothing to keep in sync. */
export const STATIC_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
};

function headerMiddleware(policy: string | null): Connect.NextHandleFunction {
  return (_req, res, next) => {
    if (policy) res.setHeader("Content-Security-Policy-Report-Only", policy);
    for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }
    next();
  };
}

export function securityHeaders(): Plugin {
  return {
    name: "bibliogon-security-headers",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(headerMiddleware(null));
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(headerMiddleware(cspPolicy()));
    },
  };
}
