# Bibliogon Roadmap

Current phase: Phase 2 - build for real users, not just developers
Last updated: 2026-05-22 (PB-PHASE4 P2 block resolved across Sessions 3-7)
Latest release: v0.35.1 (Fast-follow patch for v0.35.0 donation-visibility gap; see CLAUDE.md for the per-release headline.)
Open tasks: 0 P2 + 2 active (P3) + 2 active (P5) + 2 BLOCKED-on-upstream + 1 P5 LAUNCHER-I18N-NATIVE-REVIEW-01 (call-for-reviewers at [#18](https://github.com/astrapi69/bibliogon/issues/18)).
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

(none — PB-PHASE4 fully resolved 2026-05-22; see closed block
below + the deferred-sub-parts note.)

### PB-PHASE4 — Picture-Book plugin (CLOSED 2026-05-22)

All 7 sub-sessions resolved. Block kept here as a one-time
audit trail for the 2026-05-22 re-sync; future PB work files
as separate backlog items. Move to archive on the next
ROADMAP cleanup pass.

- Architecture: [docs/explorations/children-book-plugin.md](explorations/children-book-plugin.md)
- Readiness audit: [docs/audits/kinderbuch-phase4-readiness-2026-05-16.md](audits/kinderbuch-phase4-readiness-2026-05-16.md)
- Schema discriminator pattern (`Book.book_type ∈ {prose,
  picture_book, comic_book}`) — `picture_book` active in
  plugin-kinderbuch; `comic_book` active in plugin-comics
  (separate ship, not part of PB-PHASE4).

Session status:

- [x] Session 1 — Architecture exploration (delivered via
  existing plugin v1.0.0 + the exploration doc).
- [x] Session 2 — Backend data model: `Book.book_type` column
  + `pages` table + Pydantic schemas + Pages CRUD routes +
  tests + books PATCH immutability guard. Shipped 2026-05-16.
- [x] Session 3 — Frontend page-based editor (three-pane
  layout, layout picker, drag-reorder, inline image upload).
  Shipped 2026-05-17 across the original Session 3 cluster.
- [x] Session 4 — Speech-bubble layout (Layout A) + 3
  image-based LayoutConfig bodies. Shipped 2026-05-17
  through 2026-05-18 across "Session 4", "Session 4b/4c",
  and "Session 4c-A/B-1/B-2" clusters (12+ commits;
  speech-bubble anchor presets + opacity + size sliders +
  image-based layouts + per-layout layout_config + Fix C
  defensive plain-text extraction). The original
  description's "Playwright Chromium PDF export pipeline"
  shipped instead under Session 6 (PDF export via
  WeasyPrint).
- [x] Session 5 — `book_type`-aware tab filtering +
  metadata-tab access from PageEditor. Shipped 2026-05-17
  across "Session 5 Commits 1-4" cluster. The original
  description's "KDP page-count validation + AI-disclosure
  badge" sub-parts did NOT ship under this label and are
  deferred (see "Deferred sub-parts" below).
- [x] Session 6 — Picture-book PDF export (WeasyPrint
  8.5×8.5 KDP-ready + PDF metadata embedding + 5 OFL fonts
  bundled + Export-PDF buttons in PageEditor + Design tab).
  Shipped 2026-05-17 through 2026-05-19 across 8 "Session
  6" commits + 2 follow-up sessions (PDF-KDP-FORMATS-01,
  PDF-BLEED-MARKS-01). The original description's "EPUB3
  Fixed-Layout export + epubcheck" did NOT ship under this
  label and is deferred (see "Deferred sub-parts" below).
- [x] Session 7 — Polish + onboarding (new-children-book
  starter template, in-app help, builtin sample books).
  Shipped 2026-05-21 via GETSTARTED-MULTIBOOK-TYPES-UPDATE-01
  (commit chain `75f2ef6..012396a`): 3-book-type picker on
  the GetStarted page + sample_books backend rewrite for
  3 types + frontend pages-branch + i18n + Vitest +
  Playwright.

### Deferred sub-parts (NOT shipped, NOT yet filed in backlog)

Three sub-parts of the original PB-PHASE4 ROADMAP scope are
genuinely deferred. Each needs a load-bearing backlog item
filed before it becomes trackable work; currently they exist
only as prose under the closed Session 5 + 6 entries above.
Filing decision deferred to the next session.

- **PICTURE-BOOK-EPUB3-FIXED-LAYOUT-EXPORT-01** (P4 candidate):
  EPUB3 Fixed-Layout export + epubcheck for picture-books.
  PDF export ships today via WeasyPrint; EPUB3 is the next
  format target. epubcheck is already wired for chapter
  EPUB exports (see plugin-export/pandoc_runner.py); a
  picture-book EPUB3 path would reuse the validator. Trigger:
  user requests EPUB output OR KDP picture-book EPUB
  becomes a competitive necessity.
- **PICTURE-BOOK-KDP-PAGE-COUNT-VALIDATION-01** (P3 candidate):
  validate the picture-book's page count against KDP's
  minimum (24) and maximum (300) limits at metadata-save
  time. Trigger: first user attempt to upload a picture-book
  to KDP that fails the page-count check, OR
  PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01 (already in backlog)
  expands to include page-count gating.
- **PICTURE-BOOK-AI-DISCLOSURE-BADGE-01** (P3 candidate):
  KDP-required AI-disclosure metadata for picture-books
  whose pages were AI-generated (illustrations + text). A
  per-book toggle + KDP-package-export field. Trigger: user
  requests AI-disclosure surface for KDP compliance, OR
  Amazon's AI-disclosure policy expands to enforce on every
  upload.

Plugin separation: `bibliogon-plugin-kinderbuch` owns
`picture_book`; `bibliogon-plugin-comics` owns `comic_book`
(separate ship). Out of scope for v1: convert prose ↔
picture_book; user-uploaded bubble graphics; two-page
spreads; AI-generated illustrations.

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
- Editor-parity audit: [docs/explorations/archive/article-editor-parity.md](explorations/archive/article-editor-parity.md)
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
