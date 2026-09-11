"""Self-check tests for the no-AI-Co-Authored-By hook (#768).

coding-standards.md forbids Co-Authored-By trailers attributing
non-human collaborators, but nothing enforced it - the rule relied on
each agent session honouring it, and harness defaults have started
injecting such a trailer. These tests exercise the script directly
(the cheap shape the plugin-lock hook established), covering both
entry points: a commit-msg file path and a range of commit messages
read from stdin for the CI check.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
HOOK = REPO_ROOT / "scripts" / "check_no_ai_coauthor.py"

HUMAN = "Co-Authored-By: Asterios Raptis <asterios.raptis@web.de>"
CLAUDE = "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"


def run_on_message(tmp_path: Path, message: str) -> subprocess.CompletedProcess:
    message_file = tmp_path / "COMMIT_EDITMSG"
    message_file.write_text(message, encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(HOOK), str(message_file)],
        capture_output=True,
        text=True,
    )


def run_on_stdin(messages: list[str]) -> subprocess.CompletedProcess:
    payload = "\n\x00\n".join(messages)
    return subprocess.run(
        [sys.executable, str(HOOK), "--stdin-messages"],
        input=payload,
        capture_output=True,
        text=True,
    )


class TestCommitMsgMode:
    def test_plain_message_passes(self, tmp_path: Path) -> None:
        result = run_on_message(tmp_path, "feat(x): add a thing\n\nBody.\n")
        assert result.returncode == 0, result.stdout + result.stderr

    def test_ai_trailer_is_rejected(self, tmp_path: Path) -> None:
        result = run_on_message(tmp_path, f"feat(x): add a thing\n\n{CLAUDE}\n")
        assert result.returncode == 1
        assert "Co-Authored-By" in result.stdout + result.stderr

    def test_human_co_author_passes(self, tmp_path: Path) -> None:
        result = run_on_message(tmp_path, f"feat(x): pair work\n\n{HUMAN}\n")
        assert result.returncode == 0, result.stdout + result.stderr

    def test_other_ai_vendors_are_rejected(self, tmp_path: Path) -> None:
        for trailer in (
            "Co-Authored-By: GitHub Copilot <copilot@github.com>",
            "Co-authored-by: Cursor Agent <agent@cursor.sh>",
            "Co-Authored-By: some-bot[bot] <bot@users.noreply.github.com>",
        ):
            result = run_on_message(tmp_path, f"fix(y): thing\n\n{trailer}\n")
            assert result.returncode == 1, f"not rejected: {trailer}"

    def test_documented_exception_passes(self, tmp_path: Path) -> None:
        # coding-standards.md allows the trailer WITH an explicit
        # authorization note naming who approved it.
        message = (
            "feat(x): add a thing\n\n"
            "Co-Authored-By-Authorized-By: Asterios Raptis (see #123)\n"
            f"{CLAUDE}\n"
        )
        result = run_on_message(tmp_path, message)
        assert result.returncode == 0, result.stdout + result.stderr

    def test_mention_inside_prose_is_not_a_trailer(self, tmp_path: Path) -> None:
        message = (
            "docs(rules): explain why Co-Authored-By trailers for AI tools\n"
            "are forbidden in this repo.\n"
        )
        result = run_on_message(tmp_path, message)
        assert result.returncode == 0, result.stdout + result.stderr


class TestCiRangeMode:
    def test_clean_range_passes(self) -> None:
        result = run_on_stdin(["feat: one", "fix: two\n\nBody"])
        assert result.returncode == 0, result.stdout + result.stderr

    def test_one_offending_commit_fails_the_range(self) -> None:
        result = run_on_stdin(["feat: one", f"fix: two\n\n{CLAUDE}", "chore: three"])
        assert result.returncode == 1
        assert "fix: two" in result.stdout + result.stderr
