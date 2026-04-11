"""Structural consistency tests for the i18n YAMLs.

The goal is NOT full translation-completeness — that is tracked as a
roadmap item (I-03) — but to catch *structural* drift like the one
discovered in the v0.11 -> v0.12 audit:

1. A new subsection gets inserted at the wrong indent level, silently
   moving ~50 keys from ``ui.settings`` into ``ui.translation`` so the
   frontend ``t("ui.settings.foo")`` lookups fall back to the hardcoded
   English default instead of the localised string.
2. A bare ``on:`` / ``off:`` key in YAML gets parsed as a Python
   boolean because PyYAML follows YAML 1.1, silently dropping the key.

The tests here keep EN as the reference and verify, for every language,
that the same top-level ``ui.*`` sections exist and that no section has
non-string keys. They do not require that every leaf key is translated
(that's I-03) — only that the skeleton matches.
"""

from pathlib import Path

import pytest
import yaml


I18N_DIR = Path(__file__).resolve().parent.parent / "config" / "i18n"
REFERENCE = "en"
TRANSLATIONS = ["de", "es", "fr", "el", "pt", "tr", "ja"]


def _load(lang: str) -> dict:
    path = I18N_DIR / f"{lang}.yaml"
    assert path.exists(), f"missing i18n file: {path}"
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _ui(doc: dict) -> dict:
    ui = doc.get("ui")
    assert isinstance(ui, dict), "root 'ui' section must be a dict"
    return ui


def _section_roots(ui: dict) -> set[str]:
    """Top-level child keys of ``ui`` (e.g. 'settings', 'dashboard')."""
    return {str(k) for k in ui.keys()}


def test_reference_loads_cleanly():
    ui = _ui(_load(REFERENCE))
    assert ui, "en.yaml ui section empty"


@pytest.mark.parametrize("lang", TRANSLATIONS)
def test_no_bool_keys_anywhere(lang: str):
    """YAML 1.1 ``on: value`` becomes ``True: value``. Catch this
    regression in any section so we never lose a string-key again.
    """
    doc = _load(lang)

    def walk(node, path=""):
        if isinstance(node, dict):
            for k, v in node.items():
                assert not isinstance(k, bool), (
                    f"{lang}.yaml has a bool YAML key at {path or '<root>'}: "
                    f"{k!r} -> {v!r}. Quote the key as \"{str(k).lower()}\" "
                    f"to keep PyYAML from interpreting it as a YAML 1.1 bool."
                )
                walk(v, f"{path}.{k}" if path else str(k))

    walk(doc)


# Scope for the section-root match test. Currently only DE is
# maintained in lockstep with EN; the other six languages have known
# gaps from before the v0.11 -> v0.12 audit and are tracked as roadmap
# item I-03. Expand this list as I-03 is worked through.
_FULLY_MAINTAINED_LANGUAGES = ["de"]


@pytest.mark.parametrize("lang", _FULLY_MAINTAINED_LANGUAGES)
def test_top_level_sections_match_reference(lang: str):
    """Every top-level ``ui.*`` section in EN must exist in the translation.

    This catches the placement bug found in the v0.12.0 audit where
    ``ui.translation`` was inserted *inside* ``ui.settings``, effectively
    cutting the settings block short. The test does not require leaf
    keys to match — just the section roots.

    Scoped to DE for now because the other six languages still have
    missing sections from older snapshots (roadmap I-03). Expanding
    this parametrize to include more languages is the completion
    criterion for I-03.
    """
    ref_ui = _ui(_load(REFERENCE))
    lang_ui = _ui(_load(lang))

    missing_sections = _section_roots(ref_ui) - _section_roots(lang_ui)
    assert not missing_sections, (
        f"{lang}.yaml is missing top-level ui sections: {sorted(missing_sections)}"
    )


# Keys we absolutely cannot lose from ``ui.settings`` because multiple
# frontend call sites depend on them and the hardcoded fallback is
# only ever an English string. Derived from the v0.12.0 bug: these are
# exactly the keys that got silently moved into ``ui.translation``.
_CRITICAL_SETTINGS_KEYS = {
    "free", "premium", "active", "inactive", "standard",
    "off", "on",
    "expand_settings", "collapse", "remove_plugin",
    "plugin_export", "plugin_help", "plugin_getstarted",
    "license_required", "enter_license",
}


@pytest.mark.parametrize("lang", [REFERENCE, "de"])
def test_critical_settings_keys_present(lang: str):
    """DE and EN must be fully structurally correct — other languages
    still have known gaps that are tracked as I-03 in the roadmap.
    """
    settings = _ui(_load(lang)).get("settings", {})
    missing = _CRITICAL_SETTINGS_KEYS - set(settings.keys())
    assert not missing, (
        f"{lang}.yaml ui.settings is missing critical keys: {sorted(missing)}. "
        f"This is the regression shape from the v0.12.0 i18n audit: a new "
        f"subsection was likely inserted inside ui.settings, moving these "
        f"keys into the wrong section."
    )


@pytest.mark.parametrize("lang", TRANSLATIONS)
def test_translation_section_is_separate_from_settings(lang: str):
    """``ui.translation`` must not accidentally nest under ``ui.settings``.

    Direct check for the specific bug shape: the translation panel's
    keys (``provider``, ``deepl_api_key``) must live in their own
    top-level section, not inside ``ui.settings``.
    """
    ui = _ui(_load(lang))
    if "translation" not in ui:
        # Some languages may not have the translation subsection at all
        # (tracked via I-03). That is allowed as long as settings is
        # structurally correct.
        return
    settings = ui.get("settings", {})
    for key in ("provider", "deepl_api_key", "lmstudio_url"):
        assert key not in settings, (
            f"{lang}.yaml has translation key {key!r} inside ui.settings. "
            f"This is the regression shape where a new subsection was "
            f"inserted at the wrong indent level."
        )
