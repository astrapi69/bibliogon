"""#736: the recorded write-book-template import the browser port is checked against.

Recorded through ``POST /api/import/detect`` + ``POST /api/import/execute``
with a real ZIP, which is the boundary the import wizard actually calls -
not the helpers underneath it. The #1042 lesson is the reason: a record
taken below the boundary cannot see what the boundary supplies, and here
the boundary supplies the ZIP extraction, the project-root search and the
orchestrator's book/chapter/asset commit.

What the record pins:

- every ``Book`` column the metadata parser can populate,
- every chapter's title, type and POSITION (the positions are the part
  that is invisible until a book opens in the wrong order),
- the assets, their classified type and the resulting cover,
- the filtered ``style`` attributes of the stored chapter HTML, and
  separately the core's own ``filter_import_styles`` (#988). The
  separation is the finding: ms-tools' ``content_pre_import`` hook
  strips every style attribute before the core filter runs, so the
  end-to-end case observes nothing. The browser has no ms-tools, and
  the core allowlist is the half that is a security control rather
  than a cleanup - so that is what the port mirrors, recorded where
  the plugin cannot reach it.

What it deliberately does NOT pin: the chapter HTML itself. The backend
converts Markdown with Python's ``markdown`` library; the browser uses
``lib/utils/markdownToHtml.ts``, which is a deliberate divergence
documented in ``library-first.md`` - it emits ``<s>`` for strikethrough
and promotes a standalone image to a ``<figure>`` because the TipTap
``imageFigure`` node needs that. Every other client importer already
goes through it, and adding a second converter to make bytes match would
be the stage-4 reimplementation that rule forbids. So the record carries
the chapter PLAIN TEXT (tags stripped, whitespace collapsed), which is
what both converters must agree on, plus the style attributes, which are
a security control and must match exactly.

Regenerate with ``WBT_IMPORT_PARITY_WRITE=1 poetry run pytest
tests/test_wbt_import_parity.py`` after a deliberate change, and read the
diff: every line is a behaviour change the port has to follow.
"""

from __future__ import annotations

import io
import json
import os
import re
import zipfile
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Asset, Book, Chapter
from app.services.backup.markdown_utils import filter_import_styles
from tests.repo_root import find_repo_root
from tests.wbt_import_cases import CASES, STYLE_FILTER_CASES

REPO_ROOT = find_repo_root(Path(__file__))
FIXTURE_PATH = REPO_ROOT / "frontend" / "src" / "import" / "wbt" / "wbtImport.parity.json"

#: Columns whose value is a fresh uuid or a wall-clock stamp. The record
#: would be unstable with them and the port has no business reproducing
#: them, but they are REPLACED rather than dropped so a record that
#: stopped carrying one is still a visible diff.
_VOLATILE_BOOK_COLUMNS = ("id", "created_at", "updated_at")
_PLACEHOLDER = "<volatile>"

#: One ``style`` attribute, any of the three forms HTML allows. Mirrors
#: the production regex closely enough to EXTRACT what survived
#: filtering; the filtering itself is the backend's.
_STYLE_ATTR_RE = re.compile(
    r"""\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))""",
    re.IGNORECASE,
)

_TAG_RE = re.compile(r"<[^>]+>")


def _build_zip(files: dict[str, Any]) -> bytes:
    """A ZIP from the case's path -> content map.

    Deterministic by construction: entries in the order the case lists
    them, no timestamps read from the clock (zipfile writes a fixed
    1980 date for a ZipInfo without one).
    """
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in files.items():
            info = zipfile.ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
            if "b64" in content:
                import base64

                zf.writestr(info, base64.b64decode(content["b64"]))
            else:
                zf.writestr(info, content["text"].encode("utf-8"))
    return buffer.getvalue()


def _plain_text(html: str) -> str:
    """Tags stripped, entities left, whitespace collapsed.

    The comparable part of a chapter across two Markdown converters: a
    reader sees this text whichever one produced the markup.
    """
    return " ".join(_TAG_RE.sub(" ", html or "").split())


def _style_attributes(html: str) -> list[str]:
    """Every surviving ``style`` attribute value, in document order."""
    values: list[str] = []
    for match in _STYLE_ATTR_RE.finditer(html or ""):
        values.append(next(group for group in match.groups() if group is not None))
    return values


def _book_row(book: Book) -> dict[str, Any]:
    """Every scalar column of the row, volatile ones replaced."""
    columns = {}
    for column in Book.__table__.columns:
        value = getattr(book, column.name)
        if column.name in _VOLATILE_BOOK_COLUMNS:
            columns[column.name] = _PLACEHOLDER if value is not None else None
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            columns[column.name] = value
        else:
            columns[column.name] = str(value)
    return columns


def _asset_rows(assets: list[Asset], book_id: str) -> list[dict[str, Any]]:
    """Filename + type + the path with the per-run upload dir removed.

    The absolute path carries a tmp directory that differs on every run
    and a book id that is a fresh uuid, so what is recorded is the part
    the browser can reproduce: the tail below the book's own directory.
    """
    rows = []
    for asset in sorted(assets, key=lambda a: (a.asset_type, a.filename)):
        tail = asset.path.split(book_id, 1)[-1].lstrip("/") if book_id in asset.path else asset.path
        rows.append({"filename": asset.filename, "asset_type": asset.asset_type, "path_tail": tail})
    return rows


