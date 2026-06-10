#!/usr/bin/env python3
"""Build the in-scope file list for the umlaut sweep scripts.

Writes a sorted, deduplicated list of repository paths that should
participate in the umlaut sweep (whitelist scan + replacement run)
to ``/tmp/in-scope-files.txt`` (or path passed via ``--output``).

Scope policy (matches ``.claude/rules/lessons-learned.md`` German
umlaut section):

In scope:
  - ``backend/config/i18n/de.yaml``
  - ``docs/help/de/**/*.md``
  - ``docs/journal/**/*.md``
  - ``docs/explorations/**/*.md`` (German prose where present)
  - ``docs/CHANGELOG.md`` / ``docs/CONCEPT.md`` / ``docs/ROADMAP.md``
    / ``docs/backlog.md``
  - Plugin German content under ``plugins/**/content/de/**/*.md``
  - ``README.md`` (occasional German section)

Explicitly NOT in scope:
  - ``.claude/rules/*.md`` - rules are English; only the policy
    explainer references umlauts as examples.
  - Source code (``*.py``, ``*.ts``, ``*.tsx``) - identifiers and
    code comments stay ASCII per the rule split.
  - Auto-translated non-DE i18n YAMLs (es, fr, pt, tr, ja, el, en) -
    those have their own diacritic-coverage track (I18N-DIACRITICS-01).
  - Test fixtures, snapshot files, generated artifacts.

Usage::

    python3 scripts/build_in_scope_list.py
    python3 scripts/build_in_scope_list.py --output /tmp/scope.txt
"""

from __future__ import annotations

import argparse
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Concrete files (existence checked before adding).
CONCRETE_FILES: list[str] = [
    "README.md",
    "backend/config/i18n/de.yaml",
    "docs/CHANGELOG.md",
    "docs/CONCEPT.md",
    "docs/ROADMAP.md",
    "docs/backlog.md",
    "docs/help/_meta.yaml",
]

# Glob patterns relative to PROJECT_ROOT.
GLOB_PATTERNS: list[str] = [
    "docs/help/de/**/*.md",
    "docs/journal/**/*.md",
    "docs/explorations/**/*.md",
    "plugins/*/content/de/**/*.md",
    "plugins/*/bibliogon_*/content/de/**/*.md",
]


def collect() -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []

    for rel in CONCRETE_FILES:
        path = PROJECT_ROOT / rel
        if path.is_file() and path not in seen:
            seen.add(path)
            out.append(path)

    for pattern in GLOB_PATTERNS:
        for path in sorted(PROJECT_ROOT.glob(pattern)):
            if path.is_file() and path not in seen:
                seen.add(path)
                out.append(path)

    return sorted(out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        default="/tmp/in-scope-files.txt",  # nosec B108
        help="Output path (default /tmp/in-scope-files.txt).",
    )
    args = parser.parse_args()

    files = collect()
    output_path = Path(args.output)
    rel_paths = sorted(
        str(p.relative_to(PROJECT_ROOT)) for p in files
    )
    output_path.write_text("\n".join(rel_paths) + "\n", encoding="utf-8")

    print(f"Wrote {len(rel_paths)} paths to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
