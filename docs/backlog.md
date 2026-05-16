# Bibliogon Backlog

Last updated: 2026-05-12 (Dependency audit + phased update landed: audit at docs/audits/dep-update-2026-05-12.md. Phases 1+2+4 shipped (8 commits): 15 backend low-risk patches + 4 frontend patches + 6 of 7 medium-risk packages. Phase 3 surfaced make lock-all-plugins is a no-op without pyproject changes; deferred plugin Pydantic alignment as PLUGIN-PYDANTIC-COORDINATED-BUMP-01 (P5). click 8.1.8 -> 8.3.3 blocked by gtts <8.2 upstream pin; filed as CLICK-V8-3-AWAIT-GTTS-01 (P5 BLOCKED). python-multipart 0.0.27 -> 0.0.28 needs paired plugin bump (medium-import also pins ^0.0.27); deferred. Net 5 new backlog entries: CRYPTOGRAPHY-V48-MIGRATION-01 (P3), MYPY-V2-MIGRATION-01 (P4), STARLETTE-V1-AWAIT-FASTAPI-01 (P5 BLOCKED), PLUGIN-PYDANTIC-COORDINATED-BUMP-01 (P5), CLICK-V8-3-AWAIT-GTTS-01 (P5 BLOCKED). ELEVENLABS 0.2.27 -> 2.x already covered by existing DEP-05.)
Current version: v0.33.0
Open tasks: 49 active (P2..P5) + 2 BLOCKED-on-upstream pointers
Archive: [docs/roadmap-archive/backlog-recently-closed-2026-05-02.md](roadmap-archive/backlog-recently-closed-2026-05-02.md)

Living backlog. Daily-planning view of ROADMAP work. ROADMAP stays
the canonical theme tracker; this file is forward-looking only.

This file lists ONLY open tasks. Closed tasks live in the archive
files; do not re-add closed entries here. If a closed task needs
to come back, create a new ID.

Tasks are sorted by priority tier (P0 most urgent, P5 most
speculative). BLOCKED-on-upstream pointers + non-task waiting
items live in their own section between P5 and the archive link.
Within each tier, smaller-scope and unblocking items come first,
with alphabetical-by-ID as final tiebreaker.

The 5 entries in "ROADMAP cross-reference" below are pointers to
ROADMAP entries; their canonical description lives there. The
backlog is a working list of pointers, not a duplicate definition
store.

---

## ROADMAP cross-reference (curated planning view)

- **AR-01 validation log** — see ROADMAP > P3.
- **DEP-02** (TipTap 3) — see ROADMAP > Blocked / Upstream Wait.
- **DEP-05** (elevenlabs 2.x) — see ROADMAP > Blocked / Upstream Wait.

---

## P0 - Deadline / Blocker / Security

(none)

---

## P1 - Architecture / Hygiene Debt

(none)

---

## P2 - High-Value User Features

- **MEDIUM-IMPORT-V2-01**: dry-run preview UI before bulk import.
  v1 (shipped 2026-05-08) imports every `posts/*.html` from a
  Medium archive in one pass; the user archives unwanted articles
  post-import via the standard dashboard trash flow. v2 should
  show a per-post table (title / date / language / canonical URL)
  with checkboxes so the user can deselect specific posts
  pre-import. Effort: M (frontend table + plumb selection through
  the existing `import_zip` orchestrator). Trigger: first user
  report that the post-import archive flow is too tedious for
  archives with many junk drafts.

- **ASYNC-IMPORT-PROGRESS-01**: real server-side progress for the
  Medium-import flow. The current frontend shows determinate
  progress for the upload phase (XHR `upload.onprogress`), then an
  indeterminate spinner for the server-processing phase because
  the backend endpoint (`POST /api/medium-import/import`) is
  synchronous. For a 200+ post archive with image downloads the
  spinner can run for several minutes. v2 should switch the
  endpoint to the existing async-job pattern (cf. plugin-export
  `/export/async/`) with SSE streaming `chapter_done`-style events
  per imported post. Effort: M (backend job-store integration +
  frontend EventSource subscriber, similar shape to
  AudioExportProgress). Trigger: first user complaint about the
  indeterminate phase, OR when archive sizes routinely exceed 60s
  processing.

- **MEDIUM-IMPORT-V2-02**: AI tag inference for imported articles.
  Medium's HTML export strips tags. v1 imports articles with an
  empty tag list and the user adds them manually. v2 should call
  the existing `backend/app/ai/` core module per imported article
  with title + first paragraph + body excerpt and propose 3-5
  tags, surfaced for review in the dry-run table from v01. Effort:
  S-M depending on tag-quality bar. Trigger: first user report
  asking for it OR v01 ships and the manual-tagging step is a
  visible bottleneck in feedback.

---

## P3 - Infrastructure / Quality

- **NAVIGATION-ORIGIN-TRACKING-01** (P3): extract a `useBackNavigate`
  hook that encapsulates the `location.key === 'default'` fallback
  pattern, and migrate the current hardcoded `navigate(-1)` /
  `navigate('/')` sites to use it.
  Trigger: a fourth 'global' page (i.e. one reachable from both
  AD and BD) appears with a back-button, OR a contributor adds a
  new top-level page that needs origin-tracking.
  Scope: extract the helper into `frontend/src/hooks/`; refactor
  Settings, Help, GetStarted to call it; add Vitest for the
  helper. Drop-in replacement; no user-visible behavior change.
  Effort: 3-5 commits.
  Deferred reason: the current 3-page direct-`navigate(-1)` form
  is acceptable. Utility extraction adds value at scale (4+ sites),
  not at 3. Filed during the v0.33.0 Bug 1 hotfix where the
  pattern emerged across Settings + Help + GetStarted.

