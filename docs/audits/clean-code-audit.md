# Clean Code Audit — Bibliogon

Datum: 2026-06-10
Commit: 864d2c84
Analysiert: 316 TypeScript-Dateien (`frontend/src`, ohne Tests/Seed), 233 Python-Dateien (`backend/app`, `plugins/bibliogon-plugin-*/bibliogon_*`, `scripts`, ohne Tests)
Methode: mechanische Scans (ripgrep + Python-AST) + qualitative Tiefenlesung der grössten Dateien und des Storage-Seams.

> Reiner Bericht. Kein Code wurde refactored. Priorisierung nach
> Datenverlust-Risiko > Wartbarkeit > Style.

---

## Zusammenfassung

Die Codebasis ist in den **Grundlagen sehr sauber**: strikte TypeScript-Typisierung
(praktisch kein `any`), eine durchdachte Fehler-Architektur (`BibliogonError`-Hierarchie
+ globaler Exception-Handler + `ApiError`), eine klar geschnittene
`IStorageService`-Seam mit minimaler Duplikation zwischen `ApiStorage` und `DexieStorage`,
ein Repository-Layer mit zentralisiertem Commit/Refresh in `base.py`, kein
auskommentierter Code und keine TODO/FIXME-Schuld. Die Disziplin auf Datei-Ebene
ist hoch.

Die Probleme liegen fast ausschliesslich in der **Struktur grosser Einheiten**: einige
React-Seiten/Komponenten und Backend-Funktionen sind zu gross und tragen zu viele
Verantwortungen, und zwischen den parallelen Oberflächen (Artikel ↔ Bücher) existiert
substanzielle Copy-Paste-Duplikation.

**Stärken**

- TypeScript strict, ESLint `no-explicit-any: error` wird gelebt: nur ~7 echte `any`,
  jedes mit `eslint-disable` + Begründung (CJS/ESM-Interop, TipTap-Command-Typen).
- Kein auskommentierter Code, **0** TODO/FIXME/HACK in der auditierten Fläche.
- Fehler-Architektur sauber: Services werfen Domänen-Fehler, Router fangen nichts,
  `ErrorBoundary` umschliesst jede Route in `App.tsx`, Import-Wizard hat eigene Boundary.
- Storage-Seam (`ApiStorage`/`DexieStorage`) hat **keine** nennenswerte Logik-Duplikation:
  online delegiert an den Server, offline implementiert lokal — saubere Trennung.
- i18n-Disziplin hoch (UI-Text läuft über `t()`); `data-testid` flächendeckend (1439 Attribute).

**Hauptprobleme (Top 3)**

1. **Gott-Komponenten:** 6 Frontend-Dateien mit 1.114–1.976 Zeilen, die je 8–12 distinkte
   Verantwortungen bündeln (`BookMetadataEditor.tsx` 1.976, `Editor.tsx` 1.677,
   `ArticleList.tsx` 1.651, `ArticleEditor.tsx` 1.636, `BookEditor.tsx` 1.194,
   `Dashboard.tsx` 1.114).
2. **Überlange Funktionen + Parameter-Explosion (Backend):** 153 Python-Funktionen > 50 Zeilen
   (Projektregel: max 40); `generate_audiobook` mit **14 Parametern**, `import_zip` mit 12,
   `_import_one_post` mit 11 — klare Kandidaten für ein Dataclass/Config-Objekt.
3. **Duplikation über parallele Oberflächen:** `Dashboard.tsx` ↔ `ArticleList.tsx` teilen
   ~72 Zeilen identischer Bulk-Delete/Undo-Logik; `BookEditor.tsx` ↔ `ArticleEditor.tsx`
   teilen Autosave-/Titel-Edit-Muster.

---

## Kritische Probleme (P0)

Es wurde **kein Defekt der Datenkorruptions-/Datenverlust-Klasse** gefunden. Die
Schreibpfade über den Storage-Seam, der `.bgb`-Round-Trip und die Sync-Queue sind intakt.
Die zwei korrektheitsnächsten Risiken sind unter P1 als Architektur-/Seam-Themen geführt,
nicht als P0 — sie verursachen im schlimmsten Fall eine Offline-Divergenz oder ein still
verschlucktes Lizenz-Validierungs-Ergebnis, keine Korruption persistenter Nutzerdaten.

| # | Datei:Zeile | Problem | Kategorie | Fix-Aufwand |
|---|-------------|---------|-----------|-------------|
| – | – | Keine P0-Befunde (kein Datenverlust-/Korruptions-Risiko). | – | – |

