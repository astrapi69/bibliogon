"""FastAPI routes for the grammar check plugin."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .languagetool import LanguageToolClient

router = APIRouter(prefix="/grammar", tags=["grammar"])

# Default client - will use public API
_client = LanguageToolClient()


class CheckRequest(BaseModel):
    text: str
    language: str | None = None


@router.post("/check")
async def check_grammar(request: CheckRequest) -> dict[str, Any]:
    """Check text for grammar and spelling issues via LanguageTool."""
    try:
        result = await _client.check(request.text, request.language)
        return result.to_dict()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LanguageTool API error: {e}")


@router.get("/languages")
async def list_languages() -> list[dict[str, str]]:
    """List supported languages from LanguageTool."""
    try:
        return await _client.languages()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LanguageTool API error: {e}")
