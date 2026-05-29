# STORY-BIBLE-PLUGIN-01 — Pre-Inspection (Audit-First, read-only)

**Date:** 2026-05-30
**HEAD:** `fd9e7633` on `main`, clean tree (one untracked parallel-session
handoff file, left untouched), parity with `origin/main`.
**Baselines:** backend pytest 2399, Vitest 2487, 854 plugin tests / 12 plugins.
**Status:** STOP-gate deliverable. No code written. Adjudication required
on A1-A12 before any implementation.

---

## 0. Executive summary (read this first)

Three findings reframe the entire item before a single line of code:

1. **"Plugin-owned DB models" is not a pattern in Bibliogon.** The canonical
   precedent — plugin-comics' `ComicPanel` / `ComicBubble` tables — does NOT
   live in the plugin. They live in **core** `backend/app/models/__init__.py`
   (single shared `Base`), their schemas in core `backend/app/schemas/__init__.py`,
   and their table-creation in a **core-managed Alembic migration**
   (`pd5e6f7a8b9c_add_comic_panels_and_comic_bubbles.py`). The plugin
   contributes only routes + business logic + hookimpls. There is no
   `get_models()` hookspec. **A Story Bible's models, schemas, and migration
   must live in core**, exactly as comics' do. This is not a blocker — it is
   the established shape — but it means the word "plugin" promises an
   isolation that does not exist for data or frontend.

2. **The frontend is a monolith; plugins do not contribute pages, routes, or
   TipTap extensions.** React Router routes are **static** in core
   `frontend/src/App.tsx`. Plugin UI (e.g. `ComicBookEditor.tsx`) lives in
   **core** `frontend/src/components/`, conditionally rendered, gated on
   `book_type` / plugin-detection. The plugin manifest
   (`get_frontend_manifest()`) is consumed **only** by the Settings > Plugins
   panel + About tab — never for routing or editor injection. The Editor's
   extension array is **hardcoded** in `Editor.tsx`. kinderbuch already
   *removed* an `editor_extensions` manifest slot because "no frontend code
   consumed it." So every Story Bible UI surface (pages, sidebar, the
   @-mention TipTap extension) is a **core frontend** change gated on plugin
   activation — not plugin-shipped code.

3. **Filed scope (backlog) conflicts with this prompt's Track 2.** The filed
   `STORY-BIBLE-PLUGIN-01` body in `docs/backlog.md:692-730` specifies
   **5 entity types, per-book-scoped** (Character, Setting, PlotPoint, Item,
   Lore). This prompt's Track 2 proposes a **cross-book / series-spanning**
   model (StoryBible container, BibleBookLink M:N, CharacterAppearance,
   CharacterRelationship, Timeline). These are materially different data
   models and different scopes. Per the backlog-as-pointer / "ROADMAP wins"
   discipline and the project's uniformly book-scoped data model, the filed
   per-book scope is the conservative default — but this is the single most
   important adjudication (A2) and must be resolved by the user, not assumed.

**Recommendation in one line:** ship the **filed per-book-scoped** model as
v1 (matches every other entity in Bibliogon, no core-schema risk), follow the
**comics precedent** (core models/schemas/migration + thin plugin routes +
gated core frontend), and treat cross-book/series-spanning as an explicitly
deferred follow-up. Total scope ~18-24 commits across 4 sessions.

---

## Track 1: Existing plugin architecture (the canonical scaffold)

### Directory layout (CORRECTION to the prompt)

Plugins live at **top-level `plugins/bibliogon-plugin-{name}/`**, NOT
`backend/plugins/` (the prompt's paths are wrong; `backend/plugins/` contains
only `installed/` for ZIP-installed third-party plugins). 12 plugins exist
today.

### `pyproject.toml` (from plugin-comics, the closest precedent)

