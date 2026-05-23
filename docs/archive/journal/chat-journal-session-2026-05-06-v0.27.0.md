# Session Journal — 2026-05-06 (v0.27.0)

Long mixed session that covered: a launcher first-run UX cluster
(landed earlier in the day), the bulk article export feature, an
installer discovery + closure of D-05, a pile of small P3 fixes
landed across prior days, and finally the v0.27.0 release cut.
Below is the order things actually happened, with the tag push
at the end.

## 1. Pre-flight: launcher first-run UX cluster (carried forward from earlier)

Six commits had landed before the session resumed:
`ca13c0c`..`619b7bc`. JSON-backed i18n catalog
(`launcher/bibliogon_launcher/i18n.py` + `locales/{en,de}.json`),
welcome dialog, three-button Docker-missing dialog,
`docs/help/{en,de}/install/docker-desktop.md` with "Is Docker
safe to install?" trust section, scattered Docker references
rerouted to the canonical guide, static
`.github/RELEASE_TEMPLATE.md`, plus `LAUNCHER-I18N-EXTRACT-01`
captured in the backlog for the remaining hardcoded English
strings. Already shipped, archived as part of the v0.27.0
release.

## 2. Bulk article export

User confirmed scope after a Step-0 audit:

- **Series**: add `Article.series` as a flat free-string mirror
  of `Book.series`. Hierarchy deferred (`AR-BULK-SERIES-
  HIERARCHY-01`).
- **Tags**: add tag filter to existing `useArticleFilters`.
- **ArticleList size**: stay in-place but extract action bar +
  selection hook to separate files.
- **Combined export timeout**: 180s (vs 60s per-article).
- **Unreachable images**: fail loud, name the article in the
  error.
- **`install.cmd` for Windows**: surfaced during the discussion;
  recorded as part of D-06 (Phase 2 scripts) so corporate
  Windows with hard-locked Group Policy ExecutionPolicy can
  still run `install.ps1`.

Implementation across seven commits (`1df9df9`..`0d375ba`):

1. Migration `c0a1b2c3d4e5_add_articles_series` — idempotent,
   nullable column. Revision id had to be renamed off
   `a1b2c3d4e5f6` because that already exists for the legacy
   `Book.audiobook_merge` revision.
