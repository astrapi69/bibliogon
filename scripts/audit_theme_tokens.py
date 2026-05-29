#!/usr/bin/env python3
"""audit_theme_tokens.py — cross-check every ``var(--token, #fallback)``
callsite in ``frontend/src/`` against the per-palette CSS variable
definitions in ``frontend/src/styles/global.css``. Report tokens
missing from one or more palette × mode combinations and exit 1
in ``--enforce`` mode.

Why this exists
---------------
Bibliogon ships 5 palettes (`classic`, `cool-modern`, `nord`,
`notebook`, `studio`) × light + dark = 10 theme variants. Every
CSS custom property referenced via ``var(--token, #fallback)``
silently falls through to the hex value when ``--token`` is not
defined in the active palette × mode combination. Symptom: one
palette renders a button with the wrong color while every other
palette looks correct. The fall-through is invisible to UI tests
because the hex IS a valid color.

This bug class fired twice:
- v0.31.0 Pre-Release Audit: 9 components needed ``--surface-2``,
  ``--danger-bg``, ``--success``, ``--warning``.
- 2026-05-15 UX-Full-Audit (G4-F4): 5 tokens (``--error``,
  ``--bg-warning``, ``--success-light``, ``--warning-light``,
  ``--warning-dark``) missing across 12 callsites.

Filed by THEME-TOKEN-COMPLETENESS-AUDIT-01 as a recurring-issue
class. Run on every release-cycle pre-release sweep (per the
"Periodic theme-token completeness audit" lessons-learned entry).

Classification + completeness rule
----------------------------------
For each unique ``--token`` referenced via ``var(--token, #hex)``:

- Inventory every palette × mode block in ``global.css``:
  ``[data-app-theme="<p>"]`` (light) and
  ``[data-app-theme="<p>"][data-theme="dark"]`` (dark) for each
  of the 5 palettes, plus the two default-inheritance blocks
  ``:root`` (default light) and ``[data-theme="dark"]`` (default
  dark).
- A token is "covered" for a palette × mode iff it is defined
  either in the explicit per-palette block OR in the relevant
  default block (``:root`` for light; ``:root`` or
  ``[data-theme="dark"]`` for dark). The cascade resolves a
  missing per-palette definition through the defaults.
- A token is FIXABLE if at least one palette × mode is uncovered.

Usage
-----
::

    python3 scripts/audit_theme_tokens.py
        # prints coverage table + missing-token report; exit 0

    python3 scripts/audit_theme_tokens.py --enforce
        # exits 1 if any token has a gap. Suitable for pre-commit / CI.

    python3 scripts/audit_theme_tokens.py --quiet
        # skips the full per-token coverage table; only the
        # missing-token report. Useful in pre-commit output.

Stdlib-only (re + pathlib + argparse).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"
GLOBAL_CSS = FRONTEND_SRC / "styles" / "global.css"

# Match var(--token, #hex...) callsites. The hex fallback is the
# trigger for the audit: if ``--token`` is undefined, the hex
# silently renders. ``var(--token, var(--other))`` chains do not
# count here because they pull from another token rather than
# leaking a hex literal.
VAR_FALLBACK_RE = re.compile(r"var\(\s*(--[a-z0-9-]+)\s*,\s*#[0-9a-fA-F]+")

# Match ``--token: value;`` inside a CSS block.
DEF_RE = re.compile(r"^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);", re.MULTILINE)

# 5 palettes × 2 modes = 10 theme variants. Plus two default-
# inheritance blocks (``:root`` and ``[data-theme="dark"]``) that
# every palette falls back to when it has not overridden a token.
PALETTES = ["classic", "cool-modern", "nord", "notebook", "studio"]

SELECTORS: dict[tuple[str, str], str] = {}
for _p in PALETTES:
    SELECTORS[(_p, "light")] = f'[data-app-theme="{_p}"] {{'
    SELECTORS[(_p, "dark")] = f'[data-app-theme="{_p}"][data-theme="dark"] {{'
SELECTORS[(":root", "default")] = ":root {"
SELECTORS[("default", "dark")] = '[data-theme="dark"] {'


def extract_block(text: str, selector: str) -> str | None:
    """Return the contents of the first CSS block whose opening
    line ends with ``selector`` (which itself ends with ``{``).
    Brace-balanced — string literals are not expected to appear in
    a CSS rule body. Returns None if not found."""
    for m in re.finditer(re.escape(selector), text):
        i = m.end() - 1  # at the '{' itself
        depth = 1
        j = i + 1
        while j < len(text) and depth > 0:
            ch = text[j]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[i + 1 : j]
            j += 1
        return text[i + 1 : j] if depth == 0 else None
    return None


def inventory_callsites() -> dict[str, list[tuple[str, int]]]:
    """Return token -> list of (rel-path, line-no) callsites."""
    by_token: dict[str, list[tuple[str, int]]] = {}
    for path in sorted(
        list(FRONTEND_SRC.glob("**/*.ts"))
        + list(FRONTEND_SRC.glob("**/*.tsx"))
        + list(FRONTEND_SRC.glob("**/*.css"))
    ):
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for m in VAR_FALLBACK_RE.finditer(text):
            token = m.group(1)
            line = text[: m.start()].count("\n") + 1
            by_token.setdefault(token, []).append(
                (str(path.relative_to(REPO_ROOT)), line)
            )
    return by_token


def inventory_definitions() -> dict[tuple[str, str], set[str]]:
    """Return (palette_or_root, mode) -> set of defined token names."""
    text = GLOBAL_CSS.read_text(encoding="utf-8")
    result: dict[tuple[str, str], set[str]] = {}
    for key, selector in SELECTORS.items():
        block = extract_block(text, selector)
        if block is None:
            result[key] = set()
            continue
        result[key] = {dm.group(1) for dm in DEF_RE.finditer(block)}
    return result


# --- Undefined-token check (closes the hex-fallback blind spot) ---
#
# The coverage check above only sees ``var(--token, #hex)`` callsites.
# A bare ``var(--token)`` (no hex fallback) referencing a token that is
# defined in NO palette block resolves to nothing and silently falls to
# the initial/inherited value — invisible to the coverage check. This
# pass flags any referenced custom property that is defined nowhere.

# Custom properties injected at runtime (not defined in source):
#   --radix-*  : Radix UI writes these on its own elements.
RUNTIME_TOKEN_PREFIXES = ("--radix-",)

_DEF_CSS_RE = re.compile(r"(?<![\w-])(--[a-z0-9-]+)\s*:")
_DEF_TSX_RE = re.compile(r"""["'](--[a-z0-9-]+)["']\s*:""")
_SETPROP_RE = re.compile(r"""setProperty\(\s*["'](--[a-z0-9-]+)["']""")
_VAR_REF_RE = re.compile(r"var\(\s*(--[a-z0-9-]+)")


def _frontend_source_files() -> list[Path]:
    return sorted(
        list(FRONTEND_SRC.glob("**/*.ts"))
        + list(FRONTEND_SRC.glob("**/*.tsx"))
        + list(FRONTEND_SRC.glob("**/*.css"))
    )


def inventory_defined_anywhere() -> set[str]:
    """Every custom property defined anywhere in ``frontend/src``:
    as ``--x:`` in CSS, as ``"--x":`` in a TSX inline-style object, or
    set at runtime via ``element.style.setProperty("--x", ...)``."""
    defined: set[str] = set()
    for path in _frontend_source_files():
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for rx in (_DEF_CSS_RE, _DEF_TSX_RE, _SETPROP_RE):
            defined.update(m.group(1) for m in rx.finditer(text))
    return defined


def inventory_all_var_refs() -> dict[str, list[tuple[str, int]]]:
    """Every ``var(--token`` reference (any fallback shape)."""
    refs: dict[str, list[tuple[str, int]]] = {}
    for path in _frontend_source_files():
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for m in _VAR_REF_RE.finditer(text):
            line = text[: m.start()].count("\n") + 1
            refs.setdefault(m.group(1), []).append(
                (str(path.relative_to(REPO_ROOT)), line)
            )
    return refs


def find_undefined_refs(
    defined: set[str],
    refs: dict[str, list[tuple[str, int]]],
) -> dict[str, list[tuple[str, int]]]:
    """Referenced tokens defined nowhere and not runtime-injected."""
    return {
        token: sites
        for token, sites in refs.items()
        if token not in defined
        and not token.startswith(RUNTIME_TOKEN_PREFIXES)
    }


def find_gaps(
    callsites: dict[str, list[tuple[str, int]]],
    defs: dict[tuple[str, str], set[str]],
) -> dict[str, list[str]]:
    """For each referenced token, return the list of palette/mode
    combinations where the token is not covered."""
    gaps: dict[str, list[str]] = {}
    root_set = defs.get((":root", "default"), set())
    dark_root_set = defs.get(("default", "dark"), set())
    for token in callsites:
        token_gaps: list[str] = []
        for p in PALETTES:
            light_has = token in defs[(p, "light")] or token in root_set
            if not light_has:
                token_gaps.append(f"{p}/L")
            # Dark inherits from palette-light AND from default-dark.
            dark_has = (
                token in defs[(p, "dark")]
                or token in defs[(p, "light")]
                or token in dark_root_set
                or token in root_set
            )
            if not dark_has:
                token_gaps.append(f"{p}/D")
        if token_gaps:
            gaps[token] = token_gaps
    return gaps


def print_coverage_table(
    callsites: dict[str, list[tuple[str, int]]],
    defs: dict[tuple[str, str], set[str]],
) -> None:
    header = ["token"] + [f"{p}/L" for p in PALETTES] + [f"{p}/D" for p in PALETTES]
    widths = [max(len(c), 14) for c in header]
    print("  ".join(c.ljust(w) for c, w in zip(header, widths)))
    root_set = defs.get((":root", "default"), set())
    dark_root_set = defs.get(("default", "dark"), set())
    for token in sorted(callsites.keys()):
        row = [token]
        for p in PALETTES:
            ok = token in defs[(p, "light")] or token in root_set
            row.append("OK" if ok else "MISSING")
        for p in PALETTES:
            ok = (
                token in defs[(p, "dark")]
                or token in defs[(p, "light")]
                or token in dark_root_set
                or token in root_set
            )
            row.append("OK" if ok else "MISSING")
        print("  ".join(c.ljust(w) for c, w in zip(row, widths)))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="exit 1 if any token has a palette × mode gap",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="skip the full per-token coverage table; only print gaps",
    )
    args = parser.parse_args()

    if not GLOBAL_CSS.exists():
        print(f"error: {GLOBAL_CSS} not found", file=sys.stderr)
        return 2

    callsites = inventory_callsites()
    defs = inventory_definitions()

    if not args.quiet:
        print(f"Tokens referenced via var(--token, #hex): {len(callsites)}")
        print(f"Total callsites: {sum(len(v) for v in callsites.values())}")
        print()
        print_coverage_table(callsites, defs)
        print()

    # Undefined-token check (bare var(--token) referencing a token
    # defined in no palette block — the hex-fallback blind spot).
    defined_anywhere = inventory_defined_anywhere()
    all_refs = inventory_all_var_refs()
    undefined = find_undefined_refs(defined_anywhere, all_refs)

    gaps = find_gaps(callsites, defs)

    if not gaps and not undefined:
        if not args.quiet:
            print("ALL TOKENS COVERED. No undefined token references.")
        return 0

    if undefined:
        print(f"{len(undefined)} referenced token(s) defined in NO palette:")
        print()
        for token in sorted(undefined):
            sites = undefined[token]
            print(f"  {token}: {len(sites)} callsite(s)")
            for f, ln in sites[:3]:
                print(f"      {f}:{ln}")
            if len(sites) > 3:
                print(f"      ... +{len(sites) - 3} more")
        print()
        print(
            "Fix: point each at a defined semantic token, or define the\n"
            "token in global.css. Runtime-injected tokens (--radix-*) and\n"
            "JS-set custom props (setProperty) are exempt automatically.\n"
            "See the lessons-learned 'theme-token completeness' entry."
        )
        print()

    if not gaps:
        if args.enforce and undefined:
            return 1
        return 0

    print(f"{len(gaps)} token(s) have palette × mode gaps:")
    print()
    for token in sorted(gaps):
        print(f"  {token}: missing in {', '.join(gaps[token])}")
        sites = callsites[token]
        print(f"    {len(sites)} callsite(s):")
        for f, ln in sites[:3]:
            print(f"      {f}:{ln}")
        if len(sites) > 3:
            print(f"      ... +{len(sites) - 3} more")
    print()
    print(
        "Fix: define the token in either ``:root`` (and ``[data-theme=\"dark\"]``\n"
        "for the dark variant) of ``frontend/src/styles/global.css``, or in\n"
        "the relevant per-palette block when the value should vary. See the\n"
        "lessons-learned ``Periodic theme-token completeness audit`` entry."
    )
    if args.enforce:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
