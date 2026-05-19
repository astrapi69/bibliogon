# Session handover — post-overnight state (2026-05-19)

Continuation handoff after a multi-session day that shipped five
substantial work-streams + evaluated the next 2-3 months of
strategic features. mainline is **49 commits ahead of v0.35.1**;
working tree is clean.

---

## Current published state

- **Latest release**: `v0.35.1` (2026-05-18, donation-visibility patch)
- **HEAD on `origin/main`**: `25fd2c5` (exploration-features 2026-05-19 evaluated)
- **Commits ahead of v0.35.1**: 49 across 5 work-streams + 1 audit triage
- **Working tree**: clean

Not yet released — the 49 commits are accumulated for the next
release cut, likely v0.36.0 (significant new surface: Backups
tab + About-Dialog + plugin-comics scaffolding + browser-native
fullscreen).

---

## Today's session at a glance

5 major work-streams shipped + 1 strategic evaluation:

### 1. About-Dialog (7 commits, full Settings 9th tab)

`2362c59` audit + `c590578` backend `/api/system/info` + `f2fd14c`
skeleton + `e7dc504` + `956ab79` sections + `d27e834` i18n × 8 +
`301bd46` Playwright smoke. Settings > About tab renders Version
+ Credits + Plugin-List + Donations + System-Info sections with
i18n parity across 8 catalogs. 15/15 Vitest + 9/9 backend pytest
+ live-stack E2E spec.

### 2. BOOKDASHBOARD-CLEANUP-01 (5 commits, parallel-session work)

`5a440c0` Backups tab scaffold + `6ae7274` migrate Version-History
+ Compare-Backups into BackupsSettings + `23a01b5` remove from
Dashboard + `fa2103d` `ui.dashboard.*` → `ui.backups.*` i18n
migration × 8 catalogs + `747983f` Vitest + Playwright pins.
Archived as a P3 closure.

### 3. USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01 (4 commits + lessons-learned, P2 → CLOSED)

`edb7e28` C1 helper + 9 pytest + 2-part regression-pin update +
`d00948b` C2 lifespan wiring + integration tests + `170a715` C3
backlog close + lessons-learned rule + `e4c367d` C4 live-dev E2E
smoke. Closes the silent-feature-invisibility class identified
during plugin-comics Session 1 smoke (2026-05-18). Comics now
auto-activates on every existing user-overlay; opt-out via
`plugins.disabled` preserved.

### 4. EDITOR-FULLSCREEN-NATIVE-01 (6 commits via parallel-session)

`630202c` C1 `useFullscreenToggle` hook + `625c115` C2 Toolbar
button + `519017f` C3 PageEditor header + `685e4cc` C4
ComicBookEditor button + `a68f054` C5 i18n × 8 + `8798b5f` C6 E2E
smoke across 3 integration points. Plus `dac5f2f` archived
EDITOR-FULLSCREEN-NATIVE-01 + filed
`FULLSCREEN-PATTERN-RECONCILE-01` (P4) for the markdown/article
editor surfaces that still lack the affordance.

### 5. exploration-features-2026-05-15 evaluation (3 commits)

`c16ac61` audit + `ec8538a` 3 ACCEPT + 1 EXTEND filings + `25fd2c5`
append "Evaluated 2026-05-19" section to the exploration doc with
ACCEPT/DEFER/REJECT/EXTEND markers. Triage outcome:

- **ACCEPT** (3 items, new backlog rows): `KDP-PUBLISHING-WIZARD-01`
  (P2 STRATEGIC), `STORY-BIBLE-PLUGIN-01` (P2 STRATEGIC),
  `WRITING-GOALS-PROGRESS-TRACKING-01` (P3 FEATURE-REQUEST).
- **EXTEND** (1 item): `PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01` (P3) —
  adds 3 KDP-specific fields to existing picture-book metadata.
- **DEFER** (5 items, trigger-gated, no backlog row).
- **REJECT** (1 item, already shipped).

Net backlog growth: +4 items (62 → 66).

### Plus 1 quick fix

`1c15d82` make stop terminates with "Beendet" + dev backgrounds
uvicorn without saving PID. Small Makefile hygiene.

