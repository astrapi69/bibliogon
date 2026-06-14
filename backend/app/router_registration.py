"""Central router registration for the FastAPI app.

Extracted from ``app/main.py`` (God-file decomposition, 2026-06-14) to
lift the ~40 ``include_router`` calls out of the app-setup module. All
routers mount under the ``/api`` prefix. Call :func:`register_routers`
once, after the ``FastAPI`` instance and its middleware exist.

This module imports the router packages itself; ``main.py`` no longer
needs to import them solely to register them (it keeps importing the few
routers it ``.configure()``s at startup).
"""

from fastapi import FastAPI

from app.ai.routes import router as ai_router
from app.routers import (
    ai_template_bulk,
    ai_template_bulk_fill,
    article_ai_fill,
    article_ai_template,
    article_assets,
    article_bulk_export,
    article_export,
    articles,
    assets,
    audiobook,
    authors,
    backup,
    book_ai_fill,
    book_ai_template,
    book_types,
    books,
    bulk_delete,
    chapter_labels,
    chapter_templates,
    chapters,
    comments,
    content_types,
    covers,
    git_backup,
    git_import_backfill,
    git_sync,
    import_orchestrator,
    licenses,
    pages,
    plugin_install,
    publications,
    settings,
    system,
    templates,
    translations,
    writing_stats,
)
from app.routers import (
    ssh_keys as ssh_keys_router,
)
from app.routers.websocket import router as ws_router


def register_routers(app: FastAPI) -> None:
    """Mount every core router on ``app`` under the ``/api`` prefix.

    Plugin routers are mounted separately by
    ``PluginManager.mount_routes`` during the lifespan startup; this
    function covers only the statically-known core routers.

    Args:
        app: The FastAPI application instance.
    """
    app.include_router(books.router, prefix="/api")
    app.include_router(book_types.router, prefix="/api")
    app.include_router(content_types.router, prefix="/api")
    app.include_router(articles.router, prefix="/api")
    app.include_router(authors.router, prefix="/api")
    app.include_router(article_assets.router, prefix="/api")
    app.include_router(article_export.router, prefix="/api")
    app.include_router(article_bulk_export.router, prefix="/api")
    app.include_router(article_ai_template.articles_router, prefix="/api")
    app.include_router(article_ai_template.empty_router, prefix="/api")
    app.include_router(article_ai_fill.router, prefix="/api")
    app.include_router(book_ai_template.books_router, prefix="/api")
    app.include_router(book_ai_template.empty_router, prefix="/api")
    app.include_router(book_ai_fill.router, prefix="/api")
    app.include_router(ai_template_bulk.articles_router, prefix="/api")
    app.include_router(ai_template_bulk.books_router, prefix="/api")
    app.include_router(ai_template_bulk_fill.articles_router, prefix="/api")
    app.include_router(ai_template_bulk_fill.books_router, prefix="/api")
    app.include_router(bulk_delete.articles_router, prefix="/api")
    app.include_router(bulk_delete.books_router, prefix="/api")
    app.include_router(bulk_delete.comments_router, prefix="/api")
    app.include_router(comments.router, prefix="/api")
    app.include_router(publications.publications_router, prefix="/api")
    app.include_router(publications.platform_schemas_router, prefix="/api")
    app.include_router(chapters.router, prefix="/api")
    app.include_router(chapter_labels.router, prefix="/api")
    app.include_router(writing_stats.router, prefix="/api")
    app.include_router(pages.router, prefix="/api")
    app.include_router(assets.router, prefix="/api")
    app.include_router(audiobook.router, prefix="/api")
    app.include_router(covers.router, prefix="/api")
    app.include_router(backup.router, prefix="/api")
    app.include_router(import_orchestrator.router, prefix="/api")
    app.include_router(licenses.router, prefix="/api")
    app.include_router(settings.router, prefix="/api")
    app.include_router(system.router, prefix="/api")
    app.include_router(plugin_install.router, prefix="/api")
    app.include_router(templates.router, prefix="/api")
    app.include_router(chapter_templates.router, prefix="/api")
    app.include_router(git_backup.router, prefix="/api")
    app.include_router(git_import_backfill.router, prefix="/api")
    app.include_router(git_sync.router, prefix="/api")
    app.include_router(translations.router, prefix="/api")
    app.include_router(ssh_keys_router.router, prefix="/api")
    app.include_router(ai_router, prefix="/api")
    app.include_router(ws_router, prefix="/api")
