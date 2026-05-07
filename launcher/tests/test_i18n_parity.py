"""Launcher i18n catalog parity tests.

Mirrors the backend's ``test_i18n_parity.py`` shape but for the
launcher's JSON catalogs under
``bibliogon_launcher/locales/{en,de,el,es,fr,pt,tr,ja}.json``.

Three contracts enforced:

1. **Key parity**: every catalog has the same content keys as
   ``en.json`` (no missing, no extra). The ``_meta`` block in
   pending-review catalogs is excluded from the key set.
2. **Placeholder parity**: every ``{placeholder}`` token in an
   EN string also appears in every translated string for the
   same key, with no extras. Drift here breaks runtime
   ``str.format(**kwargs)`` calls.
3. **Review-status marker contract**: pending-review catalogs
   (pt, tr, ja) MUST carry ``_meta.review_status == "pending
   native speaker"``; user-validated catalogs (en, de, el, fr,
   es) MUST NOT carry an ``_meta`` block.

Failure messages are actionable: they name the key, the
language, and the expected fix.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

LOCALES_DIR = (
    Path(__file__).resolve().parent.parent
    / "bibliogon_launcher"
    / "locales"
)
REFERENCE_LANG = "en"
USER_VALIDATED_LANGS = ("en", "de", "el", "es", "fr")
PENDING_REVIEW_LANGS = ("pt", "tr", "ja")
ALL_LANGS = USER_VALIDATED_LANGS + PENDING_REVIEW_LANGS

PLACEHOLDER_RE = re.compile(r"\{[a-z_][a-z0-9_]*\}")
PENDING_MARKER = "pending native speaker"


def _load(lang: str) -> dict[str, object]:
    path = LOCALES_DIR / f"{lang}.json"
    assert path.exists(), f"Missing launcher i18n catalog: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


def _content_keys(catalog: dict[str, object]) -> set[str]:
    """Catalog keys excluding the optional ``_meta`` block."""
    return {k for k in catalog.keys() if not k.startswith("_")}


@pytest.mark.parametrize("lang", [lang for lang in ALL_LANGS if lang != REFERENCE_LANG])
def test_catalog_has_same_content_keys_as_en(lang: str) -> None:
    en_keys = _content_keys(_load(REFERENCE_LANG))
    lang_keys = _content_keys(_load(lang))
    missing = en_keys - lang_keys
    extra = lang_keys - en_keys
    assert not missing, (
        f"{lang}.json missing keys present in en.json: {sorted(missing)}. "
        f"Run a fresh translation pass for those keys."
    )
    assert not extra, (
        f"{lang}.json has keys not in en.json: {sorted(extra)}. "
        f"Either add the corresponding key to en.json (with a real "
        f"English value) or remove the orphan key from {lang}.json."
    )


@pytest.mark.parametrize("lang", [lang for lang in ALL_LANGS if lang != REFERENCE_LANG])
def test_catalog_values_are_non_empty_strings(lang: str) -> None:
    catalog = _load(lang)
    en_keys = _content_keys(_load(REFERENCE_LANG))
    for key in en_keys:
        value = catalog.get(key)
        assert isinstance(value, str), (
            f"{lang}.json key {key!r} is {type(value).__name__}, "
            f"expected str."
        )
        assert value.strip(), (
            f"{lang}.json key {key!r} is empty or whitespace-only. "
            f"Provide a real translation or fall back to the EN "
            f"reference if the language genuinely shares the term."
        )


@pytest.mark.parametrize("lang", [lang for lang in ALL_LANGS if lang != REFERENCE_LANG])
def test_placeholder_parity_with_en(lang: str) -> None:
    en = _load(REFERENCE_LANG)
    catalog = _load(lang)
    for key in _content_keys(en):
        en_placeholders = sorted(PLACEHOLDER_RE.findall(en[key]))
        lang_placeholders = sorted(PLACEHOLDER_RE.findall(catalog[key]))
        assert en_placeholders == lang_placeholders, (
            f"{lang}.json key {key!r} has placeholder set "
            f"{lang_placeholders} but EN reference has "
            f"{en_placeholders}. Drift breaks str.format(**kwargs) "
            f"at runtime — fix the translation to include the same "
            f"{{name}} tokens as EN, or fix EN if the placeholder "
            f"itself was a mistake."
        )


@pytest.mark.parametrize("lang", PENDING_REVIEW_LANGS)
def test_pending_review_catalogs_carry_marker(lang: str) -> None:
    """pt / tr / ja MUST declare pending-review status.

    Catches the case where a pending-review catalog is added
    without the _meta marker (so REVIEW_STATUS.md and the
    catalog itself drift), or where a marker was accidentally
    deleted by a translation pass that did NOT actually
    complete a full native-speaker review.
    """
    catalog = _load(lang)
    meta = catalog.get("_meta")
    assert isinstance(meta, dict), (
        f"{lang}.json is in PENDING_REVIEW_LANGS but missing the "
        f"_meta block. Add a _meta dict at the top with at minimum "
        f'"review_status": "{PENDING_MARKER}", or move {lang!r} into '
        f"USER_VALIDATED_LANGS if it has been reviewed by a native "
        f"speaker."
    )
    assert meta.get("review_status") == PENDING_MARKER, (
        f"{lang}.json _meta.review_status is "
        f"{meta.get('review_status')!r}, expected {PENDING_MARKER!r}. "
        f"If a native-speaker review has completed, drop the entire "
        f"_meta block AND move {lang!r} into USER_VALIDATED_LANGS in "
        f"this test file."
    )


@pytest.mark.parametrize("lang", USER_VALIDATED_LANGS)
def test_user_validated_catalogs_have_no_meta_marker(lang: str) -> None:
    """User-validated catalogs MUST NOT carry the pending-review
    marker. Catches the case where a translation pass adds a marker
    to an already-validated catalog (e.g. someone fixing a typo and
    accidentally re-flagging).
    """
    catalog = _load(lang)
    if "_meta" not in catalog:
        return
    review_status = catalog["_meta"].get("review_status")
    assert review_status != PENDING_MARKER, (
        f"{lang}.json carries _meta.review_status = "
        f"{PENDING_MARKER!r} but is in USER_VALIDATED_LANGS. "
        f"Either remove the _meta block (preferred when the catalog "
        f"is genuinely validated) or move {lang!r} into "
        f"PENDING_REVIEW_LANGS."
    )


def test_all_known_lang_files_exist() -> None:
    """Sanity guard: every language declared in this test must
    have a JSON file. Catches the case where a language code is
    added to USER_VALIDATED_LANGS or PENDING_REVIEW_LANGS without
    actually creating the catalog file.
    """
    for lang in ALL_LANGS:
        path = LOCALES_DIR / f"{lang}.json"
        assert path.exists(), (
            f"Test declares {lang!r} as a known launcher language "
            f"but {path} does not exist."
        )


def test_no_orphan_lang_files() -> None:
    """Sanity guard: every JSON file under locales/ must be
    declared in ALL_LANGS. Catches a stray catalog that was
    dropped in but not registered with the test harness (and so
    might silently skip parity checks).
    """
    json_files = sorted(p.stem for p in LOCALES_DIR.glob("*.json"))
    for stem in json_files:
        assert stem in ALL_LANGS, (
            f"locales/{stem}.json exists but {stem!r} is not in "
            f"ALL_LANGS. Either add the language code to "
            f"USER_VALIDATED_LANGS or PENDING_REVIEW_LANGS, or "
            f"remove the orphan file."
        )
