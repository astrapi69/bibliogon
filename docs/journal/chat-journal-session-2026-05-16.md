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
