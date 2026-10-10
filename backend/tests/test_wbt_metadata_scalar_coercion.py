"""YAML scalars in metadata.yaml reach typed fields as strings (#1091).

An unquoted ISO date in a `metadata.yaml` parses to a
``datetime.date``, and every string-ish field of ``DetectedProject`` is
declared ``str | None``, so the detect endpoint answered HTTP 500 for a
project whose metadata carried a publication date - the shape Pandoc
metadata and write-book-template both use.

Driven at the handler layer rather than through TestClient, for the
reason ``test_wbt_metadata_propagation`` states: the orchestrator
integration modules accumulate lifespan state, and both halves of this
bug (the Pydantic model and the ``Book`` column) live below routing.
"""

from __future__ import annotations

import datetime
import io
import zipfile
from pathlib import Path

import pytest

from app.database import Base, SessionLocal, engine
from app.import_plugins.handlers.wbt import WbtImportHandler
from app.models import Book


@pytest.fixture(autouse=True)
def _fresh_schema() -> None:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _zip_with_metadata(tmp_dir: Path, metadata: str, name: str = "p.zip") -> Path:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("book/config/metadata.yaml", metadata)
        zf.writestr("book/manuscript/chapters/01-one.md", "# One\n\nText.\n")
    path = tmp_dir / name
    path.write_bytes(buf.getvalue())
    return path


def _detect(path: Path):
    return WbtImportHandler().detect(str(path))


def _import(path: Path) -> Book:
    handler = WbtImportHandler()
    book_id = handler.execute(str(path), handler.detect(str(path)), overrides={})
    session = SessionLocal()
    try:
        return session.query(Book).filter(Book.id == book_id).one()
    finally:
        session.close()


class TestUnquotedDate:
    """`date: 2026-03-01` is the natural YAML spelling and the one
    Pandoc metadata uses. It parsed to a ``datetime.date`` and the
    detect response could not be built from it."""

    def test_yaml_parses_an_unquoted_date_to_a_date_object(self) -> None:
        # The premise, asserted rather than assumed: if PyYAML ever
        # stopped doing this, the cases below would pass for the wrong
        # reason and the coercion would look unnecessary.
        import yaml

        parsed = yaml.safe_load("date: 2026-03-01\n")
        assert isinstance(parsed["date"], datetime.date)

    def test_detect_carries_the_date_as_its_iso_string(self, tmp_path: Path) -> None:
        path = _zip_with_metadata(tmp_path, "title: T\nauthor: A\ndate: 2026-03-01\n")
        assert _detect(path).publish_date == "2026-03-01"

    def test_the_imported_book_carries_the_date_as_a_string(self, tmp_path: Path) -> None:
        path = _zip_with_metadata(tmp_path, "title: T\nauthor: A\ndate: 2026-03-01\n")
        assert _import(path).publish_date == "2026-03-01"

    def test_a_quoted_date_is_unchanged(self, tmp_path: Path) -> None:
        """Non-regression: the shape that already worked still does."""
        path = _zip_with_metadata(tmp_path, 'title: T\nauthor: A\ndate: "March 2026"\n')
        assert _detect(path).publish_date == "March 2026"

    def test_an_empty_date_stays_null(self, tmp_path: Path) -> None:
        """Not the string "None" - the #1086 shape in a second file."""
        path = _zip_with_metadata(tmp_path, "title: T\nauthor: A\ndate:\n")
        assert _detect(path).publish_date is None
        assert _import(path).publish_date is None

    def test_a_whitespace_only_date_stays_null(self, tmp_path: Path) -> None:
        path = _zip_with_metadata(tmp_path, 'title: T\nauthor: A\ndate: "   "\n')
        assert _detect(path).publish_date is None


