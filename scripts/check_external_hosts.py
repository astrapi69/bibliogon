#!/usr/bin/env python3
r"""Report resources the browser would fetch from a third-party host (#874).

Scans a built GitHub-Pages artifact (``frontend/dist``), the built MkDocs
documentation site (``site/``, #1122) or the frontend sources for
resources a browser loads on its own: ``<link>`` (fetching rels only,
``href`` and ``imagesrcset``), ``<script src>``, ``<img>``, ``<iframe>``,
media sources and ``<video poster>``, ``<input type=image>``, the
``href`` / ``xlink:href`` of SVG ``<image>``, ``<feImage>``, ``<script>``
and ``<use>``, ``<meta http-equiv=refresh>``, CSS ``url()`` /
``@import`` in style sheets, ``<style>`` elements and ``style``
attributes, the service worker's ``importScripts`` and precache
manifest, and the web manifest's icons. An inline script counts by its
static ``import``, ``import()``, ``importScripts()`` and ``new Worker()``
of a URL, and an ``<iframe srcdoc>`` is scanned as the page it holds
(#1124). Each such reference to a host other than the page's own origin
is a finding: it hands the visitor's IP address to that host before the
visitor has done anything.

A reference is read the way the browser's URL parser reads it (#1124):
a backslash is a slash, so ``\\cdn.example\x.js`` names the host
``cdn.example``; tabs and newlines inside a URL do not count; and after
a ``<base href>`` on another host, a relative reference is a reference
to that host.

One script-initiated fetch is visible in the markup and reported too:
Material for MkDocs' repository widget (``data-md-component="source"``,
rendered for ``repo_url``), whose script asks the forge's API for the
repository's stars, forks and latest release on page load.

Not findings: hyperlinks (``<a href>``, also in SVG, ``<area>``),
``rel=canonical``/``alternate``, Open-Graph and other ``<meta>`` content,
a JSON-LD ``@context`` or any other data block, and string constants
inside JavaScript, bundled or inline (a provider base URL is not a fetch;
the runtime capture in ``e2e/static-smoke/external-hosts.spec.ts`` covers
what the JS actually requests).

Usage::

    scripts/check_external_hosts.py frontend/dist --origin https://astrapi69.github.io
    scripts/check_external_hosts.py --sources frontend --origin https://astrapi69.github.io
    scripts/check_external_hosts.py site

Exit status 1 when a finding is not in ``ALLOWED_HOSTS``, 2 when the
scanned directory holds no HTML page, because a scan that read nothing
proves nothing. Every allowlist entry needs a written reason; the pytest
guard enforces that.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

#: ``host -> reason``. Empty on purpose: neither the Pages build (#874) nor
#: the documentation site (#1122) fetches anything from a third party
#: today. An entry here is a decision with a reason, not a way to make the
#: check pass.
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
_SVG_HREF_TAGS = frozenset({"image", "feimage", "script", "use"})
_HREF_ATTRIBUTES = ("href", "xlink:href")
_HTML_SUFFIXES = frozenset({".html", ".htm"})
_PAGE_SCHEME = "https"
_AROUND_A_URL = "".join(chr(code) for code in range(0x21))
_TAB_OR_NEWLINE_RE = re.compile("[\t\n\r]")
_SCHEME_RE = re.compile(r"([a-zA-Z][a-zA-Z0-9+.-]*):(.*)", re.DOTALL)
_CSS_URL_RE = re.compile(r"""url\(\s*(?:"([^"]*)"|'([^']*)'|([^"')\s]+))""", re.IGNORECASE)
_CSS_IMPORT_RE = re.compile(r"""@import\s+(?:"([^"]*)"|'([^']*)')""", re.IGNORECASE)
_SW_IMPORT_RE = re.compile(r"""importScripts\(\s*['"]((?:https?:)?//[^'"]+)['"]""")
_SW_PRECACHE_RE = re.compile(r"""["']?url["']?\s*:\s*["']((?:https?:)?//[^"']+)["']""")
_REFRESH_URL_RE = re.compile(r"url\s*=\s*['\"]?([^'\";]+)", re.IGNORECASE)
_RUNNING_SCRIPT_TYPE_RE = re.compile(
    r"|module|(?:application|text)/(?:x-)?(?:java|ecma)script"
    r"|text/javascript1\.[0-5]|text/(?:jscript|livescript)"
)
_JS_STRING_RE = re.compile(r"""(["'`])(.*?)\1""")
_MODULE_IMPORT_RES = (
    ("import", re.compile(r"""\b(?:import|export)\b[\w\s{},*$]*?\bfrom\s*(["'`])(.*?)\1""")),
    ("import", re.compile(r"""\bimport\s*(["'`])(.*?)\1""")),
    ("import()", re.compile(r"""\bimport\s*\(\s*(["'`])(.*?)\1""")),
)
_URL_LIKE_SPECIFIER_RE = re.compile(r"\.{0,2}/|[a-zA-Z][a-zA-Z0-9+.-]*:")
_IMPORT_SCRIPTS_RE = re.compile(r"\bimportScripts\s*\(([^)]*)\)")
_NEW_WORKER_RE = re.compile(
    r"""\bnew\s+(?:Shared)?Worker\s*\(\s*(?:new\s+URL\s*\(\s*)?(["'`])(.*?)\1"""
)


