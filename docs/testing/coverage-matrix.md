# Test Coverage Matrix

Per-feature coverage state across the test pyramid. Updated each
test session.

Last updated: 2026-04-28 (Session 1, post-v0.24.0 release).

---

## Aggregate counts

| Suite | Count | Source |
|-------|-------|--------|
| Backend pytest | **1198** | `cd backend && poetry run pytest --collect-only -q` |
| Frontend Vitest | **664** | `cd frontend && npx vitest --run` |
| Plugin pytest (sum) | **432** | `for d in plugins/*/; do (cd "$d" && pytest --collect-only -q | tail -1); done` |
| E2E smoke specs | **20** | `ls e2e/smoke/*.spec.ts` |
| E2E full specs | **0** | `ls e2e/full/*.spec.ts` (currently empty) |
| Manual smoke catalog | **~60 entries** | `docs/smoke-tests-catalog.md`; ~6 Critical, ~13 High, ~22 Medium, ~9 Low |

Plugin breakdown:

| Plugin | Tests |
|--------|-------|
| audiobook | 98 |
| export | 92 |
| ms-tools | 97 |
| translation | 35 |
| kdp | 33 |
| help | 30 |
| git-sync | 23 |
| grammar | 10 |
| kinderbuch | 8 |
| getstarted | 6 |

Verify counts before quoting them per `ai-workflow.md` "Numeric
claims verification". The numbers above are the Session 1 baseline.

---

## Coverage matrix per feature

Legend: ✓ = covered, **○** = sparse / partial, **—** = no coverage.

### Articles (v0.24.0 headline)

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| Article CRUD | ✓ `test_articles.py` | ✓ tests for ArticleEditor | **○** topic+SEO only | ✓ | E2E for full CRUD |
| Article editor (TipTap) | — | ✓ via shared editor tests | ✓ topic+SEO + export | ✓ | None |
| Status lifecycle (draft→ready→published→archived) | ✓ `test_articles.py` | ✓ | — | ✓ | E2E for lifecycle |
| Topics + SEO | ✓ | ✓ | ✓ `article-topic-seo.spec.ts` | ✓ | None |
| Translate-article | ✓ `test_translate_article.py` | ✓ | — | ✓ | **E2E missing** |
| Article export (MD/HTML/PDF/DOCX) | ✓ `test_article_export.py` (11 tests) | ✓ | ✓ `article-export.spec.ts` | ✓ | None |
| Featured image upload | ✓ `test_article_assets.py` | ✓ | — | ✓ | E2E for upload + URL paths |
| Provider gating in translate panel | ✓ `test_translate_article.py` | ✓ | — | ✓ | None |

### Publications + drift detection (AR-02)

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| Publication CRUD | ✓ `test_publications.py` | ✓ `PublicationsPanel.test.tsx` | — | ✓ | **E2E missing** |
| Mark-as-published with snapshot | ✓ | ✓ | — | ✓ | **E2E missing** |
| Drift detection (`out_of_sync`) | ✓ | ✓ | — | ✓ | **E2E missing** |
| Verify-live timestamp | ✓ | ✓ | — | ✓ | E2E for verify path |
| 8 platform schemas | ✓ data-driven test | — | — | **○** | YAML schema validation test |

### Books + chapters (core, established)

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| Book CRUD | ✓ `test_api.py`, `test_phase4.py` | ✓ | ✓ `dashboard-filters.spec.ts` | ✓ | None |
| Book metadata roundtrip | ✓ | ✓ | ✓ `book-metadata-roundtrip.spec.ts` | ✓ | None |
| Chapter CRUD | ✓ | ✓ | ✓ implicit | ✓ | None |
| Chapter reorder | ✓ | ✓ | ✓ `chapter-reorder.spec.ts` | ✓ | None |
| Chapter conflict dialog | ✓ `test_chapter_versioning.py` (15 tests) | ✓ `ConflictResolutionDialog.test.tsx` | — | ✓ | E2E for 409 race scenario |
| PS-13 Save-as-new-chapter | ✓ 6 tests | ✓ 3 tests | — | ✓ | E2E (race condition is hard to trigger via Playwright reliably) |
| Book templates | ✓ `test_templates.py` | ✓ | ✓ `create-book-from-template.spec.ts` | ✓ | None |
| Chapter templates | ✓ `test_chapter_templates.py` | ✓ | — | ✓ | E2E for picker + save-as flows |
| Trash + restore | ✓ `test_trash.py` | ✓ | ✓ `trash.spec.ts` | ✓ | None |

