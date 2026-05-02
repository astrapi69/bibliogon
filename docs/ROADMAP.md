# Bibliogon Roadmap

Current phase: Phase 2 - build for real users, not just developers
Last updated: 2026-05-02
Latest release: v0.25.0
Open tasks: 9 (4 BLOCKED on upstream)
Archive: [docs/roadmap-archive/](roadmap-archive/)

Phase 1 (feature-complete single-user tool, v0.1.0 through v0.14.0)
is archived at
[docs/roadmap-archive/phase-1-complete.md](roadmap-archive/phase-1-complete.md).
The bulk of Phase 2 work (v0.15.0 through v0.25.0) is archived at
[docs/roadmap-archive/v0.25.0-cleanup-2026-05-02.md](roadmap-archive/v0.25.0-cleanup-2026-05-02.md).

This file lists ONLY open tasks. Closed tasks live in the archive
files above. Re-opening a closed task creates a new ID; do not
revive old IDs in the active list.

---

## Current focus

All Phase 2 themes (Distribution, Templates, Polish, Git-based
backup, Donations, Core import orchestrator, plugin-git-sync,
Article authoring, the deferred dependency sweep) are complete. The
remaining open work is a small set of deferred-by-design items, a
passive validation track, and four upstream-blocked dependency
upgrades. See backlog for a curated daily-planning view.

---

## Themes for Phase 2

### 1. Distribution and packaging

- [ ] **D-03a**: AppImage for Linux — deferred. The PyInstaller
  binary requires `python3-tk` on the target (preinstalled on
  every major desktop distro). AppImage would make that
  self-contained at a 4-10x size cost and added CI complexity
  (FUSE + appimagetool). Re-evaluate only when a user reports a
  missing-tkinter failure in the wild.
- [ ] **D-05**: Full Windows installer (downloads Docker Desktop +
  Bibliogon repo + generates `.env`, no terminal required at any
  step). Larger scope than D-01's launcher. Defer until user
  feedback shows the install (not the start) is the actual
  friction. See [docs/explorations/desktop-packaging.md](explorations/desktop-packaging.md)
  for context and triggers for reconsidering.

### 2. Polish and stability

- [ ] **PS-14+**: future polish items, surface as found.

---

## Article authoring

Architecture decision (formerly AR-02) resolved as Option B: a
separate `Article` entity alongside `Book`, with article-specific
routes, sidebar, and editor that share the underlying TipTap
RichTextEditor and selected plugins (export, ms-tools, translation).
Phase 1 + Phase 2 (Publications + drift detection) shipped; see
the Phase 2 archive entry. The exploration document at
[docs/explorations/article-authoring.md](explorations/article-authoring.md)
captures the decision history.

### Open

- [ ] **AR-01 validation log**: capture real cross-posting workflow
  data in
  [docs/journal/article-workflow-observations.md](journal/article-workflow-observations.md)
  during normal publication work. Status 2026-05-02: 0 real entries
  (template fixture + section markers only). Reaching the 3-5-entry
  threshold reopens the AR-03+ readiness audit
  ([docs/audits/2026-05-02-ar-03-readiness.md](audits/2026-05-02-ar-03-readiness.md)).
  Long-running passive task; fills as the feature is used in anger.

### Deferred (only on user demand)

- [ ] **Phase 4 article-as-WBT git-sync**: article version control
  via plugin-git-sync, parallel to the book path. Deferred — only
  on user demand.
- [ ] **Phase 4 kinderbuch single-page article variant**: single-
  page layout for the kinderbuch use case. Deferred — only on user
  demand.

### Reference

- Architecture exploration: [docs/explorations/article-authoring.md](explorations/article-authoring.md)
- Editor-parity audit: [docs/explorations/article-editor-parity.md](explorations/article-editor-parity.md)
- Validation log: [docs/journal/article-workflow-observations.md](journal/article-workflow-observations.md)
- AR-03+ readiness audit: [docs/audits/2026-05-02-ar-03-readiness.md](audits/2026-05-02-ar-03-readiness.md)
- UX conventions: [docs/ux-conventions.md](ux-conventions.md)
- Help docs: [docs/help/en/articles.md](help/en/articles.md), [docs/help/de/articles.md](help/de/articles.md)

---

## Maintenance and tech debt

### Security tracking

