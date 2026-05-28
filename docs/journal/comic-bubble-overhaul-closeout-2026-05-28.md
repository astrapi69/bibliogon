# Comic Bubble Visual Overhaul — Path B Close-out (2026-05-28)

Session closure document for the comic-bubble visual overhaul.
Path B (behavioral gaps only, no rename/move refactors) shipped
across 4 commits on `main`. Companion to the entry-state
documents at [comic-bubble-overhaul-handover-2026-05-27.md](
comic-bubble-overhaul-handover-2026-05-27.md) and
[comic-bubble-overhaul-kickoff-next.md](
comic-bubble-overhaul-kickoff-next.md).

## What shipped

| Commit | Scope | Side coverage |
|---|---|---|
| `1e9e730` | **C1 — thought circle-chain.** Replaces the bezier balloon-tail on thought bubbles with a chain of 1-3 progressively smaller circles drifting outward per the concept doc. Counts: 3 for `tail_length_px > 30`, 2 for `> 15`, else 1. First diameter = `max(12, bubble_height * 0.12)`; each subsequent = previous * 0.6. Cumulative offsets 25 % / 60 % / 100 % of tail length. | +4 Vitest + 1 cross-lang pin; +4 pytest + 1 cross-lang pin |
| `26a603b` | **C2 — shout spike-extension.** Removes the separate cubic-bezier sub-path tail on shout. The outer spike (vertex on the bbox edge) most aligned with `tail_direction` is pushed outward by `tail_length_px`; adjacent vertices stay put and form the natural tail base. The star polygon absorbs the tail into its own outline. | +5 Vitest + 1 cross-lang pin; +6 pytest + 1 cross-lang pin |
| `5452a6f` | **C3 — narration force no-tail.** Force-ignores stored `tail_direction` for narration shapes; renders the no-tail rect regardless of legacy values. Closes the "narration shouldn't point at a speaker" contract from the concept doc. | +10 Vitest (parametric 8-octant + auto sweep) + 1 cross-lang pin; +10 pytest + 1 cross-lang pin |
| `ef3bfdb` | **C4 — Playwright smoke.** Creates all 6 bubble types in a single panel via API + asserts each rendered SVG path's structural fingerprint in a real browser. Plus a composite screenshot saved to `test-results/comic-bubble-types-shape/composite.png` as a reviewer-friendly visual baseline. | 1 spec, 1 test, 6 type-specific assertion blocks |

Net coverage delta:
- Vitest: 15 → 34 (+19) for `bubblePath.test.ts`.
- Pytest: existing 84 → 101 (+17 across 3 new test classes) for `test_comic_book_pdf.py`.
- Plugin-comics pytest: 19 unchanged (the path-generator tests live
  in `backend/tests/` per the existing convention since
  `comic_book_pdf.py` transitively imports `bibliogon_export.*` not
  available in the plugin's standalone venv).
- E2E smoke: +1 spec (`comic-bubble-types-shape.spec.ts`).

## Cross-language snapshot pin contract

Three pinned `d`-string equality assertions:

| Snapshot | Input | TS test | Python test |
|---|---|---|---|
| Thought | `shape="thought"`, S, 35 px | `bubblePath.test.ts` "cross-language snapshot pin (thought, S, 35px)" | `TestThoughtCircleChain::test_cross_language_snapshot_pin` |
| Shout | `shape="shout"`, S, 20 px | "cross-language snapshot pin (shout, S, 20px)" | `TestShoutSpikeExtension::test_cross_language_snapshot_pin` |
| Narration | `shape="narration"`, S, 25 px | "cross-language snapshot pin (narration, S, 25px)" | `TestNarrationForceNoTail::test_cross_language_snapshot_pin` |

Any future drift between the two walkers breaks the pin on at
least one side. Snapshot strings were derived from the
implementation outputs (not the concept doc); the contract is
"TS and Python agree", not "match a hand-computed reference".

## Adjudication recap (handover open-questions)

1. **Path A or Path B?** — User chose Path B. ✓ Closed.
2. **Concept doc location.** — Already at `docs/audits/comic-bubble-konzept.md` in commit `5305dba` (placeholder commit message, but pushed). Not amendable without force-push, left as-is. ✓ Closed.
3. **WeasyPrint compatibility.** — Not exercised in this session. The walker's bubble path changes ship behind the existing test suite (`tests/test_comic_book_pdf.py` runs end-to-end PDF generation via `generate_comic_book_pdf` and asserts PDF magic bytes); that test still passes. Deeper visual PDF inspection deferred to a manual export run by the user. **Open.**
4. **Cross-language snapshot tests.** — Shipped as part of C1-C3 per user brief. ✓ Closed.
5. **`bubble-types.module.css` cleanup.** — Not touched in this session. The file's `bubble-type` class rules are dead code (the SVG-path approach renders without applying them) but the cleanup commit is a separate hygiene pass; bundling it into the behavior commits would violate "no rename/move refactors" for Path B. **Deferred** as a P3 cleanup candidate.

## Deferred follow-ups (for next session if user wants)

- **`bubble-types.module.css` removal** (cleanup, no behavior
  change). Safe-to-delete check: grep for any remaining consumers
  of `BUBBLE_BASE_CLASS` / `bubbleTypeClassName` in the frontend.
  If zero → delete. If any → assess.
- **WeasyPrint PDF visual verification.** Run a real PDF export
  against a comic_book with all 6 bubble types and confirm the
  SVG paths render visually correct in the PDF output (the
  existing PDF generator integration test only verifies file
  emission, not visual correctness).
- **Visual-regression baseline directory.** If the project wants
  `toHaveScreenshot()`-gated visual regression for comic
  bubbles, the baseline images need to be generated with
  `--update-snapshots` and committed under `e2e/smoke/
  __screenshots__/`. C4's `page.screenshot()` is the
  reviewer-visible draft; promoting it to a CI gate is a
  separate decision.
- **Help-doc screenshot update.** No comic-book help pages
  exist in `docs/help/*/books/`. The user's brief mentioned
  this as a C5 step; no-op for now. When the help system gains
  comic-book pages, link the screenshots from C4's smoke
  output.

## Files touched

- `frontend/src/components/comics/bubblePath.ts` — generator
  (thought + shout + narration shape changes).
- `frontend/src/components/comics/bubblePath.test.ts` — 34 cases
  (was 15).
- `plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py`
  — mirror.
- `backend/tests/test_comic_book_pdf.py` — 101 cases (was 84).
- `e2e/smoke/comic-bubble-types-shape.spec.ts` — new spec.

## Files NOT touched (deliberate, per Path B)

- `frontend/src/components/comics/bubble-types.module.css` —
  defunct CSS that the SVG-path approach no longer applies. See
  Deferred Follow-ups above.
- `frontend/src/components/comics/ComicBubble.tsx` — no
  consumer-side changes needed; same `buildBubblePath` API.
- `frontend/src/components/comics/BubbleTail.tsx` — legacy
  separate-tail polygon, unused since the approach-A switch.
  Could be deleted in the cleanup commit.

## Test artifacts

Run `npx playwright test --project=smoke smoke/comic-bubble-types-shape.spec.ts` to exercise C4. The composite screenshot lands at `test-results/comic-bubble-types-shape/composite.png` for visual review.

## Push policy

Per user brief "push autonomously": after this commit, push all
5 commits (C1-C4 + this close-out) to `origin/main`.
