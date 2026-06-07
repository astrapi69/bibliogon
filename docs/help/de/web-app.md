# Bibliogon als Web-App nutzen

Bibliogon läuft auch als **backendlose Web-App** unter
[astrapi69.github.io/bibliogon/](https://astrapi69.github.io/bibliogon/).
Es gibt nichts zu installieren: Öffne die URL in einem aktuellen Browser
und schreibe sofort los. Dieser Build spricht mit **gar keinem Server** —
er startet aus Daten, die in der Seite eingebettet sind, und speichert
alles, was du erstellst, in deinem eigenen Browser.

Das ist etwas anderes als der Offline-Modus der Desktop-App (siehe
[Offline-Modus und LAN-Zugriff](offline-lan.md)), der ein Backend behält
und nur dann auf eine lokale Kopie zurückfällt, wenn dieses Backend nicht
erreichbar ist. Die Web-App hat von vornherein kein Backend.

## Was offline funktioniert

Fast alles, was der Desktop kann:

- Schreiben von Prosa-Büchern, Artikeln, Bilderbüchern und Comics.
- Die Story-Bibel (Charaktere, Schauplätze, Gegenstände, Lore),
  Entitäts-Verknüpfungen und Beziehungen — siehe
  [Story-Bibel offline](story-bible/offline.md).
- Das Storyboard, Kapitel-Labels, Schreibziele und Schreibverlauf.
- Export im Browser nach Markdown, HTML, reinem Text, PDF, EPUB und
  DOCX — siehe [Export im Browser](export/browser.md).
- Import eines Medium-HTML-Exports.
- Einstellungen, Themes und die acht Oberflächensprachen.

## Was die Desktop-App braucht

Vier Funktionen sind im Browser wirklich nicht möglich und in der Web-App
deaktiviert — jeweils mit einem kurzen Hinweis „benötigt die
Desktop-App":

- **Pandoc-/LaTeX-Export** (die hochwertige Desktop-Export-Pipeline).
- **Git-Sync und Git-Backup.**
- **Hörbuch-Erstellung** (Text-to-Speech).
- **LAN-Modus.**

## Wo deine Daten liegen

Alles, was du in der Web-App erstellst, wird **in deinem Browser**
gespeichert, in dessen eingebauter Datenbank (IndexedDB). Es wird nichts
irgendwohin hochgeladen.

Zwei wichtige Folgen:

- Die Daten hängen an **diesem Browser auf diesem Gerät**. Sie
  synchronisieren sich nicht mit einem anderen Browser oder Rechner. Um
  Arbeit woanders weiterzuführen, exportiere sie (z. B. als EPUB oder
  DOCX) und importiere sie erneut.
- Wenn du die Seitendaten des Browsers für die Seite löschst, löschst du
  auch deine Bücher. Wenn du dich auf die Web-App verlässt, exportiere
  deine Arbeit regelmäßig.

## Aktualisierungen und die Build-Version

Die Web-App aktualisiert sich selbst: Sobald eine neue Version
veröffentlicht ist, lädt der Service Worker sie im Hintergrund, und der
nächste Reload startet den neuen Build.

Um zu prüfen, auf welchem Build du bist, öffne **Einstellungen > Über**.
Dort stehen Version, Build-Hash und Build-Datum.

## Einen veralteten Service Worker leeren

Sehr selten bleibt ein zwischengespeicherter Service Worker auf einem
alten Build hängen. Wenn die App nach einer Aktualisierung kaputt
aussieht, erzwinge einen sauberen Reload:

1. Öffne die Entwicklertools des Browsers (F12).
2. Gehe zu **Anwendung > Service Workers** (Chrome/Edge) oder
   **Speicher > Service Workers** (Firefox).
3. Klicke auf **Abmelden** (Unregister) und lade die Seite neu.

Ein normaler harter Reload (Strg+Umschalt+R) reicht meist; der
Abmelde-Schritt ist nur für die hartnäckigen Fälle.
