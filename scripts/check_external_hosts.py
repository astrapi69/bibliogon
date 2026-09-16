#!/usr/bin/env python3
"""Report resources the browser would fetch from a third-party host (#874).

Scans a built GitHub-Pages artifact (``frontend/dist``) or the frontend
sources for resources a browser loads on its own: ``<link>`` (fetching
rels only), ``<script src>``, ``<img>``, ``<iframe>``, media sources,
``<meta http-equiv=refresh>``, CSS ``url()`` / ``@import``, the service
worker's ``importScripts`` and precache manifest, and the web manifest's
icons. Each such reference to a host other than the page's own origin is
a finding: it hands the visitor's IP address to that host before the
visitor has done anything.

Not findings: hyperlinks (``<a href>``), ``rel=canonical``/``alternate``,
Open-Graph and other ``<meta>`` content, a JSON-LD ``@context``, and string
constants inside JavaScript bundles (a provider base URL is not a fetch;
the runtime capture in ``e2e/static-smoke/external-hosts.spec.ts`` covers
what the JS actually requests).

Usage::

    scripts/check_external_hosts.py frontend/dist --origin https://astrapi69.github.io
    scripts/check_external_hosts.py --sources frontend --origin https://astrapi69.github.io

Exit status 1 when a finding is not in ``ALLOWED_HOSTS``. Every allowlist
entry needs a written reason; the pytest guard enforces that.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

#: ``host -> reason``. Empty on purpose: the Pages build fetches nothing
#: from a third party today (#874). An entry here is a decision with a
#: reason, not a way to make the check pass.
ALLOWED_HOSTS: dict[str, str] = {}

_FETCHING_LINK_RELS = frozenset(
    {
        "stylesheet",
        "icon",
        "apple-touch-icon",
        "apple-touch-icon-precomposed",
        "mask-icon",
        "manifest",
        "preload",
        "prefetch",
        "modulepreload",
        "preconnect",
        "dns-prefetch",
        "prerender",
    }
)
_SRC_TAGS = frozenset({"script", "img", "iframe", "video", "audio", "source", "track", "embed"})
_CSS_URL_RE = re.compile(r"""url\(\s*['"]?\s*((?:https?:)?//[^'")\s]+)""", re.IGNORECASE)
_CSS_IMPORT_RE = re.compile(r"""@import\s+['"]((?:https?:)?//[^'"]+)['"]""", re.IGNORECASE)
_SW_IMPORT_RE = re.compile(r"""importScripts\(\s*['"]((?:https?:)?//[^'"]+)['"]""")
_SW_PRECACHE_RE = re.compile(r"""["']?url["']?\s*:\s*["']((?:https?:)?//[^"']+)["']""")
_REFRESH_URL_RE = re.compile(r"url\s*=\s*['\"]?([^'\";]+)", re.IGNORECASE)


@dataclass(frozen=True)
class Finding:
    file: str
    kind: str
    url: str

    @property
    def host(self) -> str:
        return urlsplit(self.url if "//" in self.url else f"//{self.url}").hostname or ""

    def __str__(self) -> str:
        return f"{self.file}: {self.kind} -> {self.url}"


def _is_absolute(url: str) -> bool:
    lowered = url.strip().lower()
    return lowered.startswith(("http://", "https://", "//"))


class _ResourceParser(HTMLParser):
    """Collects fetched resource URLs from one HTML document."""

    def __init__(self, file: str) -> None:
        super().__init__()
        self.file = file
        self.found: list[Finding] = []
        self._in_style = False
        self._style_text: list[str] = []

    def _add(self, kind: str, url: str | None) -> None:
        if url and _is_absolute(url):
            self.found.append(Finding(self.file, kind, url.strip()))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key.lower(): value for key, value in attrs}
        if tag == "link":
            rels = set((attributes.get("rel") or "").lower().split())
            if rels & _FETCHING_LINK_RELS:
                self._add(f"<link rel={' '.join(sorted(rels))}>", attributes.get("href"))
        elif tag in _SRC_TAGS:
            self._add(f"<{tag} src>", attributes.get("src"))
            for candidate in (attributes.get("srcset") or "").split(","):
                self._add(f"<{tag} srcset>", candidate.strip().split(" ")[0])
        elif tag == "object":
            self._add("<object data>", attributes.get("data"))
        elif tag == "meta" and (attributes.get("http-equiv") or "").lower() == "refresh":
            match = _REFRESH_URL_RE.search(attributes.get("content") or "")
            if match:
                self._add("<meta refresh>", match.group(1))
        elif tag == "style":
            self._in_style = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "style" and self._in_style:
            self._in_style = False
            self.found.extend(_scan_css("".join(self._style_text), self.file))
            self._style_text = []

    def handle_data(self, data: str) -> None:
        if self._in_style:
            self._style_text.append(data)


