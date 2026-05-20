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

router = APIRouter(tags=["comics"])

# Session-2 sub-routers (panels + bubbles) live under their own
# ``/books/{book_id}/...`` prefix and are NESTED inside this
# top-level router so the plugin manager only mounts ONE router
# per plugin (avoids the per-lifespan recursion-depth accumulation
# that hits Python's default limit during long test sweeps).
def _include_session2_routers() -> None:
    """Nest the panel + bubble routers under this top-level router.

    Done lazily inside the function (not at module import) so the
    plugin's isolated venv can still import this module for the
    Session-1 ``/comics/info`` smoke without pulling in sqlalchemy
    + app.models (which the sub-routers depend on).
    """
    try:
        from .bubbles import router as bubbles_router
        from .panels import router as panels_router

        router.include_router(panels_router)
        router.include_router(bubbles_router)
    except ImportError:
        # Plugin's standalone venv lacks sqlalchemy / app.models —
        # Session-2 endpoints stay unmounted; that's the right
        # behavior because the plugin only functions inside the
        # backend's full app context.
        pass


_include_session2_routers()


# The /info endpoint uses an explicit /comics prefix since the
# router itself has no prefix (so nested sub-routers can carry
# their own /books/{book_id} prefix without collision).
@router.get("/comics/info")
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
