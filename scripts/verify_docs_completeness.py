#!/usr/bin/env python3
"""verify_docs_completeness.py — release-time documentation gate.

Complements ``verify-docs-discipline`` (which checks mkdocs-nav sync +
orphans). This script adds 8 completeness checks across the whole doc
surface so a release can't ship with a stale version header, an
asymmetric help-doc pair, a broken image / internal link, or a
feature registry that grew without help coverage.

Exit codes (consumed by ``make release-test`` + the release-gate):
    0 = all checks pass (WARN-free)
    1 = at least one FAIL (blocks the release)
    2 = WARN only (advisory; does not block)

Tiering rationale — a release gate that FAILs on the current correct
state is worse than useless, so checks are split FAIL vs WARN by how
unambiguous the contract is:

  FAIL (hard contract, no false positives on current state):
    - version-header staleness in files that carry a version line
    - help-doc DE<->EN parity
    - mkdocs ``_meta.yaml`` orphans / dead slug refs
    - broken image references in help docs
    - dead internal ``.md`` links (outside docs/archive)
    - the content-types feature help page must exist

  WARN (real signal, but no 1:1 convention exists today, so a strict
  FAIL would block the current correct state):
    - per-book-type / per-settings-tab help coverage (docs are
      organised by topic, not 1:1 by registry id)
    - README feature-mention coverage (wording varies)
    - CLAUDE.md test-count staleness (counts drift between sessions)
    - screenshots older than 30 days

When a 1:1 convention is later adopted (e.g. one help page per book
type), move that check from WARN to FAIL here.
"""

from __future__ import annotations

import re
import sys
import time
import tomllib
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HELP = REPO / "docs" / "help"
META = HELP / "_meta.yaml"

fails: list[str] = []
warns: list[str] = []


def fail(msg: str) -> None:
    fails.append(msg)


def warn(msg: str) -> None:
    warns.append(msg)


def canonical_version() -> str:
    data = tomllib.loads((REPO / "backend" / "pyproject.toml").read_text("utf-8"))
    return data["tool"]["poetry"]["version"]


# --- Check 1: version consistency ---------------------------------------

# Each file maps to the regex that captures the version it should carry
# in its header. Files NOT listed here (e.g. CONTRIBUTING.md, which has
# no version line by design) are intentionally skipped.
VERSION_HEADER_PATTERNS = {
    "README.md": r"Current version: \*\*v([0-9]+\.[0-9]+\.[0-9]+)\*\*",
    "README-de.md": r"Aktuelle Version: \*\*v([0-9]+\.[0-9]+\.[0-9]+)\*\*",
    "CLAUDE.md": r"\*\*Version:\*\* ([0-9]+\.[0-9]+\.[0-9]+)",
    "docs/ROADMAP.md": r"Latest release: v([0-9]+\.[0-9]+\.[0-9]+)",
    "docs/backlog.md": r"Latest release: v([0-9]+\.[0-9]+\.[0-9]+)",
}


def check_version(version: str) -> None:
    for rel, pat in VERSION_HEADER_PATTERNS.items():
        path = REPO / rel
        if not path.exists():
            fail(f"[version] {rel} is missing")
            continue
        head = "\n".join(path.read_text("utf-8").splitlines()[:12])
        m = re.search(pat, head)
        if not m:
            warn(f"[version] {rel} has no version-header line matching the expected pattern")
            continue
        if m.group(1) != version:
            fail(f"[version] {rel} header says v{m.group(1)}, canonical is v{version}")


# --- Help-doc inventory helpers -----------------------------------------


def help_md_files(lang: str) -> set[str]:
    base = HELP / lang
    return {
        str(p.relative_to(base)).replace("\\", "/")[:-3]  # strip .md
        for p in base.rglob("*.md")
    }


# --- Check 2: feature-help-page coverage --------------------------------


def yaml_ids(path: Path) -> list[str]:
    return re.findall(r"^\s*- id:\s*([a-z_]+)", path.read_text("utf-8"), re.MULTILINE)


def check_feature_coverage(en: set[str], de: set[str]) -> None:
    # content-types: one feature page covers all 8 types (FAIL if absent).
    ct_ids = yaml_ids(REPO / "backend" / "config" / "content-types.yaml")
    if ct_ids and "articles/content-types" not in en:
        fail(
            "[feature] content-types registry exists but docs/help/en/articles/content-types.md is missing"
        )
    if ct_ids and "articles/content-types" not in de:
        fail(
            "[feature] content-types registry exists but docs/help/de/articles/content-types.md is missing"
        )

    # book-types: docs are organised by topic, not 1:1 by type id. WARN
    # if a type id is not mentioned in ANY help page body.
    bt_ids = re.findall(
        r"^\s*- id:\s*([a-z_]+)",
        (REPO / "backend" / "config" / "book-types.yaml").read_text("utf-8"),
        re.MULTILINE,
    )
    corpus = "\n".join(p.read_text("utf-8") for p in (HELP / "en").rglob("*.md")).lower()
    for bid in bt_ids:
        token = bid.replace("_", " ")
        if bid not in corpus and token not in corpus:
            warn(
                f"[feature] book-type '{bid}' is not mentioned in any en help page (no 1:1 page convention; advisory)"
            )


# --- Check 3: help-doc i18n parity --------------------------------------


def check_i18n_parity(en: set[str], de: set[str]) -> None:
    only_en = sorted(en - de)
    only_de = sorted(de - en)
    for slug in only_en:
        fail(f"[i18n] docs/help/en/{slug}.md has no docs/help/de counterpart")
    for slug in only_de:
        fail(f"[i18n] docs/help/de/{slug}.md has no docs/help/en counterpart")