---

## What's pending

### P2 — High-Value User Features (3 active)

- **`MEDIUM-IMPORT-V2-02`** — AI tag inference for imported
  articles. Trigger: first user report OR v01 ships and the
  manual-tagging step is a visible bottleneck.
- **`KDP-PUBLISHING-WIZARD-01`** (filed 2026-05-19) — guided
  multi-step wizard for KDP publishing flow. Strategic feature
  per exploration-features-2026-05-15. ACCEPT-triaged.
- **`STORY-BIBLE-PLUGIN-01`** (filed 2026-05-19) — plugin for
  fiction-author "story bible" (characters, locations, timeline,
  consistency-check). New plugin scope; will exercise the
  3-source plugin-metadata pattern. ACCEPT-triaged.

### P3 — 38 items

Recent additions:

- **`WRITING-GOALS-PROGRESS-TRACKING-01`** (filed 2026-05-19) —
  daily word-count / session goals. ACCEPT-triaged.
- **`PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01`** (filed 2026-05-19) —
  EXTEND-triaged from the exploration evaluation.
- **`FULLSCREEN-PATTERN-RECONCILE-01`** (filed 2026-05-19) — P4,
  reconcile fullscreen across the 3 NOT-yet-covered editor
  surfaces (markdown, article, etc.).

Other notable P3 items: `WRITING-GOALS-PROGRESS-TRACKING-01`,
`PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01`,
`PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01`,
`PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`,
`PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01`,
`EDITOR-KEYBOARD-SHORTCUT-ALT-Z-01`,
`CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01`,
`PICTURE-BOOK-STORYBOARD-VIEW-01`,
`PLUGIN-COMICS-E2E-SMOKE-01`,
`PLUGIN-COMICS-MAKEFILE-INTEGRATION-01`,
`PLUGIN-METADATA-I18N-PARITY-01`.

### P4 — Roadmap / Future Phases (8 active)

Includes `MYPY-V2-MIGRATION-01`, `D-07` (winget/Homebrew tap),
`AR-BULK-CROSSPAGE-SELECT-01`, `LAUNCHER-SELFREPLACE-01`,
`PLUGIN-DEV-SERVER-RESTART-HELPER-01`,
`PLUGIN-COMICS-E2E-SMOKE-01`, `FULLSCREEN-PATTERN-RECONCILE-01`.

### P5 + Blocked

17 P5 items + 2 BLOCKED-on-upstream (`STARLETTE-V1-AWAIT-FASTAPI-01`,
`CLICK-V8-3-AWAIT-GTTS-01`).

### Total

**66 active (P2..P5) + 2 BLOCKED.** Source: `awk` over
`docs/backlog.md` per the Numeric-Claims-Verification rule.

---

## Cross-project work-in-progress: PluginForge v0.6.0 plugin-lifecycle

In a sidebar discussion this morning, two CC agents (one for
Bibliogon, one for PluginForge) settled the API design for a
v0.6.0 plugin-lifecycle batch. Five-item scope:

1. **`manager.rediscover()` API** — fixes the operational gap
   where `importlib.metadata.entry_points()` is read once at
   lifespan startup; new plugin installs aren't picked up
   without backend restart. Includes a `DiscoveryDiff` return.
   Implementation wrinkle: `importlib.metadata.MetadataPathFinder.invalidate_caches()` +
   `importlib.invalidate_caches()` (not `importlib.reload`).

2. **`manager.refresh_config(new_config)` public API** —
   replaces today's `manager._app_config = merged  # type: ignore`
   private-state poke in `_refresh_manager_app_config`. Plugins
   that want to react opt-in via `on_config_changed(old, new)`
   hook. Lazy default.

3. **Structured `PluginState`** — replaces the hand-rolled
   `_log_plugin_diagnostics_pre/_post` with a typed object
   per-plugin. 8 `filter_reason` enum values agreed:
   `not_discovered, not_enabled, disabled, incompatible_api_version,
   incompatible_app_version, dependency_unmet, license_check_failed,
   load_failed`.

