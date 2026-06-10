# Session Handoff — Settings UX Phase 1 (next session resume)

**Filename note**: this file uses the forward-dated `2026-05-26`
suffix per the handover convention (the "next session" date even
when authored on the close-out day). **Actual authored date**:
2026-05-25 immediately after the v0.37.0 release ship.

## TL;DR

v0.37.0 is **shipped, tagged, and published on GitHub**. All CI
gates green; all 3 launcher binaries attached. Working tree clean
at `6bda82b`. The next session begins
**SETT-PHASE-1-QUICK-WINS-01** — the first of three coordinated
post-release Settings-UX ship streams adjudicated mid-release-
cycle.

---

## State at handover

### Git

- **HEAD** = `origin/main` = `6bda82b`
- **Last 7 commits** (release-cycle):
  ```
  6bda82b docs(post-release): v0.37.0 — CLAUDE.md headline + ROADMAP header + session journal
  056fdfd docs(backlog): file 8 v0.37.0 post-release follow-ups (Settings UX audit + help-docs gap)
  c554bd3 chore(release): bump version to v0.37.0
  5639363 docs(changelog): v0.37.0 entry + per-release notes
  b3041a7 chore(release): ruff-format settings.py for v0.37.0 pre-tag sweep
  e3f2686 docs(roadmap): close EDITOR-DISPLAY-SETTINGS-01 + archive
  ... (53 total commits since v0.36.0)
  ```
- **Tag**: `v0.37.0` (annotated; pushed 2026-05-25)
- **GitHub release**: https://github.com/astrapi69/bibliogon/releases/tag/v0.37.0
- **Launcher binaries**: 3/3 attached (Linux, macOS, Windows)

### Test baselines (post-release)

- Backend pytest: **2269 passed, 1 skipped** (`make test`)
- Frontend Vitest: **2037 passed**, 160 test files
- i18n parity: **75/75** across all 8 catalogs
- tsc clean; ruff clean; mypy clean; pre-commit all-hooks clean
- launcher PyInstaller build: green
- npm audit: 0 high/critical (2 moderate `ws` advisories, within
  tolerance)

### Active disciplines (load-bearing for any next session)

1. **Plain `git status` before every commit** (no path-filter).
2. **Explicit-paths-only staging** (`git add <file> <file>`,
   never `-A` / `.` / `<directory>/` when a parallel session may
   have left in-flight files).
3. **Pre-Coding-Reality-Check**: re-grep the immediate touch
   surface before writing code — the audit's commit plan is a
   starting hypothesis, not a contract.
4. **Numeric-Claims-Verification**: every test count / commit
   count / version string cross-checked against the
   authoritative command before landing in any doc.
5. **Half-Wired-Lifecycle Prevention**: every state-write needs
   a state-consumer; every CRUD endpoint needs a Read; never
   ship partial lifecycles without a load-bearing backlog
   filing.
6. **Recurring-Component-Unification Rule** (2-surfaces
   threshold for UI patterns).

### Open backlog snapshot

- **73 active items** (P3..P5 + 2 BLOCKED-on-upstream).
- The 4 closures shipped this cycle:
  DASHBOARD-PAGINATION-LOAD-MORE-01,
  BOOK-REPOSITORY-URL-FIELD-01,
  EDITOR-DISPLAY-SETTINGS-01,
  COMMENTS-ADMIN-PAGINATION-01 (stale-already-shipped).
- **New filings this cycle**: 8 v0.37.0 follow-ups (3 Settings
  phase items + 4 deferred Settings audit items + 1 help-docs
  gap). See `docs/backlog.md` header for the per-priority
  breakdown.

---

## Next session work — SETT-PHASE-1-QUICK-WINS-01

**Priority**: P3 (immediate post-v0.37.0 ship per user
adjudication). **Effort**: ~9 commits in a single session.
**No scope changes from the audit-adjudicated 7 quick wins.**

### Scope — all 7 items, bundled

Per `docs/backlog.md` SETT-PHASE-1-QUICK-WINS-01 entry. Quick
reference:

1. **SETT-QW-1** — group the 4 dashboard-view RadixSelects
   (books / articles / books-trash / articles-trash) into a
   sub-card with header "Standard-Ansichten" + 2×2 grid.
   *Files*: `frontend/src/components/settings/AppSettings.tsx`
   lines ~168-241.
2. **SETT-QW-2** — move `SshKeySection` into its own card with
   explicit header ("SSH-Schlüssel für Git-Sync"). Currently
   floats orphan between Card 1 and Card 2 at
   `AppSettings.tsx:326`.
3. **SETT-QW-3** — move Editor settings to their own tab
   ("Editor" — position between Allgemein and KI-Assistent).
   Hidden inside `AppSettings.tsx:329-365` today.
