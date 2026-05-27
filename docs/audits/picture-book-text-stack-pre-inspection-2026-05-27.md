# Picture-Book Text-Stack — Pre-Inspection Audit

**Date:** 2026-05-27
**Backlog items:** `PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01` (D2-D6 remaining) + `PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01` + `PICTURE-BOOK-TEXT-CONFIGURATION-01` (incl. Fix B sub-item)
**Source:** [docs/backlog.md:498-865](../backlog.md)
**Status:** Audit complete; STOP for adjudication before any code-write.

---

## TL;DR

The user's premise of "ship D2-D6 + Overlay-Tier-Properties + Text-Configuration as a paired stack" overstates the remaining work. Audit reality:

- **D2-D6 of TIPTAP-INTEGRATION-01 are mostly already shipped.** D1 MVP shipped the RichTextEditor + 11-button RichTextToolbar + parseTextContentToJson read-side migration shim. D2 storage schema (TipTap JSON vs plain string), D3 toolbar placement (D6-C properties-pane), D5 read-only PDF render (`_render_tiptap_doc` in `picture_book_pdf.py`), and D6 editor placement (D6-C) are DONE in v0.35.0. Only D4 batch-migration is unshipped — and per `parseTextContentToJson`'s read-time wrapping it has zero user-visible impact.
- **`Tier1Section` + `Tier2Section` components ALREADY EXIST** as extracted reusables (frontend/src/components/comics/Tier1Section.tsx + Tier2Section.tsx, from Comics-Session-2 C5). They were already extracted from the speech_bubble Tier-Property work. Extending them to other layouts is wiring, not framework-creation.
- **CollapsibleSection extraction is NOT a prerequisite.** The `Tier1Section` + `Tier2Section` components use Radix.Collapsible directly. A shared `<CollapsibleSection>` wrapper is filed as P3 cleanup; not blocking this work.
- **Fix B (layout_config namespace per-layout) is real foundational work** — touches dispatcher + 4 config bodies + PageEditor handler + PageCanvas readers + PDF walker + migration heuristic. ~3-5 commits standalone.
- **The genuine new work** consolidates to: (1) Fix B foundation, (2) extend Tier1+Tier2 sections to image_full_text_overlay, (3) extend Tier1+Tier2 sections to image_top_text_bottom + image_left_text_right, (4) width/height sliders for image_full_text_overlay (Bug D scope-add). Estimated **10-15 commits across 2 sessions.**

8 architecture-decisions surfaced with recommended defaults. User adjudication required before code-write.

---

## Track 1: D1 MVP State

D1 MVP shipped in v0.35.0 via PB-PHASE4 Session 4c-B-1 (commits `f17a93d`, `ba91f59`, `3fef46d`, `a731c30`). What's live:

| Surface | Location | Status |
|---|---|---|
| `RichTextEditor.tsx` | [frontend/src/components/RichTextEditor.tsx](../../frontend/src/components/RichTextEditor.tsx) | Shipped |
| Extensions | StarterKit + TextAlign + Underline + TextStyle + Color + FontFamily | Shipped |
| `RichTextToolbar.tsx` (11 buttons) | [frontend/src/components/RichTextToolbar.tsx](../../frontend/src/components/RichTextToolbar.tsx) | Shipped |
| `parseTextContentToJson()` (read-side legacy unwrap) | [frontend/src/components/PageCanvas.tsx](../../frontend/src/components/PageCanvas.tsx) lines 35-69 | Shipped |
| `extractPlainText()` (TipTap→plain for layout-switch) | [frontend/src/components/PageCanvas.tsx](../../frontend/src/components/PageCanvas.tsx) lines 108-149 | Shipped |
| `_render_tiptap_doc` in PDF walker | [plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py](../../plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py) | Shipped |
| RichTextEditor mounted in PageCanvas (D6-C placement) | PageCanvas.tsx lines 757-768 | Shipped |
| RichTextToolbar mounted in properties pane | PageEditor.tsx via `onEditorReady` callback | Shipped |
| Vitest: RichTextEditor.test.tsx + RichTextToolbar.test.tsx | frontend/src/components/ | Shipped |

