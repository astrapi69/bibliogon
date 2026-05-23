---
title: Pre-release UX/UI consistency audit
date: 2026-05-12
scope: Deliverable 3 of the pre-release verification chain for v0.31.0
author: Claude Code (verification, NOT code change)
status: STOP gate — user reviews before any code change
---

# Pre-release UX/UI audit — 2026-05-12

Scope: UI surfaces added between v0.30.0 (2026-05-08) and HEAD on
2026-05-12. **NOT** a visual review — this audit cannot judge
colour, spacing, or hierarchy. It checks cross-component pattern
consistency, i18n parity across 8 catalogs, accessibility
primitives, dark-mode plumbing, and forbidden-pattern compliance.

Companion docs:
- `pre-release-coverage-2026-05-12.md` (D1, coverage gaps)
- `pre-release-verification-2026-05-12.md` (D2, full test-suite run)

---

## Method

For each new UI surface, the audit checked:

1. **Pattern compliance** vs `.claude/rules/architecture.md`:
   - Radix UI for dialogs / dropdowns / tabs (no `<dialog>`,
     no custom modal scaffolds)
   - `api/client.ts` for API calls (no raw `fetch()` in
     components)
   - `notify` wrapper / react-toastify (no `console.log` for
     user feedback, no `window.confirm` / `alert` / `prompt`)
   - Lucide icons only
2. **i18n parity** vs `backend/config/i18n/{en,de,es,fr,el,pt,tr,ja}.yaml`:
   - All 5 new namespaces present in every catalog
   - Strings actually translated (not English fallbacks left in
     place)
   - Each `t(...)` call site resolves to a real key
3. **Accessibility primitives**:
   - Icon-only buttons carry `aria-label` (or visible text
     sibling)
   - Dialogs use `Dialog.Title` + `Dialog.Description`
   - Keyboard navigation via Radix primitives (focus trap)
4. **Theming / dark mode**:
   - All colours go through CSS variables (`var(--...)`)
   - Hardcoded hex / rgb only as `var(...)` fallbacks
   - Vars referenced actually exist in `frontend/src/styles/global.css`
5. **E2E hooks**: `data-testid` on every interactive element

What was NOT checked (out of scope for a non-visual audit):
- Layout, alignment, spacing rhythm
- Colour contrast vs WCAG AA/AAA
- Focus-ring visibility
- Motion / transition feel
- Mobile / touch ergonomics
- Screen-reader announcement order under real AT

Files read: 14 component / context / page files in
`frontend/src/`, the 8 i18n catalogs, `frontend/src/styles/global.css`,
`docs/help/_meta.yaml`, `mkdocs.yml`,
`plugins/bibliogon-plugin-help/bibliogon_help/routes.py`.

---

## Findings summary

| Severity | Count |
|----------|-------|
| BLOCKER (must fix before v0.31.0) | **0** |
| IMPROVEMENT (file as backlog, ship without) | **6** |
| CONSISTENT (verified compliant) | **8** |

No blockers. The single most material finding is **i18n
catalog drift** for 3 of the 5 new namespaces (ai_template,
bulk_ai_fill, comments) — 6 of 8 languages contain the
namespace structure but with un-translated English strings in
every value. The drift is non-blocking because the affected
catalogs render English copy in production (not "[missing
key]") — the user reads English instead of e.g. Spanish, but
the UI functions. This is consistent with the v0.30.0
launcher-i18n `review_status: "pending native speaker"`
precedent.

---

## Findings

### BLOCKER (must fix before v0.31.0)

None.

### IMPROVEMENT (file as backlog, ship without)

