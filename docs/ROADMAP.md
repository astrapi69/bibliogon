# Bibliogon Roadmap

Current phase: Phase 2 - build for real users, not just developers
Last updated: 2026-06-01 (v0.43.0 released — the Story Bible integration depth release; 10 commits since v0.42.0. Prose Storyboard (chapter-card grid for prose books, shared `StoryboardAnnotations` module, Storyboard button on every book type), entity relationships (ally/rival/family/mentor/romantic/neutral) + Arc-View relationship lines, @-mention autocomplete of Story Bible entities in the chapter + page editors, and auto-detect of entity mentions in existing text. Backend pytest 2468, Vitest 2568, all green.)
Latest release: v0.44.0 (2026-06-01) — see [changelog/releases/v0.44.0.md](../changelog/releases/v0.44.0.md) for the full per-release notes.
Previous release: v0.42.0 (2026-05-30) — the Story Bible release; `plugin-story-bible` + the deep Story Bible ↔ Storyboard integration (entity-page linking, badges, appearance tracker, Arc View timeline, continuity checker, Markdown export).

This file is a **thematic overview** of open work. Detailed scope,
trigger conditions, and effort estimates live in [docs/backlog.md](backlog.md).
ROADMAP entries cross-reference backlog items by ID rather than
duplicating their bodies.

Tasks are sorted by priority tier (P0 most urgent, P5 most
speculative). Active backlog at 57 items (P3=17 + P4=28 + P5=12;
P0=P1=P2=0) + 2 BLOCKED-on-upstream entries; see backlog for the
per-tier list.

---

## Recently shipped (v0.36.0)

Three strategic streams matured together:

1. **plugin-comics v1.0.0 → v1.1.0** — multi-panel + multi-bubble
   comic-book editor for `book_type='comic_book'`, 8 CRUD endpoints,
   WeasyPrint PDF walker (7 grid templates + 6 bubble-type CSS
   variants + SVG triangle tail primitive), `ComicBookEditor` with
   `LayoutConfigComicPanel` / `ComicPanelGrid` / `ComicBubble`,
   `export_execute` hookspec wiring (eliminating cross-plugin
   reverse-imports).
2. **KDP Publishing Wizard Phase 1 + Phase 2** — 5-step XState v5
   wizard (Metadata + CoverValidation + Pricing + Arc + Export
   package) with `BookPublishingState` server-side persistence,
   `ArcReviewer` schema, conflict-resolution banner when book
   metadata changes mid-wizard. `WizardShell` + `WizardNav`
   primitives extracted (RCU 3-site).
3. **PluginForge v0.7.0 → v0.10.0 adoption arc** — 3-source plugin-
   metadata pattern codified, `target_application` / `app_id`
   declaration, `min_app_version` moved from YAML to class attribute,
   `DiscoveryResult` severity filtering, `/api/admin/rediscover`
   endpoint, single-router-per-plugin convention completed.

Plus 17 other coherent surfaces: Book-Types SSoT (book-types.yaml +
BookTypeRegistry + GET /api/book-types + `useBookTypes` hook +
10 migrated surfaces), picture-book PDF format dropdown + bleed /
crop marks, speech-bubble `bubbles[0]` wrapper with Tier 1 visual
style + Tier 2 typography, multi-book-type GetStarted (3-card
picker + per-type sample books), Author input migrated to Pattern A
Datalist (4 surfaces + `AuthorSelectInput` extraction), browser-
native fullscreen across 3 editors (`useFullscreenToggle` hook),
Alt+Z word-wrap toggle, About-Dialog 9th Settings tab +
`/api/system/info`, Backups consolidation (Version-History +
Compare-Backups moved Dashboard → Settings > Backups), page-delete
UI, Medium-import excerpt auto-fill + `<br>` preservation,
`BulkActionBar` 3-site RCU extraction, Story-tab metadata
(`Book.book_idea`), KDP categories wired to 26-entry catalog,
user-overlay plugin-enable lifespan migration, I18N-articles
namespace cleanup.

