#!/usr/bin/env python3
"""check_theme_contrast.py — WCAG 2.1 contrast gate for the theme
system. Parses ``frontend/src/styles/global.css``, resolves each
critical token pair per palette × mode (with ``:root`` /
``[data-theme="dark"]`` inheritance and alpha-compositing of
translucent backgrounds over ``--bg-card``), and checks the ratio
against the WCAG threshold.

Why this exists
---------------
The ``theme-token-completeness`` hook proves every token is *defined*
in every variant; it says nothing about whether the resulting colors
are *legible*. The 2026-05-30 UX/theme audit found real dark-mode
failures (``--text-muted`` at 2.77:1, a warning button at 1.48:1) that
no existing gate caught. This script is the contrast half of the
"Phase E" automation: a small, fixed set of high-traffic pairs checked
across all 12 variants (6 palettes × light/dark).

Thresholds (WCAG 2.1):
- 4.5:1 for normal body text (1.4.3).
- 3.0:1 for large text / non-text graphical contrast (1.4.11) — used
  for accent-as-link/icon, which is rarely body-size text.

Pairs are tagged ``text`` (4.5) or ``graphical`` (3.0). Alpha is
composited over ``--bg-card`` so translucent ``*-bg`` tokens are
evaluated as the blended color, not as opaque fills.

Usage::

    python3 scripts/check_theme_contrast.py            # report, exit 0
    python3 scripts/check_theme_contrast.py --enforce   # exit 1 on any failure
    python3 scripts/check_theme_contrast.py --quiet      # only failures

Stdlib-only (re + colorsys + pathlib + argparse).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GLOBAL_CSS = REPO_ROOT / "frontend" / "src" / "styles" / "global.css"

PALETTES = ["warm-literary", "cool-modern", "nord", "classic", "studio", "notebook"]

# (foreground token, background token, label, threshold, composite-base)
# composite-base: if the background token is translucent, blend it over
# this opaque token before computing the ratio.
PAIRS: list[tuple[str, str, str, float, str | None]] = [
    ("--text-primary", "--bg-primary", "body text / page", 4.5, None),
    ("--text-primary", "--bg-card", "body text / card", 4.5, None),
    ("--text-secondary", "--bg-card", "secondary text / card", 4.5, None),
    ("--text-muted", "--bg-card", "muted text / card", 4.5, None),
    ("--text-muted", "--surface-2", "muted text / surface-2", 4.5, "--bg-card"),
    ("--text-sidebar", "--bg-sidebar", "sidebar text / sidebar", 4.5, None),
    ("--text-inverse", "--accent", "button label / accent", 4.5, None),
    ("--accent", "--bg-card", "accent link/icon / card", 3.0, None),
]

# Keys are captured WITH the leading "--" so they match the PAIRS
# token names and to_rgba()'s var(--token) chain resolution.
DEF_RE = re.compile(r"(--[a-z0-9-]+)\s*:\s*([^;]+);")


def _block(text: str, selector: str) -> str | None:
    idx = text.find(selector)
    if idx < 0:
        return None
    i = text.find("{", idx)
    depth, j = 1, i + 1
    while j < len(text) and depth > 0:
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i + 1 : j]
        j += 1
    return None


def _defs(block: str | None) -> dict[str, str]:
    return (
        {m.group(1): m.group(2).strip() for m in DEF_RE.finditer(block)}
        if block
        else {}
    )


def resolve_map(css: str, palette: str, mode: str) -> dict[str, str]:
    root = _defs(_block(css, ":root {"))
    out = dict(root)
    if mode == "dark":
        out.update(_defs(_block(css, '[data-theme="dark"] {')))
    if palette != "warm-literary":
        out.update(_defs(_block(css, f'[data-app-theme="{palette}"] {{')))
        if mode == "dark":
            out.update(
                _defs(_block(css, f'[data-app-theme="{palette}"][data-theme="dark"] {{'))
            )
    return out


def to_rgba(value: str, tokens: dict[str, str], depth: int = 0) -> tuple[int, int, int, float] | None:
    value = value.strip()
    if depth > 6:
        return None
    if value.startswith("var("):
        inner = value[4 : value.rfind(")")]
        name = inner.split(",")[0].strip()
        if name in tokens:
            return to_rgba(tokens[name], tokens, depth + 1)
        if "," in inner:
            return to_rgba(inner.split(",", 1)[1].strip(), tokens, depth + 1)
        return None
    m = re.match(r"#([0-9a-fA-F]{6})$", value)
    if m:
        h = m.group(1)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
    m = re.match(r"#([0-9a-fA-F]{3})$", value)
    if m:
        h = m.group(1)
        return tuple(int(h[i] * 2, 16) for i in range(3)) + (1.0,)  # type: ignore[return-value]
    m = re.match(r"rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*(?:[,/]\s*([\d.]+))?", value)
    if m:
        a = float(m.group(4)) if m.group(4) else 1.0
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)), a)
    return None


def _composite(fg: tuple[int, int, int, float], bg: tuple[int, int, int]) -> tuple[int, int, int]:
    a = fg[3]
    return tuple(round(fg[i] * a + bg[i] * (1 - a)) for i in range(3))  # type: ignore[return-value]


def _lum(rgb: tuple[int, int, int]) -> float:
    def chan(c: float) -> float:
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2])


def contrast(c1: tuple[int, int, int], c2: tuple[int, int, int]) -> float:
    hi, lo = max(_lum(c1), _lum(c2)), min(_lum(c1), _lum(c2))
    return (hi + 0.05) / (lo + 0.05)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--enforce", action="store_true", help="exit 1 on any failure")
    parser.add_argument("--quiet", action="store_true", help="print only failures")
    args = parser.parse_args()

    if not GLOBAL_CSS.exists():
        print(f"error: {GLOBAL_CSS} not found", file=sys.stderr)
        return 2

    css = GLOBAL_CSS.read_text(encoding="utf-8")
    failures: list[str] = []
    checked = 0

    for fg, bg, label, thr, base in PAIRS:
        if not args.quiet:
            print(f"{label} (>= {thr}):")
        for palette in PALETTES:
            for mode in ("light", "dark"):
                tokens = resolve_map(css, palette, mode)
                fgc = to_rgba(tokens.get(fg, ""), tokens)
                bgc = to_rgba(tokens.get(bg, ""), tokens)
                if not fgc or not bgc:
                    continue
                base_rgb = None
                if base:
                    b = to_rgba(tokens.get(base, ""), tokens)
                    base_rgb = b[:3] if b else None
                if bgc[3] < 1.0 and base_rgb:
                    bg_rgb = _composite(bgc, base_rgb)
                else:
                    bg_rgb = bgc[:3]
                fg_rgb = _composite(fgc, bg_rgb) if fgc[3] < 1.0 else fgc[:3]
                ratio = contrast(fg_rgb, bg_rgb)
                checked += 1
                ok = ratio >= thr
                if not ok:
                    failures.append(f"{label}  {palette}/{mode[0].upper()}  {ratio:.2f} < {thr}")
                if not args.quiet:
                    flag = " " if ok else "!"
                    print(f"    {palette:13}/{mode[0].upper()}  {ratio:5.2f}{flag}")
        if not args.quiet:
            print()

    if failures:
        print(f"{len(failures)} contrast failure(s) (of {checked} checked):")
        for f in failures:
            print(f"  FAIL  {f}")
        print(
            "\nFix: adjust the offending token value in global.css for the\n"
            "failing variant(s). For graphical-only tokens (icons/badges)\n"
            "the 3:1 bar applies; for body text it is 4.5:1."
        )
        return 1 if args.enforce else 0

    print(f"All {checked} contrast checks pass across 12 variants.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
