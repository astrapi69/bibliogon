# Bibliogon Plugin: Comics

Comic-authoring plugin for [Bibliogon](https://github.com/astrapi69/bibliogon).

## Status

**Phase 1 scaffolding** (plugin-comics Session 1). The plugin
package is wired into Bibliogon's plugin manager and registers
under `book_type == "comic_book"` but ships no panels, bubbles,
or comic-specific layouts yet. See
[docs/explorations/comic-foundation.md](../../docs/explorations/comic-foundation.md)
for the full multi-session roadmap.

## Roadmap

| Session | Scope |
|---------|-------|
| 1 (this) | Plugin scaffolding + `comic_book` book_type wired in book-create flow + placeholder editor surface |
| 2 | `comic_panels` + `comic_bubbles` tables; panel-grid layouts; multi-bubble add/delete; bubble-type variants; PDF walker |
| 3 | Drag-to-position; reading direction (LTR/RTL); z-order; gutter spacing; full E2E |

## Architecture

Comic books share the existing `pages` table (per the design
commitment in
[backend/migrations/versions/kb1a2b3c4d5e_add_book_type_and_pages.py](../../backend/migrations/versions/kb1a2b3c4d5e_add_book_type_and_pages.py)
and the [Page model docstring](../../backend/app/models/__init__.py))
with `book.book_type = "comic_book"` as the discriminator.
Session 2 adds plugin-owned `comic_panels` and `comic_bubbles`
tables.

## License

MIT

## Installation

### Via Poetry (development)

```bash
cd plugins/bibliogon-plugin-comics
poetry install
```

The backend's `poetry.lock` pulls this as a path-dep
(`backend/pyproject.toml`).

## API Endpoints

Session 1 ships no routes. Session 2 adds the comic-page +
comic-panel + comic-bubble CRUD endpoints.