### Editor

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| TipTap formatting | — | ✓ | ✓ `editor-formatting.spec.ts` | ✓ | None |
| Editor sidebar viewport | — | ✓ | ✓ `chapter-sidebar-viewport.spec.ts` | ✓ | None |
| ContentKind plugin gating | — | ✓ via tests | — | **○** | Smoke + E2E for book vs article surface diff |
| Keywords editor | — | ✓ | ✓ `keywords-editor.spec.ts` | ✓ | None |

### Import / export

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| Import wizard (.bgb) | ✓ `test_bgb_handler.py` | ✓ | ✓ `import-wizard-bgb.spec.ts` | ✓ | None |
| Import wizard (WBT) | ✓ `test_wbt_*.py` (6 files) | ✓ | ✓ `import-wizard.spec.ts` | ✓ | None |
| Import wizard (markdown) | ✓ `test_markdown_handler.py` | ✓ | — | ✓ | E2E for markdown handler |
| Import wizard (DOCX/EPUB office) | ✓ `test_office_handlers.py` | ✓ | — | ✓ | E2E for office formats |
| Import wizard (Git URL) | ✓ `test_import_git_endpoint.py` | ✓ | ✓ `import-wizard-git-url.spec.ts` | ✓ | None |
| Multi-book BGB | ✓ | ✓ | **○** in `import-wizard-bgb.spec.ts` | ✓ | E2E for multi-book selection + multi-success |
| Git adoption | ✓ `test_git_import_adopter.py` | ✓ | — | ✓ | E2E for adoption choices |
| Field-selection (CIO-06) | ✓ `test_import_overrides.py` | ✓ | — | ✓ | E2E for sectioned field picker |
| Backup export | ✓ `test_backup_*.py` | ✓ | ✓ `backup-roundtrip.spec.ts` | ✓ | None |
| Backup import | ✓ `test_backup_import_revive.py` | ✓ | ✓ `backup-roundtrip.spec.ts` | ✓ | None |
| Export (EPUB/PDF/DOCX/audiobook) | ✓ in plugin | ✓ | ✓ `export-download.spec.ts` | ✓ | None |
| Export async + SSE | ✓ `test_audiobook_export_async.py` | ✓ | — | ✓ | E2E for SSE progress + minimize |

### Plugins

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| Plugin discovery | ✓ `test_plugin_discovery.py` | ✓ | — | ✓ | None |
| Plugin install (ZIP) | ✓ `test_plugin_install.py` | ✓ | ✓ `plugin-install.spec.ts` | ✓ | None |
| Plugin routes | ✓ `test_plugin_routes.py` | — | — | **○** | None (low risk) |
| ms-tools per article | ✓ in plugin | — | — | ✓ | E2E for article quality panel |
| Audiobook generation | ✓ in plugin (98 tests) | ✓ | — | **○ paid TTS, manual only** | None (intentional manual-only for paid services) |
| Translation provider | ✓ in plugin | ✓ | — | ✓ | E2E for full translate flow |
| KDP cover validation | ✓ in plugin (33 tests) | ✓ | — | ✓ | E2E for KDP completeness panel |
| Grammar (LanguageTool) | ✓ in plugin | ✓ | — | ✓ | E2E for grammar panel |
| Kinderbuch layouts | ✓ in plugin | ✓ | — | ✓ | E2E for one-image-per-page |

### plugin-git-sync (PGS-01..05 + follow-ups)

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| Git import from URL | ✓ `test_import_git_endpoint.py` | ✓ | ✓ `import-wizard-git-url.spec.ts` | ✓ | None |
| Commit-to-repo | ✓ `test_git_sync.py` | ✓ | — | ✓ | **E2E for full commit flow** |
| Three-way smart-merge | ✓ `test_git_sync_diff.py` (22 tests) | ✓ | — | ✓ | **E2E for diff dialog** |
| mark_conflict + rename detection | ✓ | ✓ | — | ✓ | E2E |
| Multi-language linking | ✓ `test_translation_groups.py` (29 tests) | ✓ | — | ✓ | **E2E for link/unlink + sibling navigation** |
| Per-book PAT credentials | ✓ `test_git_credentials.py` | ✓ | — | ✓ | E2E for credentials section |
| Unified commit (PGS-05) | ✓ `test_git_sync_unified.py` | ✓ | — | ✓ | E2E for fan-out outcome list |
| Skipped branches surfacing | ✓ | ✓ | — | ✓ | E2E |

### Core git backup (CF/SI in v0.21.0)

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| Git init/commit/log | ✓ `test_git_backup.py` | ✓ | — | ✓ | E2E |
| Remote push/pull | ✓ | ✓ | — | ✓ | E2E |
| Conflict resolution | ✓ | ✓ | — | ✓ | E2E |
| SSH keypair | ✓ `test_ssh_keys.py` | ✓ | — | ✓ | E2E for generate/copy/delete |

