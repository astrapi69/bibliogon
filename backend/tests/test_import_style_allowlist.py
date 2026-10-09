"""#988: imported style attributes are filtered down to the editor's own set.

The editor writes a small, known set of CSS declarations - alignment,
text and highlight colour, table column widths. Everything else in a
``style`` attribute arrived from an importer, and imported HTML stays
HTML in ``Chapter.content`` until someone opens and saves the chapter in
the editor (#787), so nothing filters it in between.

The filter sits on the import path rather than the render path, so the
stored document is the clean one. ``md_to_html`` is where six of the
seven HTML-storing importers converge (markdown, markdown-folder,
scrivener, office, git-sync, write-book-template/project); the seventh
is the ``.html``/``.htm`` branch of the single-file markdown handler,
which stores the markup as-is. Both are covered here: the end-to-end
cases drive the paths a user can reach through the API, and the
``md_to_html`` unit case pins the convergence point for the importers
whose fixtures need external tooling (Pandoc for office, a Scrivener
bundle, a git remote).
"""

from fastapi.testclient import TestClient

from app.main import app
from app.services.backup.markdown_utils import (
    ALLOWED_STYLE_PROPERTIES,
    filter_import_styles,
    md_to_html,
)


def _cleanup(client: TestClient, book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


# --- The allowlist itself ---


def test_allowlist_is_the_editor_set():
    """The set is derived from the extensions the editor mounts, not guessed."""
    assert ALLOWED_STYLE_PROPERTIES == frozenset(
        {"text-align", "color", "background-color", "width", "min-width"}
    )


# --- filter_import_styles ---


def test_keeps_an_allowlisted_declaration():
    html = '<p style="text-align: center">Hallo</p>'
    assert filter_import_styles(html) == '<p style="text-align: center">Hallo</p>'


def test_drops_position_fixed():
    assert filter_import_styles('<p style="position: fixed">X</p>') == "<p>X</p>"


def test_drops_a_third_party_background_image():
    html = '<p style="background-image: url(https://evil.example/pixel.png)">X</p>'
    assert filter_import_styles(html) == "<p>X</p>"


def test_keeps_only_the_allowlisted_half_of_a_mixed_attribute():
    html = '<p style="position: fixed; text-align: right; z-index: 99">X</p>'
    assert filter_import_styles(html) == '<p style="text-align: right">X</p>'


def test_removes_the_attribute_rather_than_leaving_it_empty():
    """An attribute with nothing left is gone, not ``style=""``."""
    assert 'style=""' not in filter_import_styles('<td style="float: left">X</td>')


def test_handles_single_quotes():
    html = "<p style='position: absolute; color: #333'>X</p>"
    assert filter_import_styles(html) == "<p style='color: #333'>X</p>"


def test_filters_a_double_quoted_value_that_contains_an_apostrophe():
    """A font-family stack must not carry the rest of the attribute past the filter."""
    html = "<p style=\"font-family: 'Arial', sans-serif; position: fixed\">X</p>"
    assert filter_import_styles(html) == "<p>X</p>"


def test_filters_an_unquoted_value():
    """HTML allows ``style=color:red``; it reaches the store as written."""
    html = "<p style=position:fixed>X</p>"
    assert filter_import_styles(html) == "<p>X</p>"
    assert filter_import_styles("<p style=color:red>X</p>") == '<p style="color: red">X</p>'


def test_normalizes_the_property_name():
    html = '<p style="TEXT-ALIGN:  center ">X</p>'
    assert filter_import_styles(html) == '<p style="text-align: center">X</p>'


def test_drops_a_fragment_without_a_colon():
    html = '<p style="text-align: left; garbage">X</p>'
    assert filter_import_styles(html) == '<p style="text-align: left">X</p>'


def test_keeps_the_table_column_widths_the_editor_writes():
    html = '<td colspan="2" style="width: 120px; min-width: 25px">X</td>'
    assert filter_import_styles(html) == html


def test_leaves_an_attribute_that_merely_mentions_style_alone():
    html = '<p class="style-guide" data-style="loud">X</p>'
    assert filter_import_styles(html) == html


def test_passes_through_markup_without_a_style_attribute():
    html = "<h1>Titel</h1>\n<p>Absatz</p>"
    assert filter_import_styles(html) == html
    assert filter_import_styles("") == ""


# --- The convergence point ---


def test_md_to_html_filters_raw_html_styles():
    """Pins the path scrivener, office, git-sync and project imports take."""
    with TestClient(app):
        html = md_to_html('Text.\n\n<p style="position: fixed; text-align: center">X</p>\n')
    assert "position" not in html
    assert "text-align: center" in html


# --- The paths a user reaches through the API ---
#
# Each case stubs ``sanitize_import_markdown`` to the identity on the
# handler module that calls it. That is not a convenience: ms-tools'
# sanitizer removes EVERY style attribute as part of its Word-cruft
# cleanup, so with the plugin active the declaration is gone before
# ``md_to_html`` ever sees it and these tests would pass without the
# filter. The stub is the shipped configuration a user can reach -
# ms-tools disabled, or ``auto_sanitize_on_import: false`` - and it is
# the configuration the finding is about: a security property of the
# core import path must not depend on an optional plugin being on.


def _no_sanitize(monkeypatch, module_path: str) -> None:
    monkeypatch.setattr(
        f"{module_path}.sanitize_import_markdown",
        lambda content, language: content,
    )


def test_single_markdown_import_stores_no_foreign_declaration(monkeypatch):
    from tests.import_helpers import import_single_markdown

    _no_sanitize(monkeypatch, "app.import_plugins.handlers.markdown")
    source = (
        "# Kapitel\n\n"
        '<p style="position: fixed; text-align: center">Verschoben</p>\n\n'
        '<p style="background-image: url(https://evil.example/p.png)">Geladen</p>\n'
    )
    with TestClient(app) as client:
        book_id = import_single_markdown(client, source, filename="chapter.md")["book_id"]
        try:
            content = client.get(f"/api/books/{book_id}/chapters").json()[0]["content"]
            assert "position" not in content
            assert "background-image" not in content
            assert "text-align: center" in content
            assert "Verschoben" in content and "Geladen" in content
        finally:
            _cleanup(client, book_id)


def test_html_file_import_stores_no_foreign_declaration(monkeypatch):
    """The ``.html`` branch stores the markup as-is and bypasses md_to_html."""
    from tests.import_helpers import import_single_markdown

    _no_sanitize(monkeypatch, "app.import_plugins.handlers.markdown")
    source = '<h1>Kapitel</h1>\n<p style="position: fixed; color: #222">Verschoben</p>\n'
    with TestClient(app) as client:
        book_id = import_single_markdown(client, source, filename="chapter.html")["book_id"]
        try:
            content = client.get(f"/api/books/{book_id}/chapters").json()[0]["content"]
            assert "position" not in content
            assert "color: #222" in content
            assert "Verschoben" in content
        finally:
            _cleanup(client, book_id)


def test_markdown_folder_import_filters_every_chapter(monkeypatch):
    from tests.import_helpers import import_markdown_folder

    _no_sanitize(monkeypatch, "app.import_plugins.handlers.markdown_folder")
    files = [
        (
            "project/ch1.md",
            b'# Eins\n\n<p style="position: fixed">A</p>\n',
        ),
        (
            "project/ch2.md",
            b'# Zwei\n\n<p style="z-index: 5; text-align: left">B</p>\n',
        ),
    ]
    with TestClient(app) as client:
        book_id = import_markdown_folder(client, files)["book_id"]
        try:
            chapters = client.get(f"/api/books/{book_id}/chapters").json()
            assert len(chapters) == 2
            for chapter in chapters:
                assert "position" not in chapter["content"]
                assert "z-index" not in chapter["content"]
            assert any("text-align: left" in c["content"] for c in chapters)
        finally:
            _cleanup(client, book_id)


def test_project_zip_import_filters_chapter_content(monkeypatch):
    """The write-book-template path, through ``project_chapter_importer``."""
    import io
    import zipfile

    from tests.import_helpers import import_wbt_zip

    _no_sanitize(monkeypatch, "app.services.backup.project_chapter_importer")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr(
            "test-book/config/metadata.yaml",
            "title: Style Book\nauthor: Test Author\nlang: de\n",
        )
        archive.writestr(
            "test-book/manuscript/chapters/chapter-01.md",
            '# Eins\n\n<p style="position: fixed; text-align: center">A</p>\n',
        )
    buf.seek(0)

    with TestClient(app) as client:
        book_id = import_wbt_zip(client, buf, filename="style-book.zip")["book_id"]
        try:
            chapters = client.get(f"/api/books/{book_id}/chapters").json()
            assert chapters
            joined = "".join(chapter["content"] for chapter in chapters)
            assert "position" not in joined
            assert "text-align: center" in joined
        finally:
            _cleanup(client, book_id)
