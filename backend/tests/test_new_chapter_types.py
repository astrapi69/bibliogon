"""Tests for the 5 new chapter types added in the ChapterType audit.

Covers:
- The Pydantic + SQLAlchemy enums accept all five new values
- The export scaffolder routes them to the right partition
  (front/back matter, body) with the appropriate CSS wrapper
- The audiobook generator's default SKIP_TYPES list includes the
  three marketing types (also_by_author, excerpt, call_to_action)
- part_intro / interlude / part are explicitly handled as body
  elements rather than falling through the default branch
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.job_store import JobStatus, job_store
from app.main import app
from app.schemas import ChapterType


NEW_TYPES = [
    "final_thoughts",
    "part",
    "also_by_author",
    "excerpt",
    "call_to_action",
]

MARKETING_TYPES = ["also_by_author", "excerpt", "call_to_action"]


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _create_book(client: TestClient, title: str = "Chapter Type Test") -> str:
    r = client.post("/api/books", json={"title": title, "author": "T"})
    assert r.status_code in (200, 201)
    return r.json()["id"]


def _add_chapter(client: TestClient, book_id: str, title: str, ch_type: str) -> str:
    r = client.post(
        f"/api/books/{book_id}/chapters",
        json={
            "title": title,
            "content": json.dumps({
                "type": "doc",
                "content": [{
                    "type": "paragraph",
                    "content": [{"type": "text", "text": f"Body of {title}."}],
                }],
            }),
            "chapter_type": ch_type,
        },
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _cleanup(client: TestClient, book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


def _wait(job_id: str, timeout: float = 5.0) -> None:
    import asyncio
    terminal = (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED)

    async def _w():
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while True:
            job = job_store.get(job_id)
            if job is None or job.status in terminal:
                return
            if loop.time() > deadline:
                raise TimeoutError(f"Job {job_id} did not finish")
            await asyncio.sleep(0.05)

    asyncio.new_event_loop().run_until_complete(_w())


# --- Enum coverage ---


def test_pydantic_enum_has_all_new_types():
    members = {member.value for member in ChapterType}
    for new_type in NEW_TYPES:
        assert new_type in members, f"missing from Pydantic enum: {new_type}"


def test_sqlalchemy_enum_has_all_new_types():
    from app.models import ChapterType as ModelChapterType
    members = {member.value for member in ModelChapterType}
    for new_type in NEW_TYPES:
        assert new_type in members, f"missing from SQLAlchemy enum: {new_type}"


# --- API CRUD round-trip for each new type ---


@pytest.mark.parametrize("ch_type", NEW_TYPES)
def test_can_create_chapter_with_new_type(client, tmp_path, monkeypatch, ch_type):
    monkeypatch.chdir(tmp_path)
    book_id = _create_book(client)
    try:
        ch_id = _add_chapter(client, book_id, f"{ch_type} chapter", ch_type)
        chapters = client.get(f"/api/books/{book_id}/chapters").json()
        match = next((c for c in chapters if c["id"] == ch_id), None)
        assert match is not None
        assert match["chapter_type"] == ch_type
    finally:
        _cleanup(client, book_id)


# --- Export scaffolder partitioning ---


def test_scaffolder_partitions_new_types_correctly(tmp_path):
    """The new types must land in the right partition with their CSS wrapper."""
    from bibliogon_export.scaffolder import (
        _BACK_MATTER_TYPES,
        _BODY_TYPES,
        _CHAPTER_TYPE_WRAPPERS,
        _DEFAULT_CHAPTER_TYPE_CSS,
        _write_partitioned_chapters,
    )

    # Back-matter newcomers must be in the back-matter map.
    for back_type in ("final_thoughts", "also_by_author", "excerpt", "call_to_action"):
        assert back_type in _BACK_MATTER_TYPES, f"{back_type} missing from _BACK_MATTER_TYPES"
        assert back_type in _CHAPTER_TYPE_WRAPPERS, f"{back_type} missing wrapper"

    # ``part`` is a body element with its own wrapper.
    assert "part" in _BODY_TYPES
    assert "part" in _CHAPTER_TYPE_WRAPPERS

    # part_intro and interlude are explicit body elements (no wrapper needed).
    assert "part_intro" in _BODY_TYPES
    assert "interlude" in _BODY_TYPES

    # CSS classes for the new types are present.
    for css_class in (".part", ".final-thoughts", ".also-by-author", ".excerpt", ".call-to-action"):
        assert css_class in _DEFAULT_CHAPTER_TYPE_CSS, f"{css_class} CSS missing"

    # Smoke test: scaffold each type and verify the file lands in the
    # right directory.
    manuscript = tmp_path / "manuscript"
    (manuscript / "front-matter").mkdir(parents=True)
    (manuscript / "chapters").mkdir(parents=True)
    (manuscript / "back-matter").mkdir(parents=True)

    chapters = [
        {"position": 0, "title": "Part One", "chapter_type": "part", "content": "Intro to part"},
        {"position": 1, "title": "Final Thoughts", "chapter_type": "final_thoughts", "content": "Wrap up"},
        {"position": 2, "title": "Also By", "chapter_type": "also_by_author", "content": "Other books"},
        {"position": 3, "title": "Sample", "chapter_type": "excerpt", "content": "Excerpt text"},
        {"position": 4, "title": "Visit", "chapter_type": "call_to_action", "content": "Buy now"},
    ]
    _write_partitioned_chapters(manuscript, chapters)

    assert any(p.name.endswith("part-one.md") for p in (manuscript / "chapters").iterdir())
    assert (manuscript / "back-matter" / "final-thoughts.md").exists()
    assert (manuscript / "back-matter" / "also-by-author.md").exists()
    assert (manuscript / "back-matter" / "excerpt.md").exists()
    assert (manuscript / "back-matter" / "call-to-action.md").exists()

    # The part chapter should carry the .part wrapper in its file body.
    part_files = list((manuscript / "chapters").iterdir())
    part_md = next((f for f in part_files if "part-one" in f.name), None)
    assert part_md is not None
    assert '<div class="part">' in part_md.read_text(encoding="utf-8")


# --- Audiobook default skip ---


def test_audiobook_generator_default_skip_includes_marketing():
    from bibliogon_audiobook.generator import SKIP_TYPES
    for marketing in MARKETING_TYPES:
        assert marketing in SKIP_TYPES, f"{marketing} missing from generator SKIP_TYPES"


def test_audiobook_router_default_skip_includes_marketing():
    from app.routers.audiobook import DEFAULT_AUDIOBOOK_SKIP_TYPES
    for marketing in MARKETING_TYPES:
        assert marketing in DEFAULT_AUDIOBOOK_SKIP_TYPES


def test_audiobook_export_skips_marketing_types_by_default(client, tmp_path, monkeypatch):
    """A book with marketing chapters should not have them synthesised
    when no per-book skip override is set."""
    monkeypatch.chdir(tmp_path)
    book_id = _create_book(client)
    try:
        _add_chapter(client, book_id, "Kapitel 1", "chapter")
        _add_chapter(client, book_id, "Buy My Book", "call_to_action")
        _add_chapter(client, book_id, "Sample Excerpt", "excerpt")
        _add_chapter(client, book_id, "Other Books", "also_by_author")

        synth_calls: list[str] = []

        async def counting_synth(text, output_path, voice="", language="de", rate=""):
            synth_calls.append(text)
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            Path(output_path).write_bytes(b"fake mp3")

        engine = AsyncMock()
        engine.synthesize = counting_synth

        with patch("bibliogon_audiobook.generator.get_engine", return_value=engine):
            job_id = client.post(
                f"/api/books/{book_id}/export/async/audiobook",
            ).json()["job_id"]
            _wait(job_id)

        # Only "Kapitel 1" should have been synthesised.
        assert len(synth_calls) == 1
        assert "Kapitel 1" in synth_calls[0]
    finally:
        _cleanup(client, book_id)
