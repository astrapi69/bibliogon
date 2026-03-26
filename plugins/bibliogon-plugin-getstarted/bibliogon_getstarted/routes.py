"""FastAPI routes for the get-started plugin."""

from typing import Any

from fastapi import APIRouter

from .guide import get_guide_steps, get_sample_book_data

router = APIRouter(prefix="/get-started", tags=["get-started"])

_config: dict[str, Any] = {}


def set_config(config: dict[str, Any]) -> None:
    global _config
    _config = config


@router.get("/guide")
def guide(lang: str = "de") -> list[dict[str, str]]:
    """Get onboarding guide steps."""
    return get_guide_steps(_config, lang)


@router.get("/sample-book")
def sample_book(lang: str = "de") -> dict[str, Any]:
    """Get sample book data for creating a demo book."""
    return get_sample_book_data(_config, lang)
