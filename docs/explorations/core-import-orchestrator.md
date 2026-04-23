# Core Import Orchestrator with Plugin-Based Format Handlers

Status: Architecture decided, phased implementation planned.
Last updated: 2026-04-23
Related explorations:
- [plugin-git-sync.md](plugin-git-sync.md) — first plugin to implement the protocol defined here
- [archive/git-based-backup.md](archive/git-based-backup.md) — core git integration (shipped v0.21.0), separate concern
Revived when: starting Phase 1 (core wizard + detect endpoint).

---

## 1. Motivation

Recent bug marathon (chapter images lost to smart quotes, cover import missing on metadata-reference mismatch, CSS not found because filename not in hardcoded list, DB destroyed by test harness) exposes a structural cost of the current import design:

- Every format-specific bug lands on code in `backend/app/services/backup/*.py`. Core accumulates format edge cases.
- No preview step. Bugs surface AFTER the book is in the DB. Silent misreads (wrong cover filename, missing CSS) are invisible until the user clicks around in the editor.
- No unified UX. Different entry points (`/backup/import`, `/backup/import-project`, `/backup/smart-import`, single-file drop) depending on what the user has.
- Adding a new format (`.docx`, Scrivener, git URL) requires touching core — raising the cost of every future format.

Goals for this redesign:

1. **Unified wizard UI** in core. One entry point, same flow regardless of source.
2. **Detect before commit.** Parse the input, return a preview, let the user confirm/override before anything lands in the DB.
3. **Format logic in plugins.** Core owns orchestration + UX; plugins own parsing.
4. **Cheap to extend.** New formats = new plugin, no core change.
5. **Migrate existing paths** into the new model incrementally, with a clear deprecation path.

---

## 2. Use cases

Current and anticipated import sources:

| # | Source | Today | Target owner |
|---|--------|-------|--------------|
| 1 | Bibliogon `.bgb` backup | `backup_import.py` | Core handler (Bibliogon owns the format) |
| 2 | Single Markdown file | `markdown_import.py` | Core handler |
| 3 | write-book-template ZIP | `project_import.py` (partially broken) | `plugin-git-sync` |
| 4 | Git repo URL | none | `plugin-git-sync` Phase 1 |
| 5 | Folder of Markdown files (drag-drop) | none | Core handler OR `plugin-markdown-folder` |
| 6 | `.docx` file | none | `plugin-import-office` |
| 7 | `.epub` file | none | `plugin-import-office` |
| 8 | Scrivener project | none | future, hypothetical |

Most use cases don't exist yet. The architecture's value proposition is making (4) through (8) cheap to add without touching core.

---

## 3. UX: wizard with preview

### 3.1 Four-step flow

**Step 1 — Choose input.** Drag-drop ZIP file; drag-drop folder (HTML5 `webkitdirectory`); paste git URL; upload single file; browse-file fallback.

**Step 2 — Detection (backend).** Backend dispatches input to the first plugin whose `can_handle()` returns True. That plugin runs `detect()` — read-only inspection — and returns a `DetectedProject` JSON.

**Step 3 — Preview and override.** Frontend shows:
- Title, author, language (inline editable)
- Chapter list with titles, word counts, 200-char previews (user can reorder or drop)
- Asset grid with thumbnails for images, icons for other types, purpose badge ("cover", "figure", "css", "font")
- Cover asset highlighted with preview thumbnail (user can reassign)
- CSS detected: size + syntax-highlighted snippet
- Plugin-reported features (KDP config, audiobook settings, etc.)
- Warnings panel: missing cover, duplicate chapter title, unreferenced asset, stale metadata reference, etc.

The user can override any detected field or asset assignment before committing. This is where the preview becomes a value multiplier: every recent silent-failure bug becomes a warning the user resolves in one click.

**Step 4 — Execute.** User confirms. Backend calls the plugin's `execute(input, detected, overrides)`. Book created, chapters created, assets registered. Success toast.

### 3.2 Why preview is the primary win

The wizard itself is moderate UX polish. The **preview step** is where the architecture pays back the recent debugging sessions. Concrete examples from the recent week:

- Cover filename mismatch between `metadata.yaml` and `assets/covers/` — would show as warning "Metadata references `cover.png`, imported asset is `hidden-power-of-eternity-01.jpeg`; pick one:" with a dropdown.
- Smart-quoted `<img src=...>` in chapter HTML — would show as warning "Chapter 1 has 1 image with unusual `src` syntax; may not render. Continue anyway?" with a link to the offending chapter.
- `config/styles.css` missed because of filename drift — would show as warning "No stylesheet found under `config/`. Scan rest of project?" with a yes button.

