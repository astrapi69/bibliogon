# Cross-CC handover — Issue #63: integrate `@astrapi69/feature-strategy`

**Date:** 2026-06-11
**For:** a fresh Claude Code on the Web (CCW) session
**Tracking issue:** [#63](https://github.com/astrapi69/bibliogon/issues/63) — *Integrate @astrapi69/feature-strategy to replace ad-hoc feature gating*
**Base commit:** `origin/main` @ `63bac0c` (v0.50.0 shipped + #64/#65 fixed; **no v0.50.0 tag was cut** — latest tag is still v0.49.0)

This handover is **self-contained**. A prior local branch
`feature/feature-strategy-gating` (which had the dependency install committed)
lived only in a now-reclaimed ephemeral container and is **gone** — do not look
for it. Start fresh from `main` @ `63bac0c`.

---

## Where things stand

- v0.50.0 is shipped on `main`; the two follow-up gate fixes are merged:
  - `67f9598` fix(articles): apply `?type=` deep-link after registry loads (Closes #65)
  - `fcf8792` / `61e9274` smoke-gate hardening (Closes #64)
  - `63bac0c` docs(changelog): note the `?type=` race fix (#65)
- #63 is **open and not started in any surviving branch.**
- `@astrapi69/feature-strategy` is **not referenced anywhere** in the repo yet
  (verified: zero hits in `frontend/`, `package.json`, `docs/`). This is a
  from-scratch integration.

## Goal (from #63)

Replace the ad-hoc binary offline gate with a central feature registry +
strategy pattern, exposing **three explicit states: active / disabled /
hidden**. One `FeatureProvider` at the app root, fed a `{ mode, hasAiKey }`
context derived from `useStorageMode()`. Every consumer uses `useFeature()`;
the old hook + component are deleted (no dead paths).

## Verified current implementation (what you are replacing)

The gate today is **binary**, defined in
`frontend/src/storage/useOfflineFeatureGate.ts`:

```ts
export function useOfflineFeatureGate(): { offline: boolean; message: string } {
  const { mode } = useStorageMode();          // "api" | "dexie"
  const { t } = useI18n();
  return {
    offline: mode === "dexie",
    message: t("ui.feature.requires_desktop_app",
               "This feature requires the Bibliogon desktop app"),
  };
}
```

- `mode` comes from `frontend/src/storage/useStorageMode.ts`
  (`{ mode, online, offlineEnabled }`; `mode` is `"dexie"` offline, `"api"`
  online). That hook is the **only** input the current gate has — there is **no
  `hasAiKey` notion today**. Wiring `hasAiKey` is a new deliverable (the AI key
  lives behind the AI settings; start at
  `frontend/src/components/settings/AiAssistantSettings.tsx` and the Dexie
  settings store).
- The notice component is `frontend/src/components/OfflineFeatureNotice.tsx`.

### Call sites to migrate (28 files — `grep -rln "useOfflineFeatureGate\|OfflineFeatureNotice" frontend/src`)

Production code (migrate to `useFeature()` / the new component):
```
frontend/src/api/client.ts
frontend/src/storage/api-storage.ts
frontend/src/components/AITemplatePanel.tsx
frontend/src/components/AiSetupWizard.tsx
frontend/src/components/BookBulkActionBar.tsx
frontend/src/components/BookMetadataEditor.tsx
frontend/src/components/Editor.tsx
frontend/src/components/TranslationLinks.tsx
frontend/src/components/WritingHistoryView.tsx
frontend/src/components/articles/ArticleBulkActionBar.tsx
frontend/src/components/settings/AiAssistantSettings.tsx
frontend/src/components/settings/BackupsSettings.tsx
frontend/src/components/settings/DangerZoneSettings.tsx
frontend/src/components/settings/LanAccessSettings.tsx
frontend/src/pages/ArticleList.tsx
frontend/src/pages/BookEditor.tsx
frontend/src/pages/Dashboard.tsx
frontend/src/pages/ExportPage.tsx
frontend/src/pages/GitBackupPage.tsx
frontend/src/pages/GitSyncPage.tsx
frontend/src/pages/MediumImportPage.tsx
```
To delete after migration:
```
frontend/src/storage/useOfflineFeatureGate.ts
frontend/src/components/OfflineFeatureNotice.tsx
```
Tests referencing the old path (update/replace, don't just delete coverage):
```
frontend/src/components/AITemplatePanel.offline.test.tsx
frontend/src/components/CreateBookForm.test.tsx
frontend/src/components/CreateBookForm.tsx
frontend/src/components/WritingHistoryView.test.tsx
frontend/src/components/settings/DangerZoneSettings.test.tsx
```

## Feature classification (owner-confirmed in #63 — treat as the spec)

- **active in both modes:** export, story-bible, storyboard, picture-book,
  comics, ai-fill, medium-import, writing-history, danger-zone-reset,
  book-import-json, authors-export
- **disabled in dexie (no AI key) / active (with key):** ai-generate
- **hidden in dexie:** git-sync, git-backup, tts, lan-mode, backup-compare,
  backup-history, bgb-import, pandoc-export, version-history

## Suggested steps

1. `cd frontend && npm install --save-exact @astrapi69/feature-strategy @astrapi69/feature-strategy-react`
   (confirm the exact package names/versions on npm first; if unpublished,
   **stop and report** — do not vendor a stub). Commit the dep bump on its own.
2. Define a single feature registry mapping each feature id → strategy that
   reads `{ mode, hasAiKey }` and returns active/disabled/hidden, per the
   classification above.
3. Mount `FeatureProvider` at the app root (`frontend/src/main.tsx` /
   top-level layout), deriving its context from `useStorageMode()` +
   the AI-key signal.
4. Migrate the 21 production call sites to `useFeature(id)`; render disabled +
   hint for the `disabled` state, render **nothing** for the `hidden` state.
5. Wire `hasAiKey` for the `ai-generate` feature.
6. Delete `useOfflineFeatureGate.ts` + `OfflineFeatureNotice.tsx`; update the
   tests; `grep` to confirm zero remaining references.

## Acceptance (from #63 + repo gates)

- **Dexie mode:** active features work; hidden features absent (no button/menu
  item); `ai-generate` w/o key visible + hint; **zero** "requires desktop app"
  toasts/notices via the old path.
- **API mode:** everything active; nothing hidden/disabled.
- `useOfflineFeatureGate` + `OfflineFeatureNotice` deleted, no references.
- `cd frontend && npx tsc --noEmit` clean; **Vitest** green; **axe** green.
- The offline E2E hard gate still passes: `e2e/smoke/offline-pwa.spec.ts`
  enforces **literal zero `/api`** calls in dexie mode — the `hidden`/`disabled`
  states must fire no `/api` request.
- `Closes #63` in the final commit/PR.

## ⚠️ One reconciliation point — flag to the owner, do not silently resolve

`.claude/rules/architecture.md` ("Dexie-mode rule") and the synced
**FUNKTION-NICHT-VERFUEGBAR** note currently say Bibliogon uses
**"disable + explain, do NOT hide"** for offline-unavailable features
(user-adjudicated 2026-06-05). Issue #63 deliberately introduces a **`hidden`**
bucket for 9 features. These are in tension. #63 is the owner's issue and is
newer, so the three-state model (with an explicit `hidden` bucket) is the
intended refinement — **but update `architecture.md` in the same PR** so the
rule and the code agree, rather than leaving the rule contradicting shipped
behavior. If anything is ambiguous, ask the owner before deleting the old path.