4. **SETT-QW-4** — standardise section-title styling across
   `BackupsSettings.tsx` + `AboutSettings.tsx` +
   `DangerZoneSettings.tsx` (currently use inline
   `<h2 style={{margin: 0}}>` — switch to
   `styles.sectionTitle` from
   `frontend/src/pages/Settings.module.css`).
5. **SETT-QW-5** — extract `<HelpText>` component for the
   small italic help-text under inputs. ~30 sites currently
   use inline `<small style={{color: "var(--text-muted)",
   fontSize: "0.7rem|0.75rem|0.8125rem"}}>`. Pick one canonical
   size; migrate all sites.
6. **SETT-QW-6** — clarify White-Label "Erweitert" affordance
   (currently behind a `<Wrench>` toggle button at
   `AppSettings.tsx:369-377`). Options: own tab OR
   labeled-section-with-prominent-header. Implementer picks at
   keystroke time per Pre-Inspection.
7. **SETT-QW-7** — add per-section descriptions (1-2 lines
   under each `sectionTitle`) explaining what the section
   controls. Matches Notion / Linear convention. Per language
   (DE + EN minimum; passthru-EN to other 6 catalogs per
   established new-namespace pattern).

### Recommended commit sequence

The 7 quick wins are mostly orthogonal except for QW-3 which
moves controls between tabs. Suggested order:

1. **C1** — SETT-QW-4 (section-title standardisation; lowest
   risk; pure cleanup).
2. **C2** — SETT-QW-5 (`<HelpText>` extraction + ~30 site
   migration; mechanical refactor).
3. **C3** — SETT-QW-1 (dashboard-views sub-card grouping).
4. **C4** — SETT-QW-2 (SshKeySection own-card wrapper).
5. **C5** — SETT-QW-3 (Editor tab extraction). **Pre-Inspection
   note**: adding a tab means updating
   `VALID_SETTINGS_TABS` literal in `Settings.tsx:23`,
   `tabDefs` in `Settings.tsx:135-149`, and the Tabs.Content
   branch in `Settings.tsx:198+`. Per the
   New-hook-+-new-mock-key contract drift lesson, every test
   file mocking these tabs must also be updated.
6. **C6** — SETT-QW-6 (White-Label clarity). Pick the option
   at keystroke time.
7. **C7** — SETT-QW-7 (per-section descriptions).
   New i18n key per section header; 8 catalogs.
8. **C8** — Playwright smoke covering the new tab structure +
   re-running the existing settings smoke specs (verify no
   testid regressions).
9. **C9** — archive close-out commit
   (`docs(backlog): close SETT-PHASE-1-QUICK-WINS-01 + archive`).

---

## Gotchas + load-bearing context

### Settings architecture

- **11 tabs** (Settings.tsx:23): `app` / `ai` / `author` /
  `authors_database` / `topics` / `plugins` / `comments` /
  `backups` / `support` / `about` / `danger_zone`. Plus URL
  deep-link via `?tab=...` query param + mobile hamburger
  fallback at <768px (uses Radix DropdownMenu, NOT Tabs.List).
- **Sub-components** at `frontend/src/components/settings/`
  (11 files; AppSettings is the biggest at 446 LOC).
- **CSS module** at `frontend/src/pages/Settings.module.css`
  (~100 LOC, 13 keys). `styles.sectionTitle` is the canonical
  section-title style; 3 sub-components don't use it (the
  SETT-QW-4 cleanup target).
- **Tab routing**: `handleTabChange` in `Settings.tsx:59-68`
  uses `setSearchParams({tab: next}, {replace: true})` to
  mirror the active tab into the URL. Preserve this on QW-3
  Editor-tab addition.

### Settings page testid namespace

Existing testids per `Settings.tsx`:

- `settings-nav-back`, `settings-nav-home`
- `settings-tab-<tab>` for each of 11 tabs (desktop) +
  `settings-tab-<tab>-mobile` for each (mobile hamburger)
- `settings-tabs-mobile-trigger`
- Per-section testids inside each sub-component (e.g.
  `app-settings`, `settings-language`, `palette-select`,
  `settings-books-view`, ...).

QW-3 (Editor tab extraction) needs a new
`settings-tab-editor` + `settings-tab-editor-mobile`. Add to
`VALID_SETTINGS_TABS` + `tabDefs` + `<Tabs.Content
value="editor">` branch.

### Radix DropdownMenu + happy-dom flake (existing lesson)

The mobile hamburger uses Radix DropdownMenu. Per the existing
lessons-learned rule "Radix DropdownMenu + happy-dom is brittle
for Vitest":

