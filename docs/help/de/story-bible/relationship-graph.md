# Beziehungsgraph

Der Beziehungsgraph zeigt das gesamte Beziehungsnetz deines Buches als
eine interaktive Karte: ein Knoten je Story-Bibel-Eintrag und eine
farbcodierte Linie je Beziehung. Er ist die dritte visuelle
Planungsansicht neben der [Arc-Ansicht](arc-view.md) (Zeitachse) und dem
[Storyboard](../books/storyboard.md) (Pacing).

## Was er macht

Jeder Story-Bibel-Eintrag (Charakter, Ort, Gegenstand, Plotpunkt, Lore)
wird zu einem verschiebbaren Knoten, geformt und gefärbt nach seinem
Typ. Jede Beziehung, die du zwischen zwei Einträgen festhältst, wird zu
einer gerichteten, beschrifteten Linie in der Farbe der Beziehung. Du
kannst neue Beziehungen durch Ziehen zwischen Knoten anlegen, sie durch
Klick auf eine Linie löschen, direkt zu einem Eintrag springen, die
ganze Karte umordnen und diese Anordnung behalten, sie zurücksetzen und
das Bild als PNG exportieren.

Die Farblegende entspricht der Arc-Ansicht:

- Verbündet: grün
- Rivale: rot
- Familie: blau
- Mentor: lila
- Romantisch: pink
- Neutral: grau

## So gehst du vor

### Den Graphen öffnen

1. Öffne das Buch im Editor.
2. Klicke in der Kapitel-Sidebar auf **Beziehungsgraph**. Der Knopf
   wird angezeigt, wenn die Story-Bibel aktiv ist.
3. Die URL wechselt zu `?view=relationships`, die Ansicht ist also
   verlinkbar und der Zurück-Knopf des Browsers bringt dich an deinen
   Ausgangspunkt zurück.

Hat das Buch noch keine Story-Bibel-Einträge, zeigt die Ansicht statt
eines Graphen einen kurzen Hinweis. Lege dann zuerst ein paar
Charaktere, Orte und so weiter an und öffne sie danach erneut.

### Die Karte lesen

- Die Knoten sind anfangs gleichmäßig auf einem Kreis angeordnet. Der
  Kreis wächst mit der Größe deines Casts, damit sich Knoten nicht
  überlappen.
- Jeder Knoten trägt den Eintragsnamen und ein Typsymbol in der
  Typfarbe des Eintrags.
- Jede Linie zeigt vom Ausgangs-Eintrag zum Ziel-Eintrag, trägt den
  Beziehungstyp als Beschriftung und ist in der Farbe dieses Typs mit
  einer Pfeilspitze gezeichnet.
- Nutze die Bedienelemente auf der Fläche (in der Ecke), um hinein- und
  herauszuzoomen und den ganzen Graphen wieder einzupassen.

### Eine Beziehung anlegen

1. Fahre über den Ausgangsknoten und ziehe von seinem Verbindungspunkt
   auf den Zielknoten.
2. Ein kleiner Dialog öffnet sich. Klicke einen der
   Beziehungstyp-Knöpfe (Verbündet, Rivale, Familie, Mentor,
   Romantisch, Neutral). Vorausgewählt ist **Verbündet**.
3. Gib optional eine kurze Notiz im Notizfeld ein.
4. Klicke auf **Hinzufügen**. Die Beziehung wird beim Ausgangs-Eintrag
   gespeichert und erscheint sofort als neue Linie.

Besteht zwischen denselben zwei Einträgen in dieser Richtung bereits
eine Beziehung, ersetzt die neue sie, sodass es immer nur eine Linie je
Paar und Richtung gibt.

### Eine Beziehung löschen

1. Klicke auf die Linie, die du entfernen willst.
2. Bestätige die Rückfrage. Die Beziehung wird gelöscht und die Linie
   verschwindet.

### Zu einem Eintrag springen

- Ein Einfachklick auf einen Knoten öffnet ein Detail-Panel mit Name,
  Typ und Anzahl der Beziehungen des Eintrags.
- Klicke im Panel auf **Im Editor öffnen**, um den Eintrag im
  Story-Bibel-Editor zu öffnen, oder auf **Auftritte anzeigen**, um zu
  sehen, wo der Eintrag vorkommt.
- Ein Doppelklick auf einen Knoten öffnet den Eintrag direkt im
  Story-Bibel-Editor.

### Umordnen, zurücksetzen und exportieren

- Verschiebe Knoten, um die Karte so zu legen, wie du über deine
  Geschichte denkst. Die Positionen werden automatisch pro Buch
  gespeichert und beim nächsten Öffnen wiederhergestellt.
- Klicke auf **Layout zurücksetzen**, um deine eigenen Positionen zu
  verwerfen und zur automatischen kreisförmigen Anordnung
  zurückzukehren.
- Klicke auf **Als Bild exportieren**, um den aktuellen Graphen als
  PNG-Datei (`relationship-graph.png`) herunterzuladen, ideal als
  Übersichtsgrafik oder zum Teilen.

## Wo du es findest

Buch-Editor, Kapitel-Sidebar, der Knopf **Beziehungsgraph** (sichtbar,
wenn die Story-Bibel aktiv ist). Direkte URL: der Editor mit
`?view=relationships`.

## Tipps

- Beziehungen sind gerichtet. Ziehe vom Eintrag, der die Beziehung
  "hat", zum Ziel, zum Beispiel von einem Mentor zu seinem Schüler.
- Die Notiz, die du beim Anlegen einer Beziehung einträgst, ist ein
  guter Ort für eine Ein-Zeilen-Erinnerung, wie die beiden verbunden
  sind.
- Ein Knoten mit vielen Linien ist ein Knotenpunkt deiner Geschichte.
  Hat eine wichtige Figur noch keine Linien, ist das ein Hinweis,
  ihre Verbindungen festzuhalten.
- Lege verwandte Einträge nah beieinander an, bevor du das PNG
  exportierst, damit die exportierte Übersicht auf einen Blick lesbar
  ist.

## Verwandt

- [Story-Bibel-Übersicht](../story-bible.md)
- [Arc-Ansicht](arc-view.md)
- [Erwähnungen](mentions.md)
- [Storyboard](../books/storyboard.md)
