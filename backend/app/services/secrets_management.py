"""External-secrets detection.

Extracted from ``routers/settings.py`` (God-file split #4, 2026-06-14).
Reports whether the user has migrated secrets out of the project tree
(override file or env-var), which the Settings UI reads to hide secret
inputs and the PATCH endpoint uses to defensively strip secret fields.
"""

import os


def secrets_managed_externally() -> bool:
    """True when the user has migrated secrets to the override file OR set
    the ``BIBLIOGON_AI_API_KEY`` env-var.

    The ``_get_user_override_path`` import is deferred to call time to
    avoid a circular import (``app.main`` imports the settings router at
    load).
    """
    from app.main import _get_user_override_path

    if _get_user_override_path().exists():
        return True
    if os.environ.get("BIBLIOGON_AI_API_KEY"):
        return True
    return False
