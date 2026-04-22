# plugin-git-sync: Bi-directional Git Sync for Bibliogon Books

Status: Exploration complete. Plugin pending implementation.
Last updated: 2026-04-22
License: MIT (part of the open-source plugin set, alongside plugin-export).
Repository: github.com/astrapi69/bibliogon-plugin-git-sync (to be created).
Revived when: Core git integration ([git-based-backup.md](git-based-backup.md)) Phase 1 has shipped AND PluginForge is confirmed to support the required hooks (see Section 5).

---

## 1. Motivation and use cases

### 1.1 Primary use case

The user maintains existing git-based book projects in the [write-book-template](https://github.com/astrapi69/write-book-template) format. Those repos carry:

- Version history across years of writing
- Multi-language structure (one branch per language, e.g. `main` for DE, `en` for EN, `es` for ES)
- Asset references (covers, figures)
- Per-book metadata (ISBN, publisher, description)

Importing those books into Bibliogon today means copy-paste per chapter, manual asset wiring and a dead-end: edits made in Bibliogon never flow back to the git repo. plugin-git-sync closes that gap.

### 1.2 Secondary use cases

- Migration path from write-book-template to Bibliogon for other authors with a similar toolchain.
- Parallel editing in Bibliogon (WYSIWYG) and in a terminal editor (raw Markdown) on the same book. Both sides sync through git.
- External collaborators (editors, translators, proofreaders) edit the repo directly via pull request; their changes flow back into Bibliogon on re-import.

### 1.3 Not a use case

plugin-git-sync is explicitly NOT a replacement for core git integration (see [git-based-backup.md](git-based-backup.md)). Core git integration targets the 80% case ("I want version control for the book I am writing in Bibliogon"). plugin-git-sync targets the 20% case ("I have an existing git repo that should become a Bibliogon book and stay synced with it").

The two features are orthogonal and can coexist on the same book (see Section 6, Phase 5).

---

## 2. Relation to existing architecture

### 2.1 plugin-export as the foundation

`plugin-export` already owns:

- [bibliogon_export/tiptap_to_md.py](../../plugins/bibliogon-plugin-export/bibliogon_export/tiptap_to_md.py): TipTap JSON to Markdown.
- [bibliogon_export/html_to_markdown.py](../../plugins/bibliogon-plugin-export/bibliogon_export/html_to_markdown.py): HTML to Markdown (used during import).
- Pandoc pipeline for document formats.
- Asset handling during export (scaffolder).

plugin-git-sync REUSES these. The dependency is declared explicitly in `pyproject.toml`:

```toml
[tool.poetry.dependencies]
bibliogon-plugin-export = "^1.0.0"
```

This is the first plugin-to-plugin dependency in Bibliogon. Section 5 treats it as an architectural stress-test.

### 2.2 Core git integration (separate feature)

[git-based-backup.md](git-based-backup.md) defines Phase 1 (local git per book) through Phase 5 (Markdown side-files), and as of v0.21.0 all five core phases have shipped. plugin-git-sync layers a different ownership model on top:

| Aspect | Core git | plugin-git-sync |
|--------|----------|-----------------|
| Who owns the repo? | Bibliogon (lives under `uploads/{id}/.git`) | External remote (GitHub, self-hosted, local clone) |
| Source of truth | Bibliogon DB | External repo (at least on initial import) |
| Audience | Every Bibliogon user | Users with pre-existing repo-based workflows |
| Conflict model | Bibliogon-internal 3-way merge | Covered in Section 6, Phase 3 |

A book may be:

- Core-git-managed (standard, shipped in v0.21.0)
- plugin-git-sync managed (imported from external repo)
- Both (advanced, Phase 5)
- Neither (default for users who do not want version control)

### 2.3 Existing backup stack

- `.bgb` export/import: unchanged, stays as the distribution format.
- `BackupHistory`: unchanged audit log.
- `backup_compare`: unaffected.

plugin-git-sync does not obsolete any existing backup mechanism. It adds a new import and sync path.

---

## 3. Design choices made before this exploration

The user has pre-committed to the following. They are not revisited here.

1. **Feature is a plugin, not a core addition.** Rationale: forces the plugin architecture to handle a plugin-to-plugin dependency; keeps the core lean; the use case is a 20% case.
2. **Bi-directional sync, not one-way.** Users must be able to round-trip: repo -> Bibliogon -> repo.
3. **Overwrite semantics for MVP (variant 2c).** Phase 2 ships plain overwrite from Bibliogon to repo. Smart-merge is a later phase.
4. **Multi-language via branches.** Each language is a separate branch in the same repo; each branch becomes a separate Bibliogon book linked by a translation group.
5. **Conversion layer lives in plugin-export.** Both directions (TipTap -> Markdown and Markdown -> TipTap) belong together.

---

## 4. Canonical repo structure specification

This is the most precise section of the exploration. Ambiguity here produces bugs in every phase.

The repo structure is a **Bibliogon convention**, not a plugin-git-sync-only convention. Any future plugin or tool that reads or writes this structure follows the same spec. Documenting it in `docs/specifications/` is a Phase 1 deliverable.

### 4.1 Directory layout

```
repo_root/
├── .bibliogon/
│   ├── version.yaml           # Spec version, compatibility floor
│   ├── branches.yaml          # Language branch mapping (optional)
│   └── book.yaml              # Book-level metadata
├── manuscript/
│   ├── chapters/
│   │   ├── 01-{slug}.json     # TipTap JSON per chapter
│   │   ├── 02-{slug}.json
│   │   └── ...
│   ├── front-matter/
│   │   ├── toc.json
│   │   ├── preface.json
│   │   ├── foreword.json
│   │   └── ...
│   └── back-matter/
│       ├── about_author.json
│       ├── acknowledgments.json
│       ├── epilogue.json
│       ├── glossary.json
│       └── bibliography.json
├── assets/
│   ├── covers/
│   ├── figures/               # In-text images
│   ├── images/                # Other images
│   └── fonts/                 # Custom fonts if any
├── config/
│   ├── plugin-kdp.yaml        # Plugin-specific config (only if used)
│   ├── plugin-kinderbuch.yaml
│   └── export-settings.yaml
└── .gitignore                 # output/, temp/, local artifacts
```

### 4.2 File format specifications

#### Chapter JSON (`manuscript/{section}/{nn-slug}.json`)

```json
{
  "version": "tiptap-2",
  "chapter_type": "chapter",
  "title": "Chapter Title",
  "position": 1,
  "content": { "type": "doc", "content": [] },
  "metadata": {
    "ai_assisted": false,
    "word_count_at_commit": 1234
  }
}
```

- `version`: `tiptap-2` today. Bumped if TipTap v3 migration ([tiptap-3-migration.md](tiptap-3-migration.md)) changes the on-disk shape.
- `chapter_type`: one of the 31 values from `ChapterType` enum (see [models/\_\_init\_\_.py](../../backend/app/models/__init__.py)). Values are snake_case.
- `position`: 1-based integer, globally unique within the book (not per-section).
- `content`: TipTap document JSON. Same shape as `Chapter.content` in the database.
- `metadata`: optional bag for plugin-specific hints that should round-trip.

#### `book.yaml` (all Book-model fields that are not chapter content)

```yaml
title: "Book Title"
subtitle: "Optional"
author: "Author Name"
about_author: "..."
language: "de"                 # ISO 639-1
series: "Optional Series"
series_index: 1
isbn_ebook: "978-..."
isbn_paperback: "978-..."
isbn_hardcover: null
asin_ebook: null
publisher: "..."
publication_date: "2026-04-22"
cover_image: "assets/covers/cover.png"
description: "..."
keywords: ["tag1", "tag2"]
html_description: "<p>...</p>"
backpage: "..."
custom_css: null
plugin_flags:
  kdp_enabled: true
  audiobook_enabled: false
  kinderbuch_enabled: false
```

`plugin_flags` is a free-form object. Plugins declare their own keys; the core ignores unknown ones on import.

#### `version.yaml`

```yaml
spec_version: 1
bibliogon_min_version: "0.21.0"
```

`spec_version` is bumped only on a breaking change in the repo layout. `bibliogon_min_version` lets the plugin refuse to import a repo that uses features unknown to the running Bibliogon.

#### `branches.yaml` (optional, only for multi-language repos)

```yaml
languages:
  - branch: main
    code: de
    is_primary: true
  - branch: en
    code: en
    is_primary: false
  - branch: es
    code: es
    is_primary: false
```

If absent: the repo is single-language; the current branch is imported as one book.

### 4.3 Asset reference conventions

Assets in the repo are referenced by **repo-relative path** in chapter JSON:

```json
{
  "type": "image",
  "attrs": { "src": "assets/images/chapter1-diagram.png" }
}
```

- On import: plugin resolves the relative path against the repo root, copies the file into the Bibliogon asset store, rewrites `src` to `/api/books/{id}/assets/file/{filename}`.
- On export: plugin walks all TipTap image nodes, maps Bibliogon asset IDs back to the original repo-relative paths via a maintained mapping table.

The plugin stores the mapping as plugin-local state (SQLite table `plugin_git_sync_asset_map` or a file in the plugin workspace). This lets round-trips preserve original filenames and paths.

### 4.4 What is NOT in the repo

- `chapter_versions` rows (the per-chapter undo history is internal)
- Style-check results (computed from content, not source)
- `BackupHistory` rows
- User-specific settings (AI provider keys, theme choice)
- Generated output (EPUB, PDF, MP3)
- Cache files

These stay in the Bibliogon database or local filesystem. Committing them would either bloat the repo or leak secrets.

### 4.5 Naming conventions to enforce on import and export

- `about_author` NOT `about_the_author` (Bibliogon convention, see user memory).
- Snake_case for file names and YAML keys.
- ISO 639-1 codes in `branches.yaml` (`de`, `en`, `es`). No `de-DE`, no `german`.
- Numeric prefix on chapter filenames (`01-`, `02-`, ...) for deterministic ordering when git lists the directory.
- Slugs are lowercase ASCII with hyphens; diacritics stripped.

On import: the plugin tolerates reasonable deviations and warns. On export: the plugin enforces the spec strictly so the repo stays portable.

---

## 5. Plugin architecture as a stress-test

plugin-git-sync is the first plugin in the catalog that depends on another plugin AND writes to core state. Both dimensions test PluginForge in ways existing plugins have not.

### 5.1 Plugin-to-plugin dependency (read direction)

Does PluginForge (built on pluggy) support:

1. Declaring one plugin's Python package as a dependency of another in `pyproject.toml`?
2. Importing a module from the dependency at runtime?
3. Resolving plugin discovery order so the dependency loads first?

Expected answers: (1) yes, Poetry handles it. (2) yes, Python packaging handles it. (3) yes IF plugin load order respects the `depends_on` class attribute (which is how existing plugins like `audiobook` and `kinderbuch` already declare `depends_on = ["export"]`).

Action item for Phase 1 implementation:

- Add a smoke test that `from bibliogon_export.tiptap_to_md import tiptap_to_markdown` works inside plugin-git-sync at runtime.
- Verify plugin load order: log which plugin's `on_plugin_activate` fires first when both are enabled. If plugin-git-sync activates before plugin-export, that is a PluginForge bug to file upstream.

### 5.2 Plugin-to-core write access

Existing plugins are primarily read-heavy:

- `plugin-export`: reads books and chapters, writes to disk only.
- `plugin-grammar`, `plugin-ms-tools`: read-only analysis.
- `plugin-audiobook`: reads chapters, writes MP3s to `uploads/`.
- `plugin-kdp`, `plugin-kinderbuch`: read books and per-book config.
- `plugin-translation`: reads chapters, produces translated chapters (also a writer, but small surface).

plugin-git-sync must WRITE to core entities at a much larger scale:

- Create `Book` records (one per imported branch)
- Create `Chapter` records (one per chapter JSON)
- Create `Asset` records (one per file under `assets/`)
- Update book metadata (all `book.yaml` fields)

Two options for how the plugin writes:

| Option | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| A | Core HTTP API (`POST /api/books`, etc.) | Clean boundary, same rules as frontend, authorization enforced | Extra round-trip, authentication token needed, slower |
| B | Direct SQLAlchemy session via a core helper | Fast, no HTTP overhead | Tighter coupling, plugin becomes privileged |

**Recommendation:** option A for create operations, option B for read operations. Rationale:

- Create operations are rare (import events) and must respect the same validation as the frontend. If the core adds a constraint (e.g. title length), the plugin should not need to know; the API tells it.
- Read operations are frequent (every export/sync-back walks the book). HTTP overhead is not justified; SQLAlchemy read access via `Session` is safe.

This matches Bibliogon's frontend boundary contract and avoids plugins growing into privileged actors.

### 5.3 Plugin lifecycle hooks required

plugin-git-sync needs:

| Hook | Purpose | Exists in PluginForge? |
|------|---------|------------------------|
| `on_plugin_activate` | Register UI entries (import button, settings page) | Yes (standard) |
| `get_frontend_manifest` | Declare UI slots (editor panel, settings section) | Yes (standard) |
| `on_book_open` | Check if book is git-synced, surface status | Unclear, needs verification |
| `on_book_save` | Optional auto-export to repo | Unclear, needs verification |
| `on_chapter_save` | Same, at chapter granularity | Unclear, needs verification |
| `on_plugin_deactivate` | Clean up workspace, preserve git repos | Yes (standard) |

The unclear hooks (`on_book_open`, `on_book_save`, `on_chapter_save`) need a capability check before Phase 2. If PluginForge does not emit these events today, Phase 2 either:

a) Adds them upstream (small PR to pluginforge).
b) Falls back to user-triggered sync only (explicit "Commit to Repo" button; no auto-sync).

