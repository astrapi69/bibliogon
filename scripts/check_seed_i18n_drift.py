#!/usr/bin/env python3
"""check_seed_i18n_drift.py — fail when the offline i18n seed mirror has
drifted from the YAML catalogs.

Why this exists
---------------
The backendless GitHub-Pages PWA seeds its i18n from
``frontend/src/storage/seed/seed-i18n-<lang>.json``, which is generated
from ``backend/config/i18n/<lang>.yaml`` by ``make generate-seed-data``.
That regeneration is a MANUAL step, so a key added to the YAML but never
mirrored falls back to the raw key **offline only** - online and desktop
read the YAML directly and look fine. #699 found whole key groups missing
that way (``ui.migration.*``, ``ui.book_templates.*``), each shipped one
release cycle earlier.

This is the closed-set verifier for that open-set drift: the YAML is the
source of truth, the seed must mirror it key-for-key and value-for-value.

It also rejects duplicate mapping keys inside one catalog. A key inserted
under a namespace block that already exists further down the file produces
a SECOND mapping key; YAML's last-one-wins then silently discards the
insertion. The existing cross-catalog parity test cannot see it (both
catalogs agree), and neither can a key-set diff against the seed (the seed
is generated from the same parsed dict) - so it needs its own check.

Usage::

    python3 scripts/check_seed_i18n_drift.py             # report, exit 0
    python3 scripts/check_seed_i18n_drift.py --enforce   # exit 1 on drift

Needs PyYAML (already a backend dependency); run it from the backend venv
or via ``make verify-seed-i18n``.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOG_DIR = REPO_ROOT / "backend" / "config" / "i18n"
SEED_DIR = REPO_ROOT / "frontend" / "src" / "storage" / "seed"

LANGUAGES = ("de", "en", "es", "fr", "el", "pt", "tr", "ja")

# How many example keys to print per finding before truncating.
SAMPLE = 8


class DuplicateKeyLoader(yaml.SafeLoader):
    """SafeLoader that records duplicate mapping keys instead of overwriting.

    PyYAML's default is last-one-wins, which is precisely the silent
    discard this check exists to surface.
    """

    duplicates: list[str]

    def __init__(self, stream):  # noqa: D107 - loader plumbing
        super().__init__(stream)
        self.duplicates = []


def _construct_mapping(loader: DuplicateKeyLoader, node, deep: bool = False):
    loader.flatten_mapping(node)
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            loader.duplicates.append(str(key))
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


DuplicateKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping
)


def load_catalog(path: Path) -> tuple[dict, list[str]]:
    """Return ``(parsed, duplicate_keys)`` for one catalog."""
    loader = DuplicateKeyLoader(path.read_text(encoding="utf-8"))
    try:
        parsed = loader.get_single_data() or {}
        return parsed, list(loader.duplicates)
    finally:
        loader.dispose()


def flatten(tree: object, prefix: str = "") -> dict[str, object]:
    """Flatten a nested catalog into dotted-path -> leaf value."""
    flat: dict[str, object] = {}
    if not isinstance(tree, dict):
        return flat
    for key, value in tree.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            flat.update(flatten(value, path + "."))
        else:
            flat[path] = value
    return flat


def _sample(keys: list[str]) -> str:
    shown = ", ".join(keys[:SAMPLE])
    if len(keys) > SAMPLE:
        shown += f", … (+{len(keys) - SAMPLE} more)"
    return shown


def check() -> list[str]:
    """Return one problem description per finding; empty means in sync."""
    problems: list[str] = []
    for lang in LANGUAGES:
        catalog_path = CATALOG_DIR / f"{lang}.yaml"
        seed_path = SEED_DIR / f"seed-i18n-{lang}.json"
        if not catalog_path.exists():
            problems.append(f"{lang}: catalog missing at {catalog_path}")
            continue
        if not seed_path.exists():
            problems.append(
                f"{lang}: seed mirror missing at {seed_path} (run `make generate-seed-data`)"
            )
            continue

        catalog, duplicates = load_catalog(catalog_path)
        if duplicates:
            problems.append(
                f"{lang}: duplicate mapping key(s) in {catalog_path.name}: "
                f"{_sample(sorted(set(duplicates)))} - YAML keeps only the LAST "
                "block, so the other insertion is silently discarded. Merge the "
                "keys into the existing namespace block."
            )

        expected = flatten(catalog)
        actual = flatten(json.loads(seed_path.read_text(encoding="utf-8")))

        missing = sorted(set(expected) - set(actual))
        if missing:
            problems.append(
                f"{lang}: {len(missing)} key(s) in the YAML are not mirrored in "
                f"the seed: {_sample(missing)}"
            )

        stale = sorted(set(actual) - set(expected))
        if stale:
            problems.append(
                f"{lang}: {len(stale)} key(s) in the seed no longer exist in the "
                f"YAML: {_sample(stale)}"
            )

        changed = sorted(k for k in set(expected) & set(actual) if expected[k] != actual[k])
        if changed:
            problems.append(
                f"{lang}: {len(changed)} key(s) have a different value in the "
                f"seed: {_sample(changed)}"
            )
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="exit 1 when the seed mirror has drifted",
    )
    args = parser.parse_args()

    problems = check()
    if not problems:
        print(f"Offline i18n seed mirror is in sync with all {len(LANGUAGES)} YAML catalogs.")
        return 0

    print("Offline i18n seed mirror has drifted (#699):")
    for problem in problems:
        print(f"  - {problem}")
    print()
    print(
        "Fix: run `make generate-seed-data` and commit "
        "frontend/src/storage/seed/seed-i18n-*.json. Without it the "
        "backendless PWA falls back to raw keys for the missing strings, "
        "offline only."
    )
    return 1 if args.enforce else 0


if __name__ == "__main__":
    sys.exit(main())
