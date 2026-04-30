# Configuration

Bibliogon uses a three-layer config chain so secrets stay out of
the project tree.

```
┌─────────────────────────────────────────┐
│ env-vars (CI/Docker, highest priority)  │
│ BIBLIOGON_AI_API_KEY                    │
└─────────────────────────────────────────┘
                  ↑ overrides
┌─────────────────────────────────────────┐
│ user override file (gitignored)         │
│ ~/.config/bibliogon/secrets.yaml        │
└─────────────────────────────────────────┘
                  ↑ overrides
┌─────────────────────────────────────────┐
│ project app.yaml (committed template)   │
│ backend/config/app.yaml                 │
└─────────────────────────────────────────┘
```

Override-wins semantics: a value in the override file replaces the
same key in `app.yaml`; an env-var replaces both. Lists are
**replaced**, not merged.

---

## Where to put what

| Layer | Examples | Lives in |
|---|---|---|
| Project `app.yaml` | non-secret defaults: `app.name`, `app.default_language`, `editor.autosave_debounce_ms`, `plugins.enabled`, etc. | committed to git |
| User override | secrets the user controls: `ai.api_key`. Anything else they want to override on this machine. | `~/.config/bibliogon/secrets.yaml` (Linux/macOS), `%APPDATA%/bibliogon/secrets.yaml` (Windows) |
| Env-var | CI/Docker secrets injected by the orchestrator | environment |

**Rule of thumb:** anything sensitive belongs in the override file
or env-var. Nothing sensitive belongs in `app.yaml` (which is
gitignored locally but can leak via screen-shares, backups, or
accidental `git add -f`).

---

## Path resolution per OS

### Linux / macOS

Default: `~/.config/bibliogon/secrets.yaml`.

Set `XDG_CONFIG_HOME` to relocate (XDG-conformant):

```bash
export XDG_CONFIG_HOME=/srv/configs
# Bibliogon now reads /srv/configs/bibliogon/secrets.yaml
```

### Windows

Default: `%APPDATA%/bibliogon/secrets.yaml`.

Falls back to `~/AppData/Roaming/bibliogon/secrets.yaml` when
`%APPDATA%` is unset.

---

## Migration: move existing `ai.api_key` out of `app.yaml`

Your current `backend/config/app.yaml` may carry `ai.api_key`
inline (legacy from earlier installations). Migrate in three
steps:

```bash
# 1. Pick the destination directory.
mkdir -p ~/.config/bibliogon

# 2. Create the override file (paste your key).
cat > ~/.config/bibliogon/secrets.yaml << 'EOF'
ai:
  api_key: sk-ant-api03-your-real-key-here
EOF

# 3. Empty the api_key in app.yaml. The backend logs a deprecation
# warning while a non-empty key sits there alongside no override;
# emptying silences it.
# Edit backend/config/app.yaml: set ai.api_key: "".

# 4. Restart the backend.
make dev-down && make dev
```

Result: backend reads the merged config, sees the override-
supplied key, never falls back to `app.yaml`. The Settings tab and
AiSetupWizard hide the API-key input automatically (via the
`_secrets_managed_externally` flag) and show an info-note
explaining where the key lives.

---

## Env-var list

| Env-var | Maps to | Notes |
|---|---|---|
| `BIBLIOGON_AI_API_KEY` | `ai.api_key` | Beats both project and override |
| `BIBLIOGON_DEBUG` | `DEBUG` constant in `main.py` | `true`/`1`/`yes` to enable |
| `BIBLIOGON_CORS_ORIGINS` | CORS allowed origins | comma-separated |
| `BIBLIOGON_SECRET_KEY` | licensing HMAC | leave default in dev |

Plugin-yaml secrets (audiobook, grammar, translation) are NOT yet
covered by this mechanism — they load via PluginManager and need a
parallel refactor (T-XX Plugin-Config Secrets Layering, deferred).
For now, those keys live in their respective `backend/config/plugins/*.yaml`
files; the Settings UI for each plugin still writes back there.

---

## Docker / CI usage

```yaml
# docker-compose.prod.yml (example excerpt)
services:
  backend:
    image: bibliogon:0.24.0
    environment:
      BIBLIOGON_AI_API_KEY: ${BIBLIOGON_AI_API_KEY}
      BIBLIOGON_DEBUG: "false"
    volumes:
      - ./config:/app/backend/config
```

Inject `BIBLIOGON_AI_API_KEY` from CI secrets (GitHub Actions
secrets, GitLab CI variables, Vault, etc.). The committed
`app.yaml` keeps `ai.api_key: ""` so the env-var wins on merge.

---

## Debugging: which layer wins?

A quick way to verify what the backend sees at runtime:

```bash
curl http://localhost:8000/api/settings/app | jq '.ai.api_key, ._secrets_managed_externally'
```

- `_secrets_managed_externally: true` → override file or env-var is
  active. The Settings UI hides the API-key input.
- `_secrets_managed_externally: false` → only project `app.yaml`
  in play.

To confirm WHICH layer supplied a value:

```bash
# Project value
yq '.ai.api_key' backend/config/app.yaml

# Override value
yq '.ai.api_key' ~/.config/bibliogon/secrets.yaml

# Env-var value
echo "$BIBLIOGON_AI_API_KEY"
```

Whichever is non-empty AND highest in the chain wins.

---

## Deprecation warning

When `app.yaml` carries a non-empty `ai.api_key` AND no override
file exists AND `BIBLIOGON_AI_API_KEY` is unset, the backend logs
a one-shot WARNING at startup:

```
WARNING: Secrets found in /path/to/backend/config/app.yaml (ai.api_key).
This file is gitignored but may be committed accidentally, end up
in backups, or appear in screen-shares. Move secrets to
/home/.../.config/bibliogon/secrets.yaml or set BIBLIOGON_AI_API_KEY.
See docs/configuration.md for details.
```

The warning is informational. Existing installations with hardcoded
keys keep working unchanged; this is a migration nudge, not a
breaking change.
