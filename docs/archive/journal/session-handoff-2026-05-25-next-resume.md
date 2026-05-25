# Session-Handoff: Next Session Resume (2026-05-25)

Handover for the next CC session. **Filename note**: this file uses the
`session-handoff-2026-05-25-next-resume.md` naming per continuity with
the prior handover precedent (`session-handoff-2026-05-24-next-resume.md`,
which was itself filed under the day-after date for the same continuity
reason). **Actual date**: today is **2026-05-22**; today's batch closed
the post-handover work that started at `b717a86` (the previous handover
commit) and ended at `3d8d771`.

Companion file: [session-prompt-2026-05-25-next-resume.md](session-prompt-2026-05-25-next-resume.md)
(paste-ready resume block for a fresh CC session).

---

## Current state

- **HEAD on `origin/main`**: `3d8d771` `docs(editors): close
  AUTHOR-DATALIST-EXTEND-EDITORS-01 + AUTHOR-SELECT-INPUT-EXTRACT-01`
- **Working tree**: clean; local `main` == `origin/main`
- **Backend pytest**: **2213** passed, 1 skipped (+ 47 unrelated
  warnings — all httpx / asyncio / etc.; the pluginforge multi-
  router DeprecationWarning is GONE as of `c137d93`)
- **Frontend Vitest**: **1998** passed (156 test files)
- **i18n parity**: **75/75** passing (8 catalogs; structure +
  parity + critical-keys + translation-separation all green)
- **Playwright specs**: **63** in `e2e/smoke/` (+2 new today:
  `editor-word-wrap-toggle.spec.ts` + `editor-author-datalist.spec.ts`,
  and the renamed Layout-Stability spec for convert-to-book)
- **tsc --noEmit**: clean

---

## 2026-05-22 Session Arc Recap

The highest-velocity day in project history measured by backlog-
items-closed: **10 backlog items closed, 27 commits pushed (including
1 parallel-session commit by Aster), 0 regressions**. Spans the
range `b717a86..3d8d771` over a single calendar day.

Today's batch was structured as three meta-tasks:

1. **CI-red hotfix** + 5 ungated-backlog drains across the day
2. **Continue-with-ungated-only-then-stop** drain (2 more items)
3. **Backlog Adjudication Batch** (4 explicit user-directed
   tasks: ROADMAP re-sync + defer 2 + HOOKSPEC audit/adjudication
   + AUTHOR-DATALIST migration)

### Closures (in order)

#### 1. CI-red hotfix — `chore(pre-commit)` (1 commit, `24e03a8`)

The previous handover's end-of-day commit `b717a86` had landed
with pre-commit hooks NOT having been run pre-push; CI red on
3 hook failures:
- end-of-file-fixer: 3 files (`PageCanvas.test.tsx`,
  `LayoutConfigSpeechBubble.test.tsx`, `lessons-learned.md`)
- ruff-format: 5 backend files with collapsible multi-line
  column definitions
- module-state-audit: new `@lru_cache` on
  `book_type_registry.load_book_types` not allowlisted

Fix: ran all 3 categories through their auto-fixers + added
the new cached function to the audit script's ALLOWLIST (verified
both test files have proper bidirectional `cache_clear()`
fixtures per the canonical category-(a) pattern). Single commit.

#### 2. EDITOR-KEYBOARD-SHORTCUT-ALT-Z-01 (P3, 3 commits)

SHA range: `d0ae61e..4cee2db`.

Industry-standard Alt+Z word-wrap toggle across every editor
surface (chapter editor, picture-book RichText, comic-book,
markdown textarea) via a single body-level CSS class.

- Pre-Inspection collapsed scope from 4 surfaces to 1 insertion
  point: `useKeyboardShortcuts` was already the canonical app-
  level registry; `.ProseMirror` is a TipTap-internal class
  stable across all editor surfaces.
- New `useWordWrap` hook (84 LOC): state + localStorage
  persistence (`bibliogon-word-wrap-disabled`) + body class
  sync via useEffect.
- CSS rule in `global.css`: `body.no-word-wrap .ProseMirror,
  body.no-word-wrap [class*="markdownEditor"] { white-space:
  pre; overflow-x: auto; }`. Covers all TipTap surfaces + the
  markdown textarea in one selector.
