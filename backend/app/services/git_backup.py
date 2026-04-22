"""Git-based backup service.

Per-book git repo at ``uploads/{book_id}/.git``. See
[docs/explorations/git-based-backup.md](../../../docs/explorations/git-based-backup.md)
for the full phased plan.

Phase 1 (shipped): init, commit, log, status. Local-only.
Phase 2 (this module): remote configure, push, pull (ff-only),
sync-status. Auth: HTTPS + Personal Access Token only for MVP.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Any

import git  # GitPython
import yaml
from sqlalchemy.orm import Session

from app import credential_store
from app.models import Book, Chapter, ChapterType
from app.services import ssh_keys

# Bibliogon convention: every book's uploads live at ``uploads/{book_id}/``.
UPLOADS_ROOT = Path("uploads")

# Encrypted PAT storage. One file per book under config/git_credentials/.
GIT_CRED_DIR = Path("config/git_credentials")
# Per-book remote URL + metadata. Plain YAML (URL is not secret; PAT is).
GIT_CONFIG_FILENAME = ".bibliogon-git-config.yaml"

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


class RemoteNotConfiguredError(GitBackupError):
    """A remote operation was requested but no remote has been configured."""


class RemoteAuthError(GitBackupError):
    """Remote rejected the credentials (401/403)."""


class RemoteRejectedError(GitBackupError):
    """Push rejected because the remote has diverged commits (non-fast-forward)."""


class DivergedError(GitBackupError):
    """Pull cannot fast-forward; local and remote diverged."""


class RemoteNetworkError(GitBackupError):
    """Generic network failure reaching the remote."""


class MergeInProgressError(GitBackupError):
    """Operation requires a clean tree but a merge is already in progress."""


class NoMergeInProgressError(GitBackupError):
    """Resolve or abort requested but no merge state exists."""


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
    author = _author_for(book)
    # Seed user.name / user.email so ``git merge`` (which reads
    # repo-level config, not the index.commit author override) can
    # produce merge commits without relying on a global ~/.gitconfig.
    repo.git.config("user.name", author.name)
    repo.git.config("user.email", author.email)

    _write_gitignore(path)
    _write_book_state(book, db, path)

    repo.git.add(A=True)
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
        raise RepoNotInitializedError(f"Book {book_id} has no git repo. Initialize first.")

    repo = git.Repo(path)
    _write_book_state(book, db, path)

    repo.git.add(A=True)

    if not repo.is_dirty(untracked_files=True) and not repo.index.diff("HEAD"):
        raise NothingToCommitError("No changes to commit. Working tree matches last commit.")

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
        raise RepoNotInitializedError(f"Book {book_id} has no git repo.")

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


# --- Phase 2: remote, push, pull, sync-status ---


def configure_remote(
    book_id: str,
    url: str,
    pat: str | None,
    db: Session,
) -> dict[str, Any]:
    """Set (or update) the remote URL + PAT for this book.

    Storage:
    - URL lives in the repo at ``.bibliogon-git-config.yaml`` (not
      secret; also git-ignored so push never propagates it).
    - PAT is encrypted via :mod:`credential_store` under
      ``config/git_credentials/{book_id}.enc``. Empty/missing PAT
      clears the stored credential.

    Also writes the URL into git's own config so native
    ``git push``/``pull`` commands outside Bibliogon work.
    """
    _get_book_or_raise(book_id, db)
    if not is_initialized(book_id):
        raise RepoNotInitializedError(f"Book {book_id} has no git repo. Initialize first.")
    url = (url or "").strip()
    if not url:
        raise GitBackupError("Remote URL must not be empty.")

    repo_dir = repo_path(book_id)
    _write_remote_config(repo_dir, {"url": url})

    # Keep the .bibliogon-git-config.yaml out of commits so the remote
    # URL does not travel with pushes (and so a shared repo does not
    # leak one user's remote to another).
    _ensure_gitignore_entry(repo_dir, GIT_CONFIG_FILENAME)

    # Mirror into git's native remote config for parity with CLI use.
    repo = git.Repo(repo_dir)
    if "origin" in [r.name for r in repo.remotes]:
        repo.remotes.origin.set_url(url)
    else:
        repo.create_remote("origin", url)

    if pat:
        credential_store.save_encrypted(
            pat.encode("utf-8"),
            filename=_pat_filename(book_id),
            credentials_dir=GIT_CRED_DIR,
        )
    else:
        credential_store.secure_delete(
            filename=_pat_filename(book_id),
            credentials_dir=GIT_CRED_DIR,
        )
    return get_remote_config(book_id, db)


def get_remote_config(book_id: str, db: Session) -> dict[str, Any]:
    """Return remote URL + whether a PAT is configured. Never returns the PAT."""
    _get_book_or_raise(book_id, db)
    config = _read_remote_config(repo_path(book_id))
    return {
        "url": config.get("url") if config else None,
        "has_credential": credential_store.is_configured(
            filename=_pat_filename(book_id),
            credentials_dir=GIT_CRED_DIR,
        ),
    }


def delete_remote_config(book_id: str, db: Session) -> None:
    """Remove remote URL + stored PAT. Idempotent."""
    _get_book_or_raise(book_id, db)
    repo_dir = repo_path(book_id)
    config_path = repo_dir / GIT_CONFIG_FILENAME
    config_path.unlink(missing_ok=True)
    credential_store.secure_delete(
        filename=_pat_filename(book_id),
        credentials_dir=GIT_CRED_DIR,
    )
    if is_initialized(book_id):
        repo = git.Repo(repo_dir)
        if "origin" in [r.name for r in repo.remotes]:
            git.Remote.remove(repo, "origin")


def push(book_id: str, db: Session, force: bool = False) -> dict[str, Any]:
    """Push current branch to ``origin``.

    Default is non-force (ff-only from the remote's perspective). Set
    ``force=True`` to overwrite remote history with local — this is
    the "Accept Local" half of the SI conflict-resolution UX and is
    only safe when the author has explicitly confirmed it.
    """
    repo = _require_repo_with_remote(book_id, db)
    remote_url = _authenticated_url(book_id, repo)
    branch = repo.active_branch.name
    ssh_env = _ssh_env(next(repo.remotes.origin.urls))
    try:
        # Use a one-shot pushurl so the embedded PAT never lands in
        # .git/config. Reset after push in a finally block.
        original_url = next(repo.remotes.origin.urls)
        repo.remotes.origin.set_url(remote_url)
        if ssh_env:
            repo.git.update_environment(**ssh_env)
        try:
            info_list = repo.remotes.origin.push(
                refspec=f"{branch}:{branch}",
                force=force,
            )
        finally:
            repo.remotes.origin.set_url(original_url)
    except git.GitCommandError as exc:
        raise _classify_git_error(exc) from exc

    if not info_list:
        raise RemoteNetworkError("Push returned no information from the remote.")
    info = info_list[0]
    if info.flags & git.PushInfo.ERROR:
        if info.flags & info.REJECTED or info.flags & info.REMOTE_REJECTED:
            raise RemoteRejectedError(info.summary.strip() or "Push rejected by remote.")
        raise RemoteNetworkError(info.summary.strip() or "Push failed.")
    return {
        "branch": branch,
        "summary": (info.summary or "").strip(),
        "flags": int(info.flags),
        "forced": force,
    }


def pull(book_id: str, db: Session) -> dict[str, Any]:
    """Fetch + fast-forward merge. Diverged histories raise DivergedError."""
    repo = _require_repo_with_remote(book_id, db)
    remote_url = _authenticated_url(book_id, repo)
    branch = repo.active_branch.name
    ssh_env = _ssh_env(next(repo.remotes.origin.urls))

    try:
        original_url = next(repo.remotes.origin.urls)
        repo.remotes.origin.set_url(remote_url)
        if ssh_env:
            repo.git.update_environment(**ssh_env)
        try:
            repo.remotes.origin.fetch(refspec=branch)
        finally:
            repo.remotes.origin.set_url(original_url)
    except git.GitCommandError as exc:
        raise _classify_git_error(exc) from exc

    remote_ref = f"origin/{branch}"
    if remote_ref not in [r.name for r in repo.refs]:
        # Nothing on the remote for this branch yet.
        return {"branch": branch, "updated": False, "fast_forward": False}

    local = repo.head.commit
    remote = repo.refs[remote_ref].commit

    if local == remote:
        return {"branch": branch, "updated": False, "fast_forward": True}

    merge_base_commits = repo.merge_base(local, remote)
    merge_base = merge_base_commits[0] if merge_base_commits else None

    if merge_base == local:
        # Fast-forward: local is strict ancestor of remote.
        repo.git.merge("--ff-only", remote_ref)
        return {
            "branch": branch,
            "updated": True,
            "fast_forward": True,
            "head_hash": repo.head.commit.hexsha,
        }
    if merge_base == remote:
        # Local is ahead; nothing to pull.
        return {"branch": branch, "updated": False, "fast_forward": True}
    raise DivergedError(
        "Local and remote have diverged. Resolve via Accept Remote / "
        "Accept Local or an external git tool."
    )


def sync_status(book_id: str, db: Session) -> dict[str, Any]:
    """Compare local HEAD against the last-fetched remote tracking ref.

    Does NOT reach the network. Call :func:`pull` first if the remote
    tracking ref is stale.
    """
    _get_book_or_raise(book_id, db)
    remote_conf = get_remote_config(book_id, db)
    base = {
        "remote_configured": remote_conf["url"] is not None,
        "has_credential": remote_conf["has_credential"],
        "ahead": 0,
        "behind": 0,
        "state": "no_remote",
    }
    if not is_initialized(book_id) or not base["remote_configured"]:
        return base

    repo = git.Repo(repo_path(book_id))
    branch = repo.active_branch.name
    remote_ref = f"origin/{branch}"
    if remote_ref not in [r.name for r in repo.refs]:
        base["state"] = "never_synced"
        return base

    local = repo.head.commit
    remote = repo.refs[remote_ref].commit
    if local == remote:
        base["state"] = "in_sync"
        return base

    merge_base_commits = repo.merge_base(local, remote)
    merge_base = merge_base_commits[0] if merge_base_commits else None
    ahead = len(list(repo.iter_commits(f"{remote_ref}..{branch}")))
    behind = len(list(repo.iter_commits(f"{branch}..{remote_ref}")))
    base["ahead"] = ahead
    base["behind"] = behind
    if merge_base == local and behind > 0:
        base["state"] = "remote_ahead"
    elif merge_base == remote and ahead > 0:
        base["state"] = "local_ahead"
    else:
        base["state"] = "diverged"
    return base


# --- Phase 4: conflict analysis + per-file resolution ---


def analyze_conflict(book_id: str, db: Session) -> dict[str, Any]:
    """Classify the state of local vs ``origin/<branch>`` tracking ref.

    Does NOT reach the network; call ``pull`` first for a fresh fetch.
    Returns a dict with:

    - ``state``: ``"in_sync"`` / ``"local_ahead"`` / ``"remote_ahead"`` /
      ``"diverged"`` / ``"no_remote"`` / ``"never_synced"``
    - ``classification``: ``"simple"`` (disjoint file sets) /
      ``"complex"`` (overlapping files) / ``None`` when irrelevant
    - ``local_files`` / ``remote_files``: files changed on each side
      since the merge base
    - ``overlapping_files``: files modified on both sides (non-empty
      iff classification == "complex")
    - ``merge_in_progress``: True when ``.git/MERGE_HEAD`` exists
    """
    _get_book_or_raise(book_id, db)
    base = {
        "state": "no_remote",
        "classification": None,
        "local_files": [],
        "remote_files": [],
        "overlapping_files": [],
        "merge_in_progress": False,
    }
    if not is_initialized(book_id):
        return base
    remote_conf = _read_remote_config(repo_path(book_id))
    if not remote_conf or not remote_conf.get("url"):
        return base

    repo = git.Repo(repo_path(book_id))
    base["merge_in_progress"] = (Path(repo.git_dir) / "MERGE_HEAD").exists()
    branch = repo.active_branch.name
    remote_ref = f"origin/{branch}"
    if remote_ref not in [r.name for r in repo.refs]:
        base["state"] = "never_synced"
        return base

    local = repo.head.commit
    remote = repo.refs[remote_ref].commit
    if local == remote:
        base["state"] = "in_sync"
        return base

    merge_base_commits = repo.merge_base(local, remote)
    merge_base = merge_base_commits[0] if merge_base_commits else None

    if merge_base == local:
        base["state"] = "remote_ahead"
        return base
    if merge_base == remote:
        base["state"] = "local_ahead"
        return base

    base["state"] = "diverged"
    if merge_base is not None:
        local_files = _changed_files_between(repo, merge_base.hexsha, local.hexsha)
        remote_files = _changed_files_between(repo, merge_base.hexsha, remote.hexsha)
        overlap = sorted(set(local_files) & set(remote_files))
        base["local_files"] = local_files
        base["remote_files"] = remote_files
        base["overlapping_files"] = overlap
        base["classification"] = "complex" if overlap else "simple"
    return base


def merge(book_id: str, db: Session) -> dict[str, Any]:
    """Attempt a 3-way merge of ``origin/<branch>`` into the current branch.

    Contract:
    - Clean merge (no overlapping edits) -> commits the merge, returns
      ``{"status": "merged", "head_hash": ...}``.
    - Working tree already matches -> ``{"status": "already_up_to_date"}``.
    - Overlap -> leaves the repo in a merge-in-progress state and
      returns ``{"status": "conflicts", "files": [...]}`` for the UI
      to resolve via :func:`resolve_conflicts`.
    """
    repo = _require_repo_with_remote(book_id, db)
    branch = repo.active_branch.name
    remote_ref = f"origin/{branch}"
    if (Path(repo.git_dir) / "MERGE_HEAD").exists():
        raise MergeInProgressError("A merge is already in progress. Resolve or abort first.")
    if remote_ref not in [r.name for r in repo.refs]:
        raise RemoteNotConfiguredError("Remote has never been fetched. Pull first.")

    local = repo.head.commit
    remote = repo.refs[remote_ref].commit
    if local == remote:
        return {"status": "already_up_to_date", "head_hash": local.hexsha}

    try:
        # Plain 3-way merge. Clean merges auto-commit (no --no-commit).
        repo.git.merge(remote_ref, "--no-ff")
    except git.GitCommandError as exc:
        # Conflict messages can land on stdout or stderr depending on
        # git version. Inspect both plus the index state.
        combined = (
            (exc.stderr or "") + " " + (exc.stdout if hasattr(exc, "stdout") and exc.stdout else "")
        ).lower()
        conflicted = _conflicted_files(repo)
        if conflicted or "conflict" in combined or "automatic merge failed" in combined:
            return {"status": "conflicts", "files": conflicted}
        raise _classify_git_error(exc) from exc

    return {"status": "merged", "head_hash": repo.head.commit.hexsha}


def resolve_conflicts(
    book_id: str,
    resolutions: dict[str, str],
    db: Session,
) -> dict[str, Any]:
    """Resolve an in-progress merge by picking a side per conflicted file.

    ``resolutions`` maps ``file_path -> "mine" | "theirs"``. Every
    conflicted file must be listed; unknown files or unknown sides
    raise :class:`GitBackupError`.
    """
    _get_book_or_raise(book_id, db)
    if not is_initialized(book_id):
        raise RepoNotInitializedError(f"Book {book_id} has no git repo. Initialize first.")
    repo = git.Repo(repo_path(book_id))
    if not (Path(repo.git_dir) / "MERGE_HEAD").exists():
        raise NoMergeInProgressError("No merge in progress. Run pull or merge first.")

    conflicted = set(_conflicted_files(repo))
    missing = conflicted - set(resolutions)
    if missing:
        raise GitBackupError("Resolution missing for: " + ", ".join(sorted(missing)))

    for path, side in resolutions.items():
        if path not in conflicted:
            raise GitBackupError(f"Not a conflicted file: {path}")
        if side == "mine":
            repo.git.checkout("--ours", "--", path)
        elif side == "theirs":
            repo.git.checkout("--theirs", "--", path)
        else:
            raise GitBackupError(f"Invalid side {side!r} for {path}: expected 'mine' or 'theirs'")
        repo.git.add("--", path)

    # Finish the merge: a commit combining the two parents with the
    # resolved tree. Git pre-populates a MERGE_MSG; let it stand.
    repo.git.commit("--no-edit")
    return {"status": "merged", "head_hash": repo.head.commit.hexsha}


def abort_merge(book_id: str, db: Session) -> dict[str, Any]:
    """Abort an in-progress merge. Restores pre-merge HEAD + working tree."""
    _get_book_or_raise(book_id, db)
    if not is_initialized(book_id):
        raise RepoNotInitializedError(f"Book {book_id} has no git repo. Initialize first.")
    repo = git.Repo(repo_path(book_id))
    if not (Path(repo.git_dir) / "MERGE_HEAD").exists():
        raise NoMergeInProgressError("No merge in progress. Nothing to abort.")
    repo.git.merge("--abort")
    return {"status": "aborted", "head_hash": repo.head.commit.hexsha}


# --- Internals ---


def _pat_filename(book_id: str) -> str:
    return f"{book_id}.enc"


def _changed_files_between(repo: git.Repo, base_sha: str, tip_sha: str) -> list[str]:
    """Return names of files that differ between two commits."""
    raw = repo.git.diff("--name-only", f"{base_sha}..{tip_sha}")
    return sorted(line for line in raw.splitlines() if line.strip())


def _conflicted_files(repo: git.Repo) -> list[str]:
    """Return files currently marked as merge-conflicted in the index."""
    # `git diff --name-only --diff-filter=U` lists unmerged paths.
    raw = repo.git.diff("--name-only", "--diff-filter=U")
    return sorted(line for line in raw.splitlines() if line.strip())


def _write_remote_config(repo_dir: Path, config: dict[str, Any]) -> None:
    path = repo_dir / GIT_CONFIG_FILENAME
    path.write_text(yaml.safe_dump(config, sort_keys=True), encoding="utf-8")


def _read_remote_config(repo_dir: Path) -> dict[str, Any] | None:
    path = repo_dir / GIT_CONFIG_FILENAME
    if not path.exists():
        return None
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except yaml.YAMLError:
        return None


def _ensure_gitignore_entry(repo_dir: Path, entry: str) -> None:
    """Add ``entry`` to ``.gitignore`` if not already present."""
    gitignore = repo_dir / ".gitignore"
    existing = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
    lines = {line.strip() for line in existing.splitlines()}
    if entry in lines:
        return
    trailing_newline = existing and not existing.endswith("\n")
    with gitignore.open("a", encoding="utf-8") as fh:
        if trailing_newline:
            fh.write("\n")
        fh.write(f"{entry}\n")


def _require_repo_with_remote(book_id: str, db: Session) -> git.Repo:
    """Load the repo after verifying init + remote config are in place."""
    _get_book_or_raise(book_id, db)
    if not is_initialized(book_id):
        raise RepoNotInitializedError(f"Book {book_id} has no git repo. Initialize first.")
    config = _read_remote_config(repo_path(book_id))
    if not config or not config.get("url"):
        raise RemoteNotConfiguredError(
            "No remote configured for this book. Set one before push/pull."
        )
    return git.Repo(repo_path(book_id))


def _authenticated_url(book_id: str, repo: git.Repo) -> str:
    """Build a one-shot HTTPS URL with the PAT embedded for authenticated push/fetch.

    Only applied to ``http(s)://`` URLs. Everything else (file paths,
    ssh) is returned unchanged; SSH auth is handled via
    :func:`_ssh_env` / ``GIT_SSH_COMMAND`` instead.
    """
    original = next(repo.remotes.origin.urls)
    scheme = original.split("://", 1)[0] if "://" in original else ""
    if scheme not in ("http", "https"):
        return original

    if not credential_store.is_configured(
        filename=_pat_filename(book_id),
        credentials_dir=GIT_CRED_DIR,
    ):
        return original

    pat = (
        credential_store.load_decrypted(
            filename=_pat_filename(book_id),
            credentials_dir=GIT_CRED_DIR,
        )
        .decode("utf-8")
        .strip()
    )
    if not pat:
        return original

    # GitHub/GitLab/Gitea convention: username can be anything, PAT is
    # the password. ``x-access-token`` is the standard placeholder.
    encoded_pat = urllib.parse.quote(pat, safe="")
    prefix, rest = original.split("://", 1)
    # Strip any existing credentials in the URL to avoid duplication.
    if "@" in rest:
        rest = rest.split("@", 1)[1]
    return f"{prefix}://x-access-token:{encoded_pat}@{rest}"


def _is_ssh_url(url: str) -> bool:
    """True when ``url`` uses SSH (``git@host:path`` or ``ssh://``)."""
    if url.startswith("ssh://"):
        return True
    # ``git@github.com:user/repo.git`` shape: user@host:path, no scheme.
    if "://" not in url and "@" in url and ":" in url.split("@", 1)[1]:
        return True
    return False


def _ssh_env(url: str) -> dict[str, str] | None:
    """Return a GIT_SSH_COMMAND env mapping when the URL is SSH and a
    Bibliogon-managed key exists. None otherwise.

    ``-i`` points at the stored private key; ``IdentitiesOnly=yes``
    prevents ssh-agent from trying unrelated keys first;
    ``StrictHostKeyChecking=accept-new`` lets first-time hosts connect
    without manual ``known_hosts`` seeding while still pinning on
    subsequent connects (standard OpenSSH TOFU).
    """
    if not _is_ssh_url(url) or not ssh_keys.exists():
        return None
    key_path = ssh_keys.private_key_path().resolve()
    cmd = f'ssh -i "{key_path}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'
    return {"GIT_SSH_COMMAND": cmd}


def _classify_git_error(exc: git.GitCommandError) -> GitBackupError:
    """Map git CLI stderr text to our domain exceptions."""
    raw = (exc.stderr or "").lower() + " " + (str(exc) or "").lower()
    if any(
        token in raw
        for token in (
            "authentication failed",
            "unauthorized",
            "permission denied",
            "could not read username",
            "access denied",
        )
    ):
        return RemoteAuthError("Remote rejected credentials. Check your PAT and remote URL.")
    if "non-fast-forward" in raw or "rejected" in raw:
        return RemoteRejectedError(
            "Push rejected: remote has commits your local branch does not. "
            "Pull first (or accept remote) before pushing again."
        )
    if any(
        token in raw
        for token in (
            "could not resolve host",
            "connection timed out",
            "connection refused",
            "unable to access",
            "network",
        )
    ):
        return RemoteNetworkError(f"Network error: {exc.stderr.strip() or exc}")
    return GitBackupError(f"git failed: {exc.stderr.strip() or exc}")


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

    chapters = db.query(Chapter).filter(Chapter.book_id == book.id).order_by(Chapter.position).all()

    for index, chapter in enumerate(chapters, start=1):
        section = _section_for(chapter.chapter_type)
        stem = f"{index:02d}-{_slugify(chapter.title or 'untitled')}"
        tiptap_doc = _safe_load_json(chapter.content)
        payload = {
            "id": chapter.id,
            "title": chapter.title,
            "chapter_type": chapter.chapter_type,
            "position": chapter.position,
            "content": tiptap_doc,
        }
        json_path = manuscript / section / f"{stem}.json"
        json_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        # Phase 5: Markdown counterpart for readable diffs. JSON stays
        # canonical; MD is advisory and regenerated from JSON on every
        # commit. Failure to render MD must NEVER block the JSON
        # commit.
        md_path = manuscript / section / f"{stem}.md"
        md = _render_chapter_markdown(chapter.title, tiptap_doc)
        if md is not None:
            md_path.write_text(md, encoding="utf-8")
        elif md_path.exists():
            # Plugin gone mid-flight? Drop stale MD rather than keep a
            # diverging snapshot next to the JSON.
            md_path.unlink()

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


def _render_chapter_markdown(title: str | None, tiptap_doc: Any) -> str | None:
    """Render a chapter to Markdown. Returns None on any failure.

    Phase 5: reuses the export plugin's converter. The export plugin
    is a path-installed core dependency but the import is kept lazy +
    exception-tolerant so a disabled/broken plugin never blocks a
    commit — JSON is the canonical format, Markdown is advisory.
    """
    try:
        from bibliogon_export.tiptap_to_md import tiptap_to_markdown
    except ImportError:
        logger_ = logging.getLogger(__name__)
        logger_.info("bibliogon_export unavailable; skipping Markdown side-file")
        return None
    if not isinstance(tiptap_doc, dict) or tiptap_doc.get("type") != "doc":
        return None
    try:
        body = tiptap_to_markdown(tiptap_doc)
    except Exception as exc:  # noqa: BLE001 - render must not kill commit
        logger_ = logging.getLogger(__name__)
        logger_.warning("tiptap_to_markdown failed: %s", exc)
        return None
    header = f"# {title.strip()}\n\n" if title and title.strip() else ""
    return header + body.rstrip() + "\n"


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
    value = value.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    value = _slug_re.sub("-", value).strip("-")
    return value or f"ch-{int(datetime.now().timestamp())}"