10 new lessons-learned rules filed (Single-Router-Per-Plugin,
Pre-Coding-Reality-Check, Audit-Methodology design-intent-axis,
CRUD-shipping List endpoint mandatory, Foundation-Override
extension, Stale-bundle false-positive class, Plain `git status`
multi-tool discipline, Periodic backlog re-prioritization,
Architecture-doc Pre-Inspection consultation, Operational gaps
masquerade as wired infrastructure).

**Post-release housekeeping (2026-05-25):** Dashboard pagination
(DASHBOARD-PAGINATION-LOAD-MORE-01 — 8 commits, `usePagedList` +
`PageSizeSelector`, Book + Article dashboards). Stale-backlog
audit closed COMMENTS-ADMIN-PAGINATION-01 (already shipped at
filing time). Trigger audits annotated on
BOOK-TYPE-CARD-COMPONENT-EXTRACT-01 + KDP-WIZARD-RESUME-AT-STEP-01.

---

## Current focus

All Phase 2 themes (Distribution, Templates, Polish, Git-based
backup, Donations, Core import orchestrator, plugin-git-sync,
Article authoring, plugin-comics, plugin-kinderbuch, KDP wizard,
PluginForge adoption, Dashboard pagination) are complete or
deliberately deferred. The remaining open work is a small set
of trigger-gated polish items, two new feature requests (Book
git-repo URL + editor display settings), a passive validation
track, and two upstream-blocked dependency upgrades.

---

## P0 - Deadline / Blocker / Security

(none)

---

## P1 - Architecture / Hygiene Debt

(none)

---

## P2 - High-Value User Features

(none)

---

## P3 - Open work, grouped by theme

### Picture-Book & Comics Optimization

The picture-book + comic-book authoring surfaces shipped through
v0.36.0; remaining work is feature-extension + UX-polish, all
trigger-gated.

- `PICTURE-BOOK-STORYBOARD-VIEW-01` — storyboard overview surface
  (separate from PageEditor), 10-15 commit substantial session.
  Trigger: user requests Storyboard during real Picture-Book
  authoring OR dedicated session scheduled. The first listed
  candidate for next strategic-stream work in this theme.
- `PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01` — `age_range` +
  `page_count` + `print_format` metadata fields. Trigger: first
  KDP picture-book upload reveals the field gap.
- `PICTURE-BOOK-TEXT-CONFIGURATION-01` + `PICTURE-BOOK-OVERLAY-
  TEXT-TIER-PROPERTIES-01` + `PICTURE-BOOK-PAGE-TEXT-TIPTAP-
  INTEGRATION-01` — 4c-B session cluster (Tier-Property + TipTap
  integration across image-based layouts). Pairs in one session;
  Pre-Inspection captured in their backlog entries.
- `PICTURE-BOOK-PDF-FRONT-MATTER-01` — author-controlled
  dedication / copyright / imprint pages in generated PDF.
  Trigger: user requests OR Aster's second book needs imprint.
- `PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01` — per-span font
  override on picture-book pages. Trigger: explicit user request.
- `PLUGIN-COMICS-SESSION-3-EXTENDED-FEATURES-01` — drag-to-
  position bubbles, snap-to-grid, per-bubble undo/redo, RTL
  toggle, z-order controls, panel gutter UI, full E2E matrix.
  8-12 commits; trigger: at least one user-report against the
  missing affordances.
Also referenced from explorations (not yet in active backlog):
`PICTURE-BOOK-EPUB3-FIXED-LAYOUT-EXPORT-01`,
`PICTURE-BOOK-KDP-PAGE-COUNT-VALIDATION-01`,
`PICTURE-BOOK-AI-DISCLOSURE-BADGE-01` — surfaced in the previous
ROADMAP's "Deferred sub-parts" block; not yet filed in backlog.

### KDP Wizard Refinements

- `KDP-WIZARD-RESUME-AT-STEP-01` — true "resume at last visited
  step" (Phase 2 ships partial-persistence; restart-at-metadata
  on every reopen). Trigger audit 2026-05-25 NOT MET — wizard
  load remains sub-second; no user feedback. Re-evaluate when
  either signal fires.

