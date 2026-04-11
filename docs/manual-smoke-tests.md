# Manual smoke tests

Things Claude Code shipped that need human browser verification. Every
section here is a feature that was merged with automated tests passing
(Vitest/pytest/tsc/build) but with parts of the spec that require
literal mouse interaction, multi-viewport resizing, or cross-component
observation that no test environment in this repo covers.

**How to use this file:** pick a section, follow the steps, check the
boxes, note any failures in the notes row. When a section is fully
green, strike it through and move it to the "Verified" collapsible at
the bottom (or delete the whole section if you want to keep this
file lean). When you find a bug, open an issue and link it in the
notes row; don't fix it inline.

**Why these tests aren't automated:** Claude Code runs without a
browser, so anything that depends on layout, viewport height, zoom,
click-through-the-running-app, or literal pixel measurements cannot
be verified in a commit. Vitest + happy-dom covers structural DOM
assertions, not rendered layout.

---

## How to run the app

```bash
make dev          # backend on :8000, frontend on :5173
# or background mode
make dev-bg
make dev-down
```

Open `http://localhost:5173` in a real browser.

---

## 1. Keywords end-to-end (commits 125d385, 4f4c878, 5b53b14, c1b0eaa, 37d3b9f, 3414294, af4ab6a, bbb4150)

**Scope:** full keyword editor lifecycle in BookEditor > Metadata > Marketing.

**Automated coverage:** 24 Vitest tests (12 pure validator + 12 render-based interaction) plus 6 backend schema round-trip tests. The render tests caught and forced a closure bug fix in the undo handler (commit 3414294).

**What needs a human:**

- [ ] Open an existing book in BookEditor
- [ ] Navigate to Metadata > Marketing
- [ ] Add 5 keywords by typing each one and pressing Enter (no comma separators)
- [ ] Double-click on the third keyword chip, change the text, press Enter — change is saved
- [ ] Double-click on the fourth chip, change the text, press Escape — change is reverted
- [ ] Click the X on the second chip — it disappears and a toast appears bottom-right
- [ ] Click the "Rückgängig" / "Undo" button in the toast — the keyword reappears at position 2 (not at the end)
- [ ] Add 3 more keywords (total 8 now) — counter turns warning-colored and shows the KDP-recommendation hint
- [ ] Keep adding keywords until you hit 50 — the add input should go disabled with a visible "maximum reached" hint
- [ ] Try to press Enter in the disabled input — nothing happens
- [ ] Delete one keyword while at the limit — input re-enables immediately
- [ ] Click the global Save button in the metadata tab
- [ ] Reload the page (F5) — every edit persists exactly, keyword order preserved

**Viewport matrix:** not relevant for this feature (chip layout is horizontal and wraps).

**Notes:**

---

## 2. Three new themes (commits f5bb3ba, c0cd82b, 2b4def5, 7e6f14a, a228721)

**Scope:** Classic, Studio, Notebook palettes + light/dark variants. Notebook has editor-specific ruled-lines background.

**Automated coverage:** 8 palette-registry tests, TypeScript compile check, production build check.

**What needs a human:**

For each of the three new palettes:

- [ ] **Classic (light)** — go to Settings > Display, pick Klassisch. Verify the whole UI flips to warm beige/cream with bordeaux accent. Open a book, verify the editor uses Crimson Pro serif.
- [ ] **Classic (dark)** — click the sun/moon icon. Verify warm dark brown + copper accent.
- [ ] **Classic editor first-line indent** — type three paragraphs in a chapter with a heading. Verify the first paragraph after the heading is flush-left, paragraphs 2 and 3 are indented 1.5em.
- [ ] **Studio (dark)** — pick Studio palette. Verify anthracite background, mint/teal accent, Inter for UI, Source Serif Pro for headings.
- [ ] **Studio (light)** — toggle to light. Verify light grey background, darker mint accent.
- [ ] **Notebook (light)** — pick Notizbuch palette. Verify light cream background, Lora serif.
- [ ] **Notebook editor line background** — open a book and check the editor. You should see subtle horizontal lines (like a ruled notebook page) every 1.6em, plus a red vertical margin line on the left side of the editor.
- [ ] **Notebook (dark)** — toggle to dark. Lines and margin adjust to dark colors automatically, text stays readable.
- [ ] **Theme persistence** — pick any new palette, reload the page, verify the same palette is still active.
- [ ] **Stale-value guard** — manually set `localStorage.setItem("bibliogon-app-theme", "cyberpunk-pink")` in devtools, reload. It should fall back to Warm Literary (the default) silently.
- [ ] **Plugin UI in new themes** — open the Audiobook panel, Export dialog, Settings > Plugins, ms-tools check panel in each new palette. All should style correctly because they use CSS variables — confirm no hardcoded colors leak through.

