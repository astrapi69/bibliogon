# Vorlagen

Vorlagen sind wiederverwendbare Strukturen, die dir das erneute Aufbauen desselben Skeletts ersparen, wenn du ein neues Buch oder Kapitel anlegst. Bibliogon kennt zwei Arten:

- **Buchvorlagen** füllen ein neues Buch mit einer Kapitelliste (Titel, Typ, Reihenfolge). Fuenf Genres liegen bei: Kinderbilderbuch, Science-Fiction-Roman, Sachbuch / How-To, Philosophie und Memoiren.
- **Kapitelvorlagen** füllen ein einzelnes Kapitel mit einer strukturierten Gliederung im TipTap-JSON-Format. Vier liegen bei: Interview, FAQ, Rezept, Fotoreportage.

Beide Arten unterscheiden **mitgelieferte** Vorlagen (Teil von Bibliogon, schreibgeschuetzt, mit Schloss-Badge) von **eigenen** Vorlagen (aus deinen Büchern oder Kapiteln gespeichert, über den Mülleimer-Button auf der Karte loeschbar).

## Buch aus einer Vorlage erstellen

1. Im Dashboard auf **Neues Buch** klicken.
2. Am oberen Rand des Dialogs auf den Tab **Aus Vorlage** wechseln.
3. Eine Vorlagenkarte auswählen. Jede Karte zeigt Name, Genre, Beschreibung und Kapitelanzahl.
4. Titel und Autor eintragen. Sprache und Beschreibung sind aus der Vorlage vorbelegt, aber editierbar.
5. Auf **Erstellen** klicken. Das neue Buch öffnet sich im Editor mit allen Kapiteln.

Im Hintergrund erstellt `POST /api/books/from-template` Buch und Kapitel in einem einzigen Datenbank-Commit. Schlaegt das Einfügen eines Kapitels fehl, wird das ganze Buch zurueckgerollt.

## Buch als Vorlage speichern

1. Das Buch im Editor öffnen.
2. In der Sidebar-Fußzeile, neben Metadaten, TOC und Export, auf **Als Vorlage speichern** klicken.
3. Name (Pflicht, eindeutig) und Beschreibung (Pflicht) eintragen. Name max. 100 Zeichen, Beschreibung max. 500.
4. **Leere Platzhalter** (empfohlen) oder **Inhalt übernehmen** wählen:
   - *Leere Platzhalter* speichert nur die Struktur: Titel, Typen, Reihenfolge. Das Content-Feld bleibt leer. Ideal für wiederverwendbare Blaupausen.
   - *Inhalt übernehmen* kopiert den vollen Kapiteltext in die Vorlage. Sinnvoll, wenn du eine Musterbuchvorlage mit Beispieltexten haben willst.
5. **Kapitelvorschau** ausklappen, um die Kapitelliste vor dem Speichern zu prüfen.
6. Auf **Speichern** klicken. Die Vorlage erscheint im Vorlagen-Picker für zukünftige **Aus Vorlage**-Fluesse.

Gibt es bereits eine Vorlage mit demselben Namen, antwortet der Server mit 409 und das Namensfeld zeigt einen Inline-Fehler. Einen anderen Namen wählen.

## Kapitel aus einer Vorlage erstellen

1. In der Editor-Sidebar auf das **+**-Icon klicken, um das Neues-Kapitel-Dropdown zu öffnen.
2. Am Anfang der Gruppe "Kapitel" **Aus Vorlage...** auswählen.
3. Eine Kapitelvorlagen-Karte auswählen. Jede Karte zeigt Name, Kapiteltyp, Beschreibung und entweder ein Schloss-Badge (mitgeliefert) oder einen Löschen-Button (eigen).
4. Auf **Einfügen** klicken. Das neue Kapitel wird am Ende der Liste angehängt: mit dem Namen der Vorlage (per Doppelklick inline umbenennbar), dem Kapiteltyp und dem Inhalt.

## Kapitel als Vorlage speichern

1. In der Sidebar mit Rechtsklick auf ein Kapitel das Kontextmenue öffnen.
2. Auf **Als Vorlage speichern** klicken.
3. Name, Beschreibung und Content-Modus (leerer Platzhalter / Inhalt übernehmen) funktionieren wie bei Buchvorlagen. Der Name ist aus dem Kapiteltitel vorbelegt; aendere ihn, wenn du einen generischeren Vorlagennamen moechtest.

## Eigene Vorlagen verwalten

Den entsprechenden Vorlagen-Picker (Buch oder Kapitel) öffnen. Eigene Vorlagen haben einen Mülleimer-Button in der Kartenkopfzeile. Klick darauf, Dialog bestätigen, fertig. Mitgelieferte Vorlagen haben diesen Button nicht und können nicht gelöscht werden.

Vorlagen sind global für deine Installation. Sie gelten für jedes Buch, das du erstellst oder bearbeitest. Es gibt kein Scoping pro Buch oder pro Benutzer (Bibliogon ist als Single-User-Anwendung konzipiert).

## Details der mitgelieferten Kapitelvorlagen

| Vorlage | Standardstruktur |
|---------|------------------|
| **Interview** | H2 Einleitung, H2 Fragen (3er-Nummerierung), H2 Abschluss |
| **FAQ** | 3 x (H3 Frage + Absatz-Antwort) |
| **Rezept** | H2 Zutaten (Aufzählung), H2 Zubereitung (Nummerierung), H2 Notizen |
| **Fotoreportage** | H2 Ort, leerer Absatz, H2 Eindruecke, Platzhalter-Beschreibung, H2 Reflexion |

Alle Platzhalter sind kurz und darauf ausgelegt, ersetzt zu werden.

## Unterschiede zwischen Buch- und Kapitelvorlagen

| | Buchvorlage | Kapitelvorlage |
|--|--------------|-----------------|
| Umfang | Ganze Buchstruktur | Ein Kapitel |
| Speichert | Titel, Beschreibung, Genre, Sprache, Kapitelliste | Name, Beschreibung, Kapiteltyp, Content |
| Einstieg | Dialog "Neues Buch" (Tab "Aus Vorlage") | Sidebar-**+**-Dropdown (Eintrag "Aus Vorlage...") |
| Speichern | Sidebar-Fußzeile "Als Vorlage speichern" | Kapitel-Kontextmenue "Als Vorlage speichern" |
| API-Prefix | `/api/templates/` | `/api/chapter-templates/` |
