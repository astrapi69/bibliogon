#!/usr/bin/env python3
"""Reject Co-Authored-By trailers that credit non-human collaborators (#768).

``coding-standards.md`` forbids attributing AI tools, automation bots
and MCP agents as commit co-authors. Until now the rule relied purely
on the discipline of whoever (or whatever) wrote the commit - and
harness defaults have started injecting such a trailer, so a parallel
session can slip one in unnoticed. This script is the enforcement:

- **commit-msg mode** (``check_no_ai_coauthor.py <path>``): the
  pre-commit framework passes the message file; a violating commit is
  refused before it exists.
- **range mode** (``check_no_ai_coauthor.py --stdin-messages``): CI
  feeds every commit message of a PR, NUL-separated, so a bypassed
  local hook still gets caught.

Documented exception: the rule allows the trailer when the commit body
explicitly states who authorized it. A ``Co-Authored-By-Authorized-By:``
line anywhere in the message opts that commit out.
"""

from __future__ import annotations

import argparse
import re
import sys

TRAILER_RE = re.compile(r"^\s*co-authored-by:\s*(?P<who>.+?)\s*$", re.IGNORECASE)

#: Substrings that mark a co-author as non-human. Matched case-insensitively
#: against the whole trailer value (name plus e-mail), so both the display
#: name and a vendor no-reply address trigger.
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

#: NOT a marker: ``users.noreply.github.com``. That domain is how a HUMAN
#: hides their e-mail address on GitHub, so treating it as non-human
#: rejected legitimate co-authors (#779). GitHub App accounts share the
#: domain but carry ``[bot]`` in the local part, so the ``[bot]`` marker
#: above still catches them.

AUTHORIZED_MARKER = "co-authored-by-authorized-by:"


def offending_trailers(message: str) -> list[str]:
    """Return every non-human ``Co-Authored-By`` trailer in ``message``.

    Only real trailer LINES count - a mention inside prose (such as the
    rule's own documentation) is ignored. An explicit authorization
    marker anywhere in the message opts the commit out entirely.

    Args:
        message: Full commit message.

    Returns:
        The offending trailer values, empty when the message is clean.
    """
    if AUTHORIZED_MARKER in message.lower():
        return []
    offenders = []
    for line in message.splitlines():
        match = TRAILER_RE.match(line)
        if not match:
            continue
        who = match.group("who")
        haystack = who.lower()
        if any(marker in haystack for marker in NON_HUMAN_MARKERS):
            offenders.append(who)
    return offenders


def _report(offenders: list[str], subject: str) -> None:
    print(f"ERROR: non-human Co-Authored-By trailer in: {subject}")
    for who in offenders:
        print(f"  Co-Authored-By: {who}")
    print()
    print("coding-standards.md forbids crediting AI tools / bots as co-authors.")
    print("Remove the trailer, or - if a human explicitly authorized it - add")
    print("a 'Co-Authored-By-Authorized-By: <name> (<reason>)' line to the body.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "message_files",
        nargs="*",
        help="Commit-message file(s), as passed by the pre-commit commit-msg stage",
    )
    parser.add_argument(
        "--stdin-messages",
        action="store_true",
        help="Read NUL-separated commit messages from stdin (CI range check)",
    )
    args = parser.parse_args(argv)

    failed = False

    if args.stdin_messages:
        for message in sys.stdin.read().split("\x00"):
            if not message.strip():
                continue
            offenders = offending_trailers(message)
            if offenders:
                _report(offenders, message.strip().splitlines()[0])
                failed = True

    for path in args.message_files:
        with open(path, encoding="utf-8") as handle:
            message = handle.read()
        offenders = offending_trailers(message)
        if offenders:
            _report(offenders, message.strip().splitlines()[0] if message.strip() else path)
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
