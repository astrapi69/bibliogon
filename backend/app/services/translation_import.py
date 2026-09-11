"""PGS-04 multi-branch translation-group import.

Clones a git repository once, enumerates the branches that match
the spec (``main`` + ``main-XX``), and creates one Bibliogon
book per branch with a shared
:attr:`Book.translation_group_id`. Each book gets its own
persistent clone under ``uploads/git-sync/{book_id}/repo`` so the
PGS-02 commit-to-repo flow keeps working unchanged.

Boundary:
- Reuses the existing WBT importer
  (:func:`app.services.backup.project_import._import_project_root`)
  per branch checkout. No reimplementation of WBT parsing here.
- Per-branch language is resolved through
  :func:`app.services.translation_groups.derive_language` so the
  ``main-XX`` rule + ``metadata.yaml`` fallback live in one place.
- Per-book persistent clones are cheap copies (``shutil.copytree``)
  of the once-cloned staging repo with the branch already
  checked out. Disk cost: ``N branches * repo size``; acceptable
  for the MVP. Sharing git objects across the per-book clones
  via ``--reference`` is a future optimization.
"""

from __future__ import annotations

import logging
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Book, BookImportSource, GitSyncMapping
from app.paths import get_upload_dir
from app.services.translation_groups import (
    _BRANCH_LANG_RE,
    derive_language,
    link_books,
)

#: ``BookImportSource.source_type`` for books imported from a git
#: branch. Distinct from the WBT handler's content-signature rows so
#: the two duplicate checks never shadow each other (#762).
_GIT_SOURCE_TYPE = "git"

logger = logging.getLogger(__name__)


# Persistent clone area lives next to the asset store (mirrors PGS-02).
_GIT_SYNC_ROOT_NAME = "git-sync"


class TranslationImportError(Exception):
    """Base for multi-branch import failures."""


class CloneFailedError(TranslationImportError):
    """The initial clone of ``git_url`` failed."""


class NoMatchingBranchesError(TranslationImportError):
    """Repository has no ``main`` and no ``main-XX`` branches."""


class _NoWbtLayoutError(TranslationImportError):
    """Internal: branch checkout has no ``config/metadata.yaml``.

    Distinguished from a generic import failure so the caller can
    record it under the ``no_wbt_layout`` reason slug instead of
    ``import_failed``. Not exported - the public surface uses the
    ``SkippedBranch`` payload instead.
    """


@dataclass
class ImportedBook:
    book_id: str
    branch: str
    language: str | None
    title: str


@dataclass
class SkippedBranch:
    """PGS-04-FU-01: a branch the importer could not turn into a book.

    Surfaces in the multi-branch import payload so the wizard can
    show the user which translations need attention instead of
    silently swallowing them. ``reason`` is a stable slug; ``detail``
    is the (truncated) human-readable message for diagnostics.
    """

    branch: str
    #: Stable slug. ``no_wbt_layout`` = branch lacks
    #: ``config/metadata.yaml``. ``import_failed`` = the WBT importer
    #: raised (typically incompatible chapter structure or missing
    #: required metadata fields).
    reason: str
    detail: str


@dataclass
class MultiBranchResult:
    translation_group_id: str | None
    books: list[ImportedBook]
    skipped: list[SkippedBranch]


