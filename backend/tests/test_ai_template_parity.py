"""#745: the recorded `.biblio.yaml` the browser port is checked against.

`AITemplatePanel`'s Export / Import buttons round-trip the file through
`GET`/`POST /api/{books,articles}/{id}/ai-template`, which is why
`ai-template-file-io` is DESKTOP_ONLY. Porting it means a TypeScript
serializer and parser, and a port written beside the original agrees
with what its author believed the original does.

Recorded at the **endpoint**, not at `serialize_template_to_yaml`.
#1042 is the reason: a record taken below the API boundary cannot see
what the route supplies, and here the route supplies the download
filename (`ascii_filename_slug(title) + ".biblio.yaml"`) that the
browser has to reproduce. A function-level record would have shipped a
port that writes a differently-named file and nothing would have
noticed.

Each half pins its own end: this file recomputes the responses and fails
when they differ from the record, so a schema or header change cannot
pass silently; `frontend/src/lib/ai/template/aiTemplate.parity.test.ts`
fails when the port stops reproducing it.

Regenerate with ``AI_TEMPLATE_PARITY_WRITE=1 poetry run pytest
tests/test_ai_template_parity.py`` after a deliberate change, and read
the diff: every line of it is something the port has to follow.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Article, Book, Chapter

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = REPO_ROOT / "frontend" / "src" / "lib" / "ai" / "template" / "aiTemplate.parity.json"

#: Cases chosen to reach each shape the port has to handle: the plain
#: one, non-ASCII in the title (the slug and `allow_unicode` both), a
#: book with chapters (the only list-of-objects field), and a record
#: whose optional columns are unset (so `current_value: null` survives).
BOOK_CASES: list[dict[str, Any]] = [
    {
        "key": "book-plain",
        "title": "The Cat on the Roof",
        "author": "Asterios Raptis",
        "language": "en",
        "description": "A cat watches the city and decides to stay.",
        "genre": "Fiction",
        "chapters": [("Chapter One", "The cat sat on the roof and waited.")],
    },
    {
        "key": "book-unicode",
        "title": "Über Dächer und Straßen",
        "author": "Asterios Raptis",
        "language": "de",
        "description": "Ein Kater beobachtet die Stadt und beschließt zu bleiben.",
        "genre": "Belletristik",
        "chapters": [("Erstes Kapitel", "Der Kater saß auf dem Dach und wartete.")],
    },
    {
        "key": "book-empty-fields",
        "title": "Untitled Draft",
        "author": "",
        "language": "en",
        "description": "",
        "genre": "",
        "chapters": [],
    },
]

ARTICLE_CASES: list[dict[str, Any]] = [
    {
        "key": "article-plain",
        "title": "Why Cats Climb",
        "language": "en",
        "topic": "nature",
        "tags": "cats,roofs",
    },
    {
        "key": "article-unicode",
        "title": "Warum Katzen klettern — eine Übersicht",
        "language": "de",
        "topic": "natur",
        "tags": "katzen,dächer",
    },
    {
        "key": "article-bare",
        "title": "Draft",
        "language": "en",
        "topic": None,
        "tags": None,
    },
]


def _record_book(client: TestClient, db, case: dict[str, Any]) -> dict[str, Any]:
    book = Book(
        title=case["title"],
        author=case["author"],
        language=case["language"],
        description=case["description"],
        genre=case["genre"],
        book_type="prose",
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    for position, (chapter_title, text) in enumerate(case["chapters"]):
        db.add(
            Chapter(
                book_id=book.id,
                title=chapter_title,
                content=json.dumps(
                    {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": text}],
                            }
                        ],
                    }
                ),
                position=position,
            )
        )
    db.commit()

    response = client.get(f"/api/books/{book.id}/ai-template")
    assert response.status_code == 200, response.text
    return {
        "key": case["key"],
        "kind": "book",
        "title": case["title"],
        "content_disposition": response.headers["content-disposition"].replace(book.id, "<id>"),
        "yaml": response.text.replace(book.id, "<id>"),
    }


def _record_article(client: TestClient, db, case: dict[str, Any]) -> dict[str, Any]:
    article = Article(
        title=case["title"],
        language=case["language"],
        topic=case["topic"],
        tags=case["tags"],
        content_json=json.dumps(
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "A paragraph of body."}],
                    }
                ],
            }
        ),
    )
    db.add(article)
    db.commit()
    db.refresh(article)

    response = client.get(f"/api/articles/{article.id}/ai-template")
    assert response.status_code == 200, response.text
    return {
        "key": case["key"],
        "kind": "article",
        "title": case["title"],
        "content_disposition": response.headers["content-disposition"].replace(article.id, "<id>"),
        "yaml": response.text.replace(article.id, "<id>"),
    }


def test_ai_template_parity_record_is_current() -> None:
    """Recompute every case and compare against the committed record."""
    with TestClient(app) as client, SessionLocal() as db:
        recorded = [_record_book(client, db, case) for case in BOOK_CASES]
        recorded += [_record_article(client, db, case) for case in ARTICLE_CASES]

    payload = {
        "_comment": (
            "Generated by backend/tests/test_ai_template_parity.py. Do not "
            "hand-edit: regenerate with AI_TEMPLATE_PARITY_WRITE=1."
        ),
        "cases": recorded,
    }

    if os.environ.get("AI_TEMPLATE_PARITY_WRITE"):
        FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE_PATH.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        pytest.skip("record rewritten")

    assert FIXTURE_PATH.is_file(), (
        f"{FIXTURE_PATH} is missing; generate it with "
        "AI_TEMPLATE_PARITY_WRITE=1 poetry run pytest tests/test_ai_template_parity.py"
    )
    stored = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert stored["cases"] == recorded
