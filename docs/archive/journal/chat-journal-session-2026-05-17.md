# Chat journal — 2026-05-17

## 1. PB-PHASE4 Session 4c-A close: Fix A purge-on-switch (21:00)

- Goal: close the layout_config cross-layout key accumulation bug
  surfaced by manual smoke (Session 4c-A Bug A + Bug C — single
  root cause).
- Result: `handleChangeLayout` in `PageEditor.tsx` now sends
  `{layout, layout_config: null}` in one atomic API payload.
  Block-comment documents root cause + trade-off + pointer to
  Fix B (namespace per layout). Existing layout-change Vitest
  updated to expect the purge payload; new regression-pin test
  loads a page pre-populated with 4 stale speech_bubble keys,
  expands "More layouts" disclosure, clicks
  `image_full_text_overlay`, asserts the purge payload + the
  `data-config-keys` attribute collapses to empty.
- Verification: Vitest 1405/1405 (122 files, +1 new test).
  `tsc --noEmit` clean.
- Commit: `ad84f64`.
- Backlog: `PICTURE-BOOK-TEXT-CONFIGURATION-01` extended with
  Fix B (namespace `layout_config` per layout) as 4c-B sub-item
  — preserves per-layout config across switch + return.

## 2. Push v0.33.1-candidate (21:30)

