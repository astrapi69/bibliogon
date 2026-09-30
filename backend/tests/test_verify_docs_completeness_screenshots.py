"""Scope pins for the docs-completeness screenshot checks (#925).

``check_screenshots`` had always done the right check - resolve every
Markdown image reference, fail on a missing target - but it only walked
``docs/help``. ``docs/screenshots/README.md``, the one document whose whole
job is referencing images, sat outside that scope, so three rows shipped
rendering broken. These tests pin the widened scope and the advisory
capture-target check that catches the same class one step earlier, at the
capture spec rather than at the index.

The module resolves its paths from its own location, so there is no CLI
surface to point at a fixture; the tests import it and rebind the path
globals instead.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO_ROOT / "scripts" / "verify_docs_completeness.py"


def load_script() -> ModuleType:
    """Fresh module instance, so the fail/warn lists start empty."""
    spec = importlib.util.spec_from_file_location("verify_docs_completeness", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def script(tmp_path: Path) -> ModuleType:
    module = load_script()
    module.REPO = tmp_path
    module.HELP = tmp_path / "docs" / "help"
    module.SCREENSHOTS = tmp_path / "docs" / "screenshots"
    module.CAPTURE_SPEC = tmp_path / "e2e" / "feature-screenshots" / "capture-features.spec.ts"
    module.HELP.mkdir(parents=True)
    module.SCREENSHOTS.mkdir(parents=True)
    return module


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


class TestScreenshotCatalogInScope:
    def test_broken_reference_in_the_catalog_index_fails(self, script: ModuleType) -> None:
        write(script.SCREENSHOTS / "README.md", "| x | ![Shot](book-editor/missing.png) |\n")

        script.check_screenshots()

        assert any("missing.png" in message for message in script.fails)

    def test_resolvable_reference_in_the_catalog_index_passes(self, script: ModuleType) -> None:
        write(script.SCREENSHOTS / "README.md", "| x | ![Shot](book-editor/there.png) |\n")
        write(script.SCREENSHOTS / "book-editor" / "there.png", "not really a png")

        script.check_screenshots()

        assert script.fails == []

    def test_a_pending_marker_is_not_an_image_reference(self, script: ModuleType) -> None:
        write(
            script.SCREENSHOTS / "README.md",
            "| x | _pending capture_ - `book-editor/not-yet.png` |\n",
        )

        script.check_screenshots()

        assert script.fails == []

    def test_help_pages_stay_in_scope(self, script: ModuleType) -> None:
        write(script.HELP / "de" / "page.md", "![Shot](img/gone.png)\n")

        script.check_screenshots()

        assert any("gone.png" in message for message in script.fails)

    def test_the_catalog_gets_no_stale_age_warning(self, script: ModuleType) -> None:
        """The catalog is captured on demand, so an old PNG is normal there."""
        write(script.SCREENSHOTS / "README.md", "![Shot](old.png)\n")
        old = script.SCREENSHOTS / "old.png"
        write(old, "x")
        import os

        ancient = old.stat().st_mtime - (script.STALE_DAYS + 5) * 86400
        os.utime(old, (ancient, ancient))

        script.check_screenshots()

        assert script.fails == []
        assert script.warns == []


class TestCaptureTargets:
    def test_an_uncaptured_target_warns_but_does_not_fail(self, script: ModuleType) -> None:
        write(script.CAPTURE_SPEC, "await page.screenshot({path: `${OUT}/shortcuts/dialog.png`});")

        script.check_capture_targets()

        assert script.fails == []
        assert any("shortcuts/dialog.png" in message for message in script.warns)

    def test_a_captured_target_is_silent(self, script: ModuleType) -> None:
        write(script.CAPTURE_SPEC, "await page.screenshot({path: `${OUT}/shortcuts/dialog.png`});")
        write(script.SCREENSHOTS / "shortcuts" / "dialog.png", "x")

        script.check_capture_targets()

        assert script.fails == []
        assert script.warns == []

    def test_a_missing_spec_warns_instead_of_crashing(self, script: ModuleType) -> None:
        script.check_capture_targets()

        assert script.fails == []
        assert any("capture spec not found" in message for message in script.warns)
