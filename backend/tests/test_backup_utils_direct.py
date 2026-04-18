"""Direct unit tests for `app.services.backup.{archive,asset,markdown}_utils`.

These modules were flagged in the polish audit as lacking direct unit
tests; they are exercised indirectly by the integration tests in
`test_import_export.py` but a failure there only says "import broke",
not which helper regressed. These tests pin the pure helpers so a
regression surfaces at the right level.
"""

from pathlib import Path

from app.database import SessionLocal
from app.models import Asset, Book, Chapter
from app.services.backup.archive_utils import (
    find_books_dir,
    find_manifest,
    find_project_root,
)
from app.services.backup.asset_utils import (
    _classify_asset_type,
    import_assets,
    rewrite_image_paths,
)
from app.services.backup.markdown_utils import (
    detect_chapter_type,
    extract_title,
    md_to_html,
    read_file_if_exists,
)

# --- archive_utils: find_manifest -------------------------------------------


def test_find_manifest_at_root(tmp_path):
    (tmp_path / "manifest.json").write_text("{}", encoding="utf-8")
    assert find_manifest(tmp_path) == tmp_path / "manifest.json"


def test_find_manifest_one_level_deep(tmp_path):
    inner = tmp_path / "wrapper"
    inner.mkdir()
    (inner / "manifest.json").write_text("{}", encoding="utf-8")
    assert find_manifest(tmp_path) == inner / "manifest.json"


def test_find_manifest_none(tmp_path):
    (tmp_path / "note.txt").write_text("hi", encoding="utf-8")
    assert find_manifest(tmp_path) is None


# --- archive_utils: find_books_dir ------------------------------------------


def test_find_books_dir_at_root(tmp_path):
    (tmp_path / "books").mkdir()
    assert find_books_dir(tmp_path) == tmp_path / "books"


def test_find_books_dir_one_level_deep(tmp_path):
    wrap = tmp_path / "wrap"
    (wrap / "books").mkdir(parents=True)
    assert find_books_dir(tmp_path) == wrap / "books"


def test_find_books_dir_none(tmp_path):
    assert find_books_dir(tmp_path) is None


# --- archive_utils: find_project_root ---------------------------------------


def test_find_project_root_via_manuscript_dir(tmp_path):
    (tmp_path / "manuscript").mkdir()
    assert find_project_root(tmp_path) == tmp_path


def test_find_project_root_via_config_metadata(tmp_path):
    cfg = tmp_path / "config"
    cfg.mkdir()
    (cfg / "metadata.yaml").write_text("title: x\n", encoding="utf-8")
    assert find_project_root(tmp_path) == tmp_path


def test_find_project_root_nested(tmp_path):
    inner = tmp_path / "project"
    (inner / "manuscript").mkdir(parents=True)
    assert find_project_root(tmp_path) == inner


def test_find_project_root_none(tmp_path):
    (tmp_path / "random.txt").write_text("x", encoding="utf-8")
    assert find_project_root(tmp_path) is None


# --- asset_utils: _classify_asset_type --------------------------------------


def test_classify_asset_type_covers():
    assert _classify_asset_type(Path("covers/front.jpg")) == "cover"


def test_classify_asset_type_figures():
    assert _classify_asset_type(Path("figures/img.png")) == "figure"


def test_classify_asset_type_diagrams():
    assert _classify_asset_type(Path("diagrams/d.svg")) == "diagram"


def test_classify_asset_type_unknown_folder_defaults_to_figure():
    assert _classify_asset_type(Path("random/x.png")) == "figure"


def test_classify_asset_type_subfolder_override():
    # figures/diagrams/foo.png -> diagram wins over the default figure
    assert _classify_asset_type(Path("figures/diagrams/foo.png")) == "diagram"


def test_classify_asset_type_empty_path():
    assert _classify_asset_type(Path("")) == "figure"


# --- asset_utils: import_assets + rewrite_image_paths -----------------------


def _make_book(db, book_id="book-assets-1"):
    book = Book(id=book_id, title="Assets Test", author="T", language="en")
    db.add(book)
    db.commit()
    return book


def test_import_assets_copies_images_and_records_db_rows(tmp_path, monkeypatch):
    db = SessionLocal()
    try:
        book = _make_book(db)
        assets_dir = tmp_path / "assets"
        (assets_dir / "figures").mkdir(parents=True)
        (assets_dir / "figures" / "one.png").write_bytes(b"\x89PNG")
        (assets_dir / "covers").mkdir()
        (assets_dir / "covers" / "cover.jpg").write_bytes(b"\xff\xd8")
        (assets_dir / "readme.txt").write_text("skip me", encoding="utf-8")

        upload_root = tmp_path / "uploads"
        monkeypatch.setattr(
            "app.routers.assets.UPLOAD_DIR", upload_root
        )

        count = import_assets(db, book.id, assets_dir)
        db.commit()

        assert count == 2  # txt skipped
        assets = db.query(Asset).filter(Asset.book_id == book.id).all()
        filenames = {a.filename for a in assets}
        assert filenames == {"one.png", "cover.jpg"}
        assert (upload_root / book.id / "figure" / "one.png").exists()
        assert (upload_root / book.id / "cover" / "cover.jpg").exists()
    finally:
        db.query(Asset).filter(Asset.book_id == "book-assets-1").delete()
        db.query(Book).filter(Book.id == "book-assets-1").delete()
        db.commit()
        db.close()


