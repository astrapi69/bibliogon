# Chat journal — 2026-06-03 (E2E smoke remediation, part 3)

Continuation of the v0.45.0 STOP-gate work. The part-2 handover
(`handover-2026-06-03-e2e-smoke-remediation-part2.md`) left **24
deterministic smoke failures** (the authoritative count from a clean
full run; the handover's "~21" was an estimate). This session closed
all 24 and hardened the residual full-run flakiness.

## Baseline

Clean full smoke run at session start: **24 failed / 3 skipped / 406
passed**.

## Root-cause categories + fixes

### App bugs (real product fixes surfaced by smoke)
1. **Save-indicator flicker** (`Editor.tsx`) — a save's
   `setTimeout(idle, 2000)` was never cancelled when a NEW autosave
   cycle started, so an older timer reset the newer save's
   "Gespeichert" early. Rapid sequential autosaves now keep the
   indicator. (Fixed content-safety:188's first half.)
2. **Hidden radios uninteractable** (`LayoutConfigSpeechBubble.module.css`,
   `LayoutConfigImageRow.module.css`) — the anchor / image-position
   radios were `opacity:0; pointer-events:none`, so only the wrapping
   label was clickable; Playwright (and arguably real pointer-precise
   users) couldn't hit them. The radio now overlays its cell and is
   the hit target; the decorative anchor-dot got `pointer-events:none`
   (its `opacity:0.65` made it a stacking context that intercepted).
3. **Wizard footer drift** (`WizardShell.tsx`) — the vertically-centred
   modal moved its footer as step content height changed. Fixed-height
   flex column + scrollable body pins the footer Y. (convert-to-book:302.)
4. **Disabled plugins hidden from the add-list** (`PluginSettings.tsx`)
   — a config-disabled plugin must appear in the inactive/add list so
   it can be re-enabled, regardless of runtime loaded state.
   (settings-plugins:103/:129.)

### Test correctness (app works; the test was wrong)
- **Drag** via @dnd-kit KeyboardSensor / the components' arrow-key
  handlers instead of `page.mouse` (comic bubble/tail/panel reorder,
  picture-book page reorder) — deterministic in Playwright. The comic
  GRID (rectSortingStrategy) needs 120ms stabiliser delays vs 50ms for
  the vertical-list sidebars.
- **comic-panel selector overmatch** scoped to the grid (the bare
  `comic-panel-` prefix matched side-pane `comic-panel-tier1-*` ~34px
  controls — the "grid_2x2 collapse" was never a layout bug).
- **image_left_text_right is a TipTap layout** — drive the rich-text
  editor + assert text in persisted JSON, not a `textarea`.
- **editor-display-settings** — read inline `.style` (computed
  resolves the nested `var(--font-display)`) + wait for the editor to
  remount after reload.
- **comic-bubble-types-shape** — thought-tail at length 30 is the
  2-circle (4-arc) variant, not 3 (>30).
- **convert-to-book** — exactly ONE footer finish button (count 1).
- **content-safety restore** — accept the restore confirm dialog;
  restore the version by id looked up by content (the testid is the
  version UUID, not a sequential index).
- **tier-1 background_color** — drive the controlled `<input
  type=color>` via the native value setter so React's onChange fires.
- **PDF export** — environment-guard the LaTeX/babel toolchain failure
  (this host's TeX install lacks the babel language; EPUB/DOCX/etc.
  pass). Skips cleanly on hosts without a full LaTeX install; asserts
  for real where LaTeX is present.

### Flakiness hardening (passes isolated, fails under full-run load)
- **Donation onboarding** suppressed in the base fixture (its
  `radix-dialog-overlay` opened after the first UI-created book and
  intercepted dashboard clicks). (pb-editor:414.)
- **Save/navigate races** — wait for the PATCH before reloading /
  navigating (book-metadata-story-tab, trash view-mode settings).
- **RadixSelect option-click** confirmed via the trigger's `data-value`
  before save (trash view-mode).
- **Concurrent page creates race on position** — storyboard creates
  pages sequentially (the index-by-position assertions need
  deterministic order).
- **Rapid add-page/add-panel** — wait for each row before the next
  click (picture-book-editor, page-delete, comic multi-panel).
- **Trash view needs content** — seed a soft-deleted book (empty trash
  renders an EmptyState, not trash-grid/trash-list).
- **Retries** — local matches CI (`process.env.CI ? 2 : 1`). A serial
  400+-test live-backend browser suite has an irreducible load/timing
  flakiness tail; one retry absorbs flaky-but-passing tests while a
  deterministic failure still fails both attempts.

## Result

Final full smoke run: **exit 0 — 428 passed, 1 flaky (retry-passed),
4 skipped** (PDF LaTeX env-guard + 3 pre-existing). Down from 24
deterministic failures. Backend untouched (pytest unaffected);
Vitest 2632 green; tsc clean.

Note on the rotating flaky cast: across the post-fix runs, a small,
DIFFERENT set of ~1-4 tests flaked each run (collage / storyboard /
trash one run; article-header / getstarted / page-delete the next;
picture-book-phase1 on the retries run). Each passed in isolation —
the signature of an irreducible serial-suite load/timing tail, not a
product bug. The identifiable races were fixed at the source; the
remainder is absorbed by the one local retry.

**STOP-gate unchanged: NOT tagged.** Aster runs
`npx playwright test --project=smoke` to confirm, then the tag step.
