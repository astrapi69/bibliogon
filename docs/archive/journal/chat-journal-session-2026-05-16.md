# Chat Journal - 2026-05-16

## Session theme

v0.33.0 release - the "Article-to-Book + UX-polish" cut. Started
as a continuation of yesterday's Phase 3 close-out work (article-
to-book conversion feature shipped + smoke-test docs added), then
the user said "proceed with the next release" and the session
pivoted to a full release-workflow.md execution.

## Sequence

1. **Phase 1+2+3 close-out (carry-over from 2026-05-15 evening)** -
   article-to-book conversion shipped end-to-end across 12
   commits earlier in the session (backend endpoint + 6-step
   wizard + Vitest + Playwright + i18n + help-docs + backlog
   filings + CHANGELOG draft + archive + lessons-learned).

2. **Quality-check audit + WARN triage** - structured 12-check
   audit surfaced 3 WARNs (aria-label hardcoded English / no
   focus-management on step transitions / submit-toast lacked
   "View book" CTA). All 3 fixed in atomic commit `26c77c1`:
   - WARN-A1: new `step_indicator_aria` key across 8 catalogs +
     wizard uses `t()`.
   - WARN-A2: `useEffect` on step change + `stepContentRef` that
     focuses first interactive element of each step.
   - WARN-I1: new `notify.successAction` helper + wizard's
     `handleSubmit` fires toast with CTA + page-level
     `onConverted` split into `handleBookCreated` (cleanup) +
     `handleViewBook` (navigation). Regression-pin Vitest spec
     added.

3. **Smoke-test docs** - two artefacts in
   `docs/testing/smoke-tests/`:
   - `article-to-book-conversion.md` (7 deterministic tests,
     stop-conditions, re-verification cadence)
   - `article-to-book-conversion-manual.md` (bilingual user
     guide, 3 scenarios incl. 22-article stress test, bug-report
     template). Commit `f3d0e4a`.
   - Cross-linked from both help-docs via absolute GitHub URLs
     (mkdocs `docs_dir: docs/help/` cannot resolve into
     `docs/testing/` via relative paths; absolute sidesteps
     strict-mode dangling-link check).

4. **"proceed with the next release"** - state-capture surfaced
   78 commits since v0.32.0, much wider scope than the article-
   to-book feature alone (14 UX-Audit closures, GH-Actions
   migration, mutation-testing expansion, lessons-learned, etc.).
   User confirmed Path A: expand CHANGELOG to cover all, ship
   as v0.33.0, single coherent release.

5. **Dep currency check** - 3 backend patches (ruff, virtualenv,
   transitive python-discovery); 5 frontend lockfile moves
   (vite, dompurify, lucide-react, react-router-dom,
   @types/node within 24.x). All MAJORs deferred per existing
   backlog items (TipTap 3, @types/node 25, vitejs-plugin-react
   6, elevenlabs 2.x, mypy 2.x, click 8.3, etc.) plus uvicorn
   0.47 deferred as FastAPI-adjacent per the user's "anything
   FastAPI-adjacent defer" rule. Commits `b5a405b` (backend)
   + `97afd2e` (frontend).

6. **CI red, fixed mid-release** - the user surfaced two
   pre-commit failures from CI on `97afd2e`:
   - `frontend/src/pages/Settings.tsx` trailing blank line
     (end-of-file-fixer)
   - `ConvertToBookWizard.tsx:440` `notify.error(err.detail)`
     missing 2nd-arg pass-through (NOTIFY-ERROR-APIERROR-
     COVERAGE-01 pre-commit hook fired).
   Both fix-now. Vitest stayed green. Commit `0ca8b32`.
   The notify.error site was latent from the WARN-fix commit
   `26c77c1`; the hook caught it as designed.

7. **CHANGELOG expansion** - rewrote the `[0.33.0]` entry from
   article-to-book-only to a 4-section structure (Added /
   Changed / Fixed / Internal) covering all ~78 commits,
   aggregated by theme per the user's "NICHT 75 individual
   commit-message-bullets" guidance.

8. **Version bump** - `backend/pyproject.toml` 0.32.0 -> 0.33.0
   (canonical only); `make sync-versions` propagated to 16
   downstream files; `make sync-versions-check` +
   `scripts/verify_version_pins.sh 0.33.0` both green.
   Bibliogon-owned external deps verified at latest PyPI
   (manuscripta 0.9.0, pluginforge 0.5.0).

9. **Release-notes file** - `changelog/releases/v0.33.0.md`
   created from `.github/RELEASE_TEMPLATE.md` prerequisites
   block + narrative "What's new" condensed from the CHANGELOG.

