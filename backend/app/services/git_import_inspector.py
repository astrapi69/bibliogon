"""Inspect a ``.git/`` directory found in an imported source.

The wizard calls :func:`inspect_git_dir` at detect-time to fill in
:class:`app.import_plugins.protocol.DetectedGitRepo`. Nothing here
mutates the repo - it is read-only metadata collection plus a
security scan that reports what would be stripped on adoption.

Adoption + sanitization live in ``git_import_adopter``.
"""

from __future__ import annotations

import configparser
import logging
import re
from pathlib import Path

import git

from app.import_plugins.protocol import DetectedGitRepo

logger = logging.getLogger(__name__)

# Refs outside these prefixes are treated as suspicious. Normal
# repos have only these three namespaces in packed-refs.
_STANDARD_REF_PREFIXES = ("refs/heads/", "refs/tags/", "refs/remotes/")

# Hook filenames shipped by ``git init`` in .sample form only. Any
# OTHER executable file (or a non-.sample file with these names)
# is user-installed and flagged.
_DEFAULT_HOOK_NAMES = frozenset({
    "applypatch-msg.sample", "commit-msg.sample",
    "fsmonitor-watchman.sample", "post-update.sample",
    "pre-applypatch.sample", "pre-commit.sample",
    "pre-merge-commit.sample", "pre-push.sample",
    "pre-rebase.sample", "pre-receive.sample",
    "prepare-commit-msg.sample", "push-to-checkout.sample",
    "sendemail-validate.sample", "update.sample",
})


def inspect_git_dir(git_dir: Path) -> DetectedGitRepo:
    """Build a DetectedGitRepo payload for the wizard.

    ``git_dir`` is the ``.git`` directory itself (not the repo's
    working tree). Never raises on bad input - returns a payload
    with ``is_corrupted=True`` and whatever metadata could be read.
    """
    if not git_dir.is_dir():
        return DetectedGitRepo(present=False)

    size_bytes = _dir_size(git_dir)
    current_branch, head_sha = _read_head(git_dir)
    commit_count = _count_commits(git_dir)
    remote_url = _read_remote_url(git_dir)
    has_lfs = _detect_lfs(git_dir)
    has_submodules = _detect_submodules(git_dir)
    is_shallow = _detect_shallow(git_dir)
    is_corrupted = not _run_fsck(git_dir)
    security_warnings = _scan_security(git_dir)

    return DetectedGitRepo(
        present=True,
        size_bytes=size_bytes,
        current_branch=current_branch,
        head_sha=head_sha,
        commit_count=commit_count,
        remote_url=remote_url,
        has_lfs=has_lfs,
        has_submodules=has_submodules,
        is_shallow=is_shallow,
        is_corrupted=is_corrupted,
        security_warnings=security_warnings,
    )


# --- Helpers (module-level, testable in isolation) ---


def _dir_size(path: Path) -> int:
    total = 0
    for p in path.rglob("*"):
        try:
            if p.is_file():
                total += p.stat().st_size
        except OSError:
            continue
    return total


def _read_head(git_dir: Path) -> tuple[str | None, str | None]:
    """Return (branch_name, head_sha). Either may be None on detached
    HEAD, empty repo, or read failure."""
    head = git_dir / "HEAD"
    if not head.is_file():
        return (None, None)
    try:
        content = head.read_text(encoding="utf-8").strip()
    except OSError:
        return (None, None)
    if content.startswith("ref: "):
        ref_name = content[5:].strip()
        branch = ref_name.rsplit("/", 1)[-1] if "/" in ref_name else ref_name
        ref_file = git_dir / ref_name
        sha: str | None = None
        if ref_file.is_file():
            try:
                sha = ref_file.read_text(encoding="utf-8").strip() or None
            except OSError:
                sha = None
        if sha is None:
            # Fall back to packed-refs.
            sha = _read_packed_ref(git_dir, ref_name)
        return (branch, sha)
    # Detached HEAD: HEAD contains a bare SHA.
    if re.fullmatch(r"[0-9a-f]{40}", content):
        return (None, content)
    return (None, None)


def _read_packed_ref(git_dir: Path, ref_name: str) -> str | None:
    packed = git_dir / "packed-refs"
    if not packed.is_file():
        return None
    try:
        for line in packed.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#") or line.startswith("^"):
                continue
            parts = line.split(None, 1)
            if len(parts) == 2 and parts[1].strip() == ref_name:
                return parts[0].strip()
    except OSError:
        return None
    return None


def _count_commits(git_dir: Path) -> int | None:
    """Best-effort count via GitPython. None on failure."""
    try:
        repo = git.Repo(git_dir.parent)
        return sum(1 for _ in repo.iter_commits())
    except Exception:
        return None


