"""Tests for the ruleset loader (#825)."""

from __future__ import annotations

import pytest
import yaml
from bibliogon_aplus.rules import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, get_ruleset, load_ruleset


class TestVendoredRuleset:
    def test_loads_without_error(self) -> None:
        rules = get_ruleset()
        assert rules.version

    def test_every_supported_language_is_present(self) -> None:
        rules = get_ruleset()
        for language in SUPPORTED_LANGUAGES:
            assert language in rules.languages

    def test_schema_limits_match_the_spec(self) -> None:
        rules = get_ruleset()
        assert rules.schema_limits["short_description"] == 300
        assert rules.schema_limits["bullet_heading"] == 160
        assert rules.schema_limits["bullet_body"] == 1000
        assert rules.schema_limits["alt_text"] == 200

    def test_get_ruleset_returns_the_same_cached_instance(self) -> None:
        assert get_ruleset() is get_ruleset()


class TestForLanguage:
    def test_returns_the_matching_language(self) -> None:
        rules = get_ruleset()
        de_rules = rules.for_language("de")
        assert "Lernen Sie" in de_rules.marketing_imperatives

    def test_unknown_language_falls_back_to_the_default(self) -> None:
        rules = get_ruleset()
        fallback = rules.for_language("xx")
        assert fallback is rules.languages[DEFAULT_LANGUAGE]


class TestLeadingOnlyImperatives:
    """#828: words too common for an anywhere-match block get a
    dedicated, opt-in leading_only_imperatives list instead."""

    def test_english_leading_only_words_load_from_the_vendored_ruleset(self) -> None:
        rules = get_ruleset()
        en_rules = rules.for_language("en")
        assert set(en_rules.leading_only_imperatives) == {"Start", "Build", "Get", "Take"}

    def test_leading_only_words_are_not_duplicated_in_the_anywhere_match_list(self) -> None:
        rules = get_ruleset()
        en_rules = rules.for_language("en")
        assert not set(en_rules.leading_only_imperatives) & set(en_rules.marketing_imperatives)

    def test_a_language_without_the_key_defaults_to_an_empty_tuple(self) -> None:
        rules = get_ruleset()
        de_rules = rules.for_language("de")
        assert de_rules.leading_only_imperatives == ()


class TestEscalatedWords:
    def test_kinderbuch_escalates_its_configured_words(self) -> None:
        rules = get_ruleset()
        en_rules = rules.for_language("en")
        assert "violence" in en_rules.escalated_words("kinderbuch")

    def test_no_genre_key_escalates_nothing(self) -> None:
        rules = get_ruleset()
        en_rules = rules.for_language("en")
        assert en_rules.escalated_words(None) == frozenset()

    def test_unknown_genre_key_escalates_nothing(self) -> None:
        rules = get_ruleset()
        en_rules = rules.for_language("en")
        assert en_rules.escalated_words("not-a-real-genre") == frozenset()


class TestMalformedRuleset:
    def test_missing_required_top_level_key_raises(self, tmp_path) -> None:
        broken = tmp_path / "broken.yaml"
        broken.write_text(yaml.safe_dump({"version": "1"}), encoding="utf-8")
        with pytest.raises(ValueError, match="missing required key"):
            load_ruleset(broken)

    def test_missing_default_language_raises(self, tmp_path) -> None:
        broken = tmp_path / "broken.yaml"
        broken.write_text(
            yaml.safe_dump(
                {
                    "version": "1",
                    "schema_limits": {},
                    "languages": {"de": {}},
                    "image_style": {"default": {}},
                }
            ),
            encoding="utf-8",
        )
        with pytest.raises(ValueError, match="fallback"):
            load_ruleset(broken)

    def test_non_mapping_document_raises(self, tmp_path) -> None:
        broken = tmp_path / "broken.yaml"
        broken.write_text("- just\n- a\n- list\n", encoding="utf-8")
        with pytest.raises(ValueError, match="expected a mapping"):
            load_ruleset(broken)