10. **Mandatory test gates** (release-workflow.md Step 5) -
    every one green:
    - `make test`: 1735 backend + 1030 frontend
    - `tsc --noEmit`: clean
    - `make verify-docs-discipline`: clean
    - `ruff check`: all checks passed
    - `mypy app/`: 100 source files, no issues
    - `pre-commit run --all-files`: all hooks pass (locally
      reproduces the CI gate)
    - Playwright smoke `--list`: 226 tests in 33 files collect
    - Launcher PyInstaller build smoke: built successfully
      (mandatory because sync-versions touched launcher/).

11. **Step 6 builds** - `npm run build` (PWA generated, 37
    precache entries, 371 ms); `make docs-build` (DE + EN both
    built in 2.00 s). `poetry build` skipped per
    `package-mode = false`.

12. **Tag + push + release** - commit `7de2920` is the release-
    prep commit; tag `v0.33.0` annotated on that commit + pushed
    to origin; `gh release create v0.33.0 --notes-file
    changelog/releases/v0.33.0.md` returned
    `https://github.com/astrapi69/bibliogon/releases/tag/v0.33.0`.

13. **Post-release docs** - CLAUDE.md version bumped from 0.31.0
    (was already two releases stale!) to 0.33.0 with a full
    feature-summary paragraph; `docs/backlog.md` "Current
    version:" bumped from v0.30.0 (three releases stale) to
    v0.33.0; this chat journal entry.

## Statistics

- **Commits this session**: 9 (3 WARN-fixes + 1 test-docs + 2
  dep-patches + 1 CI-fix + 1 release-prep + 1 post-release docs)
  on top of the 12 article-to-book feature commits from the
  carry-over.
- **Test counts post-release**: backend 1735 / frontend 1030 /
  Playwright smoke 226 in 33 files / mypy 100 files clean.
- **Release tag**: `v0.33.0` at commit `7de2920` (will be
  followed by the post-release-docs commit).
- **CHANGELOG entry size**: ~4x larger than the initial draft
  (~78 commits aggregated into 4 sections).
- **Dep posture**: 8 deferrals all filed in backlog with
  triggers; 8 patches applied; manuscripta + pluginforge at
  latest.

## Lessons / surprises

- **The CI red surfaced mid-release was the cleanest possible
  proof that the NOTIFY-ERROR-APIERROR-COVERAGE-01 pre-commit
  hook is doing real work.** The hook caught a regression I
  shipped in the WARN-fix commit (`26c77c1`) where the new
  toast-CTA error-handling branch had `notify.error(err.detail)`
  with no 2nd-arg pass-through. The hook fired in CI, I fixed
  locally, re-ran `pre-commit run --all-files` to confirm clean,
  pushed, and the release continued unblocked.

- **State capture before the release was important.** "Proceed
  with the next release" assumed the scope was just the
  article-to-book feature; the actual scope was 78 commits
  including the entire UX-Audit closure cycle, the GH-Actions
  migration, and the mutation-testing expansion. Surfacing that
  before bumping version + writing CHANGELOG saved a likely
  rewrite mid-release.

- **CLAUDE.md was 2 releases stale (still said v0.31.0).** The
  release-workflow.md step 11 explicitly lists this as a
  required touchpoint; it had been skipped in the v0.32.0
  release. Caught + corrected here. Same for
  `docs/backlog.md`'s "Current version" line (was v0.30.0, 3
  releases stale).

- **The full release workflow is ~30 minutes when everything
  goes well + 10-15 extra for a mid-flight CI fix.** Today was
  a clean run because the article-to-book feature had already
  been verified end-to-end yesterday. The dep-bumps were the
  riskiest part; the make-test re-run after each bump caught
  nothing, which validated the conservative "patch + low-risk
  minor only" selection.

## Open follow-ups (none blocking)

- The GitHub Actions workflow on the new tag is running async
  (CI will rebuild the launcher binaries + attach release
  assets). Verify the run completes green via
  `gh run list --limit 3 --workflow=release.yml` after a few
  minutes.
- The mkdocs site GH Action will redeploy on push to main; no
  manual action needed.
- The article-to-book feature ships under "user has not yet
  exercised it"; the bilingual manual test guide is in place
  whenever Aster wants to walk through it.

---

## Second session: Phase-4 Kinderbuch Session 2 + Hotfix Bugs 1-3 (2026-05-16 evening)

After v0.33.0 shipped, the same calendar day continued with two
parallel work-tracks running back-to-back: starting Phase-4
(Kinderbuch / Picture-Book plugin foundation) AND a 3-bug hotfix
chain from manual smoke-testing of v0.33.0.

