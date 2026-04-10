"""FastAPI routes for the grammar check plugin."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .languagetool import LanguageToolClient

router = APIRouter(prefix="/grammar", tags=["grammar"])

_config: dict = {}


def set_config(config: dict) -> None:
    """Set plugin config from plugin activation."""
    global _config
    _config = config


def _get_client() -> LanguageToolClient:
    """Build a client from the plugin config (or defaults)."""
    settings = _config.get("settings", {})
    return LanguageToolClient(
        base_url=settings.get("url", "https://api.languagetoolplus.com/v2"),
        default_language=settings.get("default_language", "auto"),
        disabled_rules=settings.get("disabled_rules", []),
        disabled_categories=settings.get("disabled_categories", []),
    )


class CheckRequest(BaseModel):
    text: str
    language: str | None = None


@router.post("/check")
async def check_grammar(request: CheckRequest) -> dict[str, Any]:
    """Check text for grammar and spelling issues via LanguageTool."""
    client = _get_client()
    try:
        result = await client.check(request.text, request.language)
        return result.to_dict()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LanguageTool API error: {e}")


@router.get("/languages")
async def list_languages() -> list[dict[str, str]]:
    """List supported languages from LanguageTool."""
    client = _get_client()
    try:
        return await client.languages()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LanguageTool API error: {e}")