4. **Gate `api_version` + `min_app_version`** — currently
   decorative metadata (zero consumers across Python +
   TypeScript). Gate, don't delete. Default severity:
   `incompatible_api_version` → warn (preserves current
   behavior), `incompatible_app_version` → error (new gate).

5. **Cross-cutting `PluginError` primitive** — typed error with
   `phase`, `cause`, `user_facing_message`, `severity` fields.
   Single primitive consumed by all four PRs.

**Status**: design refinements settled in the cross-CC
conversation. Awaiting Asterios's bandwidth call on whether
PluginForge agent drafts `docs/design/v0.6.0-plugin-lifecycle.md`
on a `design/v0.6.0-lifecycle` branch in the PluginForge repo,
or holds for human review of the 5-refinement summary first.

**Bibliogon-side adoption implications** (once PluginForge ships
v0.6.0):

- Replace `_refresh_manager_app_config`'s private-state poke
  with `manager.refresh_config(merged)`.
- Replace `_log_plugin_diagnostics_pre/_post` with the new
  `DiscoveryResult` consumer.
- Fix the `min_app_version: "0.36.0"` in plugin-comics (currently
  cosmetic) AND every other plugin's `min_app_version` — once
  the gate fires for real, stale pins become hard errors. Pre-
  release dependency-style sweep needed.
- Hook `manager.rediscover()` into the `make dev-restart-on-plugin-change`
  target (per the P4 `PLUGIN-DEV-SERVER-RESTART-HELPER-01`) so the
  helper's "warn + auto-restart" can become "warn + auto-
  rediscover" — no process restart needed.

---

## Multi-tool collaboration state

Today was unusually parallel — 4 concurrent CC sessions visible:

1. **About-Dialog session** (mine) — 7 commits.
2. **BOOKDASHBOARD-CLEANUP session** — 5 commits, raced through
   the working tree multiple times; once swept my About-C6
   spec into their commit, then voluntarily `git reset --hard`
   + recommitted cleanly.
3. **USER-OVERLAY-MIGRATION continuation** — C2-C4 finished by
   another session overnight after I left mid-C2.
4. **EDITOR-FULLSCREEN-NATIVE-01 session** — 6 commits + an
   evening fullscreen-button addition to ComicBookEditor (the
   system-reminder surfaced this morning).

Per the multi-tool collaboration discipline + the
`MULTI-TOOL-COLLAB-OVERLAP-DISCIPLINE-01` framing from
2026-05-18, the BookDashboard-Cleanup race was the standout
incident. Today's other sessions worked clean in their
respective code areas (backend vs frontend vs tests vs i18n).

---

## Lessons-learned added today

The night session shipped a new lessons-learned rule in
`170a715` (USER-OVERLAY-MIGRATION-01 C3 commit). The full text
lives in `.claude/rules/lessons-learned.md`. Title (paraphrased):
"User-overlay merge semantics + migration discipline for future
config-version changes."

Substance:
- `deep_merge` semantics (lists replace) are a footgun for any
  list-shaped config field that grows over a release lifecycle.
- The migration helper pattern (append-on-startup, respect
  explicit `disabled`) is the right shape — preserves global
  merge contract while adding a list-aware step.
- Future list-shaped fields that may grow (e.g. `ui.themes`,
  `donations.channels`) should be evaluated for the same pattern.

---

## Tag list (current)

```
v0.35.1  ← latest published (2026-05-18 donation-visibility patch)
v0.35.0  ← Picture-Book PDF + TipTap + 5 OFL fonts +
            release-automation pipeline first-cut
v0.34.1
v0.34.0
v0.33.0
...
```

origin/main is **49 commits ahead** of `v0.35.1`. Cumulative
shipped surface since v0.35.1:

- About-Dialog feature
- Backups tab + BackupsSettings (BookDashboard cleanup)
- USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01 (silent-404 class fix)
- EDITOR-FULLSCREEN-NATIVE-01 (browser-native fullscreen toggle)
- plugin-comics Session 1 (Comic-Book book_type + placeholder editor)
- Two-Track plugin-metadata cleanup (3-source pattern codified,
  git-sync.yaml shipped, deduplication refactor)
