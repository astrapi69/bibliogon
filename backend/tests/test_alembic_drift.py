"""MAINT-01: regression test that pins every ``Book.Mapped`` column
to either the initial schema migration or a subsequent
``op.add_column`` migration.

Background. v0.22.0 shipped with ``Book.tts_speed`` declared as a
SQLAlchemy mapped column but no Alembic migration. Fresh installs
got the column via ``Base.metadata.create_all`` and worked; long-
lived dev DBs that follow the alembic-upgrade path were left
without it. The first DB query that touched ``books`` (the
trash-cleanup SELECT during lifespan, ``/api/import/detect``'s
``_check_duplicate``, ...) crashed with
``no such column: books.tts_speed`` and a 500 cascade. v0.22.1
backfilled the migration in ``c6d7e8f9a0b1_add_tts_speed_to_books.py``.

This test scans the migrations directory and the Book model to
catch any new ``Mapped`` column that lands without a paired
migration BEFORE the next release ships. Failure mode is a clear
"column X is in the model but no migration adds it; add an Alembic
revision under backend/migrations/versions/" message - much
friendlier than the runtime crash users hit.

Scope: only ``Book`` for now (the table that has historically
collected drift). Other tables can join the audit if drift surfaces
elsewhere.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_MODEL_PATH = _BACKEND_ROOT / "app" / "models" / "__init__.py"
_MIGRATIONS_DIR = _BACKEND_ROOT / "migrations" / "versions"


def _book_mapped_columns() -> list[str]:
    """Return every ``Mapped[...]`` column declared on Book.

    Skips relationships (``= relationship(...)``) so only true
    columns are checked against migrations.
    """
    text = _MODEL_PATH.read_text()
    cols: list[str] = []
    in_book = False
    for line in text.splitlines():
        if line.startswith("class Book(Base):"):
            in_book = True
            continue
        if in_book and line.startswith("class ") and "Book" not in line:
            break
        if not in_book:
            continue
        m = re.match(r"\s+(\w+):\s+Mapped\[", line)
        if not m:
            continue
        if "= relationship(" in line:
            continue
        cols.append(m.group(1))
    return cols


def _initial_schema_book_columns() -> set[str]:
    """Columns declared in the ``books`` ``create_table`` of the
    initial migration. Treated as covered by definition."""
    init = _MIGRATIONS_DIR / "fd1e9e5b4d91_initial_schema.py"
    text = init.read_text()
    m = re.search(
        r"create_table\(\s*['\"]books['\"](.*?)\)\s*\n\s*op\.",
        text,
        re.DOTALL,
    )
    if not m:
        return set()
    block = m.group(1)
    return {cm.group(1) for cm in re.finditer(r"sa\.Column\(\s*['\"](\w+)['\"]", block)}


def _migration_added_book_columns() -> dict[str, str]:
    """Columns added to the ``books`` table via subsequent
    ``op.add_column`` (or ``batch_op.add_column``) migrations.

    Maps column -> migration filename for diagnostic clarity.
    """
    out: dict[str, str] = {}
    add_re = re.compile(
        r"add_column\(\s*sa\.Column\(\s*['\"](\w+)['\"]",
        re.DOTALL,
    )
    for f in sorted(_MIGRATIONS_DIR.glob("*.py")):
        if f.name == "fd1e9e5b4d91_initial_schema.py":
            continue
        text = f.read_text()
        # Only consider migrations scoped to the books table.
        if not (
            "batch_alter_table('books'" in text
            or 'batch_alter_table("books"' in text
            or "op.add_column('books'" in text
        ):
            continue
        for m in add_re.finditer(text):
            # Last writer wins is fine; this is a coverage check.
            out[m.group(1)] = f.name
    return out


def test_every_book_mapped_column_has_a_migration() -> None:
    """Every ``Book.Mapped`` column must be either in the initial
    schema or in a later ``op.add_column`` migration on the
    ``books`` table. Any model column without coverage is
    SemVer-significant: long-lived dev DBs would crash on first
    query touching that column."""
    model_cols = _book_mapped_columns()
    covered = _initial_schema_book_columns() | set(
        _migration_added_book_columns().keys()
    )
    missing = sorted(set(model_cols) - covered)
    assert missing == [], (
        "Book model columns without an Alembic migration "
        "(add an op.add_column under backend/migrations/versions/): "
        f"{missing}"
    )


def test_book_audit_picks_up_at_least_one_known_added_column() -> None:
    """Sanity check: the migration scan really sees at least the
    historical add_column migrations. If this drops to zero the
    parser broke, not the schema."""
    added = _migration_added_book_columns()
    assert "tts_speed" in added, (
        "Expected to find tts_speed in c6d7e8f9a0b1; "
        f"actual added columns: {sorted(added.keys())}"
    )
    assert "translation_group_id" in added


@pytest.mark.parametrize(
    "column",
    [
        # Spot-check the columns that historically lacked migrations or
        # are recent additions; the global audit covers everything,
        # this list documents intent.
        "tts_speed",
        "tts_engine",
        "tts_voice",
        "tts_language",
        "translation_group_id",
        "audiobook_overwrite_existing",
        "audiobook_skip_chapter_types",
        "ms_tools_max_sentence_length",
    ],
)
def test_known_post_initial_columns_have_migrations(column: str) -> None:
    added = _migration_added_book_columns()
    assert column in added, (
        f"Column {column!r} is missing its add_column migration. "
        "Recent migrations: " + ", ".join(sorted(added.keys()))
    )
