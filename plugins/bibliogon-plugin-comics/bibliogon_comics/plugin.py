"""Comics plugin for Bibliogon (Session 1 scaffolding).

Session 1 wires the plugin into Bibliogon's plugin manager under
``book_type == "comic_book"`` but ships no panels, bubbles, or
comic-specific layouts yet. See
``docs/explorations/comic-foundation.md`` for the full
multi-session roadmap.

Session 2 will add ``comic_panels`` + ``comic_bubbles`` tables,
panel-grid layouts, bubble-type variants, and the PDF walker.
"""

from typing import Any

from pluginforge import BasePlugin


class ComicsPlugin(BasePlugin):
    name = "comics"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    min_app_version = "0.35.0"
    license_tier = "core"
    depends_on = ["export"]

    def activate(self) -> None:
        """Set up comics plugin resources.

        Session 1 has no settings or templates of its own. The
        ``activate`` hook is wired so future sessions can hang
        configuration off ``self.config`` without re-shaping the
        plugin lifecycle.
        """
        self._settings = self.config.get("settings", {})

    def get_routes(self) -> list[Any]:
        """Return FastAPI routers contributed by this plugin.

        Session 1 ships only ``GET /api/comics/info`` as a
        plugin-mounted gate (see routes.py docstring). Session 2
        adds the comic-page + comic-panel + comic-bubble CRUD
        endpoints under the same prefix.
        """
        from .routes import router

        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        """Frontend manifest consumed by ``/api/plugins/manifests``.

        Session 1 returns a stable minimal manifest so the frontend
        can detect plugin-comics is mounted without depending on
        Session-2 UI slots that do not exist yet.
        """
        return {
            "settings": getattr(self, "_settings", {}),
        }

    @property
    def settings(self) -> dict[str, Any]:
        return getattr(self, "_settings", {})
