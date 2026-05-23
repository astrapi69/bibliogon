# Resume Prompt — Phase 2 PANEL-CONFIG-01 (P2)

Paste-ready prompt for a fresh CC session. Phase 1 of the 4-user-
findings work closed today (`216b5a1..433d8ce`). Phase 2 closes
Findings #1 (Panel-Image-Upload) + #3 (LayoutConfigComicPanel).

Full context lives in
[session-handoff-2026-05-20-phase-2-resume.md](session-handoff-2026-05-20-phase-2-resume.md).

---

## Prompt (copy-paste from below)

You are starting a fresh CC session to ship Phase 2 of the
4-user-findings work: `PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01`
(file TBD; recommended P2). Closes Findings #1 (Panel-Image-
Upload) + #3 (LayoutConfigComicPanel). Read
`docs/journal/session-handoff-2026-05-20-phase-2-resume.md` for
full context.

## State Verification

```
git status
git log origin/main --oneline -10
```

Expected: clean working tree, local HEAD == `origin/main` ==
`433d8ce` `docs(backlog): close PLUGIN-COMICS-PHASE-1-MULTI-
PANEL-LAYOUTS-01 + archive + LL filing`.

## PluginForge 0.9.0 — heads-up

A new PluginForge 0.9.0 release is available (current pin
`^0.8.0`). **Recommendation: DEFER the bump to a dedicated
session.** Phase 2 doesn't need it (no PluginForge-dependent
work). File `PLUGINFORGE-V0-9-0-ADOPTION-01` (P3) as backlog
entry at session-close if not already filed.

If the user explicitly asks for the bump in this session: do
Pre-Coding-Reality-Check on the 0.9.0 release notes first per
the prior V060/V070/V080 adoption pattern. See the handover's
"PluginForge 0.9.0 bump" section for the audit recipe.

## Context

Comics-Session-2 + PAGES-CRUD-01 + Phase 1 shipped a working
multi-panel + multi-bubble editor with selectable layouts. But:

- **Finding #1 (Panel-Image-Upload):** users cannot upload an
  image as a panel background. Schema is READY
  (`ComicPanel.image_asset_id` column exists per
  `backend/app/models/__init__.py:992`; PATCH endpoint accepts
  the field). UI is the missing piece.

- **Finding #3 (LayoutConfigComicPanel):** clicking a panel
  with no bubble selected shows empty-state text. No side-pane
  for panel-level config (border, background, image-fit). UI
  is the missing piece.

Both findings share the **side-pane integration point** in
`ComicBookEditor.tsx:547-567`. Bundling them is RCU-correct.

### Half-wired discovery (Phase 1 audit)

`assetUrls` map is currently NEVER populated in ComicBookEditor.
ComicPanelGrid receives `undefined`, so even with
`image_asset_id` set the image wouldn't render. Phase 2 closes
this gap as part of the upload pipeline.

## Pre-Coding-Reality-Check (mandatory before any code)

Before writing any code:

1. **Confirm `api.assets.upload` signature** at
   `frontend/src/api/client.ts` — should be
   `upload(bookId, file, "figure")` returning `{id, ...}`.
2. **Confirm `api.assets.list(bookId)` signature** — used to
   build the assetUrls map. Returns `Asset[]`. The map should
   be `Record<assetId, assetUrl>`.
3. **Verify the PageCanvas pattern** at
   `frontend/src/components/PageCanvas.tsx:464-478` — the
   canonical upload + onUpdate flow. Mirror for ComicPanel.
4. **Confirm Tier1Section reuse fields** —
   `frontend/src/components/comics/Tier1Section.tsx` has 8
   fields; for ComicPanel we want a subset (4: border-style,
   border-width, border-color, background-color). Either
   reuse Tier1Section with a "show only these fields" prop OR
   build a `PanelVisualStyle.tsx` that picks just those 4
   from the same primitive set.

Report findings before code-write. Surface only on:

- Asset-upload pattern differs from PageCanvas (e.g. requires
  Multipart-Form vs JSON; cwd: PageCanvas uses Multipart-Form,
  same expected for ComicPanel)
- Tier1Section can't be reused with a field-subset prop —
  would need new component (acceptable; surface the
  architecture decision)
- ComicPanel.tsx image-render path conflicts with side-pane
  upload UI (the upload-button placement might need to live
  inside LayoutConfigComicPanel only, not on hover on the
  panel itself)

## Recommended scope (6-8 commits, P2)

### C1: `LayoutConfigComicPanel.tsx`

- New component at
  `frontend/src/components/comics/LayoutConfigComicPanel.tsx`
- Mirror `LayoutConfigComicBubble.tsx` structure
- Reuse Tier1Section for visual-style fields (border + background)
- Vitest: ~5-7 cases (mount, value reflection, onChange-fires,
  Tier1Section integration, no-bubble-selected mount semantics)

### C2: ComicBookEditor side-pane wiring

- 3-line edit at `ComicBookEditor.tsx:547-567`: replace the
  `selectedPanelId && !selectedBubble` empty-state text branch
  with `<LayoutConfigComicPanel panel={selectedPanel}
  onChange={handleUpdatePanel} />`
- New `handleUpdatePanel` handler calling
  `api.comics.updatePanel(bookId, selectedPanelId, partial)`
  + refresh

### C3: Panel-Image-Upload UI