@dataclass(frozen=True)
class Finding:
    file: str
    kind: str
    url: str
    written: str = ""

    @property
    def host(self) -> str:
        return urlsplit(self.url if "//" in self.url else f"//{self.url}").hostname or ""

    def __str__(self) -> str:
        spelling = f" (written {self.written})" if self.written else ""
        return f"{self.file}: {self.kind} -> {self.url}{spelling}"


def requested_url(reference: str, base: str | None = None) -> str | None:
    r"""The URL on another host a browser requests for ``reference``, or None.

    Reads ``reference`` as the URL parser does (WHATWG URL Standard) on a
    page served over https: spaces and control characters around it and
    tabs and newlines inside it are dropped, and a backslash is a slash,
    so ``\\cdn.example\x.js`` comes back as ``//cdn.example/x.js``. A host
    follows ``//``, ``https:`` plus two or more slashes, or ``http:`` with
    any number of them (a scheme other than the base's takes the host
    whatever follows). A path, a ``#fragment``, ``https:`` with fewer than
    two slashes and any scheme but http(s) (``data:``, ``blob:``,
    ``mailto:``) name no other host, so they yield None - unless ``base``,
    the absolute URL of a ``<base href>`` on another host, is given: a path
    then resolves against it.
    """
    cleaned = _TAB_OR_NEWLINE_RE.sub("", reference.strip(_AROUND_A_URL)).replace("\\", "/")
    if not cleaned or cleaned.startswith("#"):
        return None
    scheme_match = _SCHEME_RE.fullmatch(cleaned)
    if scheme_match:
        scheme, rest = scheme_match.group(1).lower(), scheme_match.group(2)
        if scheme not in ("http", "https"):
            return None
        base_scheme = urlsplit(base).scheme if base else _PAGE_SCHEME
        if scheme != base_scheme or rest.startswith("//"):
            authority = rest.lstrip("/")
            return f"{scheme}://{authority}" if authority else None
        cleaned = rest
    elif cleaned.startswith("//"):
        authority = cleaned.lstrip("/")
        return f"//{authority}" if authority else None
    return urljoin(base, cleaned) if base else None


def _finding(file: str, kind: str, reference: str, base: str | None = None) -> Finding | None:
    """A finding for ``reference`` when it points at another host, else None.

    A relative reference that only the ``<base href>`` turns foreign says
    so in its kind; ``written`` keeps the spelling from the file whenever
    it differs from the URL requested.
    """
    url = requested_url(reference, base)
    if url is None:
        return None
    if base and requested_url(reference) is None:
        kind = f"{kind} via <base href>"
    spelling = reference.strip()
    return Finding(file, kind, url, spelling if spelling != url else "")


def _srcset_urls(srcset: str | None) -> list[str]:
    """The URL of each candidate in a ``srcset`` / ``imagesrcset`` value."""
    return [candidate.split()[0] for candidate in (srcset or "").split(",") if candidate.split()]


