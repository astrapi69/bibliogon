"""Get Started guide content and sample book creation."""

from typing import Any


def get_guide_steps(config: dict[str, Any], lang: str = "de") -> list[dict[str, str]]:
    """Get onboarding steps localized."""
    steps = config.get("guide", {}).get("steps", [])
    return [
        {
            "id": step["id"],
            "title": _localize(step.get("title", ""), lang),
            "description": _localize(step.get("description", ""), lang),
            "icon": step.get("icon", "circle"),
        }
        for step in steps
    ]


def get_sample_book_data(config: dict[str, Any], lang: str = "de") -> dict[str, Any]:
    """Get sample book data for creation, localized."""
    sample = config.get("sample_book", {})
    chapters = []
    for ch in sample.get("chapters", []):
        chapters.append({
            "title": _localize(ch.get("title", ""), lang),
            "content": _localize(ch.get("content", ""), lang),
        })

    return {
        "title": _localize(sample.get("title", "My First Book"), lang),
        "author": sample.get("author", "Bibliogon"),
        "language": sample.get("language", lang),
        "description": _localize(sample.get("description", ""), lang),
        "chapters": chapters,
    }


def _localize(value: Any, lang: str) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get(lang, value.get("en", value.get("de", "")))
    return str(value)
