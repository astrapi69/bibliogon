# Aus einem Medium-Archiv importieren

Bibliogon importiert ein Medium-HTML-Archiv und erzeugt pro
Beitrag einen **Artikel**, einen **Publication**-Eintrag und
einen Provenienz-Datensatz.

## Schritt 1 - Archiv von Medium holen

1. Bei [medium.com](https://medium.com) anmelden.
2. **Einstellungen** → **Konto** → **Lade deine Informationen
   herunter** öffnen.
3. **ZIP herunterladen** anklicken. Medium schickt innerhalb
   weniger Minuten eine E-Mail mit dem Download-Link.
4. ZIP lokal speichern. **Nicht** entpacken.

## Schritt 2 - Backend prüfen

Das Plugin läuft im Backend. Vor dem Import sicherstellen, dass
das Backend sauber gestartet ist. Diese Log-Zeilen müssen
erscheinen:

```
INFO  app.main: Plugin discovery: 11 entry points found via 'bibliogon.plugins' group: ..., medium-import, ...
INFO  app.main: Plugins enabled in config (11): ..., medium-import
INFO  app.main: Plugins loaded (11/11 enabled): ..., medium-import, ...
```

Wenn die dritte Zeile weniger geladene Plugins zeigt als die
zweite, oder ein `WARNING: Plugins enabled in config but not
loaded` erscheint, siehe **Fehlersuche** unten.

## Schritt 3 - Import starten

Die Bulk-Import-API nimmt einen einzelnen `multipart/form-data`
POST entgegen. Eine in der App eingebettete UI ist für v2 geplant
(Backlog-Eintrag `MEDIUM-IMPORT-V2-01`); bis dahin per Shell mit
`curl`:

```bash
curl -X POST http://localhost:7880/api/medium-import/import \
  -F "file=@medium-export.zip" \
  | jq .
```

`localhost:7880` durch deine Bibliogon-URL ersetzen. Antwort als
JSON-Zusammenfassung:

```json
{
  "imported_count": 207,
  "skipped_count": 1,
  "errored_count": 1,
  "imported": [
    { "id": "abc123", "title": "Migrate a maven project to Gradle",
      "canonical_url": "https://medium.com/@.../...",
      "warnings": [] },
    ...
  ],
  "skipped": [
    { "filename": "2024-...", "canonical_url": "...",
      "existing_article_id": "..." }
  ],
  "errored": [
    { "filename": "2025-...html", "error": "post has no canonical URL; cannot dedup or track" }
  ]
}
```

Der Import läuft sequenziell; bei 200 Beiträgen sind es einige
Minuten, weil die Bilder heruntergeladen werden.

## Was wird importiert

| Feld | Quelle |
|---|---|
| `title` | `<h1 class="p-name">` |
| `subtitle` | `<section data-field="subtitle">` |
| `author` | `<a class="p-author">` |
| `published_at` | `<time class="dt-published">` `datetime` |
| `canonical_url` | `<a class="p-canonical">` `href` |
| `content_json` (TipTap) | aus `<section data-field="body">` extrahiert |
| Bilder | jede `<figure>` wird lokal als `ArticleAsset` abgelegt |
| Provenienz | `ArticleImportSource` mit `source_type=medium`, `format_name=medium_html_export` |
| Status | `published` (Medium-Beiträge sind per Definition veröffentlicht) |
| Sprache | Standard `en` (pro Artikel im Editor anpassbar) |
| Tags | leere Liste (Medium liefert sie im HTML-Export nicht mit) |

## Was NICHT importiert wird

| Fehlt | Grund |
|---|---|
| Tags | Im HTML-Export von Medium nicht enthalten |
| Entwürfe | Nur veröffentlichte Beiträge sind im Export |
| Lesedauer / Claps / Antwortzahl | Plattform-Metriken, kein Inhalt |
| Publikation-Name (bei Medium-Publications) | Nicht im HTML; nur in der Canonical-URL kodiert |

## Schritt 4 - Nach dem Import

Die importierten Artikel erscheinen wie alle anderen im
Dashboard. Typische Folgeaufgaben:

- **Unerwünschte Artikel archivieren.** Im Dashboard auswählen
  und **In den Papierkorb** verschieben. Alte / verlassene
  Beiträge, die nicht in Bibliogon bleiben sollen, hier
  aussortieren.
- **Tags ergänzen.** Medium liefert sie nicht; pro Artikel im
  Editor nachtragen.
- **Sprache anpassen.** Nicht-englische Artikel im
  Metadaten-Panel des Editors umstellen.
- **Cross-Posts prüfen.** Der Publication-Eintrag verfolgt die
  Medium-URL. Bei späterer Veröffentlichung auf Substack oder
  einem eigenen Blog dort eine zweite Publication anlegen.

## Re-Import-Sicherheit

- Artikel, deren Canonical-URL bereits zu einem bestehenden
  Bibliogon-Artikel gehört, werden beim zweiten Lauf
  **übersprungen**. Die Zusammenfassung listet jeden
  übersprungenen Beitrag mit der ID des bestehenden Artikels.
- Artikel im Papierkorb gelten weiterhin als „existierend" für
  die Dedup-Prüfung - ein gelöschter importierter Artikel bleibt
  beim erneuten Import im Papierkorb und wird als skipped
  gemeldet.
- Pro-Beitrag-Fehler landen in der `errored`-Liste der Antwort,
  brechen aber **nicht** den Batch ab.

## Fehlersuche

### „Plugin enabled in config but not loaded"

Die Startup-Logs zeigen eine WARNING mit genau diesem Wortlaut
plus dem Rebuild-Hinweis. Ursache: Das Plugin ist in
`backend/config/app.yaml` unter `plugins.enabled` eingetragen,
aber sein Paket ist im laufenden Python-Environment nicht
installiert. Lösung:

- **Docker**: Image neu bauen (`docker compose build`, dann
  `docker compose up`). Ein `docker compose restart` verwendet
  das alte Image und nimmt neue Path-Deps nicht auf.
- **`make dev`** (lokales Poetry-Venv): `poetry install` in
  `backend/` ausführen, damit der Editable-Install des
  Path-Deps aktualisiert wird.

### Jeder Endpoint liefert HTTP 502

Der Backend-Prozess läuft nicht. Das Frontend erreicht den
Proxy, aber der Proxy kann das Backend nicht erreichen.
Backend-Logs prüfen (`docker logs <backend-container>
--tail 200`) oder im `make dev`-Terminal nach dem Traceback
suchen.

### „Config file not found, using empty defaults"

Eine einzelne DEBUG-Zeile beim Start nennt das fehlende YAML.
Das Plugin lädt trotzdem, aber seine sichtbaren Einstellungen
(Bild-Download, Default-Status etc.) werden stillschweigend durch
In-Code-Defaults ersetzt. Lösung: Die Datei muss unter
`backend/config/plugins/{plugin_slug}.yaml` liegen, nicht im
Plugin-eigenen Verzeichnis.

### Ein bestimmter Beitrag scheitert beim Import

Im `errored`-Block der Antwort den Quell-Dateinamen und die
Fehlermeldung nachschlagen. Häufigste Ursache: „post has no
canonical URL" - das HTML hat keinen
`<a class="p-canonical">`-Link, was bei sehr alten Medium-Posts
selten vorkommen kann.

## Einschränkungen (v1)

- Sequenzielle Verarbeitung. Bei 200 Beiträgen dauert es einige
  Minuten, während die Bilder heruntergeladen werden.
- Bild-Download-Fehler werden auf Bild-Ebene stumm behandelt
  (im `conversion_warnings`-Feld der Provenienz festgehalten,
  nicht in der Response-Zusammenfassung sichtbar).
- Keine selektive Import-UI. Alles importieren, dann archivieren
  was nicht behalten werden soll. Die Dry-Run-Vorschau kommt
  in v2.
- Keine KI-gestützte Tag-Inferenz. Tags bleiben standardmäßig
  leer; auf der v2-Roadmap.
