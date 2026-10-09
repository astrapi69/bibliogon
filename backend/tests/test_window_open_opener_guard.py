"""Guard: no ``window.open`` call leaves the opened document an opener (#987).

A window opened without a features string keeps ``window.opener``
pointing back at the app, so the opened page can navigate this one. On
the Pages build that window is also same-origin with the storage holding
the GitHub token and the AI provider keys (#991), which is why #880
counted this as hardening rather than cosmetics. Browsers imply
``noopener`` for ``<a target="_blank">`` but not for ``window.open``, so
the anchors in the component tree are deliberately out of scope and
every ``window.open`` is in it.

The synthetic cases below are the red pins: each is one way the call
slips through, with a clean twin the scanner has to stay silent about.
The last test runs the scanner over the real ``frontend/src``, which is
what turns a future regression red.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _REPO_ROOT / "scripts" / "check_window_open_opener.py"
_FRONTEND_SRC = _REPO_ROOT / "frontend" / "src"


@pytest.fixture(scope="module")
def checker():
    spec = importlib.util.spec_from_file_location("check_window_open_opener", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _lines(findings) -> list[int]:
    return [finding.line for finding in findings]


class TestSyntheticArtifacts:
    def test_two_argument_call_is_reported(self, checker):
        source = 'window.open(url, "_blank");\n'
        assert _lines(checker.scan_text(source, Path("x.ts"))) == [1]

    def test_single_argument_call_is_reported(self, checker):
        """No target either - still an opener handle."""
        source = "window.open(url);\n"
        assert _lines(checker.scan_text(source, Path("x.ts"))) == [1]

    def test_features_string_with_noopener_is_silent(self, checker):
        source = 'window.open(url, "_blank", "noopener,noreferrer");\n'
        assert checker.scan_text(source, Path("x.ts")) == []

    def test_noreferrer_alone_is_silent(self, checker):
        """``noreferrer`` implies ``noopener`` per the HTML spec."""
        source = 'window.open(url, "_blank", "noreferrer");\n'
        assert checker.scan_text(source, Path("x.ts")) == []

    def test_other_features_without_noopener_are_reported(self, checker):
        source = 'window.open(url, "_blank", "width=600,height=400");\n'
        assert _lines(checker.scan_text(source, Path("x.ts"))) == [1]

    def test_interpolated_url_with_a_nested_ternary_is_reported(self, checker):
        """The real ExportForm shape: a template literal whose own
        parentheses and quotes must not end the scan early."""
        source = (
            "window.open(`/api/books/${bookId}/export/batch"
            '${query ? `?${query}` : ""}`, "_blank");\n'
        )
        assert _lines(checker.scan_text(source, Path("x.ts"))) == [1]

    def test_tsdoc_that_documents_the_call_is_not_a_finding(self, checker):
        """``useBackupExport`` and ``downloadFromUrl`` each explain their
        handler by writing the call out. Prose is not a call site."""
        source = (
            "/**\n"
            ' * Historically a `window.open(exportUrl, "_blank")` handler.\n'
            " */\n"
            "export function useBackupExport() {}\n"
        )
        assert checker.scan_text(source, Path("x.ts")) == []

    def test_a_commented_out_call_is_not_a_finding(self, checker):
        source = '// window.open(url, "_blank");\nconst x = 1;\n'
        assert checker.scan_text(source, Path("x.ts")) == []

    def test_the_reported_line_is_the_line_in_the_original_file(self, checker):
        """Blanking comments must not shift the offsets the report uses -
        a finding that points at the wrong line sends the reader hunting."""
        source = "/*\n *\n *\n */\nconst a = 1;\nwindow.open(url);\n"
        assert _lines(checker.scan_text(source, Path("x.ts"))) == [6]

    def test_several_calls_in_one_file_are_all_reported(self, checker):
        source = 'window.open(a);\nwindow.open(b, "_blank", "noopener");\nwindow.open(c);\n'
        assert _lines(checker.scan_text(source, Path("x.ts"))) == [1, 3]


class TestRealFrontend:
    def test_the_scanner_sees_the_frontend_at_all(self, checker, tmp_path):
        """Guard the guard: a scan that silently reads nothing would make
        the check below pass on an empty directory."""
        (tmp_path / "a.ts").write_text("window.open(url);\n", encoding="utf-8")
        assert len(checker.scan(tmp_path)) == 1
        assert _FRONTEND_SRC.is_dir(), f"{_FRONTEND_SRC} is gone - fix the path"

    def test_no_window_open_without_noopener(self, checker):
        findings = checker.scan(_FRONTEND_SRC)
        assert not findings, (
            "window.open without noopener:\n  "
            + "\n  ".join(str(f) for f in findings)
            + '\n\nPass a features string: window.open(url, "_blank", "noopener,noreferrer").'
        )

    def test_test_and_spec_files_are_skipped(self, checker, tmp_path):
        """A spec may open a window on purpose to assert the behaviour."""
        (tmp_path / "a.test.ts").write_text("window.open(url);\n", encoding="utf-8")
        (tmp_path / "b.spec.tsx").write_text("window.open(url);\n", encoding="utf-8")
        assert checker.scan(tmp_path) == []
