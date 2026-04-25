"""PGS-03 backend tests: three-way diff service.

Covers:
- pure ``_classify`` over hand-built dicts: every classification
  string is exercised plus the edge cases (both-sides-removed,
  both-sides-added-identical, normalize-tolerant whitespace).
- end-to-end ``diff_book`` against a real throwaway git repo +
  DB book: build a base commit, advance the working tree to a
  remote HEAD, edit a chapter in the DB, run diff, assert the
  per-chapter classifications.
- ``POST /api/git-sync/{book_id}/diff`` happy path + 404/410.
"""

from __future__ import annotations

import json
from pathlib import Path

import git
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Asset, Book, Chapter, GitSyncMapping
from app.services import git_sync_mapping
from app.services.git_sync_diff import (
    ChapterIdentity,
    _classify,
    _normalize,
    diff_book,
)

client = TestClient(app)


# --- pure _classify tests (no git, no DB) ---


def _b(text: str) -> tuple[str, str]:
    return ("Title", text)


def _l(text: str, db_id: str = "x") -> tuple[str, str, str]:
    return ("Title", text, db_id)


IDENT = ChapterIdentity(section="chapters", slug="ch-1")


def test_classify_unchanged_when_all_three_match() -> None:
    out = _classify({IDENT: _b("hi")}, {IDENT: _l("hi")}, {IDENT: _b("hi")})
    assert [d.classification for d in out] == ["unchanged"]


def test_classify_remote_changed_when_only_remote_diffs() -> None:
    out = _classify({IDENT: _b("hi")}, {IDENT: _l("hi")}, {IDENT: _b("HEY")})
    assert out[0].classification == "remote_changed"


def test_classify_local_changed_when_only_local_diffs() -> None:
    out = _classify({IDENT: _b("hi")}, {IDENT: _l("HEY")}, {IDENT: _b("hi")})
    assert out[0].classification == "local_changed"


def test_classify_both_changed_when_diverged() -> None:
    out = _classify({IDENT: _b("base")}, {IDENT: _l("LOCAL")}, {IDENT: _b("REMOTE")})
    assert out[0].classification == "both_changed"
    assert out[0].is_conflict is True


def test_classify_unchanged_when_both_sides_made_same_edit() -> None:
    """Both ends landed the same content - not a conflict."""
    out = _classify({IDENT: _b("base")}, {IDENT: _l("same")}, {IDENT: _b("same")})
    assert out[0].classification == "unchanged"


def test_classify_remote_added() -> None:
    out = _classify({}, {}, {IDENT: _b("new from remote")})
    assert out[0].classification == "remote_added"


def test_classify_local_added() -> None:
    out = _classify({}, {IDENT: _l("new from local")}, {})
    assert out[0].classification == "local_added"


def test_classify_remote_removed_when_local_kept_base() -> None:
    out = _classify({IDENT: _b("base")}, {IDENT: _l("base")}, {})
    assert out[0].classification == "remote_removed"


def test_classify_local_removed_when_remote_kept_base() -> None:
    out = _classify({IDENT: _b("base")}, {}, {IDENT: _b("base")})
    assert out[0].classification == "local_removed"


def test_classify_skips_when_both_sides_removed() -> None:
    """Phantom 'both removed' just disappears from the diff."""
    out = _classify({IDENT: _b("base")}, {}, {})
    assert out == []


def test_classify_normalize_tolerates_blank_line_runs() -> None:
    base = "line\n\n\n\nmore\n"
    local = "line\n\nmore"  # collapsed blank run, no trailing newline
    out = _classify({IDENT: _b(base)}, {IDENT: _l(local)}, {IDENT: _b(base)})
    assert out[0].classification == "unchanged"


def test_normalize_collapses_blank_runs_and_strips() -> None:
    assert _normalize("a\n\n\n\nb\n") == _normalize("a\n\nb")


# --- end-to-end via real git repo + DB ---


@pytest.fixture
def db() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def book(db: Session) -> Book:
    b = Book(title="PGS Diff Book", author="Aster", language="de")
    db.add(b)
    db.commit()
    db.refresh(b)
    yield b
    db.query(GitSyncMapping).filter_by(book_id=b.id).delete()
    db.query(Asset).filter_by(book_id=b.id).delete()
    db.query(Chapter).filter_by(book_id=b.id).delete()
    db.delete(b)
    db.commit()


def _write_wbt_chapter(repo_root: Path, section: str, filename: str, body: str) -> None:
    target = repo_root / "manuscript" / section
    target.mkdir(parents=True, exist_ok=True)
    (target / filename).write_text(body, encoding="utf-8")


def _commit_all(repo: git.Repo, message: str) -> str:
    repo.git.add(A=True)
    return repo.index.commit(message).hexsha


def _tiptap_paragraph(text: str) -> str:
    return json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": text}],
                }
            ],
        }
    )


