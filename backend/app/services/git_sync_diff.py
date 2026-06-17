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
no H1 present). PGS-03-FU-01 collapses removed + added pairs with
identical bodies into a single ``renamed_remote`` / ``renamed_local``
row carrying the old identity in ``ChapterDiff.rename_from``; bodies
must match exactly after H1 strip + ``_normalize`` to pair.

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
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from sqlalchemy.orm import Session

from app.models import Chapter, GitSyncMapping
from app.services.git_sync_markdown_utils import (
    _chapter_title,
    _normalize,
    _slugify,
    _strip_h1,
    build_conflict_markdown,
)

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
    # PGS-03-FU-01: file moved between identities with the body
    # unchanged. The new identity is the one shown; ``rename_from``
    # carries the old identity so the UI can render
    # "renamed from X to Y" instead of a confusing remove + add pair.
    "renamed_remote",
    "renamed_local",
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
    # PGS-03-FU-01: when classification is ``renamed_remote`` /
    # ``renamed_local`` this points at the OLD identity the file
    # used to live at. None for non-rename rows.
    rename_from: ChapterIdentity | None = None

    @property
    def is_conflict(self) -> bool:
        return self.classification == "both_changed"

    @property
    def is_rename(self) -> bool:
        return self.classification in ("renamed_remote", "renamed_local")


# --- public surface ---