- **LIST-VIEW-ROW-SHARED-EXTRACTION-01** (P3): extract a shared
  `<ListViewRow>` base component that `ArticleRow` and
  `BookListRow` can both consume.
  Trigger: a third instance of duplicate list-view-row code
  appears (e.g. a new Comments-Admin list view, or a Publications
  list view), OR a styling drift between Articles and Books list
  views surfaces in production.
  Scope: extract shared base component with selection + actions
  + content slots; migrate ArticleRow and BookListRow to consume
  it; preserve all existing testids; keep the per-row click
  guards (stopPropagation on checkbox/menu).
  Effort: 5-8 commits (substantial refactor).
  Deferred reason: not blocking the user-visible v0.33.0 Bug 2
  fix; would inflate that hotfix session. The current per-page
  list-row duplication is the price of the speed-of-fix tradeoff.

- **CONVERT-TO-BOOK-ASSET-CLONE-01** (P3): asset-clone walker
  for the article-to-book conversion feature.
  Trigger: first user report that book images break after they
  deleted a source article post-conversion.
  Scope: walk the source articles' `content_json`, find every
  `imageFigure` node, copy the referenced `ArticleAsset` files
  into a new `Asset` row scoped to the new book, rewrite the
  TipTap JSON `src` attribute from
  `/articles/{article_id}/assets/...` to
  `/books/{book_id}/assets/file/...`. Hook into the existing
  `POST /api/books/from-articles` endpoint so the clone happens
  in the same transaction as the chapter inserts (rollback
  semantics preserved). Plus an asset-cleanup branch in the
  book-delete handler that removes the cloned files (book
  assets are book-scoped so cascade-delete already handles the
  DB rows; the on-disk files need explicit cleanup).
  Effort: 2-3 commits (walker + endpoint integration + delete
  handler + tests).
  Defer reason: hypothetical until user-impact verified. The
  decoupled-lifecycle design assumes users do NOT delete source
  articles they've already converted; the help-doc workaround
  ("re-upload affected images via the Book editor") is
  acceptable while we have zero broken-image reports. Filed by
  Phase 1 Q9 deferral, 2026-05-15.

- **COMMENTS-ADMIN-PAGINATION-01** (P3, IMPROVEMENT): filed
  by UX-Full-Audit 2026-05-15 (G2-F3). Comments admin tab
  renders all comments in a single DOM table without
  pagination or virtualization. At current scale (49) it's
  fine; at 500+ comments the initial render and DOM weight
  will degrade. Add pagination OR virtualization OR a hard
  cap with "Show all" affordance. Effort: S-M. Trigger:
  first user >200 comments OR Settings sluggishness
  complaint.

- **I18N-NATIVE-REVIEW-V031-01**: native-speaker review for the
  three v0.31.0 namespaces (``ai_template``, ``bulk_ai_fill``,
  ``comments``) that ship passthru-English in es / fr / el / pt /
  tr / ja. Each affected catalog carries a top-level ``_meta:``
  block with ``review_status``, ``translator``,
  ``translation_date``, ``reference_lang``, and the explicit
  ``pending_namespaces`` list.
  ``backend/config/i18n/REVIEW_STATUS.md`` documents the
  per-language status and the PR-based correction submission
  flow (parallel to the v0.30.0 launcher precedent in
  ``launcher/bibliogon_launcher/locales/REVIEW_STATUS.md``).
  Trigger: native-speaker contact for any of the six pending
  languages, OR pair with LAUNCHER-I18N-NATIVE-REVIEW-01's
  reviewer outreach.
  Filed by D3 pre-release UX audit 2026-05-12.

- **BACKUP-PROJECT-IMPORT-MUTMUT-01** (P5): add direct unit
  tests for the per-asset / per-chapter helpers in
  ``app/services/backup/project_import.py`` (34 no-tests
  mutmut entries 2026-05-14). The helpers are transitively
  covered by ``test_import_handler_wbt.py`` but mutmut's
  per-function visibility is exact-match. Effort: S.
  Filed by ``MUTMUT-EXPAND-SCOPE-01`` 2026-05-14 audit.

- **BACKUP-SERIALIZER-MUTMUT-01** (P5): tighten the existing
  backup-roundtrip tests in ``test_backup_articles.py``,
  ``test_backup_import_revive.py``, ``test_backup_utils.py``
  to assert exact field presence on the serialized output
  (~162 surviving + 10 no-tests mutmut entries on
  ``backup.serializer`` 2026-05-14, mostly XX-wrap and
  case-flip on output-key strings). Tightening should kill
  the bulk in one pass. Effort: M. Filed by
  ``MUTMUT-EXPAND-SCOPE-01`` 2026-05-14 audit.

