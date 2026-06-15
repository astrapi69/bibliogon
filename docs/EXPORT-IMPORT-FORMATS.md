# Export / Import Format Inventory

A complete map of every file format Bibliogon can produce (export) or consume
(import), where each is triggered in the UI, whether it works offline in the
backendless PWA (Dexie mode), and where it can be imported back. Companion to
[`MODULE-ARCHITECTURE.md`](MODULE-ARCHITECTURE.md) (folder structure) and the
storage-seam goldstandard.

> **Two backup concepts — do not confuse them.** Bibliogon has *two* distinct
> "backup" surfaces. They are different formats with different scope and
> different code paths:
>
> 1. **JSON full-data backup** (`exportFullBackup` / `importFullBackup`,
>    `frontend/src/export/backupExport.ts` + `backupImport.ts`). A single
>    `.json` file gathered through the `getStorage()` seam, so it works
>    **online and offline**. Produced by **both** the *Settings → Backups →
>    "Vollständiges Backup (JSON)" → Backup exportieren* button **and** the
>    *Settings → Danger-Zone → "Backup erstellen"* button — they call the same
>    function. **Re-importable** via *Settings → Backups → "Backup importieren"*
>    in **both** desktop and PWA modes (the JSON section is not feature-gated).
> 2. **`.bgb` archive** (backend `app/services/backup/backup_export.py`). A
>    server-side ZIP covering the full relational graph (all entities +
>    binary assets + optional audiobook MP3s). Export is **backend-only**;
>    import is via `POST /api/backup/import` (desktop) or, for offline, the
>    client-side `frontend/src/import/bgbImport.ts` wired into the import
>    wizard.
>
> See [Danger-Zone backup analysis](#danger-zone-backup-analysis) below — the
> JSON backup *is* importable; the prior assumption that it could not be was a
> discoverability gap, now fixed with an in-UI pointer.

Legend for the "Offline?" / "Import?" columns: **Yes** = fully supported,
**No** = not supported / output-only, **Partial** = client-side skeleton or
preview but full path needs the backend.

---

## Export formats

| Format | Triggered at | Contains | Offline (Dexie)? | Desktop import? | PWA import? |
|--------|--------------|----------|:----------------:|:---------------:|:-----------:|
| **`.bgb`** full backup | Settings → Backups (server export `GET /api/backup/export`) | Entire DB graph: books+chapters (TipTap JSON), articles, authors, pages, comic panels/bubbles, story entities + links, chapter labels/versions, writing sessions, publications, comments, templates, assets (binary), optional audiobook MP3s | No (backend-only) | Yes | Yes (client `bgbImport.ts`) |
| **JSON full-data backup** | Settings → Backups → Backup exportieren **and** Danger-Zone → Backup erstellen | settings + author profile, authors, books (+embedded chapter content), articles, story bible, chapter labels, writing sessions (informational) | **Yes** | **Yes** | **Yes** |
| **Markdown** `.md` | Editor/Article export, ExportForm | Text only (TipTap → Markdown; inline `$…$` / block `$$…$$` math as text). No images. | Yes (client engine) | Yes (as a chapter) | Yes (as a chapter) |
| **HTML** `.html` | ExportForm / client export menu | Semantic HTML5 document (headings, lists, blockquote, code, marks); math as text | Yes | Yes (as a chapter) | Yes (as a chapter) |
| **Plain text** `.txt` | ExportForm | Title/author + paragraphs, all markup stripped | Yes | Yes (as a chapter) | Yes (as a chapter) |
| **LaTeX** `.tex` | ExportForm | Compilable LaTeX (`book`/`article` class, math passthrough); no embedded images | Yes (pure-JS client engine) | No (output-only) | No |
| **PDF** `.pdf` | ExportForm / editor export | Title/headings/body via pdfmake; math as text; no embedded chapter images | Yes (client engine, pdfmake) | No (output-only) | No |
| **EPUB** `.epub` | ExportForm | EPUB3: metadata, chapters as sections, optional cover, TOC | Client skeleton; full path via backend Pandoc | No (output-only) | No |
| **DOCX** `.docx` | ExportForm | Word doc: title, chapters, paragraphs/lists/marks | Client skeleton; full path via backend Pandoc | No (output-only) | No |
| **Project ZIP** (write-book-template) | ExportForm (`project`) | `metadata.yaml` + `manuscript/*.md` + `assets/` tree | No (backend + Pandoc/scaffolder) | Yes (re-import as WBT) | No |
| **Audiobook** (MP3) | ExportForm (`audiobook`), async job | Per-chapter / merged MP3 via TTS | No (backend TTS) | No (output-only) | No |

Sources: client engine in `frontend/src/export/format{Markdown,Html,Text,Latex,Pdf,Epub,Docx}.ts`;
backend document/project/audiobook paths in
`plugins/bibliogon-plugin-export/bibliogon_export/{routes.py,pdf_export.py,audiobook_job.py,scaffolder.py}`
and `backend/app/routers/article_export.py`. The export-engine chooser
(Settings → Export: auto/client/backend) selects client vs backend where both
exist.

### Notes / known limitations (export)

- **Document formats are text-first.** Markdown/PDF/LaTeX/HTML/Text do not embed
  chapter images. EPUB carries an optional cover. The `.bgb` and Project-ZIP
  paths are the ones that carry binary assets.
- **Pandoc-gated formats** (EPUB/DOCX full path, Project ZIP, LaTeX-via-Pandoc)
  need a backend with Pandoc and are therefore unavailable in the backendless
  PWA — those surfaces resolve through `useFeature` / `useStorageMode` to the
  client engine or a desktop-only notice.
- **Audiobook** requires a backend TTS engine; it is async (job + SSE progress).

---

## Import formats

| Format | Triggered at | Restores | Offline (Dexie)? | Desktop? | PWA? |
|--------|--------------|----------|:----------------:|:--------:|:----:|
| **JSON full-data backup** | Settings → Backups → Backup importieren | settings (except author profile), authors, books+chapters, articles, story bible, chapter labels | **Yes** | **Yes** | **Yes** |
| **`.bgb`** full backup | Settings → Backups / import wizard | full DB graph (multi-book selection) | Yes (`bgbImport.ts`) | Yes (`POST /api/backup/import`) | Yes |
| **Markdown** `.md` | Import wizard (file) | one chapter in a new/existing book (first H1 = title) | Yes | Yes | Yes |
| **HTML** `.html` | Import wizard (file) | one chapter (`<title>`/first `<h1>` = title) | Yes | Yes | Yes |
| **Text** `.txt` | Import wizard (file; needs leading `#` H1) | one chapter | Yes | Yes | Yes |
| **JSON (TipTap)** | Import wizard / restore path | chapter/document content (TipTap doc) | Yes | Yes | Yes |
| **Medium export ZIP** | Articles → Medium import page | articles + publications + provenance; images as URLs (download is a backend opt-in) | Partial (client parse/preview; image download backend) | Yes | Partial |
| **Project / `.bgp`** (write-book-template ZIP) | Import wizard | book + chapters + assets (+ optional Git adoption) | No (backend) | Yes | No |
| **Office** (`.docx` / `.epub`) | Import wizard | one+ chapters via Pandoc → Markdown | No (Pandoc) | Yes | No |
| **Markdown folder** | Import wizard (folder) | one chapter per `.md`, README → description, cover image | No (backend handler) | Yes | No |

Sources: client detector/handlers in
`frontend/src/import/{detectFormat.ts,chapterImporters.ts,bgbImport.ts,htmlToTipTap.ts}`
and `frontend/src/medium-import/clientImport.ts`; backend handlers in
`backend/app/import_plugins/handlers/{bgb.py,wbt.py,markdown.py,markdown_folder.py,office.py}`
+ `backend/app/routers/import_orchestrator.py` + `plugin-medium-import`.

### Notes / known limitations (import)

- Single-file Markdown/HTML/Text import always lands as **one chapter** in a new
  or existing book; multi-file/folder/WBT paths are backend-only.
- `.bgb` import regenerates fresh book ids and rewrites chapter asset URLs; the
  client-side offline importer restores the core entities but not every child
  table (pages, comic panels, story-entity links, publications, comments,
  writing sessions) — those round-trip fully only through the backend path.
- Output-only formats (PDF, LaTeX, EPUB-as-output, DOCX-as-output, audiobook)
  have no import path by design.

---

## Danger-Zone backup analysis

**Question raised:** the *Settings → Danger-Zone → Backup erstellen* button
produces a `.json` file; can it be imported back, and should it become a `.bgb`?

**Findings (verified in code):**

1. **What the Danger-Zone exports.** `DangerZoneSettings.tsx` calls
   `exportFullBackup()` + `backupFilename()` from
   `frontend/src/export/backupExport.ts` — the **same functions** the
   *Settings → Backups → Backup exportieren* button uses. The file is
   `bibliogon-backup-YYYY-MM-DD.json`: a `{version, app_version, exported_at,
   data}` envelope with settings, authors, books (+embedded chapter content),
   articles, story bible, and chapter labels, gathered through the
   `getStorage()` seam.
2. **What `.bgb` exports.** `backend/app/services/backup/backup_export.py`
   writes a server-side ZIP over the full relational graph (all entities +
   binary assets + optional audiobook MP3s). It is **backend-only** — there is
   no client-side `.bgb` *export*.
3. **Is there a technical reason the Danger-Zone uses JSON, not `.bgb`?** Yes.
   The Danger-Zone (and its backup-before-reset prompt) must work in the
   **backendless PWA** (the reset itself runs `resetOfflineDatabase()` offline).
   `.bgb` export requires the backend, so it cannot be produced offline. The
   JSON full-data backup is gathered through the storage seam and therefore
   works in both modes — it is the **correct** choice for this surface.
4. **Can the JSON be imported?** **Yes.** *Settings → Backups → "Vollständiges
   Backup (JSON)" → Backup importieren* calls `importFullBackup()` on exactly
   this file, and that section is **not** feature-gated, so it works in **both**
   desktop and PWA modes. This export/import pair is the round-trip the
   **BACKUP-AKZEPTANZTEST** gate (`e2e/smoke/backup-acceptance.spec.ts`,
   export → reset → import → verify against the live backend) validates.

**Conclusion — no `.bgb` conversion.** Switching the Danger-Zone to `.bgb`
would *regress* the feature: `.bgb` export is backend-only and would break in
the offline PWA where the Danger-Zone is most needed. The premise that the
JSON backup "cannot be imported in the desktop app" was inaccurate — it can,
via Settings → Backups. The real issue was **discoverability**: a user creating
a backup in the Danger-Zone was not told where to restore it.

**Fix shipped:** a pointer hint under the Danger-Zone backup button
(`ui.settings.danger_zone.backup_import_hint`, all 8 locales): *"Dieses
JSON-Backup kannst du später unter Einstellungen → Backups → Backup importieren
wiederherstellen (online wie offline)."* No format change; no data-path change.

---

## BACKUP-AKZEPTANZTEST coverage

The acceptance gate (`e2e/smoke/backup-acceptance.spec.ts`, see
`.claude/rules/coding-standards.md` "BACKUP-AKZEPTANZTEST") covers the
**JSON full-data backup** round-trip (`exportFullBackup` → Danger-Zone reset →
`importFullBackup` → verify) against the live backend. It does **not** exercise
the `.bgb` archive path or the document-export formats:

- **`.bgb`** has its own backend round-trip coverage in
  `backend/tests` (the introspection-driven `serialize_row`/`restore_row`
  create → export → wipe → import → compare test, per BACKUP-PARITY-PIN).
- **Document formats** (MD/PDF/EPUB/DOCX/LaTeX/HTML) are covered by the export
  plugin unit tests + client `format*.ts` Vitest, not by the acceptance gate
  (they are output-only, no round-trip).

So no single gate spans *all* formats — the JSON full-data backup and the
`.bgb` archive each have their own round-trip test, and document formats are
unit-tested. When a new restorable entity is added, extend the matching gate
(JSON acceptance test **and** `.bgb` backend round-trip) per BACKUP-PARITY-PIN.

---

## See also

- [`MODULE-ARCHITECTURE.md`](MODULE-ARCHITECTURE.md) — folder structure + the storage-seam goldstandard
- [`VIBE-CODING-POLICY.md`](VIBE-CODING-POLICY.md) — architectural discipline
- `.claude/rules/coding-standards.md` — BACKUP-PARITY-PIN + BACKUP-AKZEPTANZTEST rules
- `.claude/rules/architecture.md` — offline/Dexie-mode rule + three-state feature visibility
