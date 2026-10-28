# Architecture rules (summary)

Binding rules only. Full text: `docs/development/rules/architecture.md` - read it
before plugin, storage, theming or offline work. This summary must not
contradict it (#1143).

## Layered architecture (4 layers, ALWAYS respected)
Frontend (React/TS/TipTap/Vite) -> Backend (FastAPI/SQLAlchemy/SQLite/Pydantic v2) -> PluginForge (external, pluggy) -> Plugins (entry points). New features belong in a plugin unless they touch the core (CRUD, editor base, backup, UI shell).

## Two repositories
PluginForge is a separate repo and release cycle; never change it from here.

## Backend (Python/FastAPI)
Plugin = `plugin.py` (BasePlugin) + `routes.py` (thin) + logic modules + tests, one router per plugin. Hookspecs in `backend/app/hookspecs.py`. Config in YAML, not code. `backend/config/plugins/<name>.yaml` is the single source for plugin metadata and settings; `plugin.yaml` is a build artifact, never committed. ZIP installs: name and path-traversal checks. Licensing exists but is dormant.

## Frontend (React/TypeScript)
Radix primitives, Tailwind v4 mapped onto the CSS tokens + shadcn/ui for new primitives; no MUI/Ant. Six palettes x light/dark; colours only via tokens (`make verify-theme`). Plugins ship no UI: plugin surfaces are core components gated on plugin activation. API calls only through the API client. Stepped modals for creation, Radix Collapsible for optional fields. Global state, if ever: Zustand.

## Internal storage format
TipTap JSON in the DB. Markdown and HTML are conversions (export plugin).

## Repository pattern (Service <-> Data boundary)
Routers and services reach the DB only through repository interfaces (`backend/app/repositories/`); no `db.query`/`session.add` outside repository implementations; repositories hold no HTTP concepts and no business rules. `authors` is the reference.

## Persistence
SQLite via repositories, assets on the filesystem, `.bgb` backup, `.bgp` project import.

## Data flow
UI -> API client -> router -> service -> repository -> SQLite. One direction.

## Error handling
Services raise `BibliogonError` subclasses, routers catch nothing, the global handler maps to HTTP status. Plugins raise `PluginError`, external tools `ExternalServiceError`.

## Plugin package versions
Package version (`plugins/*/pyproject.toml`): lock-step, set by `make sync-versions`, never hand-edited. The `version` class attribute in `plugin.py`: independent, raised only when the plugin itself changes for its consumers.

## Plugin settings visibility
Every plugin setting is editable in the UI or marked `# INTERNAL`. No hidden or dead settings. Per-book values are Book columns, not plugin YAML.

## Offline/local-first
Every feature works in Dexie/offline mode through the storage seam in the same commit, or is gated through the feature registry (`useFeature`) - only Pandoc/LaTeX export, Git sync, TTS, LAN mode and the listed desktop-only features. Gated features are disabled with a translated reason, never hidden; offline builds fire zero `/api` requests (`e2e/smoke/offline-pwa.spec.ts`).