- Cheatsheet entry in `APP_SHORTCUTS` for Ctrl+/ panel + i18n
  key `ui.shortcuts.toggle_word_wrap` in all 8 catalogs.
- Silent toggle (no toast) matches VS Code / Sublime / IntelliJ.
- **Vitest +7** (useWordWrap unit tests; happy-dom).
- **Playwright +2** (forward+reverse toggle with computed CSS
  assertion + localStorage persistence across reload).

Disposition: pure-additive feature, no behavior regression.

#### 3. MEDIUM-IMPORT-EXCERPT-AUTOFILL-01 (P5, 2 commits)

SHA range: `66a1161..e360466`.

Auto-fills `Article.excerpt` on Medium import: subtitle when
present, else 300-char sentence-boundary slice from body text,
else NULL.

- New `_body_text_excerpt(content_doc, max_chars=300)` helper
  in `bibliogon_medium_import/importer.py`. Walks TipTap JSON
  via the existing `_flatten_body_text` utility; prefers last
  `. ` / `! ` / `? ` marker within budget; falls back to
  hard-truncate + `"..."` when no sentence boundary appears at
  or above `_EXCERPT_MIN_SLICE` (200 chars).
- **seo_description behavior UNCHANGED**. The SEO-D precedent
  pinned by `test_seo_description_null_when_post_has_no_subtitle`
  stays at import time. Excerpt is more permissive than
  seo_description by design.
- Retro-fix script `scripts/fix_medium_import_excerpt.py`
  mirrors the SEO retro-fix pattern (scoped via
  ArticleImportSource, per-field idempotency gate, `--apply`
  required). Production DB currently empty (0 articles) — ships
  as infrastructure for any future re-import.
- **+8 unit tests** (`_body_text_excerpt` helper) + **+3
  endpoint tests** (subtitle path, body-slice fallback,
  empty-body NULL handling).
- **Test deltas**: backend pytest 2207 → 2210 (+3), plugin
  pytest medium-import 89 → 97 (+8).

#### 4. CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01 (P3, 2 commits)

SHA range: `9fb224b..483f90d`.

Two distinct UX bugs from real-user-smoke 2026-05-18 closed
together:

- **Bug #2 (action-button position shift)**: the "Buch erstellen"
  button moved from inside `renderStepReview` body INTO the
  WizardNav.onFinish slot (`isLastStep={step === TOTAL_STEPS -
  1}`). Same physical position as Next button on all earlier
  steps. Testid rename: `convert-to-book-wizard-review-confirm`
  → `convert-to-book-wizard-step-5-finish`; 8 Vitest references
  + 3 E2E references migrated.
- **Bug #1 (dialog jumping)**: `stepContent` constrained to
  `minHeight: 380` + `maxHeight: 520` + `overflowY: "auto"`
  (was minHeight: 280 with no max). The WizardShell migration
  on `a94e0b9` had already capped the dialog at 90vh; this
  additional constraint pins the body so dialog dimensions
  stay visually stable across all 6 steps.
- **Vitest +2** (regression-pins for both bugs).
- **Playwright +1 case** (4th case in `convert-to-book.spec.ts`):
  asserts the action-button's bounding-box-Y is consistent
  across all 6 steps within a 6px tolerance, per the
  "Playwright-visible ≠ User-visible" lessons-learned rule.

**Pre-Coding-Reality-Check finding**: the WizardShell migration
on `a94e0b9` had ALREADY provided the `onFinish` prop on
WizardNav, but the inline button at `ConvertToBookWizard.tsx:
1108-1125` was never moved into it — the migration left the
bug latent.

#### 5. PLUGIN-COMICS-MAKEFILE-INTEGRATION-01 (P3, 2 commits)

SHA range: `1c35997..08d7ff7`.

The backlog item explicitly called out 2 sibling drifts; closed
all 3 in one sweep per the Half-Wired-Lifecycle "close all known
instances of the pattern" discipline.

- Per-plugin targets: `test-plugin-comics`,
  `test-plugin-medium-import` (mirror canonical kinderbuch
  pattern).