def _scan_html(path: Path, file: str) -> list[Finding]:
    parser = _ResourceParser(file)
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    parser.close()
    return parser.found


def _scan_css(text: str, file: str) -> list[Finding]:
    found = [Finding(file, "css url()", url) for url in _CSS_URL_RE.findall(text)]
    found += [Finding(file, "css @import", url) for url in _CSS_IMPORT_RE.findall(text)]
    return found


def _scan_service_worker(path: Path, file: str) -> list[Finding]:
    text = path.read_text(encoding="utf-8", errors="replace")
    found = [Finding(file, "sw importScripts", url) for url in _SW_IMPORT_RE.findall(text)]
    found += [Finding(file, "sw precache entry", url) for url in _SW_PRECACHE_RE.findall(text)]
    return found


def _scan_manifest(path: Path, file: str) -> list[Finding]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        return []
    found: list[Finding] = []
    for key in ("icons", "screenshots", "shortcuts"):
        for entry in manifest.get(key) or []:
            for field in ("src", "url"):
                value = entry.get(field) if isinstance(entry, dict) else None
                if value and _is_absolute(value):
                    found.append(Finding(file, f"manifest {key}[].{field}", value))
    for field in ("start_url", "scope"):
        value = manifest.get(field)
        if value and _is_absolute(value):
            found.append(Finding(file, f"manifest {field}", value))
    return found


def _is_service_worker(path: Path) -> bool:
    name = path.name
    return (
        name in {"sw.js", "registerSW.js"} or name.startswith("workbox-") or name.endswith("-sw.js")
    )


def scan(root: Path, origin: str | None = None) -> list[Finding]:
    """Every third-party resource fetch under ``root``, own ``origin`` excluded."""
    findings: list[Finding] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or "node_modules" in path.parts:
            continue
        file = str(path.relative_to(root))
        suffix = path.suffix.lower()
        if suffix in {".html", ".htm"}:
            findings += _scan_html(path, file)
        elif suffix == ".css":
            findings += _scan_css(path.read_text(encoding="utf-8", errors="replace"), file)
        elif suffix == ".webmanifest" or path.name == "manifest.json":
            findings += _scan_manifest(path, file)
        elif suffix == ".js" and _is_service_worker(path):
            findings += _scan_service_worker(path, file)
    own_host = urlsplit(origin).hostname if origin else None
    return [finding for finding in findings if finding.host != own_host]


def scan_sources(frontend: Path, origin: str | None = None) -> list[Finding]:
    """Source mode: ``index.html``, ``public/`` and every CSS under ``src/``."""
    findings: list[Finding] = []
    index = frontend / "index.html"
    if index.is_file():
        findings += _scan_html(index, "index.html")
    findings += scan(frontend / "public", origin)
    for css in sorted((frontend / "src").rglob("*.css")):
        file = str(css.relative_to(frontend))
        findings += _scan_css(css.read_text(encoding="utf-8", errors="replace"), file)
    own_host = urlsplit(origin).hostname if origin else None
    return [finding for finding in findings if finding.host != own_host]


def unallowed(findings: list[Finding], allowed: dict[str, str]) -> list[Finding]:
    """Findings whose host is not allowlisted. A blank reason is an error."""
    for host, reason in allowed.items():
        if not reason.strip():
            raise ValueError(f"ALLOWED_HOSTS[{host!r}] has no reason")
    return [finding for finding in findings if finding.host not in allowed]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "path", type=Path, help="built dist directory, or the frontend dir with --sources"
    )
    parser.add_argument(
        "--sources", action="store_true", help="scan frontend sources instead of a dist"
    )
    parser.add_argument(
        "--origin", default=None, help="the page's own origin, e.g. https://astrapi69.github.io"
    )
    args = parser.parse_args(argv)
    findings = (
        scan_sources(args.path, args.origin) if args.sources else scan(args.path, args.origin)
    )
    failing = unallowed(findings, ALLOWED_HOSTS)
    allowed = [finding for finding in findings if finding not in failing]
    for finding in allowed:
        print(f"allowed ({ALLOWED_HOSTS[finding.host]}): {finding}")
    for finding in failing:
        print(f"EXTERNAL: {finding}")
    if failing:
        print(
            f"\n{len(failing)} third-party resource fetch(es). Self-host the resource, or add the host to "
            "ALLOWED_HOSTS in scripts/check_external_hosts.py with a written reason."
        )
        return 1
    print(f"OK: no third-party resource fetch in {args.path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
