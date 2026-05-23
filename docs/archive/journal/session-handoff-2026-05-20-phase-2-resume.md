# Session handover — Phase 2 (Panel-Config) resume (2026-05-20)

Handover for the next CC session. Phase 1 closed today
(`216b5a1..433d8ce`). Next-substantial Comics task is Phase 2:
`PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01` (filing TBD), which
closes user-Findings #1 (Panel-Image-Upload) + #3
(LayoutConfigComicPanel).

There is also a **new PluginForge release 0.9.0** to consider
bumping (current pin `^0.8.0`). See the "PluginForge 0.9.0
bump" section below for the deferred-vs-do-now decision.

Companion file:
[session-prompt-2026-05-20-phase-2-resume.md](session-prompt-2026-05-20-phase-2-resume.md)
(paste-ready for a fresh CC session).

---

## Current state

- **HEAD on `origin/main`:** `433d8ce` `docs(backlog): close
  PLUGIN-COMICS-PHASE-1-MULTI-PANEL-LAYOUTS-01 + archive + LL
  filing`
- **Working tree:** clean; local `main` == `origin/main`
- **Backend baseline:** 2116/2116/0/0 clean (1 skipped)
- **Frontend Vitest:** 1768 tests passing (140 files)
- **Playwright:** existing comic-book specs + 4 new from Phase 1
- **tsc --noEmit:** clean
- **Current pluginforge pin:** `^0.8.0` (in
  `backend/pyproject.toml` + 12 plugin lockfiles)

---

## What shipped this work-day (2026-05-20)

Long day. Six discrete arcs landed across `origin/main`:

| Arc | Commits | Scope |
|---|---|---|
| 1. Comics-Session-2 close | `c080974..80399cd` (7 commits) | Plugin-comics v1.1.0 — full editor + RCU canonical Tier extraction + PdfExportControls 3-surface rename + bubble-list endpoint Half-Wired-closure |
| 2. Backlog re-prioritization audit + apply | `281a6f6..13bbe87` (6 commits) | 4-Axes audit + 7 promotions + 17 demotions + 3 archives + 2 new LL filings + MOBILE-TRIAGE filed |
| 3. PAGES-CRUD-01 ship | `879df22..2869f3f` (4 commits) | Pages router moved from plugin-kinderbuch to backend core; PageLayout enum extended; ComicBookEditor empty-state Create-First-Page button |
| 4. Add-Panel diagnostic close | `ccf2f3c..534bea9` (3 commits) | Perception-lag fix (auto-select newly-created panel/bubble) + stale-bundle Lessons-Learned filing |
| 5. PluginForge 0.8.0 bump | `3fe8633..43f0429` (2 commits) | Closed RECURSION-LIMIT-REGRESSION-01; backend sweep restored 2116/2116; lockfile sweep across 12 plugins |
| 6. **Phase 1 (this session)** | `216b5a1..433d8ce` (6 commits) | Multi-Panel-Bug fix + 6 Standard Layouts + header LayoutPicker + i18n × 8 + Playwright + new "Playwright-visible ≠ User-visible" LL |

**Total work-day footprint:** 28 commits on `main`. Backend
baseline grew 2116 → 2116 (held); frontend Vitest 1748 → 1768.

---

## Phase 1 close summary

**`PLUGIN-COMICS-PHASE-1-MULTI-PANEL-LAYOUTS-01`** shipped in
6 commits closing user-findings #2 + #4.

| Commit | Scope |
|---|---|
| `216b5a1` | Walker: 4 new templates + 5 pytest cases + backlog filing + EXTENDED-FEATURES audit doc |
| `bf247a7` | Frontend mirror + 6 Vitest cases + 2 contract pins |
| `37e0113` | `ComicGridTemplatePicker.tsx` + 6 Vitest + ComicBookEditor wiring + explicit-default-template on create |
| `79a7e6f` | i18n × 8 catalogs (7 keys × 8 = 56 entries) |
| `93b032a` | Playwright `comic-book-multi-panel-layout.spec.ts` (4 cases) |
| `433d8ce` | Backlog close + archive + new LL "Playwright-visible ≠ User-visible" |

**Standard layout set on `main`:**

| Template | Cells | In picker? |
|---|---|---|
| `single_panel` | 1 | YES (default) |
| `grid_1x2` | 2 | YES |
| `grid_2x1` | 2 | YES |
| `grid_2x2` | 4 | YES |
| `grid_2x3` | 6 | YES |
| `grid_3x2` | 6 | YES |
| `grid_3x3` | 9 | NO (legacy / backward-compat) |

**Walker-frontend lockstep contract:** both surfaces carry the
canonical 7-template tuple + matching CSS. Diverging either
side breaks the contract-pin test on that side.

---

## Next-substantial-session candidate

### Phase 2: `PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01`

Filing TBD at session-start. Per the Phase 1 audit at
[docs/audits/extended-features-pre-inspection-2026-05-20.md](../audits/extended-features-pre-inspection-2026-05-20.md)
and the 4-user-findings re-anchor adjudication:

