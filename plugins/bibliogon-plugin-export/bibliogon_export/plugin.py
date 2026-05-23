"""Export plugin for Bibliogon - EPUB, PDF and project structure export."""

from typing import Any

from pluginforge import BasePlugin


class ExportPlugin(BasePlugin):
    name = "export"
    version = "1.0.0"
    api_version = "1"
    target_application = "bibliogon"
    license_tier = "core"

    def activate(self) -> None:
        """Configure routes with DB dependencies if available."""
        # Try to configure routes with app DB dependencies
        # These may not be available in all contexts (e.g. testing)
        try:
            from app.database import get_db
            from app.models import Book
            from .routes import configure
            configure(get_db, Book)
        except ImportError:
            pass

    def get_routes(self) -> list[Any]:
        """Return the single export router.

        Per the Single-Router-Per-Plugin convention (lessons-learned
        ".claude/rules/lessons-learned.md") and the pluginforge 0.8.0
        deprecation guidance: one parent router nests the per-book,
        bulk, and jobs sub-routers via ``include_router``. The
        sub-routers keep their distinct prefixes
        (``/books/{book_id}/export``, ``/books/bulk-export``,
        ``/export/jobs``) and tags unchanged. No URL-shape change to
        the API surface; only the plugin-manifest is reshaped.
        """
        from .routes import parent_router
        return [parent_router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        """Return export-related UI manifest."""
        ui_formats = self.config.get("ui_formats", [])
        return {
            "sidebar_actions": [
                {
                    "id": f"export_{fmt['id']}",
                    "label": fmt.get("label", fmt["id"]),
                    "icon": "download",
                    "action": f"/api/books/{{book_id}}/export/{fmt['id']}",
                }
                for fmt in ui_formats
            ],
        }
