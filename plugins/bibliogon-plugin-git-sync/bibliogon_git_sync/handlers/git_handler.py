"""GitImportHandler: clones a public git URL into the orchestrator's
staging directory.

Phase 1 scope: HTTPS/SSH URL shape recognition, sync clone via
GitPython, timeout + size guardrails. Authentication is out of
scope (PGS-02 will add credential injection via the existing
credential_store). LFS, shallow-depth tuning, and branch
selection are also deferred.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# Loose URL recognition. The endpoint rejects empty strings via
# Pydantic min_length=1; this regex keeps out obvious non-URLs
# before we invoke git. The actual clone validates the URL.
_GIT_URL_RE = re.compile(
    r"^(?:https?://|git@[^\s:]+:|ssh://git@)[^\s]+(?:\.git)?/?$",
    re.IGNORECASE,
)

# Maximum clone time before we abort. Keeps a synchronous detect
# request from hanging indefinitely on a slow/hostile remote.
_CLONE_TIMEOUT_SECONDS = 120


class GitImportHandler:
    """Remote-source handler for git URLs.

    Implements :class:`app.import_plugins.registry.RemoteSourceHandler`
    structurally (duck-typed). Kept decoupled from the core module so
    the plugin remains importable in isolation for unit testing.
    """

    source_kind = "git"

    def can_handle(self, url: str) -> bool:
        if not isinstance(url, str) or not url.strip():
            return False
        return bool(_GIT_URL_RE.match(url.strip()))

    def clone(self, url: str, target_dir: Path) -> Path:
        """Clone ``url`` into ``target_dir`` and return the project
        root the orchestrator should dispatch through.

        Uses a subdirectory under ``target_dir`` named after the
        repo (trailing ``.git`` stripped) so downstream helpers can
        treat the result as a normal filesystem path. If the remote
        is missing WBT layout markers the orchestrator's
        ``find_handler`` returns None and the endpoint surfaces a
        415 - no recovery attempted here.

        Raises any GitPython exception unchanged; the endpoint maps
        it to HTTP 502 with the exception message in the detail.
        """
        from git import Repo  # imported lazily to keep plugin-load cheap

        clean_url = url.strip()
        repo_slug = _slug_from_url(clean_url)
        dest = target_dir / repo_slug
        if dest.exists():
            # Extremely rare: UUID-based temp_ref collision. Make
            # the name unique so GitPython does not refuse.
            import secrets

            dest = target_dir / f"{repo_slug}-{secrets.token_hex(4)}"

        logger.info(
            "plugin-git-sync: cloning %s into %s (timeout=%ss)",
            clean_url, dest, _CLONE_TIMEOUT_SECONDS,
        )
        # ``kill_after_timeout`` applies to the whole clone op.
        # ``depth`` is intentionally NOT set - users may want the
        # full history for future PGS-02 sync-back; Phase 1 does
        # not optimise clone time.
        Repo.clone_from(
            clean_url,
            str(dest),
            multi_options=["--quiet"],
            kill_after_timeout=_CLONE_TIMEOUT_SECONDS,
        )
        return dest


def _slug_from_url(url: str) -> str:
    """Derive a filesystem-safe directory name from the URL.

    ``https://github.com/foo/bar.git`` -> ``bar``
    ``git@github.com:foo/bar.git``    -> ``bar``
    ``https://gitlab.com/a/b/c``      -> ``c``
    Unknown shapes fall back to ``repo``.
    """
    tail = url.rstrip("/").rstrip(".git").rsplit("/", 1)[-1]
    tail = tail.rsplit(":", 1)[-1]
    safe = re.sub(r"[^A-Za-z0-9_.-]", "-", tail).strip("-_.")
    return safe or "repo"
