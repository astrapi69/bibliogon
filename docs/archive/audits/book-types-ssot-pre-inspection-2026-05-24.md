# BOOK-TYPES-SSOT-YAML-01 — Pre-Inspection (2026-05-24)

Audit-First read-only Pre-Inspection for the
`BOOK-TYPES-SSOT-YAML-01` filing. Goal: consolidate book-type
metadata (currently scattered across the codebase) into a
single `backend/config/book-types.yaml` source-of-truth, then
migrate all consumers.

Source: HEAD = `f67e15a` on `origin/main`. Tree clean.

---

## STOP-condition summary (load-bearing — read first)

Three of the four pre-declared STOP conditions fire:

1. **Surface count significantly higher than estimated 5.**
   Actual count: **5 definition sites + 19 consumption sites** across
   backend (4) + frontend (8) + plugins (4 dirs × 11 files). See
   Track 1 inventory below. This doesn't kill the work, but the
   scope-discussion changes from "small refactor" to "non-trivial
   cross-surface migration" (M-effort).

2. **Plugin-specific fields exist in core today.**
   - `PAGEABLE_BOOK_TYPES` lives in `backend/app/routers/pages.py`
     (core), but its semantics ("which book types use pages") is
     a CAPABILITY question that plugin-comics + plugin-kinderbuch
     answer.
   - `isEbookSupported(bookType)` lives in
     `frontend/src/components/kdp-wizard/PricingStep.tsx`
     (plugin-kdp UI), but its answer comes from per-book-type
     metadata that core would normally own.
   - This means the SSoT YAML has to express
     **per-type CAPABILITY flags** that are read by BOTH core
     code AND plugin code. The flags are core-owned data
     describing per-type behaviour; plugins consume.

3. **PluginForge boundary question.** Three possible models:
   - **(α) Core-owns-all.** YAML lives in `backend/config/`,
     plugins consume read-only. Adding a new book_type =
     core-side change. **Recommended (default).**
   - **(β) Plugin-extends.** Each plugin contributes its own
     book-type entries via a hookspec. Adding a new book_type =
     plugin-side change. Higher complexity; requires hookspec
     wiring.
   - **(γ) Hybrid.** Core defines the 3 current types; plugins
     can extend via a registry-extension API. Highest
     complexity.

   STOP CONDITION FIRES because the filing doesn't say which
   model to use. Defaulting to (α) for this audit; needs
   explicit adjudication. See A5.