- Push approved.
- 8 commits pushed `fd3ea52..d4f9b4c`. Range absorbed a parallel
  `d4f9b4c` commit ("MEDIUM-IMPORT-V2-01 Phase 4 i18n + Playwright
  smoke") that landed between commit-time and push-time and
  cleaned up the previously-uncommitted i18n catalog edits.

## 3. Release decision: v0.34.0 not v0.33.1 (21:35)

- State capture: `git log v0.33.0..HEAD --oneline` showed 100+
  commits, 160 files, +27,014 / -948.
- The "v0.33.1 hotfix" framing from the prior chain was wrong —
  it predated ~90% of the queued commits. The body is dominated
  by `feat:` commits (Picture-Book Phase 4 Sessions 2–6, Bug 9
  Categories+BISAC, Bug 8 Phase 1+2 Authors-Database,
  Medium-import v2 Phases 1–4, Bug 10 trash lifecycle, BD
  list-view checkboxes, Bug 3 view-mode defaults, plus
  Categories+BISAC tab-leak hotfix and Picture-Book Bug A+B+C
  fixes).
- Per SemVer + release-workflow.md Step 2: `feat:` in body =
  minor bump = **v0.34.0**.
- Confirmed by user; proceeded with release workflow.

## 4. CHANGELOG draft (21:45)

- Wrote `changelog/releases/v0.34.0.md` (12,500 chars) that
  absorbs the orphaned v0.33.1 content. The pre-drafted
  `[0.33.1]` CHANGELOG entry was a half-wired-release artifact
  — release-notes draft + per-version file existed but no tag
  was cut, and ~50 commits landed on top before this session.
- Deleted orphaned `changelog/releases/v0.33.1.md`.
- Updated `docs/CHANGELOG.md`: replaced `[0.33.1]` section
  with `[0.34.0]` section that mirrors the per-version notes.
- Commit: `4fce3a9`.

## 5. Version bump + sync-versions (21:50)

- Hand-edited `backend/pyproject.toml` only: `0.33.0` →
  `0.34.0` per the "ONE canonical pyproject + tool-propagation"
  discipline.
- `make sync-versions` propagated to 16 files (frontend
  package.json + launcher pyproject + launcher init + launcher
  spec + 10 plugin pyprojects + install.sh + install.ps1).
- `make sync-versions-check` + `scripts/verify_version_pins.sh
  0.34.0` both green.
- Commit: `7d24e0c`.

## 6. Step 4b — dependency currency check + judgment call (21:55)

- Outdated deps found:
  - Backend routine: click, decorator, numpy, pandas, pip,
    python-multipart, requests, uvicorn (all patch+minor)
  - Backend major (defer): elevenlabs 0.2→2.47, mypy 1.20→2.1,
    weasyprint 66→68 (just landed 66 this release)
  - Launcher routine: packaging, pyinstaller-hooks-contrib
  - Frontend routine: dompurify 3.4.3→3.4.4
  - Frontend major (defer, own track): TipTap 2→3 (~25
    packages, DEP-02), @types/node 24→25, @vitejs/plugin-react
    5→6
- **Judgment call: defer ALL dep updates to a focused
  follow-up v0.34.1 dep-refresh session.** Reasons: (1)
  v0.34.0 is already a ~100-commit release; adding dep bumps
  mid-flight risks starlette-style transitive cascade per the
  2026-05-12 lessons-learned incident; (2) per-plugin lock
  refresh would need `poetry update <allowlist>` across 11
  plugins with verification each; (3) the deferred majors
  (elevenlabs, mypy, weasyprint) already have their own
  tracks.
- The release-workflow.md says "Apply routine bumps as part
  of the release" while lessons-learned warns against blind
  bulk-applying. Conflict resolved by the size-of-release
  argument — this release's feature scope is the value;
  dep-currency is a separate concern.

## 7. Step 5 — full test suite green (22:00)

- `make test`: **1891 backend+plugins pytest** passed (1 skipped),
  **1405 frontend Vitest** passed.
- `tsc --noEmit`: clean.
- `ruff check app/`: all checks passed.
- `mypy app/`: 101 source files, no issues.
- `pre-commit run --all-files`: all 15 hooks passed (trim
  whitespace, eof-fixer, check-yaml/json/large-files/merge,
  ruff + ruff-format, roadmap-archive-reminder,
  docs/help-meta-required, plugin-lock-paired-with-pyproject,
  notify.error-forwarding, theme-token-fallback, lru_cache-
  audit).
- `make verify-docs-discipline`: mkdocs nav in sync + no orphan
  pages.
- Launcher PyInstaller build smoke: ELF binary built
  successfully in `launcher/dist/bibliogon-launcher`.
- Playwright `--project=smoke`: **234 tests passed** (7.8 min;
  auto-spawned backend + frontend via webServer config).

## 8. Step 6 — builds (22:10)

- Backend `poetry build`: SKIPPED (package-mode = false per
  pyproject.toml; explicitly skippable per
  release-workflow.md final checklist).
- Frontend `npm run build`: clean. Vite + PWA precache 37
  entries / 2449 KiB. One warning about a 500 KB chunk
  (chunkSizeWarningLimit advisory only; not a blocker).

## 9. Step 7 — tag + push (22:12)

- `git tag -a v0.34.0 -m "Release v0.34.0"`.
- `git push origin main`: `d4f9b4c..7d24e0c`.
- `git push origin v0.34.0`: pre-push hook re-ran pre-commit
  on all backend files (clean), then the tag pushed.

## 10. Step 8 — GitHub release published (22:15)

- `gh release create v0.34.0 --title "Bibliogon v0.34.0"
  --notes-file changelog/releases/v0.34.0.md`.
- URL: https://github.com/astrapi69/bibliogon/releases/tag/v0.34.0
- Step 9 (Docker push) and Step 10 (MkDocs deploy) are
  automated outside this session (Docker is local-only; MkDocs
  triggers on tag-push automatically).

## 11. Post-release docs (22:20)

- CLAUDE.md version updated 0.33.0 → 0.34.0 with the
  comprehensive ~100-commit summary.
- Journal entry: this file.

## Summary

- v0.34.0 released: 100 commits since v0.33.0, 160 files
  changed, +27k lines.
- Test gate: 1891 backend pytest + 1405 Vitest + 234
  Playwright smoke + tsc + ruff + mypy + pre-commit + docs
  discipline + launcher build — all green.
- Two pending follow-up sessions filed in the todo list:
  Session 6 Commits 2–8 (PDF Export route + UI for picture-
  books) and Session 4c-B (Tier-Property typography + Fix B
  namespace migration). Plus a v0.34.1 dep-refresh focused
  session for the routine bumps deferred from this release.
- Half-wired-release pattern observed first-hand:
  `changelog/releases/v0.33.1.md` + `[0.33.1]` CHANGELOG
  entry were committed in commit `1b8af09` but no tag was
  ever cut, and ~50 more commits landed on top. Cleanest fix
  was rolling all the work into v0.34.0 (because the
  cumulative scope was clearly a minor bump, not a patch).
  Possible lessons-learned addition: "Drafted release notes
  without an immediate tag are a half-wired-release; either
  cut the tag in the same session or defer the notes draft
  until the actual release session."
