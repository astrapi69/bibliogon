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
        path = _zip_with_metadata(
            tmp_path, "title: T\nauthor: A\nisbn:\n  ebook: 9783000000010\n"
        )
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