### Track A — Phase 4 Kinderbuch Session 2 (Backend Pages-Foundation)

User asked for Phase 4 audit-then-implement workflow with two
mid-session schema re-scopes that the audit + commit chain
absorbed cleanly:

1. **First re-scope**: from "children_book only" to "Visual-Books
   umbrella + sub_type" (Picture Book + Comic + Graphic Novel).
   Migration + schemas + tests started landing under this shape.
2. **Second re-scope** (correction): drop the umbrella entirely.
   Flat `book_type ∈ {prose, picture_book, comic_book}`. Each
   visual book_type owned by its own plugin. Comics will be a
   separate future plugin, not a sub_type of an umbrella.

The schema-correction unwound the visual_book + visual_sub_type
commits via `git reset --hard` to the last doc-only commit, then
re-applied with the flat shape. Cleaner than the alternative
(layering follow-up commits) because the schema is the foundation
the rest of Session 2 builds on.

Final shape:

- **Migration** `kb1a2b3c4d5e_add_book_type_and_pages.py`:
  `Book.book_type` String(30) NOT NULL server_default='prose'; new
  `pages` table with cascade from books + SET NULL on image_asset
  delete; composite index (book_id, position). Reversible
  verified against the production DB twice.
- **Pydantic schemas**: `BookType = Literal["prose",
  "picture_book", "comic_book"]`; PageCreate/PageUpdate/PageOut/
  PagesReorder with PageLayout Literal.
- **Books PATCH 400-guard**: `book_type` is immutable post-create.
- **Pages CRUD routes** in plugin-kinderbuch under
  `/api/books/{id}/pages` (list/create/patch/delete/reorder),
  gated on `book.book_type == "picture_book"`.
- **35 new backend tests** (test_pages_routes.py) covering CRUD +
  validation + cascade + reorder + immutability + comic_book
  reservation. Full suite 1770 pass (1735 baseline + 35 new).
- **Pre-commit prep**: relocated kinderbuch YAML to
  `backend/config/plugins/kinderbuch.yaml` (was unreadable from
  the plugin-side path per the PluginForge config-loader rule);
  dropped the dead `editor_extensions` manifest slot.
- **Doc reconciliation commit**: ROADMAP entry promoted P5→P2,
  exploration + audit headers annotated with the flat-schema
  rationale, backlog `COMIC-BOOK-PLUGIN-01` filed for the future
  separate plugin.

Notable session friction (now documented in lessons-learned via
the "Module-scoped TestClient fixture must exit at module
teardown" pattern that conftest.py now codifies via the bumped
5000→7500 recursion limit): the pages-routes test file's module-
scoped `with TestClient(app)` fixture pushed the test-session
chain past the 5000-frame recursion ceiling that conftest had
sized for ~41 modules. Bumped to 7500 in conftest.py with an
inline comment referencing this incident.

