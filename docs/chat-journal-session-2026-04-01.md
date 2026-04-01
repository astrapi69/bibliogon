# Chat-Journal: Bibliogon Session 2026-04-01

Dokumentation aller Prompts, Optimierungsvorschlaege und Ergebnisse.

---

## 1. Naechste Schritte nach Kontext-Komprimierung

- 🔹 **Original-Prompt:** "was ist der naechste Schritt?"
- 🔸 **Optimierter Prompt:** "Wir haben gerade Plugin-UI-Strategie (Manifest-driven + Web Components) besprochen und die ZIP-Installation ist bestaetigt. Liste die offenen Aufgaben priorisiert auf: Plugin-System, Radix-Migrationen, sonstige."
- 🎯 Ueberblick nach Kontext-Komprimierung bekommen
- 💡 Session-Fortsetzung nach /compact
- ✅ Auflistung: Plugin-ZIP + UI-Manifest, dann 7 Radix-Migrationen

---

## 2. Plugin-System und Radix-Migrationen starten

- 🔹 **Original-Prompt:** "zuerst das mit den plugin und dann die 7 Radix-Migrationen"
- 🔸 **Optimierter Prompt:** "Implementiere in dieser Reihenfolge: 1) Plugin-ZIP-Installation (Backend: Upload, Validierung, dynamisches Laden; Frontend: Upload-Button in Settings). 2) Plugin-UI-Manifest-System dokumentieren. 3) Alle 7 Radix-Migrationen (ExportDialog, CreateBookModal, ChapterSidebar DnD, OrderedListEditor, Kapiteltyp-Dropdown, Theme/Sprache Select, Tooltips). Dokumentiere alles in CLAUDE.md, CONCEPT.md und help.yaml."
- 🎯 Komplett-Implementierung Plugin-System + UI-Modernisierung
- 💡 13 Aufgaben insgesamt
- ✅ Alles implementiert, 13/13 Aufgaben erledigt, Commit c463300

---

## 3. Commit anfordern

- 🔹 **Original-Prompt:** "Wir koennen das commiten gib mir ein git message"
- 🔸 **Optimierter Prompt:** "Committe alle Aenderungen mit einer konventionellen Commit-Message (feat/fix). Fasse die Hauptaenderungen zusammen: Plugin-ZIP-Installation, Radix-Migrationen, Dokumentation."
- 🎯 Sauberer Commit mit aussagekraeftiger Message
- ✅ Commit c463300: "feat: add plugin ZIP installation and complete Radix UI migration"

---

## 4. Deploybare Version - was fehlt?

- 🔹 **Original-Prompt:** "ich moechte mal eine erste deploybare version haben. Was fehlt uns noch damit wir das machen und das ein Autor mit unserer App gleich loslegen kann?"
- 🔸 **Optimierter Prompt:** "Analysiere die Deployment-Readiness der App aus Autorenperspektive. Pruefe: Docker-Config (Dockerfile, docker-compose.prod.yml), Umgebungsvariablen (CORS, Secrets, Debug), Datenbank-Persistenz, Sicherheit (Test-Endpoints, Non-Root), Health-Checks. Liste kritische Blocker vs. Nice-to-have."
- 🎯 Produktionsreife Assessment
- 💡 App soll fuer echte Autoren nutzbar sein
- ✅ 4 kritische Blocker identifiziert: CORS hardcoded, Test-Endpoint offen, DB-Persistenz, keine .env

---

## 5. Kritische Deployment-Fixes

- 🔹 **Original-Prompt:** "ja bitte fixen"
- 🔸 **Optimierter Prompt:** "Fixe die 4 kritischen Deployment-Blocker: 1) CORS ueber Umgebungsvariable BIBLIOGON_CORS_ORIGINS konfigurierbar. 2) /api/test/reset nur im Debug-Modus. 3) SQLite-Pfad konfigurierbar mit Docker-Volume-Persistenz. 4) .env.example erstellen, .env in .gitignore. Zusaetzlich: Non-Root User im Dockerfile, Health-Checks in docker-compose.prod.yml."
- 🎯 Produktionshärtung
- ✅ Commit 2a8a41d: "feat: production hardening for first deployable release"