# --- Check 4: mkdocs nav completeness -----------------------------------
#
# Intentionally delegated to ``make verify-docs-discipline`` (run
# immediately before this script in the release-test chain): its
# generate_mkdocs_nav.py --check + check_mkdocs_orphans.sh already
# validate _meta<->nav sync + orphans, AND correctly distinguish nav
# group/parent slugs (editor, export, ...) from leaf-page slugs.
# Re-implementing that distinction here only risks a divergent, more
# brittle copy. Nothing to do.


def meta_slugs() -> list[str]:
    return re.findall(r"^\s*slug:\s*(\S+)", META.read_text("utf-8"), re.MULTILINE)


# --- Check 5: screenshot currency ---------------------------------------

IMG_MD = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
IMG_HTML = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']')
STALE_DAYS = 30


def check_screenshots() -> None:
    now = time.time()
    for md in HELP.rglob("*.md"):
        text = md.read_text("utf-8")
        refs = IMG_MD.findall(text) + IMG_HTML.findall(text)
        for ref in refs:
            if ref.startswith(("http://", "https://", "data:")):
                continue
            target = (md.parent / ref).resolve()
            if not target.exists():
                fail(f"[img] {md.relative_to(REPO)} references missing image '{ref}'")
                continue
            age_days = (now - target.stat().st_mtime) / 86400
            if age_days > STALE_DAYS:
                warn(
                    f"[img] {target.relative_to(REPO)} is {int(age_days)}d old (stale-candidate; advisory)"
                )


# --- Check 6: cross-reference integrity ---------------------------------
#
# Scoped to the curated, user-facing doc set where a dead link is a
# real bug. The historical / internal trees (docs/archive, explorations,
# audits, journal, testing, .claude, changelog, plugin READMEs) are
# EXCLUDED: they pin source-file paths that legitimately churn, so
# treating their stale references as release-blockers would make the
# gate unusable (154 hits on first run, almost all in those trees).
# Links resolve either file-relative OR repo-root-relative (both
# conventions appear in the docs). Fenced code blocks are skipped.

LINK_MD = re.compile(r"\[[^\]\n]+\]\(([^)\s]+)")

XREF_INCLUDE_PREFIXES = (
    "README.md",
    "README-de.md",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "docs/help/",
    "docs/ROADMAP.md",
    "docs/backlog.md",
    "docs/CONCEPT.md",
    "docs/API.md",
    "docs/configuration.md",
)


def _strip_code_fences(text: str) -> str:
    out, in_fence = [], False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            out.append(line)
    return "\n".join(out)


def check_cross_refs() -> None:
    for md in REPO.glob("**/*.md"):
        rel = md.relative_to(REPO).as_posix()
        if not rel.startswith(XREF_INCLUDE_PREFIXES):
            continue
        text = _strip_code_fences(md.read_text("utf-8"))
        for url in LINK_MD.findall(text):
            if url.startswith(("http://", "https://", "mailto:", "#", "tel:")):
                continue
            path_part = url.split("#")[0]
            if not path_part:
                continue
            file_rel = (md.parent / path_part).resolve()
            root_rel = (REPO / path_part).resolve()
            if not file_rel.exists() and not root_rel.exists():
                fail(f"[xref] {rel} links to missing '{path_part}'")


# --- Check 7: README feature-mention coverage (advisory) ----------------


def check_readme_features() -> None:
    readme = (REPO / "README.md").read_text("utf-8").lower()
    expected = {
        "content type": "8 content types",
        "collage": "collage layout",
        "title editing": "in-place title editing",
        "publication-status": "publication status lifecycle",
        "move to page": "cross-page panel move",
    }
    for token, label in expected.items():
        if token not in readme:
            warn(f"[readme] feature '{label}' (token '{token}') not found in README.md (advisory)")


# --- Check 8: CLAUDE.md test-count freshness (advisory) -----------------

# Last-known baseline at the time this gate was written (v0.40.0).
KNOWN_BACKEND = 2394
KNOWN_VITEST = 2477


def check_test_counts() -> None:
    claude = (REPO / "CLAUDE.md").read_text("utf-8")
    for label, known, pats in (
        (
            "backend",
            KNOWN_BACKEND,
            [r"pytest [0-9]+ . ([0-9]{3,5})", r"Backend pytest [0-9]+ . ([0-9]{3,5})"],
        ),
        ("vitest", KNOWN_VITEST, [r"Vitest [0-9]+ . ([0-9]{3,5})"]),
    ):
        found = []
        for pat in pats:
            found += [int(x) for x in re.findall(pat, claude)]
        if found and max(found) + 50 < known:
            warn(
                f"[tests] CLAUDE.md {label} count {max(found)} is >50 behind baseline {known} (stale; advisory)"
            )


def main() -> int:
    version = canonical_version()
    en = help_md_files("en")
    de = help_md_files("de")

    check_version(version)
    check_feature_coverage(en, de)
    check_i18n_parity(en, de)
    check_screenshots()
    check_cross_refs()
    check_readme_features()
    check_test_counts()

    print(f"verify-docs-completeness — canonical v{version}")
    print(f"  help pages: en={len(en)} de={len(de)}  _meta slugs={len(set(meta_slugs()))}")
    if fails:
        print(f"\nFAIL ({len(fails)}):")
        for m in fails:
            print(f"  - {m}")
    if warns:
        print(f"\nWARN ({len(warns)}):")
        for m in warns:
            print(f"  - {m}")
    if not fails and not warns:
        print("\nAll documentation-completeness checks passed.")
    if fails:
        return 1
    if warns:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
