# Session Journal - 2026-04-24 (v0.22.0)

Release day: v0.22.0 published. Core import orchestrator cascade
(CIO-01..CIO-08) closes, plugin-git-sync Phase 1 (PGS-01) ships as
first plugin-to-plugin dep pattern, three user-reported post-import
visibility gaps fixed just before release.

## 1. CIO-08 Block 3 author picker datalist (14:15)

- Goal: wire `useAuthorChoices` hook (Settings author.name +
  pen_names) into the import wizard Step 3 author input with a
  `<datalist>`.
- Result: hook + datalist shipped with 7 hook unit tests + 2
  PreviewPanel cases. Audit confirmed BookMetadataEditor had no
  author field at this point, so scope limited to wizard.
- Commit: `67e05f8`

## 2. CIO-08 Block 1 frontend multi-cover selector (14:20)

- Goal: render cover grid when >1 cover detected, radio selection
  flows through primary_cover meta-override.
- Result: `CoverGridSection` with auto-fill grid, default follows
  detected.cover_image hint else first cover, basics thumbnail
  follows selection. 6 new tests.
- Commit: `5df3106`

## 3. CIO-08 Block 2 frontend author-assets section (14:26)

- Goal: dedicated PreviewPanel section for `purpose="author-asset"`
  assets so they're discoverable before confirming import.
- Result: `AuthorAssetsSection` thumbnail grid with count + hint.
  `AssetGroups` content-overview picks up `author-asset` in the
  ordered purpose list. 3 new tests.
- Commit: `dc37963`

## 4. CIO-08 i18n Blocks 1+2 in 8 languages (14:29)

- Goal: surface the new wizard strings (`section_covers`,
  `covers_hint`, `section_author_assets`, `author_assets_hint`,
  `purpose_author-asset`) in all 8 languages.
- Result: 40 keys (5 × 8), YAML validated.
- Commit: `9ca89ca`

## 5. CIO-07 Session 2 wizard UI for .git/ adoption (14:36)

- Goal: frontend companion to the Session 1 backend. 3-way radio
  selector + repo metadata summary + security warnings.
- Result: `GitAdoptionSection` + state threading through
  PreviewStep + ExecutingStep + modal. `executeImport` signature
  extended with optional `gitAdoption` arg. 16 new i18n keys × 8
  languages. 7 new PreviewPanel tests + 1 ExecutingStep test.
  Existing 4-arg `executeImport` expectations updated to 5-arg.
- Commit: `eba6585`

## 6. ROADMAP + CIO-08 entry (14:42)

- Goal: flip CIO-07 to `[x]`, add CIO-08 entry documenting the
  three-block cascade.
- Result: ROADMAP reflects true state post-session.
- Commit: `6e9ff0f`
- Pushed: `2080d1a..6e9ff0f`

## 7. Post-import visibility fixes (14:59)

Three user-reported bugs after manual import of
`das-erwachen-der-waechter.zip`:

1. **Cover invisible on Dashboard + Metadata editor.** Root cause:
   metadata.yaml named `assets/covers/das_erwachen_der_waechter.jpg`
   but actual file was `assets/covers/cover.png`. Wizard was
   emitting the stale hint as a `cover_image` override that
   overwrote the valid `uploads/<id>/cover/<file>` path the handler
   had just written. Fix: PreviewPanel force-sets `cover_image`
   include=false (never emitted). Multi-cover flow uses
   `primary_cover` meta-override unchanged.
2. **Author metadata not editable post-import.** Root cause: no
   author/language field in BookMetadataEditor. Fix: both added to
   General tab; author uses `useAuthorChoices` datalist.
3. **Author-assets invisible.** Root cause: no UI in metadata
   editor for `asset_type="author-asset"` rows. Fix:
   `AuthorAssetsPanel` in Design tab with thumbnail grid + delete.
4. **CSS not imported.** Root cause: ZIP's only CSS file
   (`config/styles.css`) is 0 bytes. `_read_custom_css` correctly
   skips empty candidates. NOT a Bibliogon bug.

- Result: 5 files +357/-4. Backend regression pin:
  `test_stale_cover_image_override_does_not_clobber_upload_path`.
  Frontend 513 green.
- Commit: `f4ecd6f`
- Pushed: `6e9ff0f..f4ecd6f`

## 8. Release v0.22.0 prep — CHANGELOG + version bump (15:35)

