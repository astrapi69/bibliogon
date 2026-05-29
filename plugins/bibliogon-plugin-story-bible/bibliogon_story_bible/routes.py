"""HTTP routes for the Story Bible plugin (Session 1).

Session 1 ships a single ``GET /api/story-bible/info`` endpoint
returning the plugin's identity + roadmap phase. It exists for two
reasons, mirroring plugin-comics' Session-1 ``/comics/info``:

1. **Frontend detection**: the Session-2 ``StoryBibleSidebar``
   (core frontend, gated on plugin activation) reads this endpoint
   to confirm the plugin is mounted before rendering. A missing
   endpoint is a clear signal the backend path-dep is broken.

2. **CI gate (two installation paths)**: hitting this endpoint from
   the backend pytest tier exercises the combined-lock path-dep
   install; hitting it from the per-plugin tier exercises the
   per-plugin install. Both tiers must pass for the plugin to be
   green.

Session 2 adds the entity-type SSoT endpoint + entity CRUD routes
under ``/api/story-bible/...``, NESTED inside this single top-level
router (Single-Router-Per-Plugin convention) so the plugin manager
mounts exactly one router.
"""

from typing import Any

from fastapi import APIRouter

router = APIRouter(tags=["story-bible"])


@router.get("/story-bible/info")
def story_bible_info() -> dict[str, Any]:
    """Identity probe for the Story Bible plugin.

    Returns the plugin name, version, and current roadmap phase so
    the frontend can detect the plugin is mounted and so both CI
    installation-path tiers have a no-DB endpoint to exercise.
    """
    return {
        "plugin": "story-bible",
        "version": "1.0.0",
        "phase": "session-1-scaffolding",
    }
