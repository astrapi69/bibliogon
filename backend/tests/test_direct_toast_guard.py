"""Self-check tests for the direct-toast guard (#769).

The guard keeps ``notify`` the single choke point for failure-level
toasts, so the offline downgrade and the backend-unreachable suppression
(#765) cannot be bypassed by a new ``toast.error`` call site. These tests
exercise the module's pure ``find_violations``-shaped logic against
synthetic sources, plus the real tree (which must stay clean), following
the cheap shape the plugin-lock and Co-Authored-By hook tests established.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GUARD = REPO_ROOT / "scripts" / "check_direct_toast.py"


def load_guard():
    spec = importlib.util.spec_from_file_location("check_direct_toast", GUARD)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def violations_in(source: str, *, filename: str = "Widget.tsx") -> list[tuple[str, int, str]]:
    """Run the guard's detection over a single synthetic source file."""
    guard = load_guard()
    import tempfile

    with tempfile.TemporaryDirectory() as raw:
        root = Path(raw)
        (root / filename).write_text(source, encoding="utf-8")
        guard.FRONTEND_SRC = root
        return guard.find_violations()


class TestDetection:
    def test_flags_direct_toast_error(self):
        found = violations_in('import {toast} from "react-toastify";\ntoast.error("boom");\n')
        assert len(found) == 1
        assert found[0][1] == 2

    def test_flags_direct_toast_warning_and_warn(self):
        found = violations_in('toast.warning("a");\ntoast.warn("b");\n')
        assert len(found) == 2

    def test_flags_spaced_member_access(self):
        found = violations_in("toast\n  .error('x');\n")
        assert len(found) == 1

    def test_accepts_notify_calls(self):
        found = violations_in('notify.error("boom", err);\nnotify.warning("careful");\n')
        assert found == []

    def test_ignores_info_success_and_dismiss(self):
        source = 'toast.info("undo");\ntoast.success("ok");\ntoast.dismiss(id);\n'
        assert violations_in(source) == []

    def test_ignores_line_comment(self):
        assert violations_in('// toast.error("documented, not called");\n') == []

    def test_ignores_block_comment(self):
        source = '/**\n * Do not call toast.error here.\n */\nnotify.error("ok");\n'
        assert violations_in(source) == []

    def test_reports_line_number_after_block_comment(self):
        source = '/*\n * banner\n */\ntoast.error("boom");\n'
        found = violations_in(source)
        assert len(found) == 1
        assert found[0][1] == 4

    def test_skips_test_files(self):
        source = 'toast.error("in a test");\n'
        assert violations_in(source, filename="Widget.test.tsx") == []

    def test_allowlists_the_notify_wrapper_itself(self):
        guard = load_guard()
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            wrapper = root / "utils" / "platform"
            wrapper.mkdir(parents=True)
            (wrapper / "notify.ts").write_text("toast.error(content);\n", encoding="utf-8")
            guard.FRONTEND_SRC = root
            assert guard.find_violations() == []


class TestCli:
    def test_real_tree_is_clean(self):
        result = subprocess.run(
            [sys.executable, str(GUARD), "--enforce"],
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
        )
        assert result.returncode == 0, result.stdout + result.stderr

    def test_enforce_flag_controls_exit_code(self, tmp_path, monkeypatch, capsys):
        """A violation fails only under --enforce; reporting alone exits 0."""
        guard = load_guard()
        (tmp_path / "Widget.tsx").write_text('toast.error("boom");\n', encoding="utf-8")
        guard.FRONTEND_SRC = tmp_path

        monkeypatch.setattr(sys, "argv", ["check_direct_toast.py"])
        assert guard.main() == 0

        monkeypatch.setattr(sys, "argv", ["check_direct_toast.py", "--enforce"])
        assert guard.main() == 1
        assert "bypass notify" in capsys.readouterr().out
