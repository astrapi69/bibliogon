# Exploration-Features-2026-05-15 Evaluation — 2026-05-19

**Status:** Evaluation complete. ACCEPT/DEFER/REJECT/EXTEND decisions confirmed by user.

**Scope:** Read-only triage of the 10 features in
[docs/explorations/exploration-features-2026-05-15.md](../explorations/exploration-features-2026-05-15.md)
against Bibliogon's current shipped state + existing 65-item backlog +
formalised architecture disciplines.

**TL;DR:** 3 ACCEPT (file as new backlog items at their priority),
5 DEFER (trigger-gated for future, no backlog row), 1 REJECT (already
shipped), 1 EXTEND (file as P4 extension of existing surface). Net
backlog growth: +4 items (65 → 69). Decisions reflect the exploration
doc's own author-guidance ("file only 1-3 features actually planned for
next 2-3 months") tightened to the high-strategic-fit subset.

---

## Track A — Document Audit

- **Document:** `docs/explorations/exploration-features-2026-05-15.md`
- **Length:** 612 LOC
- **Filed:** 2026-05-15
- **Evaluated:** 2026-05-19 (4 days later)
- **Feature count:** 10
- **Categories:** 4 (Author-Workflow, Fiction-Workshop, Publishing, Bibliogon-Specific)
- **Complexity distribution:**
  - 1 XS (#3 Reading-Time)
  - 2 S (#2 Distraction-Free, #8 DOCX-Manuscript)
  - 3 M (#1 Writing Goals, #9 Article-to-Book, #10 Backup-Diff)
  - 1 L (#5 Outline)
  - 3 XL (#4 Story Bible, #6 KDP Wizard, #7 Multi-Language)
- **Strategic bundles proposed:** 4 (A Fiction-Workshop, B KDP-Pipeline, C Daily-Drivers, D Quick-Wins)

---

## Track B — Cross-Reference with Shipped + Existing Backlog

State at evaluation time: 65 active backlog items (P2: 1, P3: 35, P4: 7,
P5: 17, Blocked: 2, ROADMAP cross-ref: 3).

| # | Feature | Status | Cross-Reference |
|---|---------|--------|-----------------|
| 1 | Writing Goals + Progress Tracking | **GREENFIELD** | Not in backlog. Not shipped. |
| 2 | Distraction-Free Writing Mode | **COVERED** | Two fullscreen patterns shipped: `EnhancedTextarea` state-CSS pattern + `EDITOR-FULLSCREEN-NATIVE-01` browser-native pattern (closed 2026-05-18). Distraction-Free variant is the explicit trigger condition documented in `FULLSCREEN-PATTERN-RECONCILE-01` (P4, filed 2026-05-18). |
| 3 | Reading-Time Estimation | **GREENFIELD** | Not in backlog. Not shipped. |
| 4 | Character/Setting Database Plugin (Story Bible) | **GREENFIELD** | Not in backlog. Not shipped. |
| 5 | Outline/Structure View | **PARTIAL OVERLAP** | `PICTURE-BOOK-STORYBOARD-01` (P3) covers picture-book-specific drag-tree outline; cross-book-type general outline + beat-sheet templates not shipped. |
| 6 | KDP Publishing Workflow | **PARTIALLY SHIPPED** | plugin-kdp ships metadata generation, cover validation, BISAC + categories (Bug 9, 2026-05-16). NOT shipped: end-to-end wizard, pricing strategy, ARC management, pre-launch checklist, region-tax. `KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01` (P5) is the only related backlog entry. |
| 7 | Multi-Language-Book Workflow | **GREENFIELD** | plugin-translation exists (single-call translation API), but multi-language sync + side-by-side editor + translation-status tracking not shipped. |
| 8 | DOCX-Manuscript Export | **GREENFIELD** | Pandoc DOCX export exists via manuscripta pipeline, but the Manuscript-format variant (Times New Roman 12pt, double-spaced, 1-inch margins, page headers) not shipped. |
| 9 | Article-to-Book Conversion | **SHIPPED** | `frontend/src/components/articles/ConvertToBookWizard.tsx` is in production. Existing follow-up `CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01` (P3) handles UX polish (dialog jumping + button-position shift). |
| 10 | Backup-Comparison/Diff-View | **PARTIALLY SHIPPED** | Two-backup file compare shipped via `BackupCompareDialog`, relocated to Settings → Backups by `BOOKDASHBOARD-CLEANUP-01` (closed 2026-05-18). NOT shipped: per-Article diff, per-Settings diff, selective-restore. |

---

## Track C — Architecture-Discipline Lens

### Plugin-Metadata 3-Source Pattern (`.claude/rules/architecture.md`)

Fires on **#4 Story Bible** — a new plugin requires the full pattern:
- Canonical `backend/config/plugins/story-bible.yaml` (UI metadata + settings defaults)
- `plugin.py` class attrs (identity + contract)
- Generated `plugins/bibliogon-plugin-story-bible/plugin.yaml` (build-time copy for ZIP)

Filing this as P2 commits the maintainer to the 3-source discipline.

### Recurring-Component-Unification (2-surfaces threshold)

| Candidate pair | Extraction |
|---|---|
| #5 Outline ↔ `PICTURE-BOOK-STORYBOARD-01` | Both are drag-tree visualisations of structured content. Shared `OutlineTreeView` extracts cleanly when the second surface lands. |
| #10 entity-diff renderer ↔ `BackupCompareDialog` | Per-field diff is duplicate logic; reusable `DiffRenderer` component. Captured in `BACKUP-DIFF-DEEP-VARIANTS-01` filing notes. |
| #4 entity types (Character / Setting / PlotPoint / Item / Lore) | Same CRUD pattern × 5 → extract `EntityCRUDView`. Per the 2-surfaces threshold, extraction happens in the SAME session as the second entity type, not deferred. |

### Half-Wired-Lifecycle Prevention

Two high-risk features need explicit STOP-gate notes in their backlog entries:

- **#6 KDP Wizard**: Wizard-step-without-consumer is the canonical write-without-reader trap. Shipping the wizard's "ARC management" panel without the export pipeline reading the ARC list = purgatory feature. Backlog filing notes: incremental shipping requires per-step Pre-Inspection confirming the consumer side exists.
- **#7 Multi-Language Workflow** (DEFERRED): side-by-side editor without sync-status tracking creates orphan "translation drift" — a state-write surface (English translation) with no consumer (drift indicator). Documented as DEFER trigger: do not start until sync-status semantics are scoped.

### Single-Source-of-Truth

- **#1 Writing Goals**: per-session word-count storage decision (DB `WritingSession` table vs computed-on-demand from `Article/Book/Chapter.updated_at` + content diff). SSoT for "did I write today?" must be authoritative. Backlog filing notes both options.
- **#4 Story Bible**: cross-references between entities + chapters must derive from a single source (the entity's canonical record), not duplicate text into the chapter content.

---

## Track D — Effort + Bandwidth Reality

Solo-dev bandwidth + existing 65-item backlog + the exploration doc's
own author-guidance:

> "But: 10 backlog items added at once would clutter the
> already-43-item backlog. Recommendation: file only the 1-3 features
> user actually plans to develop in next 2-3 months."

The backlog has grown from 43 (doc-time) to 65 (today). Filing all
8+ ACCEPTs would add ~12% backlog mass in a single docs commit —
compounds the same problem the doc's own author warned against.

User-confirmed approach: file 3 ACCEPTs (the high-strategic-fit
subset), DEFER the rest with explicit trigger conditions.

---

## Decisions

### ACCEPT (3 items, file as new backlog rows)

| # | Title | Priority | Trigger | Effort |
|---|---|---|---|---|
| 4 | Story Bible Plugin | **P2** | Strategic-fit highest for Aster's multi-genre fiction (SciFi + Kinderbuch + Comics). Plugin model means optional opt-in. | XL (16+ commits, multi-session) |
| 6 | KDP Publishing Workflow (Wizard) | **P2** | Strategic differentiator. Builds on already-shipped plugin-kdp foundation. | XL (16+ commits, multi-session) |
| 1 | Writing Goals + Progress Tracking | **P3** | Classic author-tool feature (Scrivener + Ulysses precedent). | M (6-10 commits) |

### DEFER (5 items, trigger-gated for future sessions)

| # | Feature | Defer reason | Trigger condition |
|---|---|---|---|
| 2 | Distraction-Free Writing Mode | Folded into `FULLSCREEN-PATTERN-RECONCILE-01` (P4, filed 2026-05-18) — Distraction-Free IS the canonical 3rd surface that triggers the reconcile. Filing it as a separate item would duplicate the P4 entry's trigger language. | When the user requests a 3rd fullscreen surface OR when the Recurring-Component-Unification 2-surfaces threshold fires on the existing two patterns. |
| 3 | Reading-Time Estimation | Trivial XS (1-3 commits). Not worth a backlog row in advance per the doc's "don't clutter" guidance. | When a session-slot opens with no higher-priority work AND the user requests reader-facing reading-time. |
| 5 | Outline/Structure View | Cross-book-type general outline + beat-sheet templates. Tightened out of the ACCEPT-3 per F1 decision. Coordinates with `PICTURE-BOOK-STORYBOARD-01` when both land. | When `PICTURE-BOOK-STORYBOARD-01` (P3) ships AND the user requests a cross-book-type outline view OR a beat-sheet template (Save the Cat / Hero's Journey / Three-Act). At that point, the Recurring-Component-Unification rule fires on the storyboard pattern + this new surface — extract `OutlineTreeView` shared component in the SAME session. |
| 7 | Multi-Language-Book Workflow | XL scope + complex side-by-side editor UX + Half-Wired risk (translation-drift indicator must ship with side-by-side, not after). Defer until #4 Story Bible OR #6 KDP Wizard ships and real bandwidth is known. | When German-author-with-KDP-global-audience demand surfaces explicitly OR when AI-translation quality (existing plugin-translation) is validated as production-ready. |
| 8 | DOCX-Manuscript Export | Tightened out of the ACCEPT-3 per F1 decision. Quick win when slot opens. | When the user requests Beta-Reader workflow OR Traditional submission workflow OR when manuscripta gains a Manuscript-format template upstream. |

### REJECT (1 item, documented for audit-trail)

| # | Feature | Closure |
|---|---|---|
| 9 | Article-to-Book Conversion | **SHIPPED.** `frontend/src/components/articles/ConvertToBookWizard.tsx` is live production code. The exploration's "Status: Prompt-Ready" path was followed — the wizard was implemented after the exploration was filed. Existing follow-up `CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01` (P3) handles the UX polish (dialog dimensions jumping between steps + final-step "Create Book" button position shift). |

### EXTEND (1 item, file as P4 extension of existing surface)

| # | Title | Priority | Trigger |
|---|---|---|---|
| 10 | Backup-Diff Deep Variants (per-Article / per-Settings / selective-restore) | **P4** | Existing `BackupCompareDialog` covers two-backup file compare. The exploration's deep-variants (per-Article diff in a backup, per-Settings diff, selective rollback from a specific backup) are user-feedback-gated. Filed as `BACKUP-DIFF-DEEP-VARIANTS-01` (P4) with trigger "user requests granular diff OR selective restore". |

---

## Net backlog change

| Tier | Before | After | Delta |
|---|---|---|---|
| P2 | 1 | 3 | +2 (Story Bible, KDP Wizard) |
| P3 | 35 | 36 | +1 (Writing Goals) |
| P4 | 7 | 8 | +1 (Backup-Diff Deep Variants) |
| P5 | 17 | 17 | 0 |
| Blocked | 2 | 2 | 0 |
| ROADMAP cross-ref | 3 | 3 | 0 |
| **Total** | **65** | **69** | **+4** |

Growth: +6.2%. Under the 50% session stop-condition threshold.

---

## Discipline-violations or risks identified

1. **Mass-filing risk** — pre-tightening recommendation was 5 ACCEPTs; user tightened to 3 per the doc's own author-guidance. Audit trail preserved here.
2. **Plugin-architecture commitment for #4 Story Bible** — filing as P2 commits multi-session investment in a new plugin (3-Source-Plugin-Metadata-Pattern + plugin scaffold + TipTap @-mention extension). Surface as strategic decision, not just a backlog row. Documented in the backlog filing's "Pre-Inspection note" field.
3. **Half-Wired risks on #4 + #6** — both are XL features. Backlog entries call out that incremental shipping requires per-step Pre-Inspection confirming consumer surfaces exist.
4. **DEFER trigger-condition discipline** — each DEFER item has an explicit, observable trigger. No silent indefinite deferrals.

---

## Deliverables

| # | Artefact | Status |
|---|---|---|
| 1 | This audit doc (`docs/audits/exploration-features-2026-05-15-evaluation.md`) | THIS COMMIT |
| 2 | `docs/backlog.md` — 4 new items (STORY-BIBLE-PLUGIN-01 P2, KDP-PUBLISHING-WIZARD-01 P2, WRITING-GOALS-PROGRESS-TRACKING-01 P3, BACKUP-DIFF-DEEP-VARIANTS-01 P4) | Next commit |
| 3 | `docs/explorations/exploration-features-2026-05-15.md` — append `## Evaluated 2026-05-19` section with per-feature ACCEPT/DEFER/REJECT/EXTEND markers + backlog-ID cross-references | Third commit |

---

## Questions and assumptions

- **Assumption (Track B #6 KDP wizard scope)**: "K-01 through K-04" suffix in the exploration doc title suggests the feature was originally roadmap'd as 4 phases. plugin-kdp shipped phases 1-2 (metadata + cover validation + BISAC). Phases 3-4 (wizard + pricing + ARC) become the KDP-PUBLISHING-WIZARD-01 backlog entry. Treating the entry as "phase 3+4 of the original K-01..K-04 plan" — verify with user when implementation starts.
- **Assumption (Track B #5 outline)**: `PICTURE-BOOK-STORYBOARD-01` is picture-book-scoped per its name. A general "Outline View" across all book_type values would be a cross-type generalisation. Confirmed by the user's F1 tightening that DEFERs #5 — they agree the picture-book-specific item is sufficient for the current cycle.
- **No STOP-blocking questions came up during evaluation.** All 4 categorisation decisions (F1-F4) were resolved with the user before this commit.
