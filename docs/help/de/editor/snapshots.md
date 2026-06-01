# Snapshots und Versionen

Bibliogon sichert deine Kapitel auf zwei Arten, die im selben Dialog
zusammenlaufen — dem **Versionsverlauf**:

- **Automatische Versionen:** Bei jedem Speichern legt Bibliogon den
  vorherigen Stand als Version ab. Aufbewahrt werden die letzten 20
  pro Kapitel; ältere automatische Versionen werden verworfen.
- **Manuelle Snapshots:** Ein bewusst gesetzter, benannter Stand —
  zum Beispiel „Vor der Umstrukturierung". Manuelle Snapshots sind
  von der 20er-Grenze ausgenommen und bleiben erhalten, bis du sie
  löschst.

## Den Versionsverlauf öffnen

Rechtsklick auf ein Kapitel in der Kapitel-Sidebar öffnet das
Kontextmenü; wähle dort **Versionsverlauf**. Der Dialog listet die
automatischen Versionen und deine manuellen Snapshots, die neueste
zuerst.

## Einen Snapshot erstellen

Gib oben im Dialog optional einen Namen ein und klicke auf
**Snapshot erstellen**. Bibliogon sichert den aktuell gespeicherten
Stand des Kapitels als manuellen Snapshot. Manuelle Snapshots tragen
ein **Snapshot**-Abzeichen und ihren Namen; automatische Versionen
zeigen stattdessen ihre Versionsnummer (`v3`).

## Mit der aktuellen Fassung vergleichen

Das Vergleichssymbol neben einem Eintrag öffnet einen
zeilenweisen Vergleich gegen den **aktuellen** Kapitelinhalt:

- Grün hinterlegte Zeilen (`+`) stehen jetzt im Kapitel, fehlten aber
  im Snapshot.
- Rot hinterlegte Zeilen (`-`) waren im Snapshot vorhanden und sind
  jetzt entfernt.
- Eine Notiz oben weist auf einen geänderten Titel hin.

Mit **Zurück zur Liste** kehrst du zur Übersicht zurück.

## Wiederherstellen

**Wiederherstellen** ersetzt den aktuellen Kapitelinhalt durch die
gewählte Fassung. Das ist sicher: Bibliogon sichert den aktuellen
Stand zuvor automatisch als neue Version, sodass du nichts verlierst.
Eine Rückfrage bestätigt den Vorgang.

## Einen Snapshot löschen

Manuelle Snapshots lassen sich über das Papierkorb-Symbol dauerhaft
entfernen (mit Sicherheitsabfrage). Automatische Versionen kannst du
nicht einzeln löschen — sie werden über die 20er-Aufbewahrung
verwaltet.