Option (b) is acceptable for Phase 2. Auto-sync is a Phase 3+ polish.

### 5.4 Risk: PluginForge says no

If the PluginForge capability check during Phase 1 implementation reveals that plugin-to-plugin imports do not work reliably, the options are:

1. Vendor `tiptap_to_md.py` into plugin-git-sync. Bad: duplication drifts.
2. Extract the conversion layer into a separate PyPI package (`bibliogon-tiptap-convert`) that both plugins depend on. Clean but heavy.
3. Promote the conversion layer into `manuscripta` upstream. Natural home, but slow release cycle.

The exploration does not pick yet. The smoke test in Phase 1 decides.

---

## 6. Feature phases

Each phase ships independently with user-visible value. No phase is mandatory; the plugin is useful even at Phase 1 alone.

### 6.1 Phase 1: Import-only MVP

**Scope:**

- Plugin scaffold: `github.com/astrapi69/bibliogon-plugin-git-sync`, standard structure matching `plugin-export`.
- `depends_on = ["export"]` declared.
- UI: "Import from Git" button on the Dashboard.
- Input form: git URL (HTTPS only in Phase 1) or local path.
- Clone repo to plugin workspace (see Section 7.2).
- Parse repo structure per Section 4.
- Create Bibliogon book(s):
  - If `.bibliogon/branches.yaml` exists: one book per language branch, linked by a new `translation_group_id`.
  - If not: single book from the current branch (typically `main`).
