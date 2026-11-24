#!/usr/bin/env python3
"""Refuse a commit whose author or committer is a tool, not a person (#786).

Naming an AI agent in a ``Co-Authored-By`` trailer is allowed: the rule
against it (#768) was withdrawn by the maintainer on 2026-11-10
(astrapi69/astrapi69#14), and the commit-msg check this script used to
carry went with it. The file keeps its name so the hooks, the CI job and
the session hooks that call it stay as they are.

What it still checks is the identity a commit is made under. GitHub's
squash merge adds the squashed commits' AUTHOR as a co-author on the
squash commit, so a session committing as ``Claude <noreply@anthropic.com>``
changes who a commit on develop is attributed to, at merge time and
after every check on the branch has passed. Two modes:

- ``--stdin-identities``: CI feeds the authors and committers of a
  pull request's commits, NUL-separated.
- ``--configured-identity``: the local pre-commit hook checks the
  configured ``user.name`` / ``user.email`` before a commit exists.
"""

from __future__ import annotations

import argparse
import sys

#: Substrings that mark an identity as non-human. Matched case-insensitively
#: against the whole identity (name plus e-mail), so both the display
#: name and a vendor no-reply address trigger.
#:
#: ``users.noreply.github.com`` is deliberately NOT in this list (#779):
#: GitHub hands that domain to every HUMAN who keeps their address
#: private, so matching on it would refuse a legitimate person. Bots
#: using the same domain still carry the ``[bot]`` suffix.
NON_HUMAN_MARKERS = (
    "claude",
    "anthropic",
    "copilot",
    "chatgpt",
    "openai",
    "gemini",
    "cursor",
    "codeium",
    "devin",
    "aider",
    "[bot]",
    "bot@",
    "noreply@anthropic.com",
)


def is_non_human(identity: str) -> bool:
    """Whether ``identity`` ("Name <mail>") names a tool rather than a person."""
    haystack = identity.lower()
    return any(marker in haystack for marker in NON_HUMAN_MARKERS)


def _report_identity(identity: str, where: str) -> None:
    print(f"ERROR: commit {where} is not a person: {identity}")
    print()
    print("coding-standards.md: commits are made under a human identity (#786).")
    print("An AI agent may be named in a Co-Authored-By trailer, but it is not")
    print("the author or committer. Set a human identity instead:")
    print('  git config user.name "Your Name"')
    print('  git config user.email "you@example.com"')


def _configured_identity() -> str:
    import subprocess

    def read(key: str) -> str:
        result = subprocess.run(
            ["git", "config", "--get", key], capture_output=True, text=True, check=False
        )
        return result.stdout.strip()

    return f"{read('user.name')} <{read('user.email')}>"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--stdin-identities",
        action="store_true",
        help="Read NUL-separated 'Name <mail>' identities from stdin (CI range check)",
    )
    parser.add_argument(
        "--configured-identity",
        action="store_true",
        help="Check this repository's configured user.name / user.email",
    )
    args = parser.parse_args(argv)

    failed = False

    if args.stdin_identities:
        for identity in sys.stdin.read().split("\x00"):
            identity = identity.strip()
            if not identity or identity == "<>":
                continue
            if is_non_human(identity):
                _report_identity(identity, "author or committer")
                failed = True

    if args.configured_identity:
        identity = _configured_identity()
        if is_non_human(identity):
            _report_identity(identity, "identity configured here")
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
