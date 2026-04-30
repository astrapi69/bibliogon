# Secrets Configuration Refactor — Audit (Phase 1)

Datum: 2026-04-30. Status: Audit only, no code changes.

Goal: Gradle-style three-layer config so secrets live outside the
project tree.

```
project app.yaml (defaults, committed template)
    ↓ merged under
~/.config/bibliogon/secrets.yaml (user override, gitignored)
    ↓ merged under
env-vars (CI/Docker, highest priority)
```

---

## 1.1 Secrets inventory

| Key path | File | Sensitive | Currently set | Env-var name proposal |
|---|---|---|---|---|
| `ai.api_key` | `backend/config/app.yaml` | yes | **real Anthropic key** (live) | `BIBLIOGON_AI_API_KEY` |
| `ai.api_key` | `backend/config/app.yaml.example` | template | `''` empty | n/a (template) |
| `elevenlabs.api_key` | `backend/config/plugins/audiobook.yaml` | yes | `''` empty | `BIBLIOGON_AUDIOBOOK_ELEVENLABS_API_KEY` |
| `grammar.languagetool_api_key` | `backend/config/plugins/grammar.yaml` | yes | `""` empty | `BIBLIOGON_GRAMMAR_LANGUAGETOOL_API_KEY` |
| `grammar.languagetool_username` | `backend/config/plugins/grammar.yaml` | auth-paired | `""` empty | `BIBLIOGON_GRAMMAR_LANGUAGETOOL_USERNAME` |
| `translation.deepl_api_key` | `backend/config/plugins/translation.yaml` | yes | `""` empty | `BIBLIOGON_TRANSLATION_DEEPL_API_KEY` |

5 secret-keyed fields across 4 files. Only `ai.api_key` carries a
real value on this dev box; the rest are empty templates (users
populate them via Settings UI on demand).

### Scope decision

**Phase 2 ships `app.yaml` mechanism only.** Plugin yamls
(audiobook / grammar / translation) load via PluginManager (separate
loader path). Extending the override + env-var pattern to plugin
configs would double the implementation surface and pull in the
plugin reload machinery. Defer plugin secrets to a follow-up
prompt; flag in deprecation warning so users see the path.

---

## 1.2 Config readers

### Backend

