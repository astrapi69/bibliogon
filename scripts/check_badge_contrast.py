#!/usr/bin/env python3
"""WCAG AA contrast gate for the semantic status badges.

The four semantic badges (``.badge-success`` / ``.badge-warning`` /
``.badge-danger`` / ``.badge-info``) render colored text on a
``color-mix(... 15%, transparent)`` tint that composites over the card
background. ``check_theme_contrast.py`` only inspects simple
token-to-token pairs and cannot evaluate ``color-mix``, so the badge
text/tint pairs were never gated — and shipped below AA (success
2.78:1 on the default theme, the Dashboard axe color-contrast
violation fixed in this commit).

This checker replicates the badge CSS arithmetic for every one of the
12 theme variants (6 palettes x light/dark):

    background = 15% * semantic + 85% * card        (tint over card)
    text       = 45% * semantic + 55% * text-primary (the AA-safe mix)

and asserts >= 4.5:1. It parses the same ``global.css`` the browser
ships, so a future token retune or a regression of the mix ratio fails
the gate. Wired into ``make verify-theme``.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GLOBAL_CSS = REPO_ROOT / "frontend" / "src" / "styles" / "global.css"

PALETTES = ["warm-literary", "cool-modern", "nord", "classic", "studio", "notebook"]
# (badge class, semantic token). Background tint % and text mix % mirror
# the .badge-* rules in global.css.
BADGES = [
    ("badge-success", "--success"),
    ("badge-warning", "--warning"),
    ("badge-danger", "--danger"),
    ("badge-info", "--accent"),
]
TINT_PCT = 0.15  # semantic share of the background (rest = card)
TEXT_SEMANTIC_PCT = 0.45  # semantic share of the text (rest = text-primary)
THRESHOLD = 4.5


def _hex2rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(c * 2 for c in value)
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _lin(channel: float) -> float:
    channel /= 255
    return channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4


def _luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = (_lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _ratio(fg: tuple[int, int, int], bg: tuple[int, int, int]) -> float:
    l1, l2 = _luminance(fg), _luminance(bg)
    lo, hi = min(l1, l2), max(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def _mix(a: tuple[int, int, int], b: tuple[int, int, int], a_share: float) -> tuple[int, int, int]:
    return tuple(round(a[i] * a_share + b[i] * (1 - a_share)) for i in range(3))  # type: ignore[return-value]


def _block(css: str, selector: str) -> str:
    idx = css.find(selector + " {")
    if idx < 0:
        idx = css.find(selector + "{")
    if idx < 0:
        return ""
    end = css.find("\n}", idx)
    return css[idx:end]


def _tokens(block: str) -> dict[str, str]:
    return {
        m.group(1): m.group(2) for m in re.finditer(r"(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})", block)
    }


def _variants(css: str) -> dict[tuple[str, str], dict[str, str]]:
    base_light = _tokens(_block(css, ":root"))
    base_dark = {**base_light, **_tokens(_block(css, '[data-theme="dark"]'))}
    out: dict[tuple[str, str], dict[str, str]] = {
        ("warm-literary", "light"): base_light,
        ("warm-literary", "dark"): base_dark,
    }
    for pal in PALETTES[1:]:
        light = _tokens(_block(css, f'[data-app-theme="{pal}"]'))
        dark = _tokens(_block(css, f'[data-app-theme="{pal}"][data-theme="dark"]'))
        out[(pal, "light")] = {**base_light, **light}
        out[(pal, "dark")] = {**base_dark, **light, **dark}
    return out


def main() -> int:
    css = GLOBAL_CSS.read_text(encoding="utf-8")
    variants = _variants(css)
    failures: list[str] = []
    worst = 99.0
    for (pal, mode), tk in variants.items():
        card = _hex2rgb(tk["--bg-card"])
        text_primary = _hex2rgb(tk["--text-primary"])
        for name, semantic_token in BADGES:
            semantic = _hex2rgb(tk[semantic_token])
            bg = _mix(semantic, card, TINT_PCT)
            fg = _mix(semantic, text_primary, TEXT_SEMANTIC_PCT)
            r = _ratio(fg, bg)
            worst = min(worst, r)
            if r < THRESHOLD:
                failures.append(f"  {pal}/{mode} .{name}: {r:.2f}:1 (need >= {THRESHOLD})")
    if failures:
        print("Badge contrast FAIL:")
        print("\n".join(failures))
        return 1
    print(
        f"All {len(variants) * len(BADGES)} badge contrast checks pass "
        f"across {len(variants)} variants (worst {worst:.2f}:1)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
