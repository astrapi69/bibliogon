"""Adopt an extracted ``.git/`` into a Bibliogon book.

Called from the import orchestrator's ``execute`` path when the
user picked "adopt" in the wizard. Sanitization runs first and is
never optional; security guarantees documented in
:func:`sanitize_git_dir`.

Layout target: ``uploads/{book_id}/.git`` (matches
``app.services.git_backup.repo_path``). After adoption the native
git_backup endpoints operate on the adopted repo as if ``init_repo``
had been called - status, log, commit, push, pull all work.
"""

from __future__ import annotations

import configparser
import logging
import shutil
from pathlib import Path
from typing import Any

import git

from app.services.git_backup import configure_remote, repo_path

logger = logging.getLogger(__name__)


class GitAdoptionError(Exception):
    """Adoption failed in a non-recoverable way."""


class RepoAlreadyPresent(GitAdoptionError):
    """Target book already has a .git/; reject to avoid accidental
    overwrite of existing history."""


class CorruptedSourceRepo(GitAdoptionError):
    """Source .git/ failed fsck; refuse to adopt."""


def sanitize_git_dir(git_dir: Path) -> list[str]:
    """Strip embedded credentials and suspicious content in-place.

    Security guarantees (Area 5 #5 from the audit):

    1. ``http.*.extraheader`` sections removed from .git/config.
    2. ``[credential]`` section removed entirely (all helpers).
    3. Reflog cleared via ``git reflog expire --expire=now --all``.
    4. Custom hooks deleted - only .sample files kept.
    5. packed-refs entries outside ``refs/heads/``, ``refs/tags/``,
       ``refs/remotes/`` pruned.

    Returns a list of action strings for the caller to log / show
    the user. Never raises on malformed input - a best-effort scrub.
    """
    actions: list[str] = []

    # --- 1 + 2: strip credential sections from config ---
    config_path = git_dir / "config"
    if config_path.is_file():
        parser = configparser.ConfigParser(strict=False, interpolation=None)
        try:
            parser.read(config_path, encoding="utf-8")
        except (OSError, configparser.Error):
            parser = None
        if parser is not None:
            dirty = False
            # 1. http.*.extraheader sections
            for section in list(parser.sections()):
                if section.startswith("http") and "extraheader" in parser[section]:
                    parser.remove_option(section, "extraheader")
                    actions.append(f"stripped extraheader from [{section}]")
                    dirty = True
                    # Drop the section entirely if now empty.
                    if not parser.options(section):
                        parser.remove_section(section)
            # 2. credential.* options (typically helper)
            if parser.has_section("credential"):
                parser.remove_section("credential")
                actions.append("stripped [credential] section")
                dirty = True
            if dirty:
                with config_path.open("w", encoding="utf-8") as f:
                    parser.write(f)

    # --- 3: clear reflog ---
    try:
        repo = git.Repo(git_dir.parent)
        repo.git.reflog("expire", "--expire=now", "--all")
        # gc prunes now-unreachable objects from the blow-away reflog.
        repo.git.gc("--prune=now", "--quiet")
        actions.append("reflog cleared + unreachable objects pruned")
    except Exception as exc:
        logger.warning("sanitize_git_dir: reflog expire/gc failed: %s", exc)

    # --- 4: drop custom hooks ---
    hooks_dir = git_dir / "hooks"
    if hooks_dir.is_dir():
        for entry in list(hooks_dir.iterdir()):
            if entry.is_file() and not entry.name.endswith(".sample"):
                try:
                    entry.unlink()
                    actions.append(f"removed custom hook {entry.name}")
                except OSError:
                    pass

    # --- 5: prune non-standard packed-refs ---
    packed = git_dir / "packed-refs"
    if packed.is_file():
        try:
            lines = packed.read_text(encoding="utf-8").splitlines()
        except OSError:
            lines = []
        kept: list[str] = []
        pruned_any = False
        for line in lines:
            if not line or line.startswith(("#", "^")):
                kept.append(line)
                continue
            parts = line.split(None, 1)
            if len(parts) == 2:
                ref = parts[1].strip()
                if not any(
                    ref.startswith(p)
                    for p in (
                        "refs/heads/",
                        "refs/tags/",
                        "refs/remotes/",
                    )
                ):
                    pruned_any = True
                    actions.append(f"pruned non-standard ref {ref!r}")
                    continue
            kept.append(line)
        if pruned_any:
            packed.write_text("\n".join(kept) + "\n", encoding="utf-8")

    return actions


