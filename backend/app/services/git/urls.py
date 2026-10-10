"""Credential handling for git remote URLs (#1072).

A user importing a private repository pastes the shape that works on the
command line::

    https://x-access-token:TOKEN@github.com/owner/repo.git

git accepts it, and then keeps it: the URL goes into the clone's
``remote.origin.url``, into whatever the caller stores, and into
whatever the caller logs. This module is the one place that takes the
credential back out, so the rest of the code can pass the URL around
without carrying a secret in it.

The credential itself reaches git through
:func:`app.services.git.credentials.secret_git_env` - the environment,
not argv and not a config file - so nothing here needs to put it back.

@example
    clean, user, secret = split_url_credentials(pasted)
    env = secret_git_env(clean, secret, username=user)
    Repo.clone_from(clean, dest, env=env)
"""

from __future__ import annotations

from urllib.parse import unquote, urlsplit, urlunsplit

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
