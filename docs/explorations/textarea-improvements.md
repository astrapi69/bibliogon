# Textarea Improvements Exploration

Status: Recommendation issued; implementation pending.
Last updated: 2026-04-25
Trigger: User wants Copy Preview in the Create Issue dialog plus
consistent textarea features in the metadata editor (CSS syntax
coloring, Markdown/HTML preview, copy-to-clipboard everywhere).
Revived when: starting an implementation session.

---

## 1. Header

This document audits every textarea in the Bibliogon frontend,
inventories the libraries already on the bench, and recommends a
single strategy that improves the user experience without
ballooning the bundle. Implementation phases are listed but no
code is produced here.

The user's explicit ask:

- A `Copy Preview` button in `ErrorReportDialog` next to the
  existing `Show Preview` toggle.
- All metadata-editor textareas should benefit from useful
  features. CSS syntax-coloring, Markdown/HTML preview,
  copy-to-clipboard everywhere.
- UX/UI-conform recommendations. No features for their own sake;
  only what an established publishing tool would surface.

---

## 2. Audit — existing textareas in Bibliogon

`grep -rn '<textarea\|Textarea\|TextArea' frontend/src/` yields
ten distinct sites (excluding tests). One additional site uses a
`<div>` for textarea-equivalent content (`ErrorReportDialog`'s
preview pane) — that is the user's headline ask and is the
eleventh row.

| # | File | Field purpose | Plain or wrapper | Features today |
|---|------|----------------|------------------|----------------|
| 1 | `BookMetadataEditor.tsx` (line 521, generic `Field`) | description, custom_css, any `multiline` field | wrapper (`Field` with `multiline` + optional `mono` flag) | placeholder, char counter (when `maxChars` set), monospace toggle, fixed `rows={8}` |
| 2 | `BookMetadataEditor.tsx` (line 779, `HtmlFieldWithPreview`) | html_description, backpage_description, backpage_author_bio | wrapper (toggles textarea vs sanitized preview `div`) | source/preview tab switch, `sanitizeAmazonHtml` allowlist, AI button slot, char counter |
| 3 | `BookMetadataEditor.tsx` callers | description (Markdown) | calls `Field` with `multiline` only | none beyond #1 |
| 4 | `CreateBookModal.tsx` (line 393) | new-book description | plain | placeholder, fixed `rows={3}` |
| 5 | `SaveAsTemplateModal.tsx` (line 165) | template description | plain | placeholder, fixed `rows={2}`, mandatory marker |
| 6 | `SaveAsChapterTemplateModal.tsx` (line 117) | chapter-template description | plain | placeholder, fixed `rows={2}`, mandatory marker |
| 7 | `Editor.tsx` (line 1323) | chapter content in Markdown mode | plain | spellcheck off, fills the editor pane, scrollable |
| 8 | `import-wizard/steps/PreviewPanel.tsx` (line 759) | per-row `longform` overrides (description, custom_css, etc.) | wrapper (`FieldRow`) | include/exclude checkbox, expand/collapse for >200 chars, monospace toggle |
| 9 | `Settings.tsx` (line 985) | advanced plugin settings JSON | plain | monospace, `minHeight: 120`, gated behind "advanced" hint |
| 10 | `SshKeySection.tsx` (line 146) | public SSH key | plain readonly | monospace, `rows={3}`, **already has a Copy button** (uses `navigator.clipboard.writeText`) |
| 11 | `ErrorReportDialog.tsx` (line 124) | issue-body preview | `<div>` (read-only) | scrollable, monospace, `whiteSpace: pre-wrap`, no copy button |

Field-type taxonomy across the eleven sites:

- **Plain text / Markdown** — descriptions in `BookMetadataEditor`, `CreateBookModal`, both `SaveAsTemplate` modals, the wizard's longform row.
- **HTML** — html_description, backpage_description, backpage_author_bio (already in `HtmlFieldWithPreview`).
- **CSS** — custom_css (currently goes through plain `Field` with `mono` flag).
- **Markdown chapter content** — `Editor.tsx` source mode (out of scope; the chapter editor is its own beast).
- **JSON** — Settings advanced plugin block.
- **Public key (mono)** — already has a Copy button to crib from.
- **Generated diagnostic text** — `ErrorReportDialog` issue body.