All three bugs became user-catchable at preview time. The DB never saw the broken state.

---

## 4. Plugin interface specification

```python
# backend/app/import_plugins/protocol.py (tentative location - see Section 9)

from typing import Protocol
from pydantic import BaseModel


class DetectedAsset(BaseModel):
    filename: str
    path: str            # path-relative to input root
    size_bytes: int
    mime_type: str
    purpose: str         # "cover" | "figure" | "css" | "font" | "other"


class DetectedChapter(BaseModel):
    title: str
    position: int        # 0-based
    word_count: int
    content_preview: str # first 200 chars of plain text


class DetectedProject(BaseModel):
    format_name: str                     # "write-book-template" | "bgb" | ...
    title: str | None
    author: str | None
    language: str | None
    chapters: list[DetectedChapter]
    assets: list[DetectedAsset]
    warnings: list[str]
    plugin_specific_data: dict           # escape hatch


class ImportPlugin(Protocol):
    """Every import format plugin implements this."""

    format_name: str                     # stable identifier, used by core for priority

    def can_handle(self, input_path: str) -> bool:
        """Quick check - is this plugin capable of parsing this input?

        MUST be side-effect-free and fast (file-extension check,
        peek at first few bytes, list ZIP entries). Called by
        core's dispatch loop against every registered plugin.
        """
        ...

    def detect(self, input_path: str) -> DetectedProject:
        """Deep inspection, no side effects.

        Returns what WOULD be created, with warnings. Must NOT
        write to disk, create DB rows, or allocate long-term
        resources. Safe to call repeatedly.
        """
        ...

    def execute(
        self,
        input_path: str,
        detected: DetectedProject,
        overrides: dict,
    ) -> str:
        """Commit. Returns the new book_id.

        - input_path: same as detect, for re-reading if needed.
        - detected: the DetectedProject returned by detect().
        - overrides: dict with keys matching DetectedProject
          field paths (e.g. "title", "assets[3].purpose") and
          user-chosen values.

        Plugin is responsible for: creating Book + Chapter +
        Asset rows, copying asset files to uploads/, rewriting
        chapter content paths, setting Book.cover_image.
        """
        ...
```

### Design rationale

- **Two-phase (detect + execute):** detect is read-only; execute is authoritative. The split enables preview, retry on detection errors, and user overrides.
- **Overrides dict:** typed keys, plugin applies them during `execute`. Unknown keys raise. Override values are the authoritative source during execute; detected values are defaults.
- **Protocol, not base class:** plugins implement via duck-typing, PluginForge dispatches by protocol match. Matches existing PluginForge plugin style.
- **`plugin_specific_data`:** escape hatch for plugin-specific information that doesn't fit the schema (e.g. KDP config detected in the ZIP, Scrivener label colors). Core passes it through verbatim.
- **`format_name`:** stable string used by priority config (Section 5.1) and by frontend for UX hints ("Detected: write-book-template project").

---

## 5. Format detection and dispatch

### 5.1 Dispatch loop

```python
# pseudocode, lives in core

@router.post("/api/import/detect")
def detect_import(payload: ImportInput) -> DetectedProject:
    input_path = save_to_temp(payload)
    for plugin in ordered_plugins():
        if plugin.can_handle(input_path):
            return plugin.detect(input_path)
    raise HTTPException(415, "Unsupported format")


@router.post("/api/import/execute")
def execute_import(payload: ImportExecute) -> BookIdResponse:
    plugin = find_plugin_by_format(payload.detected.format_name)
    book_id = plugin.execute(payload.input_path, payload.detected, payload.overrides)
    return {"book_id": book_id}
```

### 5.2 Priority config

```yaml
# backend/config/import-priority.yaml
- plugin-git-sync       # .bgit, git URLs, write-book-template ZIPs
- plugin-import-office  # .docx, .epub
- core-bgb              # .bgb (Bibliogon format)
- core-markdown         # single .md, .md folder
```

First-wins. User can re-order via settings UI if two plugins claim the same input.

### 5.3 Core handlers vs plugins

The protocol is satisfied by two kinds of implementors:

