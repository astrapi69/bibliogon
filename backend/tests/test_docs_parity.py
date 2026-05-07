"""Bilingual parity for docs/help/en/ and docs/help/de/.

Every English help page must have a German counterpart at the
same path, and vice versa. Catches the asymmetry-drift failure
mode where a new feature ships docs in only one language and the
other language silently lags.

Sub-task 5 of MKDOCS-DISCIPLINE-01. The hand-maintained-twice
drift between mkdocs.yml and _meta.yaml (closed in commits 1-3
of that series) was one shape of docs drift; bilingual asymmetry
is another. Pre-inspection on 2026-05-07 found zero asymmetries
in the v0.30.0 state — the test passes out of the gate. Future
asymmetries that are intentional (e.g. landing pages) get added
to the EXCEPTIONS_ constants below with a comment.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DOCS_HELP_EN = REPO_ROOT / "docs" / "help" / "en"
DOCS_HELP_DE = REPO_ROOT / "docs" / "help" / "de"

# Files allowed to differ between en/ and de/. The convention:
# every entry needs a comment explaining why the file is allowed
# to be language-asymmetric.
EXCEPTIONS_INDEX_BASENAMES = {
    # Landing pages: per the pre-inspection Q2, the index.md
    # contract differs from the help-page contract. mkdocs.yml
    # hand-manages the Home entry; the in-app help panel does
    # not require a strict en/de symmetry on landing pages.
    "index.md",
}

# Per-language additions only when one side ships a page that
# the other side legitimately does not need. Empty today; populate
# only after explicit decision that the asymmetry is intentional.
EXCEPTIONS_EN_ONLY: set[str] = set()
EXCEPTIONS_DE_ONLY: set[str] = set()


def _collect(root: Path) -> set[str]:
    """Return the set of relative paths under root, excluding
    landing-page basenames."""
    return {
        str(f.relative_to(root))
        for f in root.rglob("*.md")
        if f.name not in EXCEPTIONS_INDEX_BASENAMES
    }


def test_every_en_page_has_a_de_counterpart() -> None:
    """Every English help page must have a German counterpart at
    the same relative path. Fails when an EN page lacks DE."""
    en_files = _collect(DOCS_HELP_EN)
    de_files = _collect(DOCS_HELP_DE)
    en_only = en_files - de_files - EXCEPTIONS_EN_ONLY
    assert not en_only, (
        f"English-only help pages (no DE counterpart): {sorted(en_only)}. "
        f"Add the German page at docs/help/de/<same-path>, or, if the "
        f"asymmetry is intentional, add the slug to EXCEPTIONS_EN_ONLY "
        f"with a comment explaining why."
    )


def test_every_de_page_has_an_en_counterpart() -> None:
    """Every German help page must have an English counterpart at
    the same relative path. Fails when a DE page lacks EN."""
    en_files = _collect(DOCS_HELP_EN)
    de_files = _collect(DOCS_HELP_DE)
    de_only = de_files - en_files - EXCEPTIONS_DE_ONLY
    assert not de_only, (
        f"German-only help pages (no EN counterpart): {sorted(de_only)}. "
        f"Add the English page at docs/help/en/<same-path>, or, if the "
        f"asymmetry is intentional, add the slug to EXCEPTIONS_DE_ONLY "
        f"with a comment explaining why."
    )


def test_help_help_directories_exist() -> None:
    """Sanity guard: both language directories must exist before
    the parity tests above run. Catches the case where a refactor
    moves docs/help/ but leaves this test pointing at the old path."""
    assert DOCS_HELP_EN.is_dir(), f"missing: {DOCS_HELP_EN}"
    assert DOCS_HELP_DE.is_dir(), f"missing: {DOCS_HELP_DE}"