---

## 3. Audit — already-installed libraries

`frontend/package.json` already carries everything we need to
power Strategy A without touching the dependency list. The
relevant entries:

| Package | Version | Current usage | Capabilities relevant here |
|---------|---------|----------------|----------------------------|
| `@tiptap/*` (15+ extensions) | 2.27.x | Chapter editor (`Editor.tsx`) | Rich-text editing, HTML output, code block via lowlight. **Coupled to chapter content**; reusing it for HTML metadata fields would import chapter conventions (toolbars, Figure, etc.) into modal-sized fields. |
| `@tiptap/extension-code-block-lowlight` | ^2.11 | Chapter code blocks | Brings `lowlight` (highlight.js subset) into the bundle. Could be reused for read-only CSS preview blocks. |
| `react-markdown` + `remark-gfm` + `rehype-slug` + `rehype-autolink-headings` | latest | Help docs (`docs/help/*` rendering) | Free Markdown preview wherever we need one — already pays for itself. |
| `dompurify` (+ `@types/dompurify`) | ^3.4 | `BookMetadataEditor`'s `sanitizeAmazonHtml` | HTML sanitization for any preview that renders user HTML. |
| `lucide-react` | latest | Icons everywhere | `Copy`, `Eye`, `EyeOff` icons available without additions. |

Crucially **NOT** installed:

