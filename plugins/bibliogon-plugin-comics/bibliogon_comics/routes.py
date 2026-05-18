"""HTTP routes for the comics plugin (Session 1).

Session 1 ships a single ``GET /api/comics/info`` endpoint that
returns the plugin's identity + roadmap-phase. The endpoint
exists for two reasons:

1. **Frontend detection**: the placeholder ``ComicBookEditor``
   shipping in Session 1 Commit 3 reads this endpoint to confirm
   the plugin is mounted before rendering its "Session 2 coming
   soon" stub. A missing endpoint is a clear signal the backend
   path-dep is broken.

2. **CI gate**: per Bibliogon's "Two installation paths" rule
   (.claude/rules/lessons-learned.md), the backend's combined
   poetry.lock and the per-plugin poetry.lock are independent
   verification paths. Hitting this endpoint from the backend
   pytest tier exercises the path-dep install; hitting it from
   the per-plugin tier exercises the per-plugin install. Both
   tiers must pass for plugin-comics to be considered green.

Session 2 will add the comic-page + comic-panel + comic-bubble
CRUD endpoints under the same ``/comics`` prefix.
"""

from typing import Any

from fastapi import APIRouter

router = APIRouter(prefix="/comics", tags=["comics"])


@router.get("/info")
def get_plugin_info() -> dict[str, Any]:
    """Return plugin identity + roadmap-phase.

    Stable shape across Session 1; Session 2 extends with the
    list of mounted sub-routes once panels + bubbles ship.
    """
    return {
        "name": "comics",
        "version": "1.0.0",
        "session": 1,
        "status": "scaffolding",
        "description": (
            "Comic-authoring plugin. Session 1 ships scaffolding only; "
            "Session 2 brings panels, multi-bubble, and the PDF walker."
        ),
    }
