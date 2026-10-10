"""A Story-Bible link may point at a page in another book (#1081).

The Storyboard lets an entity be dragged onto a page card, and nothing
says both have to live in the same book - the BACKUP-AKZEPTANZTEST
fixture links a prose book's entity to a comic book's page on purpose.

The export writes a link under the ENTITY's book directory while the
page lives under another's, and the import walked the directories in
sorted order, i.e. by random UUID. When the entity's book sorted first
the insert hit a page that did not exist yet, the FK failed, and the
whole restore 500'd: on half of all attempts the user got nothing back.

Each case below builds the archive by hand so the ordering is the
variable under test rather than a coin flip.
"""

from __future__ import annotations

import io
import json
import zipfile

from fastapi.testclient import TestClient

from app.main import app

ENTITY_ID = "e" * 32
LINK_ID = "l" * 32
PAGE_ID = "p" * 32


def _book(book_id: str, title: str, book_type: str) -> str:
    return json.dumps(
        {
            "id": book_id,
            "title": title,
            "author": "Autor",
            "language": "de",
            "book_type": book_type,
            "status": "draft",
        }
    )


def _archive(entity_book: str, page_book: str, *, include_page: bool = True) -> bytes:
    """A bundle whose link crosses from `entity_book` to `page_book`."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "manifest.json",
            json.dumps({"version": "3.0", "format": "bibliogon-backup"}),
        )
        zf.writestr(f"books/{entity_book}/book.json", _book(entity_book, "Prosa", "prose"))
        zf.writestr(
            f"books/{entity_book}/story_entities.json",
            json.dumps(
                [
                    {
                        "id": ENTITY_ID,
                        "book_id": entity_book,
                        "entity_type": "character",
                        "name": "Held",
                        "position": 0,
                    }
                ]
            ),
        )
        zf.writestr(
            f"books/{entity_book}/story_entity_page_links.json",
            json.dumps(
                [
                    {
                        "id": LINK_ID,
                        "entity_id": ENTITY_ID,
                        "page_id": PAGE_ID,
                        "chapter_id": None,
                        "role": "lead",
                        "notes": None,
                    }
                ]
            ),
        )
        zf.writestr(f"books/{page_book}/book.json", _book(page_book, "Comic", "comic_book"))
        if include_page:
            zf.writestr(
                f"books/{page_book}/pages.json",
                json.dumps(
                    [
                        {
                            "id": PAGE_ID,
                            "book_id": page_book,
                            "position": 0,
                            "layout": "comic_panel_grid",
                            "text_content": "Seitentext",
                        }
                    ]
                ),
            )
    return buf.getvalue()


def _import(client: TestClient, archive: bytes):
    return client.post(
        "/api/backup/import",
        files={"file": ("backup.bgb", archive, "application/zip")},
    )


def _links(client: TestClient) -> list[dict]:
    """The entity's appearances - the links as the app reads them."""
    resp = client.get(f"/api/story-bible/entities/{ENTITY_ID}/appearances")
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_link_restores_when_its_book_sorts_first() -> None:
    """The failing direction: the link is written before the page."""
    with TestClient(app) as client:
        resp = _import(client, _archive("a" * 32, "z" * 32))
        assert resp.status_code == 200, resp.text
        assert resp.json()["imported_books"] == 2
        assert len(_links(client)) == 1


def test_link_restores_when_its_book_sorts_last() -> None:
    """The direction that passed by luck - pinned so a fix cannot
    trade one order for the other."""
    with TestClient(app) as client:
        resp = _import(client, _archive("z" * 32, "a" * 32))
        assert resp.status_code == 200, resp.text
        assert resp.json()["imported_books"] == 2
        assert len(_links(client)) == 1


def test_a_link_whose_page_is_absent_is_skipped_not_fatal() -> None:
    """A selective export can carry the entity's book and not the
    page's. The link is dropped; the rest of the restore stands."""
    with TestClient(app) as client:
        resp = _import(client, _archive("a" * 32, "z" * 32, include_page=False))
        assert resp.status_code == 200, resp.text
        assert resp.json()["imported_books"] == 2
        assert _links(client) == []