---

## 6. Startup-Script und GitHub-Release

- 🔹 **Original-Prompt:** "ja bitte Startup-Script erstellen und dann pushen usw"
- 🔸 **Optimierter Prompt:** "Erstelle ein start.sh Script das: Docker prueft, .env mit generiertem Secret anlegt, Docker-Images baut und startet. Dazu stop.sh. Schreibe die README.md komplett neu mit Quickstart, Features, Architektur, Konfiguration. Pushe alles und erstelle ein GitHub Release v0.7.0 mit Release Notes."
- 🎯 One-Click Deployment fuer Endnutzer
- ✅ start.sh, stop.sh, README.md neu, Tag v0.7.0 gepusht

---

## 7. Installer-Script (One-Liner)

- 🔹 **Original-Prompt:** "nein ich wollte eine deploybare datei die das macht"
- 🔸 **Optimierter Prompt:** "Erstelle ein install.sh Script das als One-Liner via curl ausfuehrbar ist: `curl -fsSL .../install.sh | bash`. Das Script soll: Bibliogon nach ~/bibliogon herunterladen (git clone oder Tarball-Fallback), .env konfigurieren, Docker-Images bauen und starten. Unterstuetze Updates bei erneutem Ausfuehren."
- 🎯 Einzelne ausfuehrbare Datei fuer Installation
- 💡 Nutzer soll ohne git clone auskommen
- ✅ install.sh erstellt, README mit One-Liner aktualisiert

---

## 8. Port-Aenderung

- 🔹 **Original-Prompt:** "ja sehr gut aber 8080 ist meistens belegt, machen wir ein port der sicher nicht belegt ist"
- 🔸 **Optimierter Prompt:** "Aendere den Default-Port von 8080 auf einen selten genutzten Port (z.B. 7880) in allen Dateien: .env.example, docker-compose.prod.yml, install.sh, start.sh, CLAUDE.md, README.md."
- 🎯 Port-Konflikte vermeiden
- ✅ Port 7880 in allen 6 Dateien geaendert, Commit 5f98741

---

## 9. gh CLI Release erstellen

- 🔹 **Original-Prompt:** "ich hab jetzt gh installiert, versuch es mal"
- 🔸 **Optimierter Prompt:** "Erstelle ein GitHub Release v0.7.0 mit gh CLI: Titel 'First Deployable Release', Release Notes mit Install-Anleitung, Features, Production Hardening. Nutze --notes-file fuer laengere Beschreibung."
- 🎯 Offizielles GitHub Release
- 💡 gh war vorher nicht installiert, jetzt schon
- ✅ Release erstellt (nach gh auth login)

---

## 10. write-book-template Import fixen

- 🔹 **Original-Prompt:** "Nein erst sollte der import von ein existierendes write-book-template buch projekt klappen"
- 🔸 **Optimierter Prompt:** "Teste den Import von /media/.../Die-Geister-der-Zeit mit dem echten Buchprojekt. Analysiere die metadata.yaml, export-settings.yaml, chapter-Dateien und assets. Fixe: Kapiteltyp-Erkennung (part-intro, interludium), fehlende Front/Back-Matter-Mappings, ISBN/ASIN-Parsing, Config-Dateien-Import (description.html, backpage, CSS). Schreibe Tests."
- 🎯 Echter Buchprojekt-Import muss funktionieren
- 💡 Das echte Buchprojekt hat andere Strukturen als erwartet
- ✅ 27 Kapitel importiert, alle Metadaten korrekt. Commit 4090198

---

## 11. TOC nicht importieren

