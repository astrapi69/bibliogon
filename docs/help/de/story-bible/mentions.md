# @-Erwähnungen und Auto-Erkennung

Zwei Wege, deinen Manuskripttext mit der
[Story-Bibel](../story-bible.md) zu verbinden: tippe beim Schreiben
eine `@-Erwähnung`, oder lass die **Auto-Erkennung** über bereits
geschriebenen Text laufen.

## @-Erwähnungen

Während du im **Kapitel-Editor** (Prosa-Bücher) oder auf einer
**Bilderbuchseite** schreibst, tippe `@`, um eine Autocomplete-Liste
der Story-Bibel-Entities des Buches zu öffnen. Die Liste ist nach Typ
gruppiert (Figuren, Schauplätze, Handlungspunkte, Gegenstände, Lore)
und engt sich beim Weitertippen ein — sie sucht im Entity-Namen.

Wähle einen Eintrag, um eine **farbcodierte Inline-Erwähnungs-Badge**
einzufügen, die `@Name` in der Typfarbe der Entity anzeigt. Die Badge
ist Teil deines Dokumenttexts; sie reist mit dem Kapitel mit.

Ein Klick auf eine Badge öffnet die Entity in der
Story-Bibel-Sidebar — ein schneller Weg von "Moment, wer war das
nochmal?" zum vollständigen Eintrag, ohne deinen Platz zu verlieren.

> @-Erwähnungen stehen im Kapitel-Editor und im Bilderbuch-Seitentext
> zur Verfügung. Comic-Sprechblasen verwenden reinen Text und bieten
> kein @-Erwähnungs-Autocomplete.

## Auto-Erkennung

Die Auto-Erkennung durchsucht bereits geschriebenen Text und schlägt
Auftritts-Verknüpfungen für gefundene Entity-Namen vor — du musst
also nicht nachträglich alle von Hand `@`-erwähnen.

1. Starte die Auto-Erkennung für das Buch (über die
   Story-Bibel-Oberfläche).
2. Bibliogon durchsucht jedes Kapitel / jede Seite und gleicht
   Entity-Namen ab.
3. Es listet die vorgeschlagenen Verknüpfungen — jede ein Name, der
   auf einer bestimmten Seite oder in einem Kapitel gefunden wurde
   und noch nicht verknüpft ist.
4. Wähle **Automatisch verknüpfen**, um die Auftritts-Verknüpfungen
   in einem Rutsch anzulegen.

### Wie der Abgleich funktioniert

- **Exakter Namensabgleich** an einer Wortgrenze — "Mara" trifft das
  Wort *Mara*, nicht *Maranello* oder *Zusammenfassung*.
- **Groß-/Kleinschreibung egal** — *mara*, *Mara* und *MARA* treffen
  alle.
- **Kurze Namen werden übersprungen** — Namen mit weniger als 3
  Zeichen (einzelne Initialen, sehr kurze Aliase) werden ignoriert,
  um Rauschen zu vermeiden.
- **Bereits verknüpfte Entities sind ausgeschlossen** — ist eine
  Entity bereits mit dieser Seite oder diesem Kapitel verknüpft,
  schlägt die Auto-Erkennung kein Duplikat vor.

Die Auto-Erkennung *schlägt* Verknüpfungen nur vor; nichts ändert
sich, bis du mit **Automatisch verknüpfen** bestätigst. Die
erzeugten Verknüpfungen verhalten sich genauso wie solche, die du
durch Ziehen einer Entity auf eine Storyboard-Karte anlegst — sie
treiben die Entity-Badges, den Auftritts-Tracker, die
[Arc-Ansicht](arc-view.md) und den Kontinuitäts-Prüfer an.

## Verwandt

- [Story-Bibel-Übersicht](../story-bible.md)
- [Arc-Ansicht und Kontinuitäts-Prüfer](arc-view.md)
- [Storyboard-Ansicht](../books/storyboard.md)
