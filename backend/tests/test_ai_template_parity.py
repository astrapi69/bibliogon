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
import yaml
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


#: Keys dropped from the recorded source row. The timestamps are the
#: moment the record was made and the embedded `chapters` carry their
#: own freshly-minted ids, so both would make the record differ on
#: every run; the template reads none of them (chapter TEXT travels as
#: `chapter_contents`, which is deterministic).
_VOLATILE_SOURCE_KEYS = ("created_at", "updated_at", "chapters")


def _normalize_ids(row: dict[str, Any], record_id: str) -> dict[str, Any]:
    """The source row with its id replaced and its timestamps dropped."""
    return {
        key: ("<id>" if value == record_id else value)
        for key, value in row.items()
        if key not in _VOLATILE_SOURCE_KEYS
    }


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
    # The source row as the API returns it, so the browser factory can
    # be fed the same input the endpoint read. Without it the port could
    # only be checked against a template it was handed, not against the
    # record it has to build one from.
    source = client.get(f"/api/books/{book.id}").json()
    chapters = client.get(f"/api/books/{book.id}/chapters").json()
    return {
        "key": case["key"],
        "kind": "book",
        "title": case["title"],
        "content_disposition": response.headers["content-disposition"].replace(book.id, "<id>"),
        "yaml": response.text.replace(book.id, "<id>"),
        "source": _normalize_ids(source, book.id),
        "chapter_contents": [chapter.get("content") for chapter in chapters],
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
    source = client.get(f"/api/articles/{article.id}").json()
    return {
        "key": case["key"],
        "kind": "article",
        "title": case["title"],
        "content_disposition": response.headers["content-disposition"].replace(article.id, "<id>"),
        "yaml": response.text.replace(article.id, "<id>"),
        "source": _normalize_ids(source, article.id),
    }


#: The apply half. Each case fills a template the way a returning
#: assistant would and POSTs it back, so the port can be checked against
#: what the endpoint ACTUALLY reports - which fields it wrote, which it
#: skipped and why - rather than against a reading of the router.
#:
#: `force` is the axis that matters: with it false a populated column is
#: preserved, with it true the same column is overwritten, and an empty
#: incoming value is skipped either way. The chapter-summaries entries
#: cover the three reconcile outcomes in one POST: matched by id,
#: matched by a loosely-spelled title, and matched by nothing.
APPLY_CASES: list[dict[str, Any]] = [
    {"key": "book-apply-soft", "kind": "book", "force": False},
    {"key": "book-apply-force", "kind": "book", "force": True},
    {"key": "article-apply-soft", "kind": "article", "force": False},
    {"key": "article-apply-force", "kind": "article", "force": True},
]

#: What a filled file carries, per field. Deliberately includes a value
#: for a field the record already has (so `force` is observable) and an
#: empty one (so the always-skip rule is).
BOOK_FILL = {
    "title": "Ein neuer Titel",
    "subtitle": "Ein Untertitel",
    "description": "   ",
    "genre": "Sachbuch",
    "keywords": ["kartografie", "feldbuch"],
    "html_description": "<p>Amazon-Beschreibung</p>",
    "backpage_description": "Rueckseitentext",
    "backpage_author_bio": "Autorenvita",
    "cover_image_prompt": "Handgezeichnete Karte, kein Text im Bild",
}
ARTICLE_FILL = {
    "title": "Ein neuer Titel",
    "seo_title": "SEO-Titel",
    "seo_description": "SEO-Beschreibung",
    "excerpt": "   ",
    "tags": ["katzen", "daecher"],
    "topic": "Natur",
    "featured_image_prompt": "Eine Katze auf einem Dach",
    "inline_image_prompts": [{"section_hint": "Einleitung", "prompt": "Daecher"}],
}


def _fill(template_yaml: str, values: dict[str, Any], extra: dict[str, Any]) -> str:
    """Put `values` into the template's `current_value` keys, the way a
    returning assistant would, and re-serialize."""
    body = yaml.safe_load(template_yaml)
    for name, value in {**values, **extra}.items():
        body[name]["current_value"] = value
    return yaml.safe_dump(body, allow_unicode=True, sort_keys=False)


def _record_apply(client: TestClient, db, case: dict[str, Any]) -> dict[str, Any]:
    if case["kind"] == "book":
        book = Book(
            title="Der Kater auf dem Dach",
            author="Asterios Raptis",
            language="de",
            description="Eine Beschreibung die schon dasteht.",
            genre="Belletristik",
            book_type="prose",
        )
        db.add(book)
        db.commit()
        db.refresh(book)
        chapters = []
        for position, chapter_title in enumerate(["Erstes Kapitel", "Zweites Kapitel"]):
            chapter = Chapter(
                book_id=book.id,
                title=chapter_title,
                content=json.dumps(
                    {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Ein Absatz."}],
                            }
                        ],
                    }
                ),
                position=position,
            )
            db.add(chapter)
            chapters.append(chapter)
        db.commit()
        for chapter in chapters:
            db.refresh(chapter)
        record_id, path = book.id, f"/api/books/{book.id}"
        summaries = [
            # matched by id
            {"chapter_id": chapters[0].id, "title": "egal", "summary": "Zusammenfassung eins."},
            # matched by a loosely-spelled title
            {"title": "  zweites   KAPITEL ", "summary": "Zusammenfassung zwei."},
            # matched by nothing
            {"chapter_id": "f" * 32, "title": "Gibt es nicht", "summary": "Verwaist."},
        ]
        filled = _fill(
            client.get(f"{path}/ai-template").text,
            BOOK_FILL,
            {"chapter_summaries": summaries},
        )
        chapter_refs = [{"id": c.id, "title": c.title} for c in chapters]
    else:
        article = Article(
            title="Warum Katzen klettern",
            language="de",
            topic="natur",
            content_json=json.dumps(
                {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "Ein Absatz Text."}],
                        }
                    ],
                }
            ),
        )
        db.add(article)
        db.commit()
        db.refresh(article)
        record_id, path = article.id, f"/api/articles/{article.id}"
        filled = _fill(client.get(f"{path}/ai-template").text, ARTICLE_FILL, {})
        chapter_refs = []

    before = client.get(path).json()
    response = client.post(
        f"{path}/ai-template?force={'true' if case['force'] else 'false'}",
        content=filled.encode("utf-8"),
        headers={"Content-Type": "text/yaml"},
    )
    assert response.status_code == 200, response.text
    after = client.get(path).json()

    def normalize(value: Any) -> Any:
        """Ids out, so two runs record the same thing."""
        if isinstance(value, str):
            out = value.replace(record_id, "<id>")
            for index, chapter in enumerate(chapter_refs):
                out = out.replace(chapter["id"], f"<c{index}>")
            return out
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if isinstance(value, dict):
            return {key: normalize(item) for key, item in value.items()}
        return value

    return {
        "key": case["key"],
        "kind": case["kind"],
        "force": case["force"],
        "before": normalize(_normalize_ids(before, record_id)),
        "chapters": normalize(chapter_refs),
        "filled_yaml": normalize(filled),
        "response": normalize(response.json()),
        "after": normalize(_normalize_ids(after, record_id)),
    }


def test_ai_template_parity_record_is_current() -> None:
    """Recompute every case and compare against the committed record."""
    with TestClient(app) as client, SessionLocal() as db:
        recorded = [_record_book(client, db, case) for case in BOOK_CASES]
        recorded += [_record_article(client, db, case) for case in ARTICLE_CASES]
        applied = [_record_apply(client, db, case) for case in APPLY_CASES]

    payload = {
        "_comment": (
            "Generated by backend/tests/test_ai_template_parity.py. Do not "
            "hand-edit: regenerate with AI_TEMPLATE_PARITY_WRITE=1."
        ),
        "cases": recorded,
        "apply_cases": applied,
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
    assert stored["apply_cases"] == applied