- Copy all assets from `assets/` into Bibliogon's asset store.
- Rewrite image paths in chapter JSON from repo-relative to `/api/books/{id}/assets/file/{filename}`.
- Write plugin-local state: mapping from `book_id` to (`repo_url`, `branch`, `last_imported_commit_sha`).
- No sync-back in Phase 1.

**Estimated effort:** 12-18 hours.

**Out of Phase 1:**

- Export back to repo
- Multi-language linking UI (books are created and linked via `translation_group_id` but the UI treatment arrives in Phase 4)
- Conflict handling
- SSH clone (HTTPS + PAT only)

### 6.2 Phase 2: Export back to repo (overwrite MVP)

**Scope:**

- Detect imported books via the plugin-local mapping table.
- "Commit to Repo" button in the book editor.
- Convert current Bibliogon state to repo spec:
  - Each chapter serialized as `manuscript/{section}/{nn-slug}.json`.
  - `book.yaml` regenerated from Book model.
  - Assets copied from Bibliogon asset store back to `assets/` with original paths preserved via the mapping table.
- Commit the change to the local clone with a Bibliogon-authored message: `"Sync from Bibliogon at {timestamp}"`.
- Optional: push to remote (reuses core git PAT handling from [git-based-backup.md](git-based-backup.md) Phase 2).
- **Overwrite semantics (variant 2c):** local repo working tree is overwritten from Bibliogon state. No 3-way comparison. If the user edited the repo directly since the last import, those edits are lost unless the user re-imports first.
- Warning UI before commit: "Uncommitted changes in the repo will be overwritten. Continue?"

