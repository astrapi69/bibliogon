"""Guard: the E2E settings reset restores every writable settings key (#958).

``resetSettings()`` in ``e2e/helpers/api.ts`` is the autouse per-test
reset. It used to restore two of the nine keys ``AppSettingsUpdate``
accepts, so seven leaked from whichever spec wrote them last to every
spec after it - a source of run-level nondeterminism, where a spec fails
on every retry within one run and is green in the next (#954).

A hand-maintained list in a TypeScript helper cannot see a field added to
a Pydantic model, so this compares the two directly: adding a writable
settings field forces the reset to cover it, rather than leaving the next
leak to a nightly that will not reproduce. Same discipline as
``test_plugin_handlists.py``, applied across the language boundary.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.routers.settings import AppSettingsUpdate

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_HELPER = _REPO_ROOT / "e2e" / "helpers" / "api.ts"

#: The object literal the helper PATCHes, between its own markers. Reading
#: the whole function would pick up unrelated keys from the dashboard
#: override, so the list is declared once and read from there.
_RESTORED_RE = re.compile(
    r"const RESTORED_SETTINGS_KEYS = \[(.*?)\] as const;", re.DOTALL
)


def _restored_keys() -> set[str]:
    match = _RESTORED_RE.search(_HELPER.read_text(encoding="utf-8"))
    assert match, (
        "e2e/helpers/api.ts has no RESTORED_SETTINGS_KEYS array - "
        "was it renamed? This guard reads that declaration."
    )
    return set(re.findall(r'"([a-z_]+)"', match.group(1)))


def test_the_guard_finds_the_declaration() -> None:
    """A renamed array must fail loudly rather than pass on an empty set."""
    assert _restored_keys(), "extractor found the array but no keys in it"


def test_every_writable_settings_key_is_restored() -> None:
    writable = set(AppSettingsUpdate.model_fields)
    missing = writable - _restored_keys()
    assert not missing, (
        "AppSettingsUpdate accepts keys the E2E reset does not restore, so a "
        "spec that writes one leaks it into every later spec: "
        + ", ".join(sorted(missing))
    )


def test_no_restored_key_is_unknown_to_the_schema() -> None:
    writable = set(AppSettingsUpdate.model_fields)
    unknown = _restored_keys() - writable
    assert not unknown, (
        "the E2E reset restores keys PATCH /settings/app would ignore, so the "
        "reset silently does nothing for them: " + ", ".join(sorted(unknown))
    )