**Layout split (TIPTAP_LAYOUTS constant):** `image_top_text_bottom`, `image_left_text_right`, `text_only` → RichTextEditor. `speech_bubble`, `image_full_text_overlay` → plain `<textarea>`.

---

## Track 2: D2 Storage Schema

`Page.text_content` is a single `Text` column carrying ONE of TWO discriminated shapes per the PB-PHASE4 Session 4c-B-1 D2 decision:

| Layout | Storage |
|---|---|
| `speech_bubble` | Plain string |
| `image_top_text_bottom` | TipTap JSON (`{"type":"doc","content":[...]}`) |
| `image_left_text_right` | TipTap JSON |
| `image_full_text_overlay` | Plain string |
| `text_only` | TipTap JSON |
| `comic_panel_grid` | (comic-book scope; not relevant here) |

**Backend stores transparently.** No JSON validation at the Pydantic layer; no per-layout discriminator at the SQL layer. All discrimination is **frontend-driven** by the layout key.

**Read-side migration is already wired** via `parseTextContentToJson()`: if `text_content.trimStart().startsWith("{")`, parse as JSON; otherwise wrap as `{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:<raw>}]}]}`. This handles legacy plain-text rows seamlessly on read; no batch migration needed for user-visible correctness.

**Layout-switch defensive read** (`extractPlainText()`) handles the reverse: when a page switches from TipTap-layout to Tier-Property-layout, the textarea sees plain text even if the DB still holds JSON.

**D4 active-migration is NOT shipped.** A batch SQL UPDATE wrapping legacy plain-text rows for TipTap layouts is filed as separate work. **User-visible impact is zero** because `parseTextContentToJson` handles it on read.

