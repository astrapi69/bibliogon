/**
 * Cross-language SSoT guard for the CSP (#986).
 *
 * Three parsers read `csp.txt`: this TypeScript one, the Python one in
 * `backend/app/security_headers.py`, and the generator that renders the
 * nginx include. They are three lines each, which is cheaper than a
 * shared runtime the three deployments do not have - but it means a
 * change to one parser can silently diverge from the others.
 *
 * The committed nginx include is the Python side's output, so comparing
 * this parser against it compares the two implementations without
 * running Python from Vitest.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { cspPolicy, STATIC_SECURITY_HEADERS } from "./securityHeaders";

const HERE = dirname(fileURLToPath(import.meta.url));
const NGINX_INCLUDE = readFileSync(resolve(HERE, "nginx-security-headers.conf"), "utf8");

function policyFromNginx(): string {
  const match = NGINX_INCLUDE.match(
    /add_header Content-Security-Policy-Report-Only "([^"]+)" always;/,
  );
  if (!match) throw new Error("no report-only add_header in the nginx include");
  return match[1];
}

describe("CSP policy parsing", () => {
  it("agrees with the Python-rendered nginx include", () => {
    expect(cspPolicy()).toBe(policyFromNginx());
  });

  it("drops comments and blank lines", () => {
    const policy = cspPolicy();
    expect(policy).not.toContain("#");
    expect(policy).not.toContain("\n");
    expect(policy.startsWith("default-src")).toBe(true);
  });

  it("carries the directives the bundle actually needs", () => {
    const policy = cspPolicy();
    // script-src is the barrier the whole exercise is for: no inline and
    // no remote script, so an injection has nothing to execute.
    expect(policy).toContain("script-src 'self'");
    // 'unsafe-inline' for style only - React's style={{}} and KaTeX.
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("does not leak an enforcing policy into the report-only phase", () => {
    // The enforcing flip is a separate change. A CSP that reached users
    // enforcing, before the violation gate had ever been green, is the
    // white-page-in-production the report-only phase exists to prevent.
    expect(NGINX_INCLUDE).not.toMatch(/add_header Content-Security-Policy "/);
  });
});

describe("static security headers", () => {
  it("match the ones the nginx include sends", () => {
    for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
      expect(NGINX_INCLUDE).toContain(`add_header ${name} "${value}" always;`);
    }
  });
});