**Estimated effort:** 10-15 hours.

**Out of Phase 2:** smart-merge, conflict UI, per-chapter commit granularity.

### 6.3 Phase 3: Smart-merge on re-import

**Scope:**

- Track `last_imported_commit_sha` per book (already written in Phase 1).
- On re-import, compute three-way comparison:
  - **Base:** Bibliogon book state at the last-imported commit (reconstructable from the commit and the Bibliogon-side plugin history).
  - **Local:** current Bibliogon state.
  - **Remote:** current repo HEAD on the relevant branch.
- Per chapter, classify as:
  - Unchanged on both sides: skip.
  - Changed on remote only: apply remote changes.
  - Changed on Bibliogon only: keep Bibliogon, warn.
  - Changed on both sides: conflict. Surface in UI.
- UI for conflict resolution: per-chapter choice between "Keep Bibliogon", "Take from repo", or "Mark conflict" (which writes both versions as visible chapter variants for manual resolution in the editor).

**Estimated effort:** 14-20 hours.

**Out of Phase 3:**

- Inline merge editor (side-by-side diff inside the chapter view)
- Automatic merging of non-overlapping edits within a single chapter

### 6.4 Phase 4: Multi-language linking UI

**Scope:**

- Books imported from different branches of the same repo are shown as linked ("DE", "EN", "ES") in the book list.
- Click on a language badge to switch, preserving current chapter position where possible (by `position` match, fallback to first chapter).
- New `Book.translation_group_id` column (nullable UUID). Auto-populated on Phase 1 import when `branches.yaml` is present.
- Manual linking: Settings UI to add or remove a book from a translation group (for books created independently).
- Unlinking preserves both books; it only breaks the group association.

