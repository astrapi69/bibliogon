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


class TestTrailerVariants:
    """#779 part 3: the hook shipped untested and blocked every commit in
    the repo (#776). These pin the placement variants an agent or a
    contributor can produce, plus the one false positive worth caring
    about."""

    def test_trailer_in_the_middle_of_a_body_is_rejected(self, tmp_path: Path) -> None:
        message = (
            "feat(x): thing\n\n"
            "Body paragraph explaining the change.\n"
            f"{CLAUDE}\n"
            "More body after the trailer.\n"
        )
        result = run_on_message(tmp_path, message)
        assert result.returncode == 1

    def test_indented_trailer_is_rejected(self, tmp_path: Path) -> None:
        result = run_on_message(tmp_path, f"feat(x): thing\n\n    {CLAUDE}\n")
        assert result.returncode == 1

    def test_several_offenders_are_all_reported(self, tmp_path: Path) -> None:
        message = (
            "feat(x): thing\n\n"
            f"{CLAUDE}\n"
            "Co-Authored-By: GitHub Copilot <copilot@github.com>\n"
            f"{HUMAN}\n"
        )
        result = run_on_message(tmp_path, message)
        assert result.returncode == 1
        output = result.stdout + result.stderr
        assert "Claude" in output
        assert "Copilot" in output

    def test_human_github_privacy_address_is_accepted(self, tmp_path: Path) -> None:
        """GitHub's ``users.noreply.github.com`` is how a HUMAN hides their
        e-mail, so it must not read as a bot marker. App accounts that use
        the same domain carry ``[bot]`` in the local part and are still
        caught by that marker (asserted below)."""
        private_human = (
            "Co-Authored-By: Asterios Raptis "
            "<1822320+astrapi69@users.noreply.github.com>"
        )
        result = run_on_message(tmp_path, f"feat(x): thing\n\n{private_human}\n")
        assert result.returncode == 0, result.stdout + result.stderr

    def test_bot_on_the_github_privacy_domain_is_still_rejected(
        self, tmp_path: Path
    ) -> None:
        bot = (
            "Co-Authored-By: dependabot[bot] "
            "<49699333+dependabot[bot]@users.noreply.github.com>"
        )
        result = run_on_message(tmp_path, f"feat(x): thing\n\n{bot}\n")
        assert result.returncode == 1

    def test_trailing_whitespace_after_the_trailer_is_rejected(
        self, tmp_path: Path
    ) -> None:
        result = run_on_message(tmp_path, f"feat(x): thing\n\n{CLAUDE}   \n")
        assert result.returncode == 1

    def test_offender_in_a_later_commit_of_a_range_fails(self) -> None:
        result = run_on_stdin(
            [
                f"feat(a): clean\n\n{HUMAN}",
                "fix(b): also clean",
                f"chore(c): offender\n\n{CLAUDE}",
            ]
        )
        assert result.returncode == 1
