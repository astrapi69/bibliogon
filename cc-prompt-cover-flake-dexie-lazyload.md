# CC-Prompt: offline-pwa cover-upload flake (DexieStorage lazy-load race)

## Context

You are CC on `main`, Bibliogon repo. The offline smoke gate
(`e2e/smoke/offline-pwa.spec.ts`) is now loadable and exits 0 — but one test is
**flaky on a cold first attempt** and only passes on Playwright's retry. The
release gate must be reliably green; this is the last red.

`git pull origin main` first. HEAD should be at/after `07a49d6c`.

## What already landed (do NOT redo)

Three pre-existing offline-pwa failures were fixed this session. They were all
hidden for releases because the spec **never loaded** (an `import.meta.url` ESM
trigger broke Playwright's CJS loader → "require is not defined in ES module
scope" → all 13 tests silently never ran in a full `--project=smoke` sweep):

- `544327fb` — fix: resolve the medium fixture via `__dirname` instead of
  `import.meta.url` so the spec loads as CJS. Now 12/13 pass.
- `07a49d6c` — fix: story-bible add-form (add button now expands a collapsed
  group; was a real UX bug, regression-pinned) + AI test (dropped the
  `ai-enabled` click — seed default is `enabled=true`, so the click turned AI
  OFF and made the provider section `pointer-events:none`).

Verified green in isolation: story-bible E2E, AI E2E, `StoryBibleSidebar`
Vitest 10/10, tsc clean.

## The remaining flaky test

`offline-pwa.spec.ts:188` — **"book cover uploads + displays offline from
IndexedDB, persists across reload"**.

- Symptom: after `metadata-save` + reload, `cover-preview-img` never appears
  on a **cold** fresh context (fails at the line-239 `toBeVisible`), but
  passes on a **warm** retry in ~3.8s. With `--retries=0 --repeat-each=3` ALL
  three cold runs fail; with the config retries it shows as "1 flaky" and the
  gate exits 0.
- A higher timeout does NOT help (tried 20s and 35s — still fails cold, so it
  is not "slow-but-completes"; `getBlob` returns null cold and the img never
  renders). The save-row race is NOT the cause either (tried waiting for the
  `.Toastify__toast--success` toast after save — the test still failed cold at
  the same line). Both half-measures were reverted; the test is back to its
  committed form.

### Root-cause hypothesis (start here)

A **DexieStorage lazy-load race** — same class as the v0.47.1 fix ("first-render
DexieStorage lazy-loading race that left the Settings dropdowns empty"):
`frontend/src/hooks/useAssetUrl.ts` runs `getStorage().assets.getBlob(bookId,
filename)` in a `useEffect`. On a cold reload the storage/IndexedDB may not be
ready when that effect fires → `getBlob` resolves null → `setBlobUrl(null)` →
the effect's deps (`[mode, bookId, filename]`) don't change → it never re-runs
→ `cover-preview-img` (rendered only when the blob URL resolves, see
`CoverUpload.tsx:~190`) never appears. Warm, storage is ready in time → it
resolves.

The data is genuinely present (the blob store in `DexieStorage.covers.upload`
→ `storeAssetBlob` → `await offlineDb.assets.put(row)` is awaited; keys match —
warm proves it). So this is a **readiness/timing** bug in the offline asset
resolution, not data loss and not a test bug.

### Suggested fix direction

Make `useAssetUrl` resilient to a not-yet-ready store: e.g. await a
storage-ready signal before the first `getBlob`, OR re-run the resolution when
DexieStorage finishes its lazy init (whatever the v0.47.1 fix introduced for
the settings/registries preload — reuse that readiness hook). Check how
`DexieStorage` signals "seeded/ready" (`ensureSeeded` / the preload added in
v0.47.1) and gate `getBlob` on it. A pure test-side wait is a band-aid; the
real fix is in the resolver/storage-init so production cold-loads are reliable
too (this path is a documented P3c "live-verify gap").

### Diagnostic to confirm before fixing

Add a temporary `page.evaluate` after the reload (cold repro) that reads the
book row + the asset blob straight from IndexedDB, to confirm cover_image is
persisted and the asset bytes exist (expected: both present → proves it's a
resolver-readiness race, not missing data). Remove the diagnostic before
committing.

## Verify

- `cd e2e && npx playwright test --project=smoke smoke/offline-pwa.spec.ts -g "book cover uploads" --retries=0 --repeat-each=3` → all 3 cold runs pass.
- Full `--project=smoke smoke/offline-pwa.spec.ts` → 13/13, no "flaky".
- `cd frontend && npx tsc --noEmit && npx vitest run` stays green; add a Vitest
  regression for the resolver-readiness fix if it lives in `useAssetUrl`.

## Discipline

- Run vitest/playwright from `frontend/` and `e2e/` respectively (not repo root).
- Playwright boots its own backend+frontend webServers; `--project=smoke`
  occasionally throws a transient "Project(s) 'smoke' not found" config-load
  error — just re-run.
- Explicit-path `git add` only (a parallel agent may have work in flight);
  `git fetch` + check `origin/main` before pushing.
- No inline comments in product code (TSDoc only); the e2e specs do carry
  explanatory comments (match the file's style).