| File:line | Reader | Purpose |
|---|---|---|
| [main.py:73](../../backend/app/main.py#L73) `_load_app_config()` | per-request fresh read | central entry point |
| [main.py:83](../../backend/app/main.py#L83) `_startup_config = _load_app_config()` | startup snapshot | for licensing init |
| [main.py:84-87](../../backend/app/main.py#L84) `_startup_config.get("licensing", ...)` | startup-only licensing config | not affected by override |
| [main.py:374, 387](../../backend/app/main.py#L374) `_load_app_config().get("ai", {}); api_key=ai_cfg.get("api_key", "")` | health probe + AI route | per-request fresh |
| [ai/routes.py:80](../../backend/app/ai/routes.py#L80) `api_key=cfg.get("api_key", "")` | AI route construction | passed cfg from caller |

All paths funnel through `_load_app_config()`. Single chokepoint.
Modifying that one function applies override + env-var merge to
every consumer transparently.

`_startup_config` is a one-shot snapshot — fine, will pick up the
override at boot. `_load_app_config()` is per-request — fine, picks
up runtime env-var changes.

### Frontend

| File:line | Reader | Purpose |
|---|---|---|
| [SupportSection.tsx:34](../../frontend/src/components/SupportSection.tsx#L34) | `appConfig.donations` | donation gate |
| [Settings.tsx:615-637](../../frontend/src/pages/Settings.tsx#L615) | `ai.api_key` read + write | API-key form + PATCH |
| [Settings.tsx:711](../../frontend/src/pages/Settings.tsx#L711) | API-key label/input | UI |
| [Settings.tsx:833-836](../../frontend/src/pages/Settings.tsx#L833) | `appConfig.plugins.{enabled,disabled}` | plugin list |
| [Settings.tsx:1102-1163](../../frontend/src/pages/Settings.tsx#L1102) | `deepl_api_key` form + PATCH | translation plugin (out of Phase 2 scope) |
| [AiSetupWizard.tsx:42, 66, 105, 172](../../frontend/src/components/AiSetupWizard.tsx#L42) | `ai.api_key` form + PATCH + needsKey gate | wizard flow |

**Two API-key UI surfaces for `ai.api_key`:** Settings tab + AiSetupWizard. Phase 2 commit 2 must hide the input in BOTH when override is active.

---

## 1.3 Settings UI write-path

### PATCH endpoint

[backend/app/routers/settings.py:120-161](../../backend/app/routers/settings.py#L120):

```python
@router.patch("/app")
def update_app_settings(body: AppSettingsUpdate) -> dict[str, Any]:
    path = _base_dir / "config" / "app.yaml"
    current = _read_yaml(path) if path.exists() else {}
    ...
    if body.ai is not None:
        current.setdefault("ai", {}).update(body.ai)
    ...
    _write_yaml(path, current)
```

**Writes directly to `backend/config/app.yaml`** — no awareness of
the override file. Settings PATCH always lands in the project file.

### Frontend write call

[Settings.tsx:631-640](../../frontend/src/pages/Settings.tsx#L631):

```ts
await api.settings.updateApp({
  ai: {
    enabled: aiEnabled,
    provider: aiProvider,
    api_key: aiApiKey,
    base_url: aiBaseUrl,
    model: aiModel,
    ...
  },
})
```

Sends full `ai` object including `api_key`. Backend merges via
`update()` so any field included overrides the same key in
`app.yaml`.

[AiSetupWizard.tsx:60-115](../../frontend/src/components/AiSetupWizard.tsx#L60) does the equivalent for the wizard flow.

### Phase 2 commit 2 design — Option A (hide field) chosen

Frontend hides `api_key` input when `secrets_managed_externally === true`:
- Settings.tsx: gate the `<input>` block (line ~711) on the flag
- Settings.tsx: also strip `api_key` from PATCH body so an accidentally re-shown field doesn't overwrite the override
- AiSetupWizard.tsx: same — hide the input, strip from PATCH

Backend defense-in-depth: in `update_app_settings`, when override
is active for a key, drop that key from the incoming body before
writing. Single guard prevents UI drift from clobbering the
override. Documented in commit 2.

---

## 1.4 Phase 2 plan

### Commit 1 — Loader refactor (~60 min)

`backend/app/main.py`:

1. Add `_get_user_override_path()` (XDG_CONFIG_HOME / APPDATA / ~/.config fallback).
2. Add `_deep_merge(base, override)` — recursive dict merge, override wins. Lists are replaced (not merged).
3. Add `_apply_env_overrides(config)` — single env var `BIBLIOGON_AI_API_KEY` for now, mapped to `ai.api_key`. Note in code comment that the same pattern extends to plugin secrets in a follow-up.
4. Modify `_load_app_config()` to chain: project → override → env.
5. Add deprecation warning logged once on startup when project `app.yaml` contains a non-empty `ai.api_key` AND override file does not exist. Message includes file path + env-var alternative.
6. New tests in `backend/tests/test_config_loader.py`:
   - Project-only baseline
   - Override-only `ai.api_key`
   - Nested merge precedence (project keeps `ai.provider`, override wins on `ai.api_key`)
   - Env-var beats override
   - Deprecation fires when secret in project + no override
   - Deprecation silent when override exists
   - XDG_CONFIG_HOME respected
   - Windows path branch via `monkeypatch.setattr(sys, "platform", "win32")`
   - Lists replaced, not merged

### Commit 2 — Settings UI gating (~45 min)

Backend:

1. New flag in `GET /api/settings/app` response (or dedicated tiny endpoint):
   `secrets_managed_externally: bool` — true when override file exists OR `BIBLIOGON_AI_API_KEY` env var is set.
2. `update_app_settings` defense-in-depth: when flag true, strip `api_key` from `body.ai` before writing.

Frontend:

3. Settings.tsx: read flag, hide `api_key` `<input>` (line ~711), render info note instead with override-path hint. Strip `api_key` from PATCH body when flag true.
4. AiSetupWizard.tsx: same — hide input + strip from PATCH. Wizard either skips the api-key step or shows the same info note.
5. i18n: 8 langs (DE, EN, ES, FR, EL, PT, TR, JA). Re-use namespace `ui.settings.ai_*`. Add `ui.settings.ai_api_key_external_note`.
6. Vitest: info-note renders when flag true, input renders when false.

### Commit 3 — Docs (~30 min)

1. `README.md` — short "Configuration" section, link to detailed doc.
2. `CLAUDE.md` — section noting secrets must NEVER live in committed config files; AI-assisted edits avoid touching `ai.api_key` in `app.yaml`.
3. `docs/configuration.md` — new file:
   - Three-layer chain explained
   - Migration steps for existing users (move `ai.api_key` from `app.yaml` to `~/.config/bibliogon/secrets.yaml`)
   - Path conventions per OS (XDG / APPDATA)
   - Env-var list (initially: `BIBLIOGON_AI_API_KEY`)
   - Docker / CI usage example (env-var)
   - Debugging: how to verify which layer a value comes from

---

## 2. Surprises / risks flagged

### Plugin yamls scoped out

PluginManager loads plugin yamls separately (PluginForge framework). Extending override+env to plugin secrets is a parallel job that would double the LOC. Phase 2 ships app.yaml only. Deprecation warning mentions plugin secrets are still in their plugin yamls — user expectation set.

### `_startup_config` snapshot

`_startup_config = _load_app_config()` runs at module import time, BEFORE any test fixture or env-var override applied by tests. Tests for the loader must call `_load_app_config()` directly with monkeypatched env / paths, not import the snapshot. Existing tests that depend on `_startup_config` are unaffected because licensing config has no secrets.

### Two UI write surfaces

`AiSetupWizard.tsx` is a separate flow from the Settings tab and also writes `api_key`. Easy to miss. Phase 2 commit 2 must touch both.

### Defense-in-depth strip on PATCH

Even with UI hidden, a stale browser tab or a misbehaving plugin could POST `api_key`. Backend defensively drops the key from PATCH body when override is active. Single-line check in `update_app_settings`.

### `app.yaml` auto-creation from example

[main.py:58-61](../../backend/app/main.py#L58) auto-copies `app.yaml.example` to `app.yaml` on first start. Fine — example has empty `ai.api_key`, so no secret leaks in. Override path takes precedence anyway.

### Env-var coverage scope

Phase 2 names ONE env var (`BIBLIOGON_AI_API_KEY`). `BIBLIOGON_SECRET_KEY` already exists for licensing in `main.py:67`. Naming convention `BIBLIOGON_*` already established. Plugin secrets follow the dotted-path-uppercased-with-underscores rule when added later.

---

## 3. Stop-conditions

Phase 1 done. No code touched.

Wait for Go on Phase 2 commit 1.

---

## 4. Acceptance criteria covered by this audit

- [x] Secrets inventory table
- [x] Config-reader call sites (backend + frontend)
- [x] Settings write-path trace (PATCH endpoint + 2 UI surfaces)
- [x] Concrete plan for each Phase-2 commit
- [x] Surprises documented (plugin yaml scoping, `_startup_config` ordering, AiSetupWizard second surface, defense-in-depth strip)
