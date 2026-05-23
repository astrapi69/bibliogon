# Chat-Journal: Bibliogon Session 2026-04-15

PS-06 manuscripta v0.8.0 upgrade with CF-01 silent-image-drop fix discovery, Phase 1 archive postscript, Phase 2 roadmap setup, full DE+EN user docs sweep, release v0.15.0.

---

## 1. PS-06: manuscripta v0.7.0 to v0.8.0 upgrade

- Audited call sites: 1 library call (`run_pandoc` in plugin-export), 9 TTS adapter calls (audiobook plugin + backend, all unchanged in v0.8.0), 0 CLI calls.
- Fetched v0.8.0 source from GitHub to verify: `OUTPUT_FILE` module global still present but `run_export()` exposes proper `output_file=` / `no_type_suffix=` kwargs; TTS adapter API confirmed unchanged.
- 7 commits in fix-then-migrate sequence: HTML figure converter fix (commit 82be282) shipped first to address a real silent-image-drop bug discovered during diagnosis, then manuscripta pin bump, run_pandoc migration to `run_export(source_dir=...)`, exception narrowing to `MissingImagesError`/`PandocError.cause`, missing-image i18n in DE+EN, lessons-learned with Pandoc raw-HTML pass-through gotcha.

## 2. CF-01: silent image drop diagnosis

- During PS-06 work, reproduced an active bug: PDFs from imported books had 0 embedded images while EPUBs contained them.
- Root cause: `html_to_markdown` preserved `<figure>/<img>` as raw HTML; Pandoc's LaTeX (PDF) and DOCX writers silently drop raw HTML. Bug present since v0.1.0, unnoticed across 14 releases because TipTap-native books were unaffected and EPUB worked.
- Fix: emit native Pandoc image syntax (`![caption](src "alt")`) so figures survive every output format. Verified end-to-end with the real "Malleable Eternity" book: PDF jumped from 241KB / 0 images to 8.3MB / 16 images.
- Critical insight: manuscripta v0.8.0 strict-images mode does NOT catch this class of bug, because raw HTML is dropped at the writer stage before resolution is attempted. The bibliogon-side fix to emit native Markdown was the real corrective change.

## 3. Phase 4 verification

- All three cases passed: intact book exports with images embedded, deliberately-removed image raises `MissingImagesError` with `.unresolved=['fig.png']`, no-image book exports cleanly without spurious strict-mode error.

## 4. Phase 1 archive postscript and Phase 2 setup

- Archive postscript records the silent-image-drop trajectory honestly: feature-complete on paper at v0.13.0, archived at v0.14.0, then a real shipped bug surfaced and was fixed during early Phase 2 polish. The archive is not a sanitized record.
- ROADMAP.md updated: new "Critical Fixes (Phase 2)" section with CF-01, PS-06 reclassified as `[x]` with a bracket note pointing at CF-01, themes reordered (Distribution > Templates > Polish ongoing > Git backup low), AI moved to "Completed in early Phase 2" subsection at the bottom.
- CONCEPT.md sub-phase table removed (was stale at v0.10.0); replaced with a single line pointing at CHANGELOG.md and ROADMAP.md.
- CHANGELOG.md gained a v0.15.0 (unreleased) entry.

## 5. User docs sweep

- 7 commits, DE+EN paired throughout. Removed obsolete Settings > Licenses reference from EN troubleshooting; added v0.15.0 image-bug bullet to both languages.
- New documentation: trash workflow with real 90-day default and 7/14/30/60/90/180/365-or-disabled range (read from `app.yaml.example` and `i18n/*.yaml`, not approximated); Marketing tab HTML preview toggle on the three `HtmlFieldWithPreview` fields; clarified `license_tier = "core"` comment so it does not imply removed tiers.
- Navigation gap fixed: AI Assistant and Plugin Development pages added to `_meta.yaml` (had been merged for several releases without appearing in side nav).
- EN parity sweep: getting-started, glossary, editor/formatting, export/epub, export/pdf brought to DE depth as idiomatic English (not literal translation).
- `docs/help/SCREENSHOTS-TODO.md` created as persistent backlog tracker for screenshot updates not blocking the release.

## 6. Release v0.15.0

- 31 commits since v0.14.0, 79 files, +2762/-383 lines.
- Version bumped in `backend/pyproject.toml`, `frontend/package.json`, `backend/app/main.py` (FastAPI app version + `/api/health`).
- `make test` green: backend 467, plugin-export 92, plugin-audiobook 88, plugin-ms-tools 35, frontend 323.
- Frontend `npm run build` clean (PWA precache 35 entries, 1789 KiB).
- Backend `poetry build` not applicable (`package-mode = false` by design; backend ships as Docker image / source).
- Tag v0.15.0 pushed; GitHub release published at https://github.com/astrapi69/bibliogon/releases/tag/v0.15.0.
- CI on the bump commit: 9/10 jobs green; Backend Tests job failed in CI with the same plugin-route 404 pattern that has been failing on every push since at least v0.13.0 (kinderbuch + KDP routes not mounted in the CI container). This is pre-existing CI-environment debt, not a v0.15.0 regression. Logged as a follow-up item to investigate but did not block the release because the local `make test` gate (per release-workflow.md step 5) was green.
- Deploy Docs workflow did not trigger on the bump commit (path-filtered to docs/help/ probably). The MkDocs site already deployed the lessons-learned + concept changes earlier in the session and contains all user-facing v0.15.0 content. The CHANGELOG date update lives in the GitHub release page; no immediate gap.

## 7. Lessons-learned additions

- Pandoc raw-HTML pass-through is format-specific (PDF/DOCX silently drop raw HTML; emit native Markdown for content that must survive all output formats).
- manuscripta v0.8.0 migration notes (source_dir + run_export + strict_images, exception attribute access, backend poetry.lock refresh trap for path-installed plugins).
- Commit ordering for breaking-change dependency upgrades (pin first, migrate second, when the new code uses imports that only exist in the new version).
- Atomic commits are bounded by "green individually", not "one thing".
- Doc files: existence is not user discoverability (must be in `_meta.yaml`).
- Doc values: read from code, not from memory (single source of truth).

## Statistics

- 31 commits between v0.14.0 and v0.15.0
- Files changed: 79
- Lines: +2762, -383
- Tests: 467 backend + 92+88+35 plugin + 323 frontend (post-release baseline)
- Lessons-learned entries added: 6
- Release tag: v0.15.0 (https://github.com/astrapi69/bibliogon/releases/tag/v0.15.0)

## Open follow-ups

- CI Backend Tests job has been red since before v0.13.0 release (kinderbuch + KDP route 404s in the CI container while local make test is green). Worth investigating before the next release; not blocking v0.15.0 because the per-workflow gate is local make test.
- `docs/help/SCREENSHOTS-TODO.md` has 5 unticked items for the v0.14.0/v0.13.0 UI deltas. Update inline with feature work or as a dedicated pre-release pass; delete the file when all are checked.
- Other 6 i18n locales (es/fr/el/pt/tr/ja) fall back to EN for the new `missing_images` strings until next i18n sweep.
