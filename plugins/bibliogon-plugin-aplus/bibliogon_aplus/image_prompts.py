"""Image-prompt style assembly for A+ Content (#825).

Every technical parameter (model hint, aspect ratio, style flags,
target pixel size) comes from the versioned ruleset - image
generators and their model versions change often, so none of this
is hardcoded in Python.
"""

from __future__ import annotations

from dataclasses import dataclass

from bibliogon_aplus.rules import Ruleset


@dataclass(frozen=True)
class ModuleImageStyle:
    """Style parameters for one A+ image slot (header or a tile)."""

    model_hint: str
    style_flags: tuple[str, ...]
    aspect_ratio: str
    target_pixel_size: str

    def render_prompt(self, subject_keywords: list[str]) -> str:
        """Comma-separated, keyword-based prompt string.

        Args:
            subject_keywords: Descriptive keywords for the image's
                subject (never literal text to render in the image).

        Returns:
            A prompt combining the subject keywords with this slot's
            style flags. Deliberately excludes the pixel size - that
            is production metadata, not a prompt keyword.
        """
        parts = [*subject_keywords, *self.style_flags]
        return ", ".join(part for part in parts if part)


@dataclass(frozen=True)
class AplusImageStyleContext:
    """Resolved style for both A+ image slots, for one genre."""

    header: ModuleImageStyle
    three_images: ModuleImageStyle


def build_style_context(*, genre_key: str | None, rules: Ruleset) -> AplusImageStyleContext:
    """Resolve the header + three-image styles for the given genre.

    Args:
        genre_key: Lowercased genre/style key (e.g. ``"kinderbuch"``),
            or None for the default style.
        rules: The parsed ruleset.

    Returns:
        Style parameters for both A+ image slots, with an unknown
        genre key falling back to the default style rather than
        raising.
    """
    model_hint, style_flags = rules.image_style.style_for(genre_key)
    return AplusImageStyleContext(
        header=ModuleImageStyle(
            model_hint=model_hint,
            style_flags=style_flags,
            aspect_ratio=rules.image_style.aspect_ratios.get("module_header", ""),
            target_pixel_size=rules.image_style.target_pixel_sizes.get("module_header", ""),
        ),
        three_images=ModuleImageStyle(
            model_hint=model_hint,
            style_flags=style_flags,
            aspect_ratio=rules.image_style.aspect_ratios.get("module_three_images", ""),
            target_pixel_size=rules.image_style.target_pixel_sizes.get("module_three_images", ""),
        ),
    )