- **GIT-BACKUP-MUTMUT-01** (P5): triage the
  ``app/services/git_backup.py`` survivor pool (330
  survived + 57 no-tests; largest single-file pool in the
  services audit). Mix of cosmetic (git-config key
  strings, e.g. ``"user.name"`` / ``"user.email"``) and
  real (error-classification helpers with no direct
  coverage). Triage in its own session like the office +
  wbt audit. Effort: M. Filed by ``MUTMUT-EXPAND-SCOPE-01``
  2026-05-14 audit.

- **BIBLIOGON-DATA-FIX-FRAMEWORK-01**: refactor the six
  one-shot retro-fix scripts under `scripts/` into a generic
  framework. Existing scripts:
  `fix_medium_import_image_nodes.py`,
  `fix_medium_import_featured_images.py`,
  `fix_medium_import_truncation.py`,
  `fix_medium_import_language.py`,
  `fix_medium_import_seo.py`.
  They share a common shape:
  scope query (Article join ArticleImportSource), per-row
  predicate, per-row mutation, dry-run vs --apply, idempotent
  re-run reports zero changes. The same pattern is the
  obvious target for any future Bibliogon data-fix work
  (book imports, asset migrations, etc.). Effort: M (extract
  base class + per-fix subclass + tests). Defer until a
  fifth one-shot is needed; ship the four as one-shots first
  so the abstraction is informed by real cases. Trigger: 5th
  one-shot OR a new contributor needs to write one.

- **D-06-VALIDATION-01**: fresh-machine validation of the
  v0.28.0 cross-platform installer scripts (`install.command`,
  `install.ps1`, `install.cmd`). The scripts shipped unsigned
  per launch decision and were not exercised on a fresh macOS
  user account or fresh Windows 11 install before tagging.
  Trigger: first user report OR access to a clean test machine.
  Effort: S (run each wrapper, capture any Gatekeeper /
  SmartScreen / ExecutionPolicy edge cases). Folds into the
  next point release.

- **PGS-05-FU-01**: real-world unified-commit failure-mode tuning
  (only one of two subsystems active, partial-failure UX). Effort
  S; trigger by user report.

- **AR-BULK-SERIES-HIERARCHY-01**: parent/child series for the
  bulk-export filter. The 2026-05-06 bulk-export ship landed
  series as a flat free-string field on Article (mirrors
  `Book.series`). Hierarchical series ("Cosmos > Astrophysics >
  Stars") was deferred because no user has asked for it and a
  Series model + M2M migration is a multi-session investment.
  Trigger: first concrete user request for sub-series. Effort:
  1-2 sessions for the model + migration + filter UI nesting.
  See `docs/help/{en,de}/articles/bulk-export.md` "Series" note.

- **I18N-DIACRITICS-01**: auto-translated non-DE i18n YAMLs (es,
  pt, tr, possibly fr) ship with inconsistent diacritic coverage —
  some entries use proper Unicode (`géneros`, `Décroissant`,
  `gêneros`), others ASCII-substitute (`Titulo`, `Baslik`). Found
  in Test Phase Session 3 (2026-04-28) cross-language audit while
  fixing DE umlauts. Severity: Medium (readable but inconsistent +
  non-native). Effort: M per language. Cause: `AUTO_TRANSLATED.md`
  banner in `backend/config/i18n/` indicates DeepL/LMStudio passes
  with mixed quality. Fix: re-run translation with current DE
  source as canonical (DE was just cleaned up of all ASCII
  substitutes), human-review each for native diacritic use. Defer
  until DE i18n stable + a native speaker is available per
  language for review.

- **SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01** (P3, IMPROVEMENT):
  Settings → "Allgemein" tab requires scroll to reach all
  settings below the initial three Kacheln/cards. Should be
  reorganized for better discoverability.

  Recommended approach (CC decides at implementation time):
  - Option B preferred: split "Allgemein" into multiple top-level
    tabs (consistent with the existing tab pattern, avoids
    tab-in-tab cognitive load).
  - Option A acceptable: sub-tabs within "Allgemein" if Option B's
    tab-bar becomes too wide.
  - Option C fallback: cards-layout optimization only
    (Collapsible-Sections, denser grid).

  Scope:
  - Audit current "Allgemein" tab structure (which settings are
    grouped there).
  - Decide grouping strategy: Erscheinung / Verhalten / Daten / etc.
  - Implementation: extract relevant settings into separate tab
    components OR sub-navigation.
  - i18n: new tab labels in 8 languages.
  - Tests: Vitest + E2E for navigation between new tabs.

  Effort estimate: 4-6 commits (substantial Settings refactor).

  Trigger: builds on the v0.33.0 Settings-monolith extraction work
  shipped 2026-05-15 (archived: ``PLUGIN-SETTINGS-TESTID-COVERAGE-01``,
  ``SETTINGS-INLINE-TABS-EXTRACT-01``, both in
  ``docs/roadmap-archive/2026-05.md``). Now that the per-tab
  components exist (AppSettings / AiAssistantSettings /
  TopicsSettings / PluginSettings / AuthorSettings), reorganization
  sits cleanly on top — no extraction prerequisite remaining.
  Trigger this item when a Settings-Polish-Session is convened OR a
  user complaint about Settings scroll friction surfaces.

  Defer reason:
  - Not user-blocking (existing scroll works, just friction).
  - Today's Sprint-Velocity is at the upper edge (23+ commits since
    v0.33.0); this is the 8th surface-pattern instance manual
    smoke-testing has surfaced.
  - Bug 4 (Comments-Admin restructure) + Kinderbuch test-discipline
    deliverables are this session's defined scope.

  Filed by Hotfix-Session 2026-05-16 evening (after Bug-4 ship)
  per user instruction.