The fourth STOP ("Book-type metadata includes plugin-specific
fields that shouldn't live in core config") effectively merges
with STOP #2: yes, the metadata is plugin-relevant; per the
core-owns-all model, it lives in core anyway.

---

## Track 1 — Surface inventory

### Definition sites (where the data is DEFINED)

| # | Path | What it defines | Drift risk |
|---|---|---|---|
| D1 | [backend/app/schemas/__init__.py:68](../../backend/app/schemas/__init__.py#L68) | `BookType = Literal["prose", "picture_book", "comic_book"]` | The canonical type signature for Pydantic. |
| D2 | [backend/app/models/__init__.py:75-88](../../backend/app/models/__init__.py#L75) | DB column comment + semantics narrative | Documentation only; not enforced. |
| D3 | [frontend/src/api/client.ts:37](../../frontend/src/api/client.ts#L37) | `export type BookType = "prose" \| "picture_book" \| "comic_book"` | **Hardcoded mirror** of D1. Must stay in sync manually. |
| D4 | [plugins/bibliogon-plugin-getstarted/bibliogon_getstarted/guide.py:8](../../plugins/bibliogon-plugin-getstarted/bibliogon_getstarted/guide.py#L8) | `BOOK_TYPES: tuple[str, ...] = ("prose", "picture_book", "comic_book")` with explicit "Keep in sync with backend BookType literal" comment | **Hardcoded mirror** of D1. Comment acknowledges drift risk. |
| D5 | [frontend/src/pages/GetStarted.tsx:39-64](../../frontend/src/pages/GetStarted.tsx#L39) | `BOOK_TYPE_CARDS: BookTypeCardSpec[]` array with per-type icon + i18n keys + fallback strings | **UI metadata duplication** — labels + descriptions also exist in i18n catalogs at keys `ui.get_started.book_type_*`. |
| D6a | [backend/config/i18n/{de,en,es,fr,el,pt,tr,ja}.yaml](../../backend/config/i18n/) `ui.get_started.book_type_*_title/_desc` (6 keys × 8 catalogs) | i18n labels + descriptions per book-type | Definition site for translated strings. Already centralized in catalogs. |
| D6b | Catalog-level: 8 catalogs each carry the same 6 keys. | Translation parity enforced by `test_i18n_parity.py`. |

**Conclusion:** the enum value-set is **triplicated** (D1, D3, D4). UI
metadata is **partly duplicated** between D5 (icons + fallback) and
D6 (i18n strings). Capability semantics (D2 narrative) are not
machine-readable.

### Consumption sites (where book_type is BRANCHED ON or DISPATCHED ON)

#### Backend (5 production files)

| # | Path | Concern |
|---|---|---|
| C1 | [backend/app/routers/books.py:589-609](../../backend/app/routers/books.py#L589) | `_IMMUTABLE_BOOK_FIELDS = ("book_type",)` — immutability guard. |
| C2 | [backend/app/routers/pages.py:36](../../backend/app/routers/pages.py#L36) | `PAGEABLE_BOOK_TYPES: frozenset[str] = frozenset({"picture_book", "comic_book"})` — **CAPABILITY SET** hard-coded. |
| C3 | [backend/app/routers/books.py](../../backend/app/routers/books.py) (PATCH handler) | Reads `book.book_type` for the immutability check. |
| C4 | 3 Alembic migration files | Write-once; out of scope. |
| C5 | 9 test files | Will need to adapt to new registry API where they reference the enum directly. |

#### Frontend (8 production files)

| # | Path | Concern |
|---|---|---|
| F1 | [frontend/src/pages/Dashboard.tsx:321-327](../../frontend/src/pages/Dashboard.tsx#L321) | Branches on `data.book_type === "picture_book" \|\| === "comic_book"` to auto-open the editor; this is a **content_model=="pages" implication** but expressed as raw enum comparison. |
| F2 | [frontend/src/pages/Dashboard.tsx:466-487](../../frontend/src/pages/Dashboard.tsx#L466) | Hardcoded dropdown menu items for the 2 non-prose types (picture_book + comic_book), each with their own testid + i18n key + icon. Adding a 4th type means adding code here. |
| F3 | [frontend/src/pages/BookEditor.tsx:482-535](../../frontend/src/pages/BookEditor.tsx#L482) | Branches on `book.book_type` to route between PageEditor (picture_book), ComicBookEditor (comic_book), and BookEditor (prose) — **editor dispatch table**. |
| F4 | [frontend/src/components/CreateBookModal.tsx:284-318, 324](../../frontend/src/components/CreateBookModal.tsx#L284) | Per-type modal title + template-tab visibility gating (only "prose" gets the template tab — could be expressed as `capabilities.template_catalog`). |
| F5 | [frontend/src/components/BookMetadataEditor.tsx:49-51, 510](../../frontend/src/components/BookMetadataEditor.tsx#L49) | `isChapterBasedBookType(bookType)` helper + picture_book-specific section toggle — **CAPABILITY check** (content_model="chapters" vs "pages"). |
| F6 | [frontend/src/components/ComicBookEditor.tsx](../../frontend/src/components/ComicBookEditor.tsx) | comic_book-only editor (consumer; no enum-branching but tightly coupled to one type). |
| F7 | [frontend/src/components/kdp-wizard/MetadataChecklist.tsx:79-87, 116](../../frontend/src/components/kdp-wizard/MetadataChecklist.tsx#L79) | `filterIssuesForBookType(issues, bookType)` — drops `chapters_count` issue for non-prose types. **CAPABILITY check** (content_model). |
| F8 | [frontend/src/components/kdp-wizard/PricingStep.tsx:67-72, 114](../../frontend/src/components/kdp-wizard/PricingStep.tsx#L67) | `isEbookSupported(bookType)` — hardcoded list of ebook-supporting types (only "prose"). **CAPABILITY check**. |

#### Plugins (4 plugins, 11 production files)

| # | Path | Concern |
|---|---|---|
| P1 | [plugins/bibliogon-plugin-comics/bibliogon_comics/{panels,bubbles}.py](../../plugins/bibliogon-plugin-comics/bibliogon_comics/panels.py) | `_get_comic_book_or_400` — gates EVERY panel + bubble operation on `book.book_type == "comic_book"`. |
| P2 | [plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py](../../plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py) | Consumer; rendering only. |
| P3 | [plugins/bibliogon-plugin-comics/bibliogon_comics/plugin.py](../../plugins/bibliogon-plugin-comics/bibliogon_comics/plugin.py) | Docstring narrative; no enum branching at runtime. |
| P4 | [plugins/bibliogon-plugin-export/bibliogon_export/routes.py:119-188](../../plugins/bibliogon-plugin-export/bibliogon_export/routes.py#L119) | Loaders branch on `book.book_type` for picture_book vs comic_book dispatch — **export pipeline dispatch table**. |
| P5 | [plugins/bibliogon-plugin-export/bibliogon_export/pandoc_runner.py](../../plugins/bibliogon-plugin-export/bibliogon_export/pandoc_runner.py) | Mention only. |
| P6 | [plugins/bibliogon-plugin-getstarted/bibliogon_getstarted/guide.py:8, 43-65](../../plugins/bibliogon-plugin-getstarted/bibliogon_getstarted/guide.py#L8) | Owns its own `BOOK_TYPES` tuple + per-type sample-book branching. **D4 lives here.** |
| P7 | [plugins/bibliogon-plugin-getstarted/bibliogon_getstarted/routes.py:26](../../plugins/bibliogon-plugin-getstarted/bibliogon_getstarted/routes.py#L26) | Sample-book endpoint with `book_type` query param defaulting to "prose". |
| P8 | [plugins/bibliogon-plugin-kdp/bibliogon_kdp/package.py:427-460](../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/package.py#L427) | The most-complex dispatch table: `_generate_prose_manuscripts` / `_generate_picture_book_manuscript` / `_generate_comic_book_manuscript` selected on `book_type` — **KDP-package dispatch**. |
| P9 | [plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py:185, 196, 227](../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py#L185) | **NAMING COLLISION** — `book_type` here means "ebook \| paperback \| hardcover" (KDP format), NOT the Book.book_type discriminator. Out of scope. |
| P10 | [plugins/bibliogon-plugin-kdp/bibliogon_kdp/changelog.py:37-43, 81-114](../../plugins/bibliogon-plugin-kdp/bibliogon_kdp/changelog.py#L37) | Same naming collision: "ebook"-format `book_type`. Out of scope. |

#### Out-of-scope same-name collisions (NOT touched by this work)

- `frontend/src/components/ExportDialog.tsx:39-49` — `BOOK_TYPES: BookTypeDef[]` defines the ebook/paperback/hardcover **format** selector. Same name, different concept. Stays as-is.
- `plugin-kdp` `book_type: str = "ebook"` parameters in changelog/routes — same.
- `backend/config/plugins/export.yaml:95` `book_type: ebook` — same.

These are documented here so a future contributor doesn't confuse them with the Book.book_type discriminator.

#### Backend tests (9 files)

`backend/tests/test_book_publishing_state_model.py`,
`test_comic_models.py`, `test_comic_routes.py`,
`test_kdp_arc_reviewer_routes.py`, `test_kdp_package.py`,
`test_kdp_publishing_state_lifecycle.py`,
`test_kdp_publishing_state_routes.py`, `test_pages_routes.py`,
`test_picture_book_pdf_export.py`.

All consume the enum via `book_type="picture_book"` etc. style
fixture setup. No enum-definition duplicates; some test files use
literal strings that would benefit from the SSoT constant.

### Plugins NOT touching book_type (negative finding)

`plugin-kinderbuch`, `plugin-audiobook`, `plugin-ms-tools`,
`plugin-grammar`, `plugin-translation`, `plugin-help`,
`plugin-medium-import`, `plugin-git-sync` — none reference
`book_type`. plugin-kinderbuch ships the page-related schema +
routes (recently consolidated under PAGES-CRUD-01 + PLUGIN-COMICS-
SESSION-3-PAGES-CRUD-01) but the book_type gate sits in core
routers, not in plugin-kinderbuch itself.

This is **important for the PluginForge boundary question (A5)**:
plugin-comics OWNS the comic_book semantics (panels + bubbles +
PDF rendering); plugin-kinderbuch INDIRECTLY owns picture_book
(it ships the page-renderer + 5 layouts but doesn't gate on
`book_type` at runtime because the gating lives in core).

### Surface-count summary

- **Definition sites:** 5 (D1-D5) + 1 i18n cluster (D6).
- **Consumption sites (production code, not migrations or tests):**
  - Backend: 3 (C1, C2, C3 — C4 + C5 excluded)
  - Frontend: 8 (F1-F8)
  - Plugins: 8 production files (P1, P2, P4, P5, P6, P7, P8 +
    P3-narrative-only; P9/P10 same-name-collision-not-applicable)

**Total surfaces in scope: 24 production files (5 definition + 19 consumption).** Filing estimated 5. Actual count is 4.8× higher.

---

## Track 2 — Metadata schema

Proposed shape for `backend/config/book-types.yaml`:

```yaml
# backend/config/book-types.yaml
#
# Single source of truth for the Book.book_type enum + per-type
# metadata. Both backend (BookTypeRegistry) and frontend (via the
# /api/book-types endpoint) consume this file.
#
# Adding a new book_type:
#   1. Append a new entry to ``book_types`` below.
#   2. Add the corresponding i18n keys in
#      backend/config/i18n/<lang>.yaml under ui.get_started.
#   3. Bump the BookType Literal in
#      backend/app/schemas/__init__.py + frontend/src/api/client.ts
#      (or use the verification test to catch the drift).
#   4. Add a discriminator-aware code path in any plugin that
#      cares (export pipeline, KDP package builder, etc.).

book_types:
  - id: prose
    label_key: ui.get_started.book_type_prose_title
    description_key: ui.get_started.book_type_prose_desc
    icon: BookOpen                     # lucide-react icon name
    content_model: chapters            # "chapters" | "pages"
    editor_component: BookEditor       # frontend component name
    capabilities:
      ebook_export: true
      paperback_export: true
      hardcover_export: true
      audiobook_export: true
      template_catalog: true
      kdp_package_supported: true
    dashboard_create_visible: true     # show in Dashboard "+" menu
    immutable_after_create: true       # discriminator-frozen flag

  - id: picture_book
    label_key: ui.get_started.book_type_picture_title
    description_key: ui.get_started.book_type_picture_desc
    icon: Image
    content_model: pages
    editor_component: PageEditor
    capabilities:
      ebook_export: false              # KDP rejects picture-book ebooks
      paperback_export: true
      hardcover_export: false
      audiobook_export: false
      template_catalog: false
      kdp_package_supported: true
    dashboard_create_visible: true
    immutable_after_create: true
    default_page_size: "8.5x8.5"       # picture-book square default

  - id: comic_book
    label_key: ui.get_started.book_type_comic_title
    description_key: ui.get_started.book_type_comic_desc
    icon: Layers
    content_model: pages
    editor_component: ComicBookEditor
    capabilities:
      ebook_export: false
      paperback_export: true
      hardcover_export: false
      audiobook_export: false
      template_catalog: false
      kdp_package_supported: true
    dashboard_create_visible: true
    immutable_after_create: true
    default_page_size: "7x10"          # comic standard
```

Schema rationale:

- **`id`** — string key. Backend `BookType` Literal stays in sync
  with these ids (verified by a new test).
- **`label_key` / `description_key`** — i18n key references, not
  inline strings. Translations stay in catalogs; this file points
  to them.
- **`icon`** — Lucide-react icon name as a string. Frontend
  resolves to the actual component at consumer site. Avoids
  embedding React JSX in YAML.
- **`content_model`** — replaces the `PAGEABLE_BOOK_TYPES` set +
  `isChapterBasedBookType` helper. ONE value per type, queried via
  `registry.get(type_id).content_model == "pages"`.
- **`editor_component`** — replaces the BookEditor.tsx routing
  table. Frontend maps name → React component; backend uses for
  documentation only.
- **`capabilities`** — replaces `isEbookSupported` (kdp-wizard),
  the various export-format gates in plugin-export + plugin-kdp,
  the template-tab visibility in CreateBookModal. ONE flat dict
  per type.
- **`dashboard_create_visible`** — replaces the hardcoded
  Dashboard dropdown items.
- **`immutable_after_create`** — replaces the `_IMMUTABLE_BOOK_FIELDS`
  hardcoded set in books.py.
- **`default_page_size`** — per-type default for the
  PdfExportControls dropdown.

Capability flags use **negative-default semantics**: an
unspecified capability means "not supported". This makes adding
new book types safe-by-default — they don't accidentally inherit
capabilities they shouldn't.

---

## Track 3 — Migration strategy

### Backend registry (BookTypeRegistry pattern)

Follow the existing `platform_schema` precedent in
`backend/app/services/platform_schema.py`:

```python
# backend/app/services/book_type_registry.py
from functools import lru_cache
from pathlib import Path
import yaml

from pydantic import BaseModel

class Capabilities(BaseModel):
    ebook_export: bool = False
    paperback_export: bool = False
    hardcover_export: bool = False
    audiobook_export: bool = False
    template_catalog: bool = False
    kdp_package_supported: bool = False

class BookTypeDef(BaseModel):
    id: str
    label_key: str
    description_key: str
    icon: str
    content_model: str  # "chapters" | "pages"
    editor_component: str
    capabilities: Capabilities
    dashboard_create_visible: bool = True
    immutable_after_create: bool = True
    default_page_size: str | None = None

_PATH = Path(__file__).resolve().parents[2] / "config" / "book-types.yaml"

@lru_cache(maxsize=1)
def load_book_types() -> dict[str, BookTypeDef]:
    raw = yaml.safe_load(_PATH.read_text(encoding="utf-8"))
    return {
        entry["id"]: BookTypeDef.model_validate(entry)
        for entry in raw["book_types"]
    }

def get_book_type(type_id: str) -> BookTypeDef | None:
    return load_book_types().get(type_id)

def book_types_with_capability(cap: str) -> list[str]:
    return [
        t.id for t in load_book_types().values()
        if getattr(t.capabilities, cap, False)
    ]

def pageable_book_types() -> frozenset[str]:
    return frozenset(
        t.id for t in load_book_types().values()
        if t.content_model == "pages"
    )
```

Per `lessons-learned.md` "Module-level caches survive test
boundaries" — any test that monkeypatches the YAML path must call
`load_book_types.cache_clear()` in both setup AND teardown via a
`yield`-based autouse fixture.

### API endpoint

```python
# backend/app/routers/book_types.py
@router.get("/api/book-types")
def list_book_types() -> dict[str, BookTypeDef]:
    return load_book_types()
```

### Frontend consumption

Match the existing `api.platforms.list()` pattern:

```typescript
// frontend/src/api/client.ts
bookTypes: {
    list: () => request<Record<string, BookTypeDef>>("/book-types"),
}

// frontend/src/hooks/useBookTypes.ts
// React Context loaded once at app mount, served via hook.
// Pattern mirrors useArticlePlatforms.
```

Or even simpler — since the data is static at runtime (no
per-user override), bundle at build time via a generated JSON
import. Trade-off captured in A2.

### Per-consumer migration table

| # | Surface | New API |
|---|---|---|
| C1 | `_IMMUTABLE_BOOK_FIELDS` in books.py | Query registry for ids where `immutable_after_create == True`. |
| C2 | `PAGEABLE_BOOK_TYPES` in pages.py | Call `pageable_book_types()`. |
| F1 | Dashboard `data.book_type === "picture_book" \|\| === "comic_book"` | Use `useBookTypes()` + `bookTypes[bt].content_model === "pages"`. |
| F2 | Dashboard dropdown items | Map over `Object.values(bookTypes).filter(bt => bt.dashboard_create_visible && bt.id !== "prose")`. |
| F3 | BookEditor editor dispatch | `editor_component`-driven Map of component name → React component at module top. |
| F4 | CreateBookModal title + template tab | `bookTypes[bt].label_key` + `bookTypes[bt].capabilities.template_catalog`. |
| F5 | BookMetadataEditor `isChapterBasedBookType` | `bookTypes[bt].content_model === "chapters"`. |
| F7 | MetadataChecklist `filterIssuesForBookType` | Same. |
| F8 | PricingStep `isEbookSupported` | `bookTypes[bt].capabilities.ebook_export`. |
| P4 | plugin-export routes | Backend dispatch keyed off `pageable_book_types()` + `get_book_type(bt).content_model`. |
| P6 | plugin-getstarted `BOOK_TYPES` tuple | `list(load_book_types().keys())`. |
| P8 | plugin-kdp package.py dispatch | Same Map-of-name → fn pattern as F3 but Python-side. |
| D5 | GetStarted `BOOK_TYPE_CARDS` | Deleted; rendered from `useBookTypes()` data + icon-name → component map. |

### What stays unchanged

- **`BookType` Literal** in backend + frontend stays as the
  type-level signature. A new test `test_book_type_literal_matches_registry`
  verifies the Literal's value-set equals the YAML ids on every
  commit.
- **i18n catalog keys** — already centralized, no migration.
- **Per-type editor components** themselves
  (BookEditor / PageEditor / ComicBookEditor) — unchanged.

### Migration order (least-coupling first)

The order minimises broken intermediate states:

1. Ship registry + YAML + tests (no consumer changes yet).
2. Ship API endpoint + frontend hook (no consumer changes).
3. Migrate backend consumers (C1, C2). Tests pin behaviour.
4. Migrate frontend pages/components (F1-F5, F7, F8 — F6
   doesn't need migration).
5. Migrate plugins (P4, P6, P8).
6. Last commit removes D4 (plugin-getstarted BOOK_TYPES tuple)
   + D5 (GetStarted BOOK_TYPE_CARDS) + replaces with
   registry-driven flows.

---

## Track 4 — Scope + session split

Estimated commit count: **10 commits** in a single session.

| C | Subject | Effort |
|---|---|---|
| C1 | feat(book-types): BookTypeRegistry + book-types.yaml + 8-10 backend tests | M |
| C2 | feat(book-types): GET /api/book-types endpoint + 2-3 endpoint tests | S |
| C3 | feat(book-types): frontend useBookTypes() hook + context + Vitest | S |
| C4 | refactor(book-types): migrate backend consumers (C1 + C2) | S |
| C5 | refactor(book-types): migrate Dashboard (F1, F2) + GetStarted (D5) | M |
| C6 | refactor(book-types): migrate CreateBookModal (F4) + BookEditor (F3) | M |
| C7 | refactor(book-types): migrate BookMetadataEditor (F5) + kdp-wizard (F7, F8) | M |
| C8 | refactor(book-types): migrate plugin-export (P4) + plugin-getstarted (P6) | M |
| C9 | refactor(book-types): migrate plugin-kdp/package.py (P8) | M |
| C10 | docs: close BOOK-TYPES-SSOT-YAML-01 | S |

10 commits is at the upper edge of single-session range
(release-workflow.md "5-commit stop-condition" is for
release-prep work, not migration arcs). The Recurring-Component
Unification Rule explicitly allows >5 commits for
extraction-plus-migration when "half-migration is forbidden".

**Recommended scope:** ship as one continuous session if the
arc holds attention; OR split at C5/C6 boundary into two
sessions (backend + 1 frontend surface → first session;
remaining 4 surfaces + plugins + docs → second session).

The single-session shape keeps the migration atomic. Risk: each
intermediate commit must stay green-individually per
"Atomic commits are bounded by 'green individually'" rule.
Strategy: feature-flag-style — backend ships registry but consumers
still use hardcoded constants until their migration commit lands.

---

## Track 5 — Architecture decisions

### A1: YAML location

**Recommend: `backend/config/book-types.yaml`** (default α).

Alternative (β): `config/book-types.yaml` at repo root. Rejected
because the existing convention is `backend/config/*.yaml` for
all backend-loaded YAML (i18n catalogs, plugin configs,
audiobook config, etc.). Repo-root location would be an outlier.

### A2: Frontend access pattern

**Recommend: `/api/book-types` runtime fetch + React Context** (default α).

| Option | Pros | Cons |
|---|---|---|
| α: Runtime API + Context | Single SSoT; matches existing `useArticlePlatforms` + i18n pattern | +1 GET on app boot (~5ms, well under threshold) |
| β: Build-time generated JSON in `frontend/src/data/` | No runtime cost | Requires a Makefile target + generated file committed to git; duplicates source-of-truth into a frontend-bundled artifact (anti-SSoT) |
| γ: Backend-bundled config endpoint serving ALL static config (i18n + book-types + platforms) | One endpoint instead of three | Larger refactor; couples three independent concerns |

α is the established pattern. The runtime cost is negligible
(book-types is a tiny payload — ~1KB JSON for 3 types).

### A3: BookTypeRegistry shape

**Recommend: Pydantic model + module-level `@lru_cache(maxsize=1)` loader.**

Exactly mirrors `platform_schema.py` which is already accepted
canon. Per the "Module-level caches survive test boundaries"
lessons-learned rule, ANY test that fakes the registry path MUST
register a `yield`-based autouse fixture clearing the LRU cache
in both setup AND teardown.

Rejected alternatives:
- Module-level dict (no validation; loses schema-enforcement
  benefit)
- Class with explicit instantiation (no caching benefit;
  needs DI plumbing that's not used elsewhere in Bibliogon)

### A4: Migration strategy

**Recommend: incremental per-consumer with atomic-green-per-commit.**

C1+C2+C3 ship the new infrastructure without touching any
existing consumer. C4-C9 migrate one consumer cluster each, each
commit green individually. C10 closes the loop with docs.

Big-bang single-commit migration is rejected on these grounds:
- Spans 24 production files; the diff is unreviewable in one commit.
- Bisect becomes impossible if a regression slips through.
- Per the "Atomic commits are bounded by 'green individually'"
  rule, splitting along consumer-cluster lines IS green-individually.

### A5: BookType Literal coexistence + PluginForge boundary

**Two distinct sub-decisions here:**

**A5.1: Backward compat for the `BookType` Literal.** Three options:

- **(i) Keep the Literal manually in sync + add a test** that verifies the
  Literal's value-set equals the YAML ids. **Recommended.** Simple;
  detectable drift; preserves Pydantic schema-generation + IDE
  autocomplete.
- (ii) Dynamically construct the Literal from YAML at module-load
  time. Breaks Pydantic schema generation in some tooling. Risky.
- (iii) Replace Literal with a custom string validator that reads
  the registry. Most flexible but loses type-checking benefit.

Frontend mirror (D3) gets the same treatment as D1 — keep the
Literal, test it matches the registry.

**A5.2: PluginForge boundary.** Three models again:

- **(α) Core-owns-all-book-types.** YAML is purely in
  `backend/config/`; plugins consume read-only. Adding a new
  book_type = core PR + plugin PR. **Recommended.**
- (β) Plugin-extends. Each plugin contributes book-type entries
  via a new `book_type_register` hookspec. Adding a new book_type
  = plugin-only PR. Higher complexity, requires hookspec wiring
  that's not currently exercised at runtime (see
  `HOOKSPEC-DISPATCH-WIRING-01` for the broader gap).
- (γ) Hybrid.

α matches today's coupling (plugin-comics + plugin-kinderbuch
already coordinate with core on book_type via shared schema
files); β/γ are speculative future work.

If future plugins introduce new book_types (e.g. cookbook,
anthology), the core-owns-all model still works — the YAML lives
in core, the entry references plugin-defined editor components
by name. Plugins still ship their own UI + backend logic;
they just don't define their book-type metadata.

---

## STOP-condition adjudication requested

Three explicit decisions need user adjudication before
implementation:

### Q1: Surface-count expansion (filing said 5; reality is 24)

Does this change scope-acceptance?

- **Q1.A:** Proceed at full scope (10 commits, 24 surfaces).
- **Q1.B:** Reduce scope — ship registry + new infra + ONE pilot
  migration (Dashboard / GetStarted) only. Defer rest to a
  follow-up filing per-cluster. Effort 4-5 commits.
- **Q1.C:** Defer the work entirely; surface count is too high
  for a single P3-tier session.

Recommend Q1.A.

### Q2: PluginForge boundary (A5.2)

- **Q2.A:** Core-owns-all (proposed default α).
- **Q2.B:** Plugin-extends via hookspec (β; speculative).
- **Q2.C:** Hybrid (γ; speculative).

Recommend Q2.A.

### Q3: Frontend access pattern (A2)

- **Q3.A:** Runtime API fetch + React Context (proposed default α).
- **Q3.B:** Build-time generated JSON bundle.
- **Q3.C:** Bundle into an existing `/api/config` aggregate.

Recommend Q3.A.

### Q4: BookType Literal handling (A5.1)

- **Q4.A:** Keep Literal + verification test (proposed default i).
- **Q4.B:** Dynamic Literal from registry (ii).
- **Q4.C:** Replace Literal with string validator (iii).

Recommend Q4.A.

### Optional Q5: Migration boundary

- **Q5.A:** Single session, 10 commits.
- **Q5.B:** Split at C5 boundary (5+5 across two sessions).
- **Q5.C:** Per-cluster sessions (one session per consumer cluster).

Recommend Q5.A unless time-pressure constraints fire.

---

## Recommended path (default-confirm to skip explicit adjudication)

If you want to skip the questions:

- **Q1.A** — full-scope ship (10 commits, 24 surfaces)
- **Q2.A** — core-owns-all
- **Q3.A** — runtime API + React Context
- **Q4.A** — keep Literal + verification test
- **Q5.A** — single session

Total commit count: **10 commits** (C1-C10) following the table
in Track 4.

Effort: M (single-session range, upper edge).

Test deltas projected:
- Backend pytest: +12 to +18 (registry tests + endpoint tests + migrated-consumer tests)
- Frontend Vitest: +6 to +10 (useBookTypes hook + migrated consumer tests)
- i18n: 0 (no new keys)
- Playwright: 0 (no new flows; existing book-creation specs cover the migration)

STOP gate enforced before code-write. No implementation begins
until adjudication lands.
