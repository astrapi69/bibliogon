# Bibliogon Roadmap

Current phase: Phase 2 - build for real users, not just developers
Last updated: 2026-05-02
Latest release: v0.25.0
Open tasks: 6 active (P3..P5) + 4 BLOCKED-on-upstream
Archive: [docs/roadmap-archive/](roadmap-archive/)

Phase 1 (feature-complete single-user tool, v0.1.0 through v0.14.0)
is archived at
[docs/roadmap-archive/phase-1-complete.md](roadmap-archive/phase-1-complete.md).
The bulk of Phase 2 work (v0.15.0 through v0.25.0) is archived at
[docs/roadmap-archive/v0.25.0-cleanup-2026-05-02.md](roadmap-archive/v0.25.0-cleanup-2026-05-02.md).

This file lists ONLY open tasks. Tasks are sorted by priority tier
(P0 most urgent, P5 most speculative). BLOCKED-on-upstream items
sit in their own section between P5 and the archive link. Within
each tier, smaller-scope and unblocking items come first, with
alphabetical-by-ID as final tiebreaker.

---

## Current focus

All Phase 2 themes (Distribution, Templates, Polish, Git-based
backup, Donations, Core import orchestrator, plugin-git-sync,
Article authoring, the deferred dependency sweep) are complete. The
remaining open work is a small set of deferred-by-design items, a
passive validation track, and four upstream-blocked dependency
upgrades. See backlog for a curated daily-planning view.

---

## P0 - Deadline / Blocker / Security

(none)

---

## P1 - Architecture / Hygiene Debt

(none)

---

## P2 - High-Value User Features

(none)

---

## P3 - Infrastructure / Quality

- [ ] **AR-01 validation log**: capture real cross-posting workflow
  data in
  [docs/journal/article-workflow-observations.md](journal/article-workflow-observations.md)
  during normal publication work. Status 2026-05-02: 0 real entries
  (template fixture + section markers only). Reaching the 3-5-entry
  threshold reopens the AR-03+ readiness audit
  ([docs/audits/2026-05-02-ar-03-readiness.md](audits/2026-05-02-ar-03-readiness.md)).
  Long-running passive task; fills as the feature is used in anger.

- [ ] **PS-14+**: future polish items, surface as found.

---

## P4 - Roadmap / Future Phases

- [ ] **D-05**: Full Windows installer (downloads Docker Desktop +
  Bibliogon repo + generates `.env`, no terminal required at any
  step). Larger scope than D-01's launcher. Defer until user
  feedback shows the install (not the start) is the actual
  friction. See [docs/explorations/desktop-packaging.md](explorations/desktop-packaging.md)
  for context and triggers for reconsidering.

---

## P5 - Speculative / Nice-to-have

- [ ] **D-03a**: AppImage for Linux — deferred. The PyInstaller
  binary requires `python3-tk` on the target (preinstalled on
  every major desktop distro). AppImage would make that
  self-contained at a 4-10x size cost and added CI complexity
  (FUSE + appimagetool). Re-evaluate only when a user reports a
  missing-tkinter failure in the wild.

- [ ] **Phase 4 article-as-WBT git-sync**: article version control
  via plugin-git-sync, parallel to the book path. Deferred — only
  on user demand.

- [ ] **Phase 4 kinderbuch single-page article variant**: single-
  page layout for the kinderbuch use case. Deferred — only on
  user demand.

---

## Blocked / Upstream Wait

Items waiting on external triggers. Re-audit monthly via
`make check-blockers`. Do not attempt to advance these without an
unblock signal.