- **OK in Vitest**: assert on trigger button existence + role.
- **NOT OK in Vitest**: assert on menu items inside
  `<DropdownMenu.Portal>`. Use E2E for those assertions.

The C8 Playwright smoke covers the mobile-tab-switch happy path
end-to-end.

### React 18 StrictMode + mockImplementation (existing lesson)

When adding Vitest tests for new Settings sub-components:

- Use `vi.fn().mockImplementation(...)` NOT
  `mockImplementationOnce(...)` for hooks called in useEffect.
  React 18 StrictMode mounts effects twice; `Once` gets consumed
  on the first mount and the second sees `undefined`.
- Use `mockClear()` NOT `mockReset()` in `afterEach` — `Reset`
  strips the factory default and the next test sees vanilla
  `vi.fn()`.

### Pre-commit hook ruff-format aggressive collapse

When editing Python files (settings.py, books.py routers, etc.):

- `ruff-format` may collapse multi-line tuples / dict literals
  aggressively. Pre-commit catches this on `git commit`; either
  let it fix and re-commit, OR run
  `cd backend && poetry run ruff format .` proactively before
  staging.
- This is the class of finding the v0.26.0 hotfix-cluster
  lessons-learned warns against skipping.

### Mobile hamburger tab list parity

`Settings.tsx:135-149` defines `tabDefs` as the single-source-
of-truth — both desktop `<Tabs.List>` and mobile `DropdownMenu`
render from this same array. When adding a tab (QW-3), update
the SHAPE (the `tabDefs.push(...)`) — both surfaces inherit
automatically.

### Test-fixture drift on Book interface changes