- No CodeMirror, no Monaco Editor, no Lexical.
- No `react-textarea-autosize`.
- No `react-copy-to-clipboard` (and we don't need it — see §4.5).
- No `@uiw/react-md-editor` and no MDXEditor.

Any Strategy that adds CodeMirror or Monaco is opting into a new
top-level dependency. Strategy A as recommended below avoids
that.

---

## 4. External options worth considering

Listed without preference. Strategy decision in §7.

### 4.1 Syntax highlighting (for the CSS field)

| Option | Bundle | Status | Notes |
|--------|--------|--------|-------|
| CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/lang-css`) | ~70 KB min | Active, maintained by CM6 team | Editing-grade, modular, accessibility decent. |
| `@uiw/react-codemirror` | wraps CM6, ~12 KB on top | Active | The de-facto React wrapper. |
| Monaco Editor | ~5 MB total | Active (Microsoft) | Full IDE; massive overhead for a single CSS textarea. Rejected. |
| `react-syntax-highlighter` | ~30 KB + per language pack | Active | **Read-only** rendering; pairs with a plain textarea for editing. |
| `lowlight` (already in stack via `@tiptap/extension-code-block-lowlight`) | already paid | Active | **Read-only** rendering; can power a "Show colored preview" toggle alongside the existing textarea without adding a dependency. |

### 4.2 Markdown editing/preview (Markdown fields)

| Option | Bundle | Status | Notes |
|--------|--------|--------|-------|
| `react-markdown` (already installed) | ~50 KB with remark-gfm | Active | Preview only. Pair with plain textarea + toggle. Free. |
| TipTap with markdown serialization | already installed | Active | Reusing TipTap drags chapter conventions in. **Not recommended** for short modal fields. |
| `@uiw/react-md-editor` | ~150 KB | Active | Combined editor + preview. Net new dependency. |
| MDXEditor | ~250 KB | Active | WYSIWYG markdown. Overkill. |

### 4.3 HTML editing/preview (HTML fields)

| Option | Bundle | Status | Notes |
|--------|--------|--------|-------|
| `HtmlFieldWithPreview` (already in `BookMetadataEditor.tsx`) | already paid | Owned | Toggles textarea vs sanitized preview. **Already in production.** |
| TipTap rich-text | already installed | Active | Same coupling concern as 4.2. |
| CodeMirror with html mode | new dep | Active | Power-user move; overkill for back-cover text. |

### 4.4 Plain enhancement (description-type fields)

| Option | Bundle | Status | Notes |
|--------|--------|--------|-------|
| Native `<textarea>` + a small wrapper | none | n/a | Auto-grow via `style.height = scrollHeight + 'px'` in a ResizeObserver effect (~25 LOC). |
| `react-textarea-autosize` | ~6 KB | Active | Drop-in component for auto-grow. Dependency cost is low but not zero. |
| Word/character count footer | none | n/a | Existing `CharCounter` in `BookMetadataEditor.tsx` already does this; lift to the wrapper. |

### 4.5 Copy-to-clipboard

| Option | Bundle | Status | Notes |
|--------|--------|--------|-------|
| Native `navigator.clipboard.writeText()` | none | n/a | **Already used in `SshKeySection.tsx`.** Reuse the pattern; one ~10 LOC `useCopyButton` hook covers every site. |
| `react-copy-to-clipboard` | ~1 KB | Stale (last release > 2 years) | Skip — the native API plus a tiny hook is simpler and one fewer dep. |

### 4.6 Other UX

- Fullscreen mode for long-form fields: native `:fullscreen` API; ~15 LOC.
- Character limit indicator: already implemented as `CharCounter`; lift to the wrapper.

---

## 5. UX patterns to consider

Reference points (no integration; observation only):

- **Notion** — rich-text everywhere, inline preview, no toggle. Wrong fit for short fields with a known target format (KDP HTML, EPUB CSS).
- **Obsidian** — Markdown source + preview pane toggle. Matches our HTML pattern (`HtmlFieldWithPreview`) and our recommended Markdown pattern.
- **iA Writer** — pure Markdown source, preview as a separate keystroke. Minimalist, fits authors.
- **VS Code** — for CSS specifically, real-time syntax highlighting and bracket matching; relevant only if we go Strategy C.
- **Calibre** — plain unstyled textareas. Anti-pattern: even the user's CSS field deserves at least mono + a way to preview rendered output.

Patterns extracted:

- **Toolbar above textarea** with terminal actions (copy, preview, fullscreen). Already partially in `HtmlFieldWithPreview`; generalize.
- **Tab toggle** between source and preview for Markdown/HTML. Established by `HtmlFieldWithPreview`.
- **Live syntax coloring** for CSS (no preview pane needed; the source IS the preview).
- **Word + character count** as a passive footer. Already exists for HTML fields; extend.
- **Character-limit indicator** for KDP fields (max 4000 chars). Already exists.

---

## 6. Per-field analysis

| # | Field | Type | Recommended treatment | Cost |
|---|-------|------|------------------------|------|
| 1 | `description` (BME General tab) | Markdown | New wrapper: textarea + autosize + word count + Copy. Optional preview tab via `react-markdown`. | S |
| 2 | `html_description` | HTML | Stays in `HtmlFieldWithPreview`. Add Copy button to its toolbar. | S |
| 3 | `backpage_description` | HTML | Same as #2. | S |
| 4 | `backpage_author_bio` | HTML | Same as #2. | S |
| 5 | `custom_css` | CSS | Plain textarea stays editable; add Copy. **P2:** "Show colored preview" tab using `lowlight` (already in stack) for read-only syntax-highlighted view. No CodeMirror. | S (Copy) + M (preview tab) |
| 6 | `description` (CreateBookModal) | Plain | New wrapper: autosize + char count + Copy. | S |
| 7 | `description` (SaveAsTemplateModal) | Plain | New wrapper. | S |
| 8 | `description` (SaveAsChapterTemplateModal) | Plain | New wrapper. | S |
| 9 | Wizard `FieldRow` longform | Plain / Markdown / CSS | Existing expand/collapse keeps. Add Copy on long values (>200 chars). | S |
| 10 | Settings advanced JSON | JSON | Add Copy. **P2:** indent-toggle button + JSON validity indicator. | S (Copy) + S (validate) |
| 11 | SSH public key | Mono readonly | Already has Copy. No-op. | — |
| 12 | `ErrorReportDialog` issue preview | Plain readonly | **The user's headline ask.** Add Copy button next to the Show/Hide Preview toggle. Optionally render as a real `<textarea readOnly>` so triple-click selects the lot, mirroring SSH. | S |

Fields **out of scope**:

- `Editor.tsx` Markdown chapter editor (line 1323): tightly coupled to the chapter editor's autosave + word count + spellcheck pipeline. Not improving here without redesigning the editor itself.
- TipTap chapter editor proper. Untouched per stop-condition.

---

## 7. Recommended strategy

**Strategy A: Minimum + Universal, with one targeted preview.**

### Why A wins for Bibliogon

1. **Audience fit.** Bibliogon's primary user is a self-publishing author, not a developer. CSS is the only field where a power-user editor (CodeMirror/Monaco) has any legitimate appeal, and CSS is the *least* edited surface in the app. Loading 70 KB+ of editor framework for a field most users paste once and forget is the wrong trade.

2. **Stack reuse.** `react-markdown`, `dompurify`, and `lowlight` are all already paid for. They cover Markdown preview, HTML preview, and read-only CSS syntax coloring respectively without a new dependency. `HtmlFieldWithPreview` is already a real component; the wrapper just generalizes its toolbar.

3. **TipTap for HTML modal fields would couple chapter conventions** (Figure, Table, search-and-replace, code blocks) into a back-cover description field. Strategy B's only payoff would be rich-text editing for HTML, but the user wants to paste the HTML they got from KDP / their cover designer — they don't want a WYSIWYG editing surface there. Rejected.

4. **Strategy C (CodeMirror everywhere) over-engineers** for a non-developer audience and tips bundle weight without proportional UX gain on the plain fields. Rejected.

5. **Strategy A ships the user's headline ask in Phase 1** (~30 min) without committing to anything irreversible. Each subsequent phase is independent; nothing is wasted if 2–4 are deferred.

### What Strategy A delivers

- A single `Textarea` wrapper component (`frontend/src/components/Textarea.tsx`, ~150 LOC) that exposes:
  - `value` / `onChange` / `placeholder` / `readOnly`.
  - Optional `language: "plain" | "markdown" | "html" | "css"`. Drives the preview tab and the optional `lowlight` colorizer.
  - `copy?: boolean` (default true) — renders a Copy button in the toolbar via a `useCopyButton` hook (native clipboard, success-state badge for 1.5s, no toast — see §9).
  - `autosize?: boolean` (default true). ResizeObserver-driven, no new dep.
  - `maxChars?: number` — wires to the existing `CharCounter`.
  - `aiButton?: { ... }` — re-uses the prop shape `HtmlFieldWithPreview` already takes.
- Migration path:
  - `HtmlFieldWithPreview` becomes a thin alias around `<Textarea language="html" />`, preserving the test surface and the AI button slot.
  - `Field` in `BookMetadataEditor` keeps its top-level signature but its `multiline` branch routes to `<Textarea language={mono ? "css" : "markdown"} />` (or "plain" when neither is set).
  - All eleven sites converge on one component without any changing their props significantly.

### What Strategy A explicitly does NOT add

- No CodeMirror, no Monaco. Lowlight is read-only.
- No `react-textarea-autosize`. Native `ResizeObserver` is enough.
- No `react-copy-to-clipboard`. Native `navigator.clipboard.writeText` is enough.
- No new top-level UI library.

---

## 8. Implementation phasing

Each phase lands independently; later phases can be deferred or
skipped without leaving Phase 1's value on the table.

### Phase 1 — Copy Preview in `ErrorReportDialog` (~30 min)

- Add a `useCopyButton` hook in `frontend/src/hooks/`.
- Render a `<button>` with `<Copy size={14} />` next to the existing Show/Hide Preview toggle in `ErrorReportDialog.tsx`.
- 1.5s success-state badge (icon swap to `<Check />`).
- 4 i18n keys × 8 languages: `ui.error_report.copy_preview`, `copy_success`, `copy_failed`, `copy_again`.
- One Vitest case asserting `navigator.clipboard.writeText` is called with the issue body.

### Phase 2 — Universal `Textarea` wrapper (~3 h)

- Create `frontend/src/components/Textarea.tsx` per §7.
- Migrate `Field`'s multiline branch + the four plain modal fields (`CreateBookModal`, `SaveAsTemplateModal`, `SaveAsChapterTemplateModal`, BME description).
- Lift `CharCounter` to the wrapper.
- Vitest tests: autosize, copy success/failure, char count, readOnly mode.
- No new dependencies.

### Phase 3 — Preview tabs for Markdown + HTML (~2 h)

- Add the `language="markdown"` branch to `Textarea`: source/preview toggle powered by `react-markdown`.
- Refactor `HtmlFieldWithPreview` into `<Textarea language="html" />`. Keep the export name so existing tests pass.
- Tests: source-mode renders textarea, preview-mode renders sanitized HTML / rendered Markdown, toggle round-trips.

### Phase 4 — CSS syntax-highlighted preview (~2 h)

- Add `language="css"` to `Textarea`. Editing stays in a textarea; a "Show colored preview" tab renders a `lowlight`-highlighted read-only block.
- One Vitest case asserting CSS content roundtrips through the colorizer without HTML injection.

### Phase 5 (optional / later) — JSON validity indicator (~1 h)

- For the Settings advanced JSON textarea: live `JSON.parse` on change, show a green check / red message.
- Independent of Phases 1-4.

Total: 8.5 h end-to-end if all phases ship. Phase 1 alone is the
30-minute win the user asked for.

---

## 9. Open decisions

Items the strategy doesn't fully resolve. Flag for the
implementation session.

1. **Copy success feedback.** Toast vs inline checkmark vs no
   feedback. **Recommendation:** inline `<Check />` swap on the
   Copy button for ~1.5 s. Toast pollutes the UI for a tiny
   action; "no feedback" loses the affordance.
2. **Always-on vs opt-in copy button.** **Recommendation:**
   always-on (default `copy={true}`), opt-out where it would be
   noise (none of the eleven sites qualifies).
3. **Bundle-size budget.** Strategy A adds nothing. Phase 4 uses
   already-paid `lowlight`. If a future phase wants real CSS
   editing, CodeMirror + `lang-css` is +~80 KB; revisit then.
4. **Should the issue-report preview gain Markdown rendering?**
   **Recommendation:** no. The body is plain text destined for
   GitHub's textbox; previewing it as Markdown would lie about
   what arrives there. Just add Copy.
5. **HTML preview sandboxing.** `HtmlFieldWithPreview` already
   uses `sanitizeAmazonHtml` (a tag-allowlist + DOMPurify pass).
   Strategy A keeps that. **Not** an iframe sandbox — it would
   break the preview's inheritance of the editor's typography.

---

## 10. Cross-references

- `ROADMAP.md` — open. **Implementation session should add** a
  `TUI-01` entry (or similar; "Textarea UX" prefix) when Phase 1
  ships. Not added in this exploration commit.
- `BookMetadataEditor.tsx` — primary touch surface. Owns
  `HtmlFieldWithPreview` and `Field`; both refactor toward the
  new `Textarea` wrapper.
- `Editor.tsx` (chapter editor, line 1323) — explicitly
  out-of-scope. The chapter Markdown mode is part of a different
  autosave / dirty-tracking pipeline.
- `SshKeySection.tsx` — already implements the
  copy-with-success-state pattern this exploration generalizes.
  Phase 2 keeps it as-is and uses it as the precedent.
- `ErrorReportDialog.tsx` — Phase 1 target.
- `docs/help/{de,en}/error-reporting.md` — should mention the
  new Copy button once Phase 1 ships.

---

## 11. Triggers for implementation

- **Phase 1** ships as soon as this exploration is reviewed.
  High-value, low-cost; no dependency on later phases.
- **Phases 2-4** bundle into one feature session of ~7 h.
  Recommended cadence: after the next minor release, before
  v0.23 RC.
- **Phase 5** opportunistic; piggyback on any other Settings
  rework.

---

## Closing summary

- **Total textareas found:** 10 `<textarea>` sites + 1 `<div>`
  read-only preview = 11 surfaces.
- **Recommended strategy:** **A** — Minimum + Universal with a
  targeted preview. Reuses `react-markdown`, `dompurify`, and
  `lowlight` (all already in `package.json`). Adds nothing.
- **Phase 1 estimated time:** ~30 minutes.
- **Total estimated implementation time:** ~8.5 h across 5
  phases. Phase 1 standalone delivers the user's headline ask.