```toml
[tool.poetry]
name = "bibliogon-plugin-comics"
version = "0.41.0"                 # lock-step with app via make sync-versions
packages = [{include = "bibliogon_comics"}]

[tool.poetry.dependencies]
python = "^3.11"
pluginforge = "^0.10.0"
fastapi = "^0.136.0"
pyyaml = "^6.0"

[tool.poetry.group.dev.dependencies]
pytest = "^9.0"
pytest-cov = "^7.1.0"
httpx = "^0.28.0"

[tool.poetry.plugins."bibliogon.plugins"]
comics = "bibliogon_comics.plugin:ComicsPlugin"
```

Note the entry-point group `"bibliogon.plugins"`. Plugin version is propagated
by `make sync-versions` (lock-step). A new plugin must be added to
`scripts/sync_versions.py` `collect_targets()` and to `make lock-all-plugins`
(per the "Two installation paths" lessons-learned rule — the per-plugin
`poetry.lock` and the backend combined lock are independent CI gates).

### `plugin.py` class contract (from comics)

```python
class ComicsPlugin(BasePlugin):
    name = "comics"
    version = "1.1.0"
    api_version = "1"
    target_application = "bibliogon"
    min_app_version = "0.35.0"
    license_tier = "core"
    depends_on = ["export"]        # class attribute, not a method

    def activate(self) -> None:
        self._settings = self.config.get("settings", {})

    def get_routes(self) -> list[Any]:
        from .routes import router
        return [router]            # SINGLE router (recursion-limit discipline)

    def get_frontend_manifest(self) -> dict[str, Any] | None:
        return {"settings": getattr(self, "_settings", {})}

    # @hookimpl methods (export_execute / export_formats / content_pre_import)
```

**There is NO `get_models()` method or hookspec.** The only hookspecs
(`backend/app/hookspecs.py`) are `export_formats`, `export_execute`
(firstresult), and `content_pre_import`. Story Bible needs none of these for
v1 (it is a CRUD-over-routes plugin; export of the bible itself is a separate
A-decision, A11).

### Router registration pattern (load-bearing discipline)

`get_routes()` must return **exactly one** top-level router. Sub-routers nest
via `router.include_router(...)`, lazily (inside a function, wrapped in
`try/except ImportError`) so the plugin's isolated venv can import the module
for the per-plugin smoke without pulling in sqlalchemy/`app.models`. This is
the Single-Router-Per-Plugin convention (`lessons-learned.md`) — returning
3 sibling routers triggered the PluginForge per-lifespan recursion-limit
regression in comics Session 2.

### Model registration

Models are plain `class X(Base)` in `backend/app/models/__init__.py`, picked
up by the shared `Base.metadata` at import. Table creation is a hand-written
Alembic migration in `backend/migrations/versions/` (core-managed; latest head
`v1f2345678abc_add_book_status`). No plugin-owned migration mechanism exists.

### 3-Source plugin-metadata pattern (confirmed, with template)

| Source | Holds | Example |
|---|---|---|
| `plugin.py` class attrs | identity + contract (name, version, api_version, license_tier, depends_on) | `ComicsPlugin` |
| `backend/config/plugins/<slug>.yaml` **(CANONICAL)** | i18n `display_name` + `description` (8 langs) + `settings:` defaults | `comics.yaml` |
| `plugins/<slug>/plugin.yaml` **(GENERATED, not committed)** | build-time copy for ZIP | `make build-zip` |

The plugin Makefile's `build-zip` target reads the canonical YAML and writes
it into the ZIP; **never** commit `plugins/<slug>/plugin.yaml`. The new plugin
must also be added to `config/app.yaml` `plugins.enabled`, which triggers the
USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01 concern: existing users' overlay
`app.yaml` carries a stale `enabled` list, and the startup migration helper
(`config_overlay.migrate_user_overlay_enabled_list`) must pick up the new
plugin name. **Verify the migration auto-appends `story-bible`** — this is a
known trap (the comics addition hit it).

---

## Track 2: Data model design

### The scope conflict (A2 — the central adjudication)

| | **Filed backlog (per-book)** | **This prompt (cross-book/series)** |
|---|---|---|
| Container | none — entities `book_id`-scoped | `StoryBible` (1:1 series/standalone) |
| Linking | `book_id` FK on each entity | `BibleBookLink` M:N + `CharacterAppearance` |
| Relationships | (not specified) | `CharacterRelationship` entity |
| Timeline | (not specified) | `Timeline` ordered `PlotPoint`s |
| Entity count | 5 | 7+ entities + 3 link/relation tables |

