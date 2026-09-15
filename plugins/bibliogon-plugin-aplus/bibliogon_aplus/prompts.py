"""AI prompt construction for A+ Content generation (#825).

Follows the codebase's existing convention (``book_ai_fill.py`` /
``article_ai_fill.py``): ask the model to reply in a YAML fragment
and parse it with a small fence-stripping helper, rather than
relying on provider-specific JSON mode, which the multi-provider
``LLMClient`` has no uniform support for.
"""

from __future__ import annotations

from bibliogon_aplus.book_context import BookContext
from bibliogon_aplus.rules import Ruleset
from bibliogon_aplus.schema import ValidationFinding

_LANGUAGE_NAMES: dict[str, str] = {
    "de": "German",
    "en": "English",
    "fr": "French",
    "es": "Spanish",
}


def build_system_prompt(language: str) -> str:
    """System prompt: the rules the AI must follow, in plain
    language. Deterministic enforcement still happens in
    ``validation.py`` - this text is guidance, not the gate."""
    language_name = _LANGUAGE_NAMES.get(language, language)
    return (
        f"You write Amazon A+ Content copy in {language_name}. Reply with a single "
        "YAML document and nothing else - no prose before or after it, no markdown "
        "headings.\n\n"
        "Hard rules:\n"
        "- Never use an em dash or en dash; use a plain hyphen or rewrite the sentence.\n"
        "- Never use emoji.\n"
        "- Never mention price, shipping, discounts, or availability.\n"
        "- Never reference a competing retailer, platform, or brand.\n"
        "- Never use a marketing imperative such as 'Learn', 'Discover', or 'Find out' "
        "(or their equivalent in the target language) - write descriptive prose instead.\n"
        "- Every image alt text must be a real, non-empty description.\n"
        "- Image prompts are comma-separated descriptive keywords, never literal text "
        "to render inside the image.\n"
    )


def _yaml_field_spec() -> str:
    return (
        "short_description: <string, max 300 characters>\n"
        "bullets:\n"
        "  - heading: <string, max 160 characters>\n"
        "    body: <string, max 1000 characters>\n"
        "  - heading: ...\n"
        "    body: ...\n"
        "  - heading: ...\n"
        "    body: ...\n"
        "module_header:\n"
        "  title: <string>\n"
        "  text: <string>\n"
        "  image_prompt: <comma-separated descriptive keywords>\n"
        "  alt_text: <string, max 200 characters, never empty>\n"
        "module_three_images:\n"
        "  - title: <string>\n"
        "    text: <string>\n"
        "    image_prompt: <comma-separated descriptive keywords>\n"
        "    alt_text: <string, max 200 characters, never empty>\n"
        "  - title: ...\n"
        "  - title: ...\n"
    )


def _correction_section(prior_findings: list[ValidationFinding] | None) -> str:
    if not prior_findings:
        return ""
    lines = [f"- {finding.field}: {finding.message}" for finding in prior_findings]
    return (
        "\nYour previous attempt had these problems - fix every one of them:\n"
        + "\n".join(lines)
        + "\n"
    )


def build_user_prompt(
    context: BookContext,
    *,
    rules: Ruleset,
    prior_findings: list[ValidationFinding] | None,
) -> str:
    """Build the user-turn prompt for one generation attempt.

    Args:
        context: The book's normalised metadata.
        rules: The ruleset (used for the genre-aware tone hint).
        prior_findings: Findings from a failed prior attempt, or
            None on the first attempt.

    Returns:
        The full user-turn prompt text.
    """
    lines = [
        f"Book title: {context.title}",
    ]
    if context.subtitle:
        lines.append(f"Subtitle: {context.subtitle}")
    if context.author:
        lines.append(f"Author: {context.author}")
    if context.categories:
        lines.append(f"Categories: {', '.join(context.categories)}")
    if context.keywords:
        lines.append(f"Keywords: {', '.join(context.keywords)}")
    if context.genre_key:
        lines.append(f"Genre/style: {context.genre_key}")
        if context.genre_key == "kinderbuch":
            lines.append(
                "This is a children's book (Kinderbuch). Use a warm, friendly, age-"
                "appropriate tone and avoid any mention of violence, theft, or weapons."
            )
    lines.append("")
    lines.append("Source description (use this as the basis for the copy):")
    lines.append(context.description_text or "(no description provided)")
    lines.append("")
    lines.append("Reply with exactly this YAML shape, filled in:")
    lines.append(_yaml_field_spec())
    lines.append(_correction_section(prior_findings))

    return "\n".join(lines)