def _record_case(client: TestClient, case: dict[str, Any]) -> dict[str, Any]:
    archive = _build_zip(case["files"])
    detect = client.post(
        "/api/import/detect",
        files=[("files", (f"{case['name']}.zip", archive, "application/zip"))],
    )
    assert detect.status_code == 200, detect.text
    detected = detect.json()

    # DetectedProject calls it format_name. An earlier draft read "format",
    # got None for every case, and recorded "" sixteen times - a pin that
    # could not have failed. Assert it is non-empty here so the record cannot
    # go vacuous again without the recorder saying so.
    detected_format = detected["detected"]["format_name"]
    assert detected_format, f"{case['name']}: detect returned no format_name"

    execute = client.post(
        "/api/import/execute",
        json={
            "temp_ref": detected["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert execute.status_code == 200, execute.text
    book_id = execute.json()["book_id"]

    from app.database import SessionLocal

    session = SessionLocal()
    try:
        book = session.query(Book).filter(Book.id == book_id).one()
        chapters = (
            session.query(Chapter)
            .filter(Chapter.book_id == book_id)
            .order_by(Chapter.position, Chapter.title)
            .all()
        )
        assets = session.query(Asset).filter(Asset.book_id == book_id).all()
        cover_tail = (
            book.cover_image.split(book_id, 1)[-1].lstrip("/")
            if book.cover_image and book_id in book.cover_image
            else book.cover_image
        )
        row = _book_row(book)
        row["cover_image"] = cover_tail
        return {
            "name": case["name"],
            "files": case["files"],
            "detected_format": detected_format,
            "book": row,
            "chapters": [
                {
                    "title": chapter.title,
                    "chapter_type": chapter.chapter_type,
                    "position": chapter.position,
                    "plain_text": _plain_text(chapter.content),
                    "style_attributes": _style_attributes(chapter.content),
                }
                for chapter in chapters
            ],
            "assets": _asset_rows(assets, book_id),
        }
    finally:
        session.close()


def _compute_record() -> dict[str, Any]:
    with TestClient(app) as client:
        cases = [_record_case(client, case) for case in CASES]
    return {
        "_comment": (
            "Generated by backend/tests/test_wbt_import_parity.py. Do not "
            "hand-edit: regenerate with WBT_IMPORT_PARITY_WRITE=1 and read "
            "the diff. Chapter HTML is NOT pinned - see that file's "
            "docstring for why - only its plain text and its style "
            "attributes."
        ),
        "volatile_placeholder": _PLACEHOLDER,
        "cases": cases,
        "style_filter": [
            {
                "name": case["name"],
                "html": case["html"],
                "filtered": filter_import_styles(case["html"]),
            }
            for case in STYLE_FILTER_CASES
        ],
    }


def test_recorded_wbt_import_matches_the_live_endpoint() -> None:
    serialised = json.dumps(_compute_record(), indent=2, ensure_ascii=False) + "\n"
    record = json.loads(serialised)

    if os.environ.get("WBT_IMPORT_PARITY_WRITE"):
        FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE_PATH.write_text(serialised, encoding="utf-8")
        pytest.skip("record rewritten; re-run without WBT_IMPORT_PARITY_WRITE")

    assert FIXTURE_PATH.exists(), (
        f"{FIXTURE_PATH} is missing. Generate it with "
        f"WBT_IMPORT_PARITY_WRITE=1 poetry run pytest "
        f"tests/test_wbt_import_parity.py"
    )
    committed = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert committed == record, (
        "the write-book-template import no longer produces the recorded "
        "output. If the change is intended, regenerate the record and carry "
        "the same change into frontend/src/import/wbt/."
    )


def test_the_record_covers_both_chapter_layouts_and_a_filtered_style() -> None:
    """The cases have to exercise the branches, not just run.

    Without this the suite could pass on a record whose cases all took
    the section-order path, leaving the alphabetical layout's three
    position bases (0 / 100 / 900) unexercised on both sides - and the
    style filter is a security control, so a record with nothing to
    filter proves nothing about it.
    """
    by_name = {case["name"]: case for case in _compute_record()["cases"]}

    alphabetical = by_name["no-export-settings-alphabetical-layout"]
    positions = sorted(chapter["position"] for chapter in alphabetical["chapters"])
    assert positions == [0, 1, 100, 101, 900, 901], positions

    ordered = by_name["full-project-with-section-order"]
    assert [chapter["position"] for chapter in ordered["chapters"]] == [0, 1, 2, 3, 4]

    # ms-tools strips every style attribute before the core filter
    # runs, so the end-to-end case records none - the control lives in
    # the dedicated section below, where no plugin can reach it.
    styled = by_name["style-attributes-are-filtered-on-import"]
    assert not [value for chapter in styled["chapters"] for value in chapter["style_attributes"]]

    filtered = {entry["name"]: entry["filtered"] for entry in _compute_record()["style_filter"]}
    assert "text-align: center" in filtered["allowlisted-survives-forbidden-is-dropped"]
    assert "position" not in filtered["allowlisted-survives-forbidden-is-dropped"]
    assert "font-family" not in filtered["double-quoted-value-with-an-apostrophe"]
    assert "color: red" in filtered["double-quoted-value-with-an-apostrophe"]
    assert "style" not in filtered["nothing-allowlisted-drops-the-attribute"]
    assert "background-image" not in filtered["a-url-background-is-dropped"]


def test_every_case_produced_a_book() -> None:
    """A case whose ZIP the detector rejected would record an exception
    rather than a row, so this pins that all 16 reached the importer."""
    cases = _compute_record()["cases"]
    assert len(cases) == len(CASES)
    for case in cases:
        assert case["book"]["title"], case["name"]