def _css_references(text: str) -> list[tuple[str, str]]:
    """Every ``url()`` and quoted ``@import`` of a style sheet as ``(kind, reference)``."""
    references = [("url()", "".join(groups)) for groups in _CSS_URL_RE.findall(text)]
    references += [("@import", "".join(groups)) for groups in _CSS_IMPORT_RE.findall(text)]
    return references


def _script_references(text: str) -> list[tuple[str, str]]:
    """What an inline script loads as a script: ``(kind, reference)`` pairs.

    A module specifier counts only when it is URL-like (``/``, ``./``,
    ``../`` or a scheme); a bare one such as ``"mermaid"`` names no URL.
    ``importScripts`` and ``new Worker`` always take a URL.
    """
    references = [
        (kind, specifier)
        for kind, pattern in _MODULE_IMPORT_RES
        for _, specifier in pattern.findall(text)
        if _URL_LIKE_SPECIFIER_RE.match(specifier.strip())
    ]
    for arguments in _IMPORT_SCRIPTS_RE.findall(text):
        references += [("importScripts()", url) for _, url in _JS_STRING_RE.findall(arguments)]
    references += [("new Worker()", url) for _, url in _NEW_WORKER_RE.findall(text)]
    return references


def _forge_api_url(repo_url: str) -> str:
    """Where Material's repository widget sends its request for ``repo_url``.

    A github.com repository is asked on api.github.com
    (``/repos/<owner>/<name>``, plus ``/releases/latest``). Material asks
    any other forge it supports (GitLab) on that forge's own host, so the
    repository URL itself names the host the widget contacts.
    """
    parts = urlsplit(repo_url.strip())
    if parts.hostname == "github.com":
        return f"https://api.github.com/repos{parts.path.rstrip('/')}"
    return repo_url.strip()