- Coverage targets: `test-coverage-plugin-comics`,
  `test-coverage-plugin-medium-import`,
  `test-coverage-plugin-git-sync` (the git-sync coverage gap
  was opportunistic — pre-existed, not from the original
  filing, closed in the same sweep).
- Aggregate `test-plugins` now lists all 12 plugins (was 10).
- Aggregate `test-coverage-plugins` now lists all 12 plugins
  (was 9).
- `.PHONY` header at lines 4 + 6 updated for parallel `-j`
  inclusion.

Verified: `make test-plugins` exits 0 with all 12 plugin suites
firing (comics shows 15 tests, medium-import shows 97).

#### 6. PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01 (P3, 2 commits)

SHA range: `c137d93..8ce9f6f`.

Pluginforge 0.8.0 deprecation warning was firing in every test
run; trigger (iii) of the backlog item's gates ("the deprecation
warning becomes noisy enough to mask other test output") fired
on our test output.

- New `parent_router = APIRouter(tags=["export"])` at the
  bottom of `plugin-export/routes.py` that nests the three
  existing sub-routers (`router`, `bulk_router`, `jobs_router`)
  via `include_router`.
- `plugin.py` `get_routes()` returns `[parent_router]` instead
  of the 3-router list. Zero `@router.get(...)` decorator
  changes (50+ existing decorators stay untouched).
- API surface verified unchanged via TestClient route
  enumeration: all 8 export endpoints at their expected
  prefixes.
- **Warning count**: 48 → 47 (the multi-router
  DeprecationWarning is gone).

plugin-export is now the 3rd plugin (after kinderbuch + comics)
to ride the canonical Single-Router-Per-Plugin shape.

#### 7. PLUGIN-VERSION-GATING-ENABLE-01 (P3, 2 commits)

SHA range: `b351e73..ba2dd1a`.

`min_app_version` enforcement was dormant — ComicsPlugin
(`min_app_version="0.35.0"`) and KinderbuchPlugin
(`min_app_version="0.9.0"`) declarations existed as documented
intent but were never gated. Soft trigger interpretation: both
existing declarations already qualify as "real version
requirements" per the backlog's trigger (i).

- 1-line ctor change: added `app_version=__version__` to
  `PluginManager(...)` at `backend/app/main.py:310`.
- 3 new regression tests in
  `backend/tests/test_plugin_version_gating.py`:
  - `test_plugin_with_future_min_app_version_is_filtered`
    (synthetic plugin with `min_app_version="99.0.0"` rejected
    with `filter_reason="incompatible_app_version"`)
  - `test_plugin_with_compatible_min_app_version_activates`
    (positive counterpart)
  - `test_real_plugins_pass_their_declared_min_app_version`
    (release-time regression catch; pins host version >= both
    shipped declarations)
- **Backend pytest**: 2210 → 2213 (+3).

Operator impact: future plugin declaring `min_app_version > host
_version` is now filtered out at activation with a load-error
message. Release-workflow implication: at each Bibliogon version
bump, the `test_real_plugins_pass_their_declared_min_app_version`
test gates the release.

#### 8. KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01 (P3, 2 commits)

SHA range: `9c2c302..1aab549`.

Classified as Half-Wired-Visible-in-Production per the
Foundation-Override extension: backend endpoint
`GET /api/kdp/categories` live, frontend `CategoryInput`
accepts a `suggestions` prop, but `BookMetadataEditor` passed
`[]` — users saw a Categories field with no autocomplete despite
the 26-entry Amazon-canonical catalog.

- New `api.kdp.listCategories()` method in `frontend/src/api/
  client.ts`.
- One-shot `useEffect` in BookMetadataEditor on mount fires the
  fetch into `kdpCategoriesCatalog` state. Cancelled-guard
  against unmount races; silent degrade on fetch rejection
  (CategoryInput remains free-text-capable).
- `<CategoryInput suggestions={kdpCategoriesCatalog} />`.
- **+2 Vitest pins**: assert fetch fires once on mount with the
  rendered `<datalist>` options containing the catalog values;
  failure-degrades-gracefully assertion.
- **Vitest**: 1996 → 1998 (+2; BookMetadataEditor suite 64 →
  66).

#### 9. HOOKSPEC-DISPATCH-WIRING-01 (P3, 1 commit + filed sibling)