2. `POST /api/articles/bulk-export` — `_load_articles_in_order`
   preserves the input ID order (SQL IN doesn't), filename
   collisions get numeric suffix, combined Markdown drops H1
   and re-prefixes `## Title`, combined HTML carries
   id-anchored sections, combined PDF gets
   `--top-level-division=chapter`. Pandoc errors include the
   article title for fail-loud per spec.
3. List-endpoint filter triple: `?series=&tag=&topic=`
   AND-composed. Tag uses JSON-string LIKE (SQLite has no
   portable JSON-array op) with quote-wrapping so "python"
   doesn't match "pythonista".
4. `useArticleSelection` hook — Set<string> wrapped in React
   state, `toggle` / `selectAll` / `clear`. Local; not URL-
   synced.
5. `ArticleBulkActionBar` component — pure-presentational,
   sticky CSS-Modules + 50/200 thresholds, 5 vitest cases.
6. `useArticleFilters` extended with `series` + `tag` facets
   plus `availableSeries` + `availableTags` for the dropdowns.
   5 hook tests.
7. ArticleList integration: per-tile checkbox overlay, per-row
   checkbox cell (passed through `ArticleRow` props rather
   than wrapping in `<li>`), Select-all that respects current
   filters, filter-change clears selection. One subtle bug
   landed and got fixed in the same commit: depending on the
   whole `selection` object in `useEffect` deps caused
   infinite re-renders because the object literal is
   reconstructed every render; fix is to depend on the stable
   `selection.clear` callback identity instead. Caught when
   ArticleList.test.tsx hung for 4 minutes during the make
   test sweep.

i18n: 12 new `ui.articles.bulk.*` and `filter_{series,tag}_*`
keys in EN + DE (real umlauts), backfilled to es / fr / el /
pt / tr / ja with English fallback values per
`AUTO_TRANSLATED.md` convention so the parity test stays green.

Backlog deltas: `AR-BULK-SERIES-HIERARCHY-01` (P3),
`AR-BULK-BOOKS-PARITY-01` (P4), `AR-BULK-CROSSPAGE-SELECT-01`
(P4), `AR-BULK-ASYNC-PROGRESS-01` (P5).

## 3. CI red on the bulk-export commit

`gh run list` showed the CI job on `0d375ba` failed at
`Backend ruff + mypy` step "ruff check": F401 on
`_MEDIA_TYPES` imported but never used in
`backend/app/routers/article_bulk_export.py` (the bulk endpoint
defines its own `_COMBINED_MEDIA_TYPES` and never references
the per-article one — copy-edit leftover).

Fix: drop the unused import. Local `poetry run ruff check app/`
also caught it after the fact; the local pre-commit run earlier
in the session must have happened with a stale working tree.
Pushed `ec23c70`. CI green on retry. The session continued in
parallel with a Monitor watching the CI workflows.

Rule reinforcement: the new pre-push hook
(`scripts/git-hooks/pre-push`) is exactly the safety net for
this — but the hook only fires on TAG pushes, not branch
pushes. So branch-push CI failures will still happen; that's by
design (we don't want to slow every push down by a few seconds).
The hook's value is at the tag push.

## 4. v0.27.0 release flow

Mostly went per `release-workflow.md`. Steps + outcomes:

- **Step 1 (audit commits)**: 21 commits since `v0.26.6`.
- **Step 2 (SemVer)**: minor bump → 0.27.0. All `feat:` /
  `chore:` / `docs:` / `fix:`. No breaking changes.
- **Step 3 (CHANGELOG)**: drafted entry in Bibliogon house style
  (bold paragraph headers, "Action required" at top scoped to
  "users who have set BIBLIOGON_DB_PATH manually"). Combined
  the three launcher first-run sub-aspects (welcome dialog,
  bilingual UI, three-button Docker-missing) under one bold
  header per user direction — they're one coherent UX
  improvement from the user's perspective, not three.
- **Step 4 (version bump)**: `backend/pyproject.toml` →
  `0.27.0`; `make sync-versions` propagated to 15 files
  including `install.sh` regenerated from template, launcher
  spec, all plugin pyprojects, frontend package.json. Lock-step
  verify + `verify_version_pins.sh 0.27.0` clean.
- **Step 5 (mandatory pre-tag chain)**: make test (1285 backend
  + 702 frontend + 165 launcher = 2152 tests, all green), tsc,
  npm run test, ruff, mypy, pre-commit, PyInstaller smoke.
  Frontend `npm run build` initially failed with
  `crypto.hash is not a function` because system `/usr/bin/node`
  was Ubuntu's 18.19.1 and Vite 7 needs 20.19+. nvm had
  `~/.nvm/versions/node/v24.15.0/` on disk; `export PATH=`
  override and the build went green in 3.41s. Same for smoke
  Playwright (next step).
- **Step 5 cont. (smoke Playwright)**: 187 of 188 specs first-
  pass. The one failure was `import-flows.spec.ts:137 backup
  history endpoint`; isolated retry: 7/7 pass. Pre-existing
  flake unrelated to this release. New backlog item
  `AR-BULK-PLAYWRIGHT-SMOKE-01` (P4) captures bulk-export-
  specific Playwright coverage for a follow-up.
- **Steps 6-7 (build + tag)**: `git tag v0.27.0 && git push
  origin main --tags`. The new pre-push hook fired correctly
  on the tag push, ran pre-commit on all backend files, all
  green, "Proceeding with tag push" — first real-world
  validation of `CI-PRECOMMIT-HOOK-01`.
- **Step 8 (gh release)**: `gh release create v0.27.0
  --notes-file changelog/releases/v0.27.0.md` →
  https://github.com/astrapi69/bibliogon/releases/tag/v0.27.0.

Two things post-tag-push:

- A separate question about `/usr/bin/node` 18.19.1 being still
  the system default while the project pins Node 24 led to a
  clean upgrade via NodeSource: `curl -fsSL
  https://deb.nodesource.com/setup_24.x | sudo -E bash -` then
  `sudo apt install -y nodejs`. `/usr/bin/node` now reports
  v24.15.0; npm 11.12.1; package version
  `24.15.0-1nodesource1`. Future sessions don't need the nvm
  PATH override.
- Tag push validated the pre-push hook on a real release event,
  not just a smoke-test stdin replay. Hook ran, pre-commit
  passed, push went through.

## 5. Post-release archival

`DEP-DBPATH-01` step 1, `DEP-FE-VERSION-01`, and
`CI-PRECOMMIT-HOOK-01` archived to
`docs/roadmap-archive/2026-05.md` under "Archived 2026-05-06"
and removed from the active backlog. `DEP-DBPATH-01` itself
stays open under the same ID for steps 2 and 3 (precedence flip
+ removal); the open entry now references the archived step 1.
Header counts: backlog 14 → 12 active (3 archived but 1 new
`AR-BULK-PLAYWRIGHT-SMOKE-01` added). `CLAUDE.md` Version block
rewritten for v0.27.0. ROADMAP latest-release line updated.

## Statistics

- Commits this session: 8 on top of the prior ~13 launcher /
  installer-discovery commits already on `main`. v0.27.0
  release commit is `8b6e0b8`. Tag pushed.
- Backend tests: 1278 → 1285 (+7).
- Frontend tests: 688 → 702 (+14).
- Launcher tests: 147 → 165 (+18).
- Smoke Playwright: 188 specs, 187 first-pass + 1 retry-passed
  flake.
- Backlog: 13 active (P3..P5) + 4 BLOCKED-on-upstream after
  v0.27.0 archival.
- Latest release: v0.27.0
  (https://github.com/astrapi69/bibliogon/releases/tag/v0.27.0).
