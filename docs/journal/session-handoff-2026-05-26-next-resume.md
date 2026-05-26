# Session-Handoff: Next Session Resume (2026-05-26)

## Current State

- HEAD: `1205f74`
- Branch: `main`, parity with `origin/main`
- Working tree: clean
- Backend pytest: 2269 (baseline from v0.37.0 release; not re-run
  this session — only frontend touched)
- Frontend Vitest: 2063 (confirmed by full-suite run after each
  commit this session)
- i18n parity: 75/75 (51 pytest cases under
  `test_i18n_parity.py`; 75 reflects key-parity completeness)
- Playwright specs: 76 (under `e2e/`, excluding `node_modules`)
- Current version: v0.37.0 (released 2026-05-25)

## 2026-05-22 through 2026-05-26 Multi-Day Arc Recap

Highest-velocity multi-day arc in project history. Two releases
shipped (v0.36.0 + v0.37.0), Settings UX overhaul completed,
ungated backlog drained.

### 2026-05-22: Backlog Drain + KDP Wizard Phase 2

- KDP-PUBLISHING-WIZARD-01 Phase 1 (MVP 3-step wizard)
- KDP-PUBLISHING-WIZARD-01 Phase 2 + KDP-WIZARD-XSTATE-MIGRATION-01
  (full 5-step wizard with XState + persistence + conflict banner)
- AUTHOR-DATALIST-EXTEND-EDITORS-01 + AUTHOR-SELECT-INPUT-EXTRACT-01
- HOOKSPEC-DISPATCH-WIRING-01 (3 adjudicated dispositions)
- KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01
- PLUGIN-VERSION-GATING-ENABLE-01
- PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01
- PLUGIN-COMICS-MAKEFILE-INTEGRATION-01
- CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01
- MEDIUM-IMPORT-EXCERPT-AUTOFILL-01
- EDITOR-KEYBOARD-SHORTCUT-ALT-Z-01

### 2026-05-23: Quality + Accessibility

- ACCESSIBILITY-AUDIT-WCAG-AA-01 (7 commits, WCAG 2.1 AA)
- DANGER-ZONE-RESET-EVERYTHING-01 (5 commits)
- HOOKSPEC-EXPORT-EXECUTE-WIRE-01 (comic-book PDF dispatch)
- I18N-ARTICLES-NAMESPACE-CLEANUP-01
- EXPOSE-BUCHIDEE-METADATA-01

### 2026-05-24: Foundation + Half-Wired Closures

- COMIC-BOOK-EDITOR-METADATA-BUTTON-01 (Half-Wired-Visible-in-
  Production gap closed)
- BOOK-TYPES-SSOT-YAML-01 (`backend/config/book-types.yaml` +
  `BookTypeRegistry` + `/api/book-types` + `useBookTypes()` + 6
  consumer migrations)
- PAGES-DELETE-EDITOR-UI-01 (page-delete UI across both editor
  surfaces via shared `PageThumbnails onDelete`)
- WIZARD-SHELL-COMPONENT-EXTRACT-01 (RCU 2-site `WizardShell` +
  `WizardNav`; KDP + Convert wizards migrated)
- RECURRING-COMPONENT-AUDIT-01 (umbrella audit deliverable)
- v0.36.0 released (230 commits since v0.35.1)

### 2026-05-25: v0.37.0 Release + Post-Release Stream

- DASHBOARD-PAGINATION-LOAD-MORE-01 (8 commits, `usePagedList` +
  `PageSizeSelector`)
- BOOK-REPOSITORY-URL-FIELD-01 (5 commits, optional
  `Book.repository_url` + Alembic migration)
- EDITOR-DISPLAY-SETTINGS-01 (6 commits, per-device localStorage
  preferences via toolbar popover)
- COMMENTS-ADMIN-PAGINATION-01 (already-shipped; audit-finding
  stale at filing time)
- PLUGIN-COMICS-E2E-SMOKE-01
- v0.37.0 released (53 commits since v0.36.0)
- 8 Settings-page UX audit follow-ups filed
  (SETT-QW-1..7 + SETT-M-1 + SETT-M-3 + SETT-M-2 + SETT-M-4 +
  SETT-L-1 + SETT-L-2) + HELP-DOCS-V0.37.0-GAPS-01

