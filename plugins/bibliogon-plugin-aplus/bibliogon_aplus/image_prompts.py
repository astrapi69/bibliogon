"""Image-prompt style assembly for A+ Content (#825, wired in #865).

Every technical parameter (aspect ratio, target pixel size, style
flags, model hint) comes from the versioned ruleset - image generators
and their model versions change often, so none of this is hardcoded
in Python.

Two halves, both called from production code:

- :func:`build_style_context` resolves the per-slot parameters for a
  genre; the generator stamps them into every ``AplusImage`` it
  builds, so they are persisted with the package.
- :func:`with_rendered_prompts` derives the ``rendered`` string for a
  response. It is computed on every read and never stored: the form
  (``<prompt> --ar <aspect_ratio> <style_flags>``) can change without
  a data migration, and a frozen string would go stale the moment the
  ruleset's flags move to a new model version.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

from bibliogon_aplus.rules import Ruleset
from bibliogon_aplus.schema import AplusImage


@dataclass(frozen=True)
class ModuleImageStyle:
    """Style parameters for one A+ image slot (header or a tile)."""

    model_hint: str
    style_flags: tuple[str, ...]
    aspect_ratio: str
    target_pixel_size: str

    def image(self, prompt: str) -> AplusImage:
        """An :class:`AplusImage` for this slot around the model's
        keyword prompt. Carries the persisted parts only; ``rendered``
        is added at response time by :func:`with_rendered_prompts`."""
        return AplusImage(
            prompt=prompt,
            aspect_ratio=self.aspect_ratio,
            size=self.target_pixel_size,
            style_flags=list(self.style_flags),
        )


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


def render_image_prompt(image: AplusImage) -> str:
    """The copy-and-paste form of one image slot:
    ``<prompt> --ar <aspect_ratio> <style_flags>``.

    An empty prompt renders as an empty string - a bare parameter tail
    is not a prompt. The pixel size is deliberately not part of it;
    that is production metadata for the UI, not a prompt keyword.
    """
    prompt = image.prompt.strip()
    if not prompt:
        return ""
    parts = [prompt]
    if image.aspect_ratio:
        parts.append(f"--ar {image.aspect_ratio}")
    parts.extend(image.style_flags)
    return " ".join(parts)


def _with_rendered(slot: Any) -> None:
    image = slot.get("image") if isinstance(slot, dict) else None
    if isinstance(image, dict):
        image["rendered"] = render_image_prompt(AplusImage.model_validate(image))


def with_rendered_prompts(package: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of a serialised package with ``rendered`` added
    to the header image and to every tile image.

    Tolerates a package without ``image`` blocks (rows cached under a
    ruleset version that predates them) and never mutates its input,
    so the stored JSON stays free of the derived string.
    """
    result = copy.deepcopy(package)
    _with_rendered(result.get("module_header"))
    tiles = result.get("module_three_images")
    if isinstance(tiles, list):
        for tile in tiles:
            _with_rendered(tile)
    return result
