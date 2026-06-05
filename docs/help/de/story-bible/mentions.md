# Erwähnungen und Auto-Erkennung

Es gibt zwei Wege, deinen Manuskripttext mit der
[Story-Bibel](../story-bible.md) zu verbinden: tippe beim Schreiben eine
@-Erwähnung, oder lass die Auto-Erkennung über bereits geschriebenen
Text laufen.

## Was es macht

- Eine @-Erwähnung fügt eine farbcodierte Badge für einen
  Story-Bibel-Eintrag direkt in deinen Text ein. Die Badge bleibt Teil
  des Dokuments und lässt dich mit einem Klick zum Eintrag springen.
- Die Auto-Erkennung durchsucht deine vorhandenen Kapitel und Seiten
  nach Entity-Namen und schlägt Auftritts-Verknüpfungen für die noch
  nicht verknüpften vor, sodass du nicht alle von Hand erwähnen musst.

## So gehst du vor: @-Erwähnungen

Während du im Kapitel-Editor (Prosa-Bücher) oder im Text einer
Bilderbuchseite schreibst, gehe so vor:

1. Tippe `@`. Eine Autocomplete-Liste der Story-Bibel-Entities des
   Buches öffnet sich.
2. Die Liste ist nach Typ gruppiert (Figuren, Schauplätze,
   Handlungspunkte, Gegenstände, Lore) und engt sich beim Weitertippen
   ein. Sie sucht im Entity-Namen.
3. Bewege dich mit den Pfeiltasten Auf und Ab durch die Liste, oder
   fahre mit der Maus über einen Eintrag.
4. Drücke Enter oder klicke einen Eintrag, um ihn einzufügen. Drücke
   Escape, um die Liste ohne Einfügen zu schließen.

Eingefügt wird eine farbcodierte Inline-Erwähnungs-Badge, die `@Name` in
der Typfarbe der Entity anzeigt. Die Badge ist Teil deines
Dokumenttexts und reist mit dem Kapitel oder der Seite mit.

Ein Klick auf eine Badge öffnet die Entity in der Story-Bibel-Sidebar,
ein schneller Weg von "Moment, wer war das nochmal?" zum vollständigen
Eintrag, ohne deinen Platz zu verlieren.

@-Erwähnungen stehen im Kapitel-Editor und im Bilderbuch-Seitentext zur
Verfügung. Comic-Sprechblasen verwenden reinen Text und bieten kein
@-Erwähnungs-Autocomplete.

## So gehst du vor: Auto-Erkennung

Die Auto-Erkennung liest deinen bereits geschriebenen Text und schlägt
Auftritts-Verknüpfungen für gefundene Entity-Namen vor.

1. Öffne die Story-Bibel-Sidebar im Buch-Editor.
2. Klicke in der Kopfzeile der Sidebar auf den Knopf
   **Erwähnungen erkennen** (das Funkel-Symbol).
3. Bibliogon durchsucht jedes Kapitel und jede Seite und gleicht
   Entity-Namen ab. Es erscheint ein Panel mit den vorgeschlagenen
   Verknüpfungen, jede mit Entity-Name, dem gefundenen Kapitel oder der
   Seite und der Anzahl der Vorkommen, wenn sie mehr als einmal
   auftritt.
4. Klicke auf **Automatisch verknüpfen**, um alle vorgeschlagenen
   Auftritts-Verknüpfungen in einem Rutsch anzulegen, oder auf
   **Verwerfen**, um die Vorschläge ohne Änderung zu verwerfen.

Wird nichts Neues gefunden, erhältst du statt eines Panels einen kurzen
Hinweis "keine neuen Erwähnungen".

### Wie der Abgleich funktioniert

- Exakter Namensabgleich an einer Wortgrenze. "Mara" trifft das Wort
  *Mara*, nicht *Maranello* oder *Zusammenfassung*.
- Groß-/Kleinschreibung egal. *mara*, *Mara* und *MARA* treffen alle.
- Namen mit weniger als 3 Zeichen werden übersprungen (einzelne
  Initialen, sehr kurze Aliase), um Rauschen zu vermeiden.
- Bereits verknüpfte Entities sind ausgeschlossen. Ist eine Entity
  bereits mit dieser Seite oder diesem Kapitel verknüpft, schlägt die
  Auto-Erkennung kein Duplikat vor.

Die Auto-Erkennung schlägt Verknüpfungen nur vor; nichts ändert sich,
bis du auf **Automatisch verknüpfen** klickst. Die erzeugten
Verknüpfungen verhalten sich genauso wie solche, die du durch Ziehen
einer Entity auf eine Storyboard-Karte anlegst. Sie treiben die
Entity-Badges, den Auftritts-Tracker, die [Arc-Ansicht](arc-view.md) und
den Kontinuitäts-Prüfer an.

## Wo du es findest

- @-Erwähnungen: tippe `@` im Kapitel-Editor oder im
  Bilderbuch-Seitentext.
- Auto-Erkennung: die Kopfzeile der Story-Bibel-Sidebar, der Knopf
  **Erwähnungen erkennen** (Funkel-Symbol).

## Tipps

- Nutze @-Erwähnungen beim Schreiben für die Entities, die du oft
  nennst; nutze die Auto-Erkennung, um Kapitel nachzuholen, die du vor
  dem Anlegen dieser Entities geschrieben hast.
- Prüfe die Vorschlagsliste vor dem Verknüpfen. Die Vorkommens-Anzahl
  hilft dir, die Kapitel zu erkennen, in denen eine Entity wirklich
  zählt.
- Lass die Auto-Erkennung nach einer großen Schreib-Session einmal
  laufen, um Auftritts-Tracker und Arc-Ansicht mit deinem Text im
  Einklang zu halten.
- Wird ein Name immer wieder übersehen, prüfe, ob der Name der Entity in
  der Story-Bibel zur Schreibweise im Prosatext passt.

## Verwandt

- [Story-Bibel-Übersicht](../story-bible.md)
- [Arc-Ansicht](arc-view.md)
- [Beziehungsgraph](relationship-graph.md)
- [Storyboard](../books/storyboard.md)