- **Core handlers:** in-process classes in `backend/app/import_handlers/`. Shipped with Bibliogon, no separate install. Bibliogon-native formats (`.bgb`, core-markdown) live here.
- **Plugins:** PluginForge-discovered packages. External formats (write-book-template via `plugin-git-sync`, Office via `plugin-import-office`).

The dispatch loop treats both uniformly. Core maintains an internal registry that unions both sources. Priority config orders them.

---

## 6. Migration plan for existing import paths

| Path | File | Current LOC | New home |
|------|------|-------------|----------|
| `.bgb` export/import | `backup_export.py`, `backup_import.py` | ~350 | **Core handler** - stays in core, wrapped behind the protocol |
| `smart_import` | `smart_import.py` | ~100 | **Deprecated** - endpoint 301 redirects to `/api/import/detect`, removed after one release cycle |
| `project_import` | `project_import.py` | ~600 (after recent fixes) | **Moved to plugin-git-sync** - WBT logic is plugin territory |
| `markdown_import` | `markdown_import.py` | ~100 | **Core handler** - single-file and plain-folder stay in core |

Implicit commitments:

- `.bgb` is Bibliogon's own format. Keeping it in core avoids a plugin dependency for a basic feature (backup/restore).
- Markdown is the universal fallback. Core handler ensures every user can always import a `.md` without installing a plugin.
- `smart_import`'s dispatch table (peek at ZIP contents) dies with this change — the wizard's Step 1 source-picker + the plugin dispatch loop replace it.

---

## 7. Phase breakdown

### Phase 1: Core wizard + detect/execute endpoints

**Scope:**
- New React wizard component, 4-step flow (Source → Detect → Preview → Execute).
- `POST /api/import/detect` endpoint (read-only, returns `DetectedProject`).
- `POST /api/import/execute` endpoint (authoritative, creates book).
- `ImportPlugin` protocol in `backend/app/import_plugins/protocol.py` (see Section 9 open questions).
- PluginForge integration: import plugins discovered via a new `bibliogon.import_plugins` entry-point group.
- Existing `.bgb` and `markdown_import` rewritten as core handlers.
- Preview panel: title, author, language (inline editable), chapter list, asset grid with thumbnails, cover preview, CSS snippet, warnings panel.
- Override UI: per-field inline editors; asset purpose dropdown; chapter reorder + drop.
- Temporary upload staging: `uploads/.import-staging/{uuid}/` holds the input between detect and execute; cleaned on execute success or 30-minute TTL.

**Estimated effort:** 20-28h (revised up from 15-22 — preview panel alone is 4-6h including the asset grid; override inline editors add another 3-4h).

**Out of Phase 1:** git URL support, folder drag-drop, `.docx`/`.epub`, plugin-git-sync adoption.

### Phase 2: plugin-git-sync adopts ImportPlugin

**Scope:**
- `plugin-git-sync` (PGS-01 in the separate plugin roadmap) implements `ImportPlugin`.
- WBT ZIP logic moves from `backend/app/services/backup/project_import.py` into the plugin package.
- Git URL support lands (clone into staging, then standard detect → execute flow).
- `smart_import.py` deprecated (endpoint `POST /api/backup/smart-import` returns 301 to `/api/import/detect`).

Covers PGS-01 scope; integration overhead ~3-5h on top of the existing PGS-01 budget (12-18h).

**Out of Phase 2:** sync-back (PGS-02), conflict handling (PGS-03), multi-language linking (PGS-04), core-git bridge (PGS-05).

### Phase 3: Folder drag-drop handler

**Scope:**
- HTML5 `<input webkitdirectory>` in the wizard's Step 1.
- Backend receives a multipart upload of folder contents (each file as its own part).
- Core handler `core-markdown-folder` implements `ImportPlugin`.
- Conventions: `README.md` → description, `chapter-XX.md` naming for order, `images/` folder for figures, `cover.{png,jpg}` at root → cover.

**Estimated effort:** 6-10h.

### Phase 4: Office formats via `plugin-import-office`

**Scope:**
- New plugin package `bibliogon-plugin-import-office`.
- `.docx` via Pandoc (produces Markdown → TipTap JSON via existing converter).
- `.epub` via Pandoc or `ebooklib` (plugin author picks).
- Implements `ImportPlugin`.
- Pandoc dependency: backend Dockerfile already carries it; plugin can assume it's available in the runtime.

**Estimated effort:** 10-15h.

### Phase 5: Deprecation cleanup

