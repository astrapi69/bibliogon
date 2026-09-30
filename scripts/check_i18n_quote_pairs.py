#!/usr/bin/env python3
"""Guard against a typographic quote closed by an ASCII one in the i18n catalogs.

A string that opens with a typographic quote and closes with an escaped
ASCII one renders as ``„Name"`` instead of ``„Name“``. YAML parses it
fine and the i18n parity test compares key SETS, so nothing else in the
chain notices - #924 shipped that shape in six catalogs at once, in a
key whose German opening quote had been copy-pasted into five
non-German languages.

The rule is deliberately narrow: an opener followed by an escaped ``\\"``
before any closer of its own family. Anything looser produces false
positives, because ``“`` closes a German pair and opens an English one, so
"this opener has no matching closer" cannot be decided per character.

Exit code 1 on any finding; prints the file, line and offending value.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
I18N_DIR = REPO_ROOT / "backend" / "config" / "i18n"

#: Opening quote -> the closers that legitimately pair with it.
PAIRS: dict[str, str] = {
    "„": "“”",  # „  -> “ or ”   (German)
    "“": "”",  # “  -> ”        (English, Turkish)
    "«": "»",  # «  -> »        (French, Greek, Iberian)
    "「": "」",  # 「 -> 」        (Japanese)
}
ESCAPED_ASCII_QUOTE = '\\"'


def find_mismatches(text: str) -> list[tuple[int, str]]:
    """Return ``(line_number, line)`` for every ASCII-closed typographic quote."""
    findings: list[tuple[int, str]] = []
    for number, line in enumerate(text.splitlines(), start=1):
        for opener, closers in PAIRS.items():
            start = line.find(opener)
            if start == -1:
                continue
            rest = line[start + 1 :]
            ascii_at = rest.find(ESCAPED_ASCII_QUOTE)
            if ascii_at == -1:
                continue
            closer_at = min(
                (pos for pos in (rest.find(c) for c in closers) if pos != -1),
                default=len(rest),
            )
            if ascii_at < closer_at:
                findings.append((number, line.strip()))
                break
    return findings


def main() -> int:
    catalogs = sorted(I18N_DIR.glob("*.yaml"))
    failures = 0
    for path in catalogs:
        for number, line in find_mismatches(path.read_text(encoding="utf-8")):
            print(f"{path.relative_to(REPO_ROOT)}:{number}: {line}")
            failures += 1
    if failures:
        print(
            f"\n{failures} typographic quote(s) closed by an ASCII quote. Both "
            "halves must come from the same family: „…“, “…”, «…» or 「…」."
        )
        return 1
    print(f"i18n quote pairs OK ({len(catalogs)} catalogs).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
