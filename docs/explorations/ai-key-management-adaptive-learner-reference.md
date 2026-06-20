# AI API-key management — adaptive-learner reference (for the Bibliogon "KI-Keys Verwaltung" feature)

> **Purpose.** adaptive-learner (the sister project) has a working, multi-provider
> API-key manager: a returning user sees *which* providers have a key (masked),
> switches the active provider without losing other keys, and tests each key
> live. Bibliogon does not. This document is a faithful reference of
> adaptive-learner's design (verbatim code + file:line) plus a gap analysis and
> an adopt-1:1-vs-adapt recommendation, so the Bibliogon implementation can
> reuse the pattern instead of re-inventing it.
>
> Reference repo: `/home/astrapi69/dev/git/hub/astrapi69/adaptive-learner`
> (paths below are relative to that repo unless prefixed `bibliogon:`).
> Analysis only — no code in either repo was changed to produce this doc.

---

## 0. TL;DR — the one thing that matters

adaptive-learner stores **one key column per provider** in a single settings row
and an `active_provider` pointer; Bibliogon stores **one `api_key`** for whatever
the active provider is. That single difference is the root of every symptom the
Bibliogon user hit:

| adaptive-learner | Bibliogon (today) |
|---|---|
| `api_key_anthropic`, `api_key_openai`, `api_key_gemini` (all persist) + `active_provider` | one `ai.api_key` + `ai.provider` |
| switching provider just moves the `active_provider` pointer — keys stay | switching provider clears the key field (and used to clobber the saved key on test) |
| returning user sees a masked preview (`AIza…7f3k`) per provider | empty field, no confirmation a key is stored |
| live test = lightweight `GET /v1/models` | generation call (`"Reply OK"`) |

**Adopt the per-provider storage shape first.** The table, the masked preview,
and the "switch without losing keys" UX all fall out of it for free.

---

## 1. Architecture (text diagram)

```
                          UserSettingsRow  (one row per user, Dexie table `userSettings`)
                          ┌───────────────────────────────────────────────┐
                          │ active_provider : "anthropic"|"openai"|"gemini"│  ← pointer, not a key
                          │ api_key_anthropic : string|null  ───┐          │
                          │ api_key_openai    : string|null  ───┤ plaintext│  all three coexist
                          │ api_key_gemini    : string|null  ───┘ in IDB   │
                          │ model_override_anthropic|openai|gemini : …      │
                          └───────────────────────────────────────────────┘
                                   │ rowToSettings()  (storage/dexie-rows.ts)
                                   │   strips raw keys -> exposes booleans + masked previews:
                                   ▼
                          UserSettings  (the shape the UI sees — NEVER carries a raw key)
                          ┌───────────────────────────────────────────────┐
                          │ active_provider                                │
                          │ has_anthropic_key / has_openai_key / …  (bool) │
                          │ key_source_anthropic / … : "settings"|"env"|…  │
                          │ key_preview_anthropic / … : "AIza…7f3k" | null │  ← maskSecret()
                          │ model_override_…                                │
                          └───────────────────────────────────────────────┘
                                   │
        ┌──────────────────────────┼───────────────────────────────────────┐
        ▼                          ▼                                        ▼
  ConfiguredProvidersTable    AiSettingsPanel (orchestrator)          ApiKeyRow (×N providers)
  (overview: status,          owns useAiKeySettings();                form: SecretInput + Save/
   masked preview, active      table → focus form on Edit;            Test/Delete + format hint
   radio, Edit/Add/Delete)     after Save → scroll back to table      + test-result + restore-link

  ── writes go through the storage seam ──────────────────────────────────────────────
  useAiKeySettings  →  getStorage().settings.{ update | testApiKey | backupApiKey |
                       getApiKeyBackup | deleteApiKey }
                          │
                          ├── Dexie mode  → dexie-settings.ts   (browser-direct test = GET /v1/models)
                          └── API mode    → /api/settings/*     (backend tests)

  Persistence: IndexedDB. Survives tab refresh + app restart. No encryption at rest
  (browser-local, never sent to a server). Backup/rollback cache: table `apiKeyBackups`,
  one row per {user_id}#{provider}.
```

---

## 2. Pattern-relevant code (verbatim)

### 2.1 Storage row — per-provider columns (`storage/db-rows.ts:28`)

