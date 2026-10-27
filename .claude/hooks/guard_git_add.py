#!/usr/bin/env python3
"""PreToolUse guard: no blanket staging (#1137).

Parallel sessions leave their own work in the index and working tree;
``git add -A`` / ``git add .`` / ``git commit -a`` absorb it into the
wrong commit (see lessons-learned "Explicit-paths discipline"). This
hook refuses those forms and lets every explicit path through.

The command is tokenised with ``shlex`` after heredoc bodies are cut
out, so a commit message or an ``echo`` that merely mentions
``git add -A`` is not mistaken for one. Input it cannot read is let
through: the guard is a convenience, not the last line of defence.
"""

from __future__ import annotations

import json
import re
import shlex
import sys

SEPARATORS = {";", "&&", "||", "|", "&", "(", ")"}
BLANKET_PATHS = {".", "./", ":/", ":/."}
HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1")
REASON = (
    "Blanket staging is refused in this repo: stage explicit paths with "
    "`git add <paths>` and check `git status` first (parallel sessions may "
    "have work in the tree). See .claude/rules/vibe-coding.md, rule 6."
)


def strip_heredocs(command: str) -> str:
    """Drop every heredoc body, keeping the line that opens it."""
    lines, kept, terminator = command.split("\n"), [], None
    for line in lines:
        if terminator is not None:
            if line.strip() == terminator:
                terminator = None
            continue
        kept.append(line)
        match = HEREDOC.search(line)
        if match:
            terminator = match.group(2)
    return "\n".join(kept)


def segments(command: str) -> list[list[str]]:
    lexer = shlex.shlex(strip_heredocs(command), posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    parts: list[list[str]] = [[]]
    for token in lexer:
        if token in SEPARATORS:
            parts.append([])
        else:
            parts[-1].append(token)
    return [part for part in parts if part]


def git_call(tokens: list[str]) -> tuple[str, list[str]] | None:
    """Return (subcommand, args) when the segment runs git."""
    while tokens and re.match(r"^\w+=", tokens[0]):
        tokens = tokens[1:]
    if not tokens or tokens[0] != "git":
        return None
    rest = tokens[1:]
    while rest and rest[0].startswith("-"):
        rest = rest[2:] if rest[0] in ("-C", "-c") else rest[1:]
    return (rest[0], rest[1:]) if rest else None


def _short_flags(token: str) -> str:
    return token[1:] if re.match(r"^-[A-Za-z]+$", token) else ""


def is_blanket(subcommand: str, args: list[str]) -> bool:
    if subcommand == "add":
        return any(a in BLANKET_PATHS or a == "--all" or "A" in _short_flags(a) for a in args)
    if subcommand == "commit":
        return any(a == "--all" or "a" in _short_flags(a) for a in args)
    return False


def refuses(command: str) -> bool:
    for tokens in segments(command):
        call = git_call(tokens)
        if call and is_blanket(*call):
            return True
    return False


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
        command = payload["tool_input"]["command"] if payload.get("tool_name") == "Bash" else ""
        blocked = bool(command) and refuses(command)
    except (ValueError, KeyError, TypeError):
        return 0
    if blocked:
        decision = {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": REASON,
        }
        print(json.dumps({"hookSpecificOutput": decision}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