- 🔹 **Original-Prompt:** "ich sehe das beim import die toc in den chapters auftaucht"
- 🔸 **Optimierter Prompt:** "Das TOC (toc.md) wird als normales Kapitel importiert. Es soll gar nicht importiert werden, da die App das Inhaltsverzeichnis beim Export automatisch generiert. Entferne toc aus dem Import. Teste auch mit dem zweiten Buchprojekt eternity-ebook.zip."
- 🎯 Kein unnuetzes TOC-Kapitel im Import
- ✅ TOC aus Import entfernt, next-in-series.md gemappt. Commit fdb2187

---

## 12. TOC als eigener Kapiteltyp

- 🔹 **Original-Prompt:** "Der Anwender sollte ein toc importieren koennen wenn eins schon existiert und auch wenn eins generiert wird sollte er in der lage sein es zu editieren und pruefen ob die links noch funktionieren"
- 🔸 **Optimierter Prompt:** "Fuege einen neuen Kapiteltyp 'toc' (Table of Contents) hinzu. TOC soll: 1) Beim Import aus toc.md importiert werden. 2) Im Editor editierbar sein. 3) Einen 'TOC pruefen' Button haben der alle Anker-Links gegen Kapitel-Titel und Unterueberschriften validiert. Implementiere: Neuer ChapterType, Import-Mapping, Validierungs-Endpoint POST /api/books/{id}/chapters/validate-toc, Button in Sidebar."
- 🎯 Manuelles TOC mit Link-Validierung
- ✅ 95 Links validiert, 0 broken (1 echter Fehler gefunden). Commit 6fa75f9

---

## 13. Markdown-zu-HTML beim Import

- 🔹 **Original-Prompt:** "ich sehe das beim import die acknowledgment in den front matter hinzugefuegt wurde... und es werden wieder md zeichen sichtbar angezeigt"
- 🔸 **Optimierter Prompt:** "Drei Probleme: 1) acknowledgments faelschlicherweise in Front-Matter (gehoert in Back-Matter). 2) Editor zeigt rohe Markdown-Zeichen (#, *, -) statt formatiertem Text - der Import speichert Markdown, aber TipTap erwartet HTML. 3) Bilder werden nicht importiert. Fixe: acknowledgments-Mapping, markdown-Library installieren fuer MD->HTML-Konvertierung beim Import, Asset-Import aus assets/-Ordner."
- 🎯 Korrektes Rendering im Editor nach Import
- 💡 TipTap kann kein Markdown, nur HTML oder JSON
- ✅ markdown-Library installiert, HTML-Konvertierung, 8 Assets importiert. Mehrere Commits

---

## 14. Section-Order aus export-settings.yaml

- 🔹 **Original-Prompt:** "ich sehe das beim import die acknowledgment immer noch in den front matter hinzugefuegt wurde die gehoert in back-matter... dann ist die reihenfolge im front matter nicht richtig toc sollte als erstes kommen"
- 🔸 **Optimierter Prompt:** "Der Import ignoriert die Reihenfolge aus export-settings.yaml. Fixe: 1) Lese export-settings.yaml und nutze section_order fuer die Kapitel-Positionierung. 2) TOC als erstes in Front-Matter. 3) acknowledgments nur in Back-Matter (aus _FRONT_MATTER_MAP entfernen). 4) Fallback auf alphabetische Sortierung wenn keine export-settings.yaml existiert."
- 🎯 Import-Reihenfolge exakt wie vom Autor definiert
- ✅ Reihenfolge stimmt exakt mit export-settings.yaml. Commit 94d48c1

---

## 15. Bilder im Editor und EPUB

- 🔹 **Original-Prompt:** "Die Bilder sind nicht sichtbar"
- 🔸 **Optimierter Prompt:** "TipTap zeigt keine Bilder weil @tiptap/extension-image fehlt. Installiere es (v2-kompatibel zu bestehendem @tiptap/core 2.27). Dazu: Image-Pfade beim Import von assets/... zu /api/books/{id}/assets/file/{name} umschreiben. Asset-Serving-Endpoint hinzufuegen (GET /api/books/{id}/assets/file/{filename})."
- 🎯 Bilder sichtbar im Editor
- 💡 StarterKit enthaelt keine Image-Extension
- ✅ @tiptap/extension-image@2.27.2 installiert, Asset-Serving-Endpoint, Pfad-Rewriting. Commits 6823395, 7959c9b

