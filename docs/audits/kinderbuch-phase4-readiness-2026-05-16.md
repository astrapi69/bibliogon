# Audit: Phase 4 Kinderbuch — Pre-implementation Readiness

**Date:** 2026-05-16
**Source exploration:** [docs/explorations/children-book-plugin.md](../explorations/children-book-plugin.md) (557 lines, 2026-04-20, "Architecture decided. Implementation deferred.")
**Status:** Revival decision — start Session 2.

---

## Re-scope amendment (2026-05-16, mid-session)

After commit `393560f` (the second pre-Session-2 prep commit
landing the dead-slot drop), the user re-scoped Phase 4 from
"Kinderbuch only" to the **Visual-Books umbrella** (Picture
Book v1, Comic + Graphic Novel future).

The amendment changes ONE structural decision in this audit:
the `book_type` discriminator becomes the **umbrella**, not the
variant. Specifically:

- §1 line "Data model" — table cell:
  - **Before:** `Book.book_type ∈ {"prose", "children_book"}`
  - **After:** `Book.book_type ∈ {"prose", "visual_book"}` plus
    a new nullable `Book.visual_sub_type ∈ {"picture_book",
    "comic_book", "graphic_novel"}` column (only set when
    `book_type='visual_book'`; v1 defines only `picture_book`).
- §4 "Open decisions" item 2 — Pydantic `Literal` types now
  cover BOTH columns:
  - `Literal["prose", "visual_book"]` for `book_type`
  - `Literal["picture_book", "comic_book", "graphic_novel"] | None`
    for `visual_sub_type`
- §4 item 4 — immutability rule extends to BOTH columns
  (PATCH on book that attempts to change either returns 400).
- §5 "Session 2 scope" — Alembic migration adds BOTH columns
  (not just `book_type`); the Page model and the Pydantic
  schemas reflect both; Pages CRUD gates on
  `book.book_type == "visual_book"` (any sub_type — in v1 that
  is just `picture_book`).

Comic-specific entities (panels + speech_bubbles tables, panel
CRUD, bubble CRUD, the page/panel-XOR CHECK constraint) are
**out of Session 2** and land in **Session 2.5**.

Reasoning for the umbrella decision: when Comic-Book + Graphic-
Novel support eventually ships, the discriminator (`book_type`)
should NOT migrate again. By scoping the discriminator broadly
from day one, only `Book.visual_sub_type` values are added in
Session 2.5 — not a column rename, not a value enum widen.

The body of this audit otherwise stays correct (PluginForge
config loader, Page entity design, Playwright decision, cover-
as-page-1, immutable book type, etc.). Read sections below
with the §1 + §4 + §5 amendments in mind.

---

## 1. What the exploration specified

The exploration is complete and load-bearing. All major decisions are frozen:

| Decision | Resolution |
|---|---|
| Renderer | Playwright Python (headless Chromium) — rejected WeasyPrint, Pandoc/LaTeX, Puppeteer |
| Data model | New `Page` entity; `Book.book_type ∈ {"prose", "children_book"}`; `book_type` immutable |
| Convert-between-types | Not supported, ever |
| Speech bubble | Bundled SVG set, 5 anchor variants, `currentColor` |
| Cover | Page 1 IS the cover (no separate entity) |
| Spreads | Single-page only in v1 |
| KDP page count | Warn at <24 / odd, do not block; auto-append blank to even |
| MVP layouts | Layout A (speech bubble) + Layout B (image-top-text-bottom) only |

Roadmap from the exploration: Sessions 2–7, each green individually.

---

## 2. Current state — what's actually shipped

`plugin-kinderbuch v1.0.0` at [plugins/bibliogon-plugin-kinderbuch/](../../plugins/bibliogon-plugin-kinderbuch/):

