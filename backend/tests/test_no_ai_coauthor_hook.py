"""Self-check tests for the commit-identity guard (#786).

The rule against crediting an AI agent in a ``Co-Authored-By`` trailer
(#768) was withdrawn by the maintainer on 2026-11-10
(astrapi69/astrapi69#14), so the commit-msg check and its CI step are
gone. What stays is the identity check: a commit's author and committer
are a person. These tests pin both halves - the trailer check does not
come back unnoticed, and the identity check keeps working.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
HOOK = REPO_ROOT / "scripts" / "check_no_ai_coauthor.py"

CLAUDE = "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"


def _hooks() -> list[dict]:
    import yaml

    config = yaml.safe_load((REPO_ROOT / ".pre-commit-config.yaml").read_text())
    return [hook for repo in config["repos"] for hook in repo.get("hooks", [])]


class TestTrailerRuleIsWithdrawn:
    """astrapi69/astrapi69#14: an AI agent may be named as co-author."""

    def test_no_trailer_hook_is_configured(self) -> None:
        assert [h for h in _hooks() if h.get("id") == "no-ai-coauthor-trailer"] == []

    def test_no_hook_runs_at_the_commit_msg_stage(self) -> None:
        assert [h["id"] for h in _hooks() if "commit-msg" in h.get("stages", [])] == []

    def test_the_script_no_longer_reads_a_commit_message_file(self, tmp_path: Path) -> None:
        message_file = tmp_path / "COMMIT_EDITMSG"
        message_file.write_text(f"feat(x): add a thing\n\n{CLAUDE}\n", encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(HOOK), str(message_file)], capture_output=True, text=True
        )
        # argparse refuses the unknown positional argument with exit code 2;
        # exit code 1 would mean the trailer was judged and rejected.
        assert result.returncode == 2, result.stdout + result.stderr

    def test_the_script_no_longer_reads_commit_messages_from_stdin(self) -> None:
        result = subprocess.run(
            [sys.executable, str(HOOK), "--stdin-messages"],
            input=f"fix: two\n\n{CLAUDE}",
            capture_output=True,
            text=True,
        )
        assert result.returncode == 2, result.stdout + result.stderr

    def test_ci_no_longer_feeds_commit_messages_to_the_script(self) -> None:
        ci = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        assert "--stdin-messages" not in ci
        assert "--stdin-identities" in ci


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
    hooks = [hook for hook in _hooks() if hook.get("id") == "no-ai-commit-identity"]
    assert len(hooks) == 1
    assert hooks[0]["entry"].startswith("python3 ")
    assert hooks[0]["language"] == "system"


def run_on_identities(identities: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(HOOK), "--stdin-identities"],
        input="\x00".join(identities),
        capture_output=True,
        text=True,
    )


class TestIdentityMode:
    """#786: a commit's author and committer are a person.

    GitHub's squash merge adds the squashed commits' author as a
    co-author on the squash commit, so a session committing as
    ``Claude <noreply@anthropic.com>`` changes who a commit on develop
    is attributed to at merge time, after every check on the branch has
    passed. Naming an agent in a trailer is allowed since
    astrapi69/astrapi69#14; committing under its identity is not.

    Checking on the branch is what makes it fixable: a pull request can
    be rewritten, while a merge commit on develop needs a force-push the
    repo forbids.
    """

    def test_a_human_identity_passes(self):
        result = run_on_identities(["Asterios Raptis <asterios.raptis@web.de>"])
        assert result.returncode == 0, result.stdout + result.stderr

    def test_the_identity_this_issue_was_filed_for_is_rejected(self):
        result = run_on_identities(["Claude <noreply@anthropic.com>"])
        assert result.returncode == 1
        assert "noreply@anthropic.com" in result.stdout

    def test_a_bot_identity_is_rejected(self):
        result = run_on_identities(["github-actions[bot] <bot@example.com>"])
        assert result.returncode == 1

    def test_one_bad_identity_among_several_fails_the_whole_run(self):
        result = run_on_identities(
            [
                "Asterios Raptis <asterios.raptis@web.de>",
                "Claude <noreply@anthropic.com>",
                "Asterios Raptis <asterios.raptis@web.de>",
            ]
        )
        assert result.returncode == 1

    def test_a_private_github_address_is_not_a_bot(self):
        """`users.noreply.github.com` is what every human with a hidden
        address gets, so it must not trip the check (#779)."""
        result = run_on_identities(["Some Human <12345+someone@users.noreply.github.com>"])
        assert result.returncode == 0, result.stdout + result.stderr

    def test_empty_input_passes(self):
        assert run_on_identities([]).returncode == 0


class TestConfiguredIdentityMode:
    """The local half: reject the configured identity before a commit exists."""

    def _run(self, tmp_path: Path, name: str, email: str) -> subprocess.CompletedProcess:
        subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
        subprocess.run(["git", "-C", str(tmp_path), "config", "user.name", name], check=True)
        subprocess.run(["git", "-C", str(tmp_path), "config", "user.email", email], check=True)
        return subprocess.run(
            [sys.executable, str(HOOK), "--configured-identity"],
            cwd=str(tmp_path),
            capture_output=True,
            text=True,
        )

    def test_a_human_identity_passes(self, tmp_path: Path):
        result = self._run(tmp_path, "Asterios Raptis", "asterios.raptis@web.de")
        assert result.returncode == 0, result.stdout + result.stderr

    def test_a_non_human_identity_is_refused_with_the_remedy(self, tmp_path: Path):
        result = self._run(tmp_path, "Claude", "noreply@anthropic.com")
        assert result.returncode == 1
        assert "git config user.name" in result.stdout
