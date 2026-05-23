"""Comics plugin for Bibliogon (Session 1 scaffolding).

Session 1 wires the plugin into Bibliogon's plugin manager under
``book_type == "comic_book"`` but ships no panels, bubbles, or
comic-specific layouts yet. See
``docs/explorations/comic-foundation.md`` for the full
multi-session roadmap.

Session 2 will add ``comic_panels`` + ``comic_bubbles`` tables,
panel-grid layouts, bubble-type variants, and the PDF walker.
"""

from pathlib import Path
from typing import Any

import pluggy
from pluginforge import BasePlugin

hookimpl = pluggy.HookimplMarker("bibliogon.plugins")


class ComicsPlugin(BasePlugin):
    name = "comics"
    version = "1.1.0"
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

    @hookimpl
    def export_execute(
        self,
        book: dict[str, Any],
        fmt: str,
        options: dict[str, Any],
    ) -> Path | None:
        """Render a comic-book PDF.

        Returns ``None`` for any non-matching book / format so
        pluggy's ``firstresult=True`` semantics let other plugins
        contribute their own implementations. Only handles the
        case ``book_type == "comic_book"`` and ``fmt == "pdf"``.

        The caller (plugin-export's ``_export_comic_book_pdf``)
        owns the FileResponse wrapping + filename composition;
        this hook only produces the file on disk and returns its
        Path. ``options`` carries the pages / panels / bubbles /
        assets the walker needs plus the resolved ``upload_dir``
        and target ``output_path``.

        Wiring rationale: HOOKSPEC-EXPORT-EXECUTE-WIRE-01
        adjudication path γ (2026-05-23). Removes the one
        cross-plugin reverse-import in plugin-export (line 365)
        without forcing the audiobook async/streaming case
        through a sync ``Path | None`` signature.
        """
        if book.get("book_type") != "comic_book" or fmt != "pdf":
            return None

        from .comic_book_pdf import generate_comic_book_pdf

        generate_comic_book_pdf(
            book_data=book,
            pages=options["pages"],
            panels=options["panels"],
            bubbles=options["bubbles"],
            assets=options["assets"],
            upload_dir=options["upload_dir"],
            output_path=options["output_path"],
            picture_book_format=options.get("picture_book_format"),
            picture_book_bleed_marks=options.get(
                "picture_book_bleed_marks", False
            ),
        )
        return options["output_path"]

    def get_routes(self) -> list[Any]:
        """Return FastAPI routers contributed by this plugin.

        Session 1 shipped ``GET /api/comics/info`` (identity probe).
        Session 2 adds comic-panel + comic-bubble CRUD endpoints
        under the ``/api/books/{book_id}/...`` namespace. All
        Session 2 sub-routers nest INSIDE the single top-level
        router (via ``router.include_router(...)`` in routes.py).

        Returning a SINGLE router (vs three separate routers) keeps
        per-lifespan ASGI registration depth low — the Python
        recursion limit (default 1000) is hit when many plugins ×
        many routers each accumulate registration state across
        consecutive TestClient lifespans in long test sweeps.
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