def test_diff_classifies_every_case_end_to_end(
    db: Session, book: Book, tmp_path: Path
) -> None:
    """Build a repo with 4 chapters at base, then mutate base + local +
    remote to land each of: unchanged, remote_changed, local_changed,
    both_changed (conflict). Run diff_book against the result and
    verify the per-chapter classifications.
    """
    bare = tmp_path / "remote.git"
    git.Repo.init(bare, bare=True)
    work = tmp_path / "work"
    work.mkdir()
    repo = git.Repo.init(work)
    repo.create_remote("origin", str(bare))
    (work / "config").mkdir()
    (work / "config" / "metadata.yaml").write_text("title: x\n", encoding="utf-8")

    # 4 base chapters; identities: chapters/{slug}.
    _write_wbt_chapter(work, "chapters", "01-alpha.md", "# Alpha\n\nbase alpha\n")
    _write_wbt_chapter(work, "chapters", "02-bravo.md", "# Bravo\n\nbase bravo\n")
    _write_wbt_chapter(work, "chapters", "03-charlie.md", "# Charlie\n\nbase charlie\n")
    _write_wbt_chapter(work, "chapters", "04-delta.md", "# Delta\n\nbase delta\n")
    base_sha = _commit_all(repo, "base import")

    # Persist clone + write mapping. We simulate "imported from this commit".
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    git_sync_mapping.persist_clone_after_import(
        db, staging_path=work, book_id=book.id, uploads_dir=uploads,
    )
    db.expire_all()
    mapping = db.get(GitSyncMapping, book.id)
    assert mapping.last_imported_commit_sha == base_sha
    persisted = Path(mapping.local_clone_path)
    persisted_repo = git.Repo(str(persisted))

    # Seed the DB chapters as identical-to-base. Use the same H1 so the
    # slug derived from the title matches the on-disk slug.
    db.add(
        Chapter(
            book_id=book.id, title="Alpha", chapter_type="chapter", position=0,
            content=_tiptap_paragraph("base alpha"),
        )
    )
    db.add(
        Chapter(
            book_id=book.id, title="Bravo", chapter_type="chapter", position=1,
            content=_tiptap_paragraph("base bravo"),
        )
    )
    db.add(
        Chapter(
            book_id=book.id, title="Charlie", chapter_type="chapter", position=2,
            content=_tiptap_paragraph("base charlie"),
        )
    )
    db.add(
        Chapter(
            book_id=book.id, title="Delta", chapter_type="chapter", position=3,
            content=_tiptap_paragraph("base delta"),
        )
    )
    db.commit()

    # Advance the persisted clone to a "remote HEAD" with edits to
    # bravo, charlie, delta. Alpha stays exactly as base.
    _write_wbt_chapter(persisted, "chapters", "02-bravo.md", "# Bravo\n\nremote bravo\n")
    _write_wbt_chapter(persisted, "chapters", "03-charlie.md", "# Charlie\n\nbase charlie\n")
    _write_wbt_chapter(persisted, "chapters", "04-delta.md", "# Delta\n\nremote delta\n")
    _commit_all(persisted_repo, "remote progress")

    # Local edits in DB: charlie + delta. Bravo untouched.
    charlie = db.query(Chapter).filter_by(book_id=book.id, title="Charlie").first()
    charlie.content = _tiptap_paragraph("local charlie")
    delta = db.query(Chapter).filter_by(book_id=book.id, title="Delta").first()
    delta.content = _tiptap_paragraph("local delta")
    db.commit()

    # Refresh mapping branch ref to whatever the persisted clone uses.
    persisted_branch = persisted_repo.active_branch.name
    mapping.branch = persisted_branch
    db.commit()
    db.expire_all()

    diffs = {d.identity.slug: d.classification for d in diff_book(db, book_id=book.id)}
    # alpha: unchanged on both -> unchanged
    assert diffs["alpha"] == "unchanged"
    # bravo: remote changed only -> remote_changed
    assert diffs["bravo"] == "remote_changed"
    # charlie: local changed only -> local_changed
    assert diffs["charlie"] == "local_changed"
    # delta: both changed -> both_changed (conflict)
    assert diffs["delta"] == "both_changed"


# --- HTTP layer ---


def test_diff_endpoint_404_on_unmapped_book(book: Book) -> None:
    resp = client.post(f"/api/git-sync/{book.id}/diff")
    assert resp.status_code == 404


def test_diff_endpoint_410_when_clone_missing(
    db: Session, book: Book, tmp_path: Path
) -> None:
    db.add(
        GitSyncMapping(
            book_id=book.id,
            repo_url="https://example.com/x.git",
            branch="main",
            last_imported_commit_sha="0" * 40,
            local_clone_path=str(tmp_path / "nope"),
        )
    )
    db.commit()
    resp = client.post(f"/api/git-sync/{book.id}/diff")
    assert resp.status_code == 410


def test_diff_endpoint_returns_payload_with_counts(
    db: Session, book: Book, tmp_path: Path
) -> None:
    bare = tmp_path / "remote.git"
    git.Repo.init(bare, bare=True)
    work = tmp_path / "work"
    work.mkdir()
    repo = git.Repo.init(work)
    repo.create_remote("origin", str(bare))
    _write_wbt_chapter(work, "chapters", "01-foo.md", "# Foo\n\nbody\n")
    _commit_all(repo, "init")

    uploads = tmp_path / "uploads"
    uploads.mkdir()
    git_sync_mapping.persist_clone_after_import(
        db, staging_path=work, book_id=book.id, uploads_dir=uploads,
    )
    db.expire_all()

    db.add(
        Chapter(
            book_id=book.id, title="Foo", chapter_type="chapter", position=0,
            content=_tiptap_paragraph("body"),
        )
    )
    db.commit()

    resp = client.post(f"/api/git-sync/{book.id}/diff")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["book_id"] == book.id
    assert body["counts"]["unchanged"] == 1
    assert len(body["chapters"]) == 1
    entry = body["chapters"][0]
    assert entry["section"] == "chapters"
    assert entry["slug"] == "foo"
    assert entry["classification"] == "unchanged"
