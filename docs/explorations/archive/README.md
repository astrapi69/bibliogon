# Explorations archive

Exploration documents that are no longer live:
- **Shipped:** the feature has been implemented; the doc is kept for historical context. Actual behaviour lives in code, CHANGELOG, and ADRs where applicable.
- **Scaffolding:** prompt files that drove the creation of an exploration doc. The target doc exists; the prompt is retained as history.
- **Obsolete:** ideas that were dropped or replaced.

Archived items do NOT appear in the main tracking table in [../README.md](../README.md).

## Current contents

| Doc | Reason | Shipped in |
|---|---|---|
| [donations-ux.md](donations-ux.md) | Implemented (S-01/02/03) | v0.19.0 |
| [donations-roadmap-integration.md](donations-roadmap-integration.md) | Roadmap entries merged; items completed | v0.19.0 |
| [prompt-children-book-plugin-exploration.md](prompt-children-book-plugin-exploration.md) | Scaffolding prompt for [../children-book-plugin.md](../children-book-plugin.md) | N/A (doc-gen) |
| [ai-review-extension.md](ai-review-extension.md) | AI Review Extension shipped (async flow, persistent Markdown reports, chapter-type-aware prompts) | v0.20.0 |
| [git-based-backup.md](git-based-backup.md) | Git-based backup shipped, full 5-phase plan (local git, remote push/pull with encrypted PATs, SSH key gen, 3-way merge, Markdown side-files) | v0.21.0 |
| [core-import-orchestrator.md](core-import-orchestrator.md) | Core import wizard + plugin format-handler protocol shipped; all 5 phases (CIO-01..05): core detect/execute + handlers, plugin-git-sync adoption, folder drag-drop, office (.docx/.epub), legacy-route cleanup | shipped (CIO-01..05) |
| [plugin-git-sync.md](plugin-git-sync.md) | Git-backed import + sync plugin shipped; all 5 phases (PGS-01..05): import MVP, export-to-repo, three-way merge, multi-language linking, unified-commit bridge | shipped (PGS-01..05) |
| [tiptap-3-migration.md](tiptap-3-migration.md) | Obsolete — TipTap 2→3 (DEP-02) shipped via the `prosemirror-search` adapter (not the upstream search-and-replace publish the doc waited on); `@tiptap/core` is now 3.26.0 | v0.49.0 |
