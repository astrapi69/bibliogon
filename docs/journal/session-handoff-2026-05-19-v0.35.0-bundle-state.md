# Session handover — v0.35.0 bundle state (2026-05-19)

Continuation handoff after the long 2026-05-19 session. Captures
the state of all four v0.35.0 work-streams + the pending user
re-smoke gate before 4c-B-2 starts.

---

## v0.35.0 sequence (user directive, "alles vor release")

```
1. Session 4c-B-1  (TipTap-Integration)       ✅ SHIPPED + 3 fix commits
2. Session 4c-B-2  (Tier-Property)            ⏳ NEXT after re-smoke green
3. Async-Import Phase 3                       ✅ SHIPPED
4. AUTHOR-SELECT-INPUT-EXTRACT-01
   + RECURRING-COMPONENT-AUDIT-01             ⏳ AFTER 4c-B-2
5. v0.35.0 release cut                        ⏳ AFTER all four
```

User runs manual smoke after each session before authorizing the
next. The 4 streams ship together as v0.35.0.

---

## CURRENT GATE: user re-smoke of 4c-B-1 fixes

3 fix commits shipped today against 4c-B-1 manual-smoke findings;
**user re-smoke is the blocker for 4c-B-2 starting**.

### What to re-smoke

1. **Finding C (BUG) — JSON in textarea after layout switch**
   - Repro the original: author text in a TipTap layout
     (image_top_text_bottom / image_left_text_right / text_only),
     switch to a Tier-Property layout (speech_bubble /
     image_full_text_overlay).
   - Expected: textarea shows the **plain text**, NOT the raw
     JSON.
   - Same for the **printed PDF** (export PDF, open in viewer):
     the rendered text should be plain text, not raw JSON.
   - Commit: `a731c30`.

2. **Finding A — 9-position anchor grid for speech_bubble**
   - Open a `speech_bubble` page's properties pane.
   - Expected: all **9 cells** of the 3×3 grid are clickable
     (previously only 5 — the 4 edge-midpoints were empty).
   - The 4 new positions: `top-center`, `middle-left`,
     `middle-right`, `bottom-center`.
   - Each cell has an aria-label tooltip (hover) + screen-reader
     label.
   - Commit: `ed87d50`.

3. **Finding B — visual separator more visible**
   - Open a page with `image_top_text_bottom` or
     `image_left_text_right` layout.
   - Expected: clear visual boundary between image region and
     text region (border 14% → 25% opacity, regionText
     background 5% → 10%).
   - `speech_bubble` + `image_full_text_overlay` intentionally
     unchanged (own backdrop styling).
   - `text_only` keeps the 5% tint (no image region to
     separate from).
   - Commit: `a69a54d`.

### Verification status

All 3 fixes are pushed to `origin/main`. Local test gate:

- Vitest: **1534 / 1534** passed
- Backend pytest (pages-routes + i18n + picture_book_pdf):
  **116 + 75 + 68** all passed
- tsc: clean

### If re-smoke surfaces more findings

Each new finding → its own Pre-Inspection STOP gate + user GO
before code. Same discipline as the original 3 findings.

---

## Session 4c-B-1 (TipTap-Integration) — SHIPPED

**5 main commits + 3 fix commits = 8 commits total.**

| Commit | Scope |
|---|---|
| `6d6278f` | C1: RichTextEditor wrapper (D1 MVP: StarterKit + TextAlign + Underline + TextStyle + Color) + 14 Vitest |
| `b6bc02f` | C2: PageCanvas per-layout discriminator (3 TipTap layouts → RichTextEditor; 2 Tier-Property → textarea) + D4 backward-compat + 15 new + 6 pivoted Vitest |
| `759719a` | C3: RichTextToolbar (11 D1 MVP buttons) + onEditorReady plumbing PageEditor→PageCanvas→RichTextEditor + 15+4 Vitest |
| `4aba793` | C4: Backend Pydantic dict-or-string transparency + 6 roundtrip pytest + Page model + schema docstring updates |
| `7aa108f` | C5: i18n 12 toolbar keys × 8 catalogs + 6 Playwright E2E (`e2e/smoke/picture-book-richtext.spec.ts`) |
| `a731c30` | Fix C: defensive plain-text extraction (frontend `extractPlainText` + backend `_extract_plain_text`) + 24 tests + 2 P3 backlog items |
| `ed87d50` | Fix A: anchor 5→9 + 9 i18n keys × 8 + aria-labels + 11 Vitest |
| `a69a54d` | Fix B: border 14→25% + tint 5→10% on 2 layouts + 1 updated + 1 new Vitest |

### Pre-Inspection decisions in effect