### 2026-05-26: Settings UX Overhaul (this session)

- SETT-PHASE-1-QUICK-WINS-01 (9 commits) — sub-card grouping +
  SshKeySection own card + Editor tab extraction + sectionTitle
  standardisation + `HelpText` component + White-Label
  collapsible "Erweitert" section + `SectionHeader` composition
  component + per-section descriptions across 9 tabs in 8
  catalogs
- SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01 (5 commits) — Allgemein →
  Erscheinungsbild + Verhalten + Erweitert (with SshKeySection +
  White-Label uncollapsed). Tab count 12 → 14.
- SETT-PHASE-3-TOGGLE-COMPONENT-01 (4 commits) — shared
  `<Toggle>` composition component + 5-site migration
  (VerhaltenSettings 3 + AiAssistantSettings 1 +
  AudiobookSettingsPanel 1)
- SETT-AUTHORS-TAB-CONSOLIDATION-01 (2 commits, filed mid-session
  per user adjudication, no backlog round-trip) — Autor +
  Autoren-Datenbank merged into single Autoren tab.
  `LEGACY_TAB_REDIRECTS` map preserves `?tab=author` +
  `?tab=authors_database` deep-links. Tab count 14 → 13.

Multi-tool collaboration drift surfaced this session: a parallel-
agent Phase 2 spec arrived against pre-Phase-2 state (HEAD
`b62c698`) mid-Phase-3. Status-correction protocol identified
the author-consolidation as the only actionable delta. Working
as designed per the lessons-learned "Multi-tool collaboration
tracking" rule.

### Test Growth Across Arc

- Backend pytest: 2142 → 2269 (+127)
- Frontend Vitest: 1838 → 2063 (+225)

## Current Backlog State

- P0: 0
- P1: 0
- P2: 0
- P3: 24
- P4: 29
- P5: 9
- BLOCKED: 2
- Total active (P3..P5): 62 + 2 BLOCKED = 64 entries

## Closures (this multi-day arc, ~30 items)

Full per-day archive: `docs/archive/roadmap/2026-05.md`.

Notable trigger-gate overrides during this arc:
- ACCESSIBILITY-AUDIT-WCAG-AA-01 (user-adjudicated trigger
  override, shipped post-v0.36.0 instead of waiting for trigger)
- DANGER-ZONE-RESET-EVERYTHING-01 (filed and shipped same
  release cycle)
- SETT-AUTHORS-TAB-CONSOLIDATION-01 (filed and shipped same
  session, no backlog round-trip)

## Backlog Landscape

P0/P1/P2 empty. P3 (24 items) is fully trigger-gated. P4/P5 are
deferred future-phase items. Remaining categories:

- **RCU pre-registered** — waiting for Nth surface (e.g.
  `LIST-VIEW-ROW-SHARED-EXTRACTION-01`,
  `ARTICLEFILTERBAR-EXTRACT-01`)
- **User-complaint-triggered** — waiting for explicit user-pull
- **Upstream-blocked** — 2 items waiting on external triggers
  (npm publish / PyPI release / etc.)
- **Multi-session strategic scope** — Picture-Book + Comics
  stack, Story-Bible plugin, Writing-Goals tracking
- **Deferred explorations** — items adjudicated as P4/P5 from
  the exploration-features audit

### Settings UX deferred items (filed in v0.37.0 post-release)

- SETT-M-2 (per-tab subsection headers) — P4
- SETT-M-4 (Settings search) — P4
- SETT-L-1 (sidebar redesign) — P4 (trigger crossed at 14 tabs
  but deferred per filed rule)
- SETT-L-2 (full responsive + search) — P5

### Other P3 highlights worth surfacing

- `HELP-DOCS-V0.37.0-GAPS-01` (P3, DOCS): 4 help pages missing
  for v0.37.0 features (dashboard pagination, Alt+Z word-wrap,
  editor display settings, `Book.repository_url`). Per-language
  (DE + EN). Trigger: next session that touches help docs OR
  next release-cycle pre-release sweep.

## Next-Substantial-Session Candidates