**Estimated effort:** 8-12 hours.

### 6.5 Phase 5: Core git integration bridge

**Scope:**

- A book managed by plugin-git-sync can optionally also have core git integration enabled (Phase 1 of `git-based-backup.md`).
- Unified UI: one "Commit" button, one status indicator. User does not need to know which layer owns the commit.
- Plugin and core cooperate:
  - If plugin-git-sync is active, commits flow through the plugin (external repo is the canonical target).
  - If only core git is active, commits stay local to `uploads/{id}/.git`.
  - If both are active: commits go to both, the plugin pushes to the external remote and the core commits to the local repo for audit.
- Avoid double-commits: a shared lock on the book during sync operations.

**Estimated effort:** 6-10 hours. Only makes sense after plugin-git-sync Phases 1-2 and core git Phase 1 are stable in production.

**Total across all phases:** 50-75 hours. Not a single session. Each phase ships independently.

---

## 7. Technical choices

### 7.1 Git library

Same as core git integration: **GitPython 3.x** (BSD, mature, stable API). Rationale and tradeoffs already captured in [git-based-backup.md](git-based-backup.md) Section "Technical choices".

Plugin declares its own direct dependency on GitPython in `pyproject.toml`. No version conflict with core expected; GitPython 3.x has been API-stable for years.

### 7.2 Repo workspace location

Plugin maintains a workspace separate from Bibliogon's `uploads/`:

