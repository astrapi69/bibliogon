# Chat journal — 2026-05-27 — v0.39.0 release

Picture-Book authoring depth release cut. 49 commits since v0.38.0
across two coordinated multi-session arcs (Storyboard View +
Picture-Book Text-Stack) plus one closure-by-discovery + a
data-hygiene win + a comprehensive doc-sweep.

The release-cycle session itself was a 4-task housekeeping +
release-prep arc landing on top of the two prior multi-day arcs.

## Session shape

### Multi-day arcs (work already in main before today)

1. **PICTURE-BOOK-STORYBOARD-VIEW-01** (16 commits across 2
   sessions, 2026-05-26 and 2026-05-27): Page schema extended
   with 4 nullable Storyboard columns (notes / story_beat /
   mood_color / act_group). New `?view=storyboard` mount that
   renders a drag-reorder grid with per-page annotations
   (inline notes textarea, 6-value story-beat tag selector,
   10-preset mood-color palette, free-text act-group label).
   Click-to-navigate jumps to the regular page editor. Drag
   uses the existing `/api/books/{id}/pages/reorder` endpoint
   with stale-client detection. 3 P5 follow-ups filed
   (OPERATIONS / MOOD-FREE-PICKER / DRAG-CROSS-GROUP-ACT-UPDATE).

2. **PICTURE-BOOK-TEXT-STACK** (18 commits across 2 sessions
   2026-05-27 morning + afternoon): closes 3 backlog items —
   PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01 +
   PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01 +
   PICTURE-BOOK-TEXT-CONFIGURATION-01.
   - Fix B per-layout namespace for `Page.layout_config`:
     each layout's config nests under its layout name; no more
     null-purge on switch. Legacy flat configs auto-migrate
     on next write. Supersedes Fix A (v0.33.1).
   - Tier 1 + Tier 2 sections (8 Visual-Style + 6 Typography
     fields) added to image_top_text_bottom, image_left_text_right,
     image_full_text_overlay.
   - Overlay-specific width + height sliders.
   - Shared style helper `computeTierTextStyles` (TS + Python
     mirror `_compute_tier_text_style`) — RCU 3-surface
     extraction.

3. **HELP-DOCS-V0.37.0-GAPS-01** (3 commits 2026-05-26 +
   1 commit 2026-05-27): 6 new help-doc topic pairs
   (DE + EN = 12 Markdown pages) covering settings/sidebar,
   editor/display-settings, editor/word-wrap, books/repository-
   url, dashboard/pagination, dashboard/trash-and-restore.
   5 Playwright-generated screenshots in the default theme.
   New manual-only `screenshots` Playwright project.

### Today's release-cycle arc (2026-05-27 morning + afternoon)

After two prior session-handovers landed (`d39b651`) that
proposed CC's next work as Comics or Speech-Bubble-Tail items,
both turned out to be already-archived. The user adjudicated
a backlog re-sync pass: I scanned the actual P3 inventory
(17 items) and recommended a "smallest-actionable" sequence.

The user then directed a 4-task housekeeping + release arc:

1. **Task 1**: close SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01
   as a stale filing — the Option B "split Allgemein into
   multiple top-level tabs" scope had already shipped under
   SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01 in v0.38.0. Backlog
   entry removed + archive entry filed. Commit `096822f`.

2. **CI red-fix** (mid-arc): release-test surfaced 2 pre-commit
   hook failures inherited from earlier commits.
   `notify.error` 2-arg-required failure at
   `Storyboard.tsx:186` (single-arg call) + trailing-whitespace
   strip in an audit doc. Fix added `ui.storyboard.save_failed`
   key across all 8 i18n catalogs + flipped the call shape.
   Commit `fe0e84a`.

3. **Task 2**: ship
   PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01 (P3 trigger-
   gated; trigger interpreted as user-authorization to ship
   as smallest-scope P3 win). Active text-conversion on
   layout switch FROM a TipTap layout TO a Tier-Property
   layout: PATCH carries extracted plain-text alongside the
   layout flip. Symmetric direction needs no conversion
   (parseTextContentToJson wraps on read). Defensive
   extractPlainText read stays in place as belt-and-braces.
   Commit `5d87560` + paired close-out `281f7d9`.

4. **Task 3**: move 3 P5-bodied items from the P3 section to
   the P5 section. Mis-location was a filing-time oversight
   from the same-day storyboard close-out: filer didn't
   navigate to the P5 section before insertion. Bodies +
   triggers unchanged. Commit `177d174`.

5. **Task 3.5**: comprehensive 3-commit doc bundle.
   - **C1** (`bd8de7e`): README + README-de feature
     expansion (8 new bullets each) + 3 new top-level
     sections (Picture Book Authoring + Comic Book Authoring +
     KDP Publishing Wizard) + plugin-table gap fix
     (`comics` + `medium-import` rows). CLAUDE.md data-model
     expanded (Page / ComicPanel / ComicBubble /
     BookPublishingState were missing). CONTRIBUTING.md
     PluginForge bump `^0.5.0 → ^0.10.0`.
   - **C2** (`4f3d43e`): Help-doc cross-link layer. Added
     "Verwandte Themen" / "Related" sections to 5 page
     pairs (DE + EN = 10 files): storyboard ↔ text-
     configuration ↔ display-settings ↔ sidebar ↔
     pagination ↔ trash-and-restore. Updated
     `text-configuration.md` to reflect the LAYOUT-SWITCH-
     TEXT-CONVERSION ship (moved from "Deferred" to
     "Covered this release").
   - **C3** (`356cc99`): ROADMAP refresh — Last-Updated
     line + backlog-count + removed PICTURE-BOOK-LAYOUT-
     SWITCH-TEXT-CONVERSION-01 + SETTINGS-ALLGEMEIN-TAB-
     REORGANIZATION-01 entries (both closed in this arc).

