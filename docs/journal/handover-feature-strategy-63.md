# Handover — feature-strategy integration (#63)

**For:** CCW (continues the integration).
**From:** the session that scoped + prepped #63 and shipped the v0.50.0 gate fixes.
**Date:** 2026-06-11.

CCW also has the authoritative spec `cc-prompt-feature-strategy-v2.md` (held by
Aster). That prompt is the contract; this document is the technical ground state
so CCW can start without rediscovery. Where this doc and the prompt agree, follow
the prompt; where this doc reports a code-verified deviation, treat it as input to
the prompt's Step 3a ("verify the feature list against the actual gating sites").

---

## Branch + repo state

- **Work branch:** `feature/feature-strategy-gating` — **on origin** (pushed).
  - Contains one commit on top of `main@c8a4cede`:
    `06439caa chore(deps): add @astrapi69/feature-strategy + react adapter (#63)`.
  - `frontend/package.json` + `package-lock.json` carry both deps
    (`@astrapi69/feature-strategy` **0.1.0**, `@astrapi69/feature-strategy-react`
    **0.1.0**). Run `npm install` after checkout.
- **`origin/main` HEAD:** `9b7a4aac` (this is the base to **rebase the feature
  branch onto** — it has the v0.50.0 gate fixes #64/#65 + the backup-notify lint
  fix; the feature branch is currently based on the pre-fix `c8a4cede`). The files
  are disjoint, so the rebase is clean.
- **No v0.50.0 tag yet** — the tag is gated on Aster's smoke run; do **not** tag.

First moves for CCW:
```bash
git fetch origin
git checkout feature/feature-strategy-gating
git rebase origin/main      # clean: disjoint files
cd frontend && npm install
```

---

## What is done

1. **Deps installed + committed** (npm 0.1.0 for both packages).
2. **Real API read from the `.d.ts`** (the prompt's code is illustrative — the
   `.d.ts` wins). Verified shape:
   - Core exports: `FeatureRegistry`, `FeatureDescriptor { id, defaultState, metadata? }`,
     `FeatureStrategy`, `ConditionalFeatureStrategy`, `StaticFeatureStrategy`,
     `CompositeStrategy`, `RoleBasedFeatureStrategy`, `mostRestrictive`,
     `FEATURE_STATE_SEVERITY`. State = `'active' | 'disabled' | 'hidden'`.
   - `ConditionalFeatureStrategy` takes a **`Record<featureId, FeatureCondition>`**;
     `FeatureCondition = { evaluate(ctx?): FeatureState | undefined; reason?: string | ((ctx?)=>string|undefined) }`.
     `evaluate` returning `undefined` = abstain.
   - `registry.getState(id, ctx)` resolves: **strategy verdict → descriptor
     `defaultState` → `hidden` for unknown ids (fail-closed).**
   - React: `FeatureProvider({ registry, context, children })` — **strategy lives on
     the registry (`registry.setStrategy(...)`), it is NOT a provider prop**;
     `useFeature(id) → { state, isActive, isDisabled, isHidden, reason }`;
     `<Feature id whenDisabled whenHidden>{active}</Feature>`.
3. **Architecture decisions locked** (user-adjudicated this session):
   - **Full centralization** — register the table's features AND the ~6 backend-only
     sub-controls; no half-measure.
   - **AI key-aware** — offline AI works *with* a configured key
     (`disabled` only when no key). Aligning Editor + AiSetupWizard to this is
     intended (they currently hard-disable offline — a leftover of the old gate).
   - **Gate vs Branch vs Infra split** (below) — only true gates go in the registry.
   - **Three-tier visibility** replaces the old "disable + explain, do not hide":
     `disabled` when the user can act (configure a key); `hidden` when the user can
     do nothing in this mode (no git binary / TTS engine / Pandoc in a browser).
     **Update `architecture.md` accordingly (prompt Step 8).**

## What is missing (the whole migration — prompt Steps 2-9)

`featureConfig.ts`, the strategy, the `FeatureProvider` wiring, the reactive
`useHasAiKey`, all call-site migrations, the i18n key, the `architecture.md`
rewrite, deleting `useOfflineFeatureGate` + `OfflineFeatureNotice`, and the
verification (tsc / Vitest / axe / fail-closed spike / key-reactivity / smoke).

---

## Call-sites (28) — three-bucket classification

`grep -rn 'useOfflineFeatureGate\|OfflineFeatureNotice' frontend/src/ --include='*.tsx' --include='*.ts'`
→ 28 files (incl. the hook/notice definitions, tests, and infra). Classification
from this session's audit:

### TRUE GATE → migrate to `useFeature` / `<Feature>`