- [ ] **SEC-01: BLOCKED.** vite-plugin-pwa vulnerability chain. 4
  high-severity vulns in frontend devDependencies, all routed
  through `vite-plugin-pwa@1.2.0 -> workbox-build ->
  @rollup/plugin-terser -> serialize-javascript <=7.0.4`. CVEs:
  GHSA-5c6j-r48x-rmvq (RCE, CVSS 8.1) and GHSA-qj8w-gfj5-8c6v (DoS,
  CVSS 5.9). Production bundle audit: 0 vulns (dev-only exposure,
  not shipped to users). `npm audit fix` cannot resolve
  non-breaking; `--force` downgrades vite-plugin-pwa 1.2.0 ->
  0.19.8 (SemVer major). Resolution path: wait for upstream patch;
  re-audit monthly via `npm audit --audit-level=high`. Triggers
  revisit: vite-plugin-pwa ships new release, any vuln reclassified
  as production, DEP-09 Vite 8 unblocks (forces migration). Same
  upstream blocker as DEP-09.

### Deferred major dependency upgrades

Each gets a dedicated session with its own testing cycle. Not
urgent, but tracked so they don't get forgotten. See
`lessons-learned.md` "Dependency currency" for the rules.

- [ ] **DEP-02: BLOCKED.** TipTap 2 -> 3 migration. Status:
  pre-audit complete, blocked on upstream release. Single hard
  blocker: `@sereneinserenade/tiptap-search-and-replace` v0.2.0 is
  merged on `main` (dual peer `^2.0.0 || ^3.0.0`) but not yet
  published to npm. Upstream issue requesting publish:
  [sereneinserenade/tiptap-search-and-replace#19](https://github.com/sereneinserenade/tiptap-search-and-replace/issues/19).
  License verified MIT (repo LICENSE file; npm's "Proprietary"
  label was stale metadata from 2024). Community bumps forced:
  `@pentestpad/tiptap-extension-figure` 1.0.12 -> 1.1.0,
  `tiptap-footnotes` 2.0.4 -> 3.0.1. Fallback (`prosemirror-search`
  adapter, ~50-80 LOC) gated on explicit user go-ahead. Pre-audit:
  [docs/explorations/tiptap-3-migration.md](explorations/tiptap-3-migration.md).
  Estimated effort once unblocked: 4-8h code + 1-2h regression
  verification.
- [ ] **DEP-05: BLOCKED.** elevenlabs SDK 0.2 -> 2.x migration
  (complete SDK rewrite, needs real paid-API testing). Schedule
  with a dedicated audiobook test session and a live ElevenLabs
  key.
- [ ] **DEP-09: BLOCKED.** Vite 7 -> 8 (tracker: #6). Blocked on
  `vite-plugin-pwa` upstream: `1.2.0` still lists peer deps
  `vite: ^3.1.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`; no
  Vite 8 PR visible on github.com/vite-pwa/vite-plugin-pwa. Vite
  latest observed: `8.0.10`. Do NOT force with
  `--legacy-peer-deps`: Vite 8 changed plugin APIs, and PWA is
  only exercised at `vite build` / SW regen, so a runtime break
  there is hard to detect. Re-check
  `npm view vite-plugin-pwa peerDependencies` every ~2 weeks or
  after a new release is cut. Last re-check: 2026-05-02 (no
  change).

---

## Explorations (not yet committed)

See [docs/explorations/](explorations/) for future considerations:

- [Desktop packaging](explorations/desktop-packaging.md) — Simple Launcher first, Tauri as later option, no Electron.
- [Monetization strategy](explorations/monetization.md) — donations-first approach, deferred freemium.
- [Multi-user and SaaS](explorations/multi-user-saas.md) — long-term, not near-term.

---

## Archive

- **Phase 1** (v0.1.0 - v0.14.0): [docs/roadmap-archive/phase-1-complete.md](roadmap-archive/phase-1-complete.md). Includes the 2026-04-15 postscript on CF-01.
- **Phase 2 cleanup pass** (v0.15.0 - v0.25.0): [docs/roadmap-archive/v0.25.0-cleanup-2026-05-02.md](roadmap-archive/v0.25.0-cleanup-2026-05-02.md). 74 ROADMAP entries + 3 backlog sub-entries archived 2026-05-02. AR-03+ Platform APIs archived as obsolete in the same pass.
- **Backlog "Recently closed" prose**: [docs/roadmap-archive/backlog-recently-closed-2026-05-02.md](roadmap-archive/backlog-recently-closed-2026-05-02.md). Preserves commit hashes + closure notes for items shipped 2026-04-24..2026-05-02.