| Sub-decision | Choice |
|---|---|
| D1 | TipTap extensions = StarterKit + TextAlign + Underline + TextStyle + Color (MVP) |
| D2 | Per-layout discriminator (TipTap JSON for 3 layouts; plain string for 2). No Alembic; backend transparent |
| D3 | D6-C hybrid (inline TipTap in PageCanvas + properties-pane Toolbar) |
| D4 | No data migration; backward-compat on read (`parseTextContentToJson` + `extractPlainText`) |
| D5 | (4c-B-2 scope: 3 CollapsibleSections per surface — Visual Style / Typography / Layout) |
| D6 | D6-C confirmed |

### Key artifacts shipped

- `frontend/src/components/RichTextEditor.tsx` + tests
- `frontend/src/components/RichTextToolbar.tsx` + module CSS + tests
- `frontend/src/components/PageCanvas.tsx` per-layout branching + serialization helpers + `extractPlainText` export
- `frontend/src/components/PageEditor.tsx` tipTapEditor state + RichTextToolbar mount in properties pane
- `frontend/src/components/LayoutConfigSpeechBubble.tsx` 9-cell anchor grid + aria-labels
- `backend/app/models/__init__.py` Page docstring (per-layout convention)
- `backend/app/schemas/__init__.py` PageCreate docstring (same)
- `plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py` `_extract_plain_text` + `_render_page` wired
- `backend/config/i18n/*.yaml` × 8 catalogs: `ui.page_editor.toolbar.*` (12 keys) + `ui.page_editor.config.speech_bubble.anchor_position.*` (9 keys)
- `e2e/smoke/picture-book-richtext.spec.ts` — 6 E2E covering the full flow

---

## Session 4c-B-2 (Tier-Property) — NEXT after re-smoke green

**Pre-Inspection done; user-confirmed D1–D6 still apply.**

### Scope (estimated 6-9 commits, under the 9-commit stop-condition)

1. **CollapsibleSection** shared helper component + Vitest
2. **TypographyEditor + ColorPicker + DimensionSlider** shared sub-components + Vitest
3. **Bubble Tier 1+2 properties** (+10 properties beyond the current 3 anchor+opacity+size):
   - Tier 1 — Visual Style: `background_color`, `text_color`, `border_color`, `border_width`, `border_style`, `border_radius`, `shadow`
   - Tier 2 — Typography: `font_size`, `font_family`, `font_weight`, `text_align`, `line_height`
   - Plus `width` + `height` (the v0.34.0 scope-add deferred to this session)
4. **Overlay-Text Tier-Properties** (+10 properties on `image_full_text_overlay`):
   - Same Visual Style + Typography subset
   - Plus `width` + `height` for the text band
   - Plus `padding`
5. **PageCanvas style derivation** — consume the new properties via inline style for both surfaces
6. **i18n** in 8 catalogs (substantial — ~20 new keys per surface = ~40 total)
7. **Playwright E2E** covering both surfaces

### Backlog items (filed in S6 Commit 8, 9f7177f)

- `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01` (P3) — Bubble Tier 1+2 scope (this session)
- `PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01` (P3) — Overlay Tier-Properties (this session)
- `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-SHAPE-01` (P3) — Tier 3 future scope (NOT this session)
- `PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01` (P3) — closed by 4c-B-1 (mark archived when shipping v0.35.0)

### Recurring-Component Unification Rule applies

- **CollapsibleSection** is the canonical first-application — extract once, use in both Bubble + Overlay-Text surfaces. Per the rule's 2-surfaces threshold.
- Future audit (RECURRING-COMPONENT-AUDIT-01) may unify it with the 4 existing Radix Collapsible call-sites (CreateBookModal, SaveAsTemplateModal, MediumImportResult, MediumImportPreviewTable). NOT 4c-B-2 scope; filed for later.

### Stop-conditions

- Commit count > 9 → propose sub-split
- Deeper schema-discriminator issue (e.g. `layout_config` shape contention with future comic plugin) → surface
- Performance regression in PageCanvas with 20+ inline styles → surface

---

## Async-Import Phase 3 — SHIPPED

3 commits, parallel work-stream that landed during 4c-B-1
(not blocking, not blocked):

- `c380cc2` (Phase 2 frontend, slightly pre-handover): async-job context + SSE-driven progress wiring
- `cb7edc5`: Surface v0.31.0 comment-routing fields in result UI (MEDIUM-IMPORT-RESPONSE-INTERFACE-SYNC-01)
- `8595053`: Playwright smoke extension for async-path + SSE-driven progress UI
- `a7c53ff`: Render progress UI on remount after Run-in-background
- `ce6b85e`: Run-in-background badge + go-to-comments link
- `3c53054`: Persist result across navigation + reorder active content