- [ ] **DEP-02**: TipTap 2 -> 3 migration.
  - Blocks on: upstream npm publish of
    `@sereneinserenade/tiptap-search-and-replace@0.2.0` (issue
    [#19](https://github.com/sereneinserenade/tiptap-search-and-replace/issues/19)).
  - Next re-audit: 2026-06-02.
  - Unblock condition: upstream publish OR explicit go-ahead to
    write the `prosemirror-search` adapter (~50-80 LOC) fallback.
  - Pre-audit: [docs/explorations/tiptap-3-migration.md](explorations/tiptap-3-migration.md).
    Estimated effort once unblocked: 4-8h code + 1-2h regression
    verification.
  - Knock-on: DEP-09 + SEC-01 chain on the same vite-plugin-pwa
    upstream.

- [ ] **DEP-05**: elevenlabs SDK 0.2 -> 2.x migration (complete SDK
  rewrite).
  - Blocks on: paid-API access for migration testing.
  - Next re-audit: when API budget is allocated.
  - Unblock condition: dedicated audiobook test session with a
    live ElevenLabs key.

- [ ] **DEP-09**: Vite 7 -> 8 (tracker: GH #6).
  - Blocks on: `vite-plugin-pwa` upstream peer-dep update.
    `1.2.0` still lists peer deps `vite: ^3 || ^4 || ^5 || ^6 ||
    ^7`; no Vite 8 PR visible on github.com/vite-pwa/vite-plugin-pwa.
    Vite latest observed: `8.0.10`.
  - Next re-audit: monthly via `npm view vite-plugin-pwa
    peerDependencies`. Last re-check: 2026-05-02 (no change).
  - Unblock condition: upstream releases Vite 8 compat. Do NOT
    force with `--legacy-peer-deps` (Vite 8 changed plugin APIs;
    PWA only exercised at `vite build` / SW regen, runtime break
    hard to detect).

- [ ] **SEC-01**: vite-plugin-pwa vulnerability chain.
  - Scope: 4 high-severity vulns in frontend devDependencies, all
    routed through `vite-plugin-pwa@1.2.0 -> workbox-build ->
    @rollup/plugin-terser -> serialize-javascript <=7.0.4`. CVEs:
    GHSA-5c6j-r48x-rmvq (RCE, CVSS 8.1) and GHSA-qj8w-gfj5-8c6v
    (DoS, CVSS 5.9). Production bundle audit: 0 vulns (dev-only
    exposure, not shipped to users).
  - Blocks on: same upstream as DEP-09.
  - Next re-audit: 2026-06-02 via `npm audit --audit-level=high`.
  - Unblock condition: upstream resolution. Triggers revisit:
    vite-plugin-pwa ships new release, any vuln reclassified as
    production, DEP-09 unblocks (forces migration).

---

## Article authoring (reference)

Architecture decision (formerly AR-02) resolved as Option B: a
separate `Article` entity alongside `Book`. Phase 1 + Phase 2
(Publications + drift detection) shipped; see the Phase 2 archive
entry. The exploration document at
[docs/explorations/article-authoring.md](explorations/article-authoring.md)
captures the decision history.

- Architecture exploration: [docs/explorations/article-authoring.md](explorations/article-authoring.md)
- Editor-parity audit: [docs/explorations/article-editor-parity.md](explorations/article-editor-parity.md)
- Validation log: [docs/journal/article-workflow-observations.md](journal/article-workflow-observations.md)
- AR-03+ readiness audit: [docs/audits/2026-05-02-ar-03-readiness.md](audits/2026-05-02-ar-03-readiness.md)
- UX conventions: [docs/ux-conventions.md](ux-conventions.md)
- Help docs: [docs/help/en/articles.md](help/en/articles.md), [docs/help/de/articles.md](help/de/articles.md)

The active AR-01 validation log is the only open AR task; it sits
in P3 above. Phase 4 article-as-WBT and Phase 4 kinderbuch
single-page variant are deferred-on-user-demand items in P5.

---

## Explorations (not yet committed)

See [docs/explorations/](explorations/) for future considerations:

- [Desktop packaging](explorations/desktop-packaging.md) — Simple Launcher first, Tauri as later option, no Electron.
- [Monetization strategy](explorations/monetization.md) — donations-first approach, deferred freemium.
- [Multi-user and SaaS](explorations/multi-user-saas.md) — long-term, not near-term.

---

## Archive

- **Phase 1** (v0.1.0 - v0.14.0): [docs/roadmap-archive/phase-1-complete.md](roadmap-archive/phase-1-complete.md). Includes the 2026-04-15 postscript on CF-01.
- **Phase 2 cleanup pass** (v0.15.0 - v0.25.0): [docs/roadmap-archive/v0.25.0-cleanup-2026-05-02.md](roadmap-archive/v0.25.0-cleanup-2026-05-02.md). 77 entries archived 2026-05-02. AR-03+ Platform APIs archived as obsolete in the same pass.
- **Backlog "Recently closed" prose**: [docs/roadmap-archive/backlog-recently-closed-2026-05-02.md](roadmap-archive/backlog-recently-closed-2026-05-02.md). Preserves commit hashes + closure notes for items shipped 2026-04-24..2026-05-02.
