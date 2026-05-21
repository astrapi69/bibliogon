# Interactive-Canvas-Editor Exploration Filing

Fresh CC session. Document user's vision for future interactive comic-editor capabilities as exploration document.

## Context

User-Direction during 2026-05-23 Multi-Page-Navigation session:

> "in html kann viel bauen, ich hab mal in ein projekt gearbeitet und dort gab es eine seite mit der man sehr vieles machen konnte wie z.B. sprechblasen die konnte man per drag and drop verschieben. Figuren und andere objekte erstellen usw. So etwas könnte man auch machen aber das erst wenn die erste version stabil steht. das ist eher eine exploration."

Plus matched dass dies substantiell überlappt mit EXTENDED-FEATURES-01 sub-features (#1 Drag-to-position, #2 Snap, #3 Per-bubble-undo) aber geht darüber hinaus (Figure-Creation, generic-Object-Creation, interactive-canvas-editing-paradigm).

Plus matched dass Vision-Articulation jetzt-documenting prevents-loss-over-time plus produziert Foundation für späteren EXTENDED-FEATURES-Q1-Q4-Adjudication-Session.

## Filing Target

Save exploration at `docs/explorations/exploration-comic-interactive-canvas-editor.md`.

## Document Structure

```markdown
# Comic Interactive-Canvas-Editor Exploration

**Status:** OPEN (vision documented, not yet decisions)
**Filed:** 2026-05-23
**Trigger-Gate:** Comic-Foundation stable (Phases 1+2+Multi-Page-Navigation shipped)

## Context

[User-direction-quote verbatim plus situation-context]

## Vision-Articulation

User-articulated capability-set:

1. **Drag-and-Drop Speech-Bubble-Positioning**
   - Speech-bubbles freely positionable on panel-canvas via pointer-events
   - Already partially-scoped in EXTENDED-FEATURES-01 sub-features #1 + #2

2. **Figure-Creation**
   - Generic Figure-Primitives (silhouettes, shapes, simple character-templates?)
   - User adds Figures to panels independent of pre-defined-templates
   - Scope-Question: which figure-types? bitmap-asset-library OR vector-primitives OR both?

3. **Generic Object-Creation**
   - Beyond Speech-Bubbles + Figures: arbitrary user-defined objects
   - Examples: text-labels, shapes, sound-effects-text, captions
   - Scope-Question: open-ended toolbox OR curated-set-of-object-types?

4. **Interactive Canvas Editing**
   - Substantially-different editing-paradigm vs current panel-config-side-pane
   - Direct-manipulation: select-object-on-canvas, see-properties-side-pane, edit-properties-or-position
   - Plus inverse: drag-from-toolbox-onto-canvas

## Reference Project

User-mentioned: previous project had a page with similar capability. Plus matched dass das experience-grounding produziert für Bibliogon-Implementation.

## Overlap with EXTENDED-FEATURES-01

| EXTENDED-FEATURES Sub-Feature | Overlap with Vision |
|---|---|
| #1 Drag-to-position | Direct overlap |
| #2 Snap + nudge | Direct overlap (a11y mandate) |
| #3 Per-bubble-undo | Direct overlap |
| #4 Reading-direction LTR/RTL | Independent |
| #5 z-order controls | Direct overlap (needed for Object-creation layering) |
| #6 Panel-gutter UI | Independent |
| #7 TipTap-in-bubbles (DEFERRED) | Independent |
| #8 Full E2E matrix | Independent |
| #9 Auto-tail-direction | Independent |

**Plus beyond EXTENDED-FEATURES:**
- Figure-Creation: NEW capability not in EXTENDED-FEATURES scope
- Generic-Object-Creation: NEW capability not in EXTENDED-FEATURES scope
- Interactive-Canvas-Editing-Paradigm: substantial UX-paradigm-shift

## Implementation-Phases (speculative)

**Phase-Vision-1: EXTENDED-FEATURES-01 ship**
- Drag + Snap + Undo + z-order shipped per existing audit
- Foundation for canvas-interaction-patterns

**Phase-Vision-2: Figure-Library**
- Bibliogon-curated figure-primitives (simple shapes, silhouettes)
- Asset-Upload-Path for custom-figures
- Plus model: ComicFigure entity with position + scale + rotation?

**Phase-Vision-3: Generic Object-Toolbox**
- Text-labels, sound-effects, captions as first-class objects
- Plus extensibility: user-defined object-types?

**Phase-Vision-4: Direct-Manipulation Paradigm**
- Side-pane becomes properties-of-selected-object
- Toolbox plus canvas-interactions are primary UX
- Substantial-refactor of current panel-config-side-pane shape

## Trigger-Gate

Exploration triages when:
- EXTENDED-FEATURES-01 (Phase 3) shipped — Foundation for Vision-1
- User-Demand-Surface (User explicit-asks for Figure-Creation OR Object-Toolbox)
- Plus matched "first version stable" per user-direction

## Open Questions (for future triage-session)

- Figure-Library: bitmap OR vector OR both?
- Object-Toolbox: open-ended OR curated-set?
- Direct-Manipulation: full-refactor of side-pane OR additive-mode?
- Performance: canvas-rendering for many-objects-per-panel (50+ figures)?
- Mobile-compatibility: touch-events for drag/figure/object on phone?
- Plus matched MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01 cross-coupling

## Out-of-Scope (NOT this exploration)

- TipTap-in-bubbles (separate-DEFERRED per EXTENDED-FEATURES-01)
- Reading-direction LTR/RTL (separate-EXTENDED-FEATURES-01 sub-feature)
- Page-level operations (multi-page-nav shipped, page-delete-UI separate-filing)

## References

- 2026-05-21 EXTENDED-FEATURES-01 audit: `docs/audits/extended-features-pre-inspection-2026-05-20.md`
- 2026-05-20..23 Comic-Foundation arc (PAGES-CRUD + Phase 1 + Phase 2 + Multi-Page-Navigation)
- User-direction: 2026-05-23 chat-session

## Status

OPEN — vision documented, not yet decisions. Triage when trigger-gate fires.
```

## Filing Commit

Save document at `docs/explorations/exploration-comic-interactive-canvas-editor.md`. Single docs commit.

Plus matched dass exploration-document does NOT create backlog-entry. It is documented-vision waiting-for-trigger-gate. Per continuous-archival-rule plus per task-overview Pattern (Explorations are separate-category from Active-Backlog).

Commit message: `docs(explorations): file interactive-canvas-editor exploration (vision documented)`

Push autonomously per discipline-change 2026-05-21.

## Stop Conditions

Surface before continuing if:

- Existing exploration document covers same vision (avoid duplicate-filing)
- Vision-articulation requires more user-context than captured in 2026-05-23 chat-direction
- Exploration scope ambiguous (e.g. should this be 3 separate explorations: drag-canvas + figure-library + object-toolbox?)
- File-path conflicts with existing convention

## Applied Disciplines

- Audit-First (search for existing explorations before filing)
- Plain git status before commit (LL 2026-05-21)
- Documentation-as-Authority-Principle (capture user-direction-verbatim plus interpretation)
- Continuous-archival exception: explorations live in docs/explorations/, not docs/backlog.md
- Push autonomously per discipline-change 2026-05-21

## Phase Status After Filing

| Item | Status |
|---|---|
| exploration-comic-interactive-canvas-editor.md | filed at docs/explorations/ |
| Vision-articulation | documented |
| Trigger-Gate | defined (EXTENDED-FEATURES ship OR user-demand-surface) |
| Backlog entry | NOT created (per exploration-category-discipline) |
| Cross-references to EXTENDED-FEATURES | documented |

## References

- `docs/explorations/` directory (target)
- `docs/audits/extended-features-pre-inspection-2026-05-20.md` (overlap-reference)
- `.claude/rules/ai-workflow.md` (continuous-archival rule plus exploration-category-exception)
- 2026-05-23 chat-session (user-direction-source)

Proceed Step 1 verify-existing-explorations-before-filing. Then Step 2 file-document. Push autonomously.