Every existing Bibliogon entity is **book-scoped** (Chapter, Page, Asset,
ComicPanel, ComicBubble, BookPublishingState). "Series" is a **free-string**
field (`Book.series: String(300)`, `series_index: int`) — there is no Series
entity, no series grouping table. Cross-book linking would therefore require
**new core infrastructure** (a real series/bible container + M:N link table) —
which trips the prompt's own stop-condition *"Cross-book referencing requires
core schema changes beyond a link table (scope expansion)."*

**Recommended default (A2 = per-book v1):** matches the filed spec, matches
the entire codebase's data shape, and carries zero cross-cutting schema risk.
Cross-book is a clean future extension (add a nullable `story_bible_id` /
`series_key` later; the per-book rows migrate forward without loss).

### Recommended v1 model (per-book-scoped, core `backend/app/models/__init__.py`)

Five entities, one shared shape (drives the Recurring-Component-Unification
`EntityCRUDView` extraction at entity #2):

- `StoryEntity` base shape per type, OR 5 explicit classes — see A7 below.
  Common columns: `id` (UUID str), `book_id` (FK, indexed), `entity_type`
  or class-per-type, `name` (String), `description` (TipTap JSON, mirroring
  Chapter.content), `metadata` (per-type JSON, mirroring `Article.article_metadata`),
  `image_asset_id` (nullable FK to Asset, for the optional photo), `position`,
  `created_at` / `updated_at`.

  Per-type fields ride in the `metadata` JSON (Character: aliases, traits,
  arc_notes; Setting/Location: geography, significance; PlotPoint:
  timeline_position, involved_entity_ids; Item: significance, current_holder;
  Lore: category). This mirrors the `content-types.yaml` SSoT pattern already
  used for Articles — a `story-bible-entities.yaml` SSoT is warranted (A12).

### Key design answers (prompt A1-A6, my reading)

- **A1 (plugin-owned vs core):** core. Forced by the architecture (no
  plugin-model mechanism). Follow comics.
- **A2 (cross-book linking):** per-book v1 (see above). Defer M:N.
- **A3 (UI surface):** see Track 3 / A3.
- **A4 (@-mention):** feasible but needs a new dependency — see Track 4 / A4.
- **A5 (seed from content):** defer to a later session/item — scanning chapter
  TipTap JSON for entity names is a walker problem with the "find vs find_all"
  + real-corpus-audit risk class. Out of v1.
- **A6 (export bible):** defer (A11). The export plugin's hookspecs are
  book-export shaped; a standalone-bible export is a separate surface.

---

## Track 3: Frontend surface design

### The decisive finding

Routes are **static** in `frontend/src/App.tsx`:

```
"/"  Dashboard | "/book/:bookId" BookEditor | "/articles" ... | "/settings" ...
```

There is no plugin-route injection. Plugin UI is **core components gated on
detection**: `ComicBookEditor.tsx` is in `frontend/src/components/`, selected
via `useBookTypes` on `book_type`. The manifest only feeds Settings.

### Options (A3)

- **(A) Dedicated page** `/book/:bookId/story-bible` (or `/story-bible/:bookId`)
  — a new `<Route>` in **core App.tsx**, gated on plugin-detection (mirrors how
  ComicBookEditor is a core component). Most room for character sheets /
  timeline / lore wiki.
- **(B) BookEditor sidebar/panel** `StoryBibleSidebar` — the filed backlog
  explicitly names `StoryBibleSidebar component in BookEditor (gated on plugin
  activation)`. Lowest navigation cost; in-context while writing; this is the
  filed intent.
- **(C) Both** — sidebar for quick reference + dedicated page for full CRUD.

**Recommended default (A3 = B for v1, with the page as a Session-3 add):** the
filed spec says sidebar; start there, promote to a dedicated page when the
character-sheet / timeline surfaces outgrow a sidebar. This is also the
cheapest first-surface to ship and test.

CRUD UI per entity reuses existing core patterns: rich-text via the shared
Editor (TipTap JSON `description`), image via the Asset upload flow, list rows
via the `EntityCRUDView` extraction (Recurring-Component-Unification: extract
at entity #2, not deferred).

---

## Track 4: TipTap @-mention integration

- **TipTap is v2.27.2** (`@tiptap/core` pinned `2.27.2`; react/pm/starter-kit
  `^2.11.0`). The Editor extension array is **hardcoded** in `Editor.tsx`
  (StarterKit, Figure, Link, TextAlign, Highlight, Table, TaskItem,
  SearchAndReplace, Placeholder, Focus).
- **`@tiptap/extension-mention` is NOT installed** (and `@tiptap/suggestion`
  is not present). The Mention extension *does* exist for TipTap v2
  (`@tiptap/extension-mention@^2.27.2`, depends on `@tiptap/suggestion`), so
  it is **compatible** with the current pin — but adding it is a **new
  dependency**, which per coding-standards.md requires explicit user
  sign-off. → **A4**.
- Integration cost: editing **core** `Editor.tsx` to register
  `Mention.configure({ suggestion })`, plus a suggestion-render component
  (a Radix/`tippy`-style popup listing Story Bible entities for the current
  book). The mention node stores the **entity ID** (per the filed SSoT note:
  "the TipTap extension stores the entity ID; the editor renders the entity's
  current display-name on the fly"). Click-on-mention → navigate to the entity.
  The existing `useEditorPluginStatus` / `isPluginAvailable` gating pattern is
  the model for activating the mention behavior only when story-bible is
  mounted.
- **Compatibility caveat (lessons-learned):** community/peer-dep TipTap
  packages can silently pull `@tiptap/core` v3. Pin Mention + suggestion
  `--save-exact` to the matching `2.27.2` line; never `--legacy-peer-deps`.
- Not a stop-condition: the version is compatible. It IS an adjudication (new
  dep) and is the natural Session-4 scope (after CRUD + sidebar exist to
  populate the suggestion list).

---

## Track 5: Plugin-infrastructure gaps (the honest inventory)

| Capability | Supported? | Reality |
|---|---|---|
| Plugin-owned DB models + migrations | **No** | Models in core `app/models`, migration core-managed Alembic. comics did exactly this. |
| Plugin-contributed frontend pages/routes | **No** | Routes static in core `App.tsx`; plugin UI = gated core components. |
| Plugin-contributed TipTap editor extensions | **No** | Editor extensions hardcoded; kinderbuch removed the unused `editor_extensions` slot. |
| Plugin-contributed Dashboard widgets | **No** | No mechanism; Dashboard is core. |
| Plugin-contributed routes (backend) | **Yes** | `get_routes()` → single nested router. |
| Plugin Settings panel + i18n metadata | **Yes** | 3-source pattern + manifest → Settings. |
| Plugin activation/licensing/depends_on | **Yes** | pluginforge `PluginManager`. |

**Conclusion:** there is no infrastructure *gap* to fill — there is an
infrastructure *shape* to conform to. A Bibliogon "plugin" is a backend
activation/routing/licensing unit + a Settings manifest; everything
data-bearing and user-facing rides in core, gated on detection. This does NOT
trip the stop-condition "Plugin system can't support plugin-owned DB models
(scope expansion)" — because the precedent is to put them in core, which is
cheap and proven, not to build new plugin-model infrastructure. Building a
genuine plugin-model/route-injection framework would be a large, separate,
unrequested infrastructure project — explicitly **not** recommended.

---

## Track 6: Scope + session split

Estimate: **~18-24 commits, 4 sessions** (per-book v1; cross-book/seed/export
deferred). Within the prompt's 16-25 expectation; not over the 25-commit
stop-condition.

- **Session 1 (~6-7 commits):** plugin scaffold (pyproject + plugin.py +
  comics.yaml-style canonical + Makefile + sync-versions/lock wiring +
  app.yaml enable + overlay-migration verify) · core models (5 entities) +
  schemas + Alembic migration · CRUD routes (single nested router) + pytest
  (happy + error per endpoint, List endpoint mandatory per CRUD-List rule).
- **Session 2 (~5-6 commits):** frontend API client methods · `EntityCRUDView`
  extracted at entity #2 (not deferred) · character/setting/item/lore CRUD UI
  + Vitest · `StoryBibleSidebar` in BookEditor gated on plugin detection.
- **Session 3 (~4-5 commits):** PlotPoint + timeline (list-first; visual
  timeline deferred per A8) · relationship notes (text-first per A7) ·
  dedicated page if sidebar outgrows itself · E2E smoke (testid-namespace
  pinned, bounding-box assertions for any layout-critical surface).
- **Session 4 (~3-4 commits):** `@tiptap/extension-mention` dep + core
  Editor.tsx integration + suggestion popup + click-to-navigate · i18n 8 langs
  · help docs (DE+EN) + `_meta.yaml` nav · close + archive.

Deferred follow-ups to file as separate items: cross-book/series scope (A2),
seed-from-content walker (A5), bible export (A11), relationship graph viz (A7),
visual timeline (A8).

---

## Track 7: Architecture decisions (STOP for adjudication)

Recommended default is listed first in each.

- **A1 — Model ownership:** **core** `app/models` + core Alembic migration
  (forced; follow comics). *No real alternative.*
- **A2 — Scope (THE big one):** **per-book-scoped v1** (matches filed backlog +
  whole-codebase shape; zero cross-cutting risk) · vs cross-book/series-spanning
  (this prompt's Track 2; needs new core series/bible container + M:N — scope
  expansion, defer).
- **A3 — UI surface:** **StoryBibleSidebar in BookEditor v1** (filed intent,
  cheapest) · dedicated page Session 3 · both eventually.
- **A4 — @-mention:** **add `@tiptap/extension-mention`@`2.27.2` + suggestion
  (Session 4)** — new dependency, needs sign-off; compatible with current pin ·
  vs defer @-mention entirely if no new deps allowed.
- **A5 — Seed from existing content:** **defer** (walker risk class) · vs v1.
- **A6 / A11 — Export bible as standalone doc:** **defer** (export hookspecs
  are book-shaped) · vs v1.
- **A7 — Relationships + entity classes:** **text-only relationship notes v1**
  (a `relationships` field in metadata JSON) · vs a `CharacterRelationship`
  entity + graph viz (defer). Also: **5 explicit model classes** vs **one
  `StoryEntity` + `entity_type` discriminator** — recommend **one base table +
  discriminator + per-type metadata JSON** (mirrors `Article.content_type` /
  `article_metadata`; fewer tables, one migration, one EntityCRUDView).
- **A8 — Timeline:** **list/ordered v1** · visual timeline component (defer).
- **A9 — Multi-author sharing:** **single-user, no sharing fields v1**
  (Bibliogon is single-user; do not future-proof speculatively per
  "don't add abstractions beyond the task").
- **A10 — Session split:** as Track 6 (4 sessions). Confirm boundaries.
- **A11 — Bible export:** see A6 (defer).
- **A12 — Entity-type SSoT:** **`backend/config/story-bible-entities.yaml`**
  (per-type field lists + i18n labels), mirroring `content-types.yaml`. Warranted
  because there are 5 types with per-type metadata fields and 8-language labels —
  a YAML SSoT prevents drift. (If the user prefers entities in code: acceptable
  but the i18n labels still need the catalog.)

---

## Stop-condition check (prompt-defined)

| Stop condition | Triggered? |
|---|---|
| Plugin system can't support plugin-owned DB models | **No** — precedent is core models (cheap, proven). Not a gap; a shape. |
| Cross-book referencing needs core schema beyond a link table | **Conditionally** — only if A2 = cross-book. Avoided by per-book v1 default. |
| TipTap Mention incompatible with current version | **No** — Mention v2.27.2 is compatible. (New-dep adjudication, not incompatibility.) |
| Scope > 25 commits | **No** — ~18-24 for per-book v1. |
| Concept overlaps existing features unexpectedly | **Minor** — see Questions & assumptions below (Authors-DB, Storyboard, content-types). Not blocking. |

---

## Questions and assumptions

- **Evidence-derived (per the self-clarification rule):**
  - Plugin model/route/migration shape — derived from reading plugin-comics
    (`plugin.py`, `routes.py`, `pyproject.toml`, `comics.yaml`, `Makefile`),
    core `app/models/__init__.py:998-1056` (ComicPanel/ComicBubble),
    `app/hookspecs.py`, and migration `pd5e6f7a8b9c_…`. Not assumed.
  - Frontend static routing — `frontend/src/App.tsx:139-147`; plugin UI gating —
    `ComicBookEditor.tsx` + `useBookTypes`; manifest scope — grep showed
    consumers only in `settings/PluginSettings.tsx` + `AboutSettings.tsx`.
  - TipTap version + Mention absence — `frontend/package.json` + `node_modules`
    inspection.
  - Series = free-string — `app/models/__init__.py:61-62`, `:608-613`.
- **Parked / conservative assumptions:**
  - **Overlap with Authors-DB / Storyboard / content-types** is *minor* and
    non-blocking: Authors-DB is a global author registry (different domain);
    Storyboard is per-page picture-book annotation (different domain);
    content-types is the Article discriminator (a *pattern* to mirror for the
    entity-type SSoT, not a feature overlap). Assumed no consolidation needed;
    flag for the user to confirm.
  - Assumed **per-book v1** as the default pending A2 — the conservative,
    backlog-aligned choice. Did NOT design the cross-book model in detail
    because designing it would pre-commit to scope the user has not approved.
- **No STOP-blocking questions** arose during the read-only audit; the STOP is
  the deliberate adjudication gate, not an inability to proceed.

---

## Recommendation

Proceed with **per-book-scoped v1, comics-precedent architecture (core
models/schemas/migration + thin plugin routes + gated core frontend),
StoryBibleSidebar first, @-mention in Session 4 (pending the new-dep OK),
single `StoryEntity` base + discriminator + per-type metadata JSON, and a
`story-bible-entities.yaml` SSoT.** Defer cross-book/series, seed-from-content,
bible-export, relationship-graph, and visual-timeline as separately-filed
follow-ups.

---

## Adjudication (2026-05-30) — LOCKED

User adjudicated all four load-bearing questions to the recommended defaults;
the conventional defaults are locked for the rest:

| ID | Decision |
|---|---|
| **A1** | Core `app/models` + core Alembic migration (forced; follow comics). |
| **A2** | **Per-book-scoped v1.** Cross-book/series-spanning deferred (separate item). |
| **A3** | **`StoryBibleSidebar` in BookEditor**, gated on plugin detection. Dedicated page = optional Session-3 add. |
| **A4** | **Approve `@tiptap/extension-mention` + `@tiptap/suggestion` (pinned `2.27.2`, `--save-exact`); integrate Session 4.** |
| **A5** | Seed-from-content → **defer** (file follow-up). |
| **A6/A11** | Bible export → **defer** (file follow-up). |
| **A7** | **Single `StoryEntity` base + `entity_type` discriminator + per-type metadata JSON** (mirrors `Article.content_type` / `article_metadata`). Relationships = text notes in metadata v1. |
| **A8** | Timeline **list/ordered v1**; visual timeline deferred. |
| **A9** | **Single-user, no sharing fields** v1. |
| **A10** | **4-session split** per Track 6. |
| **A12** | **`backend/config/story-bible-entities.yaml` SSoT** (per-type fields + 8-lang labels), mirroring `content-types.yaml`. |

Deferred follow-ups to file as separate ROADMAP/backlog items:
cross-book/series scope (A2), seed-from-content walker (A5), bible export
(A6/A11), relationship-graph viz (A7), visual timeline (A8).

**Cleared to implement Session 1** (plugin scaffold + core 5-entity model +
schemas + migration + CRUD routes + tests).
