#!/usr/bin/env python3
"""Find ``window.open`` calls that leave the opened document an opener handle.

A window opened without a features string keeps ``window.opener`` pointing
back at the app. The opened page can then navigate this one
(``opener.location = ...``) - and on a shared origin like
``astrapi69.github.io`` it is same-origin with the app's storage as well
(#991), which is the storage that holds the GitHub token and the AI keys.
Browsers imply ``noopener`` for ``<a target="_blank">`` but not for
``window.open``, so anchors are none of this guard's business and every
``window.open`` is.

The check is textual on purpose. A call's features argument is the third
one, and the interesting thing about it is a single literal substring, so
a scanner that reads the call's argument list far enough to find that
substring sees everything a parser would - without a TypeScript parse in
a Python gate.

Usage::

    python3 scripts/check_window_open_opener.py            # frontend/src
    python3 scripts/check_window_open_opener.py --root dir
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

SUFFIXES = (".ts", ".tsx", ".js", ".jsx")

#: ``window.open`` plus everything up to the call's closing parenthesis.
#: Nested parentheses inside a template literal (the usual shape here, an
#: interpolated URL) are why the body is taken lazily up to a ``)`` that a
#: following ``;`` or line end confirms as the call's own.
_CALL = re.compile(r"window\.open\s*\((?P<args>[^;]*?)\)\s*(?=[;,)\n])", re.DOTALL)

#: What makes a call safe. ``noopener`` in the features string is the one
#: thing that matters; ``noreferrer`` implies it, so either satisfies this.
_SAFE = re.compile(r"\bnoopener\b|\bnoreferrer\b")

#: Block comments, including the TSDoc blocks that document this very call
#: shape - ``useBackupExport`` and ``downloadFromUrl`` each explain the
#: handler by writing the call out, and a scanner that reads those reports
#: prose as a finding.
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


def strip_comments(text: str) -> str:
    """``text`` with block comments and whole-line ``//`` comments blanked.

    Newlines are kept so a finding's line number still points at the
    source. Only comments that occupy a whole line are removed: a trailing
    ``// ...`` can hold a URL-shaped string, and cutting at ``//`` inside a
    real line could hide a call that follows on it.
    """
    text = _BLOCK_COMMENT.sub(lambda m: "\n" * m.group().count("\n"), text)
    return "\n".join("" if line.lstrip().startswith("//") else line for line in text.split("\n"))


@dataclass(frozen=True)
class Finding:
    """One ``window.open`` call with no ``noopener`` in its features."""

    path: Path
    line: int
    call: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.call}"


def scan_text(text: str, path: Path) -> list[Finding]:
    """Findings for one file's source."""
    findings = []
    source = strip_comments(text)
    for match in _CALL.finditer(source):
        args = match.group("args")
        if _SAFE.search(args):
            continue
        line = source.count("\n", 0, match.start()) + 1
        call = " ".join(f"window.open({args})".split())
        findings.append(Finding(path, line, call[:160]))
    return findings


def scan(root: Path) -> list[Finding]:
    """Findings for every source file under ``root``, path-sorted."""
    findings: list[Finding] = []
    for path in sorted(root.rglob("*")):
        if path.suffix not in SUFFIXES or not path.is_file():
            continue
        if path.name.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")):
            continue
        findings.extend(scan_text(path.read_text(encoding="utf-8"), path))
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "frontend" / "src",
        help="directory to scan (default: frontend/src)",
    )
    args = parser.parse_args(argv)

    findings = scan(args.root)
    if not findings:
        print(f"No window.open call is missing noopener under {args.root}.")
        return 0

    print(f"window.open without noopener ({len(findings)}):", file=sys.stderr)
    for finding in findings:
        print(f"  {finding}", file=sys.stderr)
    print(
        '\nPass a features string: window.open(url, "_blank", "noopener,noreferrer").\n'
        "Without it the opened document keeps a handle on this one (#987).",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
