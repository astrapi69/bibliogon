# Session-Handoff: Next Session Resume (2026-05-26, end-of-day)

## Current State

- HEAD: `5a959d1` (`docs(help): close-out screenshot sweep (C3)`)
- Branch: `main`, parity with `origin/main`
- Working tree: clean
- Backend pytest: **2269 passed, 1 skipped** (2270 collected)
- Frontend Vitest: **2080 passed** across 171 test files
- i18n parity: **51/51** parity tests pass (75/75 keys per catalog × 8 languages, +6 keys added during v0.38.0)
- Playwright specs: **68 smoke** + **9 main suite** + **1 manual screenshots project** (27 tests)
- Current version: **v0.38.0** (released 2026-05-26)

This handover replaces the morning-version (`eacf9a8`) which was written before the v0.38.0 release, the help-docs work, and the screenshot sweep all landed.

## Recent Session Arc (2026-05-26 — single day, multi-session)

### Shipped Today

| # | Item | Commits | Surface |
|---|---|---|---|
| 1 | SETT-PHASE-1-QUICK-WINS-01 | 9 | Dashboard-view grouping, SSH-Key card, Editor tab extraction, sectionTitle standardization, HelpText component, White-Label collapsible, SectionHeader + per-section descriptions |
| 2 | SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01 | 4 | Allgemein → Erscheinungsbild + Verhalten + Erweitert; obsolete AppSettings.tsx removed |
| 3 | SETT-PHASE-3-TOGGLE-COMPONENT-01 | 4 | New `<Toggle>` component, 5 canonical-shape sites migrated (NOT 15 — design-intent exemptions documented; see "Recently Closed / Skipped" below) |
| 4 | SETT-AUTHORS-TAB-CONSOLIDATION-01 | 2 | Autor + Autoren-Datenbank → single Autoren tab + LEGACY_TAB_REDIRECTS |
| 5 | SETT-L-1 Sidebar Redesign | 5 | Horizontal tabs → left sidebar (5 groups), mobile menu extracted, group headers + Danger Zone red accent, 5 new i18n keys × 8 catalogs, 7-case Playwright smoke |
| 6 | Article Dashboard nav-jump fix | 1 | Medium-Import → split-button; symmetric headerSeparator |
| 7 | **v0.38.0 RELEASED** | 4 | CHANGELOG + version bump (20 files via `make sync-versions`) + tampered-token flake fix + post-release docs |
| 8 | HELP-DOCS-V0.37.0-GAPS-01 | 3 | 6 topics × DE + EN = 12 pages, 5 Playwright screenshots, new `e2e/screenshots` project |
| 9 | Doc accuracy sweep | 1 | README + README-de v0.36.0 → v0.38.0, CLAUDE.md Frankenstein paragraph trim, Toggle "remaining 10" → "design-intent exemptions" correction across 3 surfaces |
| 10 | Documentation screenshot sweep | 3 | 22 new + 5 regen + 3 stale deleted (30 PNGs total), 14 help-doc updates, 27-test Playwright generator |

### Cumulative Test Deltas (this session day only)

- Backend pytest: 2269 (no change; pure refactor + docs + bug-fix day)
- Frontend Vitest: 2063 → 2080 (+17 from SETT-L-1 C1-C3 pins)
- i18n parity: 75 → 81 keys per catalog (+5 sidebar nav/group labels in SETT-L-1, +1 article import-chevron tooltip)

### Multi-Day Totals (2026-05-24 through 2026-05-26)

- 3 releases: v0.36.0 (2026-05-23) → v0.37.0 (2026-05-25) → v0.38.0 (2026-05-26)
- ~30 backlog items closed
- See archive: `docs/archive/roadmap/2026-05.md`

## Current Backlog State

| Tier | Count | Notes |
|---|---|---|
| P0 | 0 | No deadlines / blockers / security |
| P1 | 0 | No architecture / hygiene debt |
| P2 | 0 | No high-value user features queued |
| **P3** | **23** | Infrastructure / quality + small features |
| P4 | 28 | Roadmap / future phases |
| P5 | 9 | Speculative / nice-to-have |
| Blocked | 7 | Upstream-wait (npm publish, paid-API access, hardware, etc.) |
| **Total active** | **60** | (P3 + P4 + P5; excludes Blocked) |

## Next Session Direction: Picture-Book & Comics Stack

User has explicitly directed next session toward the Picture-Book / Comics optimization stack. Relevant P3 items from ROADMAP "Picture-Book & Comics Optimization" theme:

### Primary Candidates

