"""FastAPI routes for the Kinderbuch plugin."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/kinderbuch", tags=["kinderbuch"])


class TemplateOut(BaseModel):
    id: str
    label: dict[str, str]
    description: dict[str, str]
    layout: str


class PagePreview(BaseModel):
    text: str
    image: str | None = None
    layout: str = "image-top-text-bottom"


@router.get("/templates", response_model=list[TemplateOut])
def list_templates() -> list[dict[str, Any]]:
    """List available children's book page templates."""
    from .plugin import KinderbuchPlugin
    # Templates are loaded from config
    # In a real setup this would come from the activated plugin instance
    return [
        {
            "id": "picture-top",
            "label": {"de": "Bild oben", "en": "Picture top"},
            "description": {"de": "Bild oben, Text unten", "en": "Image on top, text below"},
            "layout": "image-top-text-bottom",
        },
        {
            "id": "picture-left",
            "label": {"de": "Bild links", "en": "Picture left"},
            "description": {"de": "Bild links, Text rechts", "en": "Image left, text right"},
            "layout": "image-left-text-right",
        },
        {
            "id": "picture-full",
            "label": {"de": "Ganzseitiges Bild", "en": "Full-page image"},
            "description": {"de": "Bild ganzseitig mit Text-Overlay", "en": "Full-page image with text overlay"},
            "layout": "image-full-text-overlay",
        },
        {
            "id": "text-only",
            "label": {"de": "Nur Text", "en": "Text only"},
            "description": {"de": "Reiner Textinhalt", "en": "Text content only"},
            "layout": "text-only",
        },
    ]


@router.post("/preview")
def preview_page(page: PagePreview) -> dict[str, str]:
    """Generate an HTML preview of a children's book page."""
    from .page_layout import PageLayout

    layout = PageLayout(
        layout_type=page.layout,
        image_path=page.image,
        text=page.text,
        page_number=1,
    )
    return {"html": layout.to_html()}
