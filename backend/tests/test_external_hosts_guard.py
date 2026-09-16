"""Guard: the GitHub Pages build fetches nothing from a third party (#874).

A resource the browser loads on its own - a stylesheet, a font, a script,
an image, a service-worker precache entry - sends the visitor's IP
address to whoever hosts it, before the visitor has done anything. The
inventory in #874 found none of that in the Pages build, and this guard
is what keeps it that way: it runs ``scripts/check_external_hosts.py``
over the frontend sources here (no build needed, so it is part of the
PR gate) and over the built ``dist`` in ``deploy-pages.yml`` before the
artifact is uploaded.

The runtime half - a JS-initiated ``fetch`` to a third party, which no
static scan can see - is ``e2e/static-smoke/external-hosts.spec.ts``.

Hyperlinks (``<a href>``), ``rel=canonical``, Open-Graph metadata and a
JSON-LD ``@context`` are strings, not fetches; the scanner must not
report them, or every real finding drowns in noise.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _REPO_ROOT / "scripts" / "check_external_hosts.py"


@pytest.fixture(scope="module")
def checker():
    spec = importlib.util.spec_from_file_location("check_external_hosts", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _hosts(findings) -> set[str]:
    return {finding.host for finding in findings}


class TestSyntheticArtifacts:
    """Red pins: each case is one way a third-party fetch sneaks into a
    build. The scanner must name the host; the clean twin must be
    silent."""

    def test_external_stylesheet_and_font_preconnect_are_reported(self, checker, tmp_path):
        (tmp_path / "index.html").write_text(
            '<html><head><link rel="preconnect" href="https://fonts.gstatic.com">'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'
            '<link rel="canonical" href="https://astrapi69.github.io/bibliogon/">'
            '<a href="https://github.com/astrapi69/bibliogon">repo</a></head></html>',
            encoding="utf-8",
        )
        hosts = _hosts(checker.scan(tmp_path))
        assert hosts == {"fonts.gstatic.com", "fonts.googleapis.com"}

    def test_external_script_image_and_iframe_are_reported(self, checker, tmp_path):
        (tmp_path / "index.html").write_text(
            '<script src="https://cdn.example.com/analytics.js"></script>'
            '<img src="//images.example.net/pixel.gif">'
            '<iframe src="https://maps.example.org/embed"></iframe>'
            '<script type="application/ld+json">{"@context": "https://schema.org"}</script>'
            '<meta property="og:image" content="https://astrapi69.github.io/bibliogon/og-image.png">',
            encoding="utf-8",
        )
        hosts = _hosts(checker.scan(tmp_path))
        assert hosts == {"cdn.example.com", "images.example.net", "maps.example.org"}

    def test_css_url_and_import_are_reported(self, checker, tmp_path):
        (tmp_path / "assets").mkdir()
        (tmp_path / "assets" / "app.css").write_text(
            "@import url('https://fonts.googleapis.com/css2?family=Lora');\n"
            ".hero { background: url(https://cdn.example.com/hero.jpg); }\n"
            ".local { background: url(/bibliogon/fonts/x.woff2); }\n",
            encoding="utf-8",
        )
        assert _hosts(checker.scan(tmp_path)) == {"fonts.googleapis.com", "cdn.example.com"}

    def test_service_worker_precache_and_import_scripts_are_reported(self, checker, tmp_path):
        (tmp_path / "sw.js").write_text(
            'importScripts("https://cdn.example.com/wb.js");'
            'precacheAndRoute([{"revision":"1","url":"index.html"},'
            '{"revision":null,"url":"https://fonts.example.com/inter.woff2"}]);'
            "const t = `see https://bit.ly/wb-precache`;",
            encoding="utf-8",
        )
        assert _hosts(checker.scan(tmp_path)) == {"cdn.example.com", "fonts.example.com"}

    def test_webmanifest_icon_is_reported(self, checker, tmp_path):
        (tmp_path / "manifest.webmanifest").write_text(
            '{"icons":[{"src":"https://cdn.example.com/icon.png"},{"src":"icon-192.png"}],'
            '"start_url":"/bibliogon/"}',
            encoding="utf-8",
        )
        assert _hosts(checker.scan(tmp_path)) == {"cdn.example.com"}

    def test_own_origin_and_local_paths_are_not_findings(self, checker, tmp_path):
        (tmp_path / "index.html").write_text(
            '<link rel="icon" href="/bibliogon/favicon.svg">'
            '<link rel="stylesheet" href="https://astrapi69.github.io/bibliogon/assets/a.css">'
            '<script type="module" src="/bibliogon/assets/index.js"></script>',
            encoding="utf-8",
        )
        assert checker.scan(tmp_path, origin="https://astrapi69.github.io") == []
        assert _hosts(checker.scan(tmp_path)) == {"astrapi69.github.io"}

    def test_javascript_bundles_are_not_scanned_for_string_constants(self, checker, tmp_path):
        """A provider base URL in the bundle is not a fetch. The runtime
        spec decides what the JS actually requests."""
        (tmp_path / "assets").mkdir()
        (tmp_path / "assets" / "index-abc.js").write_text(
            'const base = "https://api.openai.com/v1";', encoding="utf-8"
        )
        assert checker.scan(tmp_path) == []

    def test_allowlisted_host_needs_a_reason_and_is_reported_as_allowed(self, checker, tmp_path):
        (tmp_path / "index.html").write_text(
            '<link rel="stylesheet" href="https://allowed.example.com/a.css">', encoding="utf-8"
        )
        findings = checker.scan(tmp_path)
        assert _hosts(findings) == {"allowed.example.com"}
        assert checker.unallowed(findings, {"allowed.example.com": "written reason"}) == []
        with pytest.raises(ValueError, match="reason"):
            checker.unallowed(findings, {"allowed.example.com": ""})


class TestRepositorySources:
    """The real thing: nothing the frontend ships fetches from a third
    party. Source mode covers index.html, public/ and the CSS; the same
    scanner runs over dist in deploy-pages.yml."""

    def test_frontend_sources_fetch_nothing_external(self, checker):
        findings = checker.unallowed(
            checker.scan_sources(_REPO_ROOT / "frontend", origin="https://astrapi69.github.io"),
            checker.ALLOWED_HOSTS,
        )
        assert not findings, "\n".join(map(str, findings))

    def test_allowlist_entries_carry_a_reason(self, checker):
        for host, reason in checker.ALLOWED_HOSTS.items():
            assert reason.strip(), f"{host}: allowlist entry without a reason"