**Closes Findings #1 + #3 (bundled because they share the
side-pane integration point):**

- **Finding #1 (Panel-Image-Upload):** schema READY
  (`ComicPanel.image_asset_id` column exists per
  `backend/app/models/__init__.py:992`; PATCH endpoint
  accepts `image_asset_id`). NO migration needed.
- **Finding #3 (LayoutConfigComicPanel):** side-pane slot
  RESERVED at
  `frontend/src/components/ComicBookEditor.tsx:547-567` (the
  current `selectedPanelId && !selectedBubble` empty-state
  text branch). Tier1Section directly reusable.

### Phase 2 scope (estimate)

**6-8 commits, P2:**

1. **C1 `LayoutConfigComicPanel.tsx`** — new component +
   Tier1Section reuse for visual-style (border-style, border-
   width, border-color, background-color)
2. **C2 ComicBookEditor side-pane wiring** — replace
   `selectedPanelId` empty-state text branch with
   `<LayoutConfigComicPanel>`. 3-line edit.
3. **C3 Panel-image-upload UI** — file input + handler calling
   `api.assets.upload(bookId, file, "figure")` + `api.comics.
   updatePanel(bookId, panelId, {image_asset_id: asset.id})`
4. **C4 `assetUrls` wiring** — close the half-wired gap:
   `useEffect` in ComicBookEditor calls `api.assets.list(bookId)`,
   builds the asset-URL map, passes to ComicPanelGrid (currently
   ComicPanelGrid receives `undefined` so even with
   `image_asset_id` set the image wouldn't render)
5. **C5 i18n × 8 catalogs** — labels for the new LayoutConfigComicPanel
   surfaces (~10-15 keys per catalog)
6. **C6 Playwright smoke** — round-trip upload + render +
   delete-image + verify image disappears
7. **(optional C7) Backlog close + archive + LL filing if novel
   pattern**

**No backend migrations** (schema is fully ready).

### Phase 3 (deferred)

`PLUGIN-COMICS-SESSION-3-EXTENDED-FEATURES-01` (P3 in backlog;
BLOCKED-BY Phase 2 per cross-references) — 17-23 commit polish
work (drag-to-position, snap, undo, RTL, z-order, panel gutter,
auto-tail-direction, full E2E matrix). Q1-Q4 audit decisions
documented at the Phase 3 reference doc.

---

## PluginForge 0.9.0 bump — context for next session

**A new PluginForge version 0.9.0 is available** (current pin
in Bibliogon: `^0.8.0`).

### What's expected in 0.9.0 (per the prior PluginForge
improvements brief delivered 2026-05-20)

The brief at
[docs/journal/pluginforge-improvements-brief-2026-05-20.md](pluginforge-improvements-brief-2026-05-20.md)
proposed PluginForge 0.8.0 as the recursion-fix release (which
shipped). 0.9.0 was projected to deliver:

- **P1 Plugin-Lifecycle-State-Visibility** (richer
  `get_plugin_state` + lifecycle hooks)
- **P1 Plugin-Cross-Communication** (Service-Registry RFC)
- **P3 Plugin-Health-Check API** (canonical `health_check()`
  per plugin)
- **P3 Plugin error-recovery during `activate()`**
- **P3 FilterReason i18n hook**

**Reality may differ** — the PluginForge maintainer made the
final scope call. Confirm what 0.9.0 actually ships via:

```bash
gh release view v0.9.0 --repo astrapi69/pluginforge
# OR
curl -s https://pypi.org/pypi/pluginforge/0.9.0/json | jq '.info.summary, .info.description' | head -20
```

### Decision: bump-now vs defer

Two paths for the next session:

**(α) Bump first, then Phase 2** — confirm 0.9.0 changes don't
regress Bibliogon; if clean, bump + lock-all-plugins + verify
2116 baseline; then proceed to Phase 2. Risk: extra session
preamble; benefit: latest API surface available for Phase 2.