- **AUTHOR-DATALIST-EXTEND-EDITORS-01** (P3): extend the Bug 8
  Phase 2 Wizard Author-Dropdown pattern (``<input>`` +
  ``<datalist>`` + "Add to Authors-Database" checkbox) to the
  remaining author input surfaces:
  - ``ArticleEditor.tsx`` author field
  - ``BookEditor.tsx`` author field
  - ``BookEditor.tsx`` backpage author-bio sidebar
  Trigger: user-feedback that one of those surfaces is friction
  to type into OR positive validation that the Wizard Author-
  Dropdown pattern works well in production. Bug 8 Phase 2
  deliberately ships the pattern on the Wizard ONLY (per D8 —
  the Wizard is the high-leverage surface because multi-article
  selection surfaces multiple authors at once; single-record
  editors get the pattern later).
  Scope: ~4-5 commits. Mirror the Wizard's
  ``computeAuthorSuggestions`` helper for each surface (the
  helper itself stays reusable; only the inputs change — for
  the Article/Book editor cases there's no multi-row selection,
  so the suggestion pool is just the global Authors-DB).
  Re-use the same Add-to-Authors-DB checkbox shape + the same
  ``api.authors.create`` call shape. Vitest + E2E for each
  surface.
  Defer reason: scope-control. The Wizard pattern is novel
  enough that shipping it to one surface and letting Aster
  validate the UX is the right next step before duplicating it
  across three more editor surfaces. Filed during the Bug 8
  Phase 2 close-out.

