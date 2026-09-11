"""Scope tests for the cohesion file-size gate (#443).

``scripts/check-file-sizes.sh`` walked into ``.claude/worktrees/``, so a
parallel session's checkout produced phantom ERRORs against the main tree:
the copy's path is not main-tree-relative, so ``.filesize-whitelist``
never matched it and an intentionally-large file (``Editor.tsx``) was
reported as a NEW god-file.

The script resolves its repo root from its own location and ``cd``s there,
so these tests run it against a temporary repo that mirrors the real
layout rather than copying the script elsewhere.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GATE = REPO_ROOT / "scripts" / "check-file-sizes.sh"


def build_fake_repo(root: Path) -> Path:
    """Mirror the layout the gate expects and return the script path."""
    (root / "scripts").mkdir(parents=True)
    script = root / "scripts" / "check-file-sizes.sh"
    shutil.copy(GATE, script)
    (root / ".filesize-whitelist").write_text("# none\n", encoding="utf-8")
    (root / ".filesize-baseline").write_text("# none\n", encoding="utf-8")
    return script


def write_oversized(path: Path, lines: int = 1200) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(f"const line{n} = {n};" for n in range(lines)), encoding="utf-8")


def run_gate(script: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(script)],
        capture_output=True,
        text=True,
        cwd=script.parent.parent,
    )


class TestWorktreeScope:
    def test_parallel_worktree_checkout_is_ignored(self, tmp_path):
        script = build_fake_repo(tmp_path)
        write_oversized(
            tmp_path / ".claude" / "worktrees" / "other-session" / "src" / "Huge.tsx"
        )

        result = run_gate(script)

        assert result.returncode == 0, result.stdout
        assert "Huge.tsx" not in result.stdout

    def test_agent_tooling_under_dot_claude_is_ignored(self, tmp_path):
        script = build_fake_repo(tmp_path)
        write_oversized(tmp_path / ".claude" / "skills" / "helper" / "tool.py")

        result = run_gate(script)

        assert result.returncode == 0, result.stdout

    def test_a_real_god_file_still_fails(self, tmp_path):
        """The prune must not have widened into the production tree."""
        script = build_fake_repo(tmp_path)
        write_oversized(tmp_path / "frontend" / "src" / "components" / "Huge.tsx")

        result = run_gate(script)

        assert result.returncode == 1
        assert "frontend/src/components/Huge.tsx" in result.stdout

    def test_whitelist_still_exempts_a_main_tree_file(self, tmp_path):
        script = build_fake_repo(tmp_path)
        (tmp_path / ".filesize-whitelist").write_text(
            "frontend/src/components/Huge.tsx\n", encoding="utf-8"
        )
        write_oversized(tmp_path / "frontend" / "src" / "components" / "Huge.tsx")

        result = run_gate(script)

        assert result.returncode == 0, result.stdout
        assert "whitelisted" in result.stdout


class TestRealTree:
    def test_the_repository_passes_its_own_gate(self):
        result = subprocess.run(
            ["bash", str(GATE)],
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
        )
        assert result.returncode == 0, result.stdout