A separate backlog item `PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01` (P3, [line 498](../backlog.md#L498)) covers active conversion on layout-switch (FROM TipTap TO Tier-Property only — symmetric direction is already handled by parseTextContentToJson).

---

## Track 3: D3-D6 Remaining Scope

| Item | Status | Notes |
|---|---|---|
| **D3 — Toolbar placement** | DONE | D6-C decision: properties-pane placement via `onEditorReady` callback. Shipped in 4c-B-1. |
| **D4 — Migration of legacy plain-string rows** | NOT SHIPPED | Filed under `PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01` (P3). Zero user-visible impact today because read-side wrapping handles it. |
| **D5 — Read-only PDF render** | DONE | `_render_tiptap_doc` in `picture_book_pdf.py` emits structured HTML (bold/italic/underline/headings/lists/alignment/font-family). |
| **D6 — Editor placement** | DONE | D6-C decision shipped. |

**Conclusion: D2-D6 is effectively complete.** Only D4 active-migration remains, and it's filed separately + has zero user-impact today. Not part of this session's scope unless explicitly requested.

---

## Track 4: Overlay Text Tier-Properties

The backlog wants ~10-12 Tier-Property fields on `image_full_text_overlay` text band: font-size, font-family, font-weight, text-color, text-align, background-color, opacity, width, height, line-height, padding.

**Current `image_full_text_overlay` state:**

- `LayoutConfigImageFullTextOverlay` component ([frontend/src/components/LayoutConfig.tsx](../../frontend/src/components/LayoutConfig.tsx) lines 257-341) ships ONLY 2 controls: `text_position` (top/middle/bottom dropdown) + `text_backdrop_opacity` (slider).
- PageCanvas renders the text band with hardcoded CSS-module styling — no Tier-Property inline-style derivation.
- PDF walker `_image_layout_style` likewise emits static CSS.

**Reference: speech_bubble Tier-Property pattern (already shipped):**

- `LayoutConfigSpeechBubble.tsx` mounts `Tier1Section` (Visual Style, 8 fields: background_color, opacity, border_color, border_width, border_style, border_radius, shadow, shadow_intensity, padding) + `Tier2Section` (Typography, 6 fields: font_family, font_size, font_weight, text_color, text_align, italic) as collapsed-by-default Radix.Collapsible sections.
- PageCanvas `speechBubbleInlineStyle(layout_config)` reads layout_config.bubbles[0] + flat-fallback + applies defaults → returns `React.CSSProperties`.
- PDF walker `_speech_bubble_style(config)` (`picture_book_pdf.py` lines 345-523) mirrors the TypeScript exactly + emits inline-style for WeasyPrint.

**bubbles[0] nesting wrapper** (4c-B-2 C1 convention) — speech_bubble layout writes via `{bubbles: [{...prior, ...fields}]}` instead of flat keys. Allows future multi-bubble (a single page with N bubbles).

**Extension to image_full_text_overlay:** mount the SAME `Tier1Section` + `Tier2Section` in `LayoutConfigImageFullTextOverlay`; add PageCanvas style-derivation; add PDF walker mirror. **Components already exist.** The question is whether non-bubble layouts adopt the bubbles[0] wrapper (consistency) or use flat keys (simplicity).

---

## Track 5: Text-Configuration (Tier 1 + Tier 2)

The backlog wants Tier 1 + Tier 2 across ALL image-based layouts (image_top_text_bottom + image_left_text_right + image_full_text_overlay).

**Overlap with Track 4:** image_full_text_overlay is a member of both Track 4 and Track 5. Track 4 is the special case; Track 5 is the superset. **Treating Track 5 as the canonical workstream simplifies the design: one Tier-section extension, three target layouts, with image_full_text_overlay also getting the Bug D scope-add (width/height sliders).**

**Property set differences between bubble and text-region:**

| Bubble Tier 1 (8 fields) | Bubble Tier 2 (6 fields) | Text-Region needs |
|---|---|---|
| background_color, opacity, border_color, border_width, border_style, border_radius, shadow, shadow_intensity, padding | font_family, font_size, font_weight, text_color, text_align, italic | All of Tier 1 + all of Tier 2 + (overlay only) text_container_width + text_container_height |

**The bubble property set is a SUPERSET of what text regions need** (text regions don't need a border, since they don't have a bubble outline). But the existing `Tier1Section` already has all 8 fields; non-bubble layouts can simply ignore the border fields by setting `border_style: none` as a default. OR `Tier1Section` accepts a `visibleFields` prop to filter the property set per call-site.

**text_only layout has NO config UI today** (LayoutConfig dispatcher returns null for text_only). Whether text_only deserves Tier 1+2 is an A-decision (A7 below).

**Fix B (layout_config namespace per-layout)** is the foundational refactor. Today's flat dict pollutes across layouts (a page that wears speech_bubble → image_full_text_overlay leaves `anchor_position`, `opacity`, `text_position` all co-resident). Fix B namespaces by layout:

```python
layout_config = {
    "speech_bubble": {"bubbles": [{...}]},
    "image_top_text_bottom": {"image_position": "...", "image_fit": "...", "tier1": {...}, "tier2": {...}},
    "image_full_text_overlay": {...},
}
```

Touches: dispatcher + every config body component + `PageEditor.handleUpdateLayoutConfig` + PageCanvas readers + PDF walker + best-effort heuristic migration on first-read. **Filed as 4c-B sub-item per the backlog.** Estimated 3-5 commits standalone.

---

## Track 6: RCU Assessment

| Component | Current state | Decision |
|---|---|---|
| `Tier1Section` + `Tier2Section` | Already extracted (frontend/src/components/comics/). Extracted from speech_bubble work. | **Reuse as-is.** Mount in additional config bodies; no further extraction needed. |
| `<CollapsibleSection>` wrapper | NOT extracted; Tier sections use Radix.Collapsible directly. | **Defer.** P3 cleanup; not blocking this session. Tier sections work well with direct Radix usage. |
| `<TierPropertiesEditor>` parameterized | NOT extracted. Backlog mentions it as "possible further extraction". | **Defer.** Tier1Section + Tier2Section already are the unified components; further wrapping is premature abstraction. |
| `<SpeechBubbleInlineStyle>` / equivalent style-derivation | Per-layout style functions in PageCanvas (`speechBubbleInlineStyle`, etc.). | **Pattern-Reuse.** Each new layout gets its own per-layout style function mirroring the bubble pattern; no shared extraction yet (2-surfaces rule fires on convergent shape, not on style-function-count). |
| PDF walker style functions | Per-layout `_speech_bubble_style`, `_image_layout_style`. | **Same as frontend.** Per-layout functions; no shared extraction. |

**No new RCU extractions needed for this session.** All needed shared components already exist.

---

## Track 7: Scope + Session-Split

### Consolidated workstreams

| Track | Work | Commits |
|---|---|---|
| **A — Fix B foundation** | layout_config namespace per-layout refactor + migration heuristic + walker mirror + tests | 3-5 |
| **B — Tier sections on image_full_text_overlay** | Mount Tier1+Tier2 in LayoutConfigImageFullTextOverlay + PageCanvas style-derivation + PDF walker mirror + width/height sliders (Bug D) + tests | 3-4 |
| **C — Tier sections on image_top_text_bottom + image_left_text_right** | Mount Tier1+Tier2 in both image-row layouts + PageCanvas style-derivation per layout + PDF walker mirror per layout + tests | 3-4 |
| **D — i18n + E2E + Help docs + archival** | New i18n keys × 8 catalogs + Playwright spec + DE+EN help page + backlog archival | 2-3 |

**Total estimate: 11-16 commits.** Under the 20-commit Stop-Condition.

### Session-split (recommended)

**Session 1: Fix B Foundation + Overlay Tier Sections (6-9 commits)**

- C1: Fix B layout_config namespace refactor (dispatcher + 4 config bodies + PageEditor handler)
- C2: Fix B PageCanvas readers (speechBubbleInlineStyle + image_* readers)
- C3: Fix B PDF walker mirror (_speech_bubble_style + _image_layout_style)
- C4: Fix B migration helper (read-time heuristic: anchor_* → speech_bubble, text_* → text-region layouts, image_* → image-region layouts) + switch-→-switch-back preservation test
- C5: Mount Tier1+Tier2 in LayoutConfigImageFullTextOverlay + PageCanvas style-derivation
- C6: PDF walker mirror for image_full_text_overlay Tier-Property styling
- C7: Width/height sliders for image_full_text_overlay (Bug D scope-add)
- C8: Vitest pins for Fix B + overlay Tier sections
- C9 (optional): i18n keys × 8 catalogs for any new strings

**Session 2: Tier Sections on image_top + image_left + close-out (5-7 commits)**

- C1: Mount Tier1+Tier2 in LayoutConfigImageTopTextBottom + PageCanvas style-derivation
- C2: PDF walker mirror for image_top_text_bottom
- C3: Mount Tier1+Tier2 in LayoutConfigImageLeftTextRight + PageCanvas style-derivation
- C4: PDF walker mirror for image_left_text_right
- C5: Vitest pins for both
- C6: Playwright E2E smoke for Tier-section editing across image layouts
- C7: i18n + DE+EN help page + backlog archival

### Independence vs coupling

- **Fix B must ship before** any Tier-section extension that writes to `layout_config[layout]` namespace. Or: Tier sections ship with backward-compat wrappers that work with both flat AND namespaced layout_config. Defer to Pre-Coding-Reality-Check at Session 1 C5 if Fix B foundation is solid enough.
- **Sessions 1 and 2 are independently shippable.** Session 1 ships the Overlay layout fully. Session 2 ships the other two. The split is on "biggest user-visible value first" — image_full_text_overlay is the most-requested layout for text typography per backlog (Bug D).

---

## Track 8: Architecture Decisions — STOP for adjudication

| # | Decision | Default | Alternatives | Rationale |
|---|---|---|---|---|
| **A1** | text_content storage shape | **No change.** Keep single Text column with frontend-driven per-layout discrimination + `parseTextContentToJson` read-side wrapping. | (a) Split into per-layout columns (b) Add SQL-level CHECK constraint | (a) breaks the layout-switch text-preservation flow that PB-PHASE4 D2 settled. (b) Pydantic-level discrimination is the existing convention (Page.layout, Chapter.chapter_type both use Literal in Pydantic, not SQL ENUM). |
| **A2** | D4 active-migration of legacy plain-text rows | **DEFER.** `parseTextContentToJson` makes this zero-user-impact. Filed as `PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01` (P3). | Ship a batch SQL UPDATE in this session as a data-hygiene sweep | Defer keeps scope tractable. Active migration is filed against real triggers (backend consumer requiring pure-plain-text for Tier-Property layouts). |
| **A3** | Fix B (layout_config namespace per-layout) | **Ship in Session 1 C1-C4 as foundation.** Per backlog "4c-B sub-item: bundle with 4c-B so the new typography keys land in the namespaced shape from day one rather than requiring a second migration." | (a) Defer Fix B; ship Tier extensions in flat dict and re-migrate later (b) Defer entire text-stack until Fix B has its own session | (a) violates "schema/data shape change as foundation" rule; doing it later means re-migrating a 2nd time. (b) blocks user value waiting for a foundation that's tractable in the same session. |
| **A4** | CollapsibleSection extraction | **DEFER.** Tier1Section + Tier2Section use Radix.Collapsible directly; works fine. P3 cleanup separately filed. | Extract `<CollapsibleSection>` in Session 1 as RCU prep | RCU 2-surface threshold already crossed (Tier1Section, Tier2Section) but the existing extraction satisfies it. Further wrapping is premature. |
| **A5** | `<TierPropertiesEditor>` super-parameterized component | **DEFER.** Mount Tier1Section + Tier2Section directly in each layout's config body. | Extract higher-order `<TierPropertiesEditor>` that takes `tier1Fields` + `tier2Fields` + `visibleFields` props | The 2-3 mount-points (image_top + image_left + image_full + bubble) all need the same fields. A higher-order wrapper would save ~10 lines per call-site at the cost of indirection. Direct mounts are clearer. |
| **A6** | Tier 1+2 property scope | **All 14 bubble fields applied to all 3 image layouts**, with non-applicable fields (border_*) defaulting to "none" so they don't render. Image_full_text_overlay also gets +2 dimension fields (width, height) per Bug D. | Subset per layout (e.g. drop border_* from non-bubble layouts) | Single canonical Tier1+Tier2 shape across all layouts means consistent UI + identical readers + identical PDF walker. Subsetting per layout creates per-layout-property-set fragmentation. Border defaults to "none" → border doesn't render. |
| **A7** | text_only layout | **NO Tier 1+2 config in v1.** text_only has no image; Tier 1 background/border properties don't apply. Tier 2 typography would apply but the layout currently has no config UI at all. | (a) Add Tier 2 typography only (b) Add full Tier 1+2 | text_only is the simplest layout; adding config opens a UX question (where to mount the dispatcher when text_only currently returns null). Defer to a separate filing if author demand surfaces. |
| **A8** | Session split | **Session 1: Fix B + Overlay (6-9c). Session 2: image_top + image_left + close-out (5-7c).** Total 11-16c. | (a) One mega-session (11-16c) (b) 3-session split (Fix B alone / Overlay alone / image_top+left alone / close-out alone) | (a) violates 5-commit stop-condition + half-wired-prevention if any commit fails mid-stream. (b) over-fragmented; Sessions 1+2 are independently coherent. |

---

## Pre-Coding-Reality-Check Findings

Run before any code-write per lessons-learned. Findings:

- **Tier1Section + Tier2Section already exist + are extracted.** RCU 2-surface threshold ALREADY satisfied by their original extraction. Mount-extension to new layouts is wiring, not framework-creation.
- **D2-D6 of TIPTAP-INTEGRATION-01 are mostly already shipped.** The handover framing "ship D2-D6" overstates work; the actual remaining D4 is filed separately and has zero user-impact today.
- **Fix B is the only foundational refactor.** All other work is mount-extension + per-layout style functions. No new shared abstractions needed.
- **No new dependencies.** All needed primitives (Radix.Collapsible, color-picker via existing CommonStyleControls, slider via existing Range) already in the codebase.
- **Architecture-doc consultation:** `docs/explorations/picture-book-page-layouts.md` exists? Let me check whether it's relevant. (Not done in this Pre-Inspection; will check at code-write time if it surfaces concerns.)
- **No STOP-conditions surfaced.**

---

## Stop-Conditions (per resume-prompt)

- ❌ D1 MVP has unexpected bugs or half-wired state — NO. D1 MVP is solid; only D4 is open and it's filed separately.
- ❌ layout_config namespace change (Fix B) is a prerequisite that expands scope significantly — PARTIALLY. Fix B IS in-scope per backlog "4c-B sub-item: bundle with 4c-B"; expanding scope is the right call to avoid double-migration.
- ❌ speech_bubble Tier-Property pattern too different to share — NO. Tier1Section + Tier2Section already share. The same components apply directly to other layouts; non-applicable fields default to "none".
- ❌ Total scope exceeds 20 commits — NO. 11-16 commits across 2 sessions.

All clear. Audit ready for adjudication.

---

## Questions and Assumptions

- **Evidence-based (D2-D6 mostly shipped):** Verified via Explore agent's audit of RichTextEditor.tsx, RichTextToolbar.tsx, PageCanvas.tsx, picture_book_pdf.py. All 4 of D3/D5/D6 are confirmed shipped; D4 is the only open item and is filed separately.
- **Evidence-based (Tier1Section + Tier2Section extracted):** Verified via Explore agent's audit pointing at `frontend/src/components/comics/Tier1Section.tsx` + `Tier2Section.tsx`. The `comics/` subdirectory naming is misleading (they're the canonical Tier sections, not comic-specific).
- **Parked assumption:** Fix B migration heuristic specifics — should the first-read converter strip stale keys aggressively or preserve them under their inferred-layout namespace? Recommended default: preserve under inferred namespace (anchor_* → speech_bubble, etc.), per backlog's "best-effort heuristic on existing key prefixes". Final decision at C1 commit time after seeing real test fixtures.
- **Parked assumption:** Whether non-bubble layouts adopt the bubbles[0] wrapper for storage consistency or use flat keys for simplicity. Recommended default: flat keys at the layout's namespace level (`layout_config["image_full_text_overlay"] = {font_family: ..., font_size: ...}`) — no bubbles[0] equivalent because there's only ONE text region per non-bubble layout.
- **STOP-blocking question — NONE.** All A-decisions have recommended defaults; user adjudication is to confirm or override, not to resolve uncertainty.

---

## Files to Read Before Implementation

1. [frontend/src/components/PageCanvas.tsx](../../frontend/src/components/PageCanvas.tsx) (TIPTAP_LAYOUTS constant, parseTextContentToJson, speechBubbleInlineStyle)
2. [frontend/src/components/LayoutConfig.tsx](../../frontend/src/components/LayoutConfig.tsx) (dispatcher pattern)
3. [frontend/src/components/LayoutConfigSpeechBubble.tsx](../../frontend/src/components/LayoutConfigSpeechBubble.tsx) (reference Tier1+Tier2 mount pattern)
4. [frontend/src/components/comics/Tier1Section.tsx](../../frontend/src/components/comics/Tier1Section.tsx) + Tier2Section.tsx (the reusables)
5. [frontend/src/components/PageEditor.tsx](../../frontend/src/components/PageEditor.tsx) `handleUpdateLayoutConfig` (Fix B touch-point)
6. [plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py](../../plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py) (`_speech_bubble_style`, `_image_layout_style`, `_render_tiptap_doc`)
7. [docs/backlog.md:498-865](../backlog.md) (the 5 related backlog entries + Fix B sub-item)

---

## End of Pre-Inspection

**Next action:** STOP for user adjudication on A1-A8. After adjudication, proceed with Session 1 C1-C9 per the plan above.
