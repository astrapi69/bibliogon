# Chat journal — 2026-05-25 — v0.37.0 release

Single-session release cut covering the v0.36.0 → v0.37.0 work
plus the v0.37.0 release process itself plus a Settings-page UX
audit conducted mid-release-cycle (pre-tag).

## Session shape

1. **DASHBOARD-PAGINATION-LOAD-MORE-01** (8 commits) — Book +
   Article dashboards now paginate via "Mehr laden" button +
   10/25/50/100 page-size dropdown. New `usePagedList(scope)`
   hook + `<PageSizeSelector>` component. Backend `limit` query
   param + enum validation for `ui.dashboard.{books,articles}_page_size`.
2. **Stale-backlog walk** — BOOK-TYPE-CARD-COMPONENT-EXTRACT-01 +
   KDP-WIZARD-RESUME-AT-STEP-01 audited as trigger-NOT-MET
   (annotation-only). COMMENTS-ADMIN-PAGINATION-01 closed as
   already-shipped (audit-finding stale at filing time; fix
   predates the audit by 3 days).
3. **Housekeeping sweep** — CLAUDE.md + README + CONTRIBUTING +
   CONCEPT.md version refs corrected; 3 stale journal handover
   notes archived; smoke-tests README dead link fixed.
4. **docs/archive/ restructure** — `docs/roadmap-archive/` →
   `docs/archive/roadmap/` with 15 live-file cross-ref updates.
5. **ROADMAP refresh** — thematic overview replaces per-phase
   journal structure; previous version archived as
   `ROADMAP-v0.36.0.md`.
6. **BOOK-REPOSITORY-URL-FIELD-01** (5 commits) — additive
   nullable `Book.repository_url` String(2000) + Alembic
   migration + BookMetadataEditor General-tab field with
   git-sync read-precedence (mapping wins when present; free
   input otherwise). Architectural path α adjudicated over β
   (relax GitSyncMapping NOT NULL constraints) + γ (surface-
   only, no manual entry).
7. **EDITOR-DISPLAY-SETTINGS-01** (6 commits) — per-device
   localStorage preferences (width / font / size / line-height)
   via toolbar popover in shared Editor.tsx. Architectural
   path α (localStorage per-device) adjudicated over β (app.yaml
   per-account); width preference is device-dependent so
   per-device matches the use case.
8. **v0.37.0 release process** (release-workflow.md):
   - Step 1-3: state verify + full test sweep + tsc + ruff +
     mypy + pre-commit + verify-docs-discipline +
     verify-plugin-locks + launcher PyInstaller build smoke.
     One ruff-format release-prep commit caught during the
     Step-5 mandatory sweep.
   - Step 3.5 pause: Settings-page UX audit conducted at user
     direction. Read-only investigation; produced inline
     findings + ranked proposal across 4 audit steps.
   - User adjudication on Settings audit: post-v0.37.0 ship
     sequence (Phase 1 Quick-Wins → Phase 2 Allgemein split →
     Phase 3 Shared Toggle component) + 4 defer-and-file
     items (M-2 / M-4 / L-1 / L-2).
   - Step 3.7: CHANGELOG.md v0.37.0 entry + per-release notes
     at `changelog/releases/v0.37.0.md`.
   - Step 4: version bump 0.36.0 → 0.37.0 (hand-edit
     backend/pyproject.toml; `make sync-versions` propagated
     across 20 files).
   - Step 5: frontend npm build + launcher PyInstaller build
     (backend skipped per `package-mode = false`).
   - Step 6: tag `v0.37.0` annotated + pushed; Release Gate +
     Coverage workflows queued at GitHub.
   - Step 7: GitHub release published via
     `gh release create v0.37.0 --notes-file changelog/releases/v0.37.0.md`.
     URL: https://github.com/astrapi69/bibliogon/releases/tag/v0.37.0
   - Step 8: backlog filings (8 new entries: 3 Settings phase
     items + 4 deferred + 1 HELP-DOCS gap); CLAUDE.md headline
     + version bumped; ROADMAP header updated; this journal
     entry; final push.

