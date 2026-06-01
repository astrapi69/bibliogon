#!/usr/bin/env python3
"""check_hardcoded_colors.py — flag genuinely-hardcoded hex colors in
the frontend that bypass the theme system.

Why this exists
---------------
The theme-token-completeness hook proves tokens are defined; the
contrast gate proves they are legible. Neither catches a NEW
``color: "#16a34a"`` that should have been ``var(--success)`` — a
hardcoded color renders the same shade in every theme and silently
breaks dark mode (this was the bulk of the 2026-05-30 Phase B work).
This lint is the regression backstop for that class.

What it flags
-------------
Hardcoded hex literals (``#rgb`` / ``#rrggbb`` / ``#rrggbbaa``) in
``frontend/src`` ``.ts`` / ``.tsx`` / ``.css`` files, EXCEPT:

- ``var(--token, #hex)`` fallbacks — the established theme-aware
  pattern (the token resolves; the hex is only a safety net).
- Inside comments (``//`` line comments, ``/* */`` blocks).
- Pure white / black (``#fff`` ``#ffffff`` ``#000`` ``#000000``,
  case-insensitive). These are overwhelmingly text-on-a-colored-fill
  or hairlines, where a fixed white/black is correct in every theme;
  flagging them is almost all false-positive.
- An explicit ALLOWLIST of files that legitimately carry color DATA
  rather than styling (mood-color presets, comic-bubble convention
  defaults).

Scope note: ``rgb()`` / ``rgba()`` / ``hsl()`` are intentionally NOT
linted — they are dominated by legitimate non-token uses (scrim
overlays, drop-shadows, image-relative backdrops) and would be mostly
false-positive. The high-signal target is hex status colors.

``global.css`` is excluded — it is where hex SHOULD live (the token
definitions). Test files (``*.test.*``) are excluded.

Usage::

    python3 scripts/check_hardcoded_colors.py            # report, exit 0
    python3 scripts/check_hardcoded_colors.py --enforce   # exit 1 on any finding

Stdlib-only (re + pathlib + argparse).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

# Files that legitimately carry color DATA (not theme styling).
ALLOWLIST = {
    # Storyboard mood-color preset palette (user-facing data values).
    # Extracted from Storyboard.tsx into the shared annotation-editor
    # module (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C3).
    "frontend/src/components/StoryboardAnnotations.tsx",
    # Comic-bubble convention defaults (white fill / black stroke /
    # beige narration) — kept theme-independent by design decision
    # (2026-05-30), mirrored 1:1 with the Python PDF walker.
    "frontend/src/components/comics/ComicBubble.tsx",
    "frontend/src/components/comics/bubbleConfigReads.ts",
    # Story Bible per-entity-type accent colors (user-facing data
    # values; mid-tones chosen to read on both light + dark sidebars,
    # used only as decorative icon tints). STORY-BIBLE-PLUGIN-01 C7.
    "frontend/src/components/storyBibleIcons.ts",
    # Relationship-type legend colours (user-facing colour DATA shared
    # by the relationship editor + the Arc View relationship lines).
    # STORY-BIBLE C10.
    "frontend/src/components/relationshipColors.ts",
    # Chapter-label chip readable-text computation: black/white text
    # picked by relative luminance of the user-chosen label color. Pure
    # contrast math on DATA (the label hex), not theme styling.
    # CHAPTER-STATUS-LABELS-01. (Status-dot colors use theme tokens in
    # ChapterStatusLabel.module.css, not hardcoded hex.)
    "frontend/src/components/ChapterStatusLabel.tsx",
}

HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
VAR_FALLBACK_HEX_RE = re.compile(r"var\(\s*--[a-z0-9-]+\s*,\s*#[0-9a-fA-F]{3,8}")
PURE_WHITE_BLACK = {"#fff", "#ffffff", "#000", "#000000", "#ffffffff", "#000000ff"}


def strip_comments(text: str) -> str:
    """Blank out // line comments and /* */ blocks, preserving line
    counts (replace comment chars with spaces, keep newlines)."""
    out = []
    i, n = 0, len(text)
    while i < n:
        two = text[i : i + 2]
        if two == "//":
            j = text.find("\n", i)
            if j < 0:
                j = n
            out.append(" " * (j - i))
            i = j
        elif two == "/*":
            j = text.find("*/", i + 2)
            if j < 0:
                j = n
            else:
                j += 2
            segment = text[i:j]
            out.append("".join(c if c == "\n" else " " for c in segment))
            i = j
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def _source_files() -> list[Path]:
    return sorted(
        list(FRONTEND_SRC.glob("**/*.ts"))
        + list(FRONTEND_SRC.glob("**/*.tsx"))
        + list(FRONTEND_SRC.glob("**/*.css"))
    )


def scan() -> list[tuple[str, int, str]]:
    findings: list[tuple[str, int, str]] = []
    for path in _source_files():
        rel = str(path.relative_to(REPO_ROOT))
        name = path.name
        if rel.endswith("global.css"):
            continue
        if ".test." in name or ".spec." in name:
            continue
        if rel in ALLOWLIST:
            continue
        try:
            raw = path.read_text(encoding="utf-8")
        except Exception:
            continue
        text = strip_comments(raw)
        # Mask var(--token, #hex) fallbacks so their hex doesn't trip.
        masked = VAR_FALLBACK_HEX_RE.sub(
            lambda m: m.group(0).replace("#", "X"), text
        )
        for m in HEX_RE.finditer(masked):
            hexval = m.group(0).lower()
            if hexval in PURE_WHITE_BLACK:
                continue
            line = masked[: m.start()].count("\n") + 1
            snippet = raw.splitlines()[line - 1].strip()[:80]
            findings.append((rel, line, snippet))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--enforce", action="store_true", help="exit 1 on any finding")
    args = parser.parse_args()

    findings = scan()
    if not findings:
        print("No hardcoded hex colors outside the allowed set.")
        return 0

    print(f"{len(findings)} hardcoded hex color(s) found:")
    for rel, line, snippet in findings:
        print(f"  {rel}:{line}  {snippet}")
    print(
        "\nFix: replace with a semantic token, e.g. var(--success),\n"
        "var(--danger), var(--accent). If the value is intentional color\n"
        "DATA (a preset palette) or a documented convention, add the file\n"
        "to ALLOWLIST in scripts/check_hardcoded_colors.py with a comment."
    )
    return 1 if args.enforce else 0


if __name__ == "__main__":
    sys.exit(main())
