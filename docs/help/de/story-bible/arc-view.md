# Arc-Ansicht und Kontinuitäts-Prüfer

Sobald deine Story-Bibel-Entities [Auftritte](mentions.md) haben,
macht die Arc-Ansicht daraus ein Bild aus der Vogelperspektive: wer
wann auf der Bühne steht — und der Kontinuitäts-Prüfer markiert die
Lücken, die beim Durchlesen gern durchrutschen.

## Arc-Ansicht

Die Arc-Ansicht ist eine **SVG-Swim-Lane-Timeline**:

- **Seiten verlaufen links nach rechts** entlang der x-Achse, in
  Buchreihenfolge.
- **Jede Entity, die irgendwo auftritt, erhält ihre eigene
  horizontale Spur.**
- **Jeder Auftritt ist ein Punkt** auf der Spur der Entity, in der
  Spalte der Seite, auf der sie auftritt. Die **Farbe** des Punkts
  ist die [Stimmungsfarbe](../books/storyboard.md#stimmungsfarbe)
  der Seite, seine **Größe** spiegelt die Rolle der Entity wider —
  Haupt- / Protagonisten-Entities zeichnen einen größeren Punkt, der
  Rest einen kleineren.
- Eine **Polylinie** verbindet die Punkte einer Entity, sodass du
  ihre Kontinuität durch das Buch auf einen Blick verfolgen kannst.

**Klicke auf einen beliebigen Punkt**, um direkt zu dieser Seite im
Editor zu springen.

Die Spuren von oben nach unten zu lesen verrät dir die Besetzung
jeder Seite; eine einzelne Spur von links nach rechts zu lesen
verrät dir den Präsenz-Rhythmus einer Figur — lange Lücken, späte
Auftritte, frühe Abgänge springen visuell ins Auge.

### Beziehungslinien

Die Arc-Ansicht hat einen Schalter **Beziehungen anzeigen**
(standardmäßig aus, um die Ansicht übersichtlich zu halten). Schalte
ihn ein, um farbcodierte Bezier-Kurven zwischen den Spuren zweier
Entities zu zeichnen, überall dort, wo sie sich eine Seite teilen,
in den [Beziehungsfarben](../story-bible.md#beziehungen) (ally =
grün, rival = rot, family = blau, mentor = violett, romantic = pink,
neutral = grau). Die Kurven liegen hinter den Punkten, damit die
Timeline lesbar bleibt.

## Kontinuitäts-Prüfer

Der Kontinuitäts-Prüfer erzeugt **beratende** Warnungen — er
blockiert nie etwas und berechnet sie bei jedem Öffnen der Ansicht
neu. Er kennt drei Arten:

| Warnung | Wann sie auslöst |
|---|---|
| **Entity verschwindet** | Auf den letzten Auftritt einer Entity folgt eine lange Reihe von Seiten bis zum Buchende — *"{name} verschwindet nach dieser Seite"*. |
| **Abwesenheitslücke** | Eine Entity ist über eine lange Strecke zwischen zwei Auftritten abwesend — *"{name} ist abwesend bis Seite {n}"*. |
| **Leere Seite** | Eine Seite hat gar keine verknüpften Entities — *"Keine Entities auf dieser Seite"*. |

Das sind Hinweise, keine Fehler: eine Figur, die zum Mittelpunkt
*absichtlich* verschwinden soll, ist in Ordnung, und eine leere
Seite kann ein bewusstes Zwischenspiel sein. Behandle die Warnungen
als Checkliste, die du überfliegst, bevor du einen Entwurf für fertig
erklärst.

## Verwandt

- [Story-Bibel-Übersicht](../story-bible.md)
- [@-Erwähnungen und Auto-Erkennung](mentions.md)
- [Storyboard-Ansicht](../books/storyboard.md)
