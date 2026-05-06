# Bibliogon Roadmap

Current phase: Phase 2 - build for real users, not just developers
Last updated: 2026-05-06
Latest release: v0.28.0 (bulk export from Books dashboard; cross-platform installer scripts install.command + install.ps1 + install.cmd; full launcher i18n extraction; BIBLIOGON_DB_PATH precedence flip step 2; DEP-09 + SEC-01 unblocked upstream)
Open tasks: 5 active (P3..P5) + 2 BLOCKED-on-upstream
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
  during normal publication work. Status 2026-05-06: 0 real
  entries (template fixture + section markers only). The AR-03+
  committed milestones depend on reaching the 3-5-entry
  threshold first, which reopens the readiness audit
  ([docs/audits/2026-05-02-ar-03-readiness.md](audits/2026-05-02-ar-03-readiness.md)).
  Long-running passive task; fills as the feature is used in anger.

- [ ] **PS-14+**: future polish items, surface as found.

---

## P4 - Roadmap / Future Phases

(D-05 closed as won't-fix 2026-05-05; see
[docs/roadmap-archive/2026-05.md](roadmap-archive/2026-05.md).
Docker EULA forbids third-party silent install per the
installer discovery report.)

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
  - Default unblock path: upstream npm publish.
  - Alternative unblock path (path B): explicit user go-ahead to
    write the `prosemirror-search` adapter fallback (~50-80 LOC).
    Available on demand; default is wait for the npm publish.
  - Pre-audit: [docs/explorations/tiptap-3-migration.md](explorations/tiptap-3-migration.md).
    Estimated effort once unblocked: 4-8h code + 1-2h regression
    verification.

- [ ] **DEP-05**: elevenlabs SDK 0.2.27 -> 2.45.0 migration
  (complete SDK rewrite; substantial version jump that requires a
  careful audit when scheduled).
  - Blocks on: paid-API access for migration testing.
  - Next re-audit: when API budget is allocated.
  - Unblock condition: dedicated audiobook test session with a
    live ElevenLabs key. Plan a focused session, not a side
    bump - the 0.2 -> 2.x rewrite is too large to fold into a
    routine sweep.

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