def test_rewrite_image_paths_rewrites_known_filenames():
    db = SessionLocal()
    try:
        book = _make_book(db, book_id="book-rewrite-1")
        db.add(
            Asset(
                book_id=book.id,
                filename="cover.jpg",
                asset_type="cover",
                path="/tmp/cover.jpg",
            )
        )
        chapter = Chapter(
            book_id=book.id,
            title="Ch1",
            content='<p>hi</p><img src="assets/covers/cover.jpg"/>'
                    '<img src="external/unknown.png"/>',
            position=0,
            chapter_type="chapter",
        )
        db.add(chapter)
        db.commit()

        rewrite_image_paths(db, book.id)
        db.commit()

        updated = db.query(Chapter).filter(Chapter.book_id == book.id).first()
        assert f'src="/api/books/{book.id}/assets/file/cover.jpg"' in updated.content
        # Unknown filename stays untouched
        assert 'src="external/unknown.png"' in updated.content
    finally:
        db.query(Chapter).filter(Chapter.book_id == "book-rewrite-1").delete()
        db.query(Asset).filter(Asset.book_id == "book-rewrite-1").delete()
        db.query(Book).filter(Book.id == "book-rewrite-1").delete()
        db.commit()
        db.close()


def test_rewrite_image_paths_skips_chapters_without_img():
    db = SessionLocal()
    try:
        book = _make_book(db, book_id="book-rewrite-2")
        chapter = Chapter(
            book_id=book.id,
            title="Ch",
            content="<p>plain text, no image</p>",
            position=0,
            chapter_type="chapter",
        )
        db.add(chapter)
        db.commit()

        original = chapter.content
        rewrite_image_paths(db, book.id)
        db.commit()

        updated = db.query(Chapter).filter(Chapter.book_id == book.id).first()
        assert updated.content == original
    finally:
        db.query(Chapter).filter(Chapter.book_id == "book-rewrite-2").delete()
        db.query(Book).filter(Book.id == "book-rewrite-2").delete()
        db.commit()
        db.close()


# --- markdown_utils: detect_chapter_type ------------------------------------


def test_detect_chapter_type_plain():
    from app.models import ChapterType

    assert detect_chapter_type("01-chapter") == ChapterType.CHAPTER


def test_detect_chapter_type_part_intro():
    from app.models import ChapterType

    assert detect_chapter_type("01-0-part-1-intro") == ChapterType.PART_INTRO


def test_detect_chapter_type_interlude():
    from app.models import ChapterType

    assert detect_chapter_type("05-1-interludium") == ChapterType.INTERLUDE
    assert detect_chapter_type("05-1-interlude") == ChapterType.INTERLUDE


# --- markdown_utils: extract_title ------------------------------------------


def test_extract_title_from_h1():
    md = "# My Title\n\nbody\n"
    assert extract_title(md, "fallback") == "My Title"


def test_extract_title_h2_ignored():
    md = "## Subtitle\n\nbody\n"
    assert extract_title(md, "my-fallback-name") == "My Fallback Name"


def test_extract_title_fallback_strips_numeric_prefix():
    assert extract_title("", "01-2-my-file") == "My File"


def test_extract_title_fallback_empty_uses_stem():
    # Pure numeric prefix strips to an empty string; helper falls back to the
    # raw stem, replaces hyphens with spaces, strips and title-cases.
    assert extract_title("", "01-") == "01"


# --- markdown_utils: read_file_if_exists ------------------------------------


def test_read_file_if_exists_present(tmp_path):
    f = tmp_path / "note.txt"
    f.write_text(" hello \n", encoding="utf-8")
    assert read_file_if_exists(f) == "hello"


def test_read_file_if_exists_absent(tmp_path):
    assert read_file_if_exists(tmp_path / "missing.txt") is None


def test_read_file_if_exists_empty_file(tmp_path):
    f = tmp_path / "empty.txt"
    f.write_text("   \n\n", encoding="utf-8")
    assert read_file_if_exists(f) is None


# --- markdown_utils: md_to_html ---------------------------------------------


def test_md_to_html_basic():
    html = md_to_html("# Title\n\nParagraph.")
    assert "<h1>Title</h1>" in html
    assert "<p>Paragraph.</p>" in html


def test_md_to_html_empty_string():
    assert md_to_html("") == ""
    assert md_to_html("   ") == ""


def test_md_to_html_strips_pandoc_anchor_markers():
    html = md_to_html("# Title {#my-anchor}\n")
    assert "{#my-anchor}" not in html
    assert "<h1>Title</h1>" in html


def test_md_to_html_figure_without_figcaption_is_unwrapped():
    # A lone <figure><img/></figure> would double-render under the figure
    # extension; the helper strips the wrapper.
    source = "<figure><img src='x.png'/></figure>"
    html = md_to_html(source)
    assert "<figure>" not in html
    assert "<img" in html


def test_md_to_html_nested_list_2space_indent():
    # write-book-template uses 2-space indent; helper doubles it so the
    # markdown library recognises the nested list.
    md = "- Outer\n  - Inner"
    html = md_to_html(md)
    # Nested <ul> indicates the doubling worked
    assert html.count("<ul>") >= 2
