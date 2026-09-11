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


class TestTrailerVariants:
    """#779: the hook was merged untested and then blocked every commit.
    These pin the shapes a real commit message can take."""

    def test_trailer_in_the_middle_of_the_body_is_rejected(self, tmp_path: Path) -> None:
        message = (
            "feat(x): add a thing\n\n"
            f"{CLAUDE}\n\n"
            "More prose after the trailer, so it is not the last block.\n"
        )
        result = run_on_message(tmp_path, message)
        assert result.returncode == 1

    def test_indented_trailer_is_rejected(self, tmp_path: Path) -> None:
        result = run_on_message(tmp_path, f"fix(y): thing\n\n    {CLAUDE}\n")
        assert result.returncode == 1

    def test_all_lowercase_trailer_key_is_rejected(self, tmp_path: Path) -> None:
        message = "fix(y): thing\n\nco-authored-by: claude <noreply@anthropic.com>\n"
        assert run_on_message(tmp_path, message).returncode == 1

    def test_crlf_line_endings_are_rejected(self, tmp_path: Path) -> None:
        result = run_on_message(tmp_path, f"fix(y): thing\r\n\r\n{CLAUDE}\r\n")
        assert result.returncode == 1

    def test_every_offender_is_reported_not_just_the_first(self, tmp_path: Path) -> None:
        message = (
            "feat(x): add a thing\n\n"
            f"{CLAUDE}\n"
            "Co-Authored-By: GitHub Copilot <copilot@github.com>\n"
        )
        result = run_on_message(tmp_path, message)
        assert result.returncode == 1
        output = result.stdout + result.stderr
        assert "Claude" in output
        assert "Copilot" in output

    def test_human_with_a_github_privacy_address_passes(self, tmp_path: Path) -> None:
        """`<id>+<user>@users.noreply.github.com` is what GitHub hands a
        HUMAN who keeps their address private. Rejecting it would refuse
        a legitimate co-author; bots are caught by the `[bot]` suffix."""
        trailer = "Co-Authored-By: Jane Doe <1234567+janedoe@users.noreply.github.com>"
        result = run_on_message(tmp_path, f"feat(x): pair work\n\n{trailer}\n")
        assert result.returncode == 0, result.stdout + result.stderr

    def test_bot_with_a_github_privacy_address_is_still_rejected(self, tmp_path: Path) -> None:
        trailer = (
            "Co-Authored-By: github-actions[bot] "
            "<41898282+github-actions[bot]@users.noreply.github.com>"
        )
        assert run_on_message(tmp_path, f"chore: bump\n\n{trailer}\n").returncode == 1

    def test_trailing_whitespace_after_the_value_is_ignored(self, tmp_path: Path) -> None:
        assert run_on_message(tmp_path, f"fix(y): thing\n\n{CLAUDE}   \n").returncode == 1


class TestCiRangeMode:
    def test_clean_range_passes(self) -> None:
        result = run_on_stdin(["feat: one", "fix: two\n\nBody"])
        assert result.returncode == 0, result.stdout + result.stderr

    def test_one_offending_commit_fails_the_range(self) -> None:
        result = run_on_stdin(["feat: one", f"fix: two\n\n{CLAUDE}", "chore: three"])
        assert result.returncode == 1
        assert "fix: two" in result.stdout + result.stderr


def test_hook_script_is_executable() -> None:
    """Regression: the hook shipped as 100644 with `language: script`,
    which pre-commit refuses ("is not executable") - so EVERY commit on
    every branch failed until the mode was fixed. The config now uses
    `language: system` with an explicit interpreter, and the bit is
    kept as belt-and-braces for direct invocation."""
    import os
    import stat

    assert HOOK.exists()
    mode = HOOK.stat().st_mode
    assert mode & stat.S_IXUSR, f"{HOOK} must be executable (mode {oct(mode)})"
    assert os.access(HOOK, os.X_OK)


def test_hook_is_configured_with_an_explicit_interpreter() -> None:
    """`language: script` executes the file directly and depends on the
    mode bit surviving every checkout; `language: system` + `python3`
    does not."""
    import yaml

    config = yaml.safe_load((REPO_ROOT / ".pre-commit-config.yaml").read_text())
    hooks = [
        hook
        for repo in config["repos"]
        for hook in repo.get("hooks", [])
        if hook.get("id") == "no-ai-coauthor-trailer"
    ]
    assert len(hooks) == 1
    assert hooks[0]["entry"].startswith("python3 ")
    assert hooks[0]["language"] == "system"