- [plugin.py](../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/plugin.py): 40 LOC, `depends_on=["export"]`, license_tier `"core"`, manifest declares `editor_extensions: ["kinderbuch-page-layout"]`.
- [page_layout.py](../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/page_layout.py): 113 LOC, in-memory `PageLayout` class with `to_html()` / `to_markdown()`.
- [routes.py](../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/routes.py): `GET /api/kinderbuch/templates`, `POST /api/kinderbuch/preview` — both stateless.
- [kinderbuch.css](../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/templates/kinderbuch.css): 95 LOC, 4 layouts, viewport-relative units (`100vh`).
- Tests: 8, all green.
- 4 layouts wired: `image-top-text-bottom`, `image-left-text-right`, `image-full-text-overlay`, `text-only`.

What backend does NOT have:

- No `Page` table, no Alembic migration.
- No `Book.book_type` column.
- No CRUD routes for pages.
- No PDF/EPUB3-FXL export pipeline.
- No KDP trim/bleed CSS.

What frontend does NOT have:

- Zero kinderbuch / PageEditor / book_type references in `frontend/src/` (grepped clean).
- The manifest's `editor_extensions: ["kinderbuch-page-layout"]` points to nothing.

---

## 3. Pre-existing issues to fix BEFORE Session 2

### 3.1 P1 — Settings YAML lives in the wrong directory (dead config)

The plugin ships a real settings + templates YAML at [plugins/bibliogon-plugin-kinderbuch/config/kinderbuch.yaml](../../plugins/bibliogon-plugin-kinderbuch/config/kinderbuch.yaml) (templates list, image_position, font size, etc.). The runtime reads from [backend/config/plugins/kinderbuch.yaml](../../backend/config/plugins/kinderbuch.yaml), which has ONLY the manifest header — no `settings:`, no `templates:` block. PluginForge looks only in the backend `config_dir` (per the lessons-learned rule "Plugin settings YAML lives in `backend/config/plugins/`").

**Consequence:** `self._templates = self.config.get("templates", [])` returns `[]`. The plugin's frontend manifest reports zero templates. The 4 templates the `/api/kinderbuch/templates` route returns are hardcoded in `routes.py` — the YAML is decorative.

**Fix:** merge `settings:` + `templates:` blocks into the backend YAML; rewrite the route to read from the loaded plugin config; delete the plugin-side YAML to remove the duplicate-source-of-truth trap.

### 3.2 P1 — Frontend manifest declares a non-existent UI slot

`get_frontend_manifest()` returns `editor_extensions: ["kinderbuch-page-layout"]`. No frontend code consumes this slot. It is a silent dead reference.

**Fix:** drop the slot for now. Re-add in Session 3 when the actual frontend PageEditor lands.

### 3.3 P2 — Existing CSS uses viewport-relative units

Current CSS uses `100vh` — fine for browser preview, useless for KDP print which needs `8.75in × 8.75in` fixed. Will be replaced wholesale in Session 4; flagging so nobody invests further in the existing 4-layout CSS.

### 3.4 Scope mismatch on the ROADMAP P5 entry

The current ROADMAP entry reads:

> **Phase 4 kinderbuch single-page article variant**: single-page layout for the kinderbuch use case. Deferred — only on user demand.

This is much narrower scope than the 7-session exploration. ROADMAP revival updates this entry to reference the exploration's Sessions 2–7 scope and moves it to P2.

---

## 4. Open decisions for Session 2

Mostly resolved by the exploration. Open at audit time:

1. **Plugin path-dep**: already declared in [backend/pyproject.toml](../../backend/pyproject.toml). No change.
2. **`book_type` enum vs string column**: column stays `String(30)` for SQLite friendliness; Pydantic schemas use `Literal["prose", "children_book"]` at the validation layer (matches the `chapter_type` pattern).
3. **Pages-API namespace**: per-book subresources go under `/api/books/{id}/pages` (matches chapters/assets/audiobook). Plugin-global stays under `/api/kinderbuch/...`. The routes live in the kinderbuch plugin's `routes.py` but mount under the books URL space.
4. **`book_type` immutability enforcement**: HTTP 400 with explicit error message when `PATCH /api/books/{id}` payload contains a different `book_type` than the existing book. Loud rejection over silent-ignore; matches the "crash early" coding-standards rule.

