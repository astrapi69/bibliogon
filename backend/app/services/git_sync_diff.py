"""PGS-03 three-way diff service for plugin-git-sync books.

A book that was imported via plugin-git-sync has a
:class:`GitSyncMapping` with the SHA of the commit it came from
(``last_imported_commit_sha``). A subsequent re-import or
"check for upstream changes" needs to know, per chapter:

- has the chapter changed in Bibliogon (DB) since the last import?
- has the chapter changed in the remote repository (current HEAD)?
- if both changed, is it a real conflict, or did both sides land
  the same edit?

This module produces that classification as a
:class:`ChapterDiff` per chapter. The frontend uses it to render
the resolve-conflict UI (PGS-03 Session 2).

Identity. Each chapter is identified by ``(section, slug)`` where
``section`` is one of ``front-matter | chapters | back-matter`` and
``slug`` is the lowercase ASCII slug of the H1 (or file stem when
no H1 present). Renames surface as delete-on-base + add-on-other
rather than a rename pair; resolving renames is a Phase 4 polish.

Boundary:
- Reading WBT chapter files from arbitrary git refs is done with
  ``git show <ref>:<path>`` so the caller does not need a fresh
  ``git checkout`` (cheap, side-effect-free, runs on the same
  ``local_clone_path`` the commit-to-repo flow already uses).
- Converting DB chapters to comparable markdown reuses
  ``bibliogon_export.tiptap_to_md.tiptap_to_markdown`` so the
  diff sees exactly what a future commit-to-repo would write.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from sqlalchemy.orm import Session

from app.models import Chapter, GitSyncMapping

logger = logging.getLogger(__name__)


Section = Literal["front-matter", "chapters", "back-matter"]
Classification = Literal[
    "unchanged",
    "remote_changed",
    "local_changed",
    "both_changed",
    "remote_added",
    "local_added",
    "remote_removed",
    "local_removed",
]


@dataclass(frozen=True)
class ChapterIdentity:
    section: Section
    slug: str

    def key(self) -> str:
        return f"{self.section}/{self.slug}"


@dataclass
class ChapterDiff:
    identity: ChapterIdentity
    title: str
    classification: Classification
    base_md: str | None
    local_md: str | None
    remote_md: str | None
    db_chapter_id: str | None  # set when the chapter exists in the local DB

    @property
    def is_conflict(self) -> bool:
        return self.classification == "both_changed"


# --- public surface ---


def diff_book(db: Session, *, book_id: str) -> list[ChapterDiff]:
    """Run the three-way diff for the book's GitSyncMapping.

    Raises :class:`MappingNotFoundError` /
    :class:`CloneMissingError` from
    :mod:`app.services.git_sync_commit` when the precondition
    fails - those are the same conditions the commit-to-repo
    endpoint already checks.
    """
    from app.services.git_sync_commit import (  # local import to keep cycles tidy
        CloneMissingError,
        MappingNotFoundError,
    )

    mapping = db.get(GitSyncMapping, book_id)
    if mapping is None:
        raise MappingNotFoundError(f"Book {book_id} was not imported via plugin-git-sync.")

    clone_path = Path(mapping.local_clone_path)
    if not clone_path.is_dir() or not (clone_path / ".git").is_dir():
        raise CloneMissingError(
            f"Local clone {clone_path} for book {book_id} is missing or invalid."
        )

    base_chapters = _read_wbt_at_ref(clone_path, mapping.last_imported_commit_sha)
    remote_chapters = _read_wbt_at_ref(clone_path, mapping.branch)
    local_chapters = _read_local_chapters(db, book_id)

    return _classify(base_chapters, local_chapters, remote_chapters)


# --- WBT reading at arbitrary git refs ---


_WBT_SECTION_DIRS: tuple[Section, ...] = ("front-matter", "chapters", "back-matter")


def _read_wbt_at_ref(clone_path: Path, ref: str) -> dict[ChapterIdentity, tuple[str, str]]:
    """Return ``{identity: (title, markdown)}`` for chapters at ref.

    Uses ``git ls-tree`` + ``git show`` to read files without
    touching the working tree. Returns an empty dict if the ref
    is unknown (treats it as "no chapters" - the caller must
    decide whether that is a hard error or a degenerate case).
    """
    import git

    try:
        repo = git.Repo(str(clone_path))
        # Resolve the ref to a commit so subsequent ``show`` calls
        # are deterministic (a moving branch could shift between
        # ls-tree and show otherwise).
        commit = repo.commit(ref)
    except Exception:
        logger.warning(
            "git-sync diff: ref %r not resolvable in %s; treating as empty.",
            ref,
            clone_path,
        )
        return {}

    out: dict[ChapterIdentity, tuple[str, str]] = {}
    for section in _WBT_SECTION_DIRS:
        prefix = f"manuscript/{section}/"
        try:
            tree = repo.git.ls_tree("-r", "--name-only", commit.hexsha, prefix).splitlines()
        except git.GitCommandError:
            continue
        for path in tree:
            if not path.endswith(".md"):
                continue
            try:
                content = repo.git.show(f"{commit.hexsha}:{path}")
            except git.GitCommandError:
                continue
            stem = Path(path).stem
            title = _chapter_title(content, stem)
            slug = _slugify(title)
            identity = ChapterIdentity(section=section, slug=slug)
            # If two chapters somehow collide on (section, slug) keep
            # the first encountered. Worst case the second surfaces
            # as a phantom delete; better than silent overwrite.
            out.setdefault(identity, (title, content))
    return out


# --- DB-side projection ---


_FRONT_MATTER_TYPES = {
    "toc",
    "dedication",
    "epigraph",
    "preface",
    "foreword",
    "prologue",
    "introduction",
    "half_title",
    "title_page",
    "copyright",
    "imprint",
}
_BACK_MATTER_TYPES = {
    "epilogue",
    "afterword",
    "final_thoughts",
    "about_author",
    "acknowledgments",
    "appendix",
    "bibliography",
    "endnotes",
    "glossary",
    "index",
    "also_by_author",
    "next_in_series",
    "excerpt",
    "call_to_action",
    "conclusion",
}


def _section_for(chapter_type: str) -> Section:
    if chapter_type in _FRONT_MATTER_TYPES:
        return "front-matter"
    if chapter_type in _BACK_MATTER_TYPES:
        return "back-matter"
    return "chapters"


def _read_local_chapters(db: Session, book_id: str) -> dict[ChapterIdentity, tuple[str, str, str]]:
    """Return ``{identity: (title, markdown, db_chapter_id)}``.

    Conversion to markdown reuses the same path the commit-to-repo
    flow uses, so a chapter that round-trips through Bibliogon
    without edits diffs as ``unchanged`` against its imported base.
    """
    from bibliogon_export.tiptap_to_md import (  # type: ignore[import-untyped]
        tiptap_to_markdown,
    )

    rows = db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.position).all()
    out: dict[ChapterIdentity, tuple[str, str, str]] = {}
    for ch in rows:
        try:
            doc = json.loads(ch.content) if ch.content else {}
            md_body = tiptap_to_markdown(doc) if isinstance(doc, dict) else ""
        except (json.JSONDecodeError, TypeError, ValueError):
            md_body = ""
        # Match what the scaffolder writes: H1 of the chapter title
        # at the top, then the body. Without this the diff would
        # always classify as "local_changed" because the on-disk
        # files carry the H1 but the converted DB body does not.
        markdown = f"# {ch.title}\n\n{md_body.lstrip()}".rstrip() + "\n"
        identity = ChapterIdentity(
            section=_section_for(ch.chapter_type),
            slug=_slugify(ch.title),
        )
        out.setdefault(identity, (ch.title, markdown, ch.id))
    return out


# --- classification ---


def _classify(
    base: dict[ChapterIdentity, tuple[str, str]],
    local: dict[ChapterIdentity, tuple[str, str, str]],
    remote: dict[ChapterIdentity, tuple[str, str]],
) -> list[ChapterDiff]:
    """Three-way diff over the union of identities.

    Pure function - safe to unit-test without git or a DB.
    """
    all_identities = set(base) | set(local) | set(remote)
    out: list[ChapterDiff] = []
    for identity in sorted(all_identities, key=lambda i: i.key()):
        b = base.get(identity)
        L = local.get(identity)
        r = remote.get(identity)
        title = (L[0] if L else None) or (r[0] if r else None) or (b[0] if b else identity.slug)
        base_md = b[1] if b else None
        remote_md = r[1] if r else None
        local_md = L[1] if L else None
        db_id = L[2] if L else None

        classification: Classification
        if base_md is None:
            # Chapter didn't exist at the last import. Either side
            # may have introduced it.
            if local_md is not None and remote_md is not None:
                classification = (
                    "unchanged" if _normalize(local_md) == _normalize(remote_md) else "both_changed"
                )
            elif remote_md is not None:
                classification = "remote_added"
            elif local_md is not None:
                classification = "local_added"
            else:
                # Identity in `all_identities` but absent on every side
                # is impossible by construction; skip defensively.
                continue
        else:
            local_changed = local_md is None or _normalize(local_md) != _normalize(base_md)
            remote_changed = remote_md is None or _normalize(remote_md) != _normalize(base_md)
            if local_md is None and remote_md is None:
                # Both sides removed - unchanged in spirit, skip
                # surfacing. The chapter is gone everywhere.
                continue
            if local_md is None:
                classification = "local_removed"
            elif remote_md is None:
                classification = "remote_removed"
            elif local_changed and remote_changed:
                classification = (
                    "unchanged" if _normalize(local_md) == _normalize(remote_md) else "both_changed"
                )
            elif local_changed:
                classification = "local_changed"
            elif remote_changed:
                classification = "remote_changed"
            else:
                classification = "unchanged"

        out.append(
            ChapterDiff(
                identity=identity,
                title=title,
                classification=classification,
                base_md=base_md,
                local_md=local_md,
                remote_md=remote_md,
                db_chapter_id=db_id,
            )
        )
    return out


# --- text helpers ---


def _normalize(markdown: str) -> str:
    """Whitespace-tolerant comparison key.

    Strips trailing whitespace per line, collapses runs of blank
    lines, and trims leading/trailing whitespace. So the same
    chapter that round-trips through Bibliogon (which may add or
    drop a final newline) does not register as "changed".
    """
    lines = [ln.rstrip() for ln in markdown.splitlines()]
    collapsed: list[str] = []
    blank_run = 0
    for ln in lines:
        if ln == "":
            blank_run += 1
            if blank_run > 1:
                continue
        else:
            blank_run = 0
        collapsed.append(ln)
    return "\n".join(collapsed).strip()


_SLUG_NON_WORD = re.compile(r"[^a-z0-9]+")


def _slugify(text: str) -> str:
    """Lowercase ASCII slug, hyphen-separated. Diacritics stripped."""
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", text)
    ascii_str = decomposed.encode("ascii", "ignore").decode("ascii")
    slug = _SLUG_NON_WORD.sub("-", ascii_str.lower()).strip("-")
    return slug or "untitled"


def _chapter_title(content: str, fallback: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return stripped[2:].strip()
    return fallback.replace("-", " ").strip().title() or "Untitled"