1. **i18n drift across `ai_template`, `bulk_ai_fill`,
   `comments` namespaces in 6 of 8 catalogs.** Spot-checked
   line-by-line in `es.yaml`, `fr.yaml`, `el.yaml`, `pt.yaml`,
   `tr.yaml`, `ja.yaml` (lines 1630-1781 for `ai_template`,
   1744-1781 for `bulk_ai_fill`, 1782-1812 for `comments`).
   Every value in these three namespaces is a verbatim copy
   of the English string (e.g. `field_class_dialog_title: "Bulk AI fill: pick field-classes"`
   identical across en, es, fr, el, pt, tr, ja; only de carries
   the real translation `"Massen-KI-Füllung: Feldgruppen wählen"`).
   Structural parity is intact: all 8 catalogs are 1813 lines
   exactly and every key the components reference is present —
   so `t(...)` never falls through to the in-source fallback,
   it always resolves. The drift is invisible to a key-presence
   check; it surfaces only on actual content read. Recommended
   action: file a backlog item analogous to launcher i18n
   review (e.g. `I18N-FRONTEND-AI-TEMPLATE-REVIEW-01`),
   document the affected catalogs in a top-of-namespace
   `_meta.review_status: "pending native speaker"` block, ship
   v0.31.0 with English-rendered AI Template / bulk AI fill /
   comments UI in 6 languages.

