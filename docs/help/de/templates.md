# Vorlagen

Vorlagen sind wiederverwendbare Strukturen, die dir das erneute Aufbauen desselben Skeletts ersparen, wenn du ein neues Buch oder Kapitel anlegst. Bibliogon kennt zwei Arten:

- **Buchvorlagen** fuellen ein neues Buch mit einer Kapitelliste (Titel, Typ, Reihenfolge). Fuenf Genres liegen bei: Kinderbilderbuch, Science-Fiction-Roman, Sachbuch / How-To, Philosophie und Memoiren.
- **Kapitelvorlagen** fuellen ein einzelnes Kapitel mit einer strukturierten Gliederung im TipTap-JSON-Format. Vier liegen bei: Interview, FAQ, Rezept, Fotoreportage.

Beide Arten unterscheiden **mitgelieferte** Vorlagen (Teil von Bibliogon, schreibgeschuetzt, mit Schloss-Badge) von **eigenen** Vorlagen (aus deinen Buechern oder Kapiteln gespeichert, ueber den Muelleimer-Button auf der Karte loeschbar).

## Buch aus einer Vorlage erstellen

1. Im Dashboard auf **Neues Buch** klicken.
2. Am oberen Rand des Dialogs auf den Tab **Aus Vorlage** wechseln.
3. Eine Vorlagenkarte auswaehlen. Jede Karte zeigt Name, Genre, Beschreibung und Kapitelanzahl.
4. Titel und Autor eintragen. Sprache und Beschreibung sind aus der Vorlage vorbelegt, aber editierbar.
5. Auf **Erstellen** klicken. Das neue Buch oeffnet sich im Editor mit allen Kapiteln.

Im Hintergrund erstellt `POST /api/books/from-template` Buch und Kapitel in einem einzigen Datenbank-Commit. Schlaegt das Einfuegen eines Kapitels fehl, wird das ganze Buch zurueckgerollt.

## Buch als Vorlage speichern

1. Das Buch im Editor oeffnen.
2. In der Sidebar-Fusszeile, neben Metadaten, TOC und Export, auf **Als Vorlage speichern** klicken.
3. Name (Pflicht, eindeutig) und Beschreibung (Pflicht) eintragen. Name max. 100 Zeichen, Beschreibung max. 500.
4. **Leere Platzhalter** (empfohlen) oder **Inhalt uebernehmen** waehlen:
   - *Leere Platzhalter* speichert nur die Struktur: Titel, Typen, Reihenfolge. Das Content-Feld bleibt leer. Ideal fuer wiederverwendbare Blaupausen.
   - *Inhalt uebernehmen* kopiert den vollen Kapiteltext in die Vorlage. Sinnvoll, wenn du eine Musterbuchvorlage mit Beispieltexten haben willst.
5. **Kapitelvorschau** ausklappen, um die Kapitelliste vor dem Speichern zu pruefen.
6. Auf **Speichern** klicken. Die Vorlage erscheint im Vorlagen-Picker fuer zukuenftige **Aus Vorlage**-Fluesse.

Gibt es bereits eine Vorlage mit demselben Namen, antwortet der Server mit 409 und das Namensfeld zeigt einen Inline-Fehler. Einen anderen Namen waehlen.

## Kapitel aus einer Vorlage erstellen

1. In der Editor-Sidebar auf das **+**-Icon klicken, um das Neues-Kapitel-Dropdown zu oeffnen.
2. Am Anfang der Gruppe "Kapitel" **Aus Vorlage...** auswaehlen.
3. Eine Kapitelvorlagen-Karte auswaehlen. Jede Karte zeigt Name, Kapiteltyp, Beschreibung und entweder ein Schloss-Badge (mitgeliefert) oder einen Loeschen-Button (eigen).
4. Auf **Einfuegen** klicken. Das neue Kapitel wird am Ende der Liste angehaengt: mit dem Namen der Vorlage (per Doppelklick inline umbenennbar), dem Kapiteltyp und dem Inhalt.

## Kapitel als Vorlage speichern

1. In der Sidebar mit Rechtsklick auf ein Kapitel das Kontextmenue oeffnen.
2. Auf **Als Vorlage speichern** klicken.
3. Name, Beschreibung und Content-Modus (leerer Platzhalter / Inhalt uebernehmen) funktionieren wie bei Buchvorlagen. Der Name ist aus dem Kapiteltitel vorbelegt; aendere ihn, wenn du einen generischeren Vorlagennamen moechtest.

## Eigene Vorlagen verwalten

Den entsprechenden Vorlagen-Picker (Buch oder Kapitel) oeffnen. Eigene Vorlagen haben einen Muelleimer-Button in der Kartenkopfzeile. Klick darauf, Dialog bestaetigen, fertig. Mitgelieferte Vorlagen haben diesen Button nicht und koennen nicht geloescht werden.

Vorlagen sind global fuer deine Installation. Sie gelten fuer jedes Buch, das du erstellst oder bearbeitest. Es gibt kein Scoping pro Buch oder pro Benutzer (Bibliogon ist als Single-User-Anwendung konzipiert).

## Details der mitgelieferten Kapitelvorlagen

| Vorlage | Standardstruktur |
|---------|------------------|
| **Interview** | H2 Einleitung, H2 Fragen (3er-Nummerierung), H2 Abschluss |
| **FAQ** | 3 x (H3 Frage + Absatz-Antwort) |
| **Rezept** | H2 Zutaten (Aufzaehlung), H2 Zubereitung (Nummerierung), H2 Notizen |
| **Fotoreportage** | H2 Ort, leerer Absatz, H2 Eindruecke, Platzhalter-Beschreibung, H2 Reflexion |

Alle Platzhalter sind kurz und darauf ausgelegt, ersetzt zu werden.

## Unterschiede zwischen Buch- und Kapitelvorlagen

| | Buchvorlage | Kapitelvorlage |
|--|--------------|-----------------|
| Umfang | Ganze Buchstruktur | Ein Kapitel |
| Speichert | Titel, Beschreibung, Genre, Sprache, Kapitelliste | Name, Beschreibung, Kapiteltyp, Content |
| Einstieg | Dialog "Neues Buch" (Tab "Aus Vorlage") | Sidebar-**+**-Dropdown (Eintrag "Aus Vorlage...") |
| Speichern | Sidebar-Fusszeile "Als Vorlage speichern" | Kapitel-Kontextmenue "Als Vorlage speichern" |
| API-Prefix | `/api/templates/` | `/api/chapter-templates/` |