def git_source_identifier(git_url: str, branch: str) -> str:
    """Branch-aware ``BookImportSource.source_identifier`` for a git import.

    Uses the ``git:<normalized>`` shape the model already documents,
    extended with ``#<branch>`` so the N books of a translation group
    stay distinguishable (#762). Normalisation folds the ssh and https
    spellings of one repository together and drops a trailing ``.git``
    or slash, so re-importing the same repo through the other URL form
    is still recognised as a duplicate. Lowercased: GitHub treats
    owner/repo case-insensitively, so ``Die-Geister-der-Zeit`` and
    ``die-geister-der-zeit`` must not import twice.

    Args:
        git_url: Remote URL or local path the import cloned from.
        branch: The branch this particular book came from.

    Returns:
        For example ``git:github.com/astrapi69/some-book#main-de``.

    Example:
        >>> git_source_identifier("git@github.com:a/b.git", "main")
        'git:github.com/a/b#main'
    """
    normalized = git_url.strip().rstrip("/")
    normalized = re.sub(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://", "", normalized)
    host_part = normalized.split("/", 1)[0]
    if "@" in host_part:
        # scp-like ssh form: user@host:owner/repo
        normalized = normalized.split("@", 1)[1].replace(":", "/", 1)
    normalized = re.sub(r"\.git$", "", normalized)
    return f"git:{normalized.lower().rstrip('/')}#{branch}"


def _existing_book_for(db: Session, *, git_url: str, branch: str) -> str | None:
    """Book id previously imported from this (url, branch), if any."""
    row = (
        db.query(BookImportSource)
        .filter(
            BookImportSource.source_identifier == git_source_identifier(git_url, branch),
            BookImportSource.source_type == _GIT_SOURCE_TYPE,
        )
        .first()
    )
    if row is None:
        return None
    book = db.get(Book, row.book_id)
    if book is None or book.deleted_at is not None:
        # Stale row (book hard-deleted or trashed): treat as not imported
        # so the user can re-import, and drop the orphan.
        db.delete(row)
        db.commit()
        return None
    return row.book_id


# --- public surface ---


def import_translation_group(
    db: Session,
    *,
    git_url: str,
    uploads_dir: Path = get_upload_dir(),
) -> MultiBranchResult:
    """Clone ``git_url`` once, import every matching branch as a book.

    Returns the new ``translation_group_id``, a row per imported
    book, and a list of branches that could not be imported (with
    a stable reason slug + diagnostic detail). Raises
    :class:`CloneFailedError` / :class:`NoMatchingBranchesError` on
    the obvious upstream problems; per-branch failures land in
    ``skipped`` rather than aborting the whole import (one broken
    branch must not lose the others). PGS-04-FU-01: ``skipped`` was
    previously a silent log; the wizard now surfaces it.
    """
    import git

    with tempfile.TemporaryDirectory(prefix="translation-import-") as tmp:
        staging = Path(tmp) / "repo"
        try:
            repo = git.Repo.clone_from(git_url, str(staging))
        except git.GitCommandError as exc:
            raise CloneFailedError(f"clone failed: {exc}") from exc

        origin_url = _canonical_remote_url(git_url, repo)
        branches = _enumerate_translation_branches(repo)
        if not branches:
            raise NoMatchingBranchesError(
                "Repository has no 'main' or 'main-XX' branches; "
                "translation-group import does not apply."
            )

        imported: list[ImportedBook] = []
        skipped: list[SkippedBranch] = []
        for branch in branches:
            # #762: a branch already imported from this repo resolves to
            # its existing book instead of being cloned into a duplicate.
            # The group is still returned in full, so the caller keeps a
            # complete picture (and re-linking stays idempotent).
            existing_id = _existing_book_for(db, git_url=origin_url, branch=branch)
            if existing_id is not None:
                existing_book = db.get(Book, existing_id)
                logger.info(
                    "translation-import: branch %r already imported as %s; reusing.",
                    branch,
                    existing_id,
                )
                imported.append(
                    ImportedBook(
                        book_id=existing_id,
                        branch=branch,
                        language=existing_book.language if existing_book else None,
                        title=existing_book.title if existing_book else "",
                    )
                )
                continue
            try:
                book = _import_one_branch(
                    db,
                    repo=repo,
                    staging=staging,
                    branch=branch,
                    uploads_dir=uploads_dir,
                    origin_url=origin_url,
                )
            except _NoWbtLayoutError as exc:
                logger.warning(
                    "translation-import: branch %r has no WBT layout; skipping.",
                    branch,
                )
                skipped.append(
                    SkippedBranch(
                        branch=branch,
                        reason="no_wbt_layout",
                        detail=str(exc)[:500],
                    )
                )
                continue
            except Exception as exc:
                logger.exception(
                    "translation-import: branch %r failed; continuing.",
                    branch,
                )
                skipped.append(
                    SkippedBranch(
                        branch=branch,
                        reason="import_failed",
                        detail=f"{type(exc).__name__}: {exc}"[:500],
                    )
                )
                continue
            if book is not None:
                imported.append(book)

    group_id: str | None = None
    if len(imported) >= 2:
        group_id = link_books(db, book_ids=[b.book_id for b in imported])

    return MultiBranchResult(translation_group_id=group_id, books=imported, skipped=skipped)


# --- internals ---


def _enumerate_translation_branches(repo) -> list[str]:
    """Return the local branch names that match the PGS-04 spec.

    Walks remote-tracking refs (``refs/remotes/origin/*``) and
    creates a local tracking branch per match so subsequent
    ``checkout`` works without ``git fetch`` gymnastics. Order
    is alphabetical so the eventual book list is deterministic.
    """
    import git

    candidates: list[str] = []
    seen: set[str] = set()

    # Local heads first.
    for head in repo.heads:
        name = head.name
        if name == "main" or _BRANCH_LANG_RE.match(name):
            if name not in seen:
                candidates.append(name)
                seen.add(name)

    # Remote-tracking branches that are not yet local.
    if "origin" in [r.name for r in repo.remotes]:
        for ref in repo.remotes.origin.refs:
            full = ref.name  # e.g. "origin/main-de"
            if "/" not in full:
                continue
            short = full.rsplit("/", 1)[-1]
            if short == "HEAD" or short in seen:
                continue
            if short != "main" and not _BRANCH_LANG_RE.match(short):
                continue
            try:
                head = repo.create_head(short, ref)
                head.set_tracking_branch(ref)
            except git.GitCommandError:
                # If creation fails (e.g. ref name conflict), fall
                # back to using the remote ref directly via checkout.
                pass
            candidates.append(short)
            seen.add(short)

    return sorted(candidates)


def _import_one_branch(
    db: Session,
    *,
    repo,
    staging: Path,
    branch: str,
    uploads_dir: Path,
    origin_url: str,
) -> ImportedBook | None:
    """Checkout ``branch`` in the staging clone, import via the WBT
    handler, then persist a per-book clone under
    ``uploads/git-sync/{book_id}/repo``.

    Returns ``None`` when the branch has no WBT layout (handled
    silently so a non-book branch in a mixed repo doesn't kill
    the whole group import).
    """
    from app.services.backup.project_import import _import_project_root

    repo.git.checkout(branch)

    # WBT importer expects a project root (the dir holding
    # ``config/metadata.yaml``). Raised so the caller records this
    # under the ``no_wbt_layout`` reason instead of as a generic
    # import_failed (the user wants to see "this branch has no
    # book in it" distinctly from "the importer crashed").
    project_root = staging
    if not (project_root / "config" / "metadata.yaml").is_file():
        raise _NoWbtLayoutError(f"branch {branch!r}: missing config/metadata.yaml")

    result = _import_project_root(db, project_root)
    book_id = str(result["book_id"])

    book = db.get(Book, book_id)
    metadata_lang = book.language if book else None
    resolved_lang = derive_language(branch, metadata_lang)
    if book is not None and resolved_lang and book.language != resolved_lang:
        book.language = resolved_lang
        db.add(book)
        db.commit()

    target_dir = uploads_dir / _GIT_SYNC_ROOT_NAME / book_id / "repo"
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(staging, target_dir)

    head_sha = repo.head.commit.hexsha
    db.add(
        GitSyncMapping(
            book_id=book_id,
            repo_url=origin_url,
            branch=branch,
            last_imported_commit_sha=head_sha,
            local_clone_path=str(target_dir),
        )
    )
    # #762: without this row nothing recognised an already-imported
    # branch, so every re-run recreated the entire group.
    db.add(
        BookImportSource(
            book_id=book_id,
            source_identifier=git_source_identifier(origin_url, branch),
            source_type=_GIT_SOURCE_TYPE,
            format_name="wbt-zip",
        )
    )
    db.commit()

    return ImportedBook(
        book_id=book_id,
        branch=branch,
        language=resolved_lang,
        title=(book.title if book else ""),
    )


def _canonical_remote_url(git_url: str, repo) -> str:
    """Resolve the URL that identifies the SOURCE repository.

    The WBT handler calls this service with a local staging clone as
    ``git_url``, so the fresh clone's own ``origin`` points at that
    throwaway path (``/tmp/bibliogon_import_staging/imp-<uuid>/...``).
    Persisting that would make ``GitSyncMapping.repo_url`` dead on
    arrival and the #762 import identifier unrecognisable on the next
    run, since the staging path carries a new UUID each time.

    Resolution order: the source repo's own ``origin`` (the real
    remote, when ``git_url`` is a local clone) -> the fresh clone's
    ``origin`` -> the given URL verbatim (a genuine remote URL, or a
    local repo with no origin at all).

    Args:
        git_url: What the caller asked to import (remote URL or path).
        repo: The freshly created clone.

    Returns:
        The most durable URL available for this import.
    """
    source_path = Path(git_url)
    if (source_path / ".git").is_dir() or (source_path / "HEAD").is_file():
        try:
            import git as gitpython

            source_origin = _origin_url(gitpython.Repo(str(source_path)))
            if source_origin:
                return source_origin
        except Exception:  # pragma: no cover - unreadable source repo
            logger.warning("translation-import: cannot read origin of source repo %s", git_url)
    return _origin_url(repo) or git_url


def _origin_url(repo) -> str:
    try:
        return next(iter(repo.remotes.origin.urls), "")
    except (AttributeError, StopIteration):
        return ""