```ts
export interface UserSettingsRow {
    id: string;
    user_id: string;
    language: string;
    active_provider: AIProvider;
    /**
     * Cleartext API keys. Acceptable per v0.7.0 design: data
     * sits in the user's own IndexedDB on their own device, no
     * server roundtrip. ApiStorage / backend never sees these.
     */
    api_key_anthropic: string | null;
    api_key_openai: string | null;
    api_key_gemini: string | null;
    model_override_anthropic: string | null;
    model_override_openai: string | null;
    model_override_gemini: string | null;
    avatar: string | null;
    created_at: string;
    updated_at: string;
}
```

Dexie table registration (`storage/db.ts:62`):

```ts
export class AdaptiveLearnerDB extends Dexie {
    users!: EntityTable<UserRow, "id">;
    userSettings!: EntityTable<UserSettingsRow, "id">;
    // Phase 65 — API-key rollback cache (one row per user+provider).
    apiKeyBackups!: EntityTable<ApiKeyBackupRow, "id">;
```

### 2.2 The UI never sees a raw key — `rowToSettings` derives booleans + masked previews (`storage/dexie-rows.ts:102`)

```ts
key_preview_anthropic: maskSecret(row.api_key_anthropic),
key_preview_openai:    maskSecret(row.api_key_openai),
key_preview_gemini:    maskSecret(row.api_key_gemini),
```

The UI-facing `UserSettings` type (`types/domain.ts:69`) carries
`has_<provider>_key`, `key_source_<provider>`, `key_preview_<provider>` — **not**
the raw key. The raw key lives only in the Dexie row and is read back only by the
test/save code path.

### 2.3 Masked preview — first 4 + last 4 (`lib/maskSecret.ts`)

```ts
const ELLIPSIS = "…";

export function maskSecret(secret: string | null | undefined): string | null {
  if (secret == null) return null;
  const trimmed = secret.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= 8) {
    return "•".repeat(trimmed.length); // too short to window without overlap
  }
  return `${trimmed.slice(0, 4)}${ELLIPSIS}${trimmed.slice(-4)}`;
}
```

`maskSecret("AIzaSyA-1234567f3k") → "AIza…7f3k"`. Pure, app-independent, unit-tested.

### 2.4 Active provider + status classification (`lib/aiProviderStatus.ts`)

```ts
export type ProviderKeyStatus = "active" | "empty" | "desktop_only" | "external";

/** Providers that cannot be called browser-direct (CORS) — usable only in
 *  server/desktop mode. Currently empty in adaptive-learner; the single
 *  data-driven source so a future CORS-locked provider needs a list entry,
 *  not a logic change. */
export const CORS_BLOCKED_PROVIDERS: ReadonlySet<AIProvider> = new Set<AIProvider>();

export function providerKeyStatus({ hasKey, source, mode, corsBlocked }: ProviderKeyStatusInput)
  : ProviderKeyStatus {
  if (mode === "dexie" && corsBlocked) return "desktop_only"; // unusable in browser
  if (!hasKey) return "empty";
  if (source === "env" || source === "secrets_yaml") return "external"; // managed outside the app
  return "active";
}
```

> **Bibliogon divergence to keep:** adaptive-learner's `CORS_BLOCKED_PROVIDERS`
> is empty (it validates via `GET /v1/models`, which OpenAI/Gemini serve). Bibliogon
> generates via `POST /v1/chat/completions`, which **OpenAI/Mistral 403 from a
> browser** — so Bibliogon must keep OpenAI/Mistral in the desktop-only set
> (`bibliogon: providerSupportsBrowserTest()` in `frontend/src/ai/llmClient.ts`).
> The *mechanism* (a data-driven CORS-blocked set → `desktop_only` status) is
> identical and should be reused; only the *contents* of the set differ.

### 2.5 Provider catalog (`lib/constants.ts:118` + `storage/ai-providers.ts:39`)

```ts
export const AI_PROVIDERS = ["anthropic", "openai", "gemini"] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export const MODEL_SUGGESTIONS: Record<AIProvider, readonly string[]> = {
  anthropic: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest",
              "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
  openai:    ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
  gemini:    ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-1.5-pro"],
};

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai:    "gpt-4o-mini",
  gemini:    "gemini-2.0-flash",
};
```