def adopt_git_dir(
    git_dir: Path,
    target_book_id: str,
    preserve_remote: bool,
    db: Any = None,
) -> dict[str, Any]:
    """Sanitize + copy .git/ into ``uploads/{book_id}/.git``.

    Raises:
        :class:`RepoAlreadyPresent` - target already has a .git/;
            caller must delete existing state first.
        :class:`CorruptedSourceRepo` - source fsck failed.

    ``preserve_remote=True`` reads the source ``[remote "origin"]`` url
    (after sanitization) and calls :func:`git_backup.configure_remote`
    so the book appears with a configured remote in the UI. The PAT
    is NEVER adopted from the source; the user re-enters it via the
    existing Git-Backup dialog. ``preserve_remote=False`` strips the
    origin remote from the adopted config so the book has no remote
    until the user configures one manually.

    Returns a dict with ``sanitize_actions``, ``commit_count``,
    ``current_branch``, and ``remote_adopted``.
    """
    # Pre-flight.
    target = repo_path(target_book_id)
    if (target / ".git").is_dir():
        raise RepoAlreadyPresent(
            f"Book {target_book_id} already has a .git/ - delete "
            "existing git state before adopting."
        )

    # Sanitize first; if any step fails hard the rest of the run
    # does not touch the target dir.
    sanitize_actions = sanitize_git_dir(git_dir)

    # Post-sanitize fsck; refuse to adopt a corrupted source.
    try:
        source_repo = git.Repo(git_dir.parent)
        source_repo.git.fsck("--no-dangling", "--no-progress")
    except Exception as exc:
        raise CorruptedSourceRepo(f"Source .git/ failed fsck after sanitization: {exc}") from exc

    # Read state we'll report back BEFORE copying, in case copy fails.
    current_branch: str | None = None
    head_sha: str | None = None
    commit_count = 0
    remote_url: str | None = None
    try:
        head_ref = source_repo.head
        if not head_ref.is_detached:
            current_branch = head_ref.reference.name
        head_sha = head_ref.commit.hexsha
        commit_count = sum(1 for _ in source_repo.iter_commits())
    except Exception:
        pass
    if "origin" in [r.name for r in source_repo.remotes]:
        remote_url = next(source_repo.remotes.origin.urls, None)

    # Copy the .git/ tree. target.parent is uploads/<book_id>/; git
    # lives inside as .git/. If the target dir doesn't exist yet
    # (book imported but never added any assets), create it.
    target.mkdir(parents=True, exist_ok=True)
    shutil.copytree(git_dir, target / ".git")

    # Post-copy remote handling.
    remote_adopted = False
    if preserve_remote and remote_url:
        if db is None:
            # No session available (e.g., backfill from a shell):
            # fall back to writing native git config only.
            adopted = git.Repo(target)
            if "origin" in [r.name for r in adopted.remotes]:
                adopted.remotes.origin.set_url(remote_url)
            else:
                adopted.create_remote("origin", remote_url)
            remote_adopted = True
        else:
            configure_remote(target_book_id, url=remote_url, pat=None, db=db)
            remote_adopted = True
    elif not preserve_remote:
        # Strip the origin remote from the adopted config so the
        # book has no remote until the user configures one via the
        # Git-Backup dialog.
        adopted = git.Repo(target)
        if "origin" in [r.name for r in adopted.remotes]:
            adopted.delete_remote("origin")

    return {
        "sanitize_actions": sanitize_actions,
        "commit_count": commit_count,
        "current_branch": current_branch,
        "head_sha": head_sha,
        "remote_adopted": remote_adopted,
    }


def reject_git_dir(git_dir: Path) -> None:
    """No-op except for a log line. Called when the user chose
    ``start_fresh`` so the adoption module stays in the audit
    trail regardless of user choice."""
    logger.info("git_import_adopter: rejecting .git/ at %s (user chose start_fresh)", git_dir)
