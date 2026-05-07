#!/usr/bin/env python3
"""Pre-commit hook: every staged docs/help/{en,de}/*.md must be in _meta.yaml.

Scope (commit 4 of MKDOCS-DISCIPLINE-01): catches the orphan-page
failure mode at commit time — a contributor adding a new help page
without registering it in ``docs/help/_meta.yaml`` would otherwise
ship a page that the in-app help panel cannot find AND that mkdocs
silently leaves out of the public nav.

Per the pre-inspection Q6 (only-new-pages scope): the hook only
checks the .md files staged for the current commit. Existing pages
that drifted out of _meta.yaml are caught by ``make
verify-mkdocs-nav`` and the bilingual parity test, not by this
hook. Keeping the hook narrow keeps the failure mode obvious — a
new file appears, the hook says where to register it.

Pre-commit invocation passes the staged file paths as positional
args. The hook fails when any of those paths is a help page whose
slug (path minus extension, relative to ``docs/help/{en,de}/``)
does not appear in ``_meta.yaml``.

Exits:
  0 — every staged help page is registered in _meta.yaml
  1 — at least one orphan staged help page; remediation hint printed
  2 — _meta.yaml itself is missing or malformed
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
META_PATH = REPO_ROOT / "docs" / "help" / "_meta.yaml"
HELP_PREFIX = "docs/help"


def _collect_meta_slugs() -> set[str]:
    """Return every slug declared in _meta.yaml (top-level + recursive)."""
    if not META_PATH.exists():
        print(f"ERROR: {META_PATH} not found", file=sys.stderr)
        sys.exit(2)
    try:
        meta = yaml.safe_load(META_PATH.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        print(f"ERROR: {META_PATH} is malformed YAML: {exc}", file=sys.stderr)
        sys.exit(2)

    slugs: set[str] = set()

    def walk(items: list[dict]) -> None:
        for item in items or []:
            if "slug" in item:
                slugs.add(item["slug"])
            if "children" in item:
                walk(item["children"])

    walk(meta.get("navigation", []))
    return slugs


def _path_to_slug(path: Path) -> str | None:
    """Convert a docs/help/{en,de}/<slug>.md path into the slug.

    Returns None if the path is not under docs/help/{en,de}/ or is
    a non-Markdown file.
    """
    try:
        rel = path.resolve().relative_to(REPO_ROOT)
    except ValueError:
        return None
    parts = rel.parts
    # parts == ("docs", "help", "<lang>", ...path...)
    if len(parts) < 4:
        return None
    if parts[0] != "docs" or parts[1] != "help":
        return None
    if parts[2] not in ("en", "de"):
        return None
    if not str(rel).endswith(".md"):
        return None
    # Slug = path under docs/help/<lang>/, no .md extension.
    slug_parts = parts[3:]
    slug = "/".join(slug_parts)
    if slug.endswith(".md"):
        slug = slug[:-3]
    return slug


# Files allowed to live under docs/help/{en,de}/ without a
# _meta.yaml entry. Any addition here needs a comment explaining
# why the file is intentionally not in nav.
ALLOWLIST = {
    # Landing pages: contract differs from help-page contract;
    # _meta.yaml drives help-panel nav, but index.md is the
    # mkdocs-yml-only Home entry that lives outside the
    # auto-generated nav block.
    "index",
}


def main(argv: list[str]) -> int:
    if not argv:
        # No files staged in the hook's `files:` filter; nothing to check.
        return 0

    meta_slugs = _collect_meta_slugs()
    missing: list[tuple[str, str]] = []  # (path, slug)

    for arg in argv:
        path = Path(arg)
        slug = _path_to_slug(path)
        if slug is None:
            continue
        if slug in ALLOWLIST:
            continue
        if slug not in meta_slugs:
            missing.append((str(path), slug))

    if not missing:
        return 0

    print(
        "ERROR: help pages staged without an entry in "
        "docs/help/_meta.yaml:",
        file=sys.stderr,
    )
    for path, slug in missing:
        print(f"  - {path}  (slug: {slug!r})", file=sys.stderr)
    print(
        "\nAdd an entry under the appropriate section in "
        "docs/help/_meta.yaml. Example:",
        file=sys.stderr,
    )
    example_slug = missing[0][1]
    example_section = example_slug.split("/")[0] if "/" in example_slug else "<section>"
    print(
        f"\n  - title:\n"
        f"      de: <German label>\n"
        f"      en: <English label>\n"
        f"    slug: {example_slug}\n",
        file=sys.stderr,
    )
    print(
        "Then run `make sync-mkdocs-nav` to propagate to mkdocs.yml.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
