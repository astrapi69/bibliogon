# Schreibverlauf

Der **Schreibverlauf** zeigt, wie viel du über die Zeit geschrieben
hast. Er ist das ausführliche Gegenstück zum
[Schreibziel-Widget](writing-goals.md) auf dem Dashboard: Statt nur des
heutigen Tages siehst du einen ganzen Zeitraum mit Statistiken, einem
Tagesdiagramm und einer Aufschlüsselung nach Buch und Kapitel.

## Was es macht

Der Schreibverlauf ist **global**: Er umfasst alle deine Bücher auf
einmal, nicht ein einzelnes Buch. Er liest die Wortzahlen pro Tag, die
Bibliogon bei jedem Speichern eines Kapitels erfasst, und stellt sie dar
als:

- Zusammenfassungs-Statistiken für den gewählten Zeitraum,
- ein Balkendiagramm pro Tag,
- eine Liste pro Buch, die sich zu Summen pro Kapitel aufklappt,
- einen CSV-Export der Tagessummen.

Es ist eine eigene Seite in der App (ein eigener Bildschirm), du kannst
sie also mit einem Lesezeichen versehen und mit der Zurück-Schaltfläche
des Browsers zurückkehren.

## So nutzt du es

1. Öffne das Dashboard.
2. Klicke im Schreibziel-Widget auf die Schaltfläche **Verlauf**.
3. Wähle oben auf der Seite den Zeitraum: **Letzte 30 Tage**,
   **Letzte 90 Tage** oder **Letzte 365 Tage**. Alle Statistiken und das
   Diagramm passen sich an.
4. Lies die Zusammenfassungs-Karten und das Diagramm für den schnellen
   Überblick.
5. Klicke in der Liste **Nach Buch** auf eine Buchzeile, um die
   Aufschlüsselung nach Kapitel aufzuklappen. Ein erneuter Klick klappt
   sie wieder zu.
6. Um die Daten weiterzuverwenden, klicke auf **CSV exportieren**.
7. Nutze die Zurück-Schaltfläche des Browsers (oder die Zurück-Funktion
   auf der Seite), um dorthin zurückzukehren, wo du herkamst.

## Statistiken

Die Zusammenfassungs-Karten zeigen für den gewählten Zeitraum:

- **Wörter gesamt**.
- **Aktive Tage** (Tage mit netto positiv geschriebenen Wörtern).
- **Ø pro aktivem Tag**.
- **Aktuelle Serie** aufeinanderfolgender aktiver Tage.
- **Längste Serie** im Zeitraum.

Unter den Karten zeigt ein **Balkendiagramm** die pro Tag geschriebenen
Wörter. Fahre mit der Maus über einen Balken, um den genauen Wert des
Tages zu sehen. Gibt es im Zeitraum kein Schreiben, erscheint statt des
Diagramms ein kurzer Hinweis "Noch kein Schreibverlauf in diesem
Zeitraum".

## Nach Buch und Kapitel

Die Liste **Nach Buch** zeigt die Wörter pro Buch im Zeitraum, jeweils
mit einem kleinen Balken zum schnellen Vergleich. Ein Klick auf ein Buch
klappt die Aufschlüsselung **nach Kapitel** auf. Wörter, deren Kapitel
inzwischen gelöscht wurde, sammeln sich unter **Gelöschte Kapitel** und
bleiben dem Buch zugeordnet.

## CSV-Export

Die Schaltfläche **CSV exportieren** lädt den täglichen Verlauf des
gewählten Zeitraums als CSV-Datei herunter. Die Datei enthält eine Zeile
pro Tag, du kannst sie also in einer Tabellenkalkulation öffnen oder in
eine eigene Auswertung einspeisen.

## Wo du es findest

Öffne den Schreibverlauf über die Schaltfläche **Verlauf** im
Schreibziel-Widget auf dem Dashboard. Die Seite hat eine eigene Adresse,
nach dem Öffnen kannst du sie also für den schnellen Zugriff mit einem
Lesezeichen versehen.

## Wie die Daten entstehen

Bibliogon zählt bei jedem Speichern eines Kapitels die Differenz der
Wortzahl und schreibt sie dem jeweiligen Buch und Kapitel des heutigen
Tages gut. Es werden nur **netto** geschriebene Wörter gezählt, das
Löschen von Text verringert die Tagessumme also. Das Tagesziel selbst
ist geräteabhängig und fließt nicht in den Verlauf ein; der Verlauf ist
auf jedem Gerät gleich, das sich mit deiner Bibliothek verbindet.

## Tipps

- Wechsle vor einem CSV-Export zum Zeitraum **365 Tage**, wenn du einen
  Jahresüberblick für deine eigene Nachverfolgung möchtest.
- Eine Reihe niedriger oder leerer Tage im Diagramm ist während starker
  Überarbeitung oder Recherche normal, wenn du so viel entfernst wie du
  hinzufügst.
- Die aktuelle und längste Serie zählen hier **aktive Tage** (jedes
  Netto-Schreiben), was breiter ist als die Tagesziel-Serie auf dem
  Dashboard (Tage, an denen du dein Ziel erreicht hast).

## Verwandte Themen

- [Schreibziele](writing-goals.md): das Tagesziel, die Serie und die Wortziele
- [Storyboard-Ansicht](../books/storyboard.md): Wortziele, Status und Labels pro Kapitel
- [Snapshots](snapshots.md): gespeicherte Versionen eines Kapiteltexts über die Zeit