**(β) Phase 2 first, defer 0.9.0 bump** — Phase 2 doesn't
require PluginForge changes (it's frontend + asset-upload-UI).
Save the bump for a dedicated dependency-currency session.
Risk: nothing material; benefit: focus.

**Recommendation: (β).** Phase 2 has no PluginForge dependency.
File `PLUGINFORGE-V0-9-0-ADOPTION-01` (P3, recurring-dep-
currency-cycle) as a backlog entry; bump in its own session
when convenient.

### Pre-bump audit recipe (for whoever does the bump)

Per the 2026-05-19 V060/V070 adoption pattern:

```bash
# Check the changelog + breaking-changes notes
curl -s https://pypi.org/pypi/pluginforge/0.9.0/json | jq .info.description

# Compare against current 0.8.x pin
gh release list --repo astrapi69/pluginforge --limit 5
gh release view v0.9.0 --repo astrapi69/pluginforge

# Dry-run the bump
cd backend && poetry add "pluginforge@^0.9.0" --dry-run
```

If 0.9.0 carries deprecation-warnings for any current Bibliogon
plugin (e.g. multi-router shape per the
`PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01` open item) — those
get fixed during the bump session.

---

## Critical constraints (preserved)

- **Don't-push-unprompted** — strict
- **Atomic-green-per-commit-delta** — backend baseline 2116
  must hold across each new commit
- **Pre-Coding-Reality-Check** at the keystroke before any code
  (especially for Phase 2 side-pane wiring + assetUrls map
  construction)
- **Half-Wired-Lifecycle-Prevention** — Panel-Image-Upload UI
  + assetUrls map MUST ship together (writing image_asset_id
  without populating assetUrls is the C7 Comics-Session-2 gap
  that already exists today)
- **Recurring-Component-Unification** — Tier1Section reusable;
  do NOT duplicate panel-visual-style fields
- **CRUD-shipping-Read-mandatory** — image-upload writes
  `image_asset_id`; the assetUrls map IS the read-side closure
- **Playwright-visible ≠ User-visible** (new today) — use
  bounding-box dimension assertions for any visual-correctness
  contract; `toBeVisible()` alone is insufficient for CSS-
  collapse class bugs
- **Continuous-archival** — close items in the same commit
  that ships their work

---

## Open items / parallel work

The backlog after Phase 1 close:

- **P1 tier:** `(none)` — no active blockers
- **P2 tier (3 items):** KDP-PUBLISHING-WIZARD-01,
  RECURRING-COMPONENT-AUDIT-01, GETSTARTED-MULTIBOOK-TYPES-
  UPDATE-01
- **P3 tier (31 items)** including:
  - `PLUGIN-COMICS-SESSION-3-EXTENDED-FEATURES-01` (audit
    filed; BLOCKED-BY Phase 2)
  - `PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01` (P3;
    pluginforge 0.8.0 deprecation warning becomes 0.10.0 error;
    likely accelerated by 0.9.0 bump audit)
  - `MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01` (P3;
    Comics-Foundation-Trigger-Gate met now; could fire
    post-Phase-2)

### Decision for next session-opening

Choose ONE:
- (a) Phase 2 PANEL-CONFIG-01 (recommended; finishes the
  user-findings work)
- (b) Phase 3 EXTENDED-FEATURES-01 (deferred per audit;
  17-23 commits = 2 sessions)
- (c) PluginForge 0.9.0 bump (small; clears the dep-currency
  cycle but doesn't ship user value)
- (d) Mobile-Sync triage (β path; produces per-phase items)

---

## Files to read for next session

1. **This handover** — current state + Phase 2 scope + 0.9.0 note
2. **The companion resume prompt** —
   [session-prompt-2026-05-20-phase-2-resume.md](session-prompt-2026-05-20-phase-2-resume.md)
3. **Phase 1 close archive** —
   `docs/roadmap-archive/2026-05.md` "PLUGIN-COMICS-PHASE-1-
   MULTI-PANEL-LAYOUTS-01 close in 6 commits" section
4. **EXTENDED-FEATURES audit (Phase 3 reference)** —
   `docs/audits/extended-features-pre-inspection-2026-05-20.md`
5. **PluginForge improvements brief** —
   `docs/journal/pluginforge-improvements-brief-2026-05-20.md`
6. **ComicBookEditor side-pane code** —
   `frontend/src/components/ComicBookEditor.tsx:547-567` (the
   integration point for LayoutConfigComicPanel)
7. **LayoutConfigComicBubble (mirror pattern)** —
   `frontend/src/components/comics/LayoutConfigComicBubble.tsx`
8. **PageCanvas upload pattern** —
   `frontend/src/components/PageCanvas.tsx:464-478` (the
   `api.assets.upload(bookId, file, "figure")` precedent)
9. **ComicPanel + ComicPanelGrid** —
   `frontend/src/components/comics/ComicPanel.tsx` (renders
   `imageUrl` already, half-wired) +
   `frontend/src/components/comics/ComicPanelGrid.tsx` (consumes
   `assetUrls` already, half-wired)
10. **New Lessons-Learned** — `.claude/rules/lessons-learned.md`
    "Playwright-visible ≠ User-visible" (filed 2026-05-20)

---

## Session-end summary

| Item | Status |
|---|---|
| Comics-Session-2 | CLOSED on origin/main (plugin-comics v1.1.0) |
| PAGES-CRUD-01 | CLOSED on origin/main |
| Phase 1 MULTI-PANEL-LAYOUTS-01 | CLOSED on origin/main (this session) |
| PLUGINFORGE-RECURSION-REGRESSION | CLOSED on origin/main (pluginforge 0.8.0 bump) |
| Working tree | clean |
| Branch parity | local == origin/main |
| Backend baseline | 2116/2116 holds |
| Frontend Vitest | 1768/1768 |
| Findings #1 + #3 | OPEN — Phase 2 scope |
| Findings #2 + #4 | RESOLVED |
| PluginForge 0.9.0 | available; not yet bumped (recommend defer to dedicated session) |
| Next-substantial-session candidate | Phase 2 PANEL-CONFIG-01 |

Bibliogon is in a stable state for the next session to start.