All require user direction (no ungated items remain):

1. **Picture-Book & Comics Optimization stack**
   - `PICTURE-BOOK-STORYBOARD-VIEW-01` (P3, 10-15 commits)
   - `PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01` + sibling
     (P3, 10-13 commits)
   - `PICTURE-BOOK-TEXT-CONFIGURATION-01` (P3, 6-9 commits)
2. **Strategic new features**
   - `STORY-BIBLE-PLUGIN-01` (P3, multi-session, greenfield
     plugin)
   - `WRITING-GOALS-PROGRESS-TRACKING-01` (P3, 6-10 commits)
3. **Help-docs catch-up**
   - `HELP-DOCS-V0.37.0-GAPS-01` (P3, ~4-6 commits)
4. **Non-Bibliogon work**
   - adaptive-learner, PluginForge, creative projects, BFREI
5. **Override trigger-gates** on specific P3 items if user
   decides the gate criteria are overcautious

## Critical Constraints + Active Disciplines

Full ruleset: `.claude/rules/lessons-learned.md` (load-bearing
file; reference rather than duplicate). The rules most likely
to fire in next-session work:

- **Multi-tool collaboration tracking** — re-sync against
  current HEAD before accepting any spec from a parallel agent.
  Status-correction protocol when a spec is based on stale
  state. (Fired this session on the user-side Phase 2 spec.)
- **Pre-Coding-Reality-Check** — at every keystroke boundary:
  re-grep the immediate touch-surface for existing endpoints /
  callers / parallel surfaces / architectural assumptions
  before writing code.
- **Plain `git status` before every commit** — no
  path-filtered status. Read both staged + unstaged sections.
- **Explicit-paths-only staging** — never `git add -A` or
  `git add .` when any parallel-session work is in flight.
- **End-to-end behaviour tests, not kwarg-passes-through** —
  test the OBSERVABLE OUTPUT through the full component tree,
  not just the API write.
- **Recurring-Component Unification Rule** — 2-surface
  threshold for UI patterns; extract + migrate ALL sites in
  the same coordinated session.
- **Testid-namespace pinning** — positive E2E coverage walk;
  prefix selectors don't overmatch.
- **Articles-vs-Books parallel-surface asymmetry** — explicit
  parity verification for every feature touching list/editor
  surfaces.
- **Half-wired feature lifecycle** — state-write without
  state-consumer (OR inverse-mutation) is purgatory; file
  load-bearing backlog items, not docstring TODOs.
- **`@radix-ui/react-dropdown-menu` `onSelect` must NOT
  `preventDefault`** when the handler opens a dialog.
- **Module-level caches survive test boundaries** — third
  isolation layer; bidirectional `yield`-based autouse
  fixtures for `lru_cache`-decorated module functions.
- **Single-router-per-plugin convention** — one FastAPI
  router from `BasePlugin.get_routes()`, nest via
  `include_router`.
- **CRUD shipping: List endpoint is non-optional** — every
  `feat: N CRUD endpoints` commit must register all four
  verbs.

## Open Architecture-Decisions

None pending at session start. The four Settings UX work items
(Phase 1 + Phase 2 + Phase 3 + Authors-Consolidation) closed
this session resolve all settings-area design questions through
v0.37.0+.

## Files to Read (in order)

1. `docs/backlog.md` — 64 entries across P3/P4/P5/BLOCKED
2. `docs/journal/session-handoff-2026-05-26-next-resume.md` —
   this document
3. `docs/ROADMAP.md` — refreshed post-v0.37.0
4. `.claude/rules/lessons-learned.md` — load-bearing ruleset
5. `.claude/rules/coding-standards.md` — function design, RCU
   threshold, naming conventions
6. `backend/config/book-types.yaml` — BOOK-TYPES-SSOT, drives 6
   downstream consumers
7. `docs/archive/roadmap/2026-05.md` — full closure timeline
   for this multi-day arc

## Recommended Next Session Direction

User-Direction-Override always overrides. Backlog is fully
gated; no ungated items remain. Next work requires explicit
strategic direction from user. The session-prompt at
`docs/journal/session-prompt-2026-05-26-next-resume.md` codifies
the wait-for-direction protocol.