- Comic-Foundation exploration (full 736-line reframe)
- 5+ lessons-learned rules

Next release likely tagged as **v0.36.0** when Asterios authorizes
the cut.

---

## Heads-up for next session

1. **PluginForge v0.6.0 design pass.** The cross-CC discussion
   left a clear deliverable: draft `docs/design/v0.6.0-plugin-
   lifecycle.md` on the PluginForge repo. Bibliogon-side review
   is on standby. Re-engage with the PluginForge CC if Asterios
   greenlit the draft. The Bibliogon-side adoption work waits
   for v0.6.0 to ship.

2. **No-commit cosmetic in plugin-comics.** `min_app_version:
   "0.35.0"` lives in `backend/config/plugins/comics.yaml` AND
   `plugins/bibliogon-plugin-comics/plugin.yaml` (the latter was
   deleted in T2-A — wait, let me re-check). Actually after the
   2026-05-18 deduplication (Path B), the in-repo plugin.yaml
   files should be GONE — verify if any drifted back during
   today's work.

3. **49 commits unreleased.** Release-workflow.md says "release
   new version" triggers the workflow. Likely call this v0.36.0
   given the surface (About-Dialog + Backups + USER-OVERLAY
   migration + plugin-comics + fullscreen). Asterios decides.

4. **PluginForge cross-project state.** The agent on the
   PluginForge side is mid-discussion. The 5-refinement summary
   is settled. No code-change debt on Bibliogon-side yet.

5. **Backlog count discrepancy.** Header still says "62 active
   (P2..P5) + 2 BLOCKED-on-upstream entries" but actual count
   is 66. Drift accumulated through the day's additions. Quick
   header refresh is one-line work.

6. **Exploration triage left 5 DEFER items as trigger-gated
   future considerations** — see
   `docs/audits/exploration-features-2026-05-15-evaluation.md`
   for the per-feature triggers.

7. **plugin-comics Session 2 sequence** — still trigger-gated
   on Picture-Book Phase 4 fully closed. Several Phase 4 items
   remain open (4c-B-2 Tier-Property, EXTENDED-SHAPE-01,
   PDF-KDP-FORMATS-01, etc.).

---

## Discipline reminders in effect

- Atomic-green commits (Vitest + tsc + relevant backend pytest
  must stay green per commit).
- No automation code without explicit user GO.
- Pre-Inspection STOP gate before any non-trivial new work.
- Per-commit stop-condition at ~5-9 commits per session.
- Recurring-Component Unification Rule (2-surfaces threshold
  for UI patterns).
- Multi-tool collaboration: always status-re-sync via
  `git log` before accepting any plan that references
  "pending" items — sessions today raced multiple times.
- Pre-audit-for-exploration-docs Rule (filed 2026-05-18) —
  applied successfully today on the About-Dialog audit.
- Smoke-findings-default-action (filed 2026-05-18 as memory).
- User-overlay-migration discipline (filed 2026-05-19) —
  list-shaped config fields that grow over a release lifecycle
  need explicit migration semantics.

---

## How to resume in a new session

1. Read this handover doc + the resume prompt
   `docs/journal/session-prompt-2026-05-19-post-overnight-resume.md`.
2. `git log --oneline v0.35.1..HEAD` — verify mainline state
   vs `25fd2c5`.
3. Decide stream. Most likely candidates ranked by leverage:
   - **a. Release v0.36.0 cut.** 49 commits accumulated;
     `release-workflow.md` codifies the steps.
   - **b. PluginForge v0.6.0 design doc.** Cross-project
     work-in-progress; needs Asterios's bandwidth call.
   - **c. KDP-PUBLISHING-WIZARD-01 (P2 STRATEGIC).** Newly
     ACCEPT-triaged.
   - **d. STORY-BIBLE-PLUGIN-01 (P2 STRATEGIC).** Newly
     ACCEPT-triaged. Will exercise the 3-source plugin-metadata
     pattern as the canonical 13th-plugin example.
   - **e. Header count refresh in `docs/backlog.md`** —
     5-second hygiene.
4. Apply Pre-audit discipline + smoke-findings-default-action
   discipline (per memory entries).
