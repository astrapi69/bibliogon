# Manual smoke tests

Living checklist of things that still need human browser verification
**after** the Playwright smoke suite has run clean. Anything that can
be automated has been moved to `e2e/smoke/` and is listed in the
"Automated" section at the bottom of this file. What remains here is
genuinely out of reach for Playwright: subjective visual judgment,
real third-party integrations, and hardware-input flakiness zones.

**How to use this file:** run the smoke suite first, then work
through this checklist for anything the suite cannot cover. When a
manual item is fully green, delete it or move it to "Verified".
When an item starts getting covered by a new spec, strike it through
here and add the spec to the Automated section. This file should
shrink over time, not grow.

---

## How to run everything

```bash
# Backend + plugins + Vitest (the make test default)
make test

# Frontend unit tests + type check
cd frontend && npx tsc --noEmit && npm run test

# Playwright smoke suite (fast, per feature)
cd e2e && npx playwright test --project=smoke

# Full Playwright regression (slower, opt-in)
cd e2e && npx playwright test --project=chromium

# Run the app for live manual checks
make dev
# open http://localhost:5173
```

The smoke suite currently ships 52 tests across 3 spec files (chapter
sidebar viewport, keywords editor, themes). If any of those fail,
fix the regression before doing anything from this file - manual
testing on top of a broken build wastes your time.

---

## Items that genuinely need a human

### 1. Subjective visual quality checks

Playwright can assert that a CSS rule applies. It cannot tell you
whether the result looks good. These are all judgment calls.

- [ ] **Notebook dark ruled-lines contrast** - open a book in the
  Notebook palette, toggle to dark. The line color is `#353228`
  on `#1f1d18` (approx 5% contrast). Is it distracting or
  acceptable? If too subtle or too aggressive, flag for a tuning
  pass on `--notebook-rule` in the dark block of `global.css`.
- [ ] **Studio mint vs. danger red contrast** - Studio dark uses
  `#5eead4` mint and `#ef4444` red side-by-side in several places
  (trash delete buttons, export error states). Open the trash or
  trigger an export error and confirm both are distinguishable.
- [ ] **Classic beige-on-beige chip backgrounds** - Classic light
  uses a warm palette where several chip backgrounds and borders
  are within 10% luminance of each other. Open the metadata
  marketing tab with 5+ keywords and confirm the chips remain
  visually distinct from the input field.
- [ ] **Font loading FOUC** - on a cold page load in each theme,
  is there a noticeable flash before the custom font kicks in?
  Fonts are bundled locally (O-01 complete), so this should not
  be an issue. Check anyway on slow devices.
- [ ] **Dark mode screenshot sanity** - take a screenshot of
  each of the 6 palettes in dark mode and scan for obvious
  contrast failures, unreadable text, or missing border-on-dark
  regressions. This is the one check that a visual regression
  tool would catch but we do not have one set up.

### 2. Real third-party integrations

These depend on paid external services or on binary tools that are
not guaranteed to be installed in every test environment.

- [ ] **Real ElevenLabs audiobook export end-to-end** - configure a
  real API key, run a full audiobook export on a short book (2-3
  chapters), verify the download is a playable MP3. Costs real
  money every time; never run in CI. Do this once per release.
- [ ] **Real Edge TTS audiobook export** - free but depends on
  Microsoft's public endpoint which rate-limits. Verify the
  chapter MP3s sound natural and the merged file plays cleanly.
- [ ] **Real Pandoc EPUB export + epubcheck** - trigger an EPUB
  export on a book with 10+ chapters including images and a
  manual TOC. Download the file and run `epubcheck book.epub`
  locally. Should pass with zero errors. The export plugin
  tests cover the scaffolder in isolation but not the Pandoc
  subprocess result.
- [ ] **Real LanguageTool Premium auth** - if you have a paid
  LanguageTool account, configure `grammar.yaml` with
  `languagetool_username` and `languagetool_api_key`, run a
  grammar check, verify LanguageTool Premium rules fire (the
  self-hosted free tier returns a smaller rule set).
- [ ] **DeepL translation round-trip** - translate a book into a
  different language via the Translation plugin. Verify the
  translated book opens, chapter content is preserved, and the
  new book's language metadata is set correctly.

### 3. Hardware-input and flakiness zones

Playwright technically supports these but they are notoriously
flaky in automation. Keep them manual until either the underlying
libraries ship better test hooks or we accept the flake risk.

- [ ] **Chapter drag-and-drop reorder** - open a book with 5+
  chapters, drag chapter 3 above chapter 1. Verify position
  persists after reload. Also try moving a chapter across
  front-matter/body/back-matter sections.
- [ ] **Keyword chip drag-and-drop reorder** - in metadata
  marketing, drag a keyword chip to a different position.
  Verify order persists after save.
- [ ] **Image resize via TipTap drag handle** - insert an image
  into a chapter, drag the resize handle, verify the image
  renders at the new size and survives a reload.
- [ ] **Image upload via drag-and-drop into editor** - drag a
  PNG from the file manager into the TipTap editor. Verify
  upload succeeds and the image renders inline.
