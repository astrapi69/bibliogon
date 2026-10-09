#!/usr/bin/env python3
"""Render the canonical CSP into the nginx include the Docker image ships.

``frontend/security/csp.txt`` is the single source of truth (#986). nginx
cannot read it: ``add_header`` takes a literal, so the Docker deployment
needs the policy spelled out in a config fragment. That fragment is
generated here and committed, the same shape ``install.sh`` uses - edit
the source, regenerate, commit both - because a hand-maintained second
copy is a stale policy waiting to happen.

Usage:
    python3 scripts/generate_security_headers.py            # write
    python3 scripts/generate_security_headers.py --check    # fail on drift
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
POLICY_FILE = REPO_ROOT / "frontend" / "security" / "csp.txt"
NGINX_INCLUDE = REPO_ROOT / "frontend" / "security" / "nginx-security-headers.conf"

STATIC_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
}


def read_policy(path: Path = POLICY_FILE) -> str:
    """Return the policy as one header value.

    Drops ``#`` comments and blank lines and joins the directives with
    ``; ``, exactly as ``frontend/security/securityHeaders.ts`` and
    ``backend/app/security_headers.py`` do. All three parsers are three
    lines each; a shared parser would need a shared runtime the three
    deployments do not have.
    """
    directives = [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    return "; ".join(directives)


def render_nginx(policy: str) -> str:
    """Render the ``add_header`` fragment included from nginx.conf.

    ``always`` matters: without it nginx drops the headers on error
    responses, which is where a 404 SPA fallback and every upstream
    failure land.
    """
    lines = [
        "# GENERATED FILE - do not edit.",
        "# Source: frontend/security/csp.txt",
        "# Regenerate: make sync-security-headers",
        "#",
        "# Included from the server block in frontend/nginx.conf. nginx drops",
        "# inherited add_header directives in any location block that sets its",
        "# own, so keep this at server level unless a location needs it too.",
        "",
        f'add_header Content-Security-Policy-Report-Only "{policy}" always;',
    ]
    lines += [f'add_header {name} "{value}" always;' for name, value in STATIC_HEADERS.items()]
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    check = "--check" in argv
    rendered = render_nginx(read_policy())
    if check:
        current = NGINX_INCLUDE.read_text(encoding="utf-8") if NGINX_INCLUDE.exists() else ""
        if current != rendered:
            print(
                f"DRIFT: {NGINX_INCLUDE.relative_to(REPO_ROOT)} does not match "
                f"{POLICY_FILE.relative_to(REPO_ROOT)}.\n"
                "Run: make sync-security-headers",
                file=sys.stderr,
            )
            return 1
        print(f"OK: {NGINX_INCLUDE.relative_to(REPO_ROOT)} matches the canonical policy.")
        return 0
    NGINX_INCLUDE.write_text(rendered, encoding="utf-8")
    print(f"Wrote {NGINX_INCLUDE.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
