"""#890: the A+ ruleset is mirrored into the offline seed.

A+ Content is gated desktop-only today because both halves of it live in
Python: the prompt building and the deterministic validator in
``bibliogon_aplus``. The validator is the half that has no business being
server-side - it reads a versioned YAML and returns findings, with no
model call and no database. Porting it to TypeScript needs the ruleset in
the browser, and the ruleset has no API endpoint, so the offline seed is
its only route there.

The seed carries the NORMALIZED ruleset - what ``load_ruleset`` returns,
not the raw YAML. The defaults, the per-genre fallbacks and the
``soft_words.default`` unwrapping are resolved once in Python rather than
re-implemented in TypeScript, which is the same reason the
article-platform seed passes through ``PlatformSchemaOut`` (#1015): a
seeded object and the server's own object are the same object.

These cases pin the SHAPE the TypeScript port will consume plus the
version stamp. Byte-equality against a fresh generation is
``make verify-seed-drift``'s job - it regenerates everything into a temp
dir and diffs, so this file does not repeat that.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_PATH = REPO_ROOT / "frontend" / "src" / "storage" / "seed" / "seed-aplus-ruleset.json"
RULESET_PATH = (
    REPO_ROOT / "plugins" / "bibliogon-plugin-aplus" / "bibliogon_aplus" / "rules" / "ruleset.yaml"
)


@pytest.fixture(scope="module")
def seed() -> dict:
    assert SEED_PATH.is_file(), (
        f"{SEED_PATH} is missing - run `make generate-seed-data` and commit the result"
    )
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def raw_yaml() -> dict:
    return yaml.safe_load(RULESET_PATH.read_text(encoding="utf-8"))


def test_version_matches_the_yaml(seed: dict, raw_yaml: dict) -> None:
    """A ruleset bump without a reseed must fail here, not at the user."""
    assert seed["version"] == str(raw_yaml["version"])


def test_schema_limits_are_the_amazon_caps(seed: dict, raw_yaml: dict) -> None:
    assert seed["schema_limits"] == raw_yaml["schema_limits"]


def test_every_yaml_language_is_seeded(seed: dict, raw_yaml: dict) -> None:
    assert set(seed["languages"]) == set(raw_yaml["languages"])


def test_each_language_carries_the_five_normalized_keys(seed: dict) -> None:
    """The keys are the ``LanguageRules`` fields, already flattened.

    ``soft_words_default`` is the unwrapped ``soft_words.default`` list -
    the normalization the TypeScript port must not have to repeat.
    """
    expected = {
        "marketing_imperatives",
        "price_shipping_terms",
        "soft_words_default",
        "genre_escalations",
        "leading_only_imperatives",
    }
    for code, rules in seed["languages"].items():
        assert set(rules) == expected, f"language {code}"
        assert isinstance(rules["genre_escalations"], dict), f"language {code}"


def test_the_fallback_language_is_named_and_present(seed: dict) -> None:
    """``for_language`` falls back to this code, so the port needs it."""
    assert seed["default_language"] == "en"
    assert seed["default_language"] in seed["languages"]


def test_supported_languages_are_the_loader_constant(seed: dict) -> None:
    from bibliogon_aplus.rules import SUPPORTED_LANGUAGES

    assert seed["supported_languages"] == list(SUPPORTED_LANGUAGES)


def test_image_style_resolves_the_default_and_the_genre_overrides(seed: dict) -> None:
    style = seed["image_style"]
    assert set(style) == {
        "aspect_ratios",
        "target_pixel_sizes",
        "default_model_hint",
        "default_style_flags",
        "genre_model_hints",
        "genre_style_flags",
    }
    assert style["default_model_hint"]
    assert set(style["genre_model_hints"]) == set(style["genre_style_flags"])


def test_competitor_brands_and_retry_cap_are_carried(seed: dict, raw_yaml: dict) -> None:
    assert seed["competitor_brands"] == list(raw_yaml.get("competitor_brands") or [])
    assert isinstance(seed["max_regeneration_retries"], int)


def test_the_seed_equals_the_loader_for_the_fallback_language(seed: dict) -> None:
    """One end-to-end comparison, so a wrong normalization cannot pass.

    The structural cases above would all hold for a seed built from the
    raw YAML; this one fails unless the values came through
    ``load_ruleset``.
    """
    from bibliogon_aplus.rules import get_ruleset

    english = get_ruleset().for_language("en")
    seeded = seed["languages"]["en"]
    assert seeded["marketing_imperatives"] == list(english.marketing_imperatives)
    assert seeded["soft_words_default"] == list(english.soft_words_default)
    assert seeded["leading_only_imperatives"] == list(english.leading_only_imperatives)
