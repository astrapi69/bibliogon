"""FastAPI routes for the Kinderbuch plugin."""

from typing import Any

from fastapi import APIRouter, HTTPException, status
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


def _plugin_templates() -> list[dict[str, Any]]:
    """Return the activated plugin's templates list.

    Reads from the loaded plugin instance, which in turn reads from
    backend/config/plugins/kinderbuch.yaml at activate-time. Raises
    503 if the plugin manager is not initialised (typical in unit
    tests that import routes directly).
    """
    try:
        from app.main import manager  # type: ignore[import-not-found]
    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kinderbuch plugin manager not available.",
        ) from e
    plugin = manager.get_plugin("kinderbuch")
    if plugin is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kinderbuch plugin is not active.",
        )
    return plugin.templates


@router.get("/templates", response_model=list[TemplateOut])
def list_templates() -> list[dict[str, Any]]:
    """List available children's book page templates.

    Templates are loaded from backend/config/plugins/kinderbuch.yaml
    at plugin-activate time. Returns the YAML's ``templates`` list
    verbatim (each entry: id, label, description, layout).
    """
    return _plugin_templates()


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
