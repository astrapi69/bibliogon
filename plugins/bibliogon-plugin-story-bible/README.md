# bibliogon-plugin-story-bible

A per-book **Story Bible**: a database of fiction-writing entities
(Character, Setting, PlotPoint, Item, Lore) with rich-text
descriptions and optional cover images, plus an `@-mention` editor
extension (Session 4) for inline cross-references.

## Status

Session 1: **scaffolding**. The plugin is wired into Bibliogon's
plugin manager and ships a `GET /api/story-bible/info` identity
probe. No entities, routes, or UI yet.

Roadmap (per
`docs/audits/story-bible-pre-inspection-2026-05-30.md`):

- **Session 1** - scaffold + `GET /api/story-bible/info`.
- **Session 2** - core `StoryEntity` model + schemas + migration +
  `story-bible-entities.yaml` SSoT + entity CRUD routes; frontend
  CRUD UI + `StoryBibleSidebar` in BookEditor.
- **Session 3** - PlotPoint/timeline (list-first) + relationship
  notes + optional dedicated page + E2E.
- **Session 4** - `@tiptap/extension-mention` integration +
  click-to-navigate + i18n + help docs.

## Architecture

Per Bibliogon's plugin convention, the SQLAlchemy models, Pydantic
schemas, and Alembic migration live in **core**
(`backend/app/models`, `backend/app/schemas`,
`backend/migrations/versions`) - the same shape plugin-comics uses
for `ComicPanel` / `ComicBubble`. This plugin owns the **routes**
and business logic; table declarations are centralised because
`Base.metadata` must see them at backend startup.

A single `StoryEntity` table uses an `entity_type` discriminator
(`character` / `setting` / `plot_point` / `item` / `lore`) plus a
per-type `entity_metadata` JSON column, mirroring the
`Article.content_type` / `article_metadata` pattern. Every entity is
**per-book-scoped** via a `book_id` FK (cross-book / series-spanning
is a deferred follow-up).

## Development

```bash
make test        # run plugin tests (own venv)
make build-zip   # build distributable ZIP (plugin.yaml from canonical source)
```

All plugins are free (`license_tier = "core"`) during the current
development phase.