### Book Metadata Extensions

- ~~`BOOK-REPOSITORY-URL-FIELD-01`~~ — **CLOSED 2026-05-25**
  via 5-commit ship `8a8a11b..55829b8`: nullable
  `Book.repository_url` String(2000) + Alembic migration +
  BookMetadataEditor General-tab field with git-sync read-
  precedence (free input when no GitSyncMapping; read-only +
  "managed by git-sync" hint when a mapping owns the URL) + 4
  i18n keys × 8 catalogs + 9 backend pytest cases + 5 frontend
  Vitest cases + 2 Playwright smoke tests. Backend sweep 2260 →
  2269; Vitest 66 → 71 in the touched file; i18n parity 75/75
  held. See [docs/archive/roadmap/2026-05.md](archive/roadmap/2026-05.md)
  for the full archive entry.

### Editor Display Preferences

- ~~`EDITOR-DISPLAY-SETTINGS-01`~~ — **CLOSED 2026-05-25**
  via 6-commit ship `6197c35..2fb82f4`: per-device
  localStorage-backed editor display preferences (width, font
  family, font size, line height) + popover triggered from the
  shared Editor.tsx toolbar (chapter editor + ArticleEditor).
  CSS variables on `document.documentElement` cascade into
  `.tiptap-editor` via `var()` references with fallbacks
  matching pre-feature literals. 20 i18n keys × 8 catalogs +
  11 hook Vitest cases + 11 component Vitest cases + 2
  Playwright smoke tests. i18n parity 75/75 held; tsc clean.
  See [docs/archive/roadmap/2026-05.md](archive/roadmap/2026-05.md)
  for the full archive entry.

### Infrastructure / Quality

- `MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01` — adopt
  Strategic-Advisor recommendations as durable AI-workflow
  rules. Deferred 2026-05-22 until single-agent CC workflow
  hits a real scaling limit.
- `GH-ACTIONS-PERIODIC-AUDIT-01` — quarterly CI-hygiene audit;
  next due 2026-08-14.
- `MAKEFILE-VERIFY-PLUGIN-LOCKS-PARSE-01` — make-target parse
  bug under GNU Make 4.3 (German locale); workaround in place.
- `MYPY-V2-MIGRATION-01` — mypy 1.20.2 → 2.x bump when
  ecosystem catches up.
- `BACKUP-PROJECT-IMPORT-MUTMUT-01` + `BACKUP-SERIALIZER-MUTMUT-01`
  + `GIT-BACKUP-MUTMUT-01` — mutation-testing triage trio for
  the backup subsystems.
- `TESTCLIENT-HARMONIZE-01` — unify TestClient setup patterns
  across the backend test suite.
- `BIBLIOGON-DATA-FIX-FRAMEWORK-01` — generalized data-fix script
  framework for one-off corruption fixes (Medium-import
  walker incident precedent).
- `NAVIGATION-ORIGIN-TRACKING-01` — `useBackNavigate` hook
  extraction; trigger: 4th top-level page with back-button.
- `PLUGIN-METADATA-I18N-PARITY-01` — display_name + description
  parity across all 8 catalogs in plugin metadata.
- `PLUGIN-DEV-SERVER-RESTART-HELPER-01` — friendlier dev-server
  restart UX for plugin authoring.

### UX Polish

- `FULLSCREEN-PATTERN-RECONCILE-01` — reconcile the two
  fullscreen patterns (State-CSS textarea vs browser-Fullscreen
  API hook); trigger: third surface emerges OR user-feedback
  confusion.
- `BOOK-TYPE-CARD-COMPONENT-EXTRACT-01` — RCU pre-registered;
  trigger audit 2026-05-25 NOT MET (1 consumer only).
  Re-audit fires when a 2nd surface lands.
- `REMINDER-PANEL-GENERIC-EXTRACTION-01` — RCU pre-registered
  for a 2nd reminder-shaped affordance.