class TestOtherNumericScalars:
    """The same defect, same cause, different key. YAML turns an
    unquoted number into an int and every one of these fields is
    declared ``str | None``."""

    def test_a_numeric_edition_becomes_its_digits(self, tmp_path: Path) -> None:
        path = _zip_with_metadata(tmp_path, "title: T\nauthor: A\nedition: 2\n")
        assert _detect(path).edition == "2"

    def test_a_numeric_publisher_becomes_its_digits(self, tmp_path: Path) -> None:
        path = _zip_with_metadata(tmp_path, "title: T\nauthor: A\npublisher: 42\n")
        assert _detect(path).publisher == "42"

    def test_a_numeric_isbn_becomes_its_digits(self, tmp_path: Path) -> None:
        path = _zip_with_metadata(tmp_path, "title: T\nauthor: A\nisbn:\n  ebook: 9783000000010\n")
        assert _detect(path).isbn_ebook == "9783000000010"

    def test_a_numeric_identifiers_isbn_becomes_its_digits(self, tmp_path: Path) -> None:
        path = _zip_with_metadata(
            tmp_path, "title: T\nauthor: A\nidentifiers:\n  isbn_paperback: 9783000000027\n"
        )
        assert _detect(path).isbn_paperback == "9783000000027"

    def test_a_numeric_asin_becomes_its_digits(self, tmp_path: Path) -> None:
        path = _zip_with_metadata(tmp_path, "title: T\nauthor: A\nasin:\n  ebook: 12345\n")
        assert _detect(path).asin_ebook == "12345"

    def test_a_numeric_title_and_subtitle_become_their_digits(self, tmp_path: Path) -> None:
        path = _zip_with_metadata(tmp_path, "title: 2026\nsubtitle: 1\nauthor: A\n")
        detected = _detect(path)
        assert (detected.title, detected.subtitle) == ("2026", "1")

    def test_a_series_volume_that_is_not_a_number_does_not_crash(self, tmp_path: Path) -> None:
        """``series_index`` is declared ``int | None``, so a volume
        written as a word has to end up None rather than breaking the
        response the way the date did."""
        path = _zip_with_metadata(
            tmp_path, "title: T\nauthor: A\nseries:\n  title: R\n  volume: zwei\n"
        )
        detected = _detect(path)
        assert detected.series == "R"
        assert detected.series_index is None


class TestContainerValuesAreNotScalars:
    """A list or a mapping where a scalar belongs (#1103).

    ``_scalar`` used ``str(value)`` for anything that was not None and
    not a date, so a container reached the field as its Python repr -
    a book whose title is the literal ``['A', 'B']``, visible on the
    dashboard, in the editor header and in every export. Same family as
    the ``"None"`` string #1086 closed and the 500 #1091 closed: an
    untyped YAML value reaching a field declared ``str | None``.
    """

    def test_a_list_title_does_not_become_its_repr(self, tmp_path: Path) -> None:
        # detect resolves the title fallback itself, so the assertion is
        # "the project's name, not the YAML literal" rather than None.
        path = _zip_with_metadata(
            tmp_path, "title:\n  - Erster Teil\n  - Zweiter Teil\nauthor: A\n"
        )
        assert _detect(path).title == "book"

    def test_a_mapping_publisher_does_not_become_its_repr(self, tmp_path: Path) -> None:
        path = _zip_with_metadata(
            tmp_path, "title: T\nauthor: A\npublisher:\n  name: Eigenverlag\n  city: Zuerich\n"
        )
        assert _detect(path).publisher is None

    def test_a_list_keyword_field_survives(self, tmp_path: Path) -> None:
        """Boundary: ``keywords`` is read by its own parser, which WANTS
        a list, so the container rule must not reach it. DetectedProject
        carries the list; the Book column carries it JSON-encoded."""
        path = _zip_with_metadata(tmp_path, "title: T\nauthor: A\nkeywords:\n  - eins\n  - zwei\n")
        assert _detect(path).keywords == ["eins", "zwei"]
        assert _import(path).keywords == '["eins", "zwei"]'

    def test_the_nested_readers_still_reach_their_leaves(self, tmp_path: Path) -> None:
        """Boundary: ``series``, ``isbn``, ``asin`` and ``identifiers``
        are mappings on purpose. They index into the container and call
        ``_scalar`` on the leaf, so the rule must not blank them."""
        path = _zip_with_metadata(
            tmp_path,
            "title: T\nauthor: A\n"
            "series:\n  title: Reihe\n  volume: 3\n"
            "isbn:\n  ebook: 978-3-000000-01-0\n"
            "asin:\n  paperback: B0TEST0002\n"
            "identifiers:\n  isbn_hardcover: 978-3-000000-03-4\n",
        )
        detected = _detect(path)
        assert detected.series == "Reihe"
        assert detected.series_index == 3
        assert detected.isbn_ebook == "978-3-000000-01-0"
        assert detected.asin_paperback == "B0TEST0002"
        assert detected.isbn_hardcover == "978-3-000000-03-4"

    def test_a_list_title_falls_back_to_the_project_name_on_import(self, tmp_path: Path) -> None:
        """The import path, not just detect: a blanked title falls back
        to the project directory's name, which is what the user sees."""
        path = _zip_with_metadata(
            tmp_path, "title:\n  - Erster Teil\nauthor: A\n", name="mein-buch.zip"
        )
        book = _import(path)
        assert book.title == "book"
        assert "[" not in book.title