If any QW-3 work touches the Book / BookDetail type (it
shouldn't, but if it does): 4 test fixtures currently need
`repository_url: null` for BookDetail completeness:

- `frontend/src/hooks/useBookFilters.test.ts`
- `frontend/src/components/SaveAsTemplateModal.test.tsx`
- `frontend/src/components/kdp-wizard/ExportPackage.test.tsx`
- `frontend/src/pages/BookEditor.test.tsx`

These were updated this cycle for BOOK-REPOSITORY-URL-FIELD-01.
Any new required Book field needs the same update across all 4.

### Settings sub-component test files

Vitest files exist for most settings sub-components:

- `AppSettings.test.tsx` — NOT present (the only large
  sub-component without a dedicated test file). QW-3 Editor-tab
  extraction may surface this gap — pre-existing.
- `BackupsSettings.test.tsx` (131 LOC) — touched by QW-4.
- `DangerZoneSettings.test.tsx` (242 LOC) — touched by QW-4.
- `AboutSettings.test.tsx` (322 LOC) — touched by QW-4.
- `PluginCard.test.tsx`, `PluginSettings.test.tsx`,
  `AuthorsDatabase.test.tsx`, `AuthorSettings.test.tsx` — not
  on the QW path but may need updates if testids shift.

The QW-4 cleanup (section-title standardisation) is mostly
visual; existing tests assert on testid presence + behavior,
not on inline-vs-class style. Low regression risk.

### v0.37.0 archive entry NOT yet in `docs/archive/roadmap/2026-05.md`

The release-cycle closures (DASHBOARD-PAGINATION,
BOOK-REPOSITORY-URL, EDITOR-DISPLAY-SETTINGS,
COMMENTS-ADMIN-PAGINATION) each have their own archive entries
in `docs/archive/roadmap/2026-05.md`. But there is no umbrella
"v0.37.0 released" archive entry. The release itself is
documented via:

- `docs/CHANGELOG.md` `[0.37.0] - 2026-05-25` section
- `changelog/releases/v0.37.0.md` per-release notes
- `docs/journal/chat-journal-session-2026-05-25-v0.37.0.md`
  session journal

This matches the v0.36.0 pattern (no umbrella archive entry
for the release tag itself). Continue this convention.

### Plugin-version-independence

`scripts/verify_version_pins.sh` raises an advisory WARN about
`plugins/bibliogon-plugin-comics/bibliogon_comics/routes.py:73`
carrying `"version": "1.1.0"`. This is **intentional** per
CLAUDE.md "Plugin versions are independent of the app version."
Plugin-comics shipped a 1.0.0 → 1.1.0 minor bump during v0.36.0
because the plugin itself changed. **Do NOT add it to the
sync-versions target list**.

### External Bibliogon-owned deps

Both `manuscripta ^0.9.0` + `pluginforge ^0.10.0` are at PyPI
latest as of v0.37.0 release. No bumps needed mid-cycle.
Re-verify at v0.38.0 release time per the release-workflow.md
external-deps checkpoint.

### Pre-commit hook `roadmap-archive-reminder`

This hook prints a reminder when commits add `[x]` markers
without a paired archive update. The hook ALWAYS exits 0 — it's
advisory, not blocking. Don't be alarmed by its output during
the SETT-PHASE-1 commit chain.

### Help-docs gap on v0.37.0 features

`HELP-DOCS-V0.37.0-GAPS-01` (P3) covers 4 features without
dedicated help pages: pagination, word-wrap, editor display
settings, repository URL field. Not a SETT-PHASE-1 dependency,
but a session that ships SETT-QW-7 (per-section descriptions)
may bundle some help-doc updates if it makes sense. Optional
at PHASE-1 time.

### docs/archive/ structure

`docs/roadmap-archive/` was restructured to `docs/archive/roadmap/`
this cycle. **15 live-file cross-refs updated**; archived-journal
cross-refs preserved as historical record. The new convention:

- `docs/archive/roadmap/` (renamed from `docs/roadmap-archive/`)
- `docs/archive/journal/`
- `docs/archive/audits/`
- `docs/archive/testing/`

All four under one `docs/archive/` root. If your session creates
any backlog archive entries, write to
`docs/archive/roadmap/YYYY-MM.md` (this month: `2026-05.md`).

---

## Three-phase post-release Settings UX ship sequence

Per user adjudication (recorded in the v0.37.0 session journal):

1. **Phase 1 (NEXT SESSION)**: SETT-PHASE-1-QUICK-WINS-01 (~9
   commits). 7 quick wins bundled.
2. **Phase 2** (the session after that):
   SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01 (~4-5 commits). Split
   "Allgemein" into Erscheinungsbild / Verhalten / Editor tabs;
   White-Label to its own Erweitert tab.
3. **Phase 3** (the session after Phase 2):
   SETT-PHASE-3-TOGGLE-COMPONENT-01 (~4-5 commits). Extract
   shared `<Toggle label description checked onChange>` and
   migrate ~15 checkbox sites.

P4-deferred items (NOT this session): SETT-M-2 / SETT-M-4 /
SETT-L-1. P5: SETT-L-2.

Each phase ships as its own commit-chain + archive close-out;
do NOT bundle phases. If Phase 1 takes longer than the 5-commit
stop-condition guideline, that's OK per the
"extraction-plus-migration-may-exceed-stop-condition" rule in
coding-standards.md (this is an RCU extraction-plus-migration
session, which the rule explicitly carves out).

---

## Session-start checklist

Before starting Phase 1:

1. `git status` — confirm clean tree (should be).
2. `git log --oneline -5` — confirm HEAD = `6bda82b` (or later
   if any other commits land before this session resumes).
3. `git pull` — sync with origin (parallel sessions may have
   pushed; the Multi-Tool-Coordination rule requires this).
4. `make test` — establish baseline before any code change.
   Should show 2269 backend / 2037 Vitest / 75 i18n.
5. Read `docs/backlog.md` SETT-PHASE-1-QUICK-WINS-01 entry +
   the SETT-PHASE-2 + SETT-PHASE-3 entries (for context — Phase
   1 prepares Phase 2's tab-split).
6. Read this handoff doc to the end.
7. Optional: read this session's chat journal
   (`docs/journal/chat-journal-session-2026-05-25-v0.37.0.md`)
   for the full v0.37.0 release context.
8. Pre-Coding-Reality-Check: grep
   `frontend/src/components/settings/` for the current sub-
   component structure; verify the line numbers in this doc
   are still accurate (settings sub-components may have drifted
   if other sessions touched them).

---

## Stop conditions

Phase 1 should STOP and surface to the user if:

- A QW item's Pre-Coding-Reality-Check finds the touch-surface
  has drifted enough that the audit's scope no longer matches
  reality (e.g. SETT-QW-3 Editor tab extraction finds the
  Editor section has been moved or restructured since this
  audit).
- The commit count crosses ~12 commits and there are still QW
  items unshipped (the 5-commit stop-condition + extraction-
  plus-migration carve-out is the guideline; 12+ is a halt
  signal).
- Backend pytest / Vitest / tsc / pre-commit drops to red and
  the cause isn't immediately obvious.
- The user adjudicates a scope change mid-session.

If any STOP condition fires, file a follow-up backlog item with
the remaining QW items + an explicit reason for the halt; close
the partial Phase 1 with what shipped.

---

## Final state

Everything green. v0.37.0 released. No in-flight commits. No
parallel sessions known to be active. Working tree clean. Tag
+ release page + launcher binaries all published. CI green.

Next session: **SETT-PHASE-1-QUICK-WINS-01**, ~9 commits,
single session, no scope changes.

Good luck.
