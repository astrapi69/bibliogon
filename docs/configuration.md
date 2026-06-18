# Configuration

Bibliogon uses a four-layer config chain so secrets stay out of
the project tree.

```
┌─────────────────────────────────────────────────────┐
│ env-vars (CI/Docker, highest priority)              │
│ BIBLIOGON_AI_API_KEY                                │
└─────────────────────────────────────────────────────┘
                  ↑ overrides
┌─────────────────────────────────────────────────────┐
│ user override file (gitignored, outside data dir)   │
│ ~/.config/bibliogon/secrets.yaml                    │
└─────────────────────────────────────────────────────┘
                  ↑ overrides
┌─────────────────────────────────────────────────────┐
│ user-overlay app.yaml (written by the Settings UI)  │
│ ~/.local/share/bibliogon/config/app.yaml            │
└─────────────────────────────────────────────────────┘
                  ↑ overrides
┌─────────────────────────────────────────────────────┐
│ project app.yaml (committed template)               │
│ backend/config/app.yaml                             │
└─────────────────────────────────────────────────────┘
```

Resolution lives in `backend/app/config_loader.py` (`_load_app_config`):
project `app.yaml` < user-overlay `app.yaml` < `secrets.yaml` <
env-vars. Override-wins semantics: a value in a higher layer replaces
the same key in every lower layer. Lists are **replaced**, not merged.

> The user-overlay `app.yaml` is the file an **AI key set through the
> Settings UI** lands in. It sits below `secrets.yaml`, so a key in
> `secrets.yaml` (or `BIBLIOGON_AI_API_KEY`) still wins over whatever
> the UI wrote.

---

## Where to put what

| Layer | Examples | Lives in |
|---|---|---|
| Project `app.yaml` | non-secret defaults: `app.name`, `app.default_language`, `editor.autosave_debounce_ms`, `plugins.enabled`, etc. | committed to git |
| User-overlay `app.yaml` | whatever the **Settings UI** persists on this machine (incl. `ai.api_key` if entered there) | `~/.local/share/bibliogon/config/app.yaml` (Linux); under `get_data_dir()/config/` |
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

## Where files live when you run locally (`make dev`)

`make dev` / `make dev-bg` set **no** `BIBLIOGON_*` path env-vars, so
everything resolves to the platformdirs defaults in
`backend/app/paths.py`. Two distinct base directories are in play -
this catches people out:

- **Data dir** - `get_data_dir()` → `~/.local/share/bibliogon`
  (the SQLite DB, uploads, and the Settings-UI config overlays).
- **Config dir** - `get_config_dir()` → `~/.config/bibliogon`
  (the `secrets.yaml` override and the encrypted plugin credentials).

Concrete Linux paths (home = `~`):

| What | Path |
|---|---|
| SQLite database | `~/.local/share/bibliogon/bibliogon.db` |
| Uploads / assets | `~/.local/share/bibliogon/uploads/` |
| AI key via Settings UI | `~/.local/share/bibliogon/config/app.yaml` (`ai.api_key`) |
| AI key via override file | `~/.config/bibliogon/secrets.yaml` (`ai.api_key`) |
| AI key via env-var | `BIBLIOGON_AI_API_KEY` (nothing written to disk) |
| ElevenLabs key (encrypted) | `~/.config/bibliogon/plugins/audiobook/elevenlabs-key.enc` |
| Google Cloud TTS creds (encrypted) | `~/.config/bibliogon/plugins/audiobook/google-credentials.enc` |
| Credential-store secret (auto-gen) | `~/.config/bibliogon/credentials.secret` |
| DeepL key | `~/.local/share/bibliogon/config/plugins/translation.yaml` |
| LanguageTool key | `~/.local/share/bibliogon/config/plugins/grammar.yaml` |

macOS uses the same `~/.local/share` and `~/.config` layout (set
`XDG_*` to relocate); Windows resolves to `%LOCALAPPDATA%\bibliogon\`
(data) and `%APPDATA%\bibliogon\` (config). Docker pins everything
under `/app/data/` via `BIBLIOGON_DATA_DIR` (see Docker section).

**Quickest no-disk option:** `export BIBLIOGON_AI_API_KEY=sk-...`
before `make dev`. The key never touches the filesystem and wins over
every file layer.

None of these paths are inside the project tree, so deleting or
re-cloning the repo leaves your keys and data untouched (and `git
clean` never reaches them).

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

Plugin secrets are handled per plugin, separately from the
`ai.api_key` chain above:

- **Audiobook - ElevenLabs / Google Cloud TTS.** Stored **encrypted**
  (Fernet) under the config dir, NOT in plugin YAML:
  `~/.config/bibliogon/plugins/audiobook/elevenlabs-key.enc` and
  `google-credentials.enc`. The encryption secret resolves from
  `BIBLIOGON_CREDENTIALS_SECRET` → `BIBLIOGON_SECRET_KEY` → an
  auto-generated `~/.config/bibliogon/credentials.secret`. Managed via
  the `/api/audiobook/config/*` endpoints (Settings UI). See
  `backend/app/credential_store.py` and
  `backend/app/services/audiobook_credentials.py`. A legacy plain-text
  `elevenlabs.api_key` in `audiobook.yaml` is still read as a fallback.
- **Translation (DeepL) / Grammar (LanguageTool).** Plain-text in the
  per-plugin **user overlay** under the data dir, written by each
  plugin's Settings panel: `~/.local/share/bibliogon/config/plugins/translation.yaml`
  (`deepl_api_key`) and `.../grammar.yaml` (`languagetool_api_key`,
  `languagetool_username`). The committed `backend/config/plugins/*.yaml`
  ship these empty.

---

## Docker / CI usage

```yaml
# docker-compose.prod.yml (example excerpt)
services:
  backend:
    image: bibliogon:0.36.0
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