---

## Strukturelle Probleme (P1)

| # | Datei:Zeile | Problem | Kategorie | Fix-Aufwand |
|---|-------------|---------|-----------|-------------|
| 1 | `frontend/src/components/BookMetadataEditor.tsx` (1.976 Z.) | Eine Komponente verwaltet 11 Systeme (20+ Metadatenfelder, Keywords, Categories/BISAC, KDP-Katalog-Fetch, Git-Sync-Mapping, Autor-Profil, AI-Generierung, Copy-from-Book, KDP-Wizard-Modal, Audiobook-Config, Tab-Navigation). SRP-Verletzung. | SOLID-S | Gross |
| 2 | `frontend/src/components/Editor.tsx:78-131` | Props-Interface mit **13 Props**; Komponente trägt 10+ Concerns (TipTap-Lifecycle, Autosave, Draft-Recovery, Conflict, Shortcuts, Fullscreen/Composition, Spellcheck, Style-Check, AI-Review-SSE, Markdown-Toggle, Audio-Preview). | SOLID-S / Params | Gross |
| 3 | `frontend/src/components/Editor.tsx:982-1064` | `handleAiReview` 81 Zeilen, `EventSource` mit 6-Branch-Message-Dispatch + Cleanup in einer Funktion. | Komplexität | Mittel |
| 4 | `frontend/src/pages/Dashboard.tsx:218-290` ↔ `frontend/src/pages/ArticleList.tsx:260-332` | `handleBulkBookDelete` / `handleBulkDelete`: ~72 Zeilen nahezu identischer Bulk-Delete-mit-Undo-Logik (geordnete IDs, bulkDelete, optimistisches filter, bulkRestore-Undo). | DRY | Mittel |
| 5 | `frontend/src/pages/Dashboard.tsx:922-950` ↔ `frontend/src/pages/ArticleList.tsx:1028-1058` | Identischer ref-basierter Select-All-/Indeterminate-Checkbox-Setter dupliziert. | DRY | Klein |
| 6 | `frontend/src/pages/Dashboard.tsx:131-155` ↔ `frontend/src/pages/ArticleList.tsx:175-199` | Bulk-Export Blob→ObjectURL→Download-Muster identisch dupliziert. | DRY | Klein |
| 7 | `frontend/src/pages/BookEditor.tsx:206-276` | Vier nahezu identische `_setShowMetadata/_setShowStoryboard/_setShowOutline/_setShowRelationships`-Funktionen (~70 Z. identische `URLSearchParams`-Logik) statt eines enum-getriebenen `setViewMode`. | DRY / KISS | Klein |
| 8 | `plugins/bibliogon-plugin-audiobook/bibliogon_audiobook/generator.py:283` | `generate_audiobook` 270 Zeilen, **14 Parameter** — lose Argument-Wolke statt `dataclass`/Config-Objekt (Projektregel: „dataclass/TypedDict statt loser dicts"). | Komplexität / Params | Mittel |
| 9 | `plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/importer.py:121` (`import_zip`, 12 Params, 136 Z.) & `:369` (`_import_one_post`, 11 Params, 222 Z.) | Funktions-Länge + Parameter-Explosion; mehrere Verantwortungen pro Funktion. | Komplexität / Params | Mittel |
| 10 | `plugins/bibliogon-plugin-kdp/bibliogon_kdp/publishing_state_service.py:35,186,199` | Service-Modul (`*_service.py`, keine Router-Marker) wirft `HTTPException` direkt aus `_get_book_or_404`/`_get_reviewer_or_404`. Architektur-Regel: Services werfen `BibliogonError`-Subklassen, **NIE** `HTTPException`. | SOLID / Layering | Klein |
| 11 | `plugins/bibliogon-plugin-comics/bibliogon_comics/{bubbles,panels}.py`, `plugins/bibliogon-plugin-story-bible/bibliogon_story_bible/{entities,links}.py` | Geschäftslogik (DB-Queries, Positionsberechnung, Kapazitäts-/Cross-Page-Validierung, JSON-Serialisierung) liegt direkt in den `@router`-Handlern. Architektur-Regel: `routes.py` nur Routing, Logik in eigenen Modulen. | SOLID-S / Layering | Mittel |
| 12 | `backend/app/routers/settings.py:440` | `except Exception: pass` verschluckt Wildcard-Lizenz-Validierungsfehler ohne Kommentar/Log — still degradiert zu „keine gültige Lizenz". | Fehlerbehandlung | Klein |
| 13 | `frontend/src/components/RelationshipGraphView.tsx:177,194`; `frontend/src/components/SaveAsTemplateModal.tsx:100`; `frontend/src/components/SaveAsChapterTemplateModal.tsx:112` | Direkter `api.books.*`/`api.chapters.*`-Zugriff für Daten-CRUD (Graph-Layout-Persistenz, Template-Fetch) statt `getStorage()`. Maximal-Offline-Regel: Daten-CRUD über den Seam; offline gehen diese Schreib-/Lesepfade verloren bzw. werfen über `guardedFetch`. | SOLID-D / Seam | Klein |
| 14 | `plugins/bibliogon-plugin-export/.../routes.py:1102` (`_run_audiobook_job`, 246 Z.), `:858` (`export`, 138 Z.); `backend/app/routers/import_orchestrator.py:294` (`execute_import`, 168 Z.) | Router-/Job-Funktionen weit über 50 Zeilen mit if/try-Kaskaden — God-Method-Muster. | Komplexität | Mittel |
| 15 | `frontend/src/pages/ArticleEditor.tsx:245-313` (`persistMeta`, 66 Z.) | Dedup-Check per `JSON.stringify` + 15-Feld-Map + try/catch mit 3 Fehlerzweigen in einer Funktion. | Komplexität | Klein |

---

## Verbesserungsvorschläge (P2)

| # | Bereich | Vorschlag | Impact |
|---|---------|-----------|--------|
| 1 | Python-Docstrings | 351 von 1.158 öffentlichen Funktionen (**30%**) ohne Google-Style-Docstring (Regel: Docstrings für alle public functions). Schrittweise pro Modul nachziehen, beginnend bei `services/` und Plugin-Kernlogik. | Wartbarkeit |
| 2 | Python-Typhinweise | 63 öffentliche Funktionen ohne Return-Type-Hint (Regel: „Type hints ALWAYS"). | Wartbarkeit |
| 3 | Inline-Kommentare vs. Regel | ~3.200 `//`- und ~3.400 `#`-Inline-Kommentarzeilen, obwohl `code-hygiene.md` „keine Inline-Kommentare, nur Docstrings/TSDoc" vorschreibt. Es ist **kein** auskommentierter Code (gut) — überwiegend erklärende „Why"-Kommentare. Entweder Regel pragmatisch lockern (Why-Kommentare erlauben) oder grosse Why-Blöcke in Docstrings heben. Niedrige Priorität, aber Regel-Inkonsistenz dokumentieren. | Style / Konsistenz |
| 4 | Tailwind-first | ~52 `style={{…}}` mit thembaren Eigenschaften (background/color/border/padding) ausserhalb berechneter Werte → sollten Tailwind-Utilities oder `var(--token)` sein. | Style / Theming |
| 5 | Funktions-Länge (Backend, breit) | 153 Funktionen > 50 Zeilen. Viele PDF-Render-Pipelines (`picture_book_pdf.py`, `comic_book_pdf.py`) sind kohäsiv, aber `_image_layout_style` (194 Z.), `_speech_bubble_style` (179 Z.), `_render_comic_bubble` (182 Z.) wären in Teilschritte zerlegbar. | Wartbarkeit |
| 6 | ISP (Storage-Seam) | `DexieStorage` hat reine Stubs für backend-only Reads: `publications.list`/`articlePlatforms.list`/`editorPluginStatus.get` (leeres Resultat), `storyBible.autoDetect`/`continuityCheck` (leeres Array); `api-storage.ts` hat `comments.create` als werfenden Stub. Erwägen: diese aus dem breiten Interface in callseitige Fallbacks/optionale Sub-Interfaces ziehen. | SOLID-I |
| 7 | LSP (Storage-Seam) | `comments.create()` wirft in `ApiStorage` (api-storage.ts:128-130), liefert aber in `DexieStorage` ein `ArticleComment` — Aufrufer können das Create-Resultat nicht uniform annehmen. | SOLID-L |
| 8 | Repository-Abdeckung | Repository-Pattern deckt ~13 Entitäten ab (`books`, `chapters`, `articles`, `authors`, `comments`, `pages`, `publications`, `chapter_labels`, `templates`, …), aber Story-Bible/Comics/Writing-Sessions/Settings nutzen weiter das rohe `Session`-Idiom. Inkrementelle Migration laut Architektur ok — als offene Konsistenz-Aufgabe führen. | Wartbarkeit |
| 9 | Komponenten-Props (Bars) | `BookBulkActionBar` (7 Props), `ArticleList`-`TrashPanel` (7 Props), `Field`-Subkomponenten (6–7 Props) in `BookMetadataEditor`/`ArticleEditor`/`ArticleList` — Props in Objekt-/Config-Props bündeln. | SOLID / Lesbarkeit |
| 10 | `*.catch(() => {})` (Storyboard/ProseStoryboard) | ~20 leere `.catch(() => {})` auf Annotation-PATCH-Aufrufen in `Storyboard.tsx`/`ProseStoryboard.tsx`/`StoryEntityEditor.tsx`: optimistische UI-Updates ohne jeglichen Fehler-Hinweis. Mindestens ein dezenter Toast bei Fehlschlag der Persistierung. | Fehlerbehandlung |

---

## Metriken

**Dateien > 500 Zeilen** (auditierte Fläche)

| LOC | Datei |
|-----|-------|
| 5195 | `frontend/src/api/client.ts` (Client-Aggregat; viele TSDoc-Zeilen) |
| 2135 | `backend/app/schemas/__init__.py` |
| 1976 | `frontend/src/components/BookMetadataEditor.tsx` |
| 1918 | `frontend/src/storage/dexie-storage.ts` |
| 1887 | `plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py` |
| 1677 | `frontend/src/components/Editor.tsx` |
| 1651 | `frontend/src/pages/ArticleList.tsx` |
| 1636 | `frontend/src/pages/ArticleEditor.tsx` |
| 1622 | `frontend/src/components/import-wizard/steps/PreviewPanel.tsx` |
| 1619 | `plugins/bibliogon-plugin-export/bibliogon_export/routes.py` |
| 1526 | `backend/app/models/__init__.py` |
| 1336 | `frontend/src/components/articles/ConvertToBookWizard.tsx` |
| 1313 | `frontend/src/components/ComicBookEditor.tsx` |
| 1281 | `frontend/src/components/PageCanvas.tsx` |
| 1262 | `plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py` |
| 1194 | `frontend/src/pages/BookEditor.tsx` |
| 1141 | `frontend/src/components/CommentsAdminSection.tsx` |
| 1114 | `frontend/src/pages/Dashboard.tsx` |
| 1046 | `backend/app/main.py` |
| 1030 | `frontend/src/components/ChapterSidebar.tsx` |

(weitere 500–1000 Z.: `Storyboard.tsx`, `GitBackupPage.tsx`, `git_backup.py`, `audiobook.py`, `CollageCanvas.tsx` u. a.)

**Funktionen > 50 Zeilen (Python): 153.** Top:

| Zeilen | Ort |
|--------|-----|
| 270 | `…/audiobook/…/generator.py:283` `generate_audiobook` |
| 246 | `…/export/…/routes.py:1102` `_run_audiobook_job` |
| 222 | `…/medium-import/…/importer.py:369` `_import_one_post` |
| 194 | `…/export/…/picture_book_pdf.py:967` `_image_layout_style` |
| 185 | `backend/app/services/git_sync_diff.py:105` `apply_resolutions` |
| 182 | `…/comics/…/comic_book_pdf.py:763` `_render_comic_bubble` |
| 168 | `backend/app/routers/import_orchestrator.py:294` `execute_import` |
| 136 | `backend/app/routers/book_ai_fill.py:192` `fill_book_with_ai` |

(Frontend: u. a. `Editor.tsx:982` `handleAiReview` 81 Z., `ArticleEditor.tsx:245` `persistMeta` 66 Z., `Dashboard.tsx:218` / `ArticleList.tsx:260` Bulk-Delete je 72 Z.)

**Funktionen > 4 Parameter (Python): 77.** Top:

| Params | Ort |
|--------|-----|
| 14 | `generator.py:283` `generate_audiobook` |
| 12 | `importer.py:121` `import_zip` |
| 11 | `importer.py:369` `_import_one_post` |
| 9 | `comic_book_pdf.py:1208` `generate_comic_book_pdf` |
| 9 | `generator.py:167` `generate_chapter_audio` |
| 8 | `sanitizer.py:193` `sanitize`, `export/routes.py:858` `export`, `comic_book_pdf.py:496` `_rounded_rect_path` |

(Frontend: `Editor.tsx` Props-Interface 13 Props; diverse `Field`-/Bar-Subkomponenten 6–7 Props.)

**`any`-Verwendungen (TypeScript): 7 echte** (alle dokumentiert via `eslint-disable` + Begründung):

- `ai/llmClient.ts:185` `parseJson` Response (+ disable :184)
- `export/formatEpub.ts:15` `resolveEpubFn(mod)` (CJS/ESM-Interop)
- `export/formatPdf.ts:128,136` `resolveVfs` / `pdfMake` (vfs/CJS-Interop)
- `extensions/StyleCheckExtension.ts:96,108` TipTap `{tr, dispatch}` Command-Typen

**Fehlende Docstrings (Python public functions):** 351 / 1.158 (**30%**).
**Fehlende Return-Type-Hints (Python public functions):** 63.

**Direkte `api.*`-Zugriffe (Seam-Umgehung):** 4 echte CRUD-Umgehungen —
`RelationshipGraphView.tsx:177,194` (`api.books.update` Graph-Layout),
`SaveAsTemplateModal.tsx:100` (`api.books.get`),
`SaveAsChapterTemplateModal.tsx:112` (`api.chapters.get`).
Nicht gezählt (berechtigt): `OfflineBanner.tsx:41-42` (Reconnect-Flush ist
naturgemäss Online-Pfad), Snapshot-/Versions-API (nicht im Seam),
AI-Template-Erzeugung (kein Seam-Entity).

**Inline-Kommentar-Restbestände:** ~3.200 (TS) / ~3.400 (Python) erklärende
Inline-Kommentarzeilen vs. „nur Docstrings"-Regel. **Auskommentierter Code: 0.**
**TODO/FIXME/HACK: 0.**

---

## Refactoring-Beispiele (Top 3)

### 1. `BookEditor.tsx:206-276` — vier `_setShowX` → enum-getriebener View-State

**Vorher** (~70 Z. nahezu identischer `URLSearchParams`-Logik, vier mal):

```tsx
const _setShowMetadata = (show: boolean) => {
  setSearchParams((prev) => {
    const params = new URLSearchParams(prev);
    if (show) params.set("view", "metadata");
    else params.delete("view");
    return params;
  }, { replace: true });
};
const _setShowStoryboard = (show: boolean) => { /* dasselbe mit "storyboard" */ };
const _setShowOutline    = (show: boolean) => { /* dasselbe mit "outline" */ };
const _setShowRelationships = (show: boolean) => { /* dasselbe mit "relationships" */ };
```

**Nachher** (eine Quelle der Wahrheit; löst zugleich den Multi-Write-Clobber-Trap aus
`lessons-learned.md`, da nur ein `setSearchParams`-Aufruf pro Wechsel):

```tsx
type EditorView = "editor" | "metadata" | "storyboard" | "outline" | "relationships";

const setView = useCallback((view: EditorView) => {
  setSearchParams((prev) => {
    const params = new URLSearchParams(prev);
    if (view === "editor") params.delete("view");
    else params.set("view", view);
    return params;
  }, { replace: true });
}, [setSearchParams]);

const activeView: EditorView =
  (searchParams.get("view") as EditorView) ?? "editor";
```

---

### 2. `generator.py:283` — `generate_audiobook(…14 Params…)` → Config-Dataclass

**Vorher:**

```python
def generate_audiobook(
    book, chapters, engine, voice, speed, merge, output_dir,
    skip_chapter_types, overwrite_existing, elevenlabs_api_key,
    google_credentials, progress_callback, chapter_prefix, language,
):
    ...
```

**Nachher** (Projektregel „dataclass/TypedDict statt loser Parameter-Wolke"; jeder
Aufrufer baut eine geprüfte Konfiguration, die Funktion bleibt unter der 40-Zeilen-Marke,
indem sie pro Schritt an Helper delegiert):

```python
@dataclass(frozen=True)
class AudiobookJobConfig:
    engine: str
    voice: str
    speed: float = 1.0
    merge: MergeMode = MergeMode.SEPARATE
    skip_chapter_types: frozenset[str] = frozenset()
    overwrite_existing: bool = False
    chapter_prefix: bool = True
    language: str | None = None
    credentials: TtsCredentials | None = None

def generate_audiobook(
    book: Book,
    chapters: list[Chapter],
    config: AudiobookJobConfig,
    output_dir: Path,
    progress_callback: ProgressCallback | None = None,
) -> AudiobookResult:
    """Render an audiobook for `book` into `output_dir` per `config`."""
    plan = _build_chapter_plan(book, chapters, config)      # Schritt 1
    rendered = _render_chapters(plan, config, progress_callback)  # Schritt 2
    return _finalize(rendered, config, output_dir)          # Schritt 3
```

---

### 3. `Dashboard.tsx:218-290` ↔ `ArticleList.tsx:260-332` — geteilter Bulk-Delete-mit-Undo-Hook

**Vorher** (72 Z. dupliziert pro Seite — geordnete IDs, `bulkDelete`, optimistisches
`filter`, `notify.bulkAction` mit `bulkRestore`-Undo-Callback):

```tsx
// Dashboard.tsx
async function handleBulkBookDelete() {
  const ids = [...selection.selected];
  try {
    await api.books.bulkDelete(ids);
    setBooks((prev) => prev.filter((b) => !selection.selected.has(b.id)));
    selection.clear();
    notify.bulkAction(/* … 50+ Zeilen Undo-Callback mit Promise.all/restore … */);
  } catch (err) { notify.error(err); }
}
// ArticleList.tsx: identische Form mit api.articles.* + setArticles
```

**Nachher** (ein Hook, beide Seiten konsumieren ihn — schliesst zugleich die
Articles-vs-Books-Asymmetrie aus den `lessons-learned`):

```tsx
// hooks/useBulkDeleteWithUndo.ts
export function useBulkDeleteWithUndo<T extends { id: string }>(opts: {
  selection: SelectionApi;
  setItems: Dispatch<SetStateAction<T[]>>;
  bulkDelete: (ids: string[]) => Promise<void>;
  bulkRestore: (ids: string[]) => Promise<void>;
  labelKey: string;
}) {
  return useCallback(async () => {
    const ids = [...opts.selection.selected];
    if (!ids.length) return;
    try {
      await opts.bulkDelete(ids);
      opts.setItems((prev) => prev.filter((it) => !opts.selection.selected.has(it.id)));
      opts.selection.clear();
      notify.bulkAction(opts.labelKey, ids.length, () => opts.bulkRestore(ids));
    } catch (err) {
      notify.error(err);
    }
  }, [opts]);
}

// Dashboard.tsx
const handleBulkBookDelete = useBulkDeleteWithUndo({
  selection, setItems: setBooks,
  bulkDelete: api.books.bulkDelete, bulkRestore: api.books.bulkRestore,
  labelKey: "books.bulk_deleted",
});
// ArticleList.tsx: identischer Aufruf mit api.articles.*
```

---

## Questions and assumptions

- **P0 bewusst leer:** Der Audit fand keinen Datenverlust-/Korruptions-Defekt. Konservative
  Annahme: die zwei korrektheitsnächsten Befunde (still verschluckte Lizenz-Validierung
  `settings.py:440`; Seam-Umgehung bei Graph-Layout/Template-Schreibpfaden) sind als P1
  geführt, da sie keine persistente Nutzerdaten korrumpieren.
- **`reclassify.py` ist konform:** Der initiale Grep-Treffer „raise HTTPException" lag im
  Modul-Docstring (dokumentiert korrekt, dass *Router* werfen, *Services* nicht). Kein
  Service-Layer-Verstoss — aus der Liste entfernt. Einziger echter `*_service.py`-Verstoss:
  `publishing_state_service.py`.
- **`OfflineBanner.tsx:41-42` herabgestuft:** Der prüfende Agent markierte es als HIGH.
  Verifikation zeigt: es ist der Reconnect-Flush lokaler Recovery-Drafts zum Server —
  Online-Pfad per Definition; `getStorage()` wäre hier falsch. Kein echter Seam-Verstoss.
- **Inline-Kommentar-Zählung (~3.200/~3.400):** Heuristik über `^\s*//` bzw. `^\s*#`.
  Manuelle Stichprobe bestätigt: erklärende Prosa, **kein** auskommentierter Code. Die
  Regel-Inkonsistenz ist real, aber als Style (P2) eingestuft, nicht als Defekt.
- **i18n-Hardcoding:** grobe JSX-Text-Heuristik ergab 0 Treffer; die Heuristik ist schwach
  (deckt keine Attribut-/Variablen-Strings ab), daher als „Disziplin erscheint hoch" und
  nicht als verifizierte Vollabdeckung formuliert.
- **Plugin-Module mit gemischten Routes+Logik** (`comics/*.py`, `story-bible/*.py`): die
  Architektur erlaubt für noch nicht migrierte Entitäten weiter das `Session`-Idiom; die
  Trennung Route-vs-Logik ist dennoch nicht erfüllt — als P1-Strukturthema geführt, nicht
  als Blocker.