def _read_remote_url(git_dir: Path) -> str | None:
    config = _parse_git_config(git_dir)
    if config is None:
        return None
    for section in config.sections():
        # Section name is like 'remote "origin"'. ConfigParser keeps
        # the quoted name verbatim.
        if section.startswith("remote "):
            url = config.get(section, "url", fallback=None)
            if url:
                return url.strip()
    return None


def _parse_git_config(git_dir: Path) -> configparser.ConfigParser | None:
    cfg = git_dir / "config"
    if not cfg.is_file():
        return None
    parser = configparser.ConfigParser(strict=False, interpolation=None)
    try:
        parser.read(cfg, encoding="utf-8")
    except (OSError, configparser.Error):
        return None
    return parser


def _detect_lfs(git_dir: Path) -> bool:
    gitattributes = git_dir.parent / ".gitattributes"
    if not gitattributes.is_file():
        return False
    try:
        return "filter=lfs" in gitattributes.read_text(encoding="utf-8")
    except OSError:
        return False


def _detect_submodules(git_dir: Path) -> bool:
    gitmodules = git_dir.parent / ".gitmodules"
    return gitmodules.is_file()


def _detect_shallow(git_dir: Path) -> bool:
    return (git_dir / "shallow").is_file()


def _run_fsck(git_dir: Path) -> bool:
    """Return True when ``git fsck`` reports a clean repo.

    Uses GitPython's ``repo.git.fsck`` which shells out to the git
    binary. ``--no-dangling`` skips dangling-object noise since
    that's normal for recent repos.
    """
    try:
        repo = git.Repo(git_dir.parent)
        repo.git.fsck("--no-dangling", "--no-progress")
        return True
    except Exception as exc:
        logger.warning("git_import_inspector: fsck failed for %s: %s", git_dir, exc)
        return False


# --- Security scan ---


_SUSPICIOUS_HELPERS_RE = re.compile(r"^(store|cache|!.*|manager.*)")


def _scan_security(git_dir: Path) -> list[str]:
    """Report what sanitization will strip on adoption + any caveats.

    Every entry is a user-facing warning. The wizard displays the
    list in Step 3 and the adopter performs the corresponding
    action when the user opts to adopt.
    """
    warnings: list[str] = []
    config = _parse_git_config(git_dir)
    if config is not None:
        for section in config.sections():
            # http.<url>.extraheader carries Basic/Bearer auth.
            if section.startswith("http") and "extraheader" in config[section]:
                warnings.append(
                    "Git config contains HTTP extraheader "
                    "(will be stripped on adoption)."
                )
                break
        # credential.helper: stripped on adoption.
        if config.has_option("credential", "helper"):
            warnings.append(
                "Git config contains credential helper "
                "(will be stripped on adoption)."
            )
        # user.email with token-like local part.
        if config.has_option("user", "email"):
            email = config.get("user", "email")
            if _looks_like_token_email(email):
                warnings.append(
                    "Git config user.email looks token-shaped "
                    f"({email!r}); consider reviewing before adoption."
                )

    # packed-refs with non-standard namespaces.
    packed = git_dir / "packed-refs"
    if packed.is_file():
        try:
            for line in packed.read_text(encoding="utf-8").splitlines():
                if not line or line.startswith(("#", "^")):
                    continue
                parts = line.split(None, 1)
                if len(parts) != 2:
                    continue
                ref = parts[1].strip()
                if not any(
                    ref.startswith(p) for p in _STANDARD_REF_PREFIXES
                ):
                    warnings.append(
                        f"Non-standard ref in packed-refs: {ref!r} "
                        "(will be pruned on adoption)."
                    )
                    break
        except OSError:
            pass

    # Custom hooks.
    hooks_dir = git_dir / "hooks"
    if hooks_dir.is_dir():
        for entry in hooks_dir.iterdir():
            if not entry.is_file():
                continue
            if entry.name in _DEFAULT_HOOK_NAMES:
                continue
            try:
                executable = entry.stat().st_mode & 0o111
            except OSError:
                executable = 0
            if executable:
                warnings.append(
                    "Custom git hooks detected (will NOT be adopted)."
                )
                break

    return warnings


def _looks_like_token_email(email: str) -> bool:
    """Tokens often appear as the local part: ``<40-hex>@users.noreply.github.com``
    or ``ghp_<many-alnum>@...``. Heuristic."""
    local = email.split("@", 1)[0]
    if len(local) < 20:
        return False
    if re.fullmatch(r"[0-9a-f]{16,}", local):
        return True
    if re.match(r"(ghp|gho|ghu|ghs|ghr|glpat|xoxb|xoxp)_", local):
        return True
    return False