---

## 16. EPUB Export Bilder + Buchtyp im Dateinamen

- 🔹 **Original-Prompt:** "im editor werden die Bilder angezeigt. Aber wenn ich exportiere werden die Bilder im epub nicht angezeigt ausserdem werden jetzt zwei tocs exportiert... was noch fehlt ist das... der typ des buches in dem dateinamen ist"
- 🔸 **Optimierter Prompt:** "Drei Export-Probleme: 1) Bilder fehlen im EPUB - beim Scaffolding Assets aus DB in Projekt kopieren und /api/...-Pfade zurueck zu assets/figures/... umschreiben. 2) Doppeltes TOC - wenn manuelles TOC existiert, use_manual_toc an manuscripta durchreichen. 3) Buchtyp im Dateinamen: title-ebook.epub, title-paperback.pdf. Neue Setting type_suffix_in_filename (default: true)."
- 🎯 Vollstaendiger EPUB-Export mit Bildern
- ✅ Assets kopiert, Pfade umgeschrieben, use_manual_toc, Buchtyp-Suffix. Commit c2f20dc

---

## 17. Export-Dialog: TOC Checkbox

- 🔹 **Original-Prompt:** "bei den export dialog sollte eine checkbox sein bei dem ausgewaehlt werden kann ob das inhaltverzeichnis generiert werden kann oder ob das was existiert genommen wird... Schreib noch ein test das alles verifiziert"
- 🔸 **Optimierter Prompt:** "Fuege eine Checkbox 'Manuelles Inhaltsverzeichnis verwenden' im Export-Dialog hinzu. Auto-erkannt wenn TOC-Kapitel existiert, User kann umschalten. Reiche use_manual_toc als Query-Parameter an den Export-Endpoint und von dort an manuscripta's compile_book() durch. Schreibe 16+ Tests die verifizieren: TOC-Import, -Validierung, Section-Order, Acknowledgments-Platzierung, Kapiteltyp-Erkennung, Asset-Import, Image-Rewriting, File-Serving, MD-zu-HTML, ISBN/ASIN-Parsing."
- 🎯 Kein doppeltes TOC + umfassende Tests
- ✅ Checkbox im Dialog, 16 neue Tests (26 total). Commit b7420d9

---

## 18. Doppelte H1-Ueberschriften im Export

- 🔹 **Original-Prompt:** "Beim export werden jetzt zwei header angezeigt z.B.: Foreword eine seite inhalt leer und dann folgt der echte Foreword mit inhalt."
- 🔸 **Optimierter Prompt:** "Der Export-Scaffolder fuegt eine H1-Ueberschrift hinzu, aber der Content enthaelt bereits eine (seit wir _remove_first_heading entfernt haben). Fixe: _prepend_title soll pruefen ob der Content bereits mit # oder <h1 beginnt. Dazu: _content_to_markdown muss HTML zurueck zu Markdown konvertieren (aktuell wird HTML as-is durchgereicht)."
- 🎯 Keine doppelten Ueberschriften
- ✅ HTMLParser-basierter Konverter, Heading-Duplikat-Check. Commits 3ebe3dd, 10403de

---

## 19. Pandoc Export-Fehler (leerer Dateiname, YAML-Parse)

