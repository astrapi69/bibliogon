"""Story Bible plugin for Bibliogon (Session 1 scaffolding).

A per-book database for fiction-writing entities (Character,
Setting, PlotPoint, Item, Lore) with rich-text descriptions and
optional cover images. Session 4 adds an ``@-mention`` TipTap
extension so authors can reference entities inline in chapter
text; clicking a mention navigates to the entity entry.

Architecture (per docs/audits/story-bible-pre-inspection-2026-05-30.md):

- **Models / schemas / migration live in CORE** (single shared
  SQLAlchemy ``Base`` + centralised Alembic), exactly as
  plugin-comics' ``ComicPanel`` / ``ComicBubble`` do. There is no
  plugin-owned-model mechanism in Bibliogon; this plugin owns the
  ROUTES + business logic, not the table declarations.
- **A single ``StoryEntity`` table** with an ``entity_type``
  discriminator + per-type ``entity_metadata`` JSON, mirroring the
  ``Article.content_type`` / ``article_metadata`` pattern.
- **Per-book scope (v1)**: every entity carries a ``book_id`` FK.
  Cross-book / series-spanning is a deferred follow-up.
- **Frontend** (Session 2+) ships in CORE as a ``StoryBibleSidebar``
  in BookEditor, gated on this plugin being mounted.

Session 1 wires the plugin into Bibliogon's plugin manager and
ships a ``GET /api/story-bible/info`` identity probe. Session 2
adds the core ``StoryEntity`` model + schemas + migration + the
entity-type SSoT and CRUD routes nested inside this plugin's single
top-level router.
"""

from typing import Any

from pluginforge import BasePlugin


class StoryBiblePlugin(BasePlugin):
    name = "story-bible"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    min_app_version = "0.41.0"
    license_tier = "core"
    depends_on: list[str] = []

    def activate(self) -> None:
        """Set up Story Bible resources.

        Session 1 ships no user-configurable settings. The
        ``activate`` hook is wired so later sessions can hang
        configuration off ``self.config`` without re-shaping the
        plugin lifecycle.
        """
        self._settings = self.config.get("settings", {})

    def get_routes(self) -> list[Any]:
        """Return FastAPI routers contributed by this plugin.

        A SINGLE top-level router is returned (per the
        Single-Router-Per-Plugin convention). Session 2's entity
        CRUD + entity-type sub-routers nest INSIDE it via
        ``router.include_router(...)`` so per-lifespan ASGI
        registration depth stays low across long test sweeps.
        """
        from .routes import router

        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        """Frontend manifest consumed by ``/api/plugins/manifests``.

        Session 1 returns a stable minimal manifest so the frontend
        can detect plugin-story-bible is mounted (the gate for the
        Session-2 ``StoryBibleSidebar``) without depending on UI
        slots that do not exist yet.
        """
        return {
            "settings": getattr(self, "_settings", {}),
        }

    @property
    def settings(self) -> dict[str, Any]:
        return getattr(self, "_settings", {})