- [ ] **Rich text paste from Word / Google Docs** - copy a
  formatted paragraph (bold, italic, nested list) from an
  external editor and paste into TipTap. Verify the office-paste
  extension strips Word artifacts and keeps the semantic
  formatting.

### 4. Cross-browser and cross-device

The smoke suite only runs Chromium. These need human verification
because the repo does not ship Firefox or WebKit Playwright
projects.

- [ ] **Firefox sanity check** - open the app in Firefox, walk
  the main flows (dashboard, create book, open editor, export
  dialog). Anything Firefox-specific broken?
- [ ] **Safari / WebKit sanity check** - same, in Safari if you
  have a Mac. Particular focus on TipTap editor behavior
  (ProseMirror historically has Safari quirks).
- [ ] **Mobile Safari viewport** - iPhone or iOS Simulator at
  375x667. Does the responsive hamburger menu work? Does the
  editor stay usable? Note: mobile is not a primary target for
  Bibliogon but basic readability should hold.
- [ ] **iPad portrait + landscape** - tablet is more of a real
  use case. Verify the sidebar collapses correctly in portrait
  and the editor is comfortable in landscape.

### 5. Real-font zoom behavior

The smoke suite simulates browser zoom via CSS `zoom` on the
document element, which gets the layout right but does not
exercise the font re-hinting that Chrome's Ctrl++ performs.

- [ ] **Font rendering at 125%** - set the browser zoom to 125%
  with Ctrl++. Open a book in each palette. Verify no font
  rendering oddities (pixel-snapping artefacts, jagged edges).
- [ ] **Font rendering at 150%** - same at 150%.
- [ ] **Font rendering at 75% / 90%** - zoom out. Some users
  shrink the UI. Verify text stays readable and no layout
  collapse happens.
- [ ] **Notebook ruled-lines at real zoom** - specifically for
  Notebook palette at 125% and 150% real browser zoom, verify
  the `line-height: 1.6em` and `background-size: 100% 1.6em`
  stay synchronized. If they drift, the ruled lines slide under
  the text. The CSS smoke test in happy-dom cannot catch this.

### 6. Plugin UI consistency across themes

Every theme should cascade cleanly to every plugin UI. The smoke
suite tests the core palette state machine but does not walk
every plugin panel.

- [ ] **Audiobook Metadata tab** in each new palette (Classic,
  Studio, Notebook) x light/dark. Voice dropdown, engine select,
  progress dialog, downloads list, previews - all readable and
  on-brand?
- [ ] **Export dialog** in each new palette. Format buttons,
  section-order editor, TOC depth select - all styled correctly?
- [ ] **Settings > Plugins** in each new palette. Plugin cards,
  toggle switches, license UI - no hardcoded colors leaking
  through?
- [ ] **ms-tools check panel** in each new palette. Style-check
  results, readability metrics, sanitization diff preview - all
  styled correctly?
- [ ] **KDP metadata check** in each new palette. Issue list,
  severity badges, completeness indicator - all styled
  correctly?

---

## Automated (moved out of manual checking)

These were previously in the manual checklist and are now covered by
the Playwright smoke suite.

### ~~Keywords end-to-end~~ - **AUTOMATED**

Covered by `e2e/smoke/keywords-editor.spec.ts` (12 tests in 4
describes). Automates the full 10-step spec: add via Enter,
inline edit via double-click, Enter commit, Escape revert, delete
via X, undo toast restores at original position, counter warning
at 8+, hard limit at 50, save + reload persistence, edit + save
persists modified value.

Commit: `1a40e4f` test(e2e): Playwright smoke suite for keywords
editor.

### ~~Three new themes - palette state machine and editor rules~~ - **MOSTLY AUTOMATED**

Covered by `e2e/smoke/themes.spec.ts` (16 tests in 5 describes):
palette defaults to warm-literary, seeding each new palette
applies `data-app-theme`, stale localStorage falls back via
`isKnownPalette`, palette persists across reload, light/dark
toggle via ThemeToggle button, toggle persists and is
independent of palette, picking a palette via the Settings Radix
Select applies and persists, Classic palette indents paragraphs
past the first child, Warm Literary does not, Notebook palette
applies the linear-gradient ruled-lines background and the
left border margin line, Warm Literary and Classic do not.

**Still manual:** subjective visual checks (contrast, font
aesthetics, plugin UI consistency across themes) - see section 1
and section 6 above.

Commit: (this one).

### ~~ChapterType UI overflow - sidebar list + add dropdown~~ - **AUTOMATED**

Covered by `e2e/smoke/chapter-sidebar-viewport.spec.ts` (24
tests in 6 describes): sidebar list scrolls internally at 600,
800, 1080 px; header and footer stay visible; add-chapter
dropdown opens within viewport; all 26 chapter types reachable
by scrolling inside the dropdown; dropdown stays within viewport
and items are reachable at 125% and 150% simulated zoom;
sidebar width stays at 260px regardless of height.

**Still manual:** real browser zoom (not CSS `zoom`) font
rendering differences - see section 5 above.

Commits: `7e3d0a6` fix(ui) + `5e17460` test(ui) + `6fbc528`
test(e2e): Playwright smoke suite for chapter sidebar viewport.

---

## Verified

<!-- Move finished manual items here with date and initials when done -->