- Linux: `~/.local/share/bibliogon/plugin-git-sync/workspaces/{book_id}/`
- macOS: `~/Library/Application Support/bibliogon/plugin-git-sync/workspaces/{book_id}/`
- Windows: `%APPDATA%\bibliogon\plugin-git-sync\workspaces\{book_id}\`

Resolved via `platformdirs` (already a Bibliogon dependency).

Why separate from `uploads/`:

- Plugin state is plugin-managed, not user data. Deleting user data should not nuke plugin workspaces.
- The plugin can clean up its workspace independently (on uninstall).
- Core git puts `.git` INSIDE the book's upload directory; plugin-git-sync puts the clone alongside as a separate working tree.

### 7.3 Markdown to TipTap JSON conversion

Phase 1 needs the repo -> Bibliogon direction:

- Repo stores chapter content as TipTap JSON directly (see Section 4.2). No Markdown-to-TipTap conversion needed for Bibliogon-authored repos.
- BUT: existing write-book-template repos store Markdown, not TipTap JSON. For those, plugin-git-sync runs a migration on first import: Markdown -> HTML (via Python `markdown` library, already in backend) -> TipTap JSON (via a new `md_to_tiptap.py`).
- After migration, the plugin asks the user: "Convert this repo to the Bibliogon repo spec (TipTap JSON per chapter)?" If yes, the next Phase 2 commit writes the new format. If no, Phase 2 keeps writing Markdown (with fidelity loss warnings).

The symmetric conversion module `md_to_tiptap.py` lives in `plugin-export`, not in `plugin-git-sync`:

- Both directions of conversion belong together (already the case for `tiptap_to_md.py` and `html_to_markdown.py`).
- Other plugins (future) may want to import Markdown too.
- plugin-export becomes `bibliogon_export.conversions.{tiptap_to_md, md_to_tiptap, html_to_markdown}`.

### 7.4 Authentication for remote repos

HTTPS + Personal Access Token (PAT) reuses the mechanism from core git Phase 2 (encrypted PATs stored in Bibliogon DB, same `backend/app/services/git_auth.py`). The plugin asks the core for the PAT via a read-only API.

SSH keys: Phase 1 punts; HTTPS-only. Phase 5 (or earlier, if user demand) adds SSH via the same key management core shipped in Phase 3 of `git-based-backup.md`.

---

## 8. Open design questions

None of these block Phase 1. Each phase resolves what it needs.

- **Git submodules.** If an imported repo uses submodules, Phase 1 ignores them (clones with `--recurse-submodules=no`, treats submodule directories as opaque). Phase 2+ decision needed.
- **Git LFS.** Similar treatment. Phase 1 ignores; large assets stay as plain blobs.
- **Monorepo support.** One repo with multiple books in subdirectories. Phase 1: not supported (the repo is one book). Phase 4+: possible via `.bibliogon/books.yaml` listing subdirectories.
- **Branch protection and force-push.** If a remote rejects a force-push in Phase 2 (protected branch), what UX? Currently: show the git error verbatim. Polish deferred.
- **Orphaned plugin state.** If the plugin is uninstalled but books were imported via it, the books stay; sync breaks silently. Help doc must flag this.
- **Two-way translation sync.** If the user edits the German chapter in Bibliogon, Phase 2 commits it back to `main` (DE branch). The English branch is NOT auto-updated; the user has to translate and commit separately. Cross-branch translation propagation is out of scope.
- **Credential storage per-book.** Phase 2+ may need per-book PAT (different repos, different accounts). Today core git assumes one PAT per host. Decision deferred until Phase 2 is being built.

---

## 9. Documentation plan

Help docs ship alongside implementation. Each doc in 8 languages (DE, EN, ES, FR, EL, PT, TR, JA).

### 9.1 Phase 1 doc

`docs/help/{lang}/plugin-git-sync-import.md`

Sections:

- Install and activate the plugin
- What is a compatible repo (points to `docs/specifications/bibliogon-repo-spec.md`)
- How to import a single-language book
- How multi-language branches are detected and imported
- Migrating a legacy write-book-template repo (Markdown to TipTap)
- Troubleshooting import errors (common: missing `.bibliogon/`, unsupported `spec_version`, auth failures)

### 9.2 Phase 2 doc

`docs/help/{lang}/plugin-git-sync-export.md`

Sections:

- Committing Bibliogon changes back to the repo
- Overwrite semantics and the warning banner
- Pushing to a remote (HTTPS + PAT)
- When to commit (guidance: after a work session, not after every keystroke)

### 9.3 Phase 3+ docs

Arrive with the phase. Phase 3 adds a conflict resolution guide; Phase 4 adds a multi-language linking guide; Phase 5 adds the unified commit model.

### 9.4 `docs/specifications/bibliogon-repo-spec.md`

A Phase 1 deliverable, not a help doc. Precise spec of Section 4 of this exploration, authoritative for any future plugin or tool that reads or writes the structure.

---

## 10. Out of scope across all phases

Items that are NOT part of the 5-phase plan, even at the end:

- Conversion from non-Bibliogon repo formats (Docsify, Hugo, Jekyll, mdBook). Adding Phase 6 if user demand emerges; not on the current roadmap.
- Bibliogon-to-git without going through plugin-git-sync. That is core git integration, shipped separately in v0.21.0.
- Collaborative real-time editing with multiple users editing the same Bibliogon book and git as the sync layer. Out of scope architecturally.
- Plugin-provided git hosting (the plugin does not host repos, it only speaks to existing ones).
- Git-over-web (GitHub REST API, GitLab REST API). The plugin uses the git protocol (`git://`, `https://`, later `ssh://`) only.
- Branch creation from inside Bibliogon. If the user wants a new language branch, they create it in git first; the plugin discovers it on re-import.

