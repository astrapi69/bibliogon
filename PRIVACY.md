# What leaves the device, and what stays on it

Technical inventory of every outgoing network call Bibliogon can make and
of everything it stores on the device. Written from the code (file
references per entry), for the privacy statement, for reviewers, and for
users who want to know before they type a manuscript into the app.
Issue #875. Verified against `develop` at the commit in the footer; the
guards in #874 keep the "automatic" part honest.

Two deployments, different rules:

| Deployment | Backend | Who runs it |
|---|---|---|
| **Web app on GitHub Pages** (`astrapi69.github.io/bibliogon/`) | none; everything runs in the browser against IndexedDB | the operator publishes the files, GitHub serves them |
| **Desktop / Docker** (launcher, `docker compose`, `make dev`) | FastAPI backend on the user's own machine | the user, on their own hardware |

Backend calls (sections 3 and 5) exist only in the desktop/Docker
deployment. On GitHub Pages there is no backend, so none of them can
happen there.

## 1. Summary

- **No telemetry, no analytics, no tracking, no cookies.** Nothing in the
  code reports usage anywhere. Licensing is validated offline
  (`backend/app/licensing.py`). Fonts, icons and scripts are shipped with
  the app; the page loads nothing from a CDN (guard: #874).
- **On GitHub Pages, no call to a third party happens without a user
  action - except images of previously imported Medium articles (2.7).**
  The GitHub Releases check (section 2) is off by default on the web app
  (#881) and can be switched on in Settings > Verhalten. The runtime
  capture in `e2e/static-smoke/external-hosts.spec.ts` measures this on
  every static-smoke run for a fresh profile (no imported articles). Everything else leaves the
  device only when the user starts an action that needs it: an AI
  request, a translation, an import from a URL, a Git push.
- **Manuscript text leaves the device only through features the user
  invokes with a service they configured**: an AI provider with their
  own key, DeepL with their own key, a LanguageTool server (the public
  one by default), a TTS engine, a Git remote. Each is listed below with
  what is sent and how to turn it off.
- **All user data lives on the device**: in the browser's IndexedDB
  (web app) or in the app's data directory (desktop). The operator of
  the web app never sees it. Two secrets are stored in plain text on the
  device (AI provider keys, an optional GitHub token) and can be removed
  in Settings.

## 2. Automatic calls: no user action needed

| # | Call | Deployment | When | What is sent | Off switch | Source |
|---|---|---|---|---|---|---|
| 2.1 | `GET https://api.github.com/repos/astrapi69/bibliogon/releases/latest` | **desktop** by default; web app **only after the user switches it on** (#881) | on app start, at most once per interval (default daily) | nothing beyond the request itself (IP, user agent); no token, no app data | desktop: Settings > Verhalten, automatic update check off or interval "never" (`updates.auto_check`); web app: off unless switched on there (`updates.web_auto_check`) | `frontend/src/hooks/ui/useUpdateAutoCheck.ts`, `frontend/src/lib/utils/updateChecker.ts` (`isAutoCheckEnabled`) |
| 2.2 | Service-worker update check (`registration.update()`) | web app | on focus, on tab visibility, hourly | nothing; it re-fetches the app's own `sw.js` from the page's own origin | none (same origin, no third party) | `frontend/src/shared/utils/swUpdateManager.ts` |
| 2.3 | Edge TTS voice list (`edge_tts.list_voices()`, Microsoft) | desktop | first backend start after install or after a data reset, when the voice table is empty | nothing beyond the request | none in the UI; does not run when `edge-tts` is not installed or the table is already filled; failure is logged and ignored | `backend/app/main.py` (lifespan), `backend/app/voice_store.py` |
| 2.4 | AI provider health probe (`GET {base_url}/models`, Anthropic: `/messages` with a one-token "hi") | desktop | when the book editor loads (`GET /api/editor/plugin-status`), cached 30 s | the configured API key in the auth header; no text | `ai.enabled: false`; for Anthropic nothing is sent without a key | `backend/app/routes_admin.py`, `backend/app/ai/llm_client.py` |
| 2.5 | LM Studio health probe (`GET {lmstudio_url}/models`) | desktop | `GET /api/translation/health` (translation settings) | nothing | default target is `http://localhost:1234`; disable the translation plugin | `plugins/bibliogon-plugin-translation/.../lmstudio_client.py`, `routes.py` |
| 2.6 | LAN-mode address lookup (`socket.connect(("8.8.8.8", 80))`, UDP) | desktop, LAN mode only | at startup with `BIBLIOGON_LAN_MODE` | no packet is sent; the OS route lookup picks the LAN IP | do not enable LAN mode | `backend/app/lan_net.py` |
| 2.7 | Images of imported Medium articles (`cdn-images-1.medium.com`) | web app and desktop | whenever the article list or an imported article is shown and no local copy of the image exists | the image request (IP, user agent, referer) | only for users who imported Medium articles; the desktop importer downloads images locally by default (`download_images: true`), the browser importer caches the featured image; delete the article to stop it | `frontend/src/hooks/article/useArticleImageUrl.ts`, `frontend/src/medium-import/walker.ts` |

Nothing else runs on a timer or at startup. There is no scheduler in the
backend and no background loop in the frontend beyond 2.2.

## 3. Calls on an explicit user action

Each row starts only when the user clicks the corresponding function.
"Manuscript" means chapter, page or article text.

### 3.1 AI providers

| Deployment | Path | Providers | What is sent | Off switch | Source |
|---|---|---|---|---|---|
| web app | browser-direct, the user's own key | Anthropic (`api.anthropic.com`), OpenAI (`api.openai.com`), Google Gemini (`generativelanguage.googleapis.com`), Mistral (`api.mistral.ai`), LM Studio (`localhost:1234`), Ollama (`localhost:11434`), or a custom base URL | the prompt: manuscript text of the chapter/article the user is working on, book metadata (title, description, genre), plus the key in a header | no key configured = every AI feature is disabled; remove the key in Settings > KI-Assistent | `frontend/src/ai/llmClient.ts`, `frontend/src/features/useHasAiKey.ts` |
| desktop | backend `LLMClient` | same providers | same, plus A+ Content: title, subtitle, author, description, categories, keywords | `ai.enabled: false` in Settings > App > AI; every call site checks it | `backend/app/ai/llm_client.py`, `backend/app/ai/config.py`, `plugins/bibliogon-plugin-aplus/.../routes.py` |

Triggers: "Generate" and "Fill with AI" in the editors, chapter review,
text tools, metadata fill, bulk AI fill, SEO fields, A+ Content, the
connection test in Settings. Opening Settings > KI-Assistent with a key
configured also lists the provider's models (`GET {base_url}/models`,
cached 1 h in the session).

### 3.2 Translation and grammar (desktop only)

| Service | Host | Trigger | What is sent | Off switch | Source |
|---|---|---|---|---|---|
| DeepL | `api-free.deepl.com` or `api.deepl.com` | Translate chapter / book / article | full chapter or article text, chapter by chapter, plus the DeepL key | no `deepl_api_key` = no call; or `provider: lmstudio`; or disable the plugin | `plugins/bibliogon-plugin-translation/.../deepl_client.py` |
| LM Studio | user-configured `lmstudio_url` (default localhost) | Translate with `provider: lmstudio` | chapter text | local by default | `.../lmstudio_client.py` |
| LanguageTool | `api.languagetoolplus.com` **by default**, or a self-hosted `languagetool_url` | "Grammatik prüfen" in the editor | the text being checked, in chunks of about 900 characters, anonymously unless premium credentials are set | point `languagetool_url` at a self-hosted instance, or disable the grammar plugin | `plugins/bibliogon-plugin-grammar/.../languagetool.py`, `backend/config/plugins/grammar.yaml` |

The web app's grammar check and translation run browser-direct against
the configured AI provider (section 3.1), not against LanguageTool or
DeepL.

### 3.3 Text-to-speech (desktop only, audiobook plugin)

| Engine | Host | What is sent | Off switch | Source |
|---|---|---|---|---|
| Edge TTS (default) | Microsoft (`speech.platform.bing.com`) | the chapter text (preview: first 2000 characters) plus voice and rate; no key needed | choose `pyttsx3` (offline) or disable the plugin | `plugins/bibliogon-plugin-audiobook/.../tts_engine.py` |
| Google Translate TTS (`gtts`) | `translate.google.com` | chapter text, language | choose another engine | same |
| ElevenLabs | `api.elevenlabs.io` | chapter text plus the key; saving a key in Settings verifies it once against `/v1/user` | no key = no call | same; `backend/app/services/audiobook/credentials.py` |
| Google Cloud TTS | `texttospeech.googleapis.com` | chapter text plus the service-account credentials; uploading the credentials lists voices once | no credentials = no call | same; `backend/app/services/audiobook/google_tts_setup.py` |
| pyttsx3 | none (local OS voices) | nothing leaves the device | | |

Triggers: "Generate audiobook", "Preview", the dry run, and the voice
list in the book's audiobook settings.

### 3.4 Git (desktop only)

The remote is always one the user configured (GitHub, GitLab, Codeberg,
self-hosted). Credentials are a stored token or the user's SSH key.

| Operation | Trigger | What is sent | Source |
|---|---|---|---|
| Push | "Push" in Git backup, "Commit to repo" in Git sync | the whole book as Markdown + metadata + commits | `backend/app/services/git/backup.py`, `sync_commit.py` |
| Fetch | "Pull", and opening the Git-sync diff view | credentials only | `backup.py`, `sync_diff.py` |
| Clone | Import wizard with a repository URL; multi-branch translation import | the clone request | `plugins/bibliogon-plugin-git-sync/.../git_handler.py`, `backend/app/services/translation_import.py` |

Opening a book's Git panel in the web app asks GitHub for the remote's
default branch (`GET api.github.com/repos/{owner}/{repo}`, no token,
cached per session; `frontend/src/hooks/useRemoteDefaultBranch.ts`).

### 3.5 Imports

| Import | Deployment | Host | What is sent | Source |
|---|---|---|---|---|
| GitHub import | web app | `api.github.com`, `raw.githubusercontent.com`; optional personal access token | the repository path; the token if one is stored | `frontend/src/import/githubImport.ts` |
| URL import | web app | the URL the user typed | the request | `frontend/src/import/urlImport.ts` |
| Medium archive | web app | `cdn-images-1.medium.com` for each article's featured image (stored locally afterwards) | image requests | `frontend/src/medium-import/clientImport.ts` |
| Medium archive | desktop | the image hosts named inside the uploaded archive (normally Medium's CDN) | image requests, saved locally | `plugins/bibliogon-plugin-medium-import/.../image_downloader.py`; `download_images` in `backend/config/plugins/medium-import.yaml` |
| `.bgb` backup export | web app | the host of any article image that has no local copy | image requests | `frontend/src/export/bgbExport.ts` |

### 3.6 Links

Donation links (Liberapay, Ko-fi, PayPal), GitHub, KDP, books2read, BISG
and the documentation site are plain links that open in a new tab when
clicked. No script, button or pixel of those services is embedded; no
request is made until the click.

## 4. What is stored on the device

### 4.1 Web app (browser storage)

| Where | What | Why | How to delete |
|---|---|---|---|
| IndexedDB `bibliogon-offline` (one table per entity) | the whole workspace: books, chapters, pages, articles, comments, story bible, comic panels, writing sessions, templates, seeded registries and i18n catalogs, app settings | it is the database; without it the app has no data | Settings > Danger Zone > reset (type `RESET`); or clear the site's data in the browser |
| IndexedDB `bibliogon-offline`, `appSettings` | **AI provider keys in plain text**, one per provider, plus model and base-URL overrides | the browser sends the key directly to the provider the user chose | Settings > KI-Assistent: remove the key; the reset names the key explicitly |
| IndexedDB `bibliogon-offline`, `assets` / `articleAssets` | image bytes for covers, figures and article images | offline display without a server | Settings > Daten > clear image cache (with a preview of what is there); reset |
| IndexedDB `bibliogon-offline`, `eventLog` | the last 100 UI events (clicks, navigation, errors); never keystrokes or text; sensitive fields redacted | attached to a bug report only if the user opens one and opts in | Settings > Daten > clear event log; reset |
| IndexedDB `bibliogon`, `drafts` | unsaved chapter content with a hash, purged after a successful save and after 30 days | crash recovery | reset (deletes the database); or the browser |
| `localStorage` | storage-mode pin, theme, onboarding progress, donation-reminder dates, editor display preferences, view modes, daily word goal, job resume state, playback preferences, **an optional GitHub token in plain text** (`bibliogon.github_token`) | preferences and resume state | GitHub tab: clear the token field; reset clears all keys; or the browser |
| `sessionStorage` | provider model lists (1 h), remote default branch per repo, a one-shot chunk-reload flag; never the key itself | avoid repeated requests within a session | closes with the tab; reset |
| Service-worker cache | the app's own files (JS, CSS, HTML, fonts, icons) | offline start | browser: clear site data / unregister the service worker |
| Cookies | **none** | | |

`.bgb` backups the user exports are files on their own disk.

### 4.2 Desktop / Docker

All data is in the app's data directory on the user's machine
(`~/.local/share/bibliogon` or the Docker volume): the SQLite database,
uploads, generated audiobooks, Git clones. API keys for AI, DeepL,
ElevenLabs and the LanguageTool premium account live in that
directory's config (`config/app.yaml`, plugin YAML) or in environment
variables; see `docs/configuration.md`. Nothing is sent to the
operator of the project.

## 5. What does not phone home

Checked and found empty: the KDP plugin (local files only), the learnset
plugin (schema vendored, no runtime fetch), plugin installation from
ZIP (no `pip install`, no registry), export via pandoc, Scrivener and
Office import, ffmpeg (local subprocesses), the comics, export,
get-started, help, kinderbuch, ms-tools, promotion and story-bible
plugins. `scripts/` contains CI and maintainer tools (npm registry,
GitHub API) that never run on a user's machine.

## 6. Relation to #710

#710 is about the opposite direction: the Docker deployment publishes
its port on every network interface without authentication, so anyone on
the same network can reach the backend. That is an inbound exposure of
the desktop deployment and does not change anything in this document;
it is tracked separately.

## 7. Open decisions

- **2.7.** Imported Medium articles keep their CDN image URLs. Whether
  the importer should always store a local copy (and drop the remote
  URL) is a product question; today the browser importer caches the
  featured image and the desktop importer downloads images by default.

Verified against `develop` at commit 453e4bf1 (2026-09-16); 2.1 updated for #881.