**Scope:**
- Remove `smart_import.py` (after one-release-cycle 301 window).
- Empty `project_import.py` (logic now in plugin-git-sync).
- Remove old routes, frontend callers (`api.backup.smartImport`, `api.backup.importProject`).
- Update docs + `docs/API.md`.

**Estimated effort:** 4-6h.

**Total:** 40-59h core work + PGS-01 budget (12-18h).

---

## 8. Open design questions

Non-blockers for Phase 1 start; each phase resolves what it needs.

- **Large uploads.** WBT ZIPs routinely 20-50MB, books with audiobook masters can hit 500MB+. Phase 1 must decide: streaming multipart upload (backend streams to disk, never holds full content in memory) vs buffered (simpler but kills the backend on big files). Recommendation: streaming; FastAPI + `aiofiles` supports it cleanly.
- **Duplicate book detection.** User imports the same repo twice. Warn and require confirm? Refuse? Silent overwrite? Recommendation: warn at Step 3 preview if any existing book has the same title + author, let user proceed anyway.
- **Partial failure recovery.** `execute` fails halfway through asset copy. Rollback? Leave partial book? Recommendation: execute wraps the DB work in a transaction; disk writes happen AFTER the transaction commits. On disk-write failure, rollback the transaction and delete any partial files.
- **Format conflict at dispatch.** Two plugins both `can_handle()` the same input. Recommendation: priority config first-wins; log a warning listing all matching plugins so the user can re-order via settings if the automatic pick is wrong.
- **Plugin discovery UX.** User drops a `.docx` on a Bibliogon install without `plugin-import-office`. Recommendation: wizard Step 2 detects the extension, shows "No plugin can handle `.docx` files yet. Install `plugin-import-office` (one-click)?"
- **Import history.** Track what was imported when, for audit and deduplication. Existing `BackupHistory` table could extend, or a new `ImportHistory`. Recommendation: reuse `BackupHistory` (it already carries backup/restore/import events).

---

## 9. Decisions deferred

Four decisions the spec leaves open; each blocks nothing in Phase 1 but needs resolution before the corresponding surface ships.

- **Protocol location.** `backend/app/import_plugins/protocol.py` is the spec's tentative home. If `plugin-git-sync` (external repo, future PyPI package) must import the protocol, two options exist: (a) plugin depends on `bibliogon` as a transitive import (tight coupling, fights plugin independence); (b) protocol moves to PluginForge (expands PluginForge scope beyond framework, into domain-specific contracts). Decision needed before Phase 2.
- **Override schema precision.** "User can override any detected field" is loose. The schema must name: which field paths are legal override keys (`title`, `author`, `language`, `assets[i].purpose`, `chapters[i].position`); what happens when an override references an asset/chapter not in the detection (raise? silently skip?); whether overrides can add entries (e.g. promote a figure asset to be the cover) or only modify existing ones. Spec-out at Phase 1 start.
- **`smart_import` deprecation mechanism.** Wrap (URL stays, proxies internally to new detect+execute) vs deprecate (301 redirect, remove after one release cycle). Wrap keeps clients working through releases; deprecate forces migration and simplifies the codebase. Recommendation: **deprecate with 301** — one release warning is enough given Bibliogon has no external API consumers yet.
- **Plugin-specific data evolution.** `plugin_specific_data: dict` is an escape hatch. When core later adds a first-class field for something currently living there, plugins need a migration path (translate the data, bump a schema version?). No immediate action; revisit if/when the first such migration is needed.

---

## 10. Relation to other explorations

| Exploration | Relation |
|-------------|----------|
| `plugin-git-sync.md` | First plugin to implement `ImportPlugin`. PGS-01's Phase 1 scope now includes protocol adoption. |
| `archive/git-based-backup.md` | Orthogonal. Versioning a book, not importing one. |
| `article-authoring.md` | Orthogonal. Article workflow is its own product surface. |
| `tiptap-3-migration.md` | Orthogonal. Editor internals, not import. |

After this exploration is committed, [plugin-git-sync.md](plugin-git-sync.md) will get a short forward-reference update in a separate commit: "Plugin-git-sync Phase 1 implements the `ImportPlugin` protocol defined in core-import-orchestrator.md". Not in this session.

---

## 11. Triggers for starting each phase