## Statistics

- 53 commits since v0.36.0 across two batches.
- Backend pytest: 2214 → 2269 (+55).
- Frontend Vitest: 1986 → 2037 (+51, 160 files).
- i18n parity: 75/75 across 8 catalogs.
- Lessons-learned: no new top-level rules filed this cycle.
  The existing rules (Pre-Coding-Reality-Check, Half-Wired-
  Lifecycle, Single-Router-Per-Plugin, design-intent-axis,
  Stale-bundle false-positive) all held without modification.
- Open backlog count: 65 → 73 (+8 v0.37.0 follow-ups; net of
  4 closures during the release cycle).
- Closures during the release cycle:
  DASHBOARD-PAGINATION-LOAD-MORE-01, BOOK-REPOSITORY-URL-FIELD-01,
  EDITOR-DISPLAY-SETTINGS-01, COMMENTS-ADMIN-PAGINATION-01.

## Notable findings

- **Settings UX audit surfaced the catch-all "Allgemein" tab
  as the biggest UX problem** — 9 controls in one card, 4
  repeated dashboard-view selects, SshKeySection orphaned
  between cards, 3 distinct concerns (App config / Editor /
  White-Label) crammed into one tab. User adjudicated a 3-phase
  post-release ship: Quick-Win bundle → Allgemein split →
  Shared Toggle component. Sidebar redesign deferred to P4 with
  explicit triggers (13+ tabs OR user-pull signal).
- **Help-docs gap on 4 v0.37.0 features** (pagination,
  word-wrap dedicated page, editor display, repository URL).
  Filed as HELP-DOCS-V0.37.0-GAPS-01 P3; not blocking the
  release tag per release-workflow.md.
- **External Bibliogon-owned deps current**: `manuscripta
  ^0.9.0` + `pluginforge ^0.10.0` both at PyPI latest.
- **One ruff-format release-prep nit caught** during the Step
  5 mandatory pre-commit sweep — exactly the class of finding
  the workflow's v0.26.0 hotfix-cluster lessons-learned warns
  against skipping. Filed as a `chore(release)` commit before
  the version bump.

## Discipline checkpoints honored

- Plain `git status` before every commit (no path-filtered
  status calls).
- Explicit-paths-only staging on every `git add` invocation
  during the release-cycle commits.
- Numeric-claims-verification: every test count + commit count
  + open-backlog count cross-checked against authoritative
  source (pytest --collect-only / git log --oneline / grep)
  before landing in CHANGELOG + per-release notes + CLAUDE.md
  + ROADMAP + journal.
- Pre-Coding-Reality-Check at each session-step: re-grepped
  the immediate touch-surface before writing code (caught the
  half-wired BookMetadataEditor surface during PDF-KDP-FORMATS
  Pre-Inspection equivalent in BOOK-REPOSITORY-URL-FIELD-01;
  caught the word-wrap-is-localStorage premise correction
  during EDITOR-DISPLAY-SETTINGS-01 Pre-Inspection).
- Multi-Tool-Coordination: session-start sync via `git log`
  + `git status` (clean tree at start; HEAD = origin/main =
  `e3f2686`).

## Open follow-ups (filed in backlog)

P3 (immediate post-v0.37.0 ship sequence):
- SETT-PHASE-1-QUICK-WINS-01 (~9 commits)
- SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01 (~4-5 commits, after Phase 1)
- SETT-PHASE-3-TOGGLE-COMPONENT-01 (~4-5 commits, after Phase 2)
- HELP-DOCS-V0.37.0-GAPS-01 (~S; next help-docs session OR
  next pre-release sweep)

P4 (deferred):
- SETT-M-2-PER-TAB-SUBSECTION-HEADERS-01
- SETT-M-4-SETTINGS-SEARCH-01
- SETT-L-1-SIDEBAR-REDESIGN-01

P5 (speculative):
- SETT-L-2-FULL-RESPONSIVE-AND-SEARCH-01
