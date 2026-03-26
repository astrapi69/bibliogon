"""Export plugin for Bibliogon - EPUB, PDF and project structure export."""

from typing import Any

from pluginforge import BasePlugin


class ExportPlugin(BasePlugin):
    name = "export"
    version = "1.0.0"
    api_version = "1"

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
        """Return the export router."""
        from .routes import router
        return [router]

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        """Return export-related UI manifest."""
        formats = self.config.get("formats", [])
        return {
            "sidebar_actions": [
                {
                    "id": f"export_{fmt['id']}",
                    "label": fmt.get("label", fmt["id"]),
                    "icon": "download",
                    "action": f"/api/books/{{book_id}}/export/{fmt['id']}",
                }
                for fmt in formats
            ],
        }
