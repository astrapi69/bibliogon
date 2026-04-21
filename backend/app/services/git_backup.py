"""Phase 1 git-based backup service.

Per-book git repo at ``uploads/{book_id}/.git``. Local-only: no push,
no pull, no remote, no auth. See
[docs/explorations/git-based-backup.md](../../../docs/explorations/git-based-backup.md)
for the full phased plan.

Commit writes the current book state to disk as TipTap JSON per chapter
plus ``config/metadata.yaml`` then runs ``git add . && git commit``.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import git  # GitPython
import yaml
from sqlalchemy.orm import Session

from app.models import Book, Chapter, ChapterType

# Bibliogon convention: every book's uploads live at ``uploads/{book_id}/``.
UPLOADS_ROOT = Path("uploads")

# ChapterType classification mirrors ``frontend/src/components/ChapterSidebar.tsx``.
# Keep in sync when new types land.
_FRONT_MATTER = {
    ChapterType.TABLE_OF_CONTENTS.value,
    ChapterType.DEDICATION.value,
    ChapterType.EPIGRAPH.value,
    ChapterType.PREFACE.value,
    ChapterType.FOREWORD.value,
    ChapterType.PROLOGUE.value,
    ChapterType.INTRODUCTION.value,
    ChapterType.HALF_TITLE.value,
    ChapterType.TITLE_PAGE.value,
    ChapterType.COPYRIGHT.value,
}
_BACK_MATTER = {
    ChapterType.EPILOGUE.value,
    ChapterType.AFTERWORD.value,
    ChapterType.FINAL_THOUGHTS.value,
    ChapterType.CONCLUSION.value,
    ChapterType.ABOUT_AUTHOR.value,
    ChapterType.ACKNOWLEDGMENTS.value,
    ChapterType.APPENDIX.value,
    ChapterType.BIBLIOGRAPHY.value,
    ChapterType.ENDNOTES.value,
    ChapterType.GLOSSARY.value,
    ChapterType.INDEX.value,
    ChapterType.IMPRINT.value,
    ChapterType.ALSO_BY_AUTHOR.value,
    ChapterType.NEXT_IN_SERIES.value,
    ChapterType.EXCERPT.value,
    ChapterType.CALL_TO_ACTION.value,
}

_GITIGNORE = """\
# Bibliogon: git tracks the source of the book, not build artifacts.
audiobook/
output/
temp/
.tmp/
*.epub
*.pdf
*.docx
"""


# --- Domain exceptions ---


class GitBackupError(Exception):
    """Base for git-backup failures."""


class RepoNotInitializedError(GitBackupError):
    """Operation requires an initialised repo but none exists."""


class NothingToCommitError(GitBackupError):
    """Commit requested but the working tree has no changes."""


# --- Public API ---


def repo_path(book_id: str) -> Path:
    """Return the on-disk path that hosts ``.git`` for this book."""
    return UPLOADS_ROOT / book_id


def is_initialized(book_id: str) -> bool:
    """True when a git repo already lives under ``uploads/{book_id}/.git``."""
    return (repo_path(book_id) / ".git").is_dir()


def init_repo(book_id: str, db: Session) -> dict[str, Any]:
    """Create ``.git`` for the book and record a first commit.

    Idempotent: if the repo already exists, returns its current status
    without touching anything.
    """
    book = _get_book_or_raise(book_id, db)
    path = repo_path(book_id)

    if is_initialized(book_id):
        return status(book_id, db)

    path.mkdir(parents=True, exist_ok=True)
    repo = git.Repo.init(path, initial_branch="main")

    _write_gitignore(path)
    _write_book_state(book, db, path)

    repo.git.add(A=True)
    author = _author_for(book)
    repo.index.commit(
        f"Initial commit: {book.title}",
        author=author,
        committer=author,
    )
    return status(book_id, db)


def commit(
    book_id: str,
    message: str,
    db: Session,
) -> dict[str, Any]:
    """Write current book state to the repo and commit it.

    Raises ``RepoNotInitializedError`` if ``init_repo`` has never run.
    Raises ``NothingToCommitError`` if the working tree is clean.
    """
    book = _get_book_or_raise(book_id, db)
    path = repo_path(book_id)

    if not is_initialized(book_id):
        raise RepoNotInitializedError(
            f"Book {book_id} has no git repo. Initialize first."
        )

    repo = git.Repo(path)
    _write_book_state(book, db, path)

    repo.git.add(A=True)

    if not repo.is_dirty(untracked_files=True) and not repo.index.diff("HEAD"):
        raise NothingToCommitError(
            "No changes to commit. Working tree matches last commit."
        )

    author = _author_for(book)
    commit_obj = repo.index.commit(
        message or f"Update: {book.title}",
        author=author,
        committer=author,
    )
    return {
        "hash": commit_obj.hexsha,
        "short_hash": commit_obj.hexsha[:7],
        "message": commit_obj.message.strip(),
        "author": f"{author.name} <{author.email}>",
        "date": commit_obj.committed_datetime.isoformat(),
    }


def log(book_id: str, db: Session, limit: int = 50) -> list[dict[str, Any]]:
    """Return up to ``limit`` most recent commits, newest first."""
    _get_book_or_raise(book_id, db)
    if not is_initialized(book_id):
        raise RepoNotInitializedError(
            f"Book {book_id} has no git repo."
        )

    repo = git.Repo(repo_path(book_id))
    entries: list[dict[str, Any]] = []
    for commit_obj in repo.iter_commits(max_count=limit):
        entries.append(
            {
                "hash": commit_obj.hexsha,
                "short_hash": commit_obj.hexsha[:7],
                "message": commit_obj.message.strip(),
                "author": f"{commit_obj.author.name} <{commit_obj.author.email}>",
                "date": commit_obj.committed_datetime.isoformat(),
            }
        )
    return entries


def status(book_id: str, db: Session) -> dict[str, Any]:
    """Return repo + working-tree status."""
    _get_book_or_raise(book_id, db)
    initialized = is_initialized(book_id)

    if not initialized:
        return {
            "initialized": False,
            "dirty": False,
            "uncommitted_files": 0,
            "head_hash": None,
            "head_short_hash": None,
        }

    repo = git.Repo(repo_path(book_id))
    uncommitted = _count_uncommitted(repo)
    head = repo.head.commit if repo.head.is_valid() else None

    return {
        "initialized": True,
        "dirty": uncommitted > 0,
        "uncommitted_files": uncommitted,
        "head_hash": head.hexsha if head else None,
        "head_short_hash": head.hexsha[:7] if head else None,
    }


# --- Internals ---


def _get_book_or_raise(book_id: str, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise GitBackupError(f"Book {book_id} not found")
    return book


def _author_for(book: Book) -> git.Actor:
    name = (book.author or "Bibliogon").strip() or "Bibliogon"
    # Local-only MVP: no real email. Use a stable placeholder that also
    # makes it obvious the commit was machine-generated.
    email = f"{_slugify(name)}@bibliogon.local"
    return git.Actor(name, email)


def _count_uncommitted(repo: git.Repo) -> int:
    """Best-effort count of uncommitted changes in the working tree.

    Counts: staged + unstaged diffs vs HEAD + untracked files. When HEAD
    does not exist yet (empty repo), counts all files as untracked.
    """
    if not repo.head.is_valid():
        return len(list(Path(repo.working_tree_dir).rglob("*")))
    staged = len(repo.index.diff("HEAD"))
    unstaged = len(repo.index.diff(None))
    untracked = len(repo.untracked_files)
    return staged + unstaged + untracked


def _write_gitignore(repo_dir: Path) -> None:
    gitignore = repo_dir / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(_GITIGNORE, encoding="utf-8")


def _write_book_state(book: Book, db: Session, repo_dir: Path) -> None:
    """Export book metadata and chapters to files inside ``repo_dir``.

    Layout (Phase 1):
        manuscript/front-matter/NN-<slug>.json
        manuscript/chapters/NN-<slug>.json
        manuscript/back-matter/NN-<slug>.json
        config/metadata.yaml
    """
    # Clear previous manuscript/ content so removed chapters drop from git.
    manuscript = repo_dir / "manuscript"
    for sub in ("front-matter", "chapters", "back-matter"):
        section_dir = manuscript / sub
        if section_dir.exists():
            for file in section_dir.glob("*.json"):
                file.unlink()
        section_dir.mkdir(parents=True, exist_ok=True)

    chapters = (
        db.query(Chapter)
        .filter(Chapter.book_id == book.id)
        .order_by(Chapter.position)
        .all()
    )

    for index, chapter in enumerate(chapters, start=1):
        section = _section_for(chapter.chapter_type)
        filename = f"{index:02d}-{_slugify(chapter.title or 'untitled')}.json"
        payload = {
            "id": chapter.id,
            "title": chapter.title,
            "chapter_type": chapter.chapter_type,
            "position": chapter.position,
            "content": _safe_load_json(chapter.content),
        }
        out_path = manuscript / section / filename
        out_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    config_dir = repo_dir / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "metadata.yaml").write_text(
        yaml.safe_dump(_book_metadata(book), sort_keys=True, allow_unicode=True),
        encoding="utf-8",
    )


def _section_for(chapter_type: str | None) -> str:
    if chapter_type in _FRONT_MATTER:
        return "front-matter"
    if chapter_type in _BACK_MATTER:
        return "back-matter"
    return "chapters"


def _book_metadata(book: Book) -> dict[str, Any]:
    fields = (
        "id",
        "title",
        "subtitle",
        "author",
        "language",
        "series",
        "series_index",
        "description",
        "genre",
        "edition",
        "publisher",
        "publisher_city",
        "publish_date",
        "isbn_ebook",
        "isbn_paperback",
        "isbn_hardcover",
        "asin_ebook",
        "asin_paperback",
        "asin_hardcover",
    )
    return {field: getattr(book, field, None) for field in fields}


def _safe_load_json(raw: str | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return raw


_slug_re = re.compile(r"[^a-z0-9]+")


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = (
        value.replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    value = _slug_re.sub("-", value).strip("-")
    return value or f"ch-{int(datetime.now().timestamp())}"