| File | Feature(s) | Dexie state |
|---|---|---|
| `pages/GitSyncPage.tsx` | git-sync | hidden |
| `pages/GitBackupPage.tsx` | git-backup | hidden |
| `components/settings/LanAccessSettings.tsx` | lan-mode | hidden |
| `components/settings/BackupsSettings.tsx` | backup-compare + backup-history | hidden (JSON full-backup section stays **active** — do not hide it) |
| `components/TranslationLinks.tsx` | translation-links | hidden |
| `components/CreateBookForm.tsx` | book-templates (the template switcher) | hidden |
| `components/WritingHistoryView.tsx` | writing-history-csv (CSV button only) | hidden (page stays active) |
| `components/Editor.tsx` | ai-generate (toolbar AI buttons) | disabled w/o key |
| `components/AITemplatePanel.tsx` | ai-fill + ai-template-file-io | disabled w/o key (see deviation below) |
| `components/BookMetadataEditor.tsx` | ai-generate (marketing, already key-aware) + kdp-category-catalog (suggestions only) | disabled / hidden |
| `components/BookBulkActionBar.tsx` | bulk-export + ai-generate (bulk AI) | hidden / disabled |
| `components/articles/ArticleBulkActionBar.tsx` | bulk-export + ai-generate (bulk AI) | hidden / disabled |
| `pages/Dashboard.tsx` | bulk-export + bgb-import (backend import-wizard trigger) + backup-export(.bgb hamburger) | hidden |
| `pages/ArticleList.tsx` | bulk-export + bgb-import (backend import-wizard trigger) | hidden |

### LOGIC BRANCH → stays on `useStorageMode()` (do NOT put in the registry; routes, not gates)

| File | Why |
|---|---|
| `pages/ExportPage.tsx` | `shouldUseClientEngine(engine, offline)` — client vs backend engine |
| `pages/MediumImportPage.tsx` | client DOMParser parse vs backend upload |
| `components/settings/DangerZoneSettings.tsx` | Dexie reset vs `/api` reset |
| `components/settings/AiAssistantSettings.tsx` | browser-direct provider ping vs backend |
| `components/BookMetadataEditor.tsx` (AI-with-key branch part) | picks browser-direct vs backend AI path (its *gates* are listed above; the *branch* stays on mode) |

### INFRA → do NOT touch

`api/client.ts` (guardedFetch reject), `storage/api-storage.ts` (seam),
`storage/useStorageMode.ts` (the mode source). Plus the hook/notice definitions
to be deleted last: `storage/useOfflineFeatureGate.ts`,
`components/OfflineFeatureNotice.tsx`.

### Test files (assertions update as their surfaces migrate, not "gates")

`CreateBookForm.test.tsx`, `AITemplatePanel.offline.test.tsx`,
`WritingHistoryView.test.tsx`, `DangerZoneSettings.test.tsx`,
`useStorageMode.test.tsx`.

---

## Net-new gates (NOT currently behind `useOfflineFeatureGate` — find their entry points)

`tts`, `pandoc-export`, `version-history` are in the feature table but are **not**
gated by the hook today (they just fail/838 offline). CCW must locate their UI
entry points (audiobook/TTS trigger; the export-engine "backend/Pandoc" option;
the chapter-snapshots/`ChapterVersions` entry) and add the `hidden` gate there.

## Deviations to verify (prompt Step 3a — report, don't assume)

1. **ai-template-file-io** — prompt puts it in the key-dependent bucket
   (`disabled` w/o key). Code note: the AITemplatePanel **export/import** buttons
   round-trip a `.biblio.yaml` file and were disabled offline as a backend
   round-trip. Verify whether they are key-dependent (→ disabled) or
   backend-dependent (→ hidden). The **Fill** button is the part that works
   browser-direct with a key.
2. **kdp-category-catalog** — this is a **skip-fetch for category *suggestions***;
   the category field itself works offline. "Hidden" must hide only the
   suggestions/datalist, NOT the field.
3. **translation-links** — skip-fetch in an effect; hiding the whole section
   offline is fine (no siblings exist offline).

## Reactive AI-key requirement (prompt Req C) — there is a gap

**No `useHasAiKey` hook exists.** The key status source is `getAiConfig()` in
`frontend/src/ai/llmClient.ts` (async) + `isAiConfigured(config)`. Today
`AITemplatePanel` and `BookMetadataEditor` each do a **one-shot**
`getAiConfig().then(isAiConfigured)` in a `useEffect` — i.e. **non-reactive**
(enter a key in Settings → buttons stay disabled until reload). CCW must build a
**reactive** `useHasAiKey()` (subscribe to settings/Dexie changes) and feed it into
the memoized provider context. Acceptance: enter a key → AI buttons go active
**without reload**; remove it → disabled without reload. This is a named
verification point in the prompt.

## Pitfalls already paid for (don't relearn)

- Provider context **must** be `useMemo(() => ({ mode, hasAiKey }), [mode, hasAiKey])`
  (inline object re-renders every consumer).
- Registry is a **module constant** (`new FeatureRegistry(); registerAll(); setStrategy()`)
  — not a `useMemo` in a component.
- Strategy holds **only** rules for the key-dependent + dexie-hidden buckets; the
  always-active group lives **only** in the descriptors' `defaultState: 'active'`.
  **No `ALWAYS_ACTIVE` set, no active fallback** — abstain (`undefined`) for
  unruled features; unknown ids fail-closed to `hidden`.
- Conditions must be **pure sync lookups on the context** (evaluated lazily
  per-consumer per-render; `getReason` re-runs `getState`).
- `hidden` page-routes (GitSync/GitBackup) — hide the **nav link/trigger** and have
  the route render nothing; don't leave a dead route showing an empty shell.

## Issue

- **#63** — Integrate @astrapi69/feature-strategy (open). Reference it in the
  migration commits; close it in the final commit.
- (#64/#65 are the v0.50.0 gate fixes — already on `main@9b7a4aac`, unrelated.)
