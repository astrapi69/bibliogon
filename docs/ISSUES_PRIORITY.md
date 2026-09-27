# Bibliogon Issues — Priority Index

> **Generated**: 2026-09-27 | **Current release**: v0.60.0 (2026-08-15)
> **Single source of truth**: This file + [docs/backlog.md](backlog.md) + [docs/ROADMAP.md](ROADMAP.md)
> **GH Issues**: Cross-referenced by number (#xxx)

---

## Priority Legend

| Tier | Meaning | SLA |
|------|---------|-----|
| **P0** | Deadline / Blocker / Security | Fix immediately |
| **P1** | Architecture / Hygiene debt | Next sprint |
| **P2** | High-value user features | Planned phase |
| **P3** | Infrastructure / Quality | Scheduled |
| **P4** | Explorations / R&D | When capacity |
| **P5** | Speculative / Nice-to-have | Backlog |
| **BLOCKED** | Waiting on upstream/dep | Monitor |

---

## P0 — Deadline / Blocker / Security

*(none currently)*

---

## P1 — Architecture / Hygiene Debt

| ID | GH Issue | Title | Area | Effort | Notes |
|----|----------|-------|------|--------|-------|
| P1-01 | — | God-file burn-down: `Editor.tsx` (981 lines) whitelisted but `api/client.ts` 5212→13 incomplete | Frontend | L | Part of v0.53.0 burn-down; residual files >500 lines |
| P1-02 | — | `platform.ts` API client >500 lines | Frontend | M | Whitelisted as irreducible shell but needs split |
| P1-03 | — | CI: `make verify-components` advisory → blocking | CI | S | CSS-first rule violations in component library |
| P1-04 | #715 | Data-dir migration: empty pre-created target dir treated as conflict (fixed in v0.60.0) | Backend | — | **DONE** — verify no regression |

---

## P2 — High-Value User Features

| ID | GH Issue | Title | Area | Effort | Notes |
|----|----------|-------|------|--------|-------|
| P2-01 | #908 | **Encrypted AI API Key Export/Import** (KeyVault) | Settings/AI | M | Uses `@astrapi69/ai-key-vault` from adaptive-learner; see `docs/API_KEY_VAULT_IMPLEMENTATION_PLAN.md` |
| P2-02 | #714 | i18n boot race: stale `de` catalog overwrites saved language | i18n/Frontend | S | Fixed in v0.60.0 with stale-response guard; add regression test |
| P2-03 | #692 | Client-side picture-book PDF: colour loss in images | Export/PDF | M | In-cap images embed original bytes; genuine downscales composite on white |
| P2-04 | #697 | PWA `version.json` + SW/GitHub-release update-banner dedup | PWA | S | Deploy-independent build artifact |
| P2-05 | #700 | iOS-standalone "close and reopen" update hint (WKWebView) | PWA/iOS | S | New SW activates only after full app restart |
| P2-06 | #702 #705 #709 | docker-app-launcher ^0.12.1 → ^0.28.0 (force-recreate, --update, --doctor) | Launcher | M | Compose start force-recreates; live log follow; cancellable ops |
| P2-06a | #686 #688 | Release orchestration: Makefile targets + Gitflow workflow | Release | S | `release-prepare`/`release-finish` + one-click workflow |
| P2-06b | #690 #693 #716 | TDD inner-loop targets + `make pre-commit` | DevEx | S | Local dev velocity |

---

## P3 — Infrastructure / Quality

| ID | GH Issue | Title | Area | Effort | Notes |
|----|----------|-------|------|--------|-------|
| P3-01 | — | **i18n Translation Gaps** (111 DE, 89 FR, 50 PT, 43 ES, 37 TR, 28 EL, 11 JA keys identical to EN) | i18n | M | See `docs/i18n-translation-report.md` — many UI labels untranslated |
| P3-02 | — | Visual Regression: Playwright screenshots across 12 theme variants | Testing | M | Not yet implemented; manual TC-051 only |
| P3-03 | — | Multi-browser E2E: Firefox + WebKit (Safari) | Testing | M | Critical for iOS PWA (WebKit) |
| P3-04 | — | Radix UI popper 1.3.0 infinite loop under React 19.2.7 | Deps | M | `@radix-ui/react-popper@1.3.0` pinned; wait for 1.3.1 |
| P3-05 | — | dompurify 3.4.8+ drops leading element under happy-dom | Deps | S | Pinned at 3.4.7; verify 3.4.9 in real browser |
| P3-06 | — | katex 0.16.47 → 0.17.0 (math rendering regression risk) | Deps | S | Visual verify inline `$...$` + block `$$...$$` |
| P3-07 | — | elevenlabs 0.2.27 → 2.52.0 (full API rewrite) | Deps/Plugin | L | Plugin `bibliogon-plugin-audiobook` needs real API test |
| P3-08 | — | python-multipart 0.0.27 → 0.0.32 (coordinated plugin bump) | Deps | M | Blocked by `medium-import` pinning ^0.0.27 |
| P3-09 | — | Quality-report PDF: ~10 hardcoded hex colors bypass theme tokens | Export/PDF | S | Replace with semantic tokens or allowlist |
| P3-10 | #370 | Editor context menu: expose all toolbar functions (clipboard/formatting/insert/structure) | Editor | M | Extend `editorContextMenuActions` module |
| P3-11 | — | Settings: `~15×` `GET /api/settings/app` cascade on load | Settings | M | Dedupe via single provider/query-cache; verify with Vitest call-count |
| P3-12 | — | Medium import offline path verify (Dexie mode, zero `/api`) | Import/Offline | S-M | Add/confirm offline-PWA E2E assertion |
| P3-13 | — | TEST-ISOLATION-MODULE-STATE-01: module-level caches survive test boundaries | Testing | M | LRU/cache in services need teardown hooks |

---

## P4 — Explorations / R&D

| ID | GH Issue | Title | Area | Effort | Notes |
|----|----------|-------|------|--------|-------|
| P4-01 | — | Multi-agent coordination decisions (6 open) | Process | S | Adjudicate & fold into `.claude/rules/ai-workflow.md` |
| P4-02 | — | EXPLORATION-FEATURES-TRIAGE-REFRESH-01 | Features | S | Refresh exploration status audit |
| P4-03 | — | LAN Mode Phase 2+3 (offline/local-first sync) | Sync/Offline | L | Connectivity monitor, selective download, background sync |
| P4-04 | — | Plugin licensing infrastructure (dormant `LICENSING_ENABLED=False`) | Plugins | M | License tiers exist but dormant |
| P4-05 | — | White-label / multi-tenant (removed in v0.53.0) | Architecture | XL | Deferred |

---

## P5 — Speculative / Nice-to-have

| ID | GH Issue | Title | Area | Effort | Notes |
|----|----------|-------|------|--------|-------|
| P5-01 | — | FRONTEND-LINT-FORMAT-SETUP-01: Prettier 2-space/4-space mix | Lint | S | Tracked by existing setup |
| P5-02 | — | COMIC-FOUNDATION-RESIDUAL-POLISH-01 | Comics | S | Minor polish items |
| P5-03 | — | KDP-DEFAULT-MARKETPLACE-01 (trigger-gated) | Export/KDP | S | |
| P5-04 | — | CONFIRMATION-SKIP-MODE-01 (trigger-gated) | UX | S | |
| P5-05 | — | STORYBOARD-MOOD-FREE-PICKER-01 | Storyboard | S | |
| P5-06 | — | STORYBOARD-DRAG-CROSS-GROUP-ACT-UPDATE-01 | Storyboard | S | |
| P5-07 | — | PICTURE-BOOK-STORYBOARD-OPERATIONS-01 | Picture Book | S | |

---

## BLOCKED — Upstream / Dependency Wait

| ID | GH Issue | Title | Blocked On | Since |
|----|----------|-------|------------|-------|
| B-01 | — | DEP-05: elevenlabs 2.x (full API rewrite) | elevenlabs 2.52.0 stable + plugin test | 2026-06 |
| B-02 | — | click 8.3 / gTTS compatibility | Upstream releases | 2026-06 |
| B-03 | — | Radix popper 1.3.1 fix | @radix-ui/react-popper | 2026-06 |

---

## Manual Test Plan (from `docs/manual-tests/MANUAL-TESTPLAN.md`)

These 5 test cases **cannot be automated** (real hardware, subjective evaluation, browser internals):

| TC | Title | Why Manual | Frequency |
|----|-------|------------|-----------|
| **TC-032** | Audiobook Export + Quality-Report | TTS synthesis desktop-only; audio quality requires human ear | Before TTS changes |
| **TC-065** | Service-Worker Update Detection (Timing) | SW update timing depends on real browser focus/visibility/hourly timer | After every GH Pages deploy |
| **TC-051** | Visual Theme Evaluation | Subjective readability/harmony of 12 variants (6 palettes × light/dark) | On theme token/palette changes |
| **TC-028** | Comic-Panel Drag Geometry | Pixel-perfect bubble positioning requires visual verification | On Comic-Editor/Panel-Layout changes |
| **TC-064** | Real Service-Worker Caches | Requires DevTools: SW unregister, clear site data, hard reload with cache disabled | On SW/deploy changes |

> **Run these manually** before each release that touches the relevant area.

---

## Recently Closed (v0.60.0 — 2026-08-15)

| ID | Title | Resolution |
|----|-------|------------|
| #715 | Data-dir migration boot crash-loop (empty target dir → RuntimeError, port never bound) | Fixed: removed eager import-time mkdir; ZIP plugins load from canonical data dir |
| #714 | i18n boot race: stray `de` response overwrote saved language catalog | Fixed: stale-response guard in i18n loader |
| #692 | Client-side picture-book PDF colour loss | Fixed: in-cap images embed original bytes; downscales composite on white |
| #697 | PWA version.json build artifact + SW/release update-banner dedup | Implemented |
| #700 | iOS-standalone "close and reopen" update hint | Implemented |
| #702 #705 #709 | docker-app-launcher ^0.12.1 → ^0.28.0 | Compose force-recreate, --update verb, --doctor, live logs, cancellable ops, system theme, translated failures |
| #686 #688 | Release orchestration: Makefile + Gitflow | `release-prepare`/`release-finish` targets + one-click workflow |
| #690 #693 #716 | TDD inner-loop + `make pre-commit` | Local dev targets added |
| #712 | Web-speech nightly E2E stub fix via `defineProperty` | Fixed |

---

## Cross-Reference: Adaptive-Learner Sync

| Area | Adaptive-Learner Status | Bibliogon Status | Action |
|------|------------------------|------------------|--------|
| **KeyVault (AI key export/import)** | Shipped v1.25.0+ (`@astrapi69/ai-key-vault-react`) | **P2-01 #908** — Implementation planned | Port packages + adapt |
| **Backup Compare UI** | Shipped v1.12.0 (client-side diff engine) | Shipped v0.53.0+ (backup compare) | Parity achieved |
| **Selective Export** | Shipped v1.12.0 | Shipped v0.53.0+ | Parity achieved |
| **Offline PWA (Dexie + SW)** | Shipped v0.7.0+ | Shipped v0.48.0+ | Parity achieved |
| **Visual Regression (Playwright)** | Shipped v1.15.0 (16 specs) | **P3-02** — Not yet | Implement |
| **Multi-browser E2E** | Chromium only (CI) | **P3-03** — Not yet | Implement |
| **i18n Native Translations** | v1.13.0: PT/TR/JA native (no EN-passthrough) | **P3-01** — Gaps remain | Translate suspicious keys |
| **Release Automation** | v1.24.1: 4-Tier model + `make release-*` | v0.60.0: Makefile targets + Gitflow | Parity achieved |
| **docker-app-launcher** | Not used (custom launcher) | v0.60.0: ^0.28.0 | Different approach |

---

## Statistics (as of 2026-09-27)

| Tier | Count |
|------|-------|
| P0 | 0 |
| P1 | 4 |
| P2 | 8 |
| P3 | 13 |
| P4 | 5 |
| P5 | 7 |
| BLOCKED | 3 |
| **Total Open** | **40** |

---

## How to Use This File

- **Daily planning**: Pull from P0 → P1 → P2 in order
- **Sprint planning**: Pick P2/P3 items matching phase theme
- **GH Issue hygiene**: Keep issue titles in sync with this table
- **Close workflow**: Move completed items to "Recently Closed" section with release tag
- **New items**: Add to appropriate tier with ID, GH issue #, and effort estimate
