"""Tests for the Scrivener ``.scriv`` import handler (SCRIVENER-PROJECT-IMPORT-01).

The handler shells out to Pandoc for RTF->Markdown; the unit tests mock
``_rtf_to_markdown`` so the suite needs no crafted RTF fixtures (Pandoc
is available in CI/Docker but minimal valid RTF adds noise). The binder
+ synopsis layout is built as a real directory tree in ``tmp_path`` so
the filesystem-walking helpers are genuinely exercised.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.import_plugins.handlers.scrivener import ScrivenerImportHandler
from app.models import Book, Chapter

_SCRIVX = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject>
  <Binder>
    <BinderItem UUID="D1" Type="DraftFolder">
      <Title>Manuscript</Title>
      <Children>
        <BinderItem UUID="C1" Type="Text">
          <Title>Opening</Title>
        </BinderItem>
        <BinderItem UUID="C2" Type="Text">
          <Title>Rising Action</Title>
        </BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>
"""


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _build_project(root: Path, *, nested: bool = False) -> Path:
    """Create a minimal ``.scriv`` bundle on disk and return the input dir.

    ``nested`` puts the ``.scrivx`` one directory deep (the shape a ZIP
    of a ``project.scriv`` folder extracts to); otherwise the index sits
    at the extraction root (the flat shape).
    """
    base = root / "MyNovel.scriv" if nested else root
    base.mkdir(parents=True, exist_ok=True)
    (base / "MyNovel.scrivx").write_text(_SCRIVX, encoding="utf-8")
    data = base / "Files" / "Data"
    (data / "C1").mkdir(parents=True, exist_ok=True)
    (data / "C2").mkdir(parents=True, exist_ok=True)
    (data / "C1" / "content.rtf").write_text(r"{\rtf1 opening body}", encoding="utf-8")
    (data / "C2" / "content.rtf").write_text(r"{\rtf1 rising body}", encoding="utf-8")
    (data / "C1" / "synopsis.txt").write_text("The hero is introduced.", encoding="utf-8")
    return root


# --- can_handle ---


def test_can_handle_directory_with_scrivx(tmp_path: Path) -> None:
    _build_project(tmp_path)
    assert ScrivenerImportHandler().can_handle(str(tmp_path)) is True


def test_can_handle_nested_scrivx(tmp_path: Path) -> None:
    _build_project(tmp_path, nested=True)
    assert ScrivenerImportHandler().can_handle(str(tmp_path)) is True


def test_can_handle_rejects_plain_directory(tmp_path: Path) -> None:
    (tmp_path / "readme.md").write_text("# hi", encoding="utf-8")
    assert ScrivenerImportHandler().can_handle(str(tmp_path)) is False


def test_can_handle_rejects_file(tmp_path: Path) -> None:
    f = tmp_path / "book.scrivx"
    f.write_text(_SCRIVX, encoding="utf-8")
    assert ScrivenerImportHandler().can_handle(str(f)) is False


# --- detect ---


def test_detect_lists_chapters_with_synopsis_preview(tmp_path: Path) -> None:
    _build_project(tmp_path)
    detected = ScrivenerImportHandler().detect(str(tmp_path))
    assert detected.format_name == "scrivener"
    assert [c.title for c in detected.chapters] == ["Opening", "Rising Action"]
    assert detected.title == "MyNovel"
    assert detected.source_identifier.startswith("sha256:")
    assert detected.chapters[0].content_preview == "The hero is introduced."
    assert detected.chapters[1].content_preview == ""


def test_detect_warns_on_empty_binder(tmp_path: Path) -> None:
    (tmp_path / "Empty.scrivx").write_text(
        "<ScrivenerProject><Binder></Binder></ScrivenerProject>", encoding="utf-8"
    )
    detected = ScrivenerImportHandler().detect(str(tmp_path))
    assert detected.chapters == []
    assert any("binder" in w.lower() for w in detected.warnings)


# --- execute ---


def test_execute_creates_book_chapters_and_synopsis(
    tmp_path: Path, db: Session, monkeypatch
) -> None:
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path / "data"))
    _build_project(tmp_path / "project")

    def _fake_rtf(rtf_path: Path) -> str:
        return f"Converted body of {rtf_path.parent.name}."

    monkeypatch.setattr(
        "app.import_plugins.handlers.scrivener._rtf_to_markdown", _fake_rtf
    )
    handler = ScrivenerImportHandler()
    detected = handler.detect(str(tmp_path / "project"))
    book_id = handler.execute(str(tmp_path / "project"), detected, overrides={})

    chapters = (
        db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.position).all()
    )
    assert [c.title for c in chapters] == ["Opening", "Rising Action"]
    assert chapters[0].synopsis == "The hero is introduced."
    assert chapters[1].synopsis is None
    assert "Converted body of C1" in chapters[0].content


def test_execute_applies_overrides(tmp_path: Path, db: Session, monkeypatch) -> None:
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path / "data"))
    _build_project(tmp_path / "project")
    monkeypatch.setattr(
        "app.import_plugins.handlers.scrivener._rtf_to_markdown",
        lambda rtf_path: "Body.",
    )
    handler = ScrivenerImportHandler()
    detected = handler.detect(str(tmp_path / "project"))
    book_id = handler.execute(
        str(tmp_path / "project"),
        detected,
        overrides={"title": "Renamed", "author": "Jane Doe", "language": "en"},
    )
    book = db.query(Book).filter(Book.id == book_id).one()
    assert book.title == "Renamed"
    assert book.author == "Jane Doe"
    assert book.language == "en"


def test_execute_overwrite_replaces_existing(tmp_path: Path, db: Session, monkeypatch) -> None:
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path / "data"))
    _build_project(tmp_path / "project")
    monkeypatch.setattr(
        "app.import_plugins.handlers.scrivener._rtf_to_markdown",
        lambda rtf_path: "Body.",
    )
    handler = ScrivenerImportHandler()
    detected = handler.detect(str(tmp_path / "project"))
    first_id = handler.execute(str(tmp_path / "project"), detected, overrides={})
    assert db.query(Chapter).filter(Chapter.book_id == first_id).count() == 2

    second_id = handler.execute(
        str(tmp_path / "project"),
        detected,
        overrides={},
        duplicate_action="overwrite",
        existing_book_id=first_id,
    )
    db.expire_all()
    assert db.query(Chapter).filter(Chapter.book_id == first_id).count() == 0
    assert db.query(Chapter).filter(Chapter.book_id == second_id).count() == 2


def test_execute_cancel_raises(tmp_path: Path, monkeypatch) -> None:
    _build_project(tmp_path / "project")
    handler = ScrivenerImportHandler()
    detected = handler.detect(str(tmp_path / "project"))
    with pytest.raises(Exception):
        handler.execute(
            str(tmp_path / "project"),
            detected,
            overrides={},
            duplicate_action="cancel",
        )


def test_handler_registered_before_markdown_folder() -> None:
    """A .scriv directory must dispatch to scrivener, not markdown-folder."""
    import app.import_plugins.handlers  # noqa: F401  (triggers registration)
    from app.import_plugins.registry import list_plugins

    names = [p.format_name for p in list_plugins()]
    assert "scrivener" in names
    assert names.index("scrivener") < names.index("markdown-folder")
