# Chat Journal — v0.21.0 Release (2026-04-22)

## 1. Release cut — v0.21.0 (tag 98ed1b9)

- **Range:** v0.20.0 (2026-04-20 19:18) → v0.21.0 (2026-04-22)
- **Commits since v0.20.0:** 43 across ~1 day
- **Type breakdown:** 19 docs, 13 feat, 4 fix, 4 chore, 2 refactor, 1 style
- **LOC delta:** +9367 / -697 across 60 files

## 2. Scope delivered

### Git-based backup (SI-01..04, full 5-phase plan)

All five phases from `docs/explorations/git-based-backup.md` shipped in this cycle:

- Phase 1 (`436de37` + `2203c2e` + `556231c`): local git per book — init, commit, log, status, frontend dialog, i18n
- Phase 2 (`c78fa1c` + `d9f72bc`): remote push/pull with Fernet-encrypted PAT, sync status badge
- SI-01 polish (`d229d81`): Accept Remote / Accept Local panel, force-push with confirm
- SI-04 polish (`7f5bd4e`): sidebar indicator dot for remote-ahead / diverged
- Phase 3 (`d35ebd4` + `fe48b0a`): SSH key generation via `cryptography` Ed25519, SshKeySection UI, GIT_SSH_COMMAND wiring
- Phase 4 (`76b662c` + `530732e`): conflict analysis (simple vs complex), 3-way merge, per-file resolution, abort
- Phase 5 (`64a8ca3`): Markdown side-files for readable git diffs
- Help docs (`797f9a8`): DE + EN basics / remote / SSH pages

### AI editor modes
- `feat(quality)` navigate-to-first-issue (`2587699`)
- `feat(ai)` fix_issue mode for quality findings (`19d2ce6`)

### UI polish / fixes
- Settings KI-Assistent tab refactor (`0d11ef5`)
- CSS zoom fixes #10 + #11 + regression (`ef7ce5c`, `2b561c5`, `c25483e`)
- Radix tab class unification + mobile overflow (`e197d05`)
- Reactive word/char count via useEditorState (`7507e40`, partial #12)

### Infrastructure
- Node 22 → 24 LTS across repo + CI + Docker (`46d0f39`, `517232d`)
- Backend CVE sweep 13 → 0 (`ab83a83`)
- pip-audit dev-dep (`799274d`)
- Numeric-claims rule + CSS viewport-vs-app-container lesson (`652a04a`, `a755a75`)

### Docs
- TipTap 3 exploration (`fb46fc2`)
- Article authoring exploration (`c374464`)
- Git-based backup exploration (`ee24302`)
- CHANGELOG seed (`220bc1d`)

## 3. Release process

Followed `release-workflow.md` steps:

- Step 1 pre-audit: 43 commits, test gate green, clean tree
- Step 2 SemVer: minor bump v0.20.0 → v0.21.0 (major feature + several minor features + no breaking)
- Step 3 CHANGELOG: extended Unreleased → [0.21.0] block; wrote CHANGELOG-v0.21.0.md for GH release body (`09747bd`)
- Step 4 version bumps: backend/pyproject.toml, frontend/package.json, backend/app/main.py, install.sh, CLAUDE.md, docs/ROADMAP.md (`98ed1b9`)
- Step 4b dependency currency: `poetry update` applied patch/minor bumps (gitpython 3.1.47, fastapi 0.135.4, pydantic 2.13.3, rich 15, mypy 1.20.2, lxml 6.1, numpy 2.4.4, greenlet 3.4). elevenlabs 0.2 → 2.44 deferred per DEP-05.
- Step 5 tests: 707 backend + 409 plugin + 427 Vitest + 169/1 smoke all green
- Step 6 build: frontend `npm run build` clean. Backend `poetry build` skipped (application, not package).
- Step 7 tag + push: `v0.21.0` pushed to origin
- Step 8 GH release: `gh release create v0.21.0 --notes-file CHANGELOG-v0.21.0.md` → https://github.com/astrapi69/bibliogon/releases/tag/v0.21.0
- Step 9 Docker push: skipped (no active registry pipeline)
- Step 10 docs deploy: GH action triggered automatically on main push
- Step 11 post-release: this journal

## 4. Numeric baseline for v0.21.0

Verified by running authoritative commands per numeric-claims rule:

- Backend pytest: **707 passed**
- Plugin pytest (9 plugins): audiobook 98, export 92, getstarted 6, grammar 10, help 30, kdp 33, kinderbuch 8, ms-tools 97, translation 35 = **409 passed**
- Frontend Vitest: **427 passed** (39 files)
- Playwright smoke: **169 passed / 1 skipped / 0 failed** (1 flake rerun, stabilized)
- tsc, ruff, pre-commit: clean
- Total automated tests: **1712** (backend 707 + plugin 409 + Vitest 427 + smoke 169)

## 5. Known follow-ups

- **#12** editor word count reactivity: partial fix landed (`7507e40`), Playwright smoke skip remains. Will likely close gratis when TipTap 3 lands.
- **DEP-02** TipTap 3: blocked on upstream `@sereneinserenade/tiptap-search-and-replace` v0.2.0 npm publish (issue #19 filed).
- **SEC-01** frontend dev-only vite-plugin-pwa chain (4 high CVEs): blocked on upstream `workbox-build` release.
- **Git-backup smoke spec**: ai-workflow.md step 7 requires Playwright smoke per new UI feature. Not written for the Git dialog yet. Follow-up v0.21.1.
- **DEP-05** elevenlabs 0.2 → 2.44 major SDK rewrite: deferred per ROADMAP.

## 6. Release meta

- **Tag:** v0.21.0 pushed 2026-04-22
- **Release URL:** https://github.com/astrapi69/bibliogon/releases/tag/v0.21.0
- **Docs site:** https://astrapi69.github.io/bibliogon/ (deploying via GH action)
- **Install script:** `install.sh` now defaults to v0.21.0
- **Deferred dependency bumps this cycle:** elevenlabs (DEP-05), Vite 8 (DEP-09 blocked), TipTap 3 (DEP-02 blocked)