def apply_resolutions(  # noqa: C901  # Legacy, tracked in clean-code-audit
    db: Session,
    *,
    book_id: str,
    resolutions: list[dict],
) -> dict[str, int]:
    """Apply per-chapter resolutions and advance the mapping cursor.

    Each resolution is ``{section, slug, action}`` where ``action``
    is one of:
    - ``keep_local`` - DB stays as-is. No-op.
    - ``take_remote`` - DB chapter is overwritten with the remote
      markdown (converted to HTML via the same path WBT import
      uses). For ``remote_added`` -> creates a new Chapter row.
      For ``remote_removed`` -> deletes the local Chapter row.
    - ``mark_conflict`` - PGS-03-FU-01: only valid for chapters
      classified as ``both_changed``. The DB chapter is rewritten
      with both versions inside git-style conflict markers
      (``<<<<<<< Bibliogon`` / ``=======`` / ``>>>>>>> Repository``)
      so the user can resolve in the editor by hand. Other
      classifications fall through to ``skipped``.

    After every requested resolution is applied the mapping's
    ``last_imported_commit_sha`` is bumped to the current branch
    HEAD so the next diff doesn't re-surface the same set of
    changes.

    Returns counts ``{"updated", "created", "deleted", "marked",
    "skipped"}``.
    Raises :class:`MappingNotFoundError` /
    :class:`CloneMissingError` (re-exported by
    ``app.services.git_sync_commit``) on the usual preconditions.
    """
    from app.models import Book
    from app.models import Chapter as ChapterModel
    from app.services.backup.markdown_utils import md_to_html, sanitize_import_markdown
    from app.services.git_sync_commit import (
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

    book = db.get(Book, book_id)
    language = (book.language if book else None) or "de"

    diffs = {(d.identity.section, d.identity.slug): d for d in diff_book(db, book_id=book_id)}
    counts = {
        "updated": 0,
        "created": 0,
        "deleted": 0,
        "marked": 0,
        "renamed": 0,
        "skipped": 0,
    }

    for raw in resolutions:
        section_raw = raw.get("section")
        slug_raw = raw.get("slug")
        action = raw.get("action")
        if (
            not isinstance(section_raw, str)
            or not isinstance(slug_raw, str)
            or action not in ("keep_local", "take_remote", "mark_conflict")
        ):
            counts["skipped"] += 1
            continue
        section: Section
        if section_raw == "front-matter":
            section = "front-matter"
        elif section_raw == "back-matter":
            section = "back-matter"
        elif section_raw == "chapters":
            section = "chapters"
        else:
            counts["skipped"] += 1
            continue
        slug = slug_raw
        if action == "keep_local":
            counts["skipped"] += 1
            continue

        diff = diffs.get((section, slug))
        if diff is None:
            counts["skipped"] += 1
            continue

        if diff.is_rename and action == "take_remote":
            # PGS-03-FU-01: a renamed chapter has identical body on
            # both sides; the only thing to do is rename the local
            # title (and let the next commit-to-repo move the file
            # accordingly). Body is left untouched.
            if not diff.db_chapter_id:
                counts["skipped"] += 1
                continue
            row = db.get(ChapterModel, diff.db_chapter_id)
            if row is None:
                counts["skipped"] += 1
                continue
            # Best-effort title recovery from whichever side carries
            # the new identity's H1.
            md_for_title = (
                diff.remote_md if diff.classification == "renamed_remote" else diff.local_md
            )
            _, new_title = _strip_h1(md_for_title or "", fallback_title=diff.title)
            row.title = new_title
            counts["renamed"] += 1
            continue

        if action == "mark_conflict":
            if (
                diff.classification != "both_changed"
                or not diff.db_chapter_id
                or diff.local_md is None
                or diff.remote_md is None
            ):
                counts["skipped"] += 1
                continue
            row = db.get(ChapterModel, diff.db_chapter_id)
            if row is None:
                counts["skipped"] += 1
                continue
            local_body, _ = _strip_h1(diff.local_md, fallback_title=diff.title)
            remote_body, _ = _strip_h1(diff.remote_md, fallback_title=diff.title)
            merged = build_conflict_markdown(local_body=local_body, remote_body=remote_body)
            sanitized = sanitize_import_markdown(merged.strip(), language)
            row.content = md_to_html(sanitized)
            counts["marked"] += 1
            continue

        if diff.classification == "remote_removed":
            if diff.db_chapter_id:
                row = db.get(ChapterModel, diff.db_chapter_id)
                if row is not None:
                    db.delete(row)
                    counts["deleted"] += 1
            continue

        if diff.remote_md is None:
            counts["skipped"] += 1
            continue

        body_md, title = _strip_h1(diff.remote_md, fallback_title=diff.title)
        sanitized = sanitize_import_markdown(body_md.strip(), language)
        html = md_to_html(sanitized)

        if diff.db_chapter_id:
            row = db.get(ChapterModel, diff.db_chapter_id)
            if row is None:
                counts["skipped"] += 1
                continue
            row.title = title
            row.content = html
            counts["updated"] += 1
        else:
            # remote_added (or local_removed when user took remote).
            position = _next_position(db, book_id)
            chapter_type = _chapter_type_from_slug(diff.identity.section, slug)
            db.add(
                ChapterModel(
                    book_id=book_id,
                    title=title,
                    content=html,
                    position=position,
                    chapter_type=chapter_type,
                )
            )
            counts["created"] += 1

    # Advance the mapping cursor to the current branch HEAD so a
    # subsequent diff stops re-reporting the same changes.
    new_head = _resolve_branch_head(clone_path, mapping.branch)
    if new_head:
        mapping.last_imported_commit_sha = new_head
        db.add(mapping)
    db.commit()

    return counts


def _collapse_renames(diffs: list[ChapterDiff]) -> list[ChapterDiff]:
    """PGS-03-FU-01: pair ``*_removed`` + ``*_added`` rows with matching
    bodies into a single ``renamed`` row.

    Two pairing rules:
    - ``remote_removed`` (file disappeared upstream) + ``remote_added``
      (file appeared upstream) with identical body == ``renamed_remote``
      (the remote moved the chapter; local kept the old name).
    - ``local_removed`` + ``local_added`` with identical body ==
      ``renamed_local`` (the user renamed locally; remote kept the old
      name).

    Body comparison uses :func:`_normalize` and STRIPS the H1 line so
    a renamed chapter still pairs even though its title (and therefore
    H1) changed. Only exact body matches pair; near-misses stay as
    independent removed + added rows so the user sees the real diff.
    """
    by_class: dict[str, list[ChapterDiff]] = {}
    for d in diffs:
        by_class.setdefault(d.classification, []).append(d)

    consumed: set[tuple[Section, str]] = set()
    renames: list[ChapterDiff] = []

    for removed_kind, added_kind, classification in (
        ("remote_removed", "remote_added", "renamed_remote"),
        ("local_removed", "local_added", "renamed_local"),
    ):
        removed_pool = by_class.get(removed_kind, [])
        added_pool = by_class.get(added_kind, [])
        for removed in removed_pool:
            removed_body_md = (
                removed.local_md if removed_kind == "remote_removed" else removed.base_md
            )
            removed_body = _strip_h1(removed_body_md or "", fallback_title="")[0]
            removed_key = _normalize(removed_body)
            if not removed_key:
                continue
            match: ChapterDiff | None = None
            for candidate in added_pool:
                if (candidate.identity.section, candidate.identity.slug) in consumed:
                    continue
                added_body_md = (
                    candidate.remote_md if added_kind == "remote_added" else candidate.local_md
                )
                added_body = _strip_h1(added_body_md or "", fallback_title="")[0]
                if _normalize(added_body) == removed_key:
                    match = candidate
                    break
            if match is None:
                continue
            consumed.add((removed.identity.section, removed.identity.slug))
            consumed.add((match.identity.section, match.identity.slug))
            renames.append(
                ChapterDiff(
                    identity=match.identity,
                    title=match.title,
                    classification=classification,  # type: ignore[arg-type]
                    base_md=removed.base_md,
                    local_md=match.local_md if added_kind == "local_added" else removed.local_md,
                    remote_md=match.remote_md
                    if added_kind == "remote_added"
                    else removed.remote_md,
                    db_chapter_id=removed.db_chapter_id or match.db_chapter_id,
                    rename_from=removed.identity,
                )
            )

    survivors = [d for d in diffs if (d.identity.section, d.identity.slug) not in consumed]
    out = survivors + renames
    out.sort(key=lambda d: d.identity.key())
    return out


def _next_position(db: Session, book_id: str) -> int:
    from app.models import Chapter as ChapterModel

    rows = db.query(ChapterModel.position).filter(ChapterModel.book_id == book_id).all()
    return (max((r[0] for r in rows), default=-1)) + 1


def _chapter_type_from_slug(section: Section, slug: str) -> str:
    """Best-effort chapter-type mapping for newly-added chapters.

    Front/back-matter sections use the slug verbatim if it matches
    a known ChapterType value; otherwise fall back to a sane
    section-default. Ordinary ``chapters/`` entries always become
    ``chapter``.
    """
    if section == "chapters":
        return "chapter"
    if section == "front-matter":
        return slug if slug in _FRONT_MATTER_TYPES else "preface"
    return slug if slug in _BACK_MATTER_TYPES else "afterword"


def _resolve_branch_head(clone_path: Path, branch: str) -> str | None:
    import git

    try:
        repo = git.Repo(str(clone_path))
        return repo.commit(branch).hexsha
    except Exception:
        logger.warning("git-sync apply: branch %r not resolvable in %s", branch, clone_path)
        return None


class RemoteUnreachableError(Exception):
    """The git remote could not be fetched (network or auth failure).

    Carries a stable ``reason`` slug (``auth`` / ``network`` /
    ``unknown``) so the router can map it to an HTTP status and a
    useful message without re-parsing git stderr in the UI. Distinct
    from "the remote simply has no new commits", which is not an error.
    """

    def __init__(self, reason: str, message: str) -> None:
        self.reason = reason
        super().__init__(message)


def _classify_fetch_stderr(stderr: str) -> str:
    """Map a ``git fetch`` stderr blob to a stable reason slug."""
    s = stderr.lower()
    if (
        "authentication" in s
        or "could not read username" in s
        or "permission denied" in s
        or "invalid username or password" in s
    ):
        return "auth"
    if (
        "could not resolve host" in s
        or "could not read from remote" in s
        or "unable to access" in s
        or "failed to connect" in s
        or "connection refused" in s
        or "timed out" in s
        or "network" in s
        or "repository not found" in s
        or "does not appear to be a git repository" in s
        or "not a git repository" in s
    ):
        return "network"
    return "unknown"


def fetch_remote_updates(db: Session, *, book_id: str) -> bool:
    """Fetch ``origin`` and fast-forward the local clone's branch.

    The three-way diff compares the DB against the local clone's branch
    ref, which only reflects upstream after a fetch. Without this step a
    clone stays frozen at import time, so chapters newly pushed to the
    remote are invisible (the diff sees ``base == remote`` and reports no
    changes). This fetches the mapped branch and fast-forwards the local
    branch to the freshly fetched tip when it is a true fast-forward,
    leaving a diverged or locally-ahead clone untouched so the diff can
    surface the divergence.

    Public repositories fetch without credentials; a per-book PAT is
    injected via :mod:`app.services.git_credentials` only when one is
    configured, so the missing-HTTPS-token case still works for public
    repos.

    Args:
        db: Active database session.
        book_id: Book whose ``GitSyncMapping`` points at the clone.

    Returns:
        ``True`` when the local branch advanced to a newer tip, ``False``
        when nothing changed (already current, diverged/locally-ahead, no
        ``origin`` remote, or the branch does not exist upstream yet).

    Raises:
        MappingNotFoundError: The book has no ``GitSyncMapping``.
        CloneMissingError: The persisted clone is missing or invalid.
        RemoteUnreachableError: The remote could not be fetched
            (network/auth), as opposed to merely having no new commits.
    """
    import git

    from app.services import git_credentials
    from app.services.git_sync_commit import CloneMissingError, MappingNotFoundError

    mapping = db.get(GitSyncMapping, book_id)
    if mapping is None:
        raise MappingNotFoundError(f"Book {book_id} was not imported via plugin-git-sync.")
    clone_path = Path(mapping.local_clone_path)
    if not clone_path.is_dir() or not (clone_path / ".git").is_dir():
        raise CloneMissingError(
            f"Local clone {clone_path} for book {book_id} is missing or invalid."
        )

    repo = git.Repo(str(clone_path))
    if "origin" not in [r.name for r in repo.remotes]:
        return False

    branch = mapping.branch
    origin = repo.remotes.origin
    original_url = next(iter(origin.urls), "")
    auth_url = git_credentials.inject_pat_into_url(original_url, book_id)
    ssh = git_credentials.ssh_env(original_url)
    try:
        if auth_url != original_url:
            origin.set_url(auth_url)
        if ssh:
            repo.git.update_environment(**ssh)
        try:
            origin.fetch(branch)
        except git.GitCommandError as exc:
            stderr = (exc.stderr or "").strip() or str(exc)
            if "couldn't find remote ref" in stderr.lower():
                # The branch does not exist upstream yet (e.g. an empty
                # remote). Nothing to pull, but not a fetch failure.
                return False
            raise RemoteUnreachableError(_classify_fetch_stderr(stderr), stderr) from exc
    finally:
        if auth_url != original_url:
            origin.set_url(original_url)

    before = str(repo.git.rev_parse(branch))
    try:
        repo.git.merge(f"origin/{branch}", "--ff-only")
    except git.GitCommandError:
        # Local ref is already current, ahead, or diverged - keep it as
        # is; the three-way diff classifies the divergence.
        return False
    after = str(repo.git.rev_parse(branch))
    return before != after


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

    return _collapse_renames(_classify(base_chapters, local_chapters, remote_chapters))


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