2. **`mkdocs.yml` orphans the AI Templates subsection.**
   `docs/help/_meta.yaml:160-170` declares an `AI Assistent`
   parent (`slug: ai`) with children `[ai, ai/ai-templates]`,
   but `mkdocs.yml:133` only lists `- KI-Assistent: de/ai.md`
   as a single page — `de/ai/ai-templates.md` and
   `en/ai/ai-templates.md` exist on disk but are not in the
   nav. **In-app help is unaffected**: the help plugin reads
   `_meta.yaml` directly
   (`plugins/bibliogon-plugin-help/bibliogon_help/routes.py:50-55`),
   so the in-app side-nav surfaces the new page correctly.
   Only the public MkDocs site (https://astrapi69.github.io/bibliogon/)
   hides it. The `make verify-docs-discipline` gate already
   flags this in D2's full-suite run; the fix is one
   `make verify-mkdocs-nav --write` (or equivalent) before
   tag-push.

3. **`--surface-2` and `--danger-bg` CSS vars are referenced
   in 9 new components but NEVER defined in
   `frontend/src/styles/global.css`.** Components in scope
   (`AITemplatePanel`, `FieldClassDialog`,
   `TemplateImportDropZone`, `BulkAiFillDock`,
   `BulkAiFillConfirmDialog`, `BulkTemplateImportDialog`,
   `NewFromTemplateButton`, `CommentsAdminSection`,
   `articles/ArticleCommentsPanel`) all wrap their backgrounds
   and danger banners in
   `var(--surface-2, #f5f5f5)` / `var(--danger-bg, #fef2f2)`.
   Because the var is undefined, every rendering across all 6
   theme variants (3 themes × light/dark) falls through to the
   hex literal — i.e. the same off-white / pink swatch in dark
   mode, in Nord, in Cool Modern, etc. The fallback is a single
   light-mode hex, so dark-mode users will see light-coloured
   surface chips embedded inside dark editor / dashboard
   surfaces. Established components use `--bg-secondary`
   (defined per theme at lines 156, 202, 232, 265, 296, 320,
   350, 384, 419, 453 of `global.css`). Recommended action:
   either (a) define `--surface-2` and `--danger-bg` per theme
   in `global.css`, or (b) refactor the 9 components to use
   `--bg-secondary` and a similar existing danger surface
   token. Effort small; impact "components don't follow the
   theme" only matters when users actually try dark mode on
   the new surfaces — which they will.

4. **Hardcoded status colours in `BulkAiFillDock.tsx`** (no
   CSS-var wrapping). Lines 31 (`color: "#16a34a"` for
   completed / done state on the per-item glyph), 33
   (`color: "#a16207"` for skipped), 360 (same `#a16207` for
   skip-status text). The error path on line 35 IS wrapped
   (`var(--danger, #b91c1c)`). Same status palette appears
   elsewhere in the codebase via CSS vars (`--success`,
   `--warning` analogues should exist). Recommended action:
   thread these through CSS vars so dark-mode users get a
   readable check / clock glyph against the dark dock
   background.

5. **`MediumImportPage` Home-button is icon-only without
   `aria-label` or `data-testid`.** Lines 110-116: the `Home`
   icon-only button has only `title={t("ui.dashboard.title", "Dashboard")}`.
   Screen readers read `title` inconsistently across UA; the
   established pattern in the codebase is `aria-label` + a
   `title` (e.g. `MediumImportPage.tsx:98-101` for the back
   button uses both correctly). Effort trivial; impact minor.
   No testid means E2E cannot target the Home button
   specifically — but no E2E currently does, so this is
   future-proofing only.

6. **`AITemplatePanel` and `FieldClassDialog` have heavy
   inline-style usage instead of CSS modules.** Both
   components reach 10+ inline `style={{...}}` blocks each
   (AITemplatePanel: 11; FieldClassDialog: similar count).
   Established patterns in the codebase use CSS modules
   (`TypeToConfirmDialog.module.css`,
   `ArticleBulkActionBar.module.css`,
   `MediumImportPage.module.css`). Inline styles are valid
   but make theming overrides harder and cannot use
   pseudo-selectors / media queries. Not a correctness issue;
   a maintainability one.

### CONSISTENT (verified compliant)

1. **All new dialogs use Radix UI.** Verified imports in
   `AITemplatePanel.tsx:2`, `FieldClassDialog.tsx:2`,
   `BulkAiFillDock.tsx:2`, `BulkAiFillConfirmDialog.tsx:2`,
   `TypeToConfirmDialog.tsx:22`, `BulkTemplateImportDialog.tsx:2`,
   `NewFromTemplateButton.tsx:2`: all import
   `* as Dialog from "@radix-ui/react-dialog"` and use
   `Dialog.Root` / `Dialog.Portal` / `Dialog.Overlay` /
   `Dialog.Content` / `Dialog.Title` / `Dialog.Description` /
   `Dialog.Close`. No raw `<dialog>` elements anywhere in the
   new surfaces.

2. **No raw `fetch()` in components.** Grep of all 14 new
   files returned zero matches for `\bfetch(`. Every API call
   goes through `api.{namespace}.{operation}(...)` via
   `frontend/src/api/client.ts`. `ApiError` is propagated
   correctly to `notify.error(...)` with the original error
   instance attached for the Report-issue button.

3. **No `console.log`, `window.confirm`, `window.alert`,
   `window.prompt` in any new component.** Verified by grep
   across all 14 in-scope files. Destructive confirmations
   use `TypeToConfirmDialog` (numeric type-to-confirm gate)
   or `useDialog().confirm("danger")`. Status feedback uses
   `notify.success / warning / error / info / bulkAction`.

4. **Lucide React is the only icon library.** Every icon
   import in the new files is from `"lucide-react"` (no MUI
   icons, no react-icons, no Heroicons). Icons consistently
   sized 12 / 14 / 18 / 28 px.

5. **Bulk-delete `TypeToConfirmDialog` accessibility is
   complete.** `htmlFor` + `id` pairing on the numeric input
   (lines 142-144), `aria-required="true"`, `aria-invalid`
   bound to `showError`, `aria-describedby` toggling between
   the error message id and `undefined`, error message has
   `role="status"` + `aria-live="polite"`, focus-on-mount via
   `requestAnimationFrame` (lines 60-68 — robust against
   Radix's mount race). The dialog meets the "destructive
   action" bar for a11y.

6. **`data-testid` coverage is broad on AI Template + bulk
   surfaces.** AITemplatePanel: 8 testids (panel, fill,
   export, import + import-dialog inner controls).
   FieldClassDialog: 6 testids + per-class
   `field-class-{id}` + `field-class-checkbox-{id}` keying.
   BulkAiFillDock: 8 testids (dock root, bar, projection,
   modal root, modal-totals, modal-items, modal-error,
   modal-per-item, modal-projected, modal-minimize,
   modal-dismiss, plus per-item `bulk-ai-fill-item-{id}`).
   BulkAiFillConfirmDialog: 5 testids + per-item
   `bulk-fill-estimate-item-{id}`. ArticleCommentsPanel: 5
   testids + per-comment keying (`article-comment-{id}`,
   `article-comment-author-{id}`, `article-comment-body-{id}`,
   `article-comment-date-{id}`). CommentsAdminSection: 3+
   testids (heading inferred from i18n key + delete-per-row
   keyed by id). Selectors are id-stable, prefix-distinct
   (no overmatch risk per the lessons-learned rule), and
   sufficient for the smoke pyramid.

7. **i18n structural parity is 100% across all 8 catalogs**
   for the 5 in-scope namespaces. Every catalog has lines
   1547 (medium_import), 1603 (bulk_delete), 1630
   (ai_template), 1744 (bulk_ai_fill), 1782 (comments). All
   8 files weigh exactly 1813 lines. The `t(...)` call sites
   in the components are guaranteed to resolve to a key;
   none will fall through to the in-component English
   fallback (per IMPROVEMENT #1, the resolved value may
   still be the English string itself).

8. **Page-vs-modal divergence for Medium import is
   documented and intentional.** The
   `/articles/import/medium` route is the canonical
   page-route divergence from the modal import-wizard
   pattern, justified by 30-60 s processing time + 3-section
   structured result table + worthwhile help-doc deep-link
   surface. The decision is recorded in
   `.claude/rules/lessons-learned.md` ("Bulk operations earn
   page-route UX even when single-item siblings use modals").
   The implementation (MediumImportPage.tsx:1-185) follows
   the rule's prescription: stable URL, idle/uploading/
   processing/result state machine, structured result
   component, page-level header (back-button + Home +
   theme-toggle, no in-modal close affordance).

---

## i18n parity matrix

Structural key parity verified by line-by-line spot check of
the 5 in-scope namespaces in each of the 8 catalogs. Status
codes:

- **OK** = namespace exists, all keys present, content
  rendered in the catalog's target language
- **PASSTHRU** = namespace exists, all keys present, BUT every
  value is the English string verbatim (un-translated; UI
  renders English in this language)
- **MISSING** = namespace or specific key absent

| Namespace      | en | de | es | fr | el | pt | tr | ja |
|----------------|----|----|----|----|----|----|----|----|
| `medium_import` | OK | OK | OK | OK | OK | OK | OK | OK |
| `bulk_delete`   | OK | OK | OK | OK | OK | OK | OK | OK |
| `ai_template`   | OK | OK | PASSTHRU | PASSTHRU | PASSTHRU | PASSTHRU | PASSTHRU | PASSTHRU |
| `bulk_ai_fill`  | OK | OK | PASSTHRU | PASSTHRU | PASSTHRU | PASSTHRU | PASSTHRU | PASSTHRU |
| `comments`      | OK | OK | PASSTHRU | PASSTHRU | PASSTHRU | PASSTHRU | PASSTHRU | PASSTHRU |

Single-key spot check for the AI provider Custom preset
(`ui.settings.ai_provider_custom`): translated in all 8
catalogs (de.yaml:688, en.yaml:688, es.yaml:692, fr.yaml:692,
ja.yaml:688, pt.yaml:688, tr.yaml:702, el.yaml:678).

**Sample evidence of PASSTHRU pattern** — line 1745 across
catalogs:

| Lang | `bulk_ai_fill.field_class_dialog_title` |
|------|----|
| en | `"Bulk AI fill: pick field-classes"` |
| de | `"Massen-KI-Füllung: Feldgruppen wählen"` |
| es | `"Bulk AI fill: pick field-classes"` (PASSTHRU) |
| fr | `"Bulk AI fill: pick field-classes"` (PASSTHRU) |
| el | `"Bulk AI fill: pick field-classes"` (PASSTHRU) |
| pt | `"Bulk AI fill: pick field-classes"` (PASSTHRU) |
| tr | `"Bulk AI fill: pick field-classes"` (PASSTHRU) |
| ja | `"Bulk AI fill: pick field-classes"` (PASSTHRU) |

---

## Accessibility primitives

| Component | aria-labels on icon-only btns | Dialog.Title | Dialog.Description | Keyboard / focus trap | testids | Note |
|-----------|-------------------------------|--------------|--------------------|----------------------|---------|------|
| `AITemplatePanel` | yes (Close button line 291) | yes (l.280) | yes (l.297) | Radix-managed | 8 | Compliant |
| `FieldClassDialog` | yes (Close, l.240) | yes (l.235) | yes (l.247) | Radix-managed | 6+ | Compliant |
| `TemplateImportDropZone` | n/a (visible label) | n/a (not a Dialog) | n/a | `role="button"` + Enter/Space handler (lines 111-117) + `tabIndex=0` | yes | Compliant |
| `TypeToConfirmDialog` | yes (Close, l.112) | yes (l.101) | implicit via body summary | Radix-managed, autofocus on input via `requestAnimationFrame` (l.65) | yes | Best-in-class a11y |
| `BulkAiFillDock` | yes (Close, l.203) | yes (l.195) | yes (l.209) | Radix-managed + `role="progressbar"` with `aria-valuenow/min/max` on bar (l.127-130) | 8+ per-item | Compliant |
| `BulkAiFillConfirmDialog` | yes (Close, l.279) | yes (l.268) | yes (l.286) | Radix-managed; close disabled while `starting` (l.280) | 5+ per-item | Compliant |
| `BulkTemplateImportDialog` | yes (Close, l.127) | yes (verified) | yes (verified) | Radix-managed | yes | Compliant |
| `NewFromTemplateButton` | yes (verified) | yes | yes | Radix-managed | yes | Compliant |
| `articles/ArticleCommentsPanel` | n/a (no icon-only btns) | n/a | n/a | n/a (read-only list) | 5+ per-comment | Compliant |
| `articles/CommentsCountBadge` | n/a (`aria-hidden` on Lucide icon + `title` tooltip carries text) | n/a | n/a | n/a (inline span) | yes (caller-supplied) | Compliant |
| `CommentsAdminSection` | yes (Trash2 delete, l.414) | n/a (uses `useDialog`) | n/a | passed through to dialog | yes (per-row keyed) | Compliant |
| `MediumImportPage` | back button (l.98) yes; Home button (l.110) **MISSING** | n/a (page, not dialog) | n/a | n/a | yes (start, back) | See IMPROVEMENT #5 |
| `ArticleBulkActionBar` | n/a (icon + visible text) | n/a | n/a | Radix DropdownMenu | yes | Compliant |
| `BookBulkActionBar` | n/a (icon + visible text) | n/a | n/a | Radix DropdownMenu | yes | Compliant |

---

## Pattern compliance

| Component | Radix Dialog | api/client | t() i18n | CSS vars only | No raw fetch() | No console.log | Pass? |
|-----------|--------------|-----------|----------|---------------|----------------|----------------|-------|
| AITemplatePanel | yes | yes | yes | vars-with-hex-fallback | yes | yes | yes |
| FieldClassDialog | yes | n/a (no API call) | yes | vars-with-hex-fallback | yes | yes | yes |
| TemplateImportDropZone | n/a | n/a | yes | vars-with-hex-fallback | yes | yes | yes |
| TypeToConfirmDialog | yes | n/a (presentational) | yes | css-module + var() | yes | yes | yes |
| BulkAiFillDock | yes | n/a (consumer only) | yes | **two hardcoded `#16a34a` / `#a16207` literals** | yes | yes | partial (see IMPROVEMENT #4) |
| BulkAiFillConfirmDialog | yes | yes | yes | vars-with-hex-fallback | yes | yes | yes |
| BulkAiFillJobContext | n/a | yes | n/a | n/a | yes | yes | yes |
| BulkTemplateImportDialog | yes | yes | yes | vars-with-hex-fallback | yes | yes | yes |
| NewFromTemplateButton | yes | yes | yes | vars-with-hex-fallback | yes | yes | yes |
| ArticleCommentsPanel | n/a (sidebar list) | yes | yes | vars-with-hex-fallback | yes | yes | yes |
| CommentsCountBadge | n/a | n/a (presentational) | yes | vars-with-hex-fallback | yes | yes | yes |
| CommentsAdminSection | uses `useDialog` | yes | yes | vars-with-hex-fallback | yes | yes | yes |
| MediumImportPage | n/a (page route) | yes | yes | css-module + var() | yes | yes | yes |
| ArticleBulkActionBar | uses Radix DropdownMenu | n/a (callbacks only) | yes (via t prop) | css-module | yes | yes | yes |
| BookBulkActionBar | uses Radix DropdownMenu | n/a (callbacks only) | yes (via t prop) | css-module | yes | yes | yes |

**vars-with-hex-fallback** means the component writes
`var(--name, #hex)` literals everywhere. This works at
runtime, but two of the most-used names (`--surface-2`,
`--danger-bg`) are NOT defined in `global.css` — so the
runtime always uses the hex fallback. See IMPROVEMENT #3.

---

## Help-system inconsistency (parent-task flag)

Parent task flagged: `docs/help/_meta.yaml` declares the AI
Templates section but `mkdocs.yml` was not regenerated.

**Verified**: the in-app help plugin reads `_meta.yaml`
directly (`bibliogon_help/routes.py:50-55`: `_load_meta()`
opens `DOCS_ROOT / "_meta.yaml"` and `yaml.safe_load`s it).
So **in-app help DOES surface the AI Templates section
correctly**. The drift only affects the public MkDocs site
at `https://astrapi69.github.io/bibliogon/`. Severity:
**IMPROVEMENT**, not BLOCKER (see Finding #2 above).
`make verify-docs-discipline` (D2 run) catches this at
release-gate time anyway; the gate is what prevents the tag
from completing if the nav is out of sync.

---

## Suggested follow-up backlog items

- **`I18N-FRONTEND-AI-TEMPLATE-REVIEW-01`** (P3): native-speaker
  translation pass for `ai_template`, `bulk_ai_fill`,
  `comments` in es, fr, el, pt, tr, ja. Pattern: top-of-
  namespace `_meta.review_status` block per the launcher
  precedent.
- **`UI-CSS-VAR-DEFS-01`** (P3): define `--surface-2` and
  `--danger-bg` per theme in `global.css`, or refactor the 9
  consuming components to use `--bg-secondary` and existing
  danger tokens. (See IMPROVEMENT #3.)
- **`UI-STATUS-COLORS-VARS-01`** (P4): replace hardcoded
  `#16a34a` (success), `#a16207` (warning/skipped) in
  `BulkAiFillDock` with CSS vars (introduce `--success`,
  `--warning` if not defined, or reuse existing). (See
  IMPROVEMENT #4.)
- **`MEDIUM-IMPORT-HOME-BTN-A11Y-01`** (P4): add `aria-label`
  + `data-testid` to the Home icon-only button in
  `MediumImportPage.tsx:110-116`. (See IMPROVEMENT #5.)
- **`UI-INLINE-STYLE-CLEANUP-01`** (P5): convert
  `AITemplatePanel` and `FieldClassDialog` from heavy
  inline-style usage to CSS modules, matching the pattern in
  `TypeToConfirmDialog`, `ArticleBulkActionBar`,
  `MediumImportPage`. Pure maintainability win, no
  user-visible change. (See IMPROVEMENT #6.)
- **MkDocs nav for AI Templates**: handled by `make
  verify-docs-discipline` gate; the actual fix is a one-line
  generator run before the next tag push. Will close via the
  D2 release-gate workflow.

---

## Questions and assumptions

- **Q**: Does the in-app help actually read `_meta.yaml` or
  the generated `mkdocs.yml`? — **A**: Reads `_meta.yaml`
  directly. Evidence:
  `plugins/bibliogon-plugin-help/bibliogon_help/routes.py:50-55`.
  This downgrades the docs/help inconsistency to
  IMPROVEMENT.
- **Q**: Are `--surface-2` and `--danger-bg` defined
  somewhere outside `global.css`? — **A**: No — grep
  across `frontend/src/styles/` for these tokens returned
  zero matches. Confirmed by the single
  `grep -c "^\s*--surface-2\|^\s*--danger-bg" global.css`
  returning 0.
- **Assumption**: PASSTHRU drift in 6 catalogs × 3
  namespaces is non-blocking because the user reads English
  instead of [missing key]. This matches the v0.30.0
  launcher precedent
  (`launcher/bibliogon_launcher/locales/REVIEW_STATUS.md`
  with `_meta.review_status: "pending native speaker"`
  blocks). If product policy says "no English in non-en
  catalogs", upgrade to BLOCKER and run a translation pass
  before tag.
- **Assumption**: The mkdocs.yml drift would have been
  caught at tag-push time anyway by the
  `verify-docs-discipline` gate. D2 confirms this — the
  gate fails today. So this audit is *redundant* on that
  one finding but documents the explicit
  in-app-help-vs-mkdocs-site impact split for the user.