> Bibliogon already has the richer equivalent in `bibliogon: frontend/src/utils/aiProviders.ts`
> (6 providers incl. `mistral`/`lmstudio`/`custom`, with `base_url`/`requires_api_key`).
> Reuse Bibliogon's catalog; do **not** import adaptive-learner's smaller one.
> (Note adaptive-learner's model lists are stale — `claude-3-5-*`, `claude-sonnet-4-20250514`
> are deprecated/retired; Bibliogon's were just refreshed to `claude-sonnet-4-6` etc.)

### 2.6 The settings hook — multi-provider, save/test/delete/restore (`hooks/settings/useAiKeySettings.ts`)

Exposed surface (`:261`):

```ts
return { busy, keyDrafts, setKeyDrafts, modelDrafts, setModelDrafts,
         testResults, backupAvailable,
         handleProviderChange, handleSaveKey, handleRestoreBackup, handleTestKey,
         handleSaveModel, handleClearModel, handleDeleteKey };
```

Switch active provider — **just moves the pointer, no key touched** (`:72`):

```ts
const handleProviderChange = async (provider: AIProvider) => {
    if (busy) return;
    setBusy("provider");
    const updated = await getStorage().settings.update(settings.user_id, {
        active_provider: provider,            // ← only the pointer
    });
    onSettingsChange(updated);
    await refreshApiKeyStatus();
};
```

Save a key — auto-test-on-save, with a rollback backup on success (`:111`):

```ts
const handleSaveKey = async (provider: AIProvider) => {
    const key = keyDrafts[provider].trim();
    if (key.length === 0) return;
    await persistKey(provider, key);                               // write the per-provider column
    let test: ApiKeyTestResult;
    try { test = await getStorage().settings.testApiKey(settings.user_id, { provider, key }); }
    catch { test = { success: false, kind: "network" }; }
    setTestResults((prev) => ({ ...prev, [provider]: test }));
    if (test.success) {
        await getStorage().settings.backupApiKey(settings.user_id, { provider, key }); // last-known-good
        setBackupAvailable((prev) => ({ ...prev, [provider]: true }));
    }
};
```

Delete (with confirm) (`:239`):

```ts
const handleDeleteKey = async (provider: AIProvider) => {
    const ok = await confirm({ message: t("settings.api_key_confirm_delete", "Really remove this API key?"),
                               confirmLabel: t("common.remove", "Remove"), variant: "danger" });
    if (!ok) return;
    const updated = await getStorage().settings.deleteApiKey(settings.user_id, provider);
    onSettingsChange(updated);
    await refreshApiKeyStatus();
};
```

### 2.7 Connection test — lightweight `GET /v1/models`, classified (`storage/dexie-settings.ts:140`)

```ts
async testApiKey(userId, body: { provider: AIProvider; key?: string }): Promise<ApiKeyTestResult> {
  // ... resolve key from body or the stored column ...
  if (!key || key.trim().length === 0) return { success: false, kind: "no_key" };
  try {
    // #799 — validate against the provider's models-list GET (OpenAI /v1/models,
    // Gemini /v1beta/models?key=, Anthropic /v1/models), NOT a generation call.
    // A 1-token generation returns empty on Gemini (false failure) and depends on
    // per-model access on OpenAI — neither reflects whether the key is VALID.
    // The GET is browser-direct + CORS-friendly (no preflight on Gemini's query-param key).
    await fetchAvailableModels(provider, key.trim());
    return { success: true, kind: "ok" };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403) return { success: false, kind: "invalid" };
      if (err.status === 429) return { success: false, kind: "rate_limit" };
      return { success: false, kind: "error" };
    }
    return { success: false, kind: "network" };   // never reached the provider
  }
}
```

Result type (`storage/types/settings.ts:21`):

```ts
export type ApiKeyTestKind = "ok" | "invalid" | "rate_limit" | "network" | "error" | "no_key";
export interface ApiKeyTestResult { success: boolean; kind: ApiKeyTestKind; }
```

Browser-direct model fetch — note the Anthropic browser header (`storage/model-discovery.ts`):

```ts
// Anthropic
await fetch("https://api.anthropic.com/v1/models", { method: "GET", headers: {
  "x-api-key": apiKey, "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
}});
// OpenAI
await fetch("https://api.openai.com/v1/models", { method: "GET",
  headers: { Authorization: `Bearer ${apiKey}` }});
// Gemini (key as query param — no preflight)
await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
            { method: "GET" });
```

### 2.8 The overview table — exactly the CCW-prompt mockup (`components/ConfiguredProvidersTable.tsx`)

Row derivation (`:67`) and the masked-preview cell (`:202`):

```tsx
function buildRow(provider, settings, mode): ProviderRow {
  const hasKey = settings[`has_${provider}_key`] as boolean;
  const status = providerKeyStatus({ hasKey, source: settings[`key_source_${provider}`],
                                     mode, corsBlocked: isDesktopOnlyProvider(provider) });
  const override = (settings[`model_override_${provider}`] as string | null) ?? "";
  const model   = hasKey ? override.trim() || DEFAULT_MODELS[provider] : null;
  const preview = (settings[`key_preview_${provider}`] as string | null | undefined) ?? null;
  return { provider, status, hasKey, isActive: settings.active_provider === provider, model, preview };
}
// row cells: active radio · name+icon (+ "Active" badge) · model · status · masked preview · Edit/Add + Delete
```

Status → token-backed Tailwind colour (`:41`):

```ts
const STATUS_CLASS: Record<ProviderKeyStatus, string> = {
  active: "text-success", empty: "text-fg-muted",
  desktop_only: "text-warning", external: "text-info",
};
```

### 2.9 Orchestrator wiring — table → form focus, save → back to table (`components/AiSettingsPanel.tsx`)

```tsx
// Edit/Add in the table focuses that provider's input:
function focusProviderInput(provider: AIProvider): void {
  const el = document.querySelector<HTMLInputElement>(`[data-testid="api-key-input-${provider}"]`);
  el?.scrollIntoView?.({ behavior: "smooth", block: "center" }); el?.focus?.();
}
// After Save the key field clears; bring the user back to the overview (#810):
const handleSaveKeyAndReturn = async (provider: AIProvider) => {
  await handleSaveKey(provider);
  overviewRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
};
// render: <ConfiguredProvidersTable onSetActive={handleProviderChange} onEdit={focusProviderInput}
//                                    onDelete={handleDeleteKey} /> then a per-provider <ApiKeyRow/> list.
```

### 2.10 Masked secret INPUT — `SecretInput` (`shared/forms/SecretInput.tsx`)

A `type="text"` field (NOT `type="password"`, to dodge the credential autofill
dropdown) with CSS masking + reveal toggle + every password-manager opt-out:

```tsx
const AUTOFILL_OPT_OUT = {
  autoComplete: "off", autoCorrect: "off", autoCapitalize: "off", spellCheck: false,
  "data-1p-ignore": "", "data-lpignore": "true", "data-bwignore": "true", "data-form-type": "other",
} as const;

// <Input type="text" className={cn("pr-11", !revealed && "[-webkit-text-security:disc]")} {...props} {...AUTOFILL_OPT_OUT}/>
// + an Eye / EyeOff toggle button (tabIndex={-1}, aria-pressed, aria-label)
```

> Bibliogon already has the equivalent: `bibliogon: frontend/src/lib/components/TokenInput.tsx`
> (the password-manager fix). Use TokenInput; do not port SecretInput.

---

## 3. Component / module inventory

| File | Role | Key props / exports |
|---|---|---|
| `lib/maskSecret.ts` | `first4…last4` preview | `maskSecret(secret): string\|null` |
| `lib/apiKeyFormat.ts` | client-side shape check (instant, pre-test) | `isValidApiKeyFormat(provider, key)`, `API_KEY_FORMAT_HINT` |
| `lib/aiProviderStatus.ts` | status classifier + CORS set | `providerKeyStatus({hasKey,source,mode,corsBlocked})`, `CORS_BLOCKED_PROVIDERS`, `isDesktopOnlyProvider` |
| `lib/constants.ts` / `storage/ai-providers.ts` | provider list, model suggestions, defaults | `AI_PROVIDERS`, `MODEL_SUGGESTIONS`, `DEFAULT_MODELS` |
| `hooks/settings/useAiKeySettings.ts` | all state + write handlers | `keyDrafts`, `testResults`, `backupAvailable`, `handleProviderChange/SaveKey/TestKey/DeleteKey/RestoreBackup/SaveModel/ClearModel` |
| `hooks/settings/useApiKeyStatus.ts` | reactive "is the active provider configured?" snapshot | `useApiKeyStatus(): {ready,hasKey,activeProvider}` |
| `components/ConfiguredProvidersTable.tsx` | the overview table | props: `settings, mode, busy, onSetActive, onEdit, onDelete` |
| `components/ApiKeyRow.tsx` | one provider's form (input+actions+feedback) | props: `provider, settings, draft, busy, testResult, backupAvailable, onDraftChange, onSave, onTest, onDelete, onRestoreBackup` |
| `components/AiSettingsPanel.tsx` | orchestrator (table + provider select + model overrides + key rows) | props: `settings, onSettingsChange, active` |
| `shared/forms/SecretInput.tsx` | masked secret input | all native `<input>` props minus `type` + `wrapperClassName` |
| `storage/dexie-settings.ts` | Dexie impl of `settings.testApiKey/backupApiKey/deleteApiKey/update` | — |
| `storage/dexie-rows.ts` / `db-rows.ts` / `db.ts` | row shape, `rowToSettings` (strip+mask), tables | `UserSettingsRow`, `ApiKeyBackupRow` |

---

## 4. Differences vs Bibliogon (what's missing)

Bibliogon today (`bibliogon: frontend/src/storage/seed/seed-settings.json`,
`bibliogon: frontend/src/components/settings/AiAssistantSettings.tsx`,
`bibliogon: frontend/src/ai/llmClient.ts`, `useAiModels`, `useHasAiKey`):

| Capability | adaptive-learner | Bibliogon today | Gap |
|---|---|---|---|
| Key storage | per-provider columns + `active_provider` | single `ai.api_key` + `ai.provider` | **core gap** — switching providers can't keep both keys |
| Switch provider | moves a pointer; keys persist | clears the key field; (recently fixed) test-save no longer clobbers | UX still loses the in-field key on switch |
| Overview table | `ConfiguredProvidersTable` | none | **missing** — user can't see what's stored |
| Masked preview | `maskSecret` + `key_preview_*` on payload | none (empty field) | **missing** — no "is my key still there?" confirmation |
| Status states | active / empty / desktop_only / external | implicit (`useHasAiKey` boolean only) | partial |
| Live test | `GET /v1/models` (CORS-friendly, validates auth) | generation call `"Reply OK"` | different (see §5) |
| CORS-blocked set | empty (all browser-OK via models-GET) | `providerSupportsBrowserTest()` = anthropic/google/lmstudio/custom; openai/mistral blocked | Bibliogon's is correct for its chat/completions path — keep |
| Backup / rollback | `apiKeyBackups` table + restore link | none | nice-to-have, not required for the MVP |
| Masked input | `SecretInput` | `TokenInput` (equivalent) | **already covered** — reuse TokenInput |
| Providers | 3 (anthropic/openai/gemini) | 6 (incl. mistral/lmstudio/custom) | Bibliogon's catalog is richer — keep it |

---

## 5. Recommendation: adopt 1:1 vs adapt

### Adopt 1:1 (the design is portable, copy the shape)
1. **Per-provider key storage + `active_provider` pointer.** This is the
   keystone. In Bibliogon, evolve `settings.ai` from a single
   `{provider, api_key, model}` to per-provider key/model maps (e.g.
   `ai.keys.{anthropic,openai,...}`, `ai.model_overrides.{…}`, keep
   `ai.provider` as the active pointer). Switching provider then never touches a
   key. (Mirror adaptive-learner's `UserSettingsRow` columns; Bibliogon's
   settings object can use nested maps instead of flat columns since it's JSON.)
2. **`maskSecret(first4…last4)`** — copy `lib/maskSecret.ts` verbatim into
   `bibliogon: frontend/src/lib/` (pure, app-independent, unit-tested). Compute a
   `key_preview` per provider in the settings read path so the UI never receives
   a raw key.
3. **`providerKeyStatus` + a data-driven CORS-blocked set** — copy the
   classifier shape. Feed it from Bibliogon's existing
   `providerSupportsBrowserTest()` (so OpenAI/Mistral resolve to `desktop_only`
   in Dexie mode — the honest "Nur Desktop" the CCW mockup asks for).
4. **`ConfiguredProvidersTable` layout + the orchestrator wiring** (table →
   focus-form-on-Edit, Save → scroll-back-to-table). The component is
   presentation-only and prop-driven; lift it almost verbatim, swapping
   adaptive-learner's CSS classes for Bibliogon's Tailwind tokens and `TokenInput`.
5. **Test-result `kind` enum + per-`kind` localized messages** — Bibliogon
   already classifies via `classifyAiClientError`; align the UI message table
   the same way (ok/invalid/rate_limit/network/error/no_key).

### Adapt (do NOT copy as-is)
1. **Provider catalog** — keep **Bibliogon's** `aiProviders.ts` (6 providers,
   base_url, requires_api_key, current model IDs). adaptive-learner's list is
   smaller and its model strings are stale.
2. **Masked input** — use **Bibliogon's** `TokenInput`, not `SecretInput`.
3. **Connection test method** — adaptive-learner's `GET /v1/models` validates the
   *key* and is CORS-friendly, but Bibliogon's actual generation goes to
   `POST /v1/chat/completions`, which **OpenAI/Mistral 403 from a browser**. A
   models-GET "OK" for OpenAI would be a false positive (key valid, but generation
   still blocked in-browser). Recommendation: **keep Bibliogon's CORS gating of
   OpenAI/Mistral** (`desktop_only` in PWA) regardless of test method. Optionally
   switch the *test* to a models-GET for the browser-capable providers
   (Gemini/Anthropic/LM Studio) to avoid the generation-call false-negatives
   (empty-content, per-model access) — but it is not required for the MVP and is
   orthogonal to the key-management feature.
4. **Backup/rollback cache** (`apiKeyBackups`) — skip for the first cut; it's a
   polish layer, not needed to make stored keys visible.
5. **Storage shape** — adaptive-learner uses flat Dexie columns + a relational
   row; Bibliogon's `settings.ai` is a JSON blob through the storage seam. Use
   nested maps in that blob rather than adding columns. Mind the
   `BACKUP-PARITY-PIN` / seed-mirror discipline: any new settings sub-shape must
   round-trip through `.bgb` export/import and the offline seed
   (`bibliogon: frontend/src/storage/seed/seed-settings.json`).

### Migration note (single-key → per-provider)
Existing Bibliogon users / the committed seed carry a single `ai.api_key`. On
read, migrate it into the new per-provider map under the current `ai.provider`
(e.g. `ai.keys[ai.provider] = ai.api_key`), then drop the flat field. This is the
same "normalize old shape on read" discipline used elsewhere
(see `bibliogon: .claude/rules/lessons-learned.md` "Config migration").

---

## 6. Security / persistence notes (both projects)

- **Plaintext at rest in IndexedDB, by design.** The key is the user's, on the
  user's device, never sent to a Bibliogon/AL server (the provider gets it
  directly). adaptive-learner documents this explicitly on the row type. No
  encryption layer; matching Bibliogon's offline-first model. (If encryption is
  ever wanted it's a separate decision for both repos.)