- **Phase 1:** when 20-28h of focused work is available. Bottleneck for PGS-01 until this ships, so there's real pressure.
- **Phase 2:** Phase 1 stable in main for at least one release cycle. PGS-01 ready to start against a frozen protocol.
- **Phase 3:** user or community demand for folder drag-drop.
- **Phase 4:** first `.docx` or `.epub` import request.
- **Phase 5:** Phase 2 shipped + one release cycle of stability.

No phase starts until the prior has shipped and lived in main for at least one release.

---

## 12. Out of scope across all phases

Items that are NOT part of the plan, at any phase:

- **Export orchestration.** `plugin-export` stays as-is. Mirror symmetry (core-export-orchestrator) is a separate future exploration if ever needed.
- **Format conversion ON import.** If `plugin-import-office` wants to convert `.docx` to markdown-first internally, that's the plugin's choice. Core does not mandate a conversion pipeline.
- **Cloud-storage imports.** Google Drive, Dropbox, OneDrive. Could be plugins later; not designed for here.
- **Live-sync during import.** That's `plugin-git-sync` Phase 2+ (PGS-02), a different architectural problem.
- **Plugin registry UI.** Browsing and one-click installing import plugins is a future plugin-marketplace feature, not a core-import concern.
- **User-written plugins.** Supporting third-party plugin authors with stable API guarantees comes when the ecosystem grows (5+ plugin authors).

---

## 13. Cross-references

- [plugin-git-sync.md](plugin-git-sync.md)
- [archive/git-based-backup.md](archive/git-based-backup.md)
- [../../backend/app/services/backup/](../../backend/app/services/backup/) — existing import code (target for migration)
- [../../backend/app/services/backup/backup_import.py](../../backend/app/services/backup/backup_import.py) — `.bgb` (becomes core handler)
- [../../backend/app/services/backup/smart_import.py](../../backend/app/services/backup/smart_import.py) — deprecated in Phase 2
- [../../backend/app/services/backup/project_import.py](../../backend/app/services/backup/project_import.py) — WBT (moves to plugin-git-sync)
- [../../backend/app/services/backup/markdown_import.py](../../backend/app/services/backup/markdown_import.py) — core handler
- [../../frontend/src/components/](../../frontend/src/components/) — future wizard component lives here
- [../ROADMAP.md](../ROADMAP.md) — new entries `CIO-01..05` (added in a follow-up commit, see Section 14)

---

## 14. ROADMAP addition (separate commit)

After this exploration is committed, ROADMAP gets a new category (separate commit, not in this session):

```markdown
### Core import orchestrator

- [ ] **CIO-01:** core wizard + detect/execute endpoints + `ImportPlugin` protocol + preview panel + override UI. Existing `.bgb` and markdown paths rewritten as core handlers. Estimated effort: 20-28h.
- [ ] **CIO-02:** plugin-git-sync adopts `ImportPlugin`, WBT logic moves to plugin, `smart_import` deprecated (301). Rolls up with PGS-01 from the plugin roadmap. Integration overhead: 3-5h.
- [ ] **CIO-03:** folder drag-drop handler (`core-markdown-folder`). Estimated effort: 6-10h.
- [ ] **CIO-04:** office formats via `plugin-import-office` (`.docx`, `.epub`). Estimated effort: 10-15h.
- [ ] **CIO-05:** deprecation cleanup (remove `smart_import.py`, empty `project_import.py`, remove old routes + callers). Estimated effort: 4-6h.
```

The ROADMAP update is a separate one-line commit. Not in this session.

---

## 15. Stop conditions

Surfaced during implementation, not exploration:

- PluginForge cannot support the `ImportPlugin` protocol in practice (discovery, entry-point group, two-phase call). Architectural blocker — revisit before Phase 2.
- Any phase exceeds its effort estimate by 2x. Stop and re-scope; likely the premise is wrong.
- Migration reveals `backend/app/services/backup/` is too tangled for clean extraction without touching unrelated code. Pause, extract preparatory refactor into its own phase.

---

## 16. Closing checklist

- [x] All 16 sections present
- [x] Plugin protocol specified precisely enough to implement
- [x] UX wizard flow clear with preview as the primary value
- [x] Existing import paths classified with migration plan
- [x] Five phases with scope, effort, out-of-phase exclusions
- [x] Forward-reference to plugin-git-sync prepared (but deferred to follow-up commit)
- [x] Section 14 prepares ROADMAP additions; doesn't execute them
- [ ] Commit follows conventional-commits
- [ ] `make test` still passes
- [ ] Production DB untouched (tripwire from `a4cf7cf` active)