- File input + label inside LayoutConfigComicPanel
- Upload handler: `api.assets.upload(bookId, file, "figure")`
  → `api.comics.updatePanel(bookId, panelId, {image_asset_id:
  asset.id})` → refresh
- Mirror PageCanvas:464-478 pattern verbatim where possible
- Error-state: `setUploadError` + display under file input

### C4: `assetUrls` wiring (Half-Wired-Closure)

- New `useEffect` in ComicBookEditor: calls
  `api.assets.list(bookId)`, builds `Record<asset.id,
  asset.url>` map, passes to ComicPanelGrid as the `assetUrls`
  prop
- Trigger refresh on bookId change + after each panel-update
  (because new uploads change the asset set)
- Optionally: `useBookAssets(bookId)` hook (extract if a 2nd
  surface needs the same — currently single-use)

### C5: i18n × 8 catalogs

- Labels for LayoutConfigComicPanel surfaces (~10-15 keys per
  catalog)
- DE proper umlauts; ES/FR/EL/PT/TR/JA passthrough-EN per
  established new-namespace convention

### C6: Playwright smoke

- New spec
  `e2e/smoke/comic-book-panel-image-upload.spec.ts`:
  upload-image → assert `<img>` renders with the correct src
  on the selected panel → delete-image (clear image_asset_id)
  → assert `<img>` disappears
- Per the "Playwright-visible ≠ User-visible" LL (filed today):
  use bounding-box dimension assertions where layout-collapse
  is a risk (probably not relevant for image-render but useful
  default)

### C7 (optional): Backlog close + archive + counter

- File P2 backlog entry at session-start (or include in C1)
- Close + archive entry at session-end
- Update counter line at top of `docs/backlog.md`
- Refresh "Last updated" prose

## Stop conditions

Surface before continuing if any of:

- Pre-Coding-Reality-Check finds asset-upload signature
  mismatch (e.g. different Multipart-Form contract)
- Tier1Section can't be reused with a field-subset → new
  component decision needed
- ComicPanel.tsx image-render path needs changes (it shouldn't
  — Phase 1 verified `imageUrl` prop is consumed correctly;
  only the `assetUrls` wiring upstream is missing)
- Discovery that `ComicBookEditor.tsx:547-567` side-pane slot
  is not where the empty-state lives anymore (e.g. UI
  refactored since Phase 1)
- New backend migration surfaces (it shouldn't — all schema
  is ready; surface immediately if it does)
- Backend baseline drops below 2116 logic-level (only
  cascade-tipping is acceptable, but PluginForge 0.8.0 should
  have eliminated cascade)
- Commit count exceeds 8 (within 6-8 budget; surface if
  scope-creep needed for completion)

## Disciplines active (do not relax)

- **Pre-Coding-Reality-Check** at the keystroke before any
  code
- **Atomic-green-per-commit-delta** — backend baseline 2116
  must hold
- **Half-Wired-Lifecycle-Prevention** — Panel-Image-Upload UI
  + assetUrls map MUST ship together; do NOT ship one without
  the other
- **Recurring-Component-Unification** — Tier1Section reusable
  for panel-visual-style; do NOT duplicate field implementations
- **CRUD-shipping-Read-mandatory** — image-upload writes
  image_asset_id; assetUrls IS the read-side
- **Playwright-visible ≠ User-visible** (LL filed today) —
  use bounding-box dimension assertions for visual-correctness
- **Don't-push-unprompted** — ship N commits as a coherent
  batch, surface for review, push on authorization

## Push convention

After each commit: report SHA + test status (Vitest + targeted
backend pytest if applicable). Do NOT push C1-C7 until user
authorizes batch.

## Phase status after Phase 2 ship

| Item | Status |
|---|---|
| PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 | shipped |
| Findings #1 (Panel-Image-Upload) + #3 (LayoutConfigComicPanel) | resolved |
| 4 user-findings (#1-4) | all resolved |
| Phase 3 (EXTENDED-FEATURES-01) | unblocked; trigger fully met |
| Backend baseline | 2116 hold (no migrations) |
| Half-Wired `assetUrls` gap | closed |
| Next-substantial-session candidate | Phase 3 EXTENDED-FEATURES (17-23 commits, multi-session) OR PluginForge 0.9.0 bump (small) |

## References

- `docs/journal/session-handoff-2026-05-20-phase-2-resume.md`
  (companion handover)
- `docs/audits/extended-features-pre-inspection-2026-05-20.md`
  (Phase 3 reference; the Q1-Q4 decisions adjudicated when
  Phase 3 lands)
- `docs/journal/pluginforge-improvements-brief-2026-05-20.md`
  (PluginForge 0.8.0 / 0.9.0 context)
- `docs/roadmap-archive/2026-05.md` — Phase 1 close + all
  prior 2026-05-20 archives
- `frontend/src/components/ComicBookEditor.tsx:547-567`
  (side-pane integration point)
- `frontend/src/components/comics/LayoutConfigComicBubble.tsx`
  (mirror pattern)
- `frontend/src/components/comics/Tier1Section.tsx` (RCU
  primitive)
- `frontend/src/components/PageCanvas.tsx:464-478` (asset-
  upload precedent)
- `.claude/rules/lessons-learned.md` "Playwright-visible ≠
  User-visible" (filed today; bounding-box-dimension assertion
  pattern)

Start with state verification + PluginForge 0.9.0 acknowledge
+ Pre-Coding-Reality-Check. Surface findings before any
code-write.

End of prompt.
