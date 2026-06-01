# Story-Bibel

Die Story-Bibel ist eine Datenbank pro Buch für die
wiederkehrenden Elemente deiner Geschichte: die Figuren,
Schauplätze, Handlungspunkte, Gegenstände und das Hintergrundwissen
(Lore), die du beim Schreiben konsistent halten möchtest. Sie liegt
direkt neben deinem Manuskript, sodass du etwas nachschlagen — oder
schnell festhalten — kannst, ohne den Editor zu verlassen.

Die Story-Bibel wird vom Plugin **plugin-story-bible**
bereitgestellt. Falls du sie nicht siehst, aktiviere das Plugin
unter *Einstellungen > Plugins*.

## Story-Bibel öffnen

Öffne ein Buch im Editor. Wenn das Plugin aktiv ist, erscheint oben
rechts eine **Buch**-Schaltfläche. Ein Klick darauf blendet rechts
das Story-Bibel-Panel ein — neben der Kapitelliste auf der linken
Seite. Über das **X** in der Panel-Kopfzeile schließt du es wieder.

## Eintragstypen

Einträge sind nach Typ gruppiert. Jeder Typ hat ein eigenes Symbol,
eine eigene Akzentfarbe und einen eigenen Satz an Detailfeldern:

| Typ | Was er festhält | Detailfelder |
|---|---|---|
| **Figuren** | Die Personen deiner Geschichte — Protagonisten, Antagonisten, Nebenfiguren | Aliase, Rolle, Eigenschaften, Entwicklungsnotizen, Beziehungen |
| **Schauplätze** | Die Orte, an denen deine Geschichte spielt — Städte, Gebäude, Welten | Art des Orts, Geografie, Bedeutung |
| **Handlungspunkte** | Die Wendepunkte deiner Erzählung | Zeitliche Position, Story-Beat (Einführung / auslösendes Ereignis / steigende Handlung / Höhepunkt / fallende Handlung / Auflösung), beteiligte Figuren |
| **Gegenstände** | Die bedeutsamen Objekte und Artefakte | Bedeutung, aktueller Besitzer |
| **Lore** | Die Regeln deiner Welt | Kategorie (Magie / Technik / Kultur / Geschichte / Religion / Sprache / sonstiges) |

Jede Gruppe lässt sich ein- und ausklappen und zeigt die Anzahl
ihrer Einträge. Die Typdefinitionen sind die alleinige Quelle der
Wahrheit in `backend/config/story-bible-entities.yaml`, sodass der
Feldsatz überall identisch ist.

## Hinzufügen, bearbeiten und löschen

- **Hinzufügen** — klicke auf das **+** neben einer
  Gruppenüberschrift, gib einen Namen ein und drücke *Speichern*.
  Der Eintrag wird unter diesem Typ angelegt.
- **Bearbeiten** — klicke auf einen Eintrag, um seine vollständige
  Detailansicht im Hauptbereich zu öffnen (der Kapitel-Editor tritt
  dabei zurück). Dort kannst du ihn umbenennen, eine
  Rich-Text-**Beschreibung** schreiben und die typspezifischen
  Detailfelder ausfüllen. Jede Änderung wird automatisch
  gespeichert.
- **Löschen** — nutze das Papierkorb-Symbol neben einem Eintrag in
  der Liste oder die Schaltfläche *Löschen* in der Detailansicht. Du
  wirst vorher um Bestätigung gebeten.

## Beziehungen

Öffne eine Figur (oder eine beliebige Entity) und scrolle zur
Sektion **Beziehungen** in der Detailansicht. Füge eine Beziehung zu
einer anderen Entity desselben Buches hinzu und wähle ihre Art:

| Art | Farbe |
|---|---|
| **Verbündeter** (ally) | grün |
| **Rivale** (rival) | rot |
| **Familie** (family) | blau |
| **Mentor** (mentor) | violett |
| **Romantisch** (romantic) | pink |
| **Neutral** (neutral) | grau |

Jede Beziehung kann eine optionale Notiz tragen ("entfremdet seit
dem Krieg", "arbeitet heimlich gegen ihn", ...). Beziehungen werden
an der Entity selbst gespeichert und steuern die optionalen
Beziehungslinien in der [Arc-Ansicht](story-bible/arc-view.md).

## Entities mit dem Text verknüpfen (Auftritte)

Ein **Auftritt** ist eine Verknüpfung zwischen einer Entity und einer
Seite oder einem Kapitel, in dem sie vorkommt. Zwei Wege, sie
anzulegen:

1. **Ziehe** eine Entity aus der Story-Bibel-Sidebar auf eine Karte
   im [Storyboard](books/storyboard.md). Das Ablegen erzeugt eine
   Auftritts-Verknüpfung für diese Seite; die Entity erscheint dann
   als farbcodierte Badge auf der Karte.
2. **Auto-Erkennung** — lass Bibliogon deinen vorhandenen Text
   durchsuchen und in einem Durchgang Verknüpfungen vorschlagen.
   Siehe [@-Erwähnungen und Auto-Erkennung](story-bible/mentions.md).

Jeder Auftritt kann eine optionale **Rolle** (z. B. "POV", "Cameo")
und **Notizen** tragen. Die Detailansicht der Entity listet jede
Seite und jedes Kapitel, auf dem sie vorkommt — dein
Auftritts-Tracker auf einen Blick. Das Storyboard bietet zudem einen
**Entity-Filter**, der das Raster auf die Seiten einschränkt, auf
denen die ausgewählten Entities auftreten.

## @-Erwähnungen im Text

Tippe `@` im Kapitel-Editor oder auf einer Bilderbuchseite, um die
Entities des Buches per Autocomplete einzufügen und eine
farbcodierte Inline-Erwähnungs-Badge zu setzen. Ein Klick auf die
Badge öffnet die Entity in der Sidebar. Den vollständigen Ablauf
beschreibt [@-Erwähnungen und Auto-Erkennung](story-bible/mentions.md).

## Arc-Ansicht und Kontinuität

Sobald Entities Auftritte haben, zeichnet die
[Arc-Ansicht](story-bible/arc-view.md) eine SVG-Swim-Lane-Timeline,
wer wo im Buch auftritt, und der **Kontinuitäts-Prüfer** gibt
beratende Warnungen aus, wenn eine Entity verschwindet, lange
abwesend ist oder eine Seite gar keine Entities enthält.

## Story-Bibel exportieren

Exportiere die gesamte Story-Bibel als Markdown-Dokument, nach
Entity-Typ gruppiert, mit der Beschreibung jeder Entity und ihrer
Auftrittsliste. Praktisch für eine Serien-Bibel außerhalb von
Bibliogon oder zur Übergabe an Co-Autoren oder Lektorat.

## Geltungsbereich

In dieser Version ist die Story-Bibel **pro Buch**: jedes Buch hat
seine eigenen Einträge. Eine über eine ganze Serie geteilte Bibel
ist für eine zukünftige Version geplant.

## Verwandt

- [@-Erwähnungen und Auto-Erkennung](story-bible/mentions.md)
- [Arc-Ansicht und Kontinuitäts-Prüfer](story-bible/arc-view.md)
- [Storyboard-Ansicht](books/storyboard.md) — wo Entity-Badges und das Auftrittsraster leben
