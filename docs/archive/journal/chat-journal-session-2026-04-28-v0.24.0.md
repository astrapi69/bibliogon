# Session Journal - 2026-04-28 (v0.24.0)

## Context

Continuation session focused on closing the editor-parity Phase 3
backlog item, the article-authoring ROADMAP reconciliation, the
PS-13 close, and a v0.24.0 release cut.

The article-authoring track had advanced through Phases 1-3 and a
handful of FU items across previous sessions but the ROADMAP still
showed the original AR-01..AR-03+ "validation log first" placeholder
text, so the documentation had drifted significantly from the code.

## 1. Editor-Parity Phase 3 finishing

- Original prompt: "continue with Update Todos: Backend ... Frontend ... i18n + smoke catalog ... Push"
- Result: Phase 3 backend was already in (`8686031`); finished the
  frontend Export panel in `ArticleEditor`, wired
  `api.articleExport.download` through fetch + Blob for ApiError
  parity, added 8-language i18n for `ui.articles.export_*`, wrote
  `e2e/smoke/article-export.spec.ts` covering panel render +
  Markdown / HTML download events.
- Verified: backend `test_article_export.py` 11/11, vitest 664/664,
  `tsc --noEmit` clean.
- Commit: `5b471f3`.

## 2. Status report + roadmap analysis

- Original prompt: "make a status report where we stand and what is
  next most important in our roadmap"
- Result: report identified the Article authoring section as the
  largest piece of stale documentation; flagged DEP-02 deadline
  pressure (2026-05-05); noted SEC-01 still upstream-blocked.
- Recommendation: reconcile ROADMAP, then start DEP-02 next.

## 3. ROADMAP article-authoring reconciliation

- Original prompt: long structured plan provided by the user with
  scope, principles, and a closing checklist.
- Result: promoted Article authoring out of the "Validation tracks"
  wrapper to its own top-level `## Article authoring` section in
  ROADMAP. Subsections: shipped (with commit hashes for AR-01,
  AR-02, AR-02 Phase 2.1, Editor-Parity 1-3, UX-FU-02), in progress
  (AR-01 validation log), open / deferred (AR-03+ Platform APIs,
  Phase 4 article-as-WBT git-sync, Phase 4 kinderbuch single-page,
  UX-FU-01 TopicSelect fallback), and a Reference subsection with
  links to exploration / editor-parity audit / UX conventions / help.
- Header refresh: Last updated `2026-04-25 -> 2026-04-28`.
- Verified all 23 cited commit hashes via `git cat-file -e`. Caught
  one path error: `docs/architecture/ux-conventions.md` was wrong;
  the actual file lives at `docs/ux-conventions.md`.
- Commit: `6e95cc6`.

## 4. PS-13 ROADMAP close

- Original prompt: "lets finisch this: 4. PS-13 ..."
- Result: audit found PS-13 already shipped end-to-end across
  `39927ae` (backend fork endpoint) + `de4638d` (frontend wiring +
  i18n). Backend 6 pytest tests + frontend 3 Vitest tests + 5 i18n
  keys × 8 languages all already in. Backlog flagged it closed; only
  the ROADMAP entry under "Polish and stability" was stale (still
  showed `[ ]`).
- Doc-only change: flipped to `[x]` with a concise summary of what
  shipped.
- Commit: `63d82b5`.

## 5. Release decision

- Original prompt: "i think this is a good moment for a new release,
  what is your professional opinion"
- Analysis: 70 commits since v0.23.0 (26 feat, 9 fix, 26 docs, 4
  i18n, 2 refactor, 1 test). 94 files, +14270/-525. Coherent theme:
  article authoring as a first-class feature.
- SemVer call: minor (0.24.0). Multiple `feat:`, new entity, new
  endpoints, new migrations, no breaking changes.
- User confirmed release.

## 6. CI failure investigation

- Original prompt: "ci is red"
- Two failures:
  - **mypy**: `app/routers/article_export.py:32` import-untyped on
    `bibliogon_export.tiptap_to_md`. Pattern matches the existing
    `bibliogon_audiobook.*` override.
  - **ruff format**: 3 files needed reformatting (long-line collapses
    in `ArticleAsset.__repr__`, multi-line logger.error +
    HTTPException detail in `article_export.py`, missing blank line
    in `ArticleAssetOut`).
- Fix: ran `ruff format app/`; added `bibliogon_export.*` to
  `[[tool.mypy.overrides]]` alongside audiobook + manuscripta.
  Updated the comment block to reflect that export is no longer
  dynamic-only.
- Verified: ruff check, ruff format --check, mypy app/ all green.
- Commit: `6e10dfc`. Re-run CI: green.

## 7. v0.24.0 release cut

- CHANGELOG entry + release notes file (`changelog/releases/v0.24.0.md`).
  Theme: Article authoring as first-class feature; included Action
  Required (4 new Alembic migrations: `f9a0b1c2d3e4`, `a0b1c2d3e4f5`,
  `b1c2d3e4f5a6`, `c2d3e4f5a6b7`).
- Version bumps in 9 files: `backend/pyproject.toml`,
  `backend/app/main.py`, `frontend/package.json`,
  `frontend/package-lock.json` (npm install regenerated),
  `install.sh`, `README.md`, `README-de.md`, `CLAUDE.md`,
  `docs/ROADMAP.md`. Plugin pyproject.toml versions stay as-is per
  the plugins-bumped-only-when-the-plugin-changed convention.
- Tests: `make test` 1197 backend + plugin tests passed, 1 skipped,
  42.6 s. Vitest 664/664. tsc clean.
- Local Node 18 cannot run `vite build` (Vite 7 requires Node
  20.19+/22.12+; known issue per lessons-learned.md). CI builds on
  Node 24 - no release blocker.
- `poetry build` skipped: backend is in non-package mode (Poetry
  2.x). Backend ships via Docker / install.sh, not as a wheel.
- Tag `v0.24.0` created + pushed.
- GitHub release published:
  https://github.com/astrapi69/bibliogon/releases/tag/v0.24.0
- Commits in this release cycle (since v0.23.0): 73 (70 pre-release
  + CI fix + CHANGELOG + version bump).

## Statistics

- Commits in v0.24.0 cycle (since v0.23.0): 73.
- Files changed: 94.
- Diff size: +14270 / -525.
- Backend tests: 1197 pass (was 1069 at v0.23.0; +128 net).
- Frontend Vitest: 664 pass (no count comparable to v0.23.0).
- New Alembic migrations: 4 (articles, publications + article SEO,
  topic + article SEO columns, article_assets).
- New endpoints: article CRUD, publication CRUD, translate-article,
  article export (4 formats), article featured image upload, chapter
  fork, git-sync per-book credentials.
- Plugin-git-sync follow-ups: 3 (PGS-02-FU-01 PAT, PGS-03-FU-01
  mark_conflict + rename detection, PGS-04-FU-01 skipped branches).

## Deferred

- DEP-02 TipTap 2 -> 3: blocked on
  `@sereneinserenade/tiptap-search-and-replace` v0.24.0 not on npm
  + vite-plugin-pwa peer deps capping at Vite 7. Hard fallback
  deadline 2026-05-05; `prosemirror-search` adapter
  (~50-80 LOC) ready as fallback. Scheduled GitHub Actions
  workflow polls weekly for unblock.
- SEC-01 vite-plugin-pwa CVE chain: dev-only, production bundle
  clean. Same upstream blocker as DEP-09.