### AI

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| Provider config | ✓ `test_ai_providers.py` | ✓ | — | ✓ | E2E for setup wizard |
| Connection test | ✓ `test_ai_client.py` | ✓ | — | ✓ | E2E |
| Chapter review | ✓ `test_ai_review.py` | ✓ | ✓ `ai-review.spec.ts` | ✓ | None |
| Marketing copy | ✓ `test_ai_marketing.py` | ✓ | — | ✓ | E2E |
| Usage tracking | ✓ `test_ai_usage_tracking.py` | ✓ | — | ✓ | E2E for cost panel |
| Config refresh | ✓ `test_ai_config_refresh.py` | ✓ | — | ✓ | None (low risk) |

### Settings + theming + i18n

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| Settings API | ✓ `test_settings_api.py` | ✓ | — | ✓ | E2E for tab navigation |
| Themes + dark mode | — | ✓ | ✓ `themes.spec.ts` | ✓ | None |
| 8-language UI | ✓ `test_i18n_*.py` | ✓ | **○** in themes | ✓ | E2E for language switch persistence |
| Help system | ✓ `test_help_routes.py` | ✓ | — | ✓ | E2E for in-app help |
| Topics tab in Settings | ✓ in `test_articles.py` | ✓ | ✓ in `article-topic-seo.spec.ts` | ✓ | None |

### Cross-cutting

| Feature | Backend | Frontend | E2E smoke | Manual smoke | Gap |
|---------|---------|----------|-----------|--------------|-----|
| WebSocket | ✓ `test_websocket.py` (6 tests) | — | — | **○** | Frontend test for SSE/WS panel |
| Licensing infrastructure | ✓ `test_license*.py` | — | — | **○** | Dormant, low priority |
| Content safety (sanitization) | ✓ `test_import_sanitization.py` | ✓ | ✓ `content-safety.spec.ts` | ✓ | None |
| Alembic drift | ✓ `test_alembic_drift.py` (10 tests) | — | — | — | None (CI-only need) |
| Plugin license tiers | ✓ `test_license_tiers.py` | — | — | — | None (dormant) |

---

## Top gaps by ROI

Ranked by `severity × frequency-of-use × likelihood-of-regression`.
Address in this order in subsequent sessions.

### Tier A (Session 2 candidates)

1. **Article translation E2E.** No spec covers source → translate
   → new article verified. AR-02 paid feature, drift between
   provider abstraction + translate-article router would silently
   fail.
2. **Publications + drift detection E2E.** Backend tests cover the
   logic; the user-facing flow (mark published → mutate article →
   refresh → out_of_sync flag) has no E2E. Drift is the AR-02
   value prop.
3. **plugin-git-sync commit + diff E2E.** Most complex flow in the
   project, only manual coverage. Real risk of UI/backend drift
   without an E2E pin.
4. **Multi-language link/unlink E2E.** PGS-04 ships a metadata
   panel with no smoke spec. Easy to write, high regression risk
   on book-deletion cascade.
5. **Article CRUD lifecycle E2E.** Covers status transitions
   (draft → ready → published → archived) which back-end tests
   verify but no UI flow does.

### Tier B (Session 3 candidates)

6. SSE / async export progress E2E.
7. Office handlers (DOCX / EPUB) E2E.
8. AI cost panel + usage tracking E2E.
9. ms-tools per-article quality panel E2E.
10. Settings tab navigation + persistence E2E.

### Tier C (defer to future test phase)

- Audiobook full generation flow (paid TTS — stays manual).
- Cross-browser matrix beyond Chromium.
- Visual regression on theme variants.
- Mobile / responsive behaviour.

---

## What stays manual permanently

These are intentionally not automated. Documented in
`docs/manual-tests/manual-smoke-tests.md`.

- Subjective visual quality (PDF layout, EPUB rendering in real
  readers, kinderbuch one-image-per-page output).
- Real third-party APIs (DeepL paid tier, ElevenLabs TTS, Google
  TTS, OpenAI cost validation).
- Hardware drag-drop (file system + browser interaction).
- Real-zoom rendering (CSS zoom 125% / 150% on actual hardware).
- Cross-browser rendering checks beyond Chromium.

---

## Update protocol

When closing a coverage gap:

1. Move the feature row from the gap column to ✓.
2. Reference the new spec file in the row.
3. Re-rank the "Top gaps by ROI" list — what's the next thing to
   address.
4. Bump the `Last updated` date.

When adding a new feature:

1. Add a row in the appropriate section.
2. Mark the columns honestly. Don't claim coverage that doesn't
   exist.
3. If the feature is shipped without smoke coverage, add an entry
   to `docs/smoke-tests-catalog.md` so manual checks are at least
   defined.
