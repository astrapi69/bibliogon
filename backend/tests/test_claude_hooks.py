"""Claude Code project hooks (#1137).

The hooks enforce rules that otherwise exist only as text: no
``git add -A`` (multi-tool coordination) and no commit under an AI
identity (#786). Both are run as real subprocesses with the input
Claude Code sends them.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
GUARD = REPO / ".claude" / "hooks" / "guard_git_add.py"
IDENTITY = REPO / ".claude" / "hooks" / "git-identity.sh"
SETTINGS = REPO / ".claude" / "settings.json"


def _guard(command: str) -> dict | None:
    payload = {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": command},
    }
    result = subprocess.run(
        ["python3", str(GUARD)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout) if result.stdout.strip() else None


def _denied(command: str) -> bool:
    decision = _guard(command)
    return bool(decision) and decision["hookSpecificOutput"]["permissionDecision"] == "deny"


@pytest.mark.parametrize(
    "command",
    [
        "git add -A",
        "git add --all",
        "git add .",
        "git add ./",
        "git add -Av",
        "cd backend && git add . && git commit -m x",
        "git -C /repo add -A",
        "git commit -a -m 'x'",
        "git commit -am 'x'",
        "git commit --all -m x",
    ],
)
def test_a_blanket_stage_is_refused(command: str) -> None:
    assert _denied(command)


@pytest.mark.parametrize(
    "command",
    [
        "git add backend/app/models/__init__.py docs/CHANGELOG.md",
        "git add .gitignore",
        "git add ./backend/app/main.py",
        "git commit -m 'stage with git add -A was wrong'",
        "git commit -q -F - -- a.py <<'EOF'\nfeat: x\n\nnever git add -A again\nEOF",
        "git status && git diff --stat",
        "echo 'git add .'",
        "git commit --amend --no-edit",
    ],
)
def test_explicit_paths_and_mentions_pass(command: str) -> None:
    assert not _denied(command)


def test_the_refusal_says_what_to_do_instead() -> None:
    reason = _guard("git add -A")["hookSpecificOutput"]["permissionDecisionReason"]
    assert "git add <paths>" in reason


def test_a_non_bash_or_malformed_input_is_let_through() -> None:
    for raw in ("", "not json", json.dumps({"tool_name": "Edit", "tool_input": {}})):
        result = subprocess.run(
            ["python3", str(GUARD)], input=raw, capture_output=True, text=True, check=False
        )
        assert result.returncode == 0
        assert not result.stdout.strip()


needs_git = pytest.mark.skipif(shutil.which("git") is None, reason="git not installed")


def _repo(tmp_path: Path, name: str | None, email: str | None) -> Path:
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    for key, value in (("user.name", name), ("user.email", email)):
        if value is not None:
            subprocess.run(["git", "-C", str(tmp_path), "config", key, value], check=True)
    return tmp_path


def _identity(repo: Path) -> tuple[str, str]:
    subprocess.run(
        ["bash", str(IDENTITY)],
        cwd=repo,
        check=True,
        env={"PATH": "/usr/bin:/bin", "HOME": str(repo)},
    )
    get = lambda key: subprocess.run(  # noqa: E731
        ["git", "-C", str(repo), "config", key], capture_output=True, text=True, check=False
    ).stdout.strip()
    return get("user.name"), get("user.email")


@needs_git
def test_an_ai_identity_is_replaced_by_the_maintainer(tmp_path: Path) -> None:
    repo = _repo(tmp_path, "Claude", "noreply@anthropic.com")
    assert _identity(repo) == ("Asterios Raptis", "asterios.raptis@web.de")


@needs_git
def test_a_missing_identity_is_set(tmp_path: Path) -> None:
    repo = _repo(tmp_path, None, None)
    assert _identity(repo) == ("Asterios Raptis", "asterios.raptis@web.de")


@needs_git
def test_a_human_identity_is_never_overwritten(tmp_path: Path) -> None:
    repo = _repo(tmp_path, "Jane Doe", "jane@example.org")
    assert _identity(repo) == ("Jane Doe", "jane@example.org")


def test_settings_register_both_hooks() -> None:
    settings = json.loads(SETTINGS.read_text(encoding="utf-8"))
    hooks = settings["hooks"]
    start = [h["command"] for entry in hooks["SessionStart"] for h in entry["hooks"]]
    assert any("session-start.sh" in command for command in start)
    pre = [
        (entry.get("matcher"), h["command"])
        for entry in hooks["PreToolUse"]
        for h in entry["hooks"]
    ]
    assert any(matcher == "Bash" and "guard_git_add.py" in command for matcher, command in pre)


def test_settings_json_is_committable() -> None:
    ignored = subprocess.run(
        ["git", "check-ignore", "-q", ".claude/settings.json"], cwd=REPO, check=False
    )
    assert ignored.returncode != 0, (
        ".claude/settings.json is git-ignored - the hooks never reach a cloud session"
    )
