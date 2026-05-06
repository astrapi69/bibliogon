"""Minimal JSON-backed i18n for the launcher.

Catalog files live under ``bibliogon_launcher/locales/{en,de}.json``
(plus future languages). At module load they are read into an
in-memory dict; ``t(key)`` looks up the active language and falls
back to English when a key is missing.

Locale resolution priority:
1. Explicit ``settings.language`` value (set via Settings dialog).
2. OS locale: ``de_*`` -> ``de``; otherwise ``en``.

The OS-locale step delegates to :func:`bibliogon_launcher.ui._current_lang`
so there is one source of truth for locale detection across the
launcher; if that helper is rewritten the i18n layer follows.

PyInstaller note: ``locales/*.json`` is included via ``datas`` in
``bibliogon-launcher.spec``. ``importlib.resources.files`` reads
through the bundled tree without manual ``sys._MEIPASS`` handling.
"""

from __future__ import annotations

import json
import logging
from importlib import resources
from typing import Any

logger = logging.getLogger("bibliogon_launcher.i18n")

_CATALOG: dict[str, dict[str, str]] = {}
_ACTIVE_LANG: str = "en"
_FALLBACK_LANG: str = "en"


def _load_catalogs() -> None:
    """Read every ``locales/*.json`` shipped with the package."""
    global _CATALOG
    catalogs: dict[str, dict[str, str]] = {}
    try:
        locales_dir = resources.files("bibliogon_launcher").joinpath("locales")
    except (ModuleNotFoundError, FileNotFoundError) as exc:
        logger.warning("locales directory missing: %s", exc)
        _CATALOG = {}
        return
    for entry in locales_dir.iterdir():
        if entry.suffix != ".json":
            continue
        try:
            catalogs[entry.stem] = json.loads(entry.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("could not load locale %s: %s", entry.name, exc)
    _CATALOG = catalogs


def init(settings_language: str | None = None) -> None:
    """Load catalogs and resolve the active language.

    Call once at launcher startup before any UI string is rendered.
    Subsequent calls hot-swap the language (used by the Settings
    dialog after the user picks a new one).
    """
    if not _CATALOG:
        _load_catalogs()
    set_language(_resolve_language(settings_language))


def _resolve_language(settings_language: str | None) -> str:
    if settings_language and settings_language in _CATALOG:
        return settings_language
    # Single source of truth for OS-locale detection: the existing
    # helper in ui.py. Imported lazily to avoid a circular import at
    # module load (ui.py imports nothing from i18n at module level
    # currently, but future wiring shouldn't create one).
    from bibliogon_launcher.ui import _current_lang

    detected = _current_lang()
    return detected if detected in _CATALOG else _FALLBACK_LANG


def t(key: str, **kwargs: Any) -> str:
    """Translate ``key`` for the active language.

    Falls back to the English catalog, then to the key itself if no
    catalog has it. ``kwargs`` are passed through ``str.format`` for
    interpolation, e.g. ``t("welcome.size", mb=800)``.
    """
    text = _CATALOG.get(_ACTIVE_LANG, {}).get(key)
    if text is None:
        text = _CATALOG.get(_FALLBACK_LANG, {}).get(key, key)
    if kwargs:
        try:
            return text.format(**kwargs)
        except (KeyError, IndexError) as exc:
            logger.warning("string format failed for %s: %s", key, exc)
            return text
    return text


def set_language(lang: str) -> None:
    """Switch the active language. No-op for unknown codes."""
    global _ACTIVE_LANG
    if lang in _CATALOG:
        _ACTIVE_LANG = lang


def active_language() -> str:
    return _ACTIVE_LANG


def available_languages() -> list[str]:
    """Sorted list of language codes whose catalog loaded successfully."""
    return sorted(_CATALOG.keys())