- `AR-BULK-CROSSPAGE-SELECT-01` — cross-page bulk-select for
  the article dashboard.
- `AR-BULK-SERIES-HIERARCHY-01` — hierarchical bulk-select for
  article series.
- `LIST-VIEW-ROW-SHARED-EXTRACTION-01` — extract shared
  `<ListViewRow>` base; trigger: 3rd duplicate list-view-row
  surface OR styling drift between AD + BD.
- `WIZARD-SHELL-IMPORT-VARIANT-01` — extend `WizardShell` to
  cover `ImportWizardModal` (current asymmetric per
  KDP-PUBLISHING-WIZARD-01 close).
- `METADATA-BUTTON-COMPONENT-EXTRACT-01` — RCU candidate from
  the v0.36.0 metadata-button proliferation across editors.

### Strategic / Long-Term

- `WRITING-GOALS-PROGRESS-TRACKING-01` — daily word-count goal +
  streak + per-chapter count widget (Scrivener / Ulysses
  precedent). M effort.
- `STORY-BIBLE-PLUGIN-01` — fiction-writing entity database
  (Characters, Settings, Plot-Points, Items, Lore). **Session 1
  (backend) + Session 2 (frontend) shipped 2026-05-30**: plugin
  scaffold, core StoryEntity model + migration + SSoT registry,
  CRUD API, StoryBibleSidebar + StoryEntityEditor in BookEditor,
  per-type icons/colors, i18n (DE+EN real, 6 passthru), help docs.
  Remaining:
  - `STORY-BIBLE-SESSION-3-01` — relationship graph + timeline
    visualizations (deferred from the per-book v1: relationships
    are text fields today; timeline is list-ordered).
  - `STORY-BIBLE-SESSION-4-01` — `@-mention` TipTap extension
    (`@tiptap/extension-mention`, adjudicated 2026-05-30) so a
    chapter can reference an entry inline + click-to-navigate.
  - `STORY-BIBLE-CROSS-BOOK-01` — series-spanning bible (v1 is
    per-book; rows migrate forward via a nullable series key).
  - `I18N-NATIVE-REVIEW-STORY-BIBLE-01` — native-speaker review of
    the `ui.story_bible.*` namespace in es/fr/el/pt/tr/ja (shipped
    English passthru).
- `MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01` — triage the
  open mobile-sync exploration. Deferred 2026-05-22 until real
  user-pull signal lands.

### Import / Export Refinements