SHA: `e682e45`.

Audit + per-hook adjudication for the 3 declared-undispatched
hookspecs at `backend/app/hookspecs.py`. Zero plugin
implementations existed for any of the three — pure intended-
architecture, not dead-code-attached-to-nothing.

| Hook | Disposition |
|---|---|
| `chapter_pre_save` | **DELETED**. Zero implementations after multiple release cycles. Sibling `content_pre_import` covers the import-side use case. |
| `export_execute` | **Wire via follow-up**. Filed as **HOOKSPEC-EXPORT-EXECUTE-WIRE-01 (P3)** — separate 3-5-commit session. Eliminates 6 cross-plugin direct-import sites in plugin-export's routes.py + 1 site in plugin-comics's comic_book_pdf.py. |
| `export_formats` | **Status quo**. plugin-export is the single export-plugin today; wiring would require splitting the format catalog across plugins. Re-evaluate on first 2nd-export-plugin proposal. |

Single commit covering:
- Hookspec deletion of `chapter_pre_save`
- Module + per-hook docstring updates to reflect new state
- Backlog entry: HOOKSPEC-DISPATCH-WIRING-01 removed +
  HOOKSPEC-EXPORT-EXECUTE-WIRE-01 (P3) entry filed

#### 10. AUTHOR-DATALIST-EXTEND-EDITORS-01 + AUTHOR-SELECT-INPUT-EXTRACT-01 (P3, 3 commits)

SHA range: `62b2a9c..3d8d771`.

User pre-adjudicated **Pattern A** (free-text input + datalist
autocomplete). Both backlog items closed together per the
original coordinated-session shape.

All 4 author-input surfaces now ride the unified `AuthorSelectInput`:
- CreateBookModal (shipped earlier)
- ConvertToBookWizard (shipped earlier)
- BookMetadataEditor (today)
- ArticleEditor (today)

**Asymmetric design**:
- **BookMetadataEditor**: full Pattern A (input + datalist +
  "Add to Authors-DB" checkbox + create-on-save). Save button
  provides explicit moment-of-intent for the
  `api.authors.create` call.
- **ArticleEditor**: input + datalist ONLY. Checkbox
  DELIBERATELY SUPPRESSED. Rationale: ArticleEditor auto-saves
  on every keystroke; auto-DB-create on every keystroke would
  create partial-name rows ("Joh", "John D", "John Doe"). Users
  curate via Settings > Author tab.

Test changes:
- 5 Vitest tests in the author+language describe block of
  `BookMetadataEditor.test.tsx` rewritten in-place for Pattern A
  (renders-as-input vs renders-as-select; datalist-exposes-
  suggestions vs dropdown-lists-options; unknown-value-as-free-
  text vs disabled-fallback-option).
- API/client mock entries added (`api.authors.list/create`).
- 3 new i18n keys × 8 catalogs = 24 entries.
- 1 new Playwright spec (`editor-author-datalist.spec.ts`,
  2 cases).

**Vitest**: 1998 → 1998 (rewritten in-place; test count
unchanged).

#### Parallel-session commit by Aster: `ed4b8ae`

A parallel-session commit landed on local main during the day:

> `fix(medium-import): preserve <br> as newlines in code blocks
> + omit null language`

Bug 1: Multi-line code blocks (YAML, bash, Java, etc.) imported
from Medium were collapsing to a single line. Root cause:
BeautifulSoup's `get_text()` silently strips `<br>` tags, which
is how Medium encodes line breaks inside `<pre>` elements. New
`_extract_pre_text()` walks the structure preserving `<br>` as
`\n`. +1 test (`test_walker.py`), bringing backend pytest to
its 2213 baseline.

