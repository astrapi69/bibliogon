# Bibliogon Roadmap

Current phase: Phase 2 - build for real users, not just developers
Last updated: 2026-04-22
Latest release: v0.21.0 (Git-based backup, full 5-phase plan shipped: local git per book, remote push/pull with encrypted PATs, SSH key generation, 3-way merge with per-file conflict resolution, Markdown side-files for readable diffs; closes SI-01..04. Plus AI fix_issue mode for quality findings, quality-tab navigate-to-first-issue, Settings KI-Assistent tab refactor, CSS zoom fixes (#10, #11), Node 22 -> 24 LTS migration, backend CVE sweep aiohttp/pygments/starlette 13 -> 0.)

Phase 1 (feature-complete single-user tool, v0.1.0 through v0.14.0) is archived at [docs/roadmap-archive/phase-1-complete.md](roadmap-archive/phase-1-complete.md). The archive includes a postscript (2026-04-15) about the silent-image-drop bug discovered after archival.

---

## Current focus

Distribution code is complete for all three platforms (D-01 Windows, D-02 macOS, D-03 Linux) plus auto-update (D-04). Manual smoke tests on real hardware are tracked as GitHub issues ([#2](https://github.com/astrapi69/bibliogon/issues/2), [#3](https://github.com/astrapi69/bibliogon/issues/3), [#4](https://github.com/astrapi69/bibliogon/issues/4)). Templates theme is complete: book templates (TM-01/02/03/05) and chapter templates (TM-04) all shipped. Next active theme: TBD - likely Git-based backup (SI-01 onward) or deferred DEP-* dependency upgrades.

---

## Critical Fixes (Phase 2)

Bugs whose impact on shipped versions warrants tracking separately from polish work.

- [x] CF-01: PDF/DOCX silent image drop. Bug present v0.1.0 through v0.14.0, fixed v0.15.0. Originally tracked as PS-06 polish item; severity reclassified after diagnosis revealed shipped impact. See [archive postscript](roadmap-archive/phase-1-complete.md#postscript-2026-04-15) for the full trajectory.

---

## Themes for Phase 2

### 1. Distribution and packaging (priority: now)

Lower the installation barrier for non-technical users. Simple Launcher first, Tauri as a later option if needed. No Electron. See [docs/explorations/desktop-packaging.md](explorations/desktop-packaging.md) for the full evaluation.

- [x] D-01: Simple Launcher for Windows (`.exe` via PyInstaller). Install, uninstall, Docker start/stop, browser open, health check, update notification, opt-out settings. CI: [launcher-windows.yml](../.github/workflows/launcher-windows.yml). Per-user state lives in `%APPDATA%\bibliogon\` with files `install.json` (manifest), `install.log` (rotating activity log), `cleanup.json` (only during interrupted uninstall), `settings.json` (user preferences). Manual smoke test: [issue #2](https://github.com/astrapi69/bibliogon/issues/2).
- [x] D-02: Simple Launcher for macOS (`.app` bundle, arm64-only for initial release). Same source as Windows launcher; spec file's darwin BUNDLE block produces the `.app`. CI: [launcher-macos.yml](../.github/workflows/launcher-macos.yml). Unsigned binary requires Gatekeeper bypass (right-click -> Open) on first launch. Intel Mac support (universal2) and code signing deferred until user demand. Manual smoke test: [issue #3](https://github.com/astrapi69/bibliogon/issues/3).
- [x] D-03: Simple Launcher for Linux (PyInstaller binary). Same source as Windows launcher; spec file is cross-platform aware. CI: [launcher-linux.yml](../.github/workflows/launcher-linux.yml). Requires `python3-tk` on target (preinstalled on every major desktop distro). Optional follow-up: `.desktop` file for GNOME/KDE menu integration. Manual smoke test: [issue #4](https://github.com/astrapi69/bibliogon/issues/4).
- [ ] D-03a: AppImage for Linux — deferred. The PyInstaller binary requires `python3-tk` on the target (preinstalled on every major desktop distro). AppImage would make that self-contained at a 4-10x size cost and added CI complexity (FUSE + appimagetool). Re-evaluate only when a user reports a missing-tkinter failure in the wild.
- [x] D-04: auto-update check in the launcher (notify user of new versions). Background thread polls `https://api.github.com/repos/astrapi69/bibliogon/releases/latest` on every launcher start, compares against the installed version from the manifest, and shows a non-blocking "Open release page / Dismiss" dialog when a strictly newer release is available. All failures are silent (network, timeout, rate limit, malformed response). Stdlib-only (urllib + threading). 21 tests in [test_update_check.py](../launcher/tests/test_update_check.py).
- [ ] D-05: Full Windows installer (downloads Docker Desktop + Bibliogon repo + generates .env, no terminal required at any step). Larger scope than D-01's launcher. Defer until user feedback shows the install (not the start) is the actual friction. See [docs/explorations/desktop-packaging.md](explorations/desktop-packaging.md) for context and triggers for reconsidering.

### 2. Book and chapter templates (priority: after distribution)

Pre-built structures for common book genres. Lowers the entry barrier for new users who do not know how to structure a book.

- [x] TM-01: template data model. `BookTemplate` + `BookTemplateChapter` tables (Alembic migration `b7c8d9e0f1a2`), `/api/templates/` CRUD, 5 new `ChapterType` values (half_title, title_page, copyright, section, conclusion), idempotent seed at startup.
- [x] TM-02: 5 builtin templates seeded with TM-01 - Children's Picture Book, Sci-Fi Novel, Non-Fiction / How-To, Philosophy, Memoir. Definitions live in `backend/app/data/builtin_templates.py`.
- [x] TM-03: "Create from template" mode in CreateBookModal (Radix Tabs toggle), POST /api/books/from-template builds the book + chapters in a single commit, template picker cards with genre badge and chapter count.
- [x] TM-04: chapter templates. `ChapterTemplate` table (Alembic migration `c8d9e0f1a2b3`), `/api/chapter-templates/` CRUD, 4 builtins seeded (Interview, FAQ, Recipe, Photo Report) as TipTap JSON. Frontend: "Aus Vorlage..." entry in the new-chapter dropdown opens `ChapterTemplatePickerModal`; "Save as template" entry in each chapter's ContextMenu opens `SaveAsChapterTemplateModal` (empty-placeholders vs preserve-content). User templates deletable; builtins show a "Built-in" badge. TM-04b items deferred: update endpoint exposed in UI, JSON export/import, multi-chapter templates.
- [x] TM-05: user-created templates. "Save as template" in the ChapterSidebar footer opens SaveAsTemplateModal (empty-placeholders vs preserve-content), user templates appear in the picker alongside builtins with a trash-icon delete action; builtin templates show a "Built-in" badge and are read-only.

### 3. Polish and stability (runs in parallel throughout Phase 2)

- [x] PS-01: app.yaml auto-creation from app.yaml.example on first startup
- [x] PS-02: onboarding flow for AI provider setup (first-run wizard)
- [x] PS-03: keyboard shortcuts customization
- [x] PS-04: performance optimization for large books (500+ pages, 100+ chapters)
- [x] PS-05: accessibility audit (WCAG 2.1 AA for core workflows)
- [x] PS-06: manuscripta integration polish (rough edges in the export pipeline) (reclassified as CF-01 after diagnosis revealed critical severity)
- [x] PS-07: plugin developer documentation (API reference, tutorial, example plugin)
- [x] PS-08: docs + help catch-up for the Templates theme. New `docs/help/{de,en}/templates.md` pages registered in `_meta.yaml`, 6 new FAQ entries in `backend/config/plugins/help.yaml` (DE + EN), stale "21 chapter types" answer refreshed to 31, CLAUDE.md data-model updated with BookTemplate / ChapterTemplate entries and the new `make test-coverage` target, CHANGELOG Unreleased section opened capturing templates + coverage-to-CI + theme-toggle placement work.
- [x] PS-09: expand the CI plugin matrix. `ci.yml` and `coverage.yml` now run 7 plugins (added audiobook + translation alongside the existing export, grammar, kdp, kinderbuch, ms-tools). pytest-cov added to both new plugins' dev deps; root Makefile gets matching `test-coverage-plugin-audiobook` and `test-coverage-plugin-translation` targets.
- [x] PS-10: trivial cleanup of the `plugin_config` unused-parameter warning in `backend/app/main.py` `_check_license`. Pluginforge's `pre_activate` signature requires the second argument, so the parameter was prefixed with `_` (`_plugin_config`) to silence the warning while preserving the hook contract.
- [x] PS-11: regression tests for the ruamel.yaml round-trip (`backend/tests/test_yaml_io.py`, 5 tests covering byte-identical round-trip, `# INTERNAL` comment survival, quote-style preservation, missing-file errors, and parent-directory creation) + missing Spanish accents fixed in 4 plugin YAMLs (`translation.yaml`, `kinderbuch.yaml`, `kdp.yaml`, `audiobook.yaml`: Traducción, página, validación, publicación, Generación, capítulos).
- [x] PS-12: removed .gitignore rule blocking session journals; aligned ai-workflow.md
- [ ] PS-13: "Save as new chapter" action in `ConflictResolutionDialog`. Third button alongside Keep/Discard that clones the local-edit into a fresh chapter appended after the current one, then pulls the server content into the current chapter. Requires new backend endpoint (e.g. `POST /api/books/{id}/chapters/fork`), i18n keys across 8 locales, E2E coverage, and scope discussion for position ordering. Deferred from v1 of the 409 conflict flow; inline TODO removed in favor of this tracker entry.
- [ ] PS-14+: future polish items, surface as found

### 4. Git-based backup (phased)

Replaces the upload-based backup-compare (V-02 stop-gap) with proper Git integration. Phased plan lives in [docs/explorations/git-based-backup.md](explorations/git-based-backup.md). MVP ships TipTap JSON per chapter under `uploads/{book_id}/.git`, user-controlled commits, remote-agnostic (any git URL), offline-first.

- [x] **Phase 1:** local git per book (init / commit / log / status). GitPython backend, Dockerfile git binary, frontend Commit dialog + sidebar button, i18n in 8 languages. Shipped in `feat(git-backup): Phase 1 local git per book` (commit `436de37`) + frontend `2203c2e` + i18n fix `556231c`.
- [x] **Phase 2:** remote push/pull + SI-01 + SI-04. Backend: configure_remote/push/pull/sync_status with Fernet-encrypted PAT via credential_store, one-shot-URL PAT injection so the token never lands in `.git/config`, ff-only pull with DivergedError for SI-02. Frontend: remote config form, Push/Pull buttons, SyncBadge (in_sync / local_ahead / remote_ahead / diverged / never_synced). Shipped `c78fa1c` (backend) + `d9f72bc` (frontend).
- [x] **SI-04 polish:** real sidebar indicator. Accent-coloured dot on the Git-Sicherung sidebar button when sync state is `remote_ahead` or `diverged`. Polled on book load and after Git dialog close. Shipped `7f5bd4e`.
- [x] **SI-01 polish:** dedicated Accept Remote / Accept Local conflict resolution panel in the Git dialog. Push rejection and pull divergence both open the panel; Accept Local runs force push behind a confirm() dialog. Backend `push(force=bool)` + regression test. Shipped `d229d81`.
- [x] **Phase 3:** SI-03 SSH key generation. Ed25519 keypair via the existing `cryptography` dep (no paramiko, no subprocess). One keypair per install at `config/ssh/id_ed25519` with 0600 perms. Settings UI (Allgemein tab) to generate / copy public key / delete. git_backup push/pull auto-wires `GIT_SSH_COMMAND` when URL is SSH and a key exists. Backend `d35ebd4`, frontend `fe48b0a`, 20 new tests.
- [x] **Phase 4:** SI-02 conflict analysis + per-file resolution. Backend: `analyze_conflict` classifies diverged state as simple (disjoint file sets) or complex (overlap); `merge` attempts a 3-way merge, auto-commits simple cases, leaves complex cases in merge-in-progress state; `resolve_conflicts` applies per-file Mine/Theirs resolution; `abort_merge` rolls back. Frontend: two-mode ConflictResolution panel — initial Merge/Force-Push/Cancel choice, then per-file radio picker with Apply/Abort after a complex merge surfaces conflicts. Backend `76b662c`, frontend `530732e`, 11 new tests.
- [x] **Phase 5:** Markdown side-files. Every commit writes a `.md` counterpart next to each chapter `.json` (via the export plugin's TipTap → Markdown converter, lazy-imported and failure-tolerant). JSON stays canonical; MD is advisory for readable git diffs. Shipped `64a8ca3`, 4 new tests.

### 5. Donation integration (priority: after stability)

Users can support the project. Prompts are subtle, respectful, without dark patterns. Donation state stored locally, no tracking.

See [docs/explorations/donations-ux.md](explorations/donations-ux.md) for the full strategy document.

- [x] S-01: Settings section "Support Bibliogon" - new 4th Radix tab in `frontend/src/pages/Settings.tsx`, rendered only when `donations.enabled === true`. Channel list with per-channel description and optional "Recommended" badge; `landing_page_url` override collapses UI to one primary button. New `SupportSection.tsx` component, i18n `ui.donations.*` in all 8 languages.
- [x] S-02: One-time onboarding dialog after first book creation - new `DonationOnboardingDialog.tsx` mirroring the AiSetupWizard pattern. Triggered from `Dashboard.handleCreate`/`handleCreateFromTemplate` when `books.length === 0` BEFORE the create and the `bibliogon-donation-onboarding-seen` localStorage flag is unset. Every dismiss path (Support, Understood, close-X) sets the flag. Two-step: intro -> channel picker if no `landing_page_url`.
- [x] S-03: 90-day reminder banner on Dashboard - new `DonationReminderBanner.tsx` + pure `shouldShowReminder` helper. Banner shows only when donations enabled AND onboarding seen AND 90+ days since `bibliogon-first-use-date` (initialised in `App.tsx`) AND `bibliogon-donation-reminder-next-allowed` is missing or in the past AND Dashboard is in book-grid mode. Dismiss: Support = 180-day cooldown, Not now / close-X = 90-day cooldown. Never during editor/export (different routes), no counter shown, no animation, no urgency.
- [x] Help page: `docs/help/{de,en}/support.md` with channels, FAQ (tax-deductibility, anonymity per platform, recurring vs one-time, how to cancel), contact. Top-level nav entry with icon `heart`, brings nav from 14 to 15 entries.

---

## Core import orchestrator

Unified import wizard in core that dispatches to format-specific plugin handlers via a two-phase `ImportPlugin` protocol (detect + execute). Preview panel catches silent-failure bugs (wrong cover path, stale CSS, misclassified assets) before they reach the DB. Full design in [docs/explorations/core-import-orchestrator.md](explorations/core-import-orchestrator.md).

- [x] **CIO-01:** core wizard + detect/execute endpoints + `ImportPlugin` protocol + preview panel + override UI + duplicate detection + `.bgb` and markdown core handlers. Shipped across 2 sessions (backend foundation 5 commits ending `52744f0`, frontend wizard 9 commits ending `9a0ac7f`). 40 new backend tests + 38 new Vitest tests. Legacy `/api/backup/*` endpoints untouched.
- [ ] **CIO-02:** plugin-git-sync adopts `ImportPlugin`, WBT logic moves to plugin, `smart_import` deprecated (301). Rolls up with PGS-01. Integration overhead: 3-5h.
- [ ] **CIO-03:** folder drag-drop handler (`core-markdown-folder`). HTML5 `webkitdirectory` in the wizard's Step 1, multipart folder upload backend handler. Estimated effort: 6-10h.
- [ ] **CIO-04:** office formats via `plugin-import-office` (`.docx`, `.epub`). Pandoc-based. Estimated effort: 10-15h.
- [ ] **CIO-05:** deprecation cleanup (remove `smart_import.py`, empty `project_import.py`, remove old routes + callers). Estimated effort: 4-6h.

---

## Plugins

New plugin work tracked separately from Phase 2 themes. Plugin versions are independent of the app version; a plugin is bumped only when the plugin itself changes.

### plugin-git-sync (phased)

Bi-directional git sync for Bibliogon books: import existing git-based book projects (write-book-template format), sync edits back. First plugin-to-plugin dependency (builds on plugin-export), orthogonal to the v0.21.0 core git integration. Full design in [docs/explorations/plugin-git-sync.md](explorations/plugin-git-sync.md).

- [ ] **PGS-01:** plugin-git-sync Phase 1 (import-only MVP). New plugin scaffold, depends on plugin-export, implements the `ImportPlugin` protocol from CIO-01 (see [docs/explorations/core-import-orchestrator.md](explorations/core-import-orchestrator.md) Section 5), "Import from Git" UI slots into the Step 1 source picker once CIO-02 wires it, clones repo to plugin workspace, parses `.bibliogon/` structure, creates Bibliogon book(s) (one per language branch when `branches.yaml` present), copies assets. No sync-back. Estimated effort: 12-18h.
- [ ] **PGS-02:** plugin-git-sync Phase 2 (export to repo, overwrite MVP). "Commit to Repo" button, serializes current Bibliogon state to repo spec, commits to local clone, optional push (reuses core PAT handling). Overwrite semantics (variant 2c): no 3-way comparison, direct-repo edits lost unless re-imported first. Estimated effort: 10-15h.
- [ ] **PGS-03:** plugin-git-sync Phase 3 (smart-merge on re-import). Three-way comparison using `last_imported_commit_sha`, per-chapter conflict classification, UI for Keep/Take/Mark-conflict resolution. Estimated effort: 14-20h.
- [ ] **PGS-04:** plugin-git-sync Phase 4 (multi-language linking UI). Books from different branches of the same repo shown as linked (DE/EN/ES badges), new `Book.translation_group_id` column auto-populated on import, manual link/unlink in Settings. Estimated effort: 8-12h.
- [ ] **PGS-05:** plugin-git-sync Phase 5 (core git integration bridge). Unified commit UI when a book has both plugin-git-sync and core git enabled; shared lock to avoid double-commits. Requires PGS-01..02 and core git Phase 1 stable in production for at least one release. Estimated effort: 6-10h.

---

## Validation tracks

Exploration items in the data-collection phase. Not implementation work; observation logs that drive a later architecture decision.

### Article authoring

Publication workflow for articles, blogposts, tweets. Exploration in [docs/explorations/article-authoring.md](explorations/article-authoring.md). No architecture committed; validation data required before picking Option A/B/C.

- [ ] **AR-01:** validation log. Track 3-5 real cross-posting workflows in [docs/journal/article-workflow-observations.md](journal/article-workflow-observations.md) before committing to architecture. Monthly review classifies pain points as tool- vs workflow-solvable, counts platforms actually used, identifies patterns across articles. Closes when validation data supports an architecture pick OR triggers from exploration Section 13 fire. Effort: zero new code, log filled as part of normal publication work.
- [ ] **AR-02:** architecture decision. After AR-01 data is in, pick Option A (extend Book with content_type), B (new Article entity + plugin-article), or C (sister project) — or archive the exploration as "investigated and deferred". Blocks AR-03+.
- [ ] **AR-03+:** implementation phases. Scope defined once AR-02 resolves.

---

## Maintenance and tech debt

Items with external deadlines or recurring cost that deserve planning-view visibility. Not features; just upkeep that will bite if ignored.

- [x] **Node.js 20 -> 22 LTS:** Dockerfile and CI upgraded from Node 20 to Node 22 (Active LTS until Apr 2027). Node 20 EOL Sep 2026 is no longer a concern.
- [x] **Coverage moved to CI:** `make test` stays fast and coverage-free for everyday local use. Opt-in `make test-coverage` available for local runs. `.github/workflows/coverage.yml` runs on every push/PR and uploads HTML + XML artifacts (14-day retention) for backend, the 5 ci-matrix plugins (export, grammar, kdp, kinderbuch, ms-tools), and frontend. Audiobook + translation plugins still uncovered in CI (mirroring `ci.yml`); pairing them is a follow-up. Codecov integration deferred.

### Security tracking

- [ ] **SEC-01:** vite-plugin-pwa vulnerability chain. 4 high-severity vulns in frontend devDependencies, all routed through `vite-plugin-pwa@1.2.0 -> workbox-build -> @rollup/plugin-terser -> serialize-javascript <=7.0.4`. CVEs: GHSA-5c6j-r48x-rmvq (RCE, CVSS 8.1) and GHSA-qj8w-gfj5-8c6v (DoS, CVSS 5.9). Production bundle audit: 0 vulns (dev-only exposure, not shipped to users). `npm audit fix` cannot resolve non-breaking; `--force` downgrades vite-plugin-pwa 1.2.0 -> 0.19.8 (SemVer major). Resolution path: wait for upstream patch; re-audit monthly via `npm audit --audit-level=high`. Triggers revisit: vite-plugin-pwa ships new release, any vuln reclassified as production, DEP-09 Vite 8 unblocks (forces migration). Same upstream blocker as DEP-09.

### Deferred major dependency upgrades

Each gets a dedicated session with its own testing cycle. Not urgent, but tracked so they don't get forgotten. See `lessons-learned.md` "Dependency currency" for the rules.

- [x] DEP-01: React 18 -> 19 migration. `react`/`react-dom` bumped to ^19.2.0 and `@types/react`/`@types/react-dom` to ^19.2.0 in `frontend/package.json`. No code changes needed: the codebase was already on `createRoot` (React 18+ API) and has no `forwardRef`/`defaultProps`/`PropTypes`/`findDOMNode`/legacy lifecycle usage. All peer deps (TipTap 2.27.2, react-router-dom 6, react-toastify 11, react-markdown 10, lucide-react, @dnd-kit, Radix) accept React ^19. Verified: `tsc --noEmit` clean, 351 Vitest tests green, `npm run build` + PWA regen clean. UI smoke test by Aster pending.
- [ ] **DEP-02:** TipTap 2 -> 3 migration. Status: pre-audit complete, blocked on upstream release. Single hard blocker: `@sereneinserenade/tiptap-search-and-replace` v0.2.0 is merged on `main` (dual peer `^2.0.0 || ^3.0.0`) but not yet published to npm. Upstream issue requesting publish: [sereneinserenade/tiptap-search-and-replace#19](https://github.com/sereneinserenade/tiptap-search-and-replace/issues/19). License verified MIT (repo LICENSE file; npm's "Proprietary" label was stale metadata from 2024). Community bumps forced: `@pentestpad/tiptap-extension-figure` 1.0.12 -> 1.1.0, `tiptap-footnotes` 2.0.4 -> 3.0.1. Fallback if upstream unresponsive by 2026-05-05: `prosemirror-search` adapter (~50-80 LOC). Pre-audit: [docs/explorations/tiptap-3-migration.md](explorations/tiptap-3-migration.md). Estimated effort: 4-8h code + 1-2h regression verification.
- [x] DEP-03: react-router-dom 6.28 -> ^7.14 migration. Zero-touch bump: declarative `<BrowserRouter>` + `<Routes>` unchanged in v7, no `future:` flags set in v6, no `json()`/`defer()` loader helpers used, no data-router (`createBrowserRouter`) in play. Package-only change. Verified: tsc clean, 397 Vitest tests green, vite build + PWA regen clean on Node 22. Data-router migration (loaders/actions) stays deferred as separate opt-in modernization - not needed while the app uses `api` client fetching.
- [x] DEP-04 (partial): Vite 6 -> **7**.3.2 + TypeScript 5 -> 6.0.3 + @vitejs/plugin-react 4 -> 5.2.0 + explicit `@types/node` ^22. Vite 8 deferred: `vite-plugin-pwa@1.2.0` (latest) only supports Vite up to 7; a follow-up DEP will pick up Vite 8 once vite-plugin-pwa releases 8 compat. TS 6 required adding `"types": ["node", "vite/client"]` to `frontend/tsconfig.json` - TS 6 no longer auto-includes every `@types/*` from node_modules when the field is absent (breaks `node:fs`/`node:path` imports in `ChapterSidebar.test.tsx`). Verified: tsc clean, 351 Vitest tests green, vite build + PWA regen clean on Node 23. Vite 7 requires Node 20.19+/22.12+; CI's Node 22 is fine, local Node 18 is not - dev/build must use Node 22+. UI smoke test by Aster pending.
- [ ] DEP-05: elevenlabs SDK 0.2 -> 2.x migration (complete SDK rewrite, needs real API testing)
- [x] DEP-06: pandas 2 -> 3 (resolved: transitive dep of manuscripta 0.9.0 which requires pandas >=3.0)
- [x] DEP-07: lucide-react 0.468 -> ^1.8.0. Zero-touch upgrade: only breaking change in 1.0 was removal of 13 brand icons (Chromium, GitHub, Instagram, LinkedIn, Slack, etc.) and the codebase imports ~70 distinct icons, all semantic UI (Save, Check, Chevron*, Download, etc.), none branded. Import syntax, component props, tree-shaking and naming unchanged. Bonus: UMD format dropped (smaller bundle), `aria-hidden` auto-added for a11y. Verified: tsc clean, 351 Vitest tests green, vite build + PWA regen clean on Node 22. UI smoke test by Aster pending.
- [x] DEP-08: Pillow 11 -> 12 (resolved: manuscripta 0.9.0 requires pillow >=12.0. Both bumped together.)
- [ ] DEP-09: Vite 7 -> 8 (tracker: #6). Blocked on `vite-plugin-pwa` upstream: `1.2.0` still lists peer deps `vite: ^3.1.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`; no Vite 8 PR visible on github.com/vite-pwa/vite-plugin-pwa. Vite latest observed: `8.0.8`. Do NOT force with `--legacy-peer-deps`: Vite 8 changed plugin APIs, and PWA is only exercised at `vite build`/SW regen, so a runtime break there is hard to detect. Re-check `npm view vite-plugin-pwa peerDependencies` every ~2 weeks or after a new release is cut. Last re-check: 2026-04-18 (no change).

---

## Completed in early Phase 2

### AI writing assistance (delivered in v0.14.0)

Built on the multi-provider foundation. All initial AI items shipped in a single release.

- [x] AI-01: multi-provider LLM client (Anthropic, OpenAI, Google, Mistral, LM Studio)
- [x] AI-02: Anthropic /v1/messages adapter
- [x] AI-03: provider selection UI with presets
- [x] AI-04: connection test with error-specific feedback (7 error categories)
- [x] AI-05: AI enable/disable toggle (default: off)
- [x] AI-06: AI-assisted chapter review (style, coherence, pacing suggestions)
- [x] AI-07: AI-assisted book blurb and marketing text generation
- [x] AI-08: context-aware AI prompts (pass chapter context, book metadata, genre)
- [x] AI-09: AI usage tracking per book (token count, cost estimate display)

---

## Explorations (not yet committed)

See [docs/explorations/](explorations/) for future considerations:

- [Desktop packaging](explorations/desktop-packaging.md) - Simple Launcher first, Tauri as later option, no Electron
- [Monetization strategy](explorations/monetization.md) - donations-first approach, deferred freemium
- [Multi-user and SaaS](explorations/multi-user-saas.md) - long-term, not near-term

---

## Archive

- **Phase 1** (completed, v0.1.0 - v0.14.0): [docs/roadmap-archive/phase-1-complete.md](roadmap-archive/phase-1-complete.md) — includes the 2026-04-15 postscript on CF-01.
