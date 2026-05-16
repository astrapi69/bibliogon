# Bibliogon Roadmap

Current phase: Phase 2 - build for real users, not just developers
Last updated: 2026-05-07 (v0.30.0 cut)
Latest release: v0.30.0 (launcher localized in 8 languages with full parity-test enforcement; DEP-DBPATH-01 cycle closes — BIBLIOGON_DB_PATH no longer honoured as a path override, warning-only on lingering env var; 5 new bilingual core help pages — books bulk-export, cross-platform installers, architecture, contributing, deployment, API reference; plugin dev guide refreshed for Vite 8 + Node 24; pre-release dependency sweep with fastapi 0.135 → 0.136 lock-step + in-range patches across all subsystems).
Open tasks: 1 P2 (PB-PHASE4) + 3 active (P3..P5) + 2 BLOCKED-on-upstream + 1 P5 (LAUNCHER-I18N-NATIVE-REVIEW-01, public call-for-reviewers at [#18](https://github.com/astrapi69/bibliogon/issues/18))
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

- [ ] **PB-PHASE4**: Picture-Book plugin (kinderbuch) — Sessions
  2-7 per the exploration. Promoted from P5 on 2026-05-16 after
  user direct ask (Aster authoring a new picture book is a valid
  go-signal per the exploration's "Triggers for reconsidering"
  list). Comic-book support is a separate future plugin
  (`plugin-comics`), not a continuation of this phase.
  - Architecture: [docs/explorations/children-book-plugin.md](explorations/children-book-plugin.md)
  - Readiness audit: [docs/audits/kinderbuch-phase4-readiness-2026-05-16.md](audits/kinderbuch-phase4-readiness-2026-05-16.md)
  - Schema discriminator pattern (flat, one column):
    - `Book.book_type ∈ {prose, picture_book, comic_book}`.
      `picture_book` is v1 active in `plugin-kinderbuch`.
      `comic_book` is reserved at the schema layer so a future
      `plugin-comics` can ship its own `panels` and
      `speech_bubbles` migration without re-migrating
      `book_type`.
  - Session status:
    - [x] Session 1 — Architecture exploration (delivered via
      existing plugin v1.0.0 + the exploration doc).
    - [x] Session 2 — Backend data model: `Book.book_type` column
      + `pages` table + Pydantic schemas + Pages CRUD routes +
      tests + books PATCH immutability guard. Shipped 2026-05-16.
    - [ ] Session 3 — Frontend page-based editor (three-pane
      layout, layout picker, drag-reorder, inline image upload).
      Mandatory go/no-go after Aster authors a 4-page test book.
    - [ ] Session 4 — Speech-bubble layout (Layout A) + Playwright
      Chromium PDF export pipeline.
    - [ ] Session 5 — Image-top-text-bottom layout (Layout B) +
      KDP page-count validation + AI-disclosure badge.
    - [ ] Session 6 — EPUB3 Fixed-Layout export + epubcheck.
    - [ ] Session 7 — Polish + onboarding (new-children-book
      starter template, in-app help, builtin BookTemplate).
  - Plugin separation: `bibliogon-plugin-kinderbuch` owns
    `picture_book` exclusively. A separate
    `bibliogon-plugin-comics` will own `comic_book` once
    user-demand triggers the work (see backlog
    `COMIC-BOOK-PLUGIN-01`).
  - Out of scope for v1: convert prose <-> picture_book,
    user-uploaded bubble graphics, two-page spreads, AI-generated
    illustrations.

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

(PB-PHASE4 promoted to P2 on 2026-05-16 — Picture-Book plugin,
Sessions 2-7 — replacing the narrower "kinderbuch single-page
article variant" entry that previously sat here. Comic-Book
support is a separate future plugin track, not part of
PB-PHASE4.)

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
in P3 above. Phase 4 article-as-WBT is a deferred-on-user-demand
item in P5; the picture-book work has been promoted to P2 as
PB-PHASE4 (Picture-Book plugin scope; Comic-Book is filed
separately in the backlog).

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
