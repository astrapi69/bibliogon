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
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Book, GitSyncMapping
from app.services.translation_groups import (
    _BRANCH_LANG_RE,
    derive_language,
    link_books,
)

logger = logging.getLogger(__name__)


# Persistent clone area lives next to the asset store (mirrors PGS-02).
_GIT_SYNC_ROOT_NAME = "git-sync"
_UPLOADS_ROOT = Path("uploads")


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


# --- public surface ---


def import_translation_group(
    db: Session,
    *,
    git_url: str,
    uploads_dir: Path = _UPLOADS_ROOT,
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

        branches = _enumerate_translation_branches(repo)
        if not branches:
            raise NoMatchingBranchesError(
                "Repository has no 'main' or 'main-XX' branches; "
                "translation-group import does not apply."
            )

        imported: list[ImportedBook] = []
        skipped: list[SkippedBranch] = []
        for branch in branches:
            try:
                book = _import_one_branch(
                    db,
                    repo=repo,
                    staging=staging,
                    branch=branch,
                    uploads_dir=uploads_dir,
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
            repo_url=_origin_url(repo),
            branch=branch,
            last_imported_commit_sha=head_sha,
            local_clone_path=str(target_dir),
        )
    )
    db.commit()

    return ImportedBook(
        book_id=book_id,
        branch=branch,
        language=resolved_lang,
        title=(book.title if book else ""),
    )


def _origin_url(repo) -> str:
    try:
        return next(iter(repo.remotes.origin.urls), "")
    except (AttributeError, StopIteration):
        return ""
