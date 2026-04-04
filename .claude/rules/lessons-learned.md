# Bekannte Fallstricke und Patterns

Diese Regeln stammen aus realer Entwicklung und loesen Probleme die sonst wiederholt auftreten.

## TipTap Editor

### Speicherformat
- TipTap speichert als JSON. NICHT HTML, NICHT Markdown.
- TipTap kann KEIN Markdown rendern. Markdown muss vor der Speicherung zu HTML konvertiert werden.
- Beim Import: Markdown-Dateien mit Python `markdown` Library zu HTML konvertieren, dann als TipTap JSON speichern.
- Beim Wechsel WYSIWYG -> Markdown: JSON zu Markdown konvertieren (nodeToMarkdown).
- Beim Wechsel Markdown -> WYSIWYG: Markdown zu HTML konvertieren, dann zu JSON.

### Extensions
- StarterKit enthaelt KEINE Image-Extension. @tiptap/extension-image separat noetig.
- Figure/Figcaption: @pentestpad/tiptap-extension-figure nutzen, KEIN Custom-Code.
- Zeichenzaehlung: @tiptap/extension-character-count nutzen, KEIN Custom-Code.
- Aktuell 15 offizielle + 1 Community Extension installiert (siehe CLAUDE.md).
- Vor Custom-Code IMMER pruefen ob eine offizielle TipTap-Extension existiert.

### Peer Dependencies
- Community Extensions (@pentestpad/tiptap-extension-figure, tiptap-footnotes) koennen unbemerkt auf @tiptap/core v3 upgraden. Immer mit --save-exact pinnen.
- @pentestpad/tiptap-extension-figure: Pin auf 1.0.12 (letzte v2-kompatible), 1.1.0 erfordert @tiptap/core ^3.19.
- tiptap-footnotes: Pin auf 2.0.4 (letzte v2-kompatible), 3.0.x erfordert @tiptap/core ^3.0.
- npm ci in CI schlaegt fehl bei Peer-Dep-Konflikten. NICHT --legacy-peer-deps als Loesung verwenden.

### CSS
- TipTap rendert innerhalb von .ProseMirror. CSS-Selektoren muessen das beruecksichtigen.
- Spezifitaet: `.ProseMirror p.classname` statt `.tiptap-editor classname`.
- Alle Styles MUESSEN mit CSS Variables arbeiten (3 Themes x Light/Dark = 6 Varianten).

## Import (write-book-template)

### Markdown-zu-HTML
- IMMER Markdown zu HTML konvertieren beim Import. TipTap kann kein Markdown.
- Python `markdown` Library nutzen (bereits installiert).
- Einrueckung: write-book-template nutzt 2-Space-Indent fuer Listen, Python's markdown braucht 4-Space. Einrueckung vor Konvertierung verdoppeln.

### Kapiteltyp-Mapping
- acknowledgments gehoert in BACK-MATTER, nicht Front-Matter.
- TOC (toc.md) wird als eigener Kapiteltyp importiert (chapter_type: toc).
- next-in-series.md wird gemappt auf chapter_type: next_in_series.
- part-intro und interlude werden korrekt erkannt.

### Reihenfolge
- Section-Order aus export-settings.yaml lesen und fuer Kapitel-Positionierung nutzen.
- TOC muss als erstes in Front-Matter stehen.
- Fallback auf alphabetische Sortierung wenn keine export-settings.yaml existiert.

### Assets/Bilder
- Assets aus assets/-Ordner importieren und als DB-Assets speichern.
- Bild-Pfade von `assets/figures/...` zu `/api/books/{id}/assets/file/{filename}` umschreiben.
- Asset-Serving-Endpoint: GET /api/books/{id}/assets/file/{filename}

### Metadaten
- metadata.yaml parsen fuer: title, subtitle, author, language, series, series_index.
- ISBN/ASIN aus metadata.yaml extrahieren (isbn_ebook, isbn_paperback, isbn_hardcover, asin_ebook).
- description.html, backpage-description, backpage-author-bio, custom CSS importieren.
- series kann ein dict sein (name + index), nicht nur ein String. Beide Varianten handlen.
- language normalisieren (z.B. "german" -> "de").

## Export

