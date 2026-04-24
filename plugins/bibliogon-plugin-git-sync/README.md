# bibliogon-plugin-git-sync

Import plugin for Bibliogon. Clones a public `write-book-template`
git repository via HTTPS and imports it as a Bibliogon book.

Phase 1 (PGS-01) scope: **import-only MVP**. Public HTTPS repos
only. No authentication. No sync-back (that's PGS-02). No smart
merge (PGS-03). No multi-language branch linking (PGS-04).

## How it works

1. User pastes a git URL into the import wizard.
2. Plugin's `GitImportHandler` clones the repo into the
   orchestrator's staging directory under a fresh `temp_ref`.
3. Plugin delegates preview + execute to the core
   `WbtImportHandler`, which already handles the
   write-book-template format.

The plugin is a **source adapter**, not a format parser. WBT
parsing logic lives in `backend/app/import_plugins/handlers/wbt.py`
and is reused via delegation.

## First plugin-to-plugin dependency

This is the first Bibliogon plugin that depends on another
plugin (`bibliogon-plugin-export`). Current Phase 1 does not
exercise the dependency at runtime; it is declared so PGS-02
(export-to-repo) can use the existing TipTap-to-Markdown
converter in `bibliogon_export.tiptap_to_md` without a circular
rewrite.

## Registration

Standard pluginforge pattern. Entry point in `pyproject.toml`:

```
[tool.poetry.plugins."bibliogon.plugins"]
git-sync = "bibliogon_git_sync.plugin:GitSyncPlugin"
```

The plugin's `activate()` method registers a
`GitImportHandler` with the core
`app.import_plugins.registry` so the orchestrator can
dispatch URL inputs.

## Protocol

`GitImportHandler` does **not** implement the
`ImportPlugin` protocol directly — that protocol's
`can_handle(path)` / `detect(path)` signatures assume a
filesystem path. URL dispatch is handled through a separate
endpoint `POST /api/import/detect/git` that calls the handler
explicitly. After clone, the handler returns a `temp_ref` that
the existing `POST /api/import/execute` path resolves back to
the staged directory, where `WbtImportHandler` runs the
detected-format pipeline.

See `docs/explorations/core-import-orchestrator.md` Section 9
for the architectural rationale.

## Out of scope for Phase 1

- Authentication (HTTPS basic, SSH keys, GitHub tokens) → PGS-02
- Branch selection UI → PGS-04
- Shallow clone optimization for large repos
- LFS handling
- Sync-back (commit Bibliogon edits to the repo) → PGS-02
- Smart merge on re-import → PGS-03

## Tests

```bash
cd plugins/bibliogon-plugin-git-sync
poetry run pytest
```

Network access is mocked; tests never hit real git remotes.