class _ResourceParser(HTMLParser):
    """Collects fetched resource URLs from one HTML document.

    ``base`` is the base URL the document starts with: None for a page
    (its own location), the surrounding page's for an ``<iframe srcdoc>``
    document. ``context`` prefixes every kind, so a finding inside a
    srcdoc names the attribute it came from.
    """

    _TAG_HANDLERS = {
        "link": "_on_link",
        "video": "_on_video",
        "input": "_on_input",
        "object": "_on_object",
        "a": "_on_anchor",
        "meta": "_on_meta",
        "base": "_on_base",
        "iframe": "_on_iframe",
        "script": "_on_script",
        "style": "_on_style",
    }

    def __init__(self, file: str, base: str | None = None, context: str = "") -> None:
        super().__init__()
        self.file = file
        self.found: list[Finding] = []
        self._base = base
        self._base_seen = False
        self._context = context
        self._raw_text_tag: str | None = None
        self._raw_text: list[str] = []
        self._script_runs = False

    def _add(self, kind: str, reference: str | None) -> None:
        if not reference:
            return
        finding = _finding(self.file, self._context + kind, reference, self._base)
        if finding:
            self.found.append(finding)

    def _add_css(self, text: str, context: str) -> None:
        for kind, reference in _css_references(text):
            self._add(f"{context}{kind}", reference)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key.lower(): value for key, value in attrs}
        if attributes.get("style"):
            self._add_css(attributes["style"], "style attribute ")
        if tag in _SRC_TAGS:
            self._add(f"<{tag} src>", attributes.get("src"))
            for candidate in _srcset_urls(attributes.get("srcset")):
                self._add(f"<{tag} srcset>", candidate)
        if tag in _SVG_HREF_TAGS:
            for name in _HREF_ATTRIBUTES:
                self._add(f"<{tag} {name}>", attributes.get(name))
        handler = self._TAG_HANDLERS.get(tag)
        if handler:
            getattr(self, handler)(attributes)

    def _on_link(self, attributes: dict[str, str | None]) -> None:
        rels = set((attributes.get("rel") or "").lower().split())
        if rels & _FETCHING_LINK_RELS:
            kind = f"<link rel={' '.join(sorted(rels))}"
            self._add(f"{kind}>", attributes.get("href"))
            for candidate in _srcset_urls(attributes.get("imagesrcset")):
                self._add(f"{kind} imagesrcset>", candidate)

    def _on_input(self, attributes: dict[str, str | None]) -> None:
        if (attributes.get("type") or "").strip().lower() == "image":
            self._add("<input type=image src>", attributes.get("src"))

    def _on_object(self, attributes: dict[str, str | None]) -> None:
        self._add("<object data>", attributes.get("data"))

    def _on_video(self, attributes: dict[str, str | None]) -> None:
        self._add("<video poster>", attributes.get("poster"))

    def _on_anchor(self, attributes: dict[str, str | None]) -> None:
        if attributes.get("data-md-component") != "source":
            return
        repository = requested_url(attributes.get("href") or "")
        if repository:
            self._add("Material repository widget", _forge_api_url(repository))

    def _on_meta(self, attributes: dict[str, str | None]) -> None:
        if (attributes.get("http-equiv") or "").lower() == "refresh":
            match = _REFRESH_URL_RE.search(attributes.get("content") or "")
            if match:
                self._add("<meta refresh>", match.group(1))

    def _on_base(self, attributes: dict[str, str | None]) -> None:
        """The first base element with an href sets the base URL; later ones do not count."""
        href = attributes.get("href")
        if self._base_seen or href is None:
            return
        self._base_seen = True
        base = requested_url(href, self._base)
        self._base = f"{_PAGE_SCHEME}:{base}" if base and base.startswith("//") else base

    def _on_iframe(self, attributes: dict[str, str | None]) -> None:
        srcdoc = attributes.get("srcdoc")
        if srcdoc:
            document = _ResourceParser(self.file, self._base, f"{self._context}<iframe srcdoc> ")
            document.feed(srcdoc)
            document.close()
            self.found.extend(document.found)

    def _on_script(self, attributes: dict[str, str | None]) -> None:
        script_type = (attributes.get("type") or "").strip().lower()
        self._script_runs = bool(_RUNNING_SCRIPT_TYPE_RE.fullmatch(script_type))
        self._raw_text_tag = "script"

    def _on_style(self, attributes: dict[str, str | None]) -> None:
        self._raw_text_tag = "style"

    def handle_endtag(self, tag: str) -> None:
        if tag != self._raw_text_tag:
            return
        text = "".join(self._raw_text)
        if tag == "style":
            self._add_css(text, "css ")
        elif self._script_runs:
            for kind, reference in _script_references(text):
                self._add(f"inline <script> {kind}", reference)
        self._raw_text_tag = None
        self._raw_text = []

    def handle_data(self, data: str) -> None:
        if self._raw_text_tag:
            self._raw_text.append(data)


def _scan_html(path: Path, file: str) -> list[Finding]:
    parser = _ResourceParser(file)
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    parser.close()
    return parser.found


def _scan_css(text: str, file: str) -> list[Finding]:
    findings = [
        _finding(file, f"css {kind}", reference) for kind, reference in _css_references(text)
    ]
    return [finding for finding in findings if finding]


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
    found: list[Finding | None] = []
    for key in ("icons", "screenshots", "shortcuts"):
        for entry in manifest.get(key) or []:
            for field in ("src", "url"):
                value = entry.get(field) if isinstance(entry, dict) else None
                if value:
                    found.append(_finding(file, f"manifest {key}[].{field}", value))
    for field in ("start_url", "scope"):
        value = manifest.get(field)
        if value:
            found.append(_finding(file, f"manifest {field}", value))
    return [finding for finding in found if finding]


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
        if suffix in _HTML_SUFFIXES:
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


def _holds_a_page(root: Path) -> bool:
    """Whether ``root`` is a directory with at least one HTML page to scan."""
    return root.is_dir() and any(
        path.suffix.lower() in _HTML_SUFFIXES and path.is_file() for path in root.rglob("*")
    )


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
    if not args.sources and not _holds_a_page(args.path):
        print(f"NOTHING SCANNED: {args.path} holds no HTML page. Build it first, or fix the path.")
        return 2
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