- 🔹 **Original-Prompt:** "sorry aber: ... --output=./output/.epub ... returned non-zero exit status 64"
- 🔸 **Optimierter Prompt:** "Pandoc-Export scheitert mit leerem Dateinamen (--output=./output/.epub). Ursache: manuscripta's OUTPUT_FILE ist ein Modul-Global das vom CLI gesetzt wird, nicht von compile_book(). Der pandoc_runner muss: 1) OUTPUT_FILE direkt setzen aus export-settings.yaml. 2) section_order aus dem scaffolded Projekt lesen. 3) Fehlende Dateien aus section_order filtern. Dazu: metadata.yaml braucht --- YAML-Delimiter fuer Pandoc. Und --- in Markdown (Horizontal Rules) muss zu *** werden um YAML-Parse-Konflikte zu vermeiden."
- 🎯 Funktionierender EPUB-Export
- 💡 Mehrere verschachtelte Probleme: leerer Filename, YAML-Parse, fehlende Dateien
- ✅ 8.2MB EPUB exportiert. Commits a9f5940, c09d01a

---

## 20. TOC und Imprint Darstellung

- 🔹 **Original-Prompt:** "das toc und imprint wird nicht richtig angezeigt. beim imprint werden die zeilenumbrueche nicht gezeigt... beim toc sieht es aehnlich"
- 🔸 **Optimierter Prompt:** "Zwei Darstellungsprobleme: 1) TOC: Verschachtelte Listen werden flach dargestellt - Python's markdown-Library braucht 4-Space-Indent, write-book-template nutzt 2-Space. Verdopple die Einrueckung vor der Konvertierung. 2) Imprint: Zeilenumbrueche (zwei Leerzeichen am Zeilenende = Hard Break) werden korrekt als <br> konvertiert, aber TipTap braucht @tiptap/extension-link fuer <a>-Tags. Installiere es."
- 🎯 Korrekte Darstellung von verschachtelten Listen und Zeilenumbruechen
- ✅ Verschachtelte TOC-Listen, @tiptap/extension-link installiert. Commit 0b04a39

---

## 21. TOC Baumstruktur im Export

- 🔹 **Original-Prompt:** "die toc hat eine baumstruktur mit einrueckungen die werden beim export platt gemacht"
- 🔸 **Optimierter Prompt:** "Der HTML-zu-Markdown Konverter (Regex-basiert) kann verschachtelte <ul>/<li> nicht korrekt verarbeiten. Ersetze den Regex-Ansatz durch einen HTMLParser-basierten Konverter der die Verschachtelungstiefe trackt und korrekte 2-Space-Einrueckung pro Level erzeugt."
- 🎯 TOC-Baumstruktur bleibt beim Export erhalten
- ✅ HTMLParser-basierter Konverter mit korrekter Einrueckung. Commit ef0efb7

---

## 22. Figure/Figcaption Handling

- 🔹 **Original-Prompt:** "bei den images wird der alt geschrieben das war nicht so und soll nicht so sein. die figcaption wird als code font... angezeigt. in styles.css wird das definiert gleicher font aber cursiv"
- 🔸 **Optimierter Prompt:** "Drei Bild-Probleme: 1) alt-Text wird als sichtbarer Text angezeigt - <figure> Tags muessen aufgeloest werden da TipTap sie nicht kennt. 2) figcaption wird in Monospace statt Body-Font kursiv gezeigt - CSS fuer figcaption hinzufuegen. 3) Im Export muss <figure><figcaption> wiederhergestellt werden. Implementiere: Import transformiert <figure><img><figcaption> zu <img> + <p class='figcaption'>. Export stellt <figure> wieder her. CSS: body-font, italic, 1px kleiner, zentriert."
- 🎯 Bilder korrekt im Editor, figcaption gestylt
- ✅ Import/Export-Transformation, CSS-Styling. Commit 34bc886

---

## 23. Figcaption Italic-Styling

- 🔹 **Original-Prompt:** "die figcaption ist immer noch nicht kursiv und die groesse ist auch falsch ich glaube ein oder 2 pixel kleiner mach 1 pixel"
- 🔸 **Optimierter Prompt:** "Das CSS .tiptap-editor figcaption greift nicht weil TipTap <p class='figcaption'> rendert, nicht <figcaption>. Erhoehe die CSS-Spezifitaet mit .ProseMirror p.figcaption und nutze !important fuer font-style: italic. Schriftgroesse: calc(1em - 1px)."
- 🎯 Kursive Darstellung der Bildunterschrift
- ✅ Hoehere CSS-Spezifitaet. Commit e2bf84b

