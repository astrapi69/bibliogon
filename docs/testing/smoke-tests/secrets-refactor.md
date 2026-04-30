# Smoke Test: Secrets Refactor (Three-Layer Config)

**Shipped:** 2026-04-30
**Commits:** 294e8fa (loader), ad4301a (UI gating), f2bf783 (docs), e35ecc8 (AI client routing fix)
**Reference:** [docs/configuration.md](../../configuration.md), [docs/explorations/secrets-refactor-audit.md](../../explorations/secrets-refactor-audit.md)

Three-layer config: project `app.yaml` < `~/.config/bibliogon/secrets.yaml` < env-vars.

## Prerequisites

- Backend stopped (`make dev-down`).
- Have an Anthropic API key ready (rotated if previously exposed).
- `backend/config/app.yaml` exists with an `ai:` section (auto-generated from `app.yaml.example` on first start).

## Flow 1 — Migration from project app.yaml to override file

1. Create override file:
   ```bash
   mkdir -p ~/.config/bibliogon
   cat > ~/.config/bibliogon/secrets.yaml << 'EOF'
   ai:
     api_key: <paste-real-key>
   EOF
   chmod 600 ~/.config/bibliogon/secrets.yaml
   ```

2. Empty the project key (keep field, blank value):
   ```yaml
   # backend/config/app.yaml
   ai:
     api_key: ""
   ```

3. Restart backend: `make dev`

4. **Expected:** backend startup log clean — NO deprecation warning. Empty `ai.api_key` + override existing = silent.

5. Hard-reload frontend (Ctrl+Shift+R), open Settings → AI tab.

6. **Expected:** API-key input HIDDEN. Info-note visible: "API-Schlüssel wird aus externer Konfiguration gelesen..."

7. Verify meta-flag at API:
   ```bash
   curl http://localhost:8000/api/settings/app | jq '._secrets_managed_externally'
   ```
   **Expected:** `true`.

8. Test AI: Settings → AI → "Verbindung testen". Or trigger any AI feature.
   **Expected:** succeeds with new key from override.

## Flow 2 — Deprecation warning

1. Put a non-empty key back in `app.yaml` `ai.api_key: sk-...` AND delete `~/.config/bibliogon/secrets.yaml`.
2. Unset env-var: `unset BIBLIOGON_AI_API_KEY`.
3. Restart backend.
4. **Expected:** WARNING in log naming the file path + migration hint, e.g.:
   ```
   WARNING: Secrets found in /.../backend/config/app.yaml (ai.api_key).
   ... Move secrets to /home/.../config/bibliogon/secrets.yaml or set
   BIBLIOGON_AI_API_KEY. See docs/configuration.md for details.
   ```

## Flow 3 — Env-var precedence

1. Override file exists with `ai.api_key: from-override`.
2. `app.yaml` carries `ai.api_key: from-project`.
3. `export BIBLIOGON_AI_API_KEY=from-env` then restart backend.
4. Trigger AI feature.
5. **Expected:** request uses `from-env` (highest priority).

## Flow 4 — Defense-in-depth strip on PATCH

1. Override active (Flow 1 done).
2. With browser DevTools open, in Settings call:
   ```js
   fetch('/api/settings/app', {
     method: 'PATCH',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({ai: {provider: 'openai', api_key: 'should-be-stripped'}})
   }).then(r => r.json()).then(console.log)
   ```
3. **Expected:** response shows `provider: openai` written, but `api_key` NOT changed in `app.yaml`. Backend log shows WARNING:
   ```
   Stripped 'ai'.'api_key' from Settings PATCH because secrets are managed externally...
   ```

## Flow 5 — AiSetupWizard externally-managed branch

1. Override active. Clear `bibliogon-ai-setup-dismissed` from localStorage.
2. Edit `app.yaml`: `ai.enabled: false`. Restart backend.
3. Reload frontend → wizard opens.
4. Step 0: pick provider (any).
5. Step 1: **Expected:** API-key input HIDDEN, info-note visible, "Weiter" button ENABLED with empty key.
6. Continue through wizard, finish.
7. **Expected:** wizard saves config, dismisses; AI now `enabled: true`.

## Flow 6 — Corrupt override file

1. Corrupt the override file:
   ```bash
   echo "this is: : : not valid yaml :" > ~/.config/bibliogon/secrets.yaml
   ```
2. Restart backend.
3. **Expected:** backend starts successfully. Log shows WARNING:
   ```
   Invalid YAML in override file /home/.../secrets.yaml: ... Continuing with project config only.
   ```
4. AI feature falls back to project `app.yaml` value (or fails if project key is also empty — that's by design, the user has to fix the file).

## Known issues / by-design

- Plugin yamls (audiobook/grammar/translation) are NOT covered. PluginManager has its own loader. Tracked in [secrets-refactor-audit.md §5](../../explorations/secrets-refactor-audit.md#5-follow-up-plugin-yaml-secrets) for follow-up.
- `_startup_config` snapshot in `main.py` runs before per-test fixtures; only matters for licensing config (no secrets there).

## Failure modes

| Symptom | Likely cause |
|---------|---|
| AI feature gives 401/403 | Override file missing or wrong format. Re-check Flow 1 step 1. |
| Settings shows API-key INPUT despite override active | `_secrets_managed_externally: false` from API → override path resolution wrong. Check `XDG_CONFIG_HOME` or platform branch in `_get_user_override_path`. |
| Deprecation warning persists after migration | `ai.api_key` in `app.yaml` still non-empty. Set to `""`. |
| `make test` fails on `test_get_app_settings_externally_managed_flag_*` | Test fixture's monkeypatch missing — only happens if `client` fixture in `test_settings_api.py` was edited and forgot to redirect `_get_user_override_path`. |
