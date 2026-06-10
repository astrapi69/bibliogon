# Session-Handoff: Next Session Resume (2026-05-27, end-of-day)

## Current State

- HEAD: `08a6504` (`docs(text-stack): help DE + EN + close 3 backlog items + archive (C7)`)
- Branch: `main`, parity with `origin/main`
- Working tree: clean
- Backend pytest: **2294 passed, 1 skipped** (2295 collected)
- Frontend Vitest: **2186 passed** across 173 test files
- Plugin-export pytest: **321 collected** (whole suite); `test_picture_book_pdf.py` alone = 226 cases after this session
- i18n parity: **75/75** parity tests pass (8 languages, ~80+ keys per catalog after today's additions)
- Playwright specs: **70 smoke spec files (372 tests)** + **1 screenshots spec (29 tests)**
- Current version: **v0.38.0** (released 2026-05-26)

This handover replaces the morning-version (`79fd35f`) which was written before today's Storyboard + Text-Stack work.

## 2026-05-27 Session Arc Recap

Two major arcs shipped today (32 commits + 2 audit docs):

### Arc 1: Storyboard View (2 sessions, 16 commits)

**Session 1 (8 commits + audit doc):** Schema (4 nullable columns on `Page`: notes / story_beat / mood_color / act_group + Alembic migration) + Pydantic schemas + Storyboard read-only grid + drag-reorder via existing /reorder endpoint + `?view=storyboard` mount in BookEditor + PageEditor header button + i18n × 8 + Vitest pins.

**Session 2 (7 commits):** Inline notes editing + story-beat selector (6 values via native `<select>`) + mood-color preset palette (10 swatches) + act-group inline editing with grid-header grouping + i18n × 8 + Playwright smoke + help docs DE + EN + backlog archival.

- Backend pytest: 2269 → 2294 (+25)
- Frontend Vitest: 2080 → 2125 (+45)
- 34 `ui.storyboard.*` i18n keys × 8 catalogs = 272 entries
- **Closure:** `PICTURE-BOOK-STORYBOARD-VIEW-01` (P3)
- **3 P5 follow-ups filed** (Operations, Mood-Free-Picker, Drag-Cross-Group-Act-Update)
- Audit: [docs/audits/picture-book-storyboard-pre-inspection-2026-05-27.md](../audits/picture-book-storyboard-pre-inspection-2026-05-27.md)

### Arc 2: Picture-Book Text-Stack (2 sessions, 16 commits + audit doc)

**Session 1 (9 commits incl. audit + C1+C2 bundled):** Fix B per-layout namespace refactor of `Page.layout_config` (`{[layout]: {...}}` shape with backward-compat for legacy-flat configs) + PDF walker mirror + switch-→-switch-back preservation pin + Overlay Tier1+Tier2 sections (8 Visual-Style + 6 Typography fields) + overlay PDF walker emission + width/height sliders (Bug D scope-add) + Vitest pins + i18n × 8.

**Session 2 (7 commits):** Extract `computeTierTextStyles` shared helper (3-surface RCU justified) + Tier sections for image_top_text_bottom + Tier sections for image_left_text_right + PDF walker Tier emission for both layouts + cross-layout integration consistency pins + i18n × 8 (52 keys × 8 = 416 entries) + Playwright smoke (3 cases) + help docs DE + EN + close-out.

- Frontend Vitest: 2125 → 2186 (+61)
- Plugin-export `test_picture_book_pdf.py`: 130 → 226 cases (+96 net new in this file)
- ~120 new i18n keys (overlay + image_top_text + image_left_text + text_container_* + width/height) × 8 catalogs = ~960 entries
- **Closures:** `PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01`, `PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01`, `PICTURE-BOOK-TEXT-CONFIGURATION-01` (all P3)
- Key extractions: `computeTierTextStyles` (TS) + `_compute_tier_text_style` (Python mirror); `readLayoutNamespace` / `writeLayoutNamespace` / `looksNamespaced` (TS + Python mirror)
- Audit: [docs/audits/picture-book-text-stack-pre-inspection-2026-05-27.md](../audits/picture-book-text-stack-pre-inspection-2026-05-27.md)

### Cumulative Today Deltas

- Backend pytest: 2269 → **2294** (+25; all Storyboard schema round-trip + validation)
- Frontend Vitest: 2080 → **2186** (+106 across both arcs)
- Plugin-export pytest (test_picture_book_pdf.py file): +96 cases
- i18n parity holds 75/75 throughout; ~120 new keys total × 8 catalogs (~960 cells)
- Playwright spec files: +2 (`storyboard-annotations.spec.ts`, `picture-book-tier-sections.spec.ts`)
- 4 P3 backlog items closed; 3 P5 follow-ups filed

## Closures Today (4 P3 items)

| Item | Arc | Notes |
|---|---|---|
| `PICTURE-BOOK-STORYBOARD-VIEW-01` | Storyboard | Both scope halves shipped (MVP + annotations); operations deferred as P5 follow-up |
| `PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01` | Text-Stack | D1 MVP from v0.35.0; D2-D6 confirmed already shipped at Pre-Inspection; D4 active-migration filed separately |
| `PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01` | Text-Stack | Tier 1+2 + Bug D width/height shipped Session 1 |
| `PICTURE-BOOK-TEXT-CONFIGURATION-01` | Text-Stack | Tier 1+2 for all 3 image layouts + Fix B namespace refactor across Sessions 1+2 |

## Current Backlog State

| Tier | Count (per section header) | Notes |
|---|---|---|
| P0 | 0 | No deadlines / blockers / security |
| P1 | 0 | No architecture / hygiene debt |
| P2 | 0 | No high-value features queued |
| **P3** | **22** | Infrastructure / quality + small features (3 of these body-label as P5; see note below) |
| P4 | 28 | Roadmap / future phases |
| P5 | 9 | Speculative / nice-to-have |
| Blocked | 2 | Backlog-only blocked items (STARLETTE-V1-AWAIT-FASTAPI-01, CLICK-V8-3-AWAIT-GTTS-01) |
| **Total active** | **59** | (P3 + P4 + P5; excludes Blocked + Maintenance + ROADMAP cross-ref) |

**Section-vs-body note:** 3 storyboard P5 follow-ups (`PICTURE-BOOK-STORYBOARD-OPERATIONS-01`, `STORYBOARD-MOOD-FREE-PICKER-01`, `STORYBOARD-DRAG-CROSS-GROUP-ACT-UPDATE-01`) + `PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01` live in the P3 section header but body-label as P5. They were filed at the same location where the closed parent items sat. A future ROADMAP/backlog re-prioritisation could re-home them under the P5 header; not urgent.

## Multi-Day Totals (2026-05-24 through 2026-05-27)

- 3 releases: v0.36.0 (2026-05-23) → v0.37.0 (2026-05-25) → v0.38.0 (2026-05-26)
- ~35+ backlog items closed across the 4 days
- Today alone: 32 commits + 2 audit docs + 4 P3 closures + 3 P5 follow-ups filed + 4 new help pages (DE+EN × 2 features)

## Next-Substantial-Session Candidates

Picture-Book/Comics text-stack is complete. All remaining options listed below are either **trigger-gated** or **strategic** (require explicit user prioritisation):

### Picture-Book/Comics (all trigger-gated)

| Item | Tier | Scope | Trigger |
|---|---|---|---|
| `PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01` | P3 | 1-2 commits | Per-character font override in editor; user request OR Comic-Foundation session need |
| `PICTURE-BOOK-PDF-FRONT-MATTER-01` | P3 | 5-7 commits | Dedication/copyright/imprint pages in generated PDF; user request OR 2nd-book imprint need |
| `PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01` | P3 | TBD | age_range + print_format metadata; user feedback OR first KDP picture-book upload |
| `PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01` | P3 | XL multi-session | Multi-bubble + panel work for comics |
| `PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01` | P3 | small | Optional polish; SVG-tail primitive reusable in plugin-comics |
| `PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01` | P3-section/P5-body | small | D4 active-migration of legacy plain-text rows; no user impact today |

### Strategic New Features

| Item | Tier | Scope | Notes |
|---|---|---|---|
| `STORY-BIBLE-PLUGIN-01` | P3 STRATEGIC | 16+ commits | Greenfield plugin: 5-entity-type DB (Characters/Settings/Plot-Points/Items/Lore) + TipTap @-mention syntax + AI-template integration. Bundle-A in the 2026-05-15 exploration triage. |
| `WRITING-GOALS-PROGRESS-TRACKING-01` | P3 | 6-10 commits | If filed; check backlog (trigger: user daily-writing-habit need) |

### Settings Polish (deferred items)

| Item | Tier | Notes |
|---|---|---|
| `SETT-M-2-PER-TAB-SUBSECTION-HEADERS-01` | P3 | Partial-shipped (per-TAB done; per-subsection-within-tab pending, trigger-gated) |
| `SETT-M-4-SETTINGS-SEARCH-01` | P4 | Trigger-gated on user complaint or 15+ tabs (currently 13) |
| `SETT-L-2-FULL-RESPONSIVE-AND-SEARCH-01` | P5 | Speculative |
| `SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01` | P3 | Filed by 2026-05-16 hotfix session; trigger-gated |
| Toggle migration sweep (remaining 6 sites) | — | **Design-intent exemptions, NOT deferred work** per Toggle.tsx docstring |

### Quality / Hygiene

| Item | Tier | Notes |
|---|---|---|
| `RECURRING-COMPONENT-AUDIT-01` | P3 | Quarterly RCU sweep candidate; useful between feature waves |
| `THEME-TOKEN-COMPLETENESS-AUDIT-01` | P3 | Quarterly hygiene; filed 2026-05-15 |
| `TEST-ISOLATION-MODULE-STATE-01` | P3 | Sweep for `@lru_cache` / module-level state needing fixture clears |

### Non-Bibliogon Options

- adaptive-learner project
- PluginForge framework work
- Creative projects (Author voice, book idea generation, etc.)
- BFREI

### Recommended Direction

**User-Direction-Override always overrides.** All remaining backlog items are trigger-gated or strategic; next session requires explicit user direction. If no preference: the audit recommends one of:

1. **`PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01`** (smallest scope, 1-2 commits) — quick win as a transition between today's big shipments and the next big arc.
2. **`STORY-BIBLE-PLUGIN-01`** Pre-Inspection — if the next big strategic arc is what the user wants, this is the natural successor to the picture-book stack.
3. **Settings polish (SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01)** — keeps Settings UX consistent with the v0.38.0 sidebar work.

## Critical Constraints + Active Disciplines

Full lessons-learned live in `.claude/rules/lessons-learned.md` (auto-loaded). Most relevant to next session's likely work:

- **Recurring-Component-Unification Rule** (`coding-standards.md`): 2-surface threshold for UI patterns; 3-surface threshold for cross-cutting style helpers. Both fired today (Storyboard StoryboardCard stayed standalone — 3 conceptually-different shapes ≠ same component; `computeTierTextStyles` extracted as 3rd surface joined — same logic across 3 layouts).
- **Pre-Coding-Reality-Check** at boundaries: re-grep the touch surface before each commit-plan step; STOP + adjudicate if grep surfaces a conflict.
- **Half-wired-prevention** — both arcs fired this discipline: Storyboard C2 (Pydantic schemas + create wiring shipped together so a half-shipped C1 wouldn't expose 4 unsupported fields); Text-Stack C1+C2 bundled (writer change + reader change must ship atomically per Fix B contract).
- **Single-Source-of-Truth for cross-cutting concerns**: layout_config namespace shape mirrored exactly between TS + Python; `computeTierTextStyles` + `_compute_tier_text_style` ship byte-for-byte equivalent semantics; cross-layout consistency pinned in tests.
- **TipTap image node is `imageFigure`, not `image`** — any TipTap-emitting code must emit `imageFigure`.
- **Single-Router-Per-Plugin convention** — relevant if next session scaffolds plugin-comics extensions.
- **Atomic-green per commit-delta** — baselines stay green throughout (today: pytest 2294 / vitest 2186 / parity 75).
- **Numeric-Claims-Verification** — every test count / file count cited in commits + docs verified by actual command at write-time.
- **Push autonomously after atomic-green commits**; surface ONLY on Stop-Conditions or substantial architecture decisions.

### Key New Lessons / Patterns From Today

These are PATTERNS validated by today's work (worth keeping in mind, NOT new lessons-learned filings — they're applications of existing rules):

- **`mockClear` over `mockReset`** for `vi.mocked(api.x.method)` between tests (Storyboard S2-C1 fix for call-history leak between tests).
- **Native HTML primitives over Radix for Vitest reliability** (Storyboard S2-C2 BeatSelector uses native `<select>` — same brittleness rule as Radix DropdownMenu).
- **`<div role="button">` for cards that contain nested form controls** (Storyboard S2-C1 refactor + 5 Tier-section mount surfaces). `<button>` cannot legally nest a form control.
- **3-surface RCU extraction pattern**: extract the shared helper IN THE SAME COMMIT as the 3rd consumer landing. The extraction is a behavior-preserving refactor of the 1st surface; the new code is the 3rd consumer. Today: `computeTierTextStyles` (TS) + `_compute_tier_text_style` (Python).
- **Vitest cwd discipline** — fired ONCE during Text-Stack Session 2 C4 (ran from repo root → `document is not defined` cascade → fixed by cd'ing to frontend). The lessons-learned rule already covers this; pattern re-validated.

## Open Architecture-Decisions

None pending. All today's work closed cleanly; no architecture-debt carried over.

## Files to Read (in order)

1. **`docs/backlog.md`** — current open work, P3 tier first.
2. **This handover doc.**
3. **`docs/ROADMAP.md`** — thematic overview; current "Picture-Book & Comics Optimization" theme is largely closed.
4. **`docs/audits/picture-book-storyboard-pre-inspection-2026-05-27.md`** — for Storyboard architecture context.
5. **`docs/audits/picture-book-text-stack-pre-inspection-2026-05-27.md`** — for text-stack architecture context including Fix B + Tier sections.
6. **`.claude/rules/lessons-learned.md`** — auto-loaded; skim relevant sections.
7. **`.claude/rules/coding-standards.md`** — RCU + DRY rules.
8. **`backend/config/book-types.yaml`** — book-type registry (picture_book + comic_book entries).
9. **`docs/archive/roadmap/2026-05.md`** — full session-by-session deltas for today's closures.

## Push Convention

CC pushes autonomously after atomic-green commits. Surface ONLY on:
- Stop-Conditions (test red, audit-surfacing-architecture-decision, parallel-session-conflict)
- Substantial architecture decisions requiring user adjudication
- End-of-session summary

## End-of-Session Report

Per established convention. Include:
- Commits shipped (hash + subject)
- Test deltas (backend pytest + frontend Vitest + plugin-export + i18n parity)
- Disciplines re-validated
- Pre-Coding-Reality-Check findings (if any)
- Backlog state changes
- Next session candidate