---

## 24. Custom Figcaption Node + Markdown-Modus Bilder

- 🔹 **Original-Prompt:** "geht immer noch nicht und mir ist aufgefallen wenn ich auf markdown wechsle verschwindet das Bild. Das sollte alles nicht sein bitte mit unit tests verifizieren."
- 🔸 **Optimierter Prompt:** "Drei Probleme: 1) Figcaption-CSS greift nicht - erstelle eine Custom TipTap Extension die als <figcaption> Element rendert (nicht <p>), damit CSS direkt auf das Element greift. 2) Bilder verschwinden im Markdown-Modus - nodeToMarkdown fehlt Handler fuer 'image' und 'figcaption' Nodes; markdownToHtml fehlt ![alt](src) Parsing. 3) Schreibe 4 Unit-Tests: figcaption als Klasse gespeichert, figure ohne caption, alt-Text nicht sichtbar, figcaption Export-Roundtrip."
- 🎯 Zuverlaessiges Bild/Caption-Handling mit Tests
- 💡 CSS-Spezifitaet reicht nicht - braucht Custom Node
- ✅ Figcaption Extension, Markdown-Modus Bilder, 4 neue Tests (30 total). Commit 0a2b98b

---

## 25. Bestehende TipTap Extensions nutzen

- 🔹 **Original-Prompt:** "gibt es da keine extension von tiptap? oder welche tiptap extensions sind fuer uns sinnvoll? Nicht alles selber implementieren wenn andere schon das anbieten"
- 🔸 **Optimierter Prompt:** "Recherchiere welche offiziellen und Community TipTap-Extensions fuer eine Buchautoren-Plattform sinnvoll sind. Kategorisiere: 1) Ersetzt Custom-Code (Figure, CharacterCount). 2) Wichtig fuer Autoren (TextAlign, Table, Sub/Superscript, Underline, Highlight). 3) Nice-to-have (Footnotes, Color, OfficePaste). Zeige Paketnamen, v2-Kompatibilitaet, und ob offiziell oder Community."
- 🎯 Existierende Loesungen nutzen statt neu bauen
- ✅ 17 Extensions identifiziert, priorisiert nach Nutzen

---

## Zusammenfassung der Session

### Statistiken
- **Commits:** 20+
- **Tests:** 30 Backend + 23 Export-Plugin = 53 total (war 10)
- **Neue Dateien:** plugin_install.py, Tooltip.tsx, figcaption.ts, install.sh, start.sh, stop.sh, .env.example, test_import_export.py
- **Geaenderte Dateien:** 30+

### Hauptergebnisse
1. Plugin-ZIP-Installation mit dynamischem Laden
2. Alle 7 Radix-UI-Migrationen abgeschlossen
3. Produktionshärtung und Deployment-Scripts
4. GitHub Release v0.7.0
5. Vollstaendiger write-book-template Import (getestet mit 2 echten Buechern)
6. EPUB-Export mit Bildern, manuellem TOC, Buchtyp-Suffix
7. TOC-Link-Validierung
8. Figure/Figcaption Custom TipTap Extension

### Optimierungsvorschlaege fuer zukuenftige Prompts
1. **Spezifisch sein:** Statt "geht nicht" -> "figcaption wird in Monospace statt Body-Font angezeigt"
2. **Kontext mitgeben:** "Das Imprint hat `<br>` Tags aber TipTap rendert keine Zeilenumbrueche"
3. **Akzeptanzkriterien:** "Exportiertes EPUB soll Bilder enthalten und nur ein TOC haben"
4. **Tests einfordern:** "Schreibe Tests die verifizieren dass X, Y, Z"
5. **Dateien referenzieren:** "In backup.py Zeile 350 wird der Content als Markdown gespeichert"
6. **Batch-Auftraege:** Mehrere zusammenhaengende Probleme in einem Prompt buendeln