**1. PICTURE-BOOK-STORYBOARD-VIEW-01** (P3, 10-15 commits, standalone)

Storyboard overview for Picture-Book authoring — author sees entire story-flow at a glance. Brainstorming captured 2026-05-18; no immediate action filed.

- New `Page` columns (all nullable, backward-compat by default-NULL): `notes` (text), `story_beat` (enum), `mood_color` (string), `act_group` (string) + Alembic migration.
- Grid-view of all pages as thumbnails + per-page summary (title + first line + layout preview).
- Drag-reorder via @dnd-kit (reuse existing thumbnail-sidebar pattern).
- Add-page-inbetween / duplicate-page / split-page / merge-pages operations.
- Story-structure annotations: page notes, story-beat tag (Setup / Inciting / Rising / Climax / Falling / Resolution), mood color, act group.
- Disciplines flagged in the filing: Single-Source-of-Truth (reuse `page.position`); Recurring-Component-Unification 2-surface rule (PageThumbnail extraction between sidebar + storyboard); future Comic-Plugin reuse target.
- Schema-foundation pre-commit question: if `PICTURE-BOOK-TEXT-CONFIGURATION-01` lands its own session before Storyboard, should it pre-commit the Storyboard schema columns? Defer the decision to Pre-Inspection.

**Why this is the recommended starting point:** standalone (no required paired sibling), high author-daily-value (32-40-page KDP picture-books need pacing overview), schema is purely additive nullable columns (low risk), explicit RCU 2-surface case for PageThumbnail extraction.

**2. PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01** (P3, 6-9 commits standalone)

Wire TipTap rich-text editing into picture-book page text regions for `image_top_text_bottom` + `image_left_text_right` + `text_only` layouts. **D1 MVP shipped in v0.35.0** (4c-B-1 commits `f17a93d..a731c30`); D2-D6 remain open.

- D2: storage schema variants (rich-text vs plain-text per layout)
- D3: toolbar placement decisions
- D4: migration of legacy plain-string rows to TipTap JSON
- D5: read-only PDF render consolidation
- D6: editor-placement variants

**Pairs with PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01** (same session per 2026-05-18 user confirmation). Paired session: 10-13 commits.

**3. PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01** (P3, 4-6 commits standalone, 10-13 paired)

Apply the Tier-Property pattern to the `image_full_text_overlay` text band — sibling to bubble-extended-properties work but for the overlay text region. ~10-12 properties: font-size, font-family, font-weight, text-color, text-align, background-color, opacity, width, height, line-height, padding.

Pairs with #2 above. If shipped together: shared CollapsibleSection helper extraction per RCU rule.

**4. PICTURE-BOOK-TEXT-CONFIGURATION-01** (P3, 6-9 commits)

Tier 1 + Tier 2 text config across image-based layouts. CollapsibleSection extraction sibling.

### Smaller PB/Comics Items (trigger-gated)

- **PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01** (P3, 1-2 commits) — trigger-gated
- **PICTURE-BOOK-PDF-FRONT-MATTER-01** (P3, 5-7 commits) — trigger-gated
- **PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01** (P3) — trigger-gated
- **PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01** (P3, 1 commit) — trigger-gated

### Comics Items (separate scope)

- **PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01** — multi-bubble + panel work; reframed 2026-05-18 to plugin-comics scope.
- **PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01** — optional picture-book polish; SVG-tail primitive reusable in plugin-comics.

### Recommended Start

Pre-Inspection for **PICTURE-BOOK-STORYBOARD-VIEW-01** (standalone; explicit author-daily-value; clean RCU + schema-additive shape).