- **KDP-CATEGORIES-CATALOG-SYNC-01** (P3, IMPROVEMENT): sync the
  KDP plugin's 25-category catalog in
  ``plugins/bibliogon-plugin-kdp/config/kdp.yaml`` with the
  10-category subset hardcoded in
  ``plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py``.
  Trigger: a scheduled Settings-Polish-Session OR a user report
  that the KDP categories shown in the UI don't match what the
  request handler accepts.
  Scope: pick one source-of-truth (the yaml is the natural
  choice — it's the user-editable catalog), drop the inline
  subset in routes.py, route validation through a helper that
  reads the yaml. Single-commit fix; ship paired with a
  regression test that flags any future divergence.
  Defer reason: pre-existing minor drift surfaced during the
  Bug-9 Pre-Inspection audit. Not blocking Bug 8 or Bug 9
  scope; routes.py + yaml have coexisted in this drifted state
  since the KDP plugin shipped. Filed for the next polish
  session.


---

## P4 - Roadmap / Future Phases

- **MYPY-V2-MIGRATION-01**: bump ``mypy`` from 1.20.2 to
  2.x. Major bump of the type checker. mypy 2.0 changed
  several inference defaults and dropped legacy
  behaviours; Bibliogon's existing
  ``[tool.mypy.overrides]`` blocks in ``backend/pyproject.toml``
  + the test-infrastructure-audit-added CI gate
  (``lint-and-type-check`` job) mean a 2.x bump that
  surfaces new errors would red-line CI immediately.
  Effort: M (re-run mypy, classify new errors, add
  overrides or fix source). Trigger: mypy 1.x reaches
  end-of-life status, OR ~6 months of latency pressure.
  Filed by dep-update audit 2026-05-12.

- **D-07**: Phase 2 follow-up — package-manager discoverability.
  After D-06 ships, submit a winget manifest to
  `microsoft/winget-pkgs` and create a Homebrew tap at
  `astrapi69/homebrew-bibliogon`. Effort: ~2 hours of
  implementation, plus reviewer latency (winget-pkgs PR review
  can take days to weeks; do NOT couple to D-06 release timing).
  Trigger: D-06 shipped + first real user feedback to confirm
  the wrappers actually work in the wild. Per discovery report,
  this expands discovery surface meaningfully without changing
  the underlying install path. See
  [docs/explorations/installer-discovery-report.md](explorations/installer-discovery-report.md).

- **AR-BULK-CROSSPAGE-SELECT-01**: cross-page Select-all for the
  bulk-export workflow. Articles dashboard does not paginate
  today, so "Select all = current page" is moot. When pagination
  lands (or articles count grows past comfortable scroll), Select-
  all needs to either select every filtered row across pages or
  surface an "X of N visible; select all N?" affordance. Effort:
  S once pagination exists. Trigger: pagination landing OR article
  counts complaint.

- **LAUNCHER-SELFREPLACE-01**: launcher binary self-replace.
  Currently the pre-install stale-target safeguard tells the
  user "download a newer launcher manually" and opens the
  GitHub release page. A real self-replace mechanism (download
  new binary, atomic replace, relaunch) would close that loop.
  Windows non-trivial: a running binary cannot replace itself
  directly; needs a helper script (e.g. spawn a `cmd.exe`
  background that waits for parent exit, copies new binary
  over old, relaunches). Linux/macOS simpler (`rename` + exec).
  Effort: 1-2 sessions. Defer: no concrete user demand and
  current safeguard already protects against installing a
  stale Bibliogon.

(D-05 closed as won't-fix 2026-05-05; archived in
[docs/roadmap-archive/2026-05.md](roadmap-archive/2026-05.md).)

---

## P5 - Speculative / Nice-to-have

- **COMIC-BOOK-PLUGIN-01** (P5): build a separate
  `bibliogon-plugin-comics` to own `book_type == "comic_book"`.
  The value is already reserved at the Pydantic schema layer
  (PB-PHASE4 Session 2) so the comics plugin can ship its own
  migration adding `panels` and `speech_bubbles` tables WITHOUT
  re-migrating the `book_type` column.
  Trigger: 3+ Comic-book authoring sessions reported, OR user
  pre-commits to a comics project, OR a contributor steps up
  with intent to build the plugin.
  Scope: new `plugin-comics` package + Panel entity migration
  (per-page panel rows, panel_grid_4 / panel_grid_6 / panel_grid_9
  layouts) + SpeechBubble entity migration (with page-OR-panel
  XOR CHECK constraint) + CRUD routes under
  `/api/books/{id}/{panels,speech_bubbles}` + comic-specific
  Playwright renderer for KDP / Comic-archive (CBZ) export.
  Frontend variant follows after the Picture-Book PageEditor lands
  in PB-PHASE4 Session 3. Plugin-discriminator is `book_type ==
  "comic_book"` (no umbrella required).
  Deferred reason: no current Comic-book authoring demand.
  PB-PHASE4 (Picture-Book) is the active user need; building two
  plugins in parallel splits attention and risks shipping neither
  well. Reserve the schema value, ship the picture-book MVP,
  validate it end-to-end with Aster, then revisit.

- **CONVERT-TO-BOOK-REVERSE-LINK-01** (P5): restore the
  `preserve_article_id_metadata` setting that Phase 1 dropped
  to satisfy the "kwargs without behaviour are forbidden"
  rule.
  Trigger: user requests a reverse-link or provenance feature
  for converted books, OR a "pull updates from source articles"
  affordance.
  Scope: add a nullable `Chapter.source_article_id` column
  (FK with `ondelete='SET NULL'` so deleting a source article
  surfaces the broken link instead of cascading the chapter
  away). Alembic revision populates as `NULL` for every
  pre-existing chapter (data not retained from past
  conversions). Re-introduce the
  `BookFromArticlesChapterSettings.preserve_article_id_metadata`
  field with a non-trivial behaviour test (per the
  lessons-learned "End-to-end behavior tests are not
  'kwarg passes through' tests"). Wire the wizard's Step 4 to
  expose the toggle. Use cases this unlocks: "show me which
  articles built this book" (Book-Editor sidebar), "update this
  chapter from its source article" (manual sync action),
  "find books that include this article" (Article-Editor
  sidebar).
  Effort: 3-5 commits (migration + schema + endpoint +
  wizard wiring + Book/Article-Editor surfaces + tests).
  Defer reason: speculative until user reports needing
  provenance. The current decoupled-lifecycle design is
  intentional; a reverse-link is opt-in and orthogonal to
  the v1 wizard flow. Filed by Phase 1 implementation
  decision, 2026-05-15.

- **CONVERT-TO-BOOK-CHAPTER-TYPE-DETECTION-01** (P5):
  smart `chapter_type` assignment for the article-to-book
  conversion. Phase 1 defaults every converted chapter to
  `chapter`; the user retypes via the Book-Editor sidebar
  after conversion.
  Trigger: user requests smart-typing during conversion, OR
  a pattern emerges across multiple bug reports of
  "manuscripta export treated my introduction as a regular
  chapter".
  Scope: heuristic in the wizard's Step 4 (or the backend
  endpoint) that maps common article-title patterns to
  `chapter_type` overrides. Candidate mappings (informed by
  the 209-article Medium corpus): `^introduction|intro$|^getting started` ->
  `introduction`; `^epilogue|conclusion|wrap[- ]?up$` ->
  `epilogue`; `^appendix` -> `appendix`;
  `^acknowledgments?` -> `acknowledgments`. The wizard's
  review step shows the planned mapping with per-row
  override before submit. Backend stays the same; the
  payload's `chapter_settings` block grows a
  `per_article_chapter_types: dict[str, ChapterType]`.
  Effort: 2-3 commits (heuristic + wizard surface + tests).
  Defer reason: ChapterType is reversible per-row in the
  Book-Editor at zero friction (3 clicks); the v1 default
  is the safer floor (no false-positive auto-types breaking
  manuscripta export). Filed by Phase 1 Q17 deferral,
  2026-05-15.

- **GH-ACTIONS-PERIODIC-AUDIT-01**: recurring CI-hygiene audit
  for GitHub Actions version drift. The 2026-05-14 sweep
  found that within 6 months of GitHub's 2025-09-19 Node 20
  deprecation, EVERY standard action we use released a new
  major. The pattern (deprecation announcement → cascade of
  major bumps across actions/* + common third-parties) is
  predictable, not exceptional. Filing it explicitly prevents
  the "we should have checked sooner" surprise on the next
  cycle.
  Trigger: 3 months since the last full CI-hygiene audit
  (last: 2026-05-14 → next due 2026-08-14), OR any Node
  runtime / platform deprecation announcement from GitHub
  before then (subscribe-able via
  https://github.blog/changelog/?tag=actions).
  Scope: re-run the full audit per the methodology in
  `.claude/rules/lessons-learned.md` "External GitHub Action
  major-version drift" — specifically the **action.yml
  `runs.using:` read**, not release-note prose (per the trap
  documented in the same lesson). Includes the deferred
  `GH-ACTIONS-OPTIONAL-BUMPS-01` items if their triggers have
  fired by then.
  Effort: S-M depending on what's drifted. Filed by the
  2026-05-14 CI-hygiene session as the explicit
  next-touchpoint.

- **GH-ACTIONS-OPTIONAL-BUMPS-01**: two optional standard-action
  bumps deferred from the 2026-05-14 CI-hygiene full audit
  (neither blocks Node-24 coverage; both are already on Node 24
  at the v5 pin):
  - ``actions/checkout`` v5 → v6: v6 introduces "persist creds
    to a separate file" (security improvement for jobs that
    checkout multiple repos in the same runner). No-op for
    single-checkout jobs, which is most of our workflows.
  - ``actions/setup-node`` v5 → v6: v6 narrows automatic
    caching from "any package manager" to "npm only".
    `frontend/package.json` does not declare a `packageManager`
    field, so the auto-caching path is dormant either way.
  Trigger: next periodic CI-hygiene audit (~2-3 months from
  2026-05-14), OR a specific need surfaces (e.g. credential
  isolation becomes relevant for a security review, or the
  frontend starts using npm via the auto-cache path). Effort:
  S per bump (single sed + commit each). Filed by the 2026-05-14
  full-audit session.

- **STARLETTE-V1-AWAIT-FASTAPI-01** (BLOCKED, upstream):
  bump ``starlette`` from 0.46.2 to 1.0.0 across the
  backend + 11 plugins. Blocked on FastAPI shipping a
  release whose upper-bound for starlette opens to
  ``>=1.0``. Surfaced during the dep-update audit
  2026-05-12 Phase 3: ``poetry update`` (bare) on a
  plugin pulled starlette 1.0.0 because fastapi 0.136.1
  apparently relaxed its starlette range. We reverted
  that plugin's lock; the starlette 1.0 upgrade is a
  cross-surface coordinated bump (FastAPI + Starlette +
  all 11 plugins + backend, all at once) and should not
  ship piecemeal. Trigger: FastAPI ships a release that
  pins ``starlette = ">=1.0"`` as its lower bound (not
  just relaxes the upper bound), making the bump a
  forced upgrade. Filed by dep-update audit 2026-05-12.

- **PLUGIN-PYDANTIC-COORDINATED-BUMP-01**: realign
  plugin Pydantic versions with the backend. Audit
  2026-05-12 found 9 of 11 plugins still at pydantic
  2.12.5 while backend is at 2.13.3 (now 2.13.4 after
  the medium-import plugin's lock got re-resolved
  during the audit). Not a runtime conflict (both 2.x
  compatible), just a "plugins lag backend" doc
  finding. The naive fix (``make lock-all-plugins``)
  is a no-op when nothing in plugin pyprojects
  changed; ``poetry update`` (bare) per plugin pulls
  the latest pydantic BUT also surfaces high-risk
  transitives like starlette 1.0 via fastapi 0.136.1.
  Mandatory: per-plugin ``poetry update pydantic
  pydantic-core`` (allowlist subset, NOT bare). 11
  plugins × 2 packages = 11 commits or one bundled
  commit. Trigger: ANY of (a) plugin CI fails due to
  pydantic version drift, (b) a backend feature needs
  a pydantic 2.13+ API that plugins also need, (c) a
  coordinated dep-update session is planned (where
  starlette + FastAPI + Pydantic bump together as a
  unit). Filed by dep-update audit 2026-05-12 Phase 3.

- **CLICK-V8-3-AWAIT-GTTS-01** (BLOCKED, upstream):
  bump ``click`` from 8.1.8 to 8.3.3 in the backend
  (and transitively across plugins). Blocked on gtts
  (Google Text-to-Speech) opening its pin
  ``click >=7.1,<8.2``. Used by the audiobook plugin's
  TTS adapter path. Trigger: gtts releases a version
  that opens its click upper bound to ``<9`` or
  ``<8.4``. Filed by dep-update audit 2026-05-12
  Phase 4.5 (click was in the medium-risk batch but
  poetry refused to move it due to the upstream pin).

- **MEDIUM-COMMENT-MANUAL-ENTRY-01**: manual "Add
  comment" UI in the article editor that creates an
  ``ArticleComment`` with ``imported_from = "manual"``
  rather than ``"medium"``. The schema already supports
  this via the ``imported_from String(50)`` column; no
  migration needed. Trigger: user demand for capturing
  comments-on-my-articles in Bibliogon for archival.
  Surfaced 2026-05-12 after the user verified Medium's
  HTML export is "your data only" by design — replies
  others left on the user's articles are not included
  in the export, and Bibliogon cannot import what
  Medium doesn't expose. The manual-entry workflow is
  the only forward-compatible path to archive incoming
  comments. Scope hint: editor sidebar gains an "Add
  comment" button next to the existing
  ``ArticleCommentsPanel`` heading; on click opens a
  small modal collecting author + body_text +
  optional published_at + optional responds_to_url
  (the URL of the source thread the user is
  transcribing from). The ``responds_to_article_id``
  is pre-filled with the open article's id. Effort: S
  (one new component + one POST endpoint that the
  comments router currently lacks; the GET / DELETE
  paths exist already).

- **COMMENTS-COUNT-PERF-01**: switch
  ``Article.comments_count`` from a ``len()``-on-relationship
  property to a JOIN-counted subquery against
  ``article_comments``. Trigger: per-article comment counts
  routinely above ~50, where SQLAlchemy materialising every
  row just to count it becomes wasteful. Today the property
  ships with a ``len()`` over the relationship list filtered
  by ``deleted_at IS NULL``; acceptable while typical counts
  stay 0-5. The subquery rewrite is a drop-in replacement on
  the model side; no schema change, no API change. Filed
  alongside MEDIUM-COMMENTS-UI-01 commit 1.

- **TESTCLIENT-HARMONIZE-01**: harmonise the 89 backend
  ``TestClient`` instantiation sites onto the lifespan-aware
  fixture pattern. Test-infrastructure audit 2026-05-12
  finding 0.4: 23 files use module-level
  ``client = TestClient(app)`` (no ``with``, so the FastAPI
  lifespan never fires and plugin routes are not mounted),
  34 files use the fixture-with-``with`` pattern correctly,
  3 files use inline-per-test. The lessons-learned rule
  "Tests must run through ``with TestClient(app) as c:``"
  documents the lifespan requirement but the heterogeneity
  persists. Trigger: a real "plugin route returns 404 in
  test" surprise from a no-lifespan file, OR a session
  dedicated to test-fixture cleanup. Refactor blast radius:
  large (89 sites, hidden state risks from shared
  session-scope clients). Filed by test-infrastructure
  audit 2026-05-12.

- **WALKER-HYPOTHESIS-01**: introduce Hypothesis
  property-based tests for the Medium-import walker
  (``plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/walker.py``).
  Test-infrastructure audit 2026-05-12 finding 0.7
  (Hypothesis option): zero ``@given`` usages today; the
  walker's example-based + regression-pin coverage is
  adequate. Candidate invariants if promoted:
  ``imageFigure`` count equals source ``<img>`` count;
  body-text length never changes more than 1% across
  re-parses; ``ParsedPost.is_comment`` is stable across
  whitespace-only HTML variations. Trigger: a third
  walker bug class slips through example-based tests
  (already had two: ``find`` vs ``find_all``,
  ``imageFigure`` vs ``image``). Effort: M, payoff
  dependent on bug rate. Filed by test-infrastructure
  audit 2026-05-12.

- **TESTCONTAINERS-EVAL-01**: evaluate Postgres-via-
  Testcontainers for backend integration tests.
  Test-infrastructure audit 2026-05-12 finding 0.7
  (Testcontainers option): Bibliogon ships SQLite as
  default and intended production DB (CLAUDE.md); no bug
  history of SQLite-vs-Postgres divergence; adopting
  Testcontainers would add 5-30s startup per CI run for
  zero documented payoff. Trigger: production-DB
  migration to Postgres, OR a documented SQLite-vs-Postgres
  divergence bug surfaces in production. Filed by
  test-infrastructure audit 2026-05-12.

- **MEDIUM-IMPORT-EXCERPT-AUTOFILL-01**: auto-populate
  ``Article.excerpt`` on Medium import, mirroring the existing
  seo_title / seo_description defaults shipped in commit
  ``2062393``. Trade-off: excerpt is conceptually similar to
  seo_description (both summarize the article), so duplicating
  the subtitle into both might feel redundant; alternatively,
  excerpt could derive from the first paragraph of body text
  with the existing heuristic-fallback rejection we applied to
  seo_description. No user complaint yet — the seo_description
  default covers the dashboard-tile use case. Promote to P2 if
  a user reports an empty-excerpt issue on imported articles.

- **AR-BULK-ASYNC-PROGRESS-01**: async bulk export with progress
  UI for selections >50 articles. The 2026-05-06 ship runs the
  request synchronously with a 180s server-side Pandoc timeout,
  which is fine for the typical workflow (<50 articles). For
  larger combined PDF runs the user sees a frozen browser tab
  until completion. Future work: convert to the async-job pattern
  used by audiobook export (background worker + SSE progress
  stream + persisted artifact). Effort: 1-2 sessions. Trigger:
  first user report of perceived hang, OR a real-world selection
  that exceeds 180s.

- **D-02 follow-ups**: macOS Intel universal2 build + code signing.
  Effort: M each. Deferred until user demand.

- **LAUNCHER-I18N-NATIVE-REVIEW-01**: native-speaker review for
  the three pending-review launcher i18n catalogs (pt, tr, ja)
  shipped in v0.30.0. Each catalog carries a
  `_meta.review_status: "pending native speaker"` block;
  `launcher/bibliogon_launcher/locales/REVIEW_STATUS.md`
  documents the per-language status and the PR-based
  correction submission flow. The
  `test_pending_review_catalogs_carry_marker` parity test
  enforces the marker contract, and `test_user_validated_*`
  enforces that markers are removed in the same change that
  promotes a language to validated. Trigger: native-speaker
  contact for any of pt/tr/ja, or a user-reported correction
  PR. Effort: S per language for an experienced reviewer
  (95 keys, mostly mechanical drift detection).
  - **Public surface:** GitHub issue
    [#18](https://github.com/astrapi69/bibliogon/issues/18)
    is the call-for-reviewers, labeled `help wanted` +
    `good first issue` + `documentation`. A passing-by
    pt / tr / ja speaker can find it without grepping the
    repo. Corrections land via PR per the flow in
    REVIEW_STATUS.md.
  - **Decision threshold:** 2026-08-07 (3 months after the
    v0.30.0 release). At that point an explicit decision
    lands on each marker: drop-the-marker (accept as
    canonical, with or without a review having happened),
    or continue-waiting. The threshold is also documented
    as a watch-list item in the v0.30.0 retrospective.

- **BISAC-DATABASE-LOOKUP-01** (P5): bundle the BISAC subject
  headings catalog with autocomplete + validation against real
  codes (vs. the current Bug-9 MVP's free-text + 9-char
  alphanumeric format check).
  Trigger: Bibliogon obtains a BISG license, OR a user requests
  autocomplete strongly enough to justify the license cost
  (~$590/year for the under-$1M-revenue tier as of 2026-05).
  Scope: ship the BISAC catalog as a JSON / SQLite resource
  inside the KDP plugin (or a new lightweight ``plugin-bisac``
  if licensing requires a separation), wire an autocomplete
  combobox into the BookMetadataEditor Marketing tab, replace
  the format-only validator with code-existence validation,
  surface the human-readable subject heading next to the code
  in the UI.
  Defer reason: BISG license terms are incompatible with
  Bibliogon's local-first + donation-based model in the v0.33.0
  state. The free-text + format-validation MVP (Bug 9 D3) is
  sufficient for the current user base — KDP best practice is
  ≤ 3 codes per book, and the format check catches the most
  common typo class (transposed letter / digit). Filed during
  the Bug 8 + Bug 9 Pre-Inspection so the deferred
  enhancement-path is visible if the licensing landscape
  shifts.

---

## Blocked / Upstream Wait

Items waiting on external triggers. Re-audit monthly via
`make check-blockers`. Do not attempt to advance these without an
unblock signal. ROADMAP entries (DEP-02, DEP-05, DEP-09, SEC-01)
are listed in the cross-reference at the top of this file; the
table below covers backlog-only waiting items + a quick-poll
summary.

| Item | Blocked on | Unblock condition |
|------|-----------|-------------------|
| DEP-02 (TipTap 3) | Upstream npm publish of `@sereneinserenade/tiptap-search-and-replace@0.2.0` | npm publish (default); path B (`prosemirror-search` adapter ~50-80 LOC) available on explicit go-ahead |
| DEP-05 (elevenlabs 2.x) | Real paid-API verification (substantial 0.2.27 -> 2.45.0 jump, careful audit required) | Schedule a dedicated audiobook test session with a live ElevenLabs key |
| PGS-04-FU-01 | First user report of cross-language structural divergence | User report |
| Manual launcher smoke tests (#2/#3/#4) | Real hardware (Windows / macOS / Linux) availability | Hardware access |
| Manual content-safety smoke (#8 Part 2 beforeunload) | Aster's local browser | Manual run |
| Manual UI smoke (#5) | Aster's local browser | Manual run |

---

## Maintenance / hygiene

Recurring upkeep, low priority but worth scheduling:

- **Test count verification** before any release. Run the
  per-plugin iteration from `ai-workflow.md` "Numeric claims
  verification". Don't grep.
- **`poetry show --outdated` + `npm outdated`** before each
  release per release-workflow.md Step 4b.
- **`npm audit --audit-level=high`** monthly (next: 2026-06-02).
- **Help docs review**: every shipped feature must update
  `help.yaml` and the help/{lang}/ pages. Audit on each release.
- **ROADMAP cleanup**: refresh the header line + "next active
  theme" sentence on each release. Move any item shipped outside
  its theme back into the right theme entry.
- **Dependency currency** per `lessons-learned.md`: only stable
  releases, no beta/RC/alpha. 2-week soak for new majors.
- **Systematic audit pass** quarterly (per
  `ai-workflow.md` "Test coverage audits → When to run"). The
  drop-in prompt lives at
  [.claude/prompts/audit.md](../.claude/prompts/audit.md);
  paste into a fresh Claude Code session at the repo root. It
  triages against documented standards in 4 sections (Test
  Validity / Code Quality / Infrastructure / Documentation)
  and is read-only — no code is modified.

---

## How to use this file

- Pick from the highest non-empty tier when starting a session
  and there's no user-driven priority override; consult ROADMAP
  for the canonical task description on cross-referenced items.
- When a session defers a sub-item, add it under the matching
  tier with a `*-FU-NN` ID and one-line "why deferred".
- When an item ships, **delete the row** from this file. The
  CHANGELOG / ROADMAP archive records the history; the backlog
  is forward-looking only.
- When the top tier changes, re-rank explicitly in this file
  before starting work, not implicitly during a session.
- Don't grow past 50 items. If it grows, split by category into
  themed files (`docs/backlog/dependencies.md`, etc.).
