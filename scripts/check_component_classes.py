#!/usr/bin/env python3
"""check_component_classes.py — advisory lint for CSS-first drift.

Why this exists
---------------
The 2026-05-30 component-consistency sweep unified buttons / selects /
inputs / checkboxes / sliders / badges / cards onto global classes in
``frontend/src/styles/global.css`` (``.btn*`` ``.input`` ``.slider``
``.radix-select-trigger`` ``.badge*`` ``.card*``) + shared components
(``Toggle`` ``RadixSelect`` ``Badge``). The ``coding-standards.md``
"CSS-first for visual consistency" rule says a control's LOOK comes
from those global classes, not from a CSS-module that re-declares the
shared surface.

This lint is the regression backstop for that rule: it flags NEW
CSS-module classes named like an interactive control
(``*btn*`` / ``*button*`` / ``*select*`` / ``*input*``) that ALSO
re-declare the shared surface (``background`` / ``border`` /
``border-radius``) — i.e. a per-component re-implementation of a look
that a global class already owns.

It is **advisory by default** (exit 0, WARN-tier) because some matches
are legitimate (a genuinely one-off control with no global equivalent,
or a class that only sets a token-driven supplement). The signal is
"consider the global class first", not "this is forbidden". Pass
``--enforce`` to exit non-zero (not wired into ``verify-theme`` — the
blocking theme gates stay about tokens/contrast/hex).

What it flags
-------------
A class in ``frontend/src/**/*.module.css`` whose name (case-folded)
contains ``btn`` / ``button`` / ``select`` / ``input`` AND whose block
declares at least one surface property (``background`` / ``border`` /
``border-radius``). Pure-layout supplements (width, flex, padding-only,
margin) are NOT flagged — those are the encouraged shape.

Usage::

    python3 scripts/check_component_classes.py            # advisory report, exit 0
    python3 scripts/check_component_classes.py --enforce  # exit 1 on any finding
    python3 scripts/check_component_classes.py --quiet    # only print findings
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "frontend" / "src"

# Class-name fragments that mark an interactive control. ``select`` uses
# a negative lookahead so it doesn't match the ``*Selected`` state suffix
# (a layout state, not a <select> control).
CONTROL_NAME = re.compile(r"(btn|button|input|select(?!ed))", re.IGNORECASE)

# Surface properties a global class already owns.
SURFACE_PROP = re.compile(
    r"^\s*(background|border|border-radius)\s*:", re.MULTILINE
)

# Simple top-level rule matcher: `.name[, .name2] { ... }`.
RULE = re.compile(r"\.([A-Za-z0-9_-]+)[^{}]*\{([^{}]*)\}", re.DOTALL)

# Names that are containers / groups, not the control surface itself.
SKIP_NAME = re.compile(
    r"(group|bar|row|wrapper|container|list|toolbar|label|hint|field)",
    re.IGNORECASE,
)


def scan(path: Path) -> list[tuple[str, str]]:
    text = path.read_text(encoding="utf-8")
    findings: list[tuple[str, str]] = []
    for match in RULE.finditer(text):
        name, body = match.group(1), match.group(2)
        if not CONTROL_NAME.search(name):
            continue
        if SKIP_NAME.search(name):
            continue
        if SURFACE_PROP.search(body):
            findings.append((name, ""))
    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--enforce", action="store_true", help="exit 1 on findings")
    ap.add_argument("--quiet", action="store_true", help="only print findings")
    args = ap.parse_args()

    total = 0
    for css in sorted(SRC.rglob("*.module.css")):
        findings = scan(css)
        if not findings:
            continue
        rel = css.relative_to(REPO_ROOT)
        for name, _ in findings:
            total += 1
            print(f"WARN  {rel}: .{name} re-declares a control surface")

    if not args.quiet:
        if total:
            print(
                f"\n{total} CSS-module control class(es) re-declare a shared "
                f"surface.\nPrefer the global .btn*/.input/.radix-select-trigger "
                f"classes + a thin layout-only supplement\n(see "
                f"coding-standards.md 'CSS-first for visual consistency'). "
                f"Advisory — not all are wrong."
            )
        else:
            print("No CSS-module control-surface re-declarations found.")

    if args.enforce and total:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
