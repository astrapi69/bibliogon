"""Per-book git credential helpers shared across git_backup + plugin-git-sync.

PGS-02-FU-01 follow-up. Both subsystems push to remotes scoped by
``book_id`` and benefit from one shared PAT (and one shared SSH key).
The actual storage primitives live in :mod:`app.credential_store`;
this module is the per-book convention layer.

Storage layout: ``config/git_credentials/{book_id}.enc`` (Fernet-encrypted).
Tests redirect via the ``GIT_CRED_DIR`` module attribute.

Also the one place that takes a credential back OUT of a remote URL
(:func:`split_url_credentials`, #1072), so the rest of the code can pass
a URL around without carrying a secret in it. It lives here rather than
in a module of its own because it is credential handling, and because
``services/git`` is at its directory-size baseline - a 13th file would
have to earn its place.
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterator
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import unquote, urlsplit, urlunsplit

from app import credential_store
from app.paths import get_config_dir
from app.services import ssh_keys

if TYPE_CHECKING:  # pragma: no cover - import for typing only
    import git

# Per-book PAT directory override. ``None`` means "resolve fresh under the
# data dir" (see ``_cred_dir``); tests monkeypatch this to a tmp_path. Access
# via the module path (``git_credentials.GIT_CRED_DIR``), never ``from
# git_credentials import GIT_CRED_DIR`` (that freezes the binding and defeats
# the monkeypatch). Never a CWD-relative literal - that escapes the isolated
# data dir (filesystem-isolation rule).
GIT_CRED_DIR: Path | None = None


def _cred_dir() -> Path:
    """The per-book PAT directory: a test override, else fresh under the
    data dir."""
    return GIT_CRED_DIR if GIT_CRED_DIR is not None else get_config_dir() / "git_credentials"


def pat_filename(book_id: str) -> str:
    """Convention: one encrypted PAT per book at ``{book_id}.enc``."""
    return f"{book_id}.enc"


def save_pat(book_id: str, pat: str) -> None:
    """Persist an encrypted PAT for ``book_id``. Empty input deletes."""
    pat = (pat or "").strip()
    if not pat:
        delete_pat(book_id)
        return
    credential_store.save_encrypted(
        pat.encode("utf-8"),
        filename=pat_filename(book_id),
        credentials_dir=_cred_dir(),
    )


def delete_pat(book_id: str) -> None:
    """Idempotent secure delete of the PAT for ``book_id``."""
    credential_store.secure_delete(
        filename=pat_filename(book_id),
        credentials_dir=_cred_dir(),
    )


def has_pat(book_id: str) -> bool:
    """True when a PAT is stored for ``book_id``."""
    return credential_store.is_configured(
        filename=pat_filename(book_id),
        credentials_dir=_cred_dir(),
    )


def load_pat(book_id: str) -> str | None:
    """Return the decrypted PAT for ``book_id`` or None when missing/empty."""
    if not has_pat(book_id):
        return None
    raw = credential_store.load_decrypted(
        filename=pat_filename(book_id),
        credentials_dir=_cred_dir(),
    )
    pat = raw.decode("utf-8").strip()
    return pat or None


def is_ssh_url(url: str) -> bool:
    """True when ``url`` is SSH (``ssh://`` or ``user@host:path``)."""
    if url.startswith("ssh://"):
        return True
    if "://" not in url and "@" in url and ":" in url.split("@", 1)[1]:
        return True
    return False


def ssh_env(url: str) -> dict[str, str] | None:
    """Return a ``GIT_SSH_COMMAND`` env mapping for SSH URLs when a
    Bibliogon-managed key exists. None otherwise.

    ``-i`` points at the stored private key; ``IdentitiesOnly=yes``
    keeps ssh-agent from trying unrelated keys first;
    ``StrictHostKeyChecking=accept-new`` lets first-time hosts connect
    without manual ``known_hosts`` seeding while still pinning on
    subsequent connects (standard OpenSSH TOFU).
    """
    if not is_ssh_url(url) or not ssh_keys.exists():
        return None
    key_path = ssh_keys.private_key_path().resolve()
    cmd = f'ssh -i "{key_path}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'
    return {"GIT_SSH_COMMAND": cmd}


#: Schemes whose authority can carry ``user:password@``. An scp-style
#: ``git@host:path`` URL has no scheme at all and is left alone: its colon
#: separates host from path, and splitting on it would corrupt every SSH
#: remote in the app. ``ssh://`` keeps its user because that is the account
#: name, not a secret, and git needs it to connect.
_CREDENTIAL_SCHEMES = frozenset({"http", "https"})


def split_url_credentials(url: str) -> tuple[str, str | None, str | None]:
    """Split ``url`` into (credential-free URL, username, secret).

    The username and secret are ``None`` when the URL carries none, and
    the returned URL is then the input with surrounding whitespace
    removed - byte-for-byte otherwise, so a caller can store it without
    worrying that a round-trip rewrote something.

    A percent-encoded secret is decoded, because that is what git would
    have sent and the credential helper has to send the same thing.

    Never raises: a string this cannot parse comes back unchanged, so a
    malformed URL stays the caller's 400 rather than becoming a 500.
    """
    candidate = url.strip()
    if not candidate:
        return candidate, None, None
    try:
        parts = urlsplit(candidate)
    except ValueError:
        return candidate, None, None
    if parts.scheme.lower() not in _CREDENTIAL_SCHEMES:
        return candidate, None, None
    if not parts.hostname:
        return candidate, None, None
    username = unquote(parts.username) if parts.username else None
    secret = unquote(parts.password) if parts.password else None
    if username is None and secret is None:
        return candidate, None, None
    netloc = parts.hostname
    if parts.port:
        netloc = f"{netloc}:{parts.port}"
    clean = urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
    return clean, username, secret


#: The username git is told to use alongside a PAT. GitHub ignores the
#: value for a token; GitLab and Bitbucket accept it. It only has to be
#: non-empty.
PAT_USERNAME = "x-access-token"

#: The environment variable the credential helper reads the token from.
#: The environment rather than a file or the command line (#989):
#: ``/proc/<pid>/environ`` is readable by the process owner alone, while
#: ``.git/config`` is readable by anything that can read the working copy
#: - a backup job, a sync client, a crash dump - and argv is readable by
#: every process of the same user.
PAT_ENV_VAR = "BIBLIOGON_GIT_PAT"


#: A one-shot git credential helper, as the shell function form git
#: accepts after ``!``. It answers only the ``get`` action - ``store``
#: and ``erase`` are no-ops, so git cannot persist the token anywhere -
#: and it reads the password from the environment, so the token appears
#: neither in the config file nor in the process arguments.
def _credential_helper(username: str) -> str:
    """The helper shell function, for one username."""
    return (
        '!f() { test "$1" = get && printf "username='
        + username
        + '\\npassword=%s\\n" "$'
        + PAT_ENV_VAR
        + '"; }; f'
    )


_CREDENTIAL_HELPER = _credential_helper(PAT_USERNAME)


def secret_git_env(url: str, secret: str | None, *, username: str | None = None) -> dict[str, str]:
    """The environment that authenticates ``url`` with ``secret``.

    The same one-shot credential helper :func:`pat_git_config` builds, but
    for a secret handed in directly rather than loaded for a book - the
    import path has no book yet, so there is nothing stored to load
    (#1072). Delivered through git's own ``GIT_CONFIG_COUNT`` /
    ``GIT_CONFIG_KEY_n`` / ``GIT_CONFIG_VALUE_n`` (git >= 2.31) rather
    than ``-c`` arguments, so the helper never appears in argv either;
    GitPython also ``shlex``-splits its ``multi_options``, which a shell
    function with spaces in it does not survive.

    Returns an empty dict when there is nothing to authenticate with, so
    a caller can always splat the result and git falls back to the user's
    ambient credentials.

    Example::

        env = secret_git_env(clean_url, secret, username=user)
        Repo.clone_from(clean_url, dest, env=env or None)
    """
    if not secret:
        return {}
    scheme = url.split("://", 1)[0].lower() if "://" in url else ""
    if scheme not in ("http", "https"):
        return {}
    helper = _credential_helper(username or PAT_USERNAME)
    return {
        # Two keys with the same name: the empty one resets any ambient
        # helper list so a globally configured helper can neither see this
        # request nor cache the token.
        "GIT_CONFIG_COUNT": "2",
        "GIT_CONFIG_KEY_0": "credential.helper",
        "GIT_CONFIG_VALUE_0": "",
        "GIT_CONFIG_KEY_1": "credential.helper",
        "GIT_CONFIG_VALUE_1": helper,
        PAT_ENV_VAR: secret,
        "GIT_TERMINAL_PROMPT": "0",
    }


def pat_git_config(url: str, book_id: str) -> tuple[list[str], dict[str, str]] | None:
    """Return the ``git -c`` values and environment that authenticate ``url``.

    ``None`` when the URL is not http/https or no PAT is stored for the
    book, in which case the caller leaves the invocation untouched and
    git falls back to the user's ambient credentials.

    The first ``credential.helper`` value is empty on purpose: git treats
    an empty value as "reset the helper list", so an ambient helper
    configured globally cannot see this request and cannot cache the
    token. ``GIT_TERMINAL_PROMPT=0`` makes a rejected or missing token
    fail instead of blocking on a prompt no one can answer.

    Example::

        auth = pat_git_config(url, book_id)
        if auth is not None:
            options, env = auth
    """
    scheme = url.split("://", 1)[0] if "://" in url else ""
    if scheme not in ("http", "https"):
        return None
    pat = load_pat(book_id)
    if not pat:
        return None
    options = ["credential.helper=", f"credential.helper={_CREDENTIAL_HELPER}"]
    env = {PAT_ENV_VAR: pat, "GIT_TERMINAL_PROMPT": "0"}
    return options, env


@contextlib.contextmanager
def authenticated_git(repo: git.Repo, *, url: str, book_id: str) -> Iterator[None]:
    """Make the per-book credential available to ``repo``'s git calls.

    Replaces the older pattern of embedding the PAT in the remote URL and
    calling ``Remote.set_url``, which is ``git remote set-url`` and writes
    the token into ``.git/config`` (#989). Nothing is written to disk
    here: the credential helper is passed as a command-line config value
    and the token itself lives in the subprocess environment, for the
    duration of the ``with`` block and no longer.

    Covers SSH remotes too, so a call site needs one context manager
    rather than two parallel branches. Both are no-ops when the book has
    no stored credential for that URL shape.

    Example::

        with authenticated_git(repo, url=origin_url, book_id=book_id):
            repo.remotes.origin.push(refspec=f"{branch}:{branch}")
    """
    auth = pat_git_config(url, book_id)
    env: dict[str, str] = {}
    if auth is not None:
        options, env = auth
        repo.git.set_persistent_git_options(c=options)
    ssh = ssh_env(url)
    if ssh:
        env = {**env, **ssh}
    previous_env = repo.git.update_environment(**env) if env else {}
    try:
        yield
    finally:
        if auth is not None:
            repo.git.set_persistent_git_options()
        if previous_env:
            repo.git.update_environment(**previous_env)