- `MEDIUM-IMPORT-V2-02` — AI tag inference for imported Medium
  articles (Medium's HTML export strips tags).
- `MEDIUM-COMMENT-MANUAL-ENTRY-01` — manual "Add comment" UI
  for archiving comments-on-my-articles (Medium export is
  "your data only" by design).
- `BACKUP-DIFF-DEEP-VARIANTS-01` — per-Article / per-Settings /
  selective-restore variants of the existing BackupCompareDialog.

### Article Authoring

- **AR-01 validation log** (P3, passive) — capture real
  cross-posting workflow data in
  [docs/journal/article-workflow-observations.md](journal/article-workflow-observations.md)
  during normal publication work. 0 real entries as of 2026-05-06.
  AR-03+ readiness audit waits on 3-5 entries
  ([docs/audits/2026-05-02-ar-03-readiness.md](audits/2026-05-02-ar-03-readiness.md)).
- `CONVERT-TO-BOOK-ASSET-CLONE-01` — asset-clone walker for the
  Article-to-Book conversion feature.
- `CONVERT-TO-BOOK-REVERSE-LINK-01` + `CONVERT-TO-BOOK-CHAPTER-
  TYPE-DETECTION-01` — convert-to-book refinements.

### Launcher / Distribution

- `LAUNCHER-SELFREPLACE-01` — launcher binary self-replace
  during updates.
- `LAUNCHER-MACOS-UNIVERSAL2-01` — universal2 (arm64 + x86_64)
  binary for macOS.
- `LAUNCHER-CODE-SIGNING-01` — code-signing for launcher
  binaries (paid certificate; effort gated on budget).
- `LAUNCHER-I18N-NATIVE-REVIEW-01` (P5) — native-speaker review
  for launcher i18n; call-for-reviewers at
  [#18](https://github.com/astrapi69/bibliogon/issues/18).

### Plugin Ecosystem

- `PLUGIN-PYDANTIC-COORDINATED-BUMP-01` — coordinated Pydantic
  bump across all 12 plugins (currently they pin
  independently).

### i18n

- `I18N-NATIVE-REVIEW-V031-01` — native-speaker review for the
  three v0.31.0 namespaces (`ai_template`, `bulk_ai_fill`,
  `comments`) shipped passthru-English in 6 catalogs.
- `I18N-DIACRITICS-01` — diacritic-coverage track for the
  auto-translated non-DE catalogs.

### Tooling / Test Infrastructure

- `WALKER-HYPOTHESIS-01` — Hypothesis-based property tests for
  walker / scraper code (medium-import precedent).
- `TESTCONTAINERS-EVAL-01` — evaluate testcontainers for
  integration tests that currently rely on TestClient + tmpdir.
- `USESELECTION-RESPLIT-IF-DIVERGENCE-MATERIALIZES-01` — re-
  evaluate the deferred-extraction of `useSelection<T>()` (3
  byte-identical hooks; kept separate per documented design-
  intent, per the Audit-Methodology design-intent-axis rule).

---

## P4 - Future Phases

- `BACKUP-DIFF-DEEP-VARIANTS-01` (cross-listed in Import/Export
  above) — variants are P4 in backlog, P3 in this overview
  because feature-class is user-visible polish.
- `COMMENTS-COUNT-PERF-01` — server-side count endpoint when
  comments-per-article reaches the 200+ threshold.
- `D-06-VALIDATION-01` — distribution validation track follow-up.

---

## P5 - Speculative / Nice-to-have

- **D-03a**: AppImage for Linux — deferred. PyInstaller binary
  requires `python3-tk` on the target (preinstalled on every
  major desktop distro). Re-evaluate only when a user reports
  a missing-tkinter failure in the wild.
- **Phase 4 article-as-WBT git-sync**: article version control
  via plugin-git-sync, parallel to the book path. Deferred —
  only on user demand.
- `BISAC-DATABASE-LOOKUP-01` — bundled BISAC catalog for the
  Books > KDP wizard's category step (currently free-text).
- `GH-ACTIONS-OPTIONAL-BUMPS-01` — optional GitHub Actions
  bumps from the 2026-05-14 sweep.

---

## Blocked / Upstream Wait

Items waiting on external triggers. Re-audit monthly via
`make check-blockers`. Do not attempt to advance these without an
unblock signal.

- **DEP-02**: TipTap 2 → 3 migration. Blocks on upstream npm
  publish of `@sereneinserenade/tiptap-search-and-replace@0.2.0`
  ([issue #19](https://github.com/sereneinserenade/tiptap-search-and-replace/issues/19)).
  Pre-audit at [docs/explorations/tiptap-3-migration.md](explorations/tiptap-3-migration.md).
  Next re-audit: 2026-06-02. Alternative unblock path: write
  the `prosemirror-search` adapter fallback (~50-80 LOC).
- **DEP-05**: elevenlabs SDK 0.2.27 → 2.45.0 migration (complete
  SDK rewrite). Blocks on paid-API access for migration testing.
  Plan a focused session, not a side bump — the 0.2 → 2.x
  rewrite is too large to fold into a routine sweep.
- ~~**STARLETTE-V1-AWAIT-FASTAPI-01**~~ — **RESOLVED 2026-05-29**:
  the within-range dep sweep moved starlette 1.0.0 → 1.2.0 under
  fastapi 0.136.3, which now carries starlette ^1.x in its
  peer-dep range. Archived to `docs/archive/roadmap/2026-05.md`.
- **CLICK-V8-3-AWAIT-GTTS-01** — wait for gTTS to publish a
  release with click ^8.3 in its peer-dep range. Still blocked:
  the 2026-05-29 sweep left click at 8.1.8 (gTTS pins click <8.3).
- **DEP-DEFERRED-MAJORS-2026-05-29** — major / pin-blocked bumps
  deliberately deferred from the 2026-05-29 within-range sweep,
  each needing a dedicated, individually-validated session:
  - **mypy 1.20 → 2.x** (dev): new diagnostics likely; run against
    `mypy app/` in isolation, fix fallout, then bump the pin.
  - **weasyprint 66 → 68** (export / comics / kinderbuch PDF):
    rendering engine — needs visual PDF verification, not just unit
    tests.
  - **@types/node 24 → 25** (frontend): per lessons-learned,
    `@types/node` majors cascade into tsconfig `lib`; bump with
    `tsc --noEmit` in the same window.
  - **@vitejs/plugin-react 5 → 6** (frontend build): major; bump +
    `npm run build` verification.
  - **uvicorn 0.46 → 0.48** + **python-multipart 0.0.27 → 0.0.29**
    (backend): caret-pin-blocked (within-range sweep can't reach
    them); a pin edit triggers the two-installation-paths
    plugin-lock re-lock — fold into the per-plugin refresh below.
  - **Per-plugin `poetry.lock` refresh**: the 12 plugin locks are
    frozen ~v0.35 (pluginforge 0.5.0, fastapi 0.135.3, starlette
    0.46.2), CI-green but stale. A bulk `poetry update` pulls
    transitive majors (cryptography 46 → 48, rich 14 → 15) that
    only the per-plugin CI matrix can validate — do it per-plugin
    with CI verification, not as a routine bulk push. (The backend
    *combined* lock is already current as of this sweep.)

---

## Article authoring (reference)

Architecture decision (formerly AR-02) resolved as Option B: a
separate `Article` entity alongside `Book`. Phase 1 + Phase 2
(Publications + drift detection) shipped; see the Phase 2
archive entries. The exploration at
[docs/explorations/article-authoring.md](explorations/article-authoring.md)
captures the decision history. UX conventions at
[docs/ux-conventions.md](ux-conventions.md); help docs at
[docs/help/en/articles.md](help/en/articles.md) +
[docs/help/de/articles.md](help/de/articles.md).

The active AR-01 validation log is the only open AR task; it
sits in P3 above. Phase 4 article-as-WBT is a deferred-on-user-
demand item in P5.

---

## Explorations (not yet committed)

See [docs/explorations/](explorations/) for future considerations:

- [Desktop packaging](explorations/desktop-packaging.md) — Simple
  Launcher first (shipped via PyInstaller), Tauri as later option,
  no Electron.
- [Monetization strategy](explorations/monetization.md) —
  donations-first approach, deferred freemium.
- [Multi-user and SaaS](explorations/multi-user-saas.md) — long-
  term, not near-term.
- [Mobile + selective sync](explorations/exploration-bibliogon-mobile-selective-sync.md) —
  triage filed (`MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01`),
  awaiting user-pull signal.
- [Multi-agent gitflow coordination](explorations/exploration-multi-agent-gitflow-coordination.md) —
  follow-up filed (`MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01`),
  awaiting scaling-limit signal.

---

## Archive

- **Phase 1** (v0.1.0 - v0.14.0): [docs/archive/roadmap/phase-1-complete.md](archive/roadmap/phase-1-complete.md).
- **Phase 2 cleanup pass** (v0.15.0 - v0.25.0): [docs/archive/roadmap/v0.25.0-cleanup-2026-05-02.md](archive/roadmap/v0.25.0-cleanup-2026-05-02.md).
- **Backlog "Recently closed" prose**: [docs/archive/roadmap/backlog-recently-closed-2026-05-02.md](archive/roadmap/backlog-recently-closed-2026-05-02.md).
- **Continuous monthly buckets**: [docs/archive/roadmap/2026-05.md](archive/roadmap/2026-05.md) (current month).
- **Previous ROADMAP versions**: [ROADMAP-v0.36.0.md](archive/roadmap/ROADMAP-v0.36.0.md).