- **The UI layer never holds the raw key** beyond the in-progress draft — reads
  expose only `has_*` / `key_preview_*` / `key_source_*`. Replicate this so a
  rendered settings object can't leak a full key into logs/DOM.
- **Persistence** is automatic via IndexedDB — survives tab refresh and app
  restart. No in-memory-only path. First-run creates the settings row with
  `active_provider` defaulted and all key columns `null`.

---

## 7. File map for the implementer (quick copy list)

| Want | adaptive-learner source | Bibliogon target (suggested) |
|---|---|---|
| masked preview | `lib/maskSecret.ts` | `frontend/src/lib/maskSecret.ts` (verbatim) |
| status classifier | `lib/aiProviderStatus.ts` | `frontend/src/lib/aiProviderStatus.ts` (adapt CORS set to `providerSupportsBrowserTest`) |
| format hint (optional) | `lib/apiKeyFormat.ts` | `frontend/src/lib/aiKeyFormat.ts` |
| overview table | `components/ConfiguredProvidersTable.tsx` | `frontend/src/components/settings/ConfiguredProvidersTable.tsx` (Tailwind tokens + TokenInput) |
| per-provider form row | `components/ApiKeyRow.tsx` | fold into the existing `AiAssistantSettings.tsx` per provider |
| orchestrator wiring | `components/AiSettingsPanel.tsx` | `AiAssistantSettings.tsx` (table on top, form below, focus + scroll-back) |
| settings hook shape | `hooks/settings/useAiKeySettings.ts` | a `useAiKeySettings` hook over Bibliogon's storage seam |
| masked input | (uses `SecretInput`) | reuse `frontend/src/lib/components/TokenInput.tsx` |

---

*Compiled from adaptive-learner @ the working tree on disk; all snippets are
verbatim excerpts with file:line citations. Bibliogon references prefixed
`bibliogon:`. No changes were made to either repository.*