**Viewport matrix:** not strictly required but nice to verify the Notebook ruled-lines don't misalign at 125%/150% zoom (the `line-height: 1.6em` + `background-size: 100% 1.6em` should stay in sync).

**Notes:**

---

## 3. ChapterType UI overflow — sidebar list + add dropdown (commits 7e3d0a6, 5e17460)

**Scope:** chapter sidebar list now scrolls internally instead of overflowing the viewport, add-chapter (+) dropdown now caps to available viewport height with internal scrolling.

**Automated coverage:** 5 render-based structural tests asserting the `.list` has `overflow-y: auto` + `min-height: 0` + `flex: 1`, plus a CSS source regression for the dropdown rule.

**What needs a human (this is the critical one for viewport/zoom):**

- [ ] Open a book with many chapters. If you don't have one, create 25+ chapters of varied types (mix of front-matter, body, back-matter).
- [ ] **Sidebar list scroll — 1080px height:** at a normal 1080p window, verify the sidebar chapter list scrolls inside the sidebar. The book title header stays at the top, the Metadaten/Export buttons stay at the bottom, and only the chapter list scrolls. The page itself should NOT scroll to reveal the footer.
- [ ] **Sidebar list scroll — 800px height:** resize the browser window to ~800px tall (devtools > toggle device toolbar > Responsive > set height to 800). Repeat the check.
- [ ] **Sidebar list scroll — 600px height:** resize to 600px tall. This is the stress case. The list should still scroll cleanly; the footer should still be visible.
- [ ] **Dropdown on tall viewport:** with 1080p, click the + button in the sidebar header next to "Inhalt". The dropdown opens downward with all chapter types visible. No clipping.
- [ ] **Dropdown on medium viewport:** with 800px tall, click the + button. The dropdown either fits entirely, or shows a scrollbar within the dropdown. Never clipped below the viewport edge.
- [ ] **Dropdown on small viewport:** with 600px tall, click the + button. The dropdown definitely needs to scroll internally. Every one of the 26 chapter types must be reachable by scrolling inside the dropdown. The dropdown itself must not exceed the viewport.
- [ ] **Dropdown side flip:** scroll the page so the + button is near the bottom of the viewport, then click it. Radix should flip the dropdown to open upward. It should still scroll internally if needed.
- [ ] **Zoom 125%:** reset viewport, set browser zoom to 125% (Ctrl++). Repeat the sidebar-scroll + dropdown checks at this zoom level.
- [ ] **Zoom 150%:** set browser zoom to 150%. Repeat. This is the stress case for the dropdown because available height drops significantly.
- [ ] **All 26 types reachable:** at 600px / 150% zoom, open the dropdown and scroll to the very bottom. Verify you can see every type in every section (front-matter, chapters, back-matter including the rare ones like also_by_author, excerpt, call_to_action).
- [ ] **No horizontal overflow:** at every viewport/zoom combination, confirm there's no accidental horizontal scrollbar on the page or inside the sidebar/dropdown.

**Notes:**

---

## Verified (strike through + date when done)

<!-- Move finished sections here or delete them -->

---

## Unrelated spot-checks worth doing at the same time

While you're clicking around, two things from earlier tasks that also never got a literal verification:

- [ ] **Keywords persist across reload** (task 1 step 10) — if you already did section 1, this is covered.
- [ ] **Notebook dark ruled-lines** — subjective: do they look good, or too aggressive? The line color is `#353228` on `#1f1d18` (5% contrast). If you find it distracting, flag it as a follow-up issue; I'll tune the CSS variable `--notebook-rule` in the dark block.
- [ ] **Studio mint accent vs. danger red** — Studio dark uses `#5eead4` mint and `#ef4444` red for danger. Open the trash to see both next to each other — confirm the contrast is fine.