These are part of the v0.35.0 bundle. User has presumably
already smoked this stream (didn't surface findings).

---

## AUTHOR-SELECT-INPUT-EXTRACT-01 + RECURRING-COMPONENT-AUDIT-01 — PENDING

**Runs after 4c-B-2 closes**, before v0.35.0 release cut.

Per the Recurring-Component Unification Rule (codified
2026-05-19 in `f06ae35`):

1. **Audit step**: grep all author-input + general
   recurring-pattern surfaces in the codebase.
2. **Extract `AuthorSelectInput`** as a shared component
   (currently duplicated in `ConvertToBookWizard` +
   `CreateBookModal`).
3. **Migrate all 4-5 usage sites** in one coordinated
   session:
   - `ConvertToBookWizard` (Bug 8 Phase 2)
   - `CreateBookModal` (shipped 2026-05-19 fix)
   - `ArticleEditor` author field
   - `BookEditor` author field
   - `BookEditor` backpage_author_bio sidebar
4. **Closes both backlog items** in the same session.

Backlog references:
- `AUTHOR-SELECT-INPUT-EXTRACT-01` (P3) — `docs/backlog.md`
- `AUTHOR-DATALIST-EXTEND-EDITORS-01` (P3) — pre-existing,
  closes alongside
- `RECURRING-COMPONENT-AUDIT-01` (P3) — frontend-wide audit

Estimated 7 commits (above the 5-commit stop-condition but
acceptable because the extraction is intrinsically multi-site
work; splitting would leave mixed-pattern state).

---

## v0.35.0 release cut — PENDING

Per `.claude/rules/release-workflow.md`. Cumulative scope at
release time:

- Picture-Book PDF Export (Session 6, 8 commits, shipped)
- Picture-Book Editor TipTap (4c-B-1, 8 commits, shipped)
- Picture-Book Editor Tier-Property (4c-B-2, ~6-9 commits)
- Async-Import Phase 3 (multiple commits, shipped)
- AUTHOR-SELECT-INPUT-EXTRACT-01 + audit (~7 commits)
- All bug fixes from manual-smoke rounds

**At cut time**: ~30+ commits since v0.34.1. Major minor bump
(many `feat:` commits) → version v0.35.0.

Aggregate Makefile targets shipped in v0.34.1 dep-refresh
make the release flow tighter:

- `make release-state`
- `make release-outdated`
- `make release-test`
- `make release-build`
- `make release-tag VERSION=0.35.0`
- `make release-publish VERSION=0.35.0`
- `make release-discover` (open-set version-literal discovery)

---

## Lessons-learned added today

3 lessons-learned rule extensions / additions in
`.claude/rules/lessons-learned.md`:

1. **"Half-wired feature lifecycle"** — extended with the 4th
   instance: dead `kinderbuch.css` (templating-asset shipped
   with NO code path that loads + applies it).
2. **"Single-source-of-truth for cross-cutting concerns"** —
   generalization of the version-pin SSoT pattern. Closed-set
   vs open-set drift; documented frontend/package-lock.json
   stale-version-field incident.
3. **"Recurring-Component Unification Rule"** — codified in
   `.claude/rules/coding-standards.md`. 2-surfaces threshold
   for UI patterns (stricter than the generic 3-duplicates
   DRY rule). Includes Pre-Inspection grep recipes + session-
   shape template.

Plus a memory note in
`/home/astrapi69/.claude/projects/.../memory/feedback_multi_tool_collaboration.md`
about the user's parallel-planning-and-execution workflow +
the role of the "Multi-tool collaboration tracking" rule.

---

## Tag list (current state)

```
v0.34.1   ← latest published
v0.34.0
v0.33.0
v0.32.0
...
```

Local commits ahead of `origin/main`: 0 (everything pushed).

Current canonical version: `0.34.1` (from `backend/pyproject.toml`).
v0.35.0 will be cut at the end of the 4-stream bundle.

---

## How to resume in a new session

1. Read this doc + the prompt in `docs/journal/session-prompt-2026-05-19-v0.35.0-bundle-resume.md`.
2. Confirm: re-smoke of the 3 fixes (C, A, B) — green or new findings?
3. If green → proceed to 4c-B-2 Pre-Inspection (sub-decisions
   D5 + the specific property lists already in this handover).
4. If red → new findings get their own Pre-Inspection STOP
   gates.

Per the user's discipline:
- NO automation code without explicit GO
- Atomic-green per commit (Vitest + tsc + relevant backend
  pytest each commit)
- Re-smoke after each session/sub-session close
- Stop-condition stays at ~5-9 commits per session;
  surface + propose split when approaching the limit