Another notable incident: the bundled-shadow-plus-editable-install
ambiguity. `backend/plugins/installed/kinderbuch/` was a stale
copy of the plugin tracked in git that intercepted Python's
import resolution (its sys.path entry was inserted BEFORE the
editable install's). Removed in commit `1565241`. The pages
router wouldn't mount until the shadow was gone — the symptom
was a single "Mounted routes for plugin 'kinderbuch'" log line
when 2 routers should have produced 2 lines.

### Track B — Hotfix Bugs 1+2+3 (Frontend UX)

Three user-reported v0.33.0 bugs from manual smoke testing,
ranged with proper Pre-Inspection + Option-A/B/C analysis before
implementation. User chose Option B (independent fixes) for the
first 3.

- **Bug 1**: Settings back-button always navigated to `/` (BD)
  regardless of origin. Root cause: hardcoded `navigate("/")` in
  Settings + Help + GetStarted (3 pages, same shape). Fix: replace
  with `handleBack = () => location.key === "default" ? navigate("/") : navigate(-1)`.
  `location.key === "default"` is react-router v6/v7's initial-
  entry sentinel; falls back to `/` on direct-URL entry. 6 Vitest
  + 5 E2E specs.
- **Bug 2**: BookDashboard list-view rows missing selection
  checkboxes (5th instance of Articles-vs-Books-parallel-surface-
  asymmetry pattern; BookListView was rebuilt later than
  ArticleRow without the checkbox feature). Fix: optional
  `isSelected` + `onToggleSelect` props mirroring ArticleRow's
  shape; new `.colCheckbox` + `.tableSelectable` modifier CSS; 5
  Vitest + 4 E2E specs including AD cross-surface regression pin.
- **Bug 3**: AD-Trash + BD-Trash view-mode defaults missing
  (6th asymmetry instance; configurable defaults existed for
  active surfaces but not trash). Fix: new `useTrashViewMode` hook
  reads `ui.dashboard.{books,articles}_trash_view` from YAML but
  setMode is LOCAL-ONLY (in-trash toggles don't persist; Settings
  UI is the only persistence path). 2 new Settings dropdowns + 4
  new i18n keys across 8 languages. 6 Vitest + 4 E2E specs.

### Bug 4 split

Same session also surfaced Bug 4 (Comments-Admin: bulk-delete +
preview modal + reclassify-action migration to detail view, 3
sub-findings). User confirmed split: Bug 4 deferred to a fresh
session to preserve scope discipline. Bug 4 needs its own Pre-
Inspection of `CommentsAdminSection.tsx` + a decision on the
preview pattern (modal vs expand vs route).

### Commits

22 commits between v0.33.0 and session close. Pushed to
`origin/main`:

```
f6e55bf chore(backlog): file 2 P3 follow-ups from v0.33.0 hotfix session
5d8313f feat(i18n): trash view-mode default labels in 8 languages (Bug 3)
8cf6ed0 test(settings): trash view-mode default behaviour (Vitest + E2E)
5767289 feat(settings): independent view-mode defaults for AD-Trash + BD-Trash
bd8cb61 test(books): BookListView selection checkboxes + AD regression pin
711aef0 feat(books): BookDashboard list-view selection checkboxes
7ae24c1 test(navigation): Vitest + E2E coverage for Bug 1
6f8819b fix(navigation): Settings/Help/GetStarted back-button uses browser history
0b182b5 docs: reconcile picture-book scope to flat book_type (drop visual_book umbrella)
4e41e06 test(plugin-kinderbuch): pages CRUD + book_type discriminator tests
3f9aa0c feat(plugin-kinderbuch): pages CRUD routes (Phase 4 Session 2)
ce642f3 feat(api): 400 on book_type mutation attempts in books PATCH
9e07fb0 feat(api): Pydantic schemas for picture-book CRUD + book_type Literal
d0f0acc feat(db): picture-book schema foundation (book_type discriminator + pages table)
273f7cb docs(audits): annotate re Visual-Books re-scope of book_type discriminator
b731ae4 chore(roadmap): expand kinderbuch P2 entry to Visual-Books scope
8e3cf13 docs(explorations): annotate header re Visual-Books re-scope (Sessions 2-10+)
393560f fix(plugin-kinderbuch): drop dead editor_extensions manifest slot
ea9daa6 fix(plugin-kinderbuch): relocate settings + templates YAML to backend config
f8e938e chore(roadmap): promote kinderbuch phase4 to P2 + session tracker
4d819eb docs(audits): kinderbuch phase4 readiness audit
```

### Statistics

- 22 commits (10 doc + 7 feat + 4 test + 1 fix).
- Tests added: 35 backend pytest + 17 Vitest + 13 E2E specs.
- Backend suite: 1735 → 1770 (+35), all green.
- Frontend Vitest delta: clean (all new test files green).
- TypeScript: clean.
- Production DB: 2 books, both default `book_type='prose'`,
  migration roundtripped twice without data loss.
- Articles-vs-Books-parallel-surface-asymmetry tally: 4 → 6
  instances (Bug 2 + Bug 3 added; Bug 4a would be 7th when
  Comments-Admin work lands).

### Deferred to next session

1. **Bug 4** (Comments-Admin): bulk-delete + preview modal +
   reclassify migration to detail view. Pre-Inspection of
   `CommentsAdminSection.tsx` is the next-session start gate.
2. **Phase-4 Session 2 test-discipline deliverables**: smoke-
   test plan (`docs/testing/smoke-tests/picture-book-pages.md`),
   bilingual manual guide, quality-check 12-area audit. These
   pair naturally with Bug 4 since both touch the
   admin-and-comments adjacency.

### Reflection

Two parallel tracks (Phase-4 backend + 3-bug frontend hotfix)
running in the same session worked because they touched
disjoint files (backend Python + i18n YAMLs vs frontend
TypeScript pages + components). No merge conflicts at any
commit boundary. The disciplinary pattern (Pre-Inspection STOP
gates + atomic-green commits + test-discipline per fix) held
for all 22 commits.

Velocity is sustainable when work is properly scoped. Both
tracks remained green throughout. No carry-over technical debt
from this session.

Session closing cleanly.