- CHANGELOG entry written covering 92 commits since v0.21.0.
- Version bumped in backend/pyproject.toml, frontend/package.json,
  install.sh, CLAUDE.md, FastAPI app.version.
- `tmp/` added to .gitignore (prevent large test ZIPs from entering
  history again; `tmp/das-erwachen-der-waechter.zip` had leaked into
  the bump commit, rewrote history via soft reset before pushing).
- Commits: `8392264` (CHANGELOG), `878f0ce` (bump).

## 9. Dependency currency (15:50)

- Backend routine patches: certifi 2026.2.25 → 2026.4.22, idna
  3.12 → 3.13, ipython 9.10.1 → 9.13.0, pathspec 1.0.4 → 1.1.0.
- Deferred: elevenlabs 0.2 → 2.x (DEP-05), TipTap 2 → 3 (DEP-02),
  Vite 7 → 8 (DEP-09), 0.x minor bumps on fastapi/uvicorn/ruamel.
- Commit: `e4941fd`.

## 10. Test infra unblock (16:05)

- Full suite was failing: 1 order-dependent `_MockRepo.init`
  failure + 23 RecursionError cascade errors. Neither are real
  regressions but both block the release gate.
- Fix 1: `test_import_git_endpoint` monkeypatched
  `sys.modules["git"].Repo` via raw assignment, pytest cannot
  revert. Downstream tests that called `Repo.init()` hit
  AttributeError. Route through `monkeypatch.setattr`.
- Fix 2: 41 modules each open a TestClient; each lifespan consumes
  ~25 Starlette frames. Default recursion limit 1000 ≈ 40
  lifespans cap. Bumped to 5000 in conftest.py.
- Result: 987 passed + 1 skipped (was 964 + 23 errors).
- Also: markdown_folder handler plumbed `description` field into
  DetectedProject (ruff F841 cleanup), project_import.py logger
  placement (E402), ruff format pass.
- Commit: `c40cbb2`.

## 11. CI mypy + pre-commit unblock (16:20)

- mypy reported 37 errors in app/main.py cascading from
  `import app.import_plugins.handlers` shadowing the
  `app = FastAPI(...)` variable. Replaced with aliased imports.
- 8 other scattered mypy errors cleaned (type annotation on
  `base` dict, `working_tree_dir` None narrow, explicit `str()`
  casts on Any returns, `ConfigParser | None` pre-declare,
  `delete_remote(Remote)` not str, `# type: ignore[import-untyped]`
  on lazy `bibliogon_export.tiptap_to_md`).
- Pre-commit end-of-file-fixer nudged CHANGELOG-v0.22.0.md
  trailing newline.
- Result: mypy 0 errors, pre-commit all passed, 987 tests still
  green.
- Commit: `06265cd`.

## 12. Deterministic cover fallback (16:27)

- CI Backend Tests failed on
  `test_alphabetical_fallback_when_no_metadata_key`:
  `_maybe_set_cover_from_assets` queried first cover-typed asset
  without ORDER BY, so SQLite insertion-order-dependent. Local
  picked `a-ebook.png`, CI picked `c-hardcover.png`. Added
  `.order_by(Asset.filename)`.
- Commit: `2acaf52`. CI turned green.

## 13. Tag + GitHub release (16:30)

- Tag v0.22.0 pushed + deleted/re-pushed after CI fixes.
- Release URL: https://github.com/astrapi69/bibliogon/releases/tag/v0.22.0
- Notes-file: CHANGELOG-v0.22.0.md.

## Summary

- 12 commits during session.
- 92 commits total in v0.22.0 (v0.21.0..v0.22.0).
- Backend: 987 passed + 1 skipped (was 707 at v0.21.0, +280 net).
- Frontend Vitest: 513 passed (was 475 at v0.21.0, +38 net).
- mypy: 0 errors (was 37).
- pre-commit: clean.
- Version: 0.21.0 → 0.22.0.
- Release URL:
  https://github.com/astrapi69/bibliogon/releases/tag/v0.22.0

## Next up

- PGS-02 plugin-git-sync Phase 2 (export to repo).
- DE translation of `docs/help/en/import/git-adoption.md`.
- Triage order-dependent
  `test_detect_surfaces_git_repo_when_zip_has_dot_git`.
- Monthly dep re-audit for SEC-01 / DEP-02 / DEP-09 upstream
  blockers.
