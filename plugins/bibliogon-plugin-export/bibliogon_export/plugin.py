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
        """Return the export routers (main + async job polling + bulk).

        ``bulk_router`` lives at ``/books/bulk-export`` (sibling to the
        per-book ``/books/{book_id}/export`` router). Bibliogon's
        plugin-router include order does not matter for these two
        because Starlette only matches ``/books/{book_id}/export/...``
        when the path has 4+ segments and ``/books/bulk-export`` has
        2; no path-param shadowing.
        """
        from .routes import bulk_router, jobs_router, router
        return [router, bulk_router, jobs_router]

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
