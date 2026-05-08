"""FastAPI routes for the Medium-import plugin.

Bulk-import endpoint and any future helper routes go here. The
walker (HTML → TipTap) and image-download logic live in their
own modules so they can be unit-tested without spinning up
FastAPI.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/medium-import", tags=["medium-import"])


@router.get("/health")
def health() -> dict[str, str]:
    """Minimal liveness probe; confirms the plugin's router is mounted."""
    return {"plugin": "medium-import", "status": "ok"}