User direction can override toward the TipTap + Overlay paired stack (#2 + #3 combined, 10-13 commits) if preferred. **User-Direction-Override always overrides.**

## Critical Constraints + Active Disciplines

Full lessons-learned live in `.claude/rules/lessons-learned.md` (auto-loaded each session). The following are most relevant to PB/Comics work:

- **Recurring-Component-Unification Rule** (`coding-standards.md`): 2-surface threshold for UI patterns; extract + migrate ALL sites in the same coordinated session. STORYBOARD-VIEW explicitly flags the PageThumbnail extraction case.
- **Single-Source-of-Truth for cross-cutting concerns**: STORYBOARD-VIEW must reuse `page.position` (no parallel ordering shape).
- **Pre-Coding-Reality-Check** (re-audit at the keystroke, not just the audit): grep for existing parallel surfaces before introducing new ones; STOP + adjudicate if grep surfaces a conflict.
- **Half-wired feature lifecycle** — frontend-shape variant: every state-write needs a render-consumer in the same commit chain; every Tier-Property write needs the corresponding renderer.
- **Architecture-doc consultation as part of Pre-Inspection**: grep `docs/architecture/` + `docs/explorations/` + `docs/audits/` for any topic matching the component class being designed.
- **Plain `git status` before every commit + explicit-paths-only**: especially when parallel work might be on the working tree.
- **Module-level caches survive test boundaries**: any new service module with `@lru_cache` or module-level state needs a bidirectional `yield`-based autouse fixture clearing state.
- **Schema "preserved" / "always set" claims must survive real-data audit** before becoming spec.
- **TipTap image node in Bibliogon is `imageFigure`, not `image`** — any TipTap-emitting code (importer / converter / migration) must emit `imageFigure`.
- **Single-Router-Per-Plugin convention** for any new plugin scaffolding (plugin-comics extension is the immediate candidate).
- **Atomic-green per commit-delta** — pytest 2269 + Vitest 2080 baselines stay green throughout.
- **Numeric-Claims-Verification** — any test count / file count / item count mentioned in commits or docs is verified by running the actual command at write time.
- **Push autonomously after atomic-green commits**; surface ONLY on Stop-Conditions or substantial architecture decisions.

## Recently Closed / Skipped (Multi-Tool-Coordination context for next session)

- **HELP-DOCS-V0.37.0-GAPS-01** closed by `383cfeb` (extended to also cover v0.38.0 Settings-UX overhaul). 6 topics × DE + EN shipped.
- **SETT-M-2-PER-TAB-SUBSECTION-HEADERS-01** annotated as **partial-shipped** (per-TAB SectionHeader done via SETT-QW-7; per-subsection-within-tab still pending, effort revised 3-4 → 2-3 commits, trigger-gated).
- **SETT-M-4-SETTINGS-SEARCH-01** stays trigger-gated (user complaint OR 15+ tabs; currently 13).
- **SETT-L-2-FULL-RESPONSIVE-AND-SEARCH-01** stays P5 speculative.
- **Toggle migration sweep** skipped per Task-2 audit + α adjudication: the 6 remaining checkbox sites in Settings sub-components are intentional design-intent exemptions documented in `Toggle.tsx`'s docstring (2 inline label-after-checkbox + 3 white-label-core list-row + 1 generic `ScalarSettingField`).
- **Pre-existing test flake fixed during v0.38.0 release-test**: `test_tampered_token_rejected` had a base64-collision flake (~1.5% of runs); flipped tampering char from `X` → `!` (commit `fa77960`).
- **CLAUDE.md Frankenstein paragraph**: yesterday's release-doc-update Edit only replaced the opening sentence; v0.37.0 Batch 1/2 prose stayed concatenated mid-paragraph in the v0.38.0 line. Trimmed in `2bd9ad4`.

## Open Architecture-Decisions

None pending. All v0.38.0 work closed cleanly; no architecture-debt carried over.

## Files to Read (in order)

1. **`docs/backlog.md`** — current open work, P3 tier first (PB/Comics items start at line 498).
2. **This handover doc.**
3. **`docs/ROADMAP.md`** — thematic overview, "Picture-Book & Comics Optimization" theme.
4. **`.claude/rules/lessons-learned.md`** — auto-loaded; skim relevant sections (TipTap, Schema-preserved, RCU, Half-wired-lifecycle, Architecture-doc-consultation).
5. **`.claude/rules/coding-standards.md`** — RCU + DRY rules; relevant for PageThumbnail extraction.
6. **`backend/config/book-types.yaml`** — book-type registry (picture_book + comic_book entries).
7. **Relevant backlog entries** — `grep -A 40 "PICTURE-BOOK-STORYBOARD" docs/backlog.md` and siblings.
8. **`docs/explorations/picture-book-page-layouts.md`** (if exists) — layout decisions relevant for STORYBOARD-VIEW + TipTap-integration siblings.
9. **`docs/archive/roadmap/2026-05.md`** — closed-this-month context, especially the SETT-* chain and the help-doc + screenshot sweeps.

## Push Convention

CC pushes autonomously after atomic-green commits. Surface ONLY on:
- Stop-Conditions (test red, audit-surfacing-architecture-decision, parallel-session-conflict)
- Substantial architecture decisions requiring user adjudication
- End-of-session summary

## End-of-Session Report

Per established convention. Include:
- Commits shipped (hash + subject)
- Test deltas (backend pytest + frontend Vitest + i18n parity)
- Disciplines re-validated
- Pre-Coding-Reality-Check findings (if any)
- Backlog state changes
- Next session candidate