---

## 11. Triggers for starting each phase

Phases should start when there is real demand, not speculatively.

- **Phase 1:** the user (or another author) has a concrete write-book-template repo that must land in Bibliogon. Triggered by: real import need.
- **Phase 2:** at least one book has been successfully imported and has accumulated Bibliogon-side edits the user wants committed back.
- **Phase 3:** conflicts start happening in practice. Multiple edit sources (Bibliogon + direct git edits) on the same book.
- **Phase 4:** the user is actively maintaining multi-language books and the current UI friction (book list shows 3 unrelated entries for DE/EN/ES) is painful.
- **Phase 5:** plugin-git-sync Phases 1-2 and core git Phase 1 are both stable in production for at least one release cycle.

No phase starts until the prior phase has shipped and lived in the main branch for at least one release.

---

## 12. Cross-references

- [git-based-backup.md](git-based-backup.md) - core git integration, shipped in v0.21.0, the orthogonal feature plugin-git-sync coexists with.
- [children-book-plugin.md](children-book-plugin.md) - a plugin architecture precedent (plugin-kinderbuch, which depends on plugin-export).
- [tiptap-3-migration.md](tiptap-3-migration.md) - future migration that may bump the `version` field in chapter JSON from `tiptap-2` to `tiptap-3`.
- [github.com/astrapi69/write-book-template](https://github.com/astrapi69/write-book-template) - reference repo format; the input shape for the Phase 1 migration path.
- [github.com/astrapi69/bibliogon-plugin-export](https://github.com/astrapi69/bibliogon-plugin-export) - the required dependency.
- [backend/app/services/backup/](../../backend/app/services/backup/) - existing backup stack; plugin-git-sync does not touch it.
- `docs/ROADMAP.md` - will get new entries PGS-01 through PGS-05 for the plugin phases (see Section 13).

---

## 13. ROADMAP addition (separate commit)

After this exploration is committed, add to ROADMAP under the "Plugins" section:

```markdown
## Plugins

- [ ] **PGS-01:** plugin-git-sync Phase 1 (import-only MVP)
  - Status: Pending. Exploration complete.
  - See docs/explorations/plugin-git-sync.md
  - Estimated effort: 12-18h
- [ ] **PGS-02:** plugin-git-sync Phase 2 (export to repo, overwrite MVP)
  - Estimated effort: 10-15h
- [ ] **PGS-03:** plugin-git-sync Phase 3 (smart-merge on re-import)
  - Estimated effort: 14-20h
- [ ] **PGS-04:** plugin-git-sync Phase 4 (multi-language linking UI)
  - Estimated effort: 8-12h
- [ ] **PGS-05:** plugin-git-sync Phase 5 (core git integration bridge)
  - Estimated effort: 6-10h
```

The ROADMAP update is a separate one-line commit. Not in this exploration session.

---

## 14. Stop conditions and closing checklist

### 14.1 Stop conditions (hit during implementation, not exploration)

- If PluginForge capability check (Section 5.1) reveals that plugin-to-plugin imports do NOT work, stop Phase 1 implementation and revisit the exploration with the three fallback options from Section 5.4.
- If the repo structure spec (Section 4) proves insufficient when applied to a real write-book-template repo, stop and extend the spec in `docs/specifications/` before continuing.
- If any phase exceeds its effort estimate by 2x, stop and re-scope. Either the scope was wrong or the approach is wrong.

### 14.2 Closing checklist for this exploration

- [x] Document covers all 14 sections
- [x] Repo structure spec (Section 4) is precise enough to implement against
- [x] Plugin-to-plugin architectural analysis (Section 5) is honest about known and unknown PluginForge capabilities
- [x] 5 phases with scope, effort estimate, out-of-phase exclusions
- [x] Documentation plan covers Phase 1 and Phase 2 at minimum
- [x] Cross-references accurate
- [x] Section 13 prepares ROADMAP update but does not execute it in this commit
- [ ] Commit follows conventional commits
- [ ] `make test` still passes
