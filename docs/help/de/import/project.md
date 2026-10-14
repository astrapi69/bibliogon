# Buchprojekt importieren

Ein Buchprojekt im **write-book-template**-Format kommt als Archiv —
meist mit der Endung `.bgp`, manchmal als gewöhnliche `.zip`. Bibliogon
liest es ein und legt daraus ein vollständiges Buch an: Kapitel in der
richtigen Reihenfolge, Metadaten und Bilder.

Das funktioniert in der Desktop-App **und** in der reinen Web-App auf
GitHub Pages. Der Import läuft dort vollständig im Browser; es wird
nichts hochgeladen.

## Bedienung

1. Klicke auf dem Dashboard auf **Importieren**.
2. Lege die Datei im Feld ab oder wähle sie aus.
3. Unter „Erkanntes Format" sollte **Buchprojekt (.bgp)** stehen.
4. Klicke auf **Importieren**.

Nach dem Import meldet Bibliogon, wie viele Kapitel und Bilder
angekommen sind, und das neue Buch erscheint auf dem Dashboard.

## Was übernommen wird

- **Kapitel** aus `manuscript/`. Die Reihenfolge stammt aus
  `config/export-settings.yaml`, wenn das Projekt eine `section_order`
  deklariert; ansonsten werden Front-Matter, Kapitel und Back-Matter
  jeweils alphabetisch einsortiert.
- **Kapiteltitel** aus der ersten `# `-Zeile der Datei. Fehlt sie, dient
  der Dateiname als Titel (`02-die-rueckkehr.md` wird zu „Die
  Rueckkehr").
- **Kapiteltypen** aus dem Dateinamen: `dedication.md` wird zur Widmung,
  `epilogue.md` zum Epilog, `part-1-intro.md` zur Teil-Einleitung.
- **Metadaten** aus `config/metadata.yaml`: Titel, Untertitel, Autor,
  Sprache, Serie, Verlag, ISBN- und ASIN-Nummern, Schlagwörter,
  Beschreibungen und eigenes CSS.
- **Bilder** aus `assets/`. Der Unterordner bestimmt die Art:
  `assets/covers/` sind Cover, `assets/figures/` Abbildungen,
  `assets/diagrams/` Diagramme, `assets/tables/` Tabellen.
- Das **Cover** aus `cover_image` in den Metadaten — sofern die genannte
  Datei auch im Archiv liegt. Fehlt sie, nimmt Bibliogon das erste
  tatsächlich importierte Cover-Bild, damit kein Verweis ins Leere
  zeigt.

## Was nicht übernommen wird

- Dateien mit dem Suffix `-print` im Namen. write-book-template legt
  damit eine separate Druckvariante eines Kapitels ab; importiert wird
  die normale.
- Dateien in `manuscript/front-matter/` oder `back-matter/`, deren Name
  keinem bekannten Kapiteltyp entspricht.
- Die **Git-Historie** des Projekts. Sie zu übernehmen braucht die
  Desktop-App, siehe [Git-Historie übernehmen](git-adoption.md).

## Verwandte Seiten

- [Word- und EPUB-Import](office.md)
- [Import von GitHub](github.md)
- [Bibliogon als Web-App nutzen](../web-app.md)