### Ueberschriften
- Content kann bereits eine H1 enthalten. Vor dem Hinzufuegen einer H1 pruefen ob schon eine existiert.
- _prepend_title muss checken ob Content mit `#` oder `<h1` beginnt.

### TOC
- Wenn manuelles TOC-Kapitel existiert: use_manual_toc=true an manuscripta durchreichen.
- KEIN doppeltes TOC (generiert + manuell). Checkbox im Export-Dialog laesst User waehlen.
- Verschachtelte Listen im TOC: Baumstruktur mit 2-Space-Einrueckung pro Level beibehalten.

### Bilder im EPUB
- Assets muessen beim Scaffolding aus der DB in die Projektstruktur kopiert werden.
- API-Pfade (/api/books/.../assets/file/...) zurueck zu relatives Pfade (assets/figures/...) umschreiben.

### Pandoc/manuscripta
- manuscripta's OUTPUT_FILE ist ein Modul-Global. Muss direkt gesetzt werden, nicht ueber CLI.
- section_order aus dem scaffolded Projekt lesen, fehlende Dateien filtern.
- metadata.yaml braucht --- YAML-Delimiter fuer Pandoc.
- --- in Markdown (Horizontal Rules) zu *** konvertieren, sonst YAML-Parse-Konflikte.

### Dateinamen
- Buchtyp-Suffix im Dateinamen: title-ebook.epub, title-paperback.pdf.
- Setting type_suffix_in_filename (default: true).

## HTML-zu-Markdown Konvertierung

- KEIN Regex-basierter Konverter fuer verschachtelte HTML-Strukturen.
- HTMLParser-basierten Konverter nutzen der Verschachtelungstiefe trackt.
- Speziell fuer <ul>/<li>: Korrekte 2-Space-Einrueckung pro Level.

## Deployment

- Default-Port: 7880 (nicht 8080, zu oft belegt).
- /api/test/reset NUR im Debug-Modus (BIBLIOGON_DEBUG=true).
- CORS ueber BIBLIOGON_CORS_ORIGINS konfigurierbar (nicht hardcoded).
- SQLite-Pfad konfigurierbar mit Docker-Volume-Persistenz.
- BIBLIOGON_SECRET_KEY wird von start.sh automatisch generiert wenn nicht gesetzt.
- Non-Root User im Dockerfile.

## Lizenzierung

### license_tier Attribut
- PluginForge's BasePlugin ist ein externes PyPI-Paket - NICHT modifizieren. Stattdessen `license_tier` als Klassen-Attribut direkt auf den Plugin-Klassen setzen.
- `_check_license` in main.py liest `getattr(plugin, "license_tier", "core")` - Default ist "core" (abwaertskompatibel).

### Trial Keys
- Trial-Keys nutzen `plugin="*"` als Wildcard im Payload. `LicensePayload.matches_plugin()` muss `"*"` explizit als Match-All behandeln.
- Trial-Keys werden unter Key `"*"` in `licenses.json` gespeichert, nicht unter dem Plugin-Namen.
- Ablaufdatum: Immer `date.today()` (UTC) nutzen, nicht `datetime.now()`. `date.fromisoformat()` erwartet "YYYY-MM-DD" Format.
- `_check_license` muss sowohl per-Plugin-Key als auch Wildcard-Key pruefen (Fallback-Kette).

### Settings UI
- `discoveredPlugins` API liefert `license_tier` und `has_license` pro Plugin. Die Werte werden aus der Plugin-YAML (license-Feld) und dem LicenseStore/Validator abgeleitet.
- Premium-Plugins ohne Lizenz: "Lizenz eingeben" Button statt Toggle. Kein Enable/Disable moeglich.

## Allgemeine Patterns

- Vor Custom-Implementierungen: Pruefen ob eine Library/Extension das schon loest.
- Bei CSS-Problemen: Erst Spezifitaet pruefen (.ProseMirror Kontext).
- Bei Import-Problemen: Pruefen ob das Quellformat (Markdown) korrekt zu HTML konvertiert wird.
- Bei Export-Problemen: Pruefen ob HTML korrekt zurueck zu Markdown konvertiert wird.
- Roundtrip testen: Import -> Editor -> Export -> epubcheck.
