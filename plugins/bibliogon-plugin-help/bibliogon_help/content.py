"""Help content provider - reads from plugin config YAML."""

from typing import Any


def get_shortcuts(config: dict[str, Any], lang: str = "de") -> list[dict[str, str]]:
    """Get keyboard shortcuts localized."""
    shortcuts = config.get("shortcuts", [])
    return [
        {
            "keys": s["keys"],
            "action": _localize(s.get("action", ""), lang),
        }
        for s in shortcuts
    ]


def get_faq(config: dict[str, Any], lang: str = "de") -> list[dict[str, str]]:
    """Get FAQ entries localized."""
    faq = config.get("faq", [])
    return [
        {
            "question": _localize(item.get("question", ""), lang),
            "answer": _localize(item.get("answer", ""), lang),
        }
        for item in faq
    ]


def get_about() -> dict[str, str]:
    """Get about info."""
    return {
        "name": "Bibliogon",
        "description": "Open-source book authoring platform",
        "website": "https://github.com/astrapi69/bibliogon",
        "license": "MIT",
    }


def _localize(value: Any, lang: str) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get(lang, value.get("en", value.get("de", "")))
    return str(value)