---

## 5. Recommended Session 2 scope (confirmed)

1. **Alembic migration** chaining from `f0a1b2c3d4e5`:
   - `Book.book_type` column `String(30)`, `NOT NULL`, server_default `"prose"`.
   - New `pages` table per spec (cols: id, book_id FK CASCADE, position, layout, text_content, image_asset_id FK SET NULL, speech_bubble_config TEXT-as-JSON, created_at, updated_at).
   - Index on `(book_id, position)` for ordered queries.
   - Reversible downgrade: drop pages table, drop `book_type` column.
2. **Page model** in [backend/app/models/__init__.py](../../backend/app/models/__init__.py): SQLAlchemy mapped class with relationship back to Book + nullable relationship to Asset.
3. **Pydantic schemas**: `PageCreate`, `PageUpdate`, `PageOut`, `PagesReorder`; `Literal["prose", "children_book"]` for `book_type` on Book schemas.
4. **Plugin routes** in [bibliogon_kinderbuch/routes.py](../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/routes.py):
   - `GET /api/books/{id}/pages` (list ordered by position).
   - `POST /api/books/{id}/pages` (append to end).
   - `PATCH /api/books/{id}/pages/{page_id}` (update layout/text/image/config).
   - `DELETE /api/books/{id}/pages/{page_id}` (delete + reorder).
   - `POST /api/books/{id}/pages/reorder` (atomic position updates).
   - All gated on `book.book_type == "children_book"` (400 otherwise).
5. **Backend tests** in the kinderbuch plugin's `tests/` directory: ~30-50 new tests covering CRUD, validation, cascade, reorder, position conflicts, helpers (`count_pages`, `is_kdp_compliant`).

Out of Session 2: rendering, frontend, Playwright, EPUB3-FXL, KDP CSS. Deferred to Sessions 3–7 per exploration.

---

## 6. Risks to watch

- **Test DB schema drift.** New migration on `books` triggers the `rm backend/bibliogon.db` pattern. Session-close step.
- **Hardcoded templates in routes.py.** Pre-commit prep §3.1 fixes the YAML location AND wires the route to read from the loaded config.
- **Test isolation for the new `pages` table.** Standard `Base.metadata.create_all(engine)` in `conftest.py` covers it. No new fixture work needed.
- **No headless-browser CI yet.** Session 2 does not need it; Session 4 will require a CI matrix update (`playwright install chromium` step).
- **In-memory caches.** None added in Session 2. No `lru_cache` in the kinderbuch plugin or in the new page service.

---

## 7. Go / No-Go signal

The exploration's deferral criteria (3+ user requests, commercial pre-order, 100+ users) are unchanged. Today's revival is driven by user direct ask. Per the exploration's "Triggers for reconsidering" list, "Aster's own new picture-book project starts" is a valid go-signal.

**GO on Session 2.** Architecture is frozen, plugin scaffold exists, scope is bounded to backend-only DB + CRUD + tests. The exploration's mandatory go/no-go after Session 3 still applies — Aster authoring a 4-page test book is the validation gate before Session 4 (the high-cost PDF-export session).

---

## Cross-references

- [docs/explorations/children-book-plugin.md](../explorations/children-book-plugin.md) — original architecture exploration.
- [.claude/rules/architecture.md](../../.claude/rules/architecture.md) — plugin architecture, asset infra, manifest-driven UI.
- [.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md) — "Plugin settings YAML lives in `backend/config/plugins/`" + "Alembic migration + fresh test DB" + "Module-level caches survive test boundaries".
- [plugins/bibliogon-plugin-export/bibliogon_export/pandoc_runner.py](../../plugins/bibliogon-plugin-export/bibliogon_export/pandoc_runner.py) — path picture-book exports will bypass.
- [backend/app/routers/assets.py](../../backend/app/routers/assets.py) — asset infra reused unchanged.
