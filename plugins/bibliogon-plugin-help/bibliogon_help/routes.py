"""FastAPI routes for the help plugin."""

from typing import Any

from fastapi import APIRouter

from .content import get_about, get_faq, get_shortcuts

router = APIRouter(prefix="/help", tags=["help"])

# Plugin config will be set during activation
_config: dict[str, Any] = {}


def set_config(config: dict[str, Any]) -> None:
    global _config
    _config = config


@router.get("/shortcuts")
def shortcuts(lang: str = "de") -> list[dict[str, str]]:
    """Get keyboard shortcuts."""
    return get_shortcuts(_config, lang)


@router.get("/faq")
def faq(lang: str = "de") -> list[dict[str, str]]:
    """Get FAQ entries."""
    return get_faq(_config, lang)


@router.get("/about")
def about() -> dict[str, str]:
    """Get about information."""
    return get_about()