I left this commit alone per the Multi-Tool-Coordination
explicit-paths discipline ("never absorb parallel-session work
in my commits"). My subsequent push included Aster's commit
naturally.

### ROADMAP re-sync

PB-PHASE4 P2 block was stale across 5 unchecked sub-sessions.
Cross-reference against git log:

- **Sessions 3-6**: actually shipped (frontend editor; speech-
  bubble + image-based layouts; book_type-aware tab filtering
  + metadata-tab access; PDF export via WeasyPrint).
- **Session 7**: shipped via GETSTARTED-MULTIBOOK-TYPES-UPDATE-01
  (commit chain `75f2ef6..012396a`).

All 5 sub-sessions marked `[x]`. Three sub-parts of the
original ROADMAP description did NOT ship under their session
labels and are documented as deferred:

- **EPUB3 Fixed-Layout export + epubcheck** (was Session 6 prose)
- **KDP page-count validation** (was Session 5 prose)
- **AI-disclosure badge** (was Session 5 prose)

These have proposed backlog IDs in the ROADMAP closure note but
are NOT yet filed (decision deferred to next session).

Other ROADMAP staleness fixed:
- Last updated: 2026-05-07 → 2026-05-22
- Latest release: v0.30.0 → v0.35.1
- Open tasks count recalculated post-PB-PHASE4 closure

### Deferrals (user-adjudicated)

Both stay at P3 with explicit "Deferred 2026-05-22" notes
in-place (per the user's "OR add explicit deferral note"
option):

- **MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01**: Comics-
  Foundation-Trigger-Gate technically met, but no Bibliogon
  mobile app exists and no user has requested mobile sync.
  Re-evaluate on first concrete mobile-access user request.
- **MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01**: current
  single-agent CC + manual Strategic-Advisor layer is
  demonstrably productive (today's 10-closure / 27-commit run
  proves it); multi-agent coordination optimization is
  premature scope until the single-agent cadence breaks down.

### Test growth across the day

- **Backend pytest**: 2207 → 2213 (+6: 3 from PLUGIN-VERSION-
  GATING + 3 from MEDIUM-IMPORT-EXCERPT)
- **Frontend Vitest**: 1987 → 1998 (+11: 7 from useWordWrap,
  2 from ConvertToBookWizard regression-pins, 2 from
  BookMetadataEditor KDP-categories pins; the 5 BookMetadataEditor
  author-field tests were REWRITTEN in-place — no net count
  change from those)
- **Playwright specs**: 60 → 63 (+3 new files; one of those
  added 2 cases to an existing file via the layout-stability
  pin)

---

## Current Backlog State

Counts measured 2026-05-22 end-of-batch via grep over `docs/backlog.md`:

- **P0**: 0
- **P1**: 0
- **P2**: 0 (PB-PHASE4 resolved 2026-05-22; first time P2 is empty since the block was promoted on 2026-05-16)
- **P3**: 25 (including the newly-filed HOOKSPEC-EXPORT-EXECUTE-WIRE-01)
- **P4**: 27
- **P5**: 8
- **BLOCKED**: 2 actual items (STARLETTE-V1-AWAIT-FASTAPI-01 + CLICK-V8-3-AWAIT-GTTS-01) + 7 maintenance/hygiene notes that aren't items

This is the **third consecutive end-of-session at P0=P1=P2=0** —
the active backlog is entirely composed of P3+ work, gated or
not.

### Ungated-pool drain status

Per the drain-session that consumed PLUGIN-VERSION-GATING +
KDP-CATEGORIES + HOOKSPEC + AUTHOR-DATALIST, plus the Adjudication
Batch that added two more closures:

**The ungated P3 pool is DRAINED**. Every remaining P3 item is
gated by:
- Pre-registered RCU (waiting for Nth surface to materialize)
- Architectural adjudication required (the new HOOKSPEC-EXPORT-
  EXECUTE-WIRE-01 is the exception — it's actionable but the
  user may want to defer; also exploration triages requiring
  user direction)
- User-complaint / user-feedback trigger
- Backend-consumer / data-hygiene trigger
- Recurring-pattern threshold (3rd instance / 4th page / etc.)
- Multi-session strategic scope (story-bible plugin, picture-
  book text-config stack)
- Scheduled cadence (next CI hygiene audit: 2026-08-14)

---

## Unfiled Surfaces (flagged, not yet in backlog)

These emerged during today's work but were not filed in their
discovery commit per scope discipline. User decision pending on
whether to file as P3 backlog items or leave as documented
ROADMAP / archive notes.

1. **I18N-ARTICLES-NAMESPACE-CLEANUP-01** (candidate, all
   languages affected) — `ui.articles.author_none` +
   `ui.articles.author_pen_names` are misnamespaced under
   `ui.template_picker.*` in all 8 catalogs. Discovered while
   adding `ui.articles.author_placeholder`. ArticleEditor's
   existing `t("ui.articles.author_none", "(kein Autor)")`
   calls have always fallen back to the hardcoded German
   string because of this. Fix scope: move the misplaced keys
   to the real namespace across 8 files. Smaller than expected
   because the consumer code already passes German fallbacks
   — fix is i18n-data-only, no code change.

2. **PICTURE-BOOK-EPUB3-FIXED-LAYOUT-EXPORT-01** (PB-PHASE4
   Session 6 deferred sub-part) — EPUB3 Fixed-Layout export +
   epubcheck for picture-books. PDF export ships today via
   WeasyPrint; EPUB3 is the next format target. Trigger: user
   requests EPUB OR KDP picture-book EPUB becomes competitively
   necessary.

3. **PICTURE-BOOK-KDP-PAGE-COUNT-VALIDATION-01** (PB-PHASE4
   Session 5 deferred sub-part) — validate page count against
   KDP's 24-300 limit at metadata-save time. Trigger: first
   user attempt to upload that fails the check OR
   PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01 (already in backlog)
   expands to include page-count gating.

4. **PICTURE-BOOK-AI-DISCLOSURE-BADGE-01** (PB-PHASE4 Session 5
   deferred sub-part) — KDP-required AI-disclosure metadata
   for picture-books with AI-generated pages. Per-book toggle
   + KDP-package-export field. Trigger: user requests
   AI-disclosure surface for KDP compliance OR Amazon's policy
   expands enforcement.

---

## Next-Substantial-Session Candidates

With P2 empty, P1 empty, and the ungated P3 pool drained, the
remaining backlog requires user direction.

### Immediately actionable (one user nod, no other gates)

1. **HOOKSPEC-EXPORT-EXECUTE-WIRE-01** (P3, just filed this
   batch) — wire the `export_execute` hookspec; eliminates 6+
   cross-plugin direct imports. Effort: 3-5 commits.
   Cross-plugin coordination required (plugin-export +
   plugin-audiobook + plugin-comics + backend dispatch site).
   The cleanup also removes the documented reverse-coupling
   note in CLAUDE.md.

2. **File 4 unfiled surfaces** (housekeeping) — promote the
   surfaces above to formal P3 backlog entries with concrete
   triggers + scopes. Single docs commit each.

3. **Address parallel-session housekeeping** — the parallel-
   session commits today touched plugin-export, plugin-medium-
   import, and tests under those plugins. Verify Aster's
   `ed4b8ae` work has corresponding backlog closures (the
   Medium-import code-block bug fix may resolve a P3/P4 item
   that's still open).

### Trigger-gated P3 (require external event)

See backlog.md for the full list. The most likely-to-trigger:

- **PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01** — fires on next
  user complaint about per-bubble font variation in
  picture-books or on Comic-Foundation work.
- **PICTURE-BOOK-PDF-FRONT-MATTER-01** — fires when Aster's
  second picture-book needs an imprint page.
- **SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01** — fires when a
  Settings-Polish session is convened OR a user complaint
  about scroll friction.

### Strategic / multi-session

- **STORY-BIBLE-PLUGIN-01** (P3, STRATEGIC) — new plugin for
  fiction-writing entities (Characters, Settings, Plot-Points,
  Items, Lore) with @-mention syntax. Multi-session scope.
- **PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01** + sibling
  **PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01** — D2-D6
  scope, 10-13 commits paired-session.

### Non-Bibliogon paths

If the day's high-velocity Bibliogon work has exhausted the
strategic surface, the user may want to redirect to
adaptive-learner, PluginForge, or another project. The
single-agent + Strategic-Advisor workflow is portable.

---

## Critical constraints + active disciplines

The lessons-learned rules accumulated through 5/2026 are the
load-bearing operational discipline. Highlights still actively
firing as of this batch:

### Multi-Tool-Coordination

- **Plain `git status` before every commit, especially in
  Multi-Tool-Coordination sessions** — parallel-session work
  shows up unexpectedly in your working tree. Read the full
  index state before committing.
- **Explicit-paths-only staging** in Multi-Tool-Coordination
  sessions — never `git add -A`/`git add .`/`git add <dir>/`
  when the working tree contains parallel-session work.
- **Multi-tool collaboration tracking** — re-sync before
  accepting new orders; ROADMAP / backlog state can be stale
  even when committed minutes ago.

### Pre-Coding-Reality-Check

- **Re-audit at the keystroke, not just the audit** — even
  after a thorough Pre-Inspection, a 30-second grep at the
  keystroke can catch architectural conflicts the audit
  missed. Today's batch saw multiple instances where the
  re-audit caught half-wired siblings (Bug #2 in
  CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01 was
  already-half-fixed by an earlier WizardShell migration; the
  inline button had been left behind).

### Half-Wired-Feature-Lifecycle

- **Backend shape**: state-mutation without inverse-mutation
  surface (closed by KDP-CATEGORIES today: backend endpoint
  was live, frontend prop accepted suggestions, but consumer
  passed `[]`).
- **Frontend shape**: state-write without state-consumer
  (closed by Foundation-Override extension applying to
  KDP-CATEGORIES under the Half-Wired-Visible-in-Production
  criterion).
- **Close all known instances of the pattern at once** —
  PLUGIN-COMICS-MAKEFILE-INTEGRATION-01 closed the 2 sibling
  drifts (medium-import + git-sync coverage gaps) in the same
  sweep.

### Recurring-Component-Unification

- **2-surface threshold for UI patterns** (stricter than the
  general 3-duplicate DRY rule). AUTHOR-DATALIST migration
  honored this: AuthorSelectInput shipped earlier at 2 sites
  (CreateBookModal + ConvertToBookWizard); today's batch
  completed the 4-site coverage.
- **Audit-First requirement** before extraction — grep the
  entire codebase for related candidates before specifying
  the component API. Today's batch verified the
  "backpage_author_bio" was NOT in scope (textarea, not
  picker) before designing the migration.

### Audit-Methodology design-intent-axis

- The 4-Axes scoring carries an implicit implementation-
  identity-bias that misses design-intent. Before scoring an
  extraction candidate, grep doc-comments for design-intent
  markers ("Kept as separate", "deliberate.*separate",
  "intentional"). Today's batch confirmed AuthorSelectInput
  had no such marker — the migration was correct.

### Ungated-only drain discipline

- **Per-priority-tier ordering**: smaller scope first;
  unblocking items first; alphabetical-by-ID as tiebreaker.
- **Do NOT implement trigger-gated items without explicit
  gate override** even when context permits.
- Today's drain pool: 2 items qualified for the ungated tier
  on top of the 5 from the earlier drain — drained both
  cleanly + stopped + reported. Validated the discipline.

### Other still-active disciplines

- **Atomic-green-per-commit-delta** — each commit's test
  count grows (or holds) cleanly; no half-green intermediate
  states.
- **Push autonomously after atomic-green commits** — surface
  only on Stop-Conditions or substantial architecture
  decisions.
- **Architecture-doc consultation is part of Pre-Inspection,
  not post-implementation discovery** (Phase 1 KDP wizard
  precedent from earlier session).

Full list of active rules: see `.claude/rules/lessons-learned.md`.

---

## Open architecture decisions

None pending from today's batch. The HOOKSPEC adjudication
resolved cleanly; AUTHOR-DATALIST was pre-adjudicated; the 4
unfiled surfaces are bookkeeping decisions rather than
architectural.

The deferred PB-PHASE4 sub-parts (EPUB3, KDP page-count,
AI-disclosure) become architecture decisions when their
backlog filings happen — each needs concrete trigger + scope +
sub-question adjudication. Currently parked in the ROADMAP
closure note.

---

## Files to read (in order)

For the next session to come up to speed:

1. **`docs/backlog.md`** — current open work, P3+ tier sorted.
2. **`docs/journal/session-handoff-2026-05-25-next-resume.md`**
   — this file.
3. **`docs/ROADMAP.md`** — freshly re-synced; PB-PHASE4 closed.
4. **`.claude/rules/lessons-learned.md`** — extensive; key
   sections per the "Critical constraints" above.
5. **`.claude/rules/coding-standards.md`** — RCU rule + design-
   intent override.
6. **`backend/config/book-types.yaml`** — canonical SSoT for
   per-book-type metadata (closed earlier this week via
   BOOK-TYPES-SSOT-YAML-01).
7. **`docs/roadmap-archive/2026-05.md`** — today's 5 archive
   entries at the top (AUTHOR-DATALIST, HOOKSPEC, KDP-CATEGORIES,
   PLUGIN-VERSION-GATING, PLUGIN-EXPORT-SINGLE-ROUTER).

---

## Recommended next session direction

The ungated P3 pool is drained. Strategic options for the next
session, in approximate decreasing leverage:

1. **HOOKSPEC-EXPORT-EXECUTE-WIRE-01** — the only immediately-
   actionable substantial item in the backlog. Concrete tech-
   debt cleanup with documented before/after surfaces.

2. **File the 4 unfiled surfaces** (housekeeping single-commit
   docs). Then surface the priority-tier landscape for user
   adjudication on which (if any) to pursue.

3. **User-directed strategic shift** — feature work outside
   the existing backlog (new picture-book scope, new plugin,
   new editor feature, etc.).

4. **Non-Bibliogon project shift** — the single-agent + Strategic-
   Advisor workflow is portable to adaptive-learner, PluginForge,
   creative writing, or any other repository.

**User-Direction-Override always overrides the recommendation
hierarchy.** Wait for explicit direction before starting any
non-trivial work.

---

## Gotchas + things to watch for

### Parallel-session activity is REAL on this repo

A parallel-CC session by Aster pushed `ed4b8ae` during my batch
today. The Multi-Tool-Coordination explicit-paths discipline
caught it cleanly (I didn't absorb it into my commits). Watch for:
- Unstaged-but-modified files in plugins/ at session start —
  likely parallel-session work; investigate via `git log --all
  --oneline -5` and `git status` before deciding.
- Local main commits ahead of where you remember pushing —
  another session pushed in between.

### The pluginforge IDE-stub-cache is stale

The VSCode IDE diagnostics report kwargs like `app_version`,
`app_id`, `inspect_plugin` as "not in PluginManager" — they
ARE in the runtime API (verified via `inspect.signature`).
The IDE is reading from `~/.local/lib/python3.12/site-packages`
instead of the Poetry venv. Ignore the diagnostics; trust the
runtime + tests.

### ArticleEditor's `ui.articles.author_*` keys are misplaced

Pre-existing legacy bug: `ui.articles.author_none` +
`ui.articles.author_pen_names` are under `ui.template_picker`
in all 8 catalogs. ArticleEditor's existing `t()` calls
fall back to the hardcoded German string. The new
`ui.articles.author_placeholder` from today's AUTHOR-DATALIST
work was added at the REAL `ui.articles` namespace; the
misplaced legacy keys are out of scope for that closure but
filed as **I18N-ARTICLES-NAMESPACE-CLEANUP-01** candidate
in the unfiled-surfaces list.

### CategoryInput's `<datalist>` is conditional

`CategoryInput.tsx:144` renders the datalist only when
`suggestions.length > 0`. If the KDP-categories fetch fails
silently, the datalist won't render at all. The free-text
input still works (graceful degrade), but the autocomplete
test must seed a non-empty mock or it'll legitimately fail.

### make test-plugins now fires 12 plugins (not 10)

The Makefile aggregate test-plugins target was extended in
this batch to include comics + medium-import. Per-plugin
expected counts:
- export: 265
- grammar: 10
- kdp: 42
- kinderbuch: 8
- ms-tools: 97
- translation: 35
- audiobook: 98
- help: 30
- getstarted: 13
- git-sync: 23
- comics: 15 (NEW in aggregate)
- medium-import: 97 (NEW in aggregate)

Total: ~733 plugin tests across `make test-plugins`. The full
backend pytest at the project level is separate (2213).

### CI red-on-tag-push: pre-commit must run BEFORE pushing

Today's batch opened with a CI-red fix because the previous
end-of-day handover commit had pushed without running
pre-commit. CI's pre-commit gate is the same as local;
running `poetry run pre-commit run --all-files` before push
catches every red-on-CI-only case. The mandatory pre-tag
chain documented in `.claude/rules/release-workflow.md` Step 5
lists this explicitly.
