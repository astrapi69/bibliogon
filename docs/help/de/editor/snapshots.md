# Snapshots und Versionen

Bibliogon sichert deine Kapitel auf zwei Arten, die auf derselben Seite
zusammenlaufen, dem **Versionsverlauf**:

- **Automatische Versionen:** Bei jedem Speichern legt Bibliogon den
  vorherigen Stand als Version ab. Aufbewahrt werden die letzten 20 pro
  Kapitel; ältere automatische Versionen werden verworfen.
- **Manuelle Snapshots:** Ein bewusst gesetzter, benannter Stand, zum
  Beispiel „Vor der Umstrukturierung". Manuelle Snapshots sind von der
  20er-Grenze ausgenommen und bleiben erhalten, bis du sie löschst.

## Was es bietet

Der Versionsverlauf zeigt für ein Kapitel die automatischen Fassungen
und deine manuellen Snapshots in einer Liste, die neueste zuerst. Du
kannst einen benannten Snapshot anlegen, jede Fassung mit dem aktuellen
Inhalt vergleichen, eine Fassung wiederherstellen und manuelle Snapshots
löschen.

## Den Versionsverlauf öffnen

Klicke mit der rechten Maustaste auf ein Kapitel in der Kapitel-Sidebar,
um das Kontextmenü zu öffnen, und wähle dort **Versionsverlauf**. Es
öffnet sich eine eigene Seite mit der Liste der Fassungen. Über den
Zurück-Button der Seite oder den Browser-Zurück-Button kommst du in den
Editor zurück.

## Einen Snapshot erstellen

Gib oben auf der Seite optional einen Namen ein und klicke auf
**Snapshot erstellen**. Bibliogon sichert den aktuell gespeicherten
Stand des Kapitels als manuellen Snapshot. Manuelle Snapshots tragen ein
**Snapshot**-Abzeichen und ihren Namen; automatische Versionen zeigen
stattdessen ihre Versionsnummer (`v3`).

Du kannst einen Snapshot auch direkt im Editor erstellen: Rechtsklick in
den Text öffnet das [Kontextmenü](context-menu.md), dort gibt es
**Snapshot erstellen**.

## Mit der aktuellen Fassung vergleichen

Das Vergleichssymbol neben einem Eintrag öffnet einen zeilenweisen
Vergleich gegen den **aktuellen** Kapitelinhalt:

- Grün hinterlegte Zeilen (`+`) stehen jetzt im Kapitel, fehlten aber in
  der gewählten Fassung.
- Rot hinterlegte Zeilen (`-`) waren in der gewählten Fassung vorhanden
  und sind jetzt entfernt.
- Eine Notiz oben weist auf einen geänderten Titel hin.
- Gibt es keine Textunterschiede, steht das ausdrücklich da.

Mit **Zurück zur Liste** kehrst du zur Übersicht zurück.

## Wiederherstellen

**Wiederherstellen** ersetzt den aktuellen Kapitelinhalt durch die
gewählte Fassung. Das ist sicher: Bibliogon sichert den aktuellen Stand
zuvor automatisch als neue Version, sodass du nichts verlierst. Eine
Rückfrage bestätigt den Vorgang. Nach dem Wiederherstellen landest du
wieder im Editor, mit genau diesem Kapitel ausgewählt.

## Einen Snapshot löschen

Manuelle Snapshots lassen sich über das Papierkorb-Symbol dauerhaft
entfernen (mit Sicherheitsabfrage). Automatische Versionen kannst du
nicht einzeln löschen, sie werden über die 20er-Aufbewahrung verwaltet.

## Tipps

- Setze vor einer größeren Umstrukturierung einen benannten Snapshot,
  dann kannst du jederzeit zurück, ohne auf die 20er-Grenze zu achten.
- Nutze den Vergleich, bevor du wiederherstellst, so siehst du genau,
  was sich ändern würde.
- Wiederherstellen ist gefahrlos, weil der aktuelle Stand vorher
  gesichert wird, du kannst eine Wiederherstellung also wieder rückgängig
  machen, indem du die neu entstandene Version wiederherstellst.

## Verwandte Themen

- [Schreibverlauf](writing-history.md) - dein Schreibfortschritt über die Zeit
- [Kontextmenü](context-menu.md) - Snapshot direkt im Editor erstellen
- [Editor-Übersicht](uebersicht.md) - alle Grundlagen des Editors
