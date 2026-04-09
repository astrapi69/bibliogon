# API-Referenz

Alle Endpunkte der Bibliogon App. Wird bei API-Aenderungen oder neuen Endpunkten aktualisiert.

## Kern-API (backend/app/routers/)

### Books
- `GET /api/books` - Liste aller Buecher
- `POST /api/books` - Buch erstellen
- `GET /api/books/{id}` - Buch abrufen
- `PATCH /api/books/{id}` - Buch aktualisieren
- `DELETE /api/books/{id}` - Buch loeschen (Soft-Delete)

### Papierkorb
- `GET /api/books/trash/list` - Geloeschte Buecher
- `POST /api/books/trash/{id}/restore` - Wiederherstellen
- `DELETE /api/books/trash/{id}` - Endgueltig loeschen
- `DELETE /api/books/trash/empty` - Papierkorb leeren

### Chapters
- `GET /api/books/{id}/chapters` - Kapitel-Liste
- `POST /api/books/{id}/chapters` - Kapitel erstellen
- `GET /api/books/{id}/chapters/{cid}` - Kapitel abrufen
- `PATCH /api/books/{id}/chapters/{cid}` - Kapitel aktualisieren
- `DELETE /api/books/{id}/chapters/{cid}` - Kapitel loeschen
- `PUT /api/books/{id}/chapters/reorder` - Kapitel neu sortieren

### Assets
- `GET /api/books/{id}/assets` - Asset-Liste
- `POST /api/books/{id}/assets` - Asset hochladen
- `DELETE /api/books/{id}/assets/{aid}` - Asset loeschen

### Backup/Import
- `GET /api/backup/export` - Full-Data Backup (.bgb)
- `POST /api/backup/smart-import` - Intelligenter Import (.bgb, .bgp, .zip)
- `POST /api/backup/import` - Backup Import
- `POST /api/backup/import-project` - write-book-template Projekt Import

### Lizenzen
- `GET /api/licenses` - Lizenzen auflisten
- `POST /api/licenses` - Lizenz aktivieren
- `DELETE /api/licenses/{plugin}` - Lizenz deaktivieren

### Settings
- `GET /api/settings/app` - App-Settings
- `PATCH /api/settings/app` - App-Settings aendern
- `GET /api/settings/plugins` - Plugin-Settings
- `GET /api/settings/plugins/{name}` - Plugin-Config
- `PATCH /api/settings/plugins/{name}` - Plugin-Config aendern
- `POST /api/settings/plugins/{name}/enable` - Plugin aktivieren
- `POST /api/settings/plugins/{name}/disable` - Plugin deaktivieren

### Plugin-System
- `GET /api/plugins/manifests` - Frontend-Manifests aller Plugins
- `POST /api/plugins/install` - Plugin ZIP installieren
- `DELETE /api/plugins/install/{name}` - Plugin deinstallieren
- `GET /api/plugins/installed` - Installierte Plugins
- `GET /api/plugins/health` - Health-Check aller Plugins
- `GET /api/plugins/errors` - Load-Errors

### System
- `GET /api/i18n/{lang}` - i18n-Strings fuer Sprache
- `GET /api/health` - App Health-Check

## Plugin-Routen

### Export (plugin-export)
- `GET /api/books/{id}/export/{fmt}` - Export (epub, pdf, docx, html, markdown, project)
  - Query: `book_type`, `toc_depth`, `use_manual_toc`

### Kinderbuch (plugin-kinderbuch)
- `GET /api/kinderbuch/templates`
- `POST /api/kinderbuch/preview`

### KDP (plugin-kdp)
- `POST /api/kdp/metadata`
- `POST /api/kdp/validate-cover`
- `GET /api/kdp/categories`

### Grammar (plugin-grammar)
- `POST /api/grammar/check`
- `GET /api/grammar/languages`

### Help (plugin-help)
- `GET /api/help/shortcuts`
- `GET /api/help/faq`
- `GET /api/help/about`

### Get Started (plugin-getstarted)
- `GET /api/get-started/guide`
- `GET /api/get-started/sample-book`

### Manuscript Tools (plugin-ms-tools)
- `POST /api/ms-tools/check` - Style-Checks
- `POST /api/ms-tools/sanitize` - Sanitization
- `POST /api/ms-tools/readability` - Lesbarkeits-Metriken
- `GET /api/ms-tools/languages`

### Audiobook (plugin-audiobook)
- `POST /api/audiobook/generate` - Audiobook erstellen
- `GET /api/audiobook/engines` - Verfuegbare TTS-Engines
- `GET /api/audiobook/languages`
- `GET /api/audiobook/voices`
- `GET /api/audiobook/status` - Job-Status
- `POST /api/audiobook/preview` - Vorhoer-Sample

### Translation (plugin-translation)
- `POST /api/translation/translate` - Text uebersetzen
- `POST /api/translation/translate-book` - Buch uebersetzen
- `GET /api/translation/languages`
- `GET /api/translation/providers` - DeepL, LMStudio
- `GET /api/translation/health`
