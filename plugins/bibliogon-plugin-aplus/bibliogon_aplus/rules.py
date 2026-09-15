"""Loader for the A+ Content validation + image-style ruleset (#825).

The rules live in ``rules/ruleset.yaml`` as versioned, per-language
data - never hardcoded in Python and never part of the AI prompt, so
the deterministic validator can be unit-tested independently of any
AI provider and the rules stay editable without a code change.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

RULESET_PATH = Path(__file__).parent / "rules" / "ruleset.yaml"

DEFAULT_LANGUAGE = "en"
SUPPORTED_LANGUAGES = ("de", "en", "fr", "es")


@dataclass(frozen=True)
class LanguageRules:
    marketing_imperatives: tuple[str, ...]
    price_shipping_terms: tuple[str, ...]
    soft_words_default: tuple[str, ...]
    genre_escalations: dict[str, tuple[str, ...]] = field(default_factory=dict)

    def escalated_words(self, genre_key: str | None) -> frozenset[str]:
        """Soft words that become hard errors for the given genre key."""
        if not genre_key:
            return frozenset()
        return frozenset(self.genre_escalations.get(genre_key, ()))


@dataclass(frozen=True)
class ImageStyleRules:
    aspect_ratios: dict[str, str]
    target_pixel_sizes: dict[str, str]
    default_model_hint: str
    default_style_flags: tuple[str, ...]
    genre_model_hints: dict[str, str]
    genre_style_flags: dict[str, tuple[str, ...]]

    def style_for(self, genre_key: str | None) -> tuple[str, tuple[str, ...]]:
        """Return ``(model_hint, style_flags)`` for the given genre key,
        falling back to the default style when the genre has no override."""
        if genre_key and genre_key in self.genre_model_hints:
            return self.genre_model_hints[genre_key], self.genre_style_flags[genre_key]
        return self.default_model_hint, self.default_style_flags


@dataclass(frozen=True)
class Ruleset:
    version: str
    schema_limits: dict[str, int]
    languages: dict[str, LanguageRules]
    competitor_brands: tuple[str, ...]
    max_regeneration_retries: int
    image_style: ImageStyleRules

    def for_language(self, language: str) -> LanguageRules:
        """Rules for ``language``, falling back to English for an
        unsupported code rather than raising - the validator should
        still run something sensible instead of crashing on a typo."""
        return self.languages.get(language, self.languages[DEFAULT_LANGUAGE])


def _load_raw(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected a mapping at the document root")
    return data


def _build_language_rules(raw: dict[str, Any]) -> LanguageRules:
    escalations = raw.get("genre_escalations") or {}
    return LanguageRules(
        marketing_imperatives=tuple(raw.get("marketing_imperatives") or ()),
        price_shipping_terms=tuple(raw.get("price_shipping_terms") or ()),
        soft_words_default=tuple((raw.get("soft_words") or {}).get("default") or ()),
        genre_escalations={key: tuple(value) for key, value in escalations.items()},
    )


def _build_image_style(raw: dict[str, Any]) -> ImageStyleRules:
    default = raw.get("default") or {}
    genres = raw.get("genres") or {}
    return ImageStyleRules(
        aspect_ratios=dict(raw.get("aspect_ratios") or {}),
        target_pixel_sizes=dict(raw.get("target_pixel_sizes") or {}),
        default_model_hint=default.get("model_hint", ""),
        default_style_flags=tuple(default.get("style_flags") or ()),
        genre_model_hints={key: value.get("model_hint", "") for key, value in genres.items()},
        genre_style_flags={
            key: tuple(value.get("style_flags") or ()) for key, value in genres.items()
        },
    )


def load_ruleset(path: Path = RULESET_PATH) -> Ruleset:
    """Parse ``ruleset.yaml`` into a typed, immutable :class:`Ruleset`.

    Args:
        path: Override for tests; production always uses the vendored
            default.

    Returns:
        The parsed ruleset.

    Raises:
        ValueError: The file is missing a required top-level key or is
            not a mapping - fails loudly at load time rather than
            producing confusing per-rule KeyErrors later.
    """
    raw = _load_raw(path)
    required_keys = {"version", "schema_limits", "languages", "image_style"}
    missing = required_keys - raw.keys()
    if missing:
        raise ValueError(f"{path}: missing required key(s): {sorted(missing)}")

    languages = {code: _build_language_rules(entry) for code, entry in raw["languages"].items()}
    if DEFAULT_LANGUAGE not in languages:
        raise ValueError(f"{path}: languages must include the fallback '{DEFAULT_LANGUAGE}'")

    return Ruleset(
        version=str(raw["version"]),
        schema_limits=dict(raw["schema_limits"]),
        languages=languages,
        competitor_brands=tuple(raw.get("competitor_brands") or ()),
        max_regeneration_retries=int(raw.get("max_regeneration_retries", 2)),
        image_style=_build_image_style(raw["image_style"]),
    )


_cached_ruleset: Ruleset | None = None


def get_ruleset() -> Ruleset:
    """Module-level cached default ruleset. Tests that need a fresh
    parse (e.g. a malformed-YAML case) call :func:`load_ruleset`
    directly instead."""
    global _cached_ruleset
    if _cached_ruleset is None:
        _cached_ruleset = load_ruleset()
    return _cached_ruleset
