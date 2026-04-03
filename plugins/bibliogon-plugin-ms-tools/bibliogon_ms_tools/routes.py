"""API routes for manuscript tools plugin."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .readability import analyze_readability
from .sanitizer import sanitize
from .style_checker import check_style

router = APIRouter(prefix="/ms-tools", tags=["manuscript-tools"])

_config: dict = {}


def set_config(config: dict) -> None:
    """Set plugin config from plugin activation."""
    global _config
    _config = config


class StyleCheckRequest(BaseModel):
    """Request body for style check."""

    text: str = Field(..., min_length=1, description="Text to analyze")
    language: str = Field(default="de", pattern="^[a-z]{2}$")
    max_sentence_length: int = Field(default=30, ge=10, le=100)


class SanitizeRequest(BaseModel):
    """Request body for text sanitization."""

    text: str = Field(..., min_length=1, description="Text to sanitize")
    language: str = Field(default="de", pattern="^[a-z]{2}$")
    fix_quotes: bool = Field(default=True)
    fix_whitespace: bool = Field(default=True)
    fix_dashes: bool = Field(default=True)
    fix_ellipsis: bool = Field(default=True)


@router.post("/check")
async def style_check(req: StyleCheckRequest) -> dict:
    """Run style checks on text: filler words, passive voice, sentence length."""
    return check_style(
        text=req.text,
        language=req.language,
        max_sentence_length=req.max_sentence_length,
    )


@router.post("/sanitize")
async def sanitize_text(req: SanitizeRequest) -> dict:
    """Sanitize text: fix quotes, whitespace, dashes, ellipsis."""
    return sanitize(
        text=req.text,
        language=req.language,
        fix_quote_marks=req.fix_quotes,
        fix_spaces=req.fix_whitespace,
        fix_dash_marks=req.fix_dashes,
        fix_ellipses=req.fix_ellipsis,
    )


class ReadabilityRequest(BaseModel):
    """Request body for readability analysis."""

    text: str = Field(..., min_length=1, description="Text to analyze")
    language: str = Field(default="de", pattern="^[a-z]{2}$")


@router.post("/readability")
async def readability_check(req: ReadabilityRequest) -> dict:
    """Analyze text readability: Flesch Reading Ease, Flesch-Kincaid Grade, reading time."""
    return analyze_readability(text=req.text, language=req.language)


@router.get("/languages")
async def supported_languages() -> dict:
    """Return supported languages for style checks, sanitization, and readability."""
    from .readability import VOWEL_GROUPS
    from .sanitizer import QUOTE_STYLES
    from .style_checker import FILLER_WORDS

    return {
        "style_check": list(FILLER_WORDS.keys()),
        "sanitize": list(QUOTE_STYLES.keys()),
        "readability": list(VOWEL_GROUPS.keys()),
    }