6. **Task 4 — v0.39.0 release** (commit `ec91f38`, tag
   `v0.39.0`):
   - `make release-test`: green (pytest 2294 passed, 1
     skipped; ruff + mypy + pre-commit + verify-docs-
     discipline + verify-plugin-locks + launcher
     PyInstaller build smoke all green).
   - Frontend Vitest: 2190 passed (verified via direct run).
   - i18n parity: 75 passed.
   - Plugin counts verified: export 321 / audiobook 98 /
     medium-import 104 / ms-tools 97 / kdp 43 / translation 35
     / help 30 / git-sync 23 / comics 19 / getstarted 13 /
     grammar 10 / kinderbuch 8.
   - `make sync-versions`: 18 files propagated from
     `backend/pyproject.toml`.
   - `make release-tag VERSION=0.39.0`: pre-push pre-commit
     clean, tag pushed.
   - `make release-publish VERSION=0.39.0`: GitHub Release
     published.

## Multi-Tool-Coordination drift moments

Two consecutive prompt-collisions with archived work this session:

1. First prompt asked for PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01
   + PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01 — both archived
   2026-05-20.
2. Second prompt asked for
   PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 — archived
   2026-05-20 (Path A1 architectural relocation of pages
   router from plugin-kinderbuch to backend core).

The user acknowledged the parallel-planning-session was
working from stale backlog state, then adjudicated a
re-sync pass. Per the "Multi-tool collaboration tracking:
re-sync before accepting new orders" lessons-learned rule,
the executor must verify against fresh repo state regardless
of the parallel-planning agent's instruction confidence.

## Test count totals

- Backend pytest: 2294 passed, 1 skipped (was 2269 at
  v0.38.0; +25)
- Frontend Vitest: 2190 passed (was 2080; +110, including
  +4 today from PageEditor layout-switch pins)
- i18n parity: 75/75 across all 8 catalogs
- Plugin pytest aggregate: 804 (was 731 at v0.38.0; +53
  from export's picture-book text-stack work + 1 from kdp;
  everything else unchanged)

## What's deferred (P3 inventory after this arc)

P3 = 17 items after today's 2 closures + 3 P5 moves (the
section started at 22 entries; 19 actual P3 + 3 P5-mis-
located). None of the remaining 17 are trigger-fired right
now; all wait
on either user-pull signal or RCU 2nd-surface trigger or
quarterly-schedule trigger:

- BOOK-TYPE-CARD-COMPONENT-EXTRACT-01 (RCU 2nd-surface)
- KDP-WIZARD-RESUME-AT-STEP-01 (user feedback)
- MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01 (real
  user-pull)
- MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01
  (single-agent breakdown signal)
- WRITING-GOALS-PROGRESS-TRACKING-01 (daily-writing-habit
  signal)
- REMINDER-PANEL-GENERIC-EXTRACTION-01 (2nd reminder
  feature)
- PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01 (user request)
- PICTURE-BOOK-PDF-FRONT-MATTER-01 (user request OR
  2nd-book imprint)
- PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01 (user feedback OR
  first KDP picture-book upload)
- LIST-VIEW-ROW-SHARED-EXTRACTION-01 (3rd duplicate)
- CONVERT-TO-BOOK-ASSET-CLONE-01 (broken-image report)
- PGS-05-FU-01 (partial-failure UX report)
- PLUGIN-COMICS-SESSION-3-EXTENDED-FEATURES-01
  (Phase 1+2 prereqs + user-report on missing affordance)
- MEDIUM-IMPORT-V2-02 (manual-tagging visible bottleneck)
- STORY-BIBLE-PLUGIN-01 (dedicated session when fiction
  cognitive cost surfaces)
- GH-ACTIONS-PERIODIC-AUDIT-01 (next due 2026-08-14)
- MEDIUM-COMMENT-MANUAL-ENTRY-01 (user demand)

## Patterns reinforced

- **Pre-Coding-Reality-Check at keystroke time**: the second
  prompt-collision was caught by a Pre-Coding grep before any
  code was written. The audit-first discipline scales to
  cover stale-prompt input.
- **Atomic-per-commit-delta**: 9 commits in this session
  (excluding 6 commits inherited from prior arcs); each
  shipped green individually. CI-red-fix was atomic + isolated
  from Task 2's feature commit so neither carried the other's
  rationale.
- **Numeric-claims-verification**: per-release notes test
  counts were drafted with provisional numbers, then verified
  via direct `pytest --collect-only` + `vitest run` before
  publishing.
- **Half-Wired-Feature-Lifecycle (Frontend variant)**: the
  active-text-conversion fix closes a half-wired write-path
  that had relied entirely on the defensive read.
- **Explicit-paths-only staging**: every `git add` named files
  individually. No `git add -A`.

## Stats

- Commits this session: 9 (`096822f` Task 1 close, `fe0e84a`
  CI fix, `5d87560` Task 2 feature, `281f7d9` Task 2 close-
  out, `177d174` Task 3 P5 moves, `bd8de7e` C1 README+,
  `4f3d43e` C2 help cross-links, `356cc99` C3 ROADMAP,
  `ec91f38` v0.39.0 release commit).
- Commits since v0.38.0 (entire release window): 49.
- Backlog state after release: P0=P1=P2=0; P3=17; P4=28;
  P5=12; Total active 57 + 2 BLOCKED.
