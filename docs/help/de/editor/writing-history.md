# Schreibverlauf

Der **Schreibverlauf** zeigt, wie viel du über die Zeit geschrieben
hast. Er ist das ausführliche Gegenstück zum [Schreibziel-Widget](writing-goals.md)
auf dem Dashboard: Statt nur des heutigen Tages siehst du einen ganzen
Zeitraum mit Statistiken, einem Tagesdiagramm und einer Aufschlüsselung
nach Buch und Kapitel.

## Öffnen

Klicke im Schreibziel-Widget auf dem Dashboard auf den Button
**Verlauf**.

## Zeitraum

Oben wählst du den Zeitraum: **Letzte 30 / 90 / 365 Tage**. Alle
Statistiken und Diagramme aktualisieren sich entsprechend.

## Statistiken

- **Wörter gesamt** im Zeitraum.
- **Aktive Tage** (Tage mit netto positiv geschriebenen Wörtern).
- **Ø pro aktivem Tag**.
- **Aktuelle Serie** und **längste Serie** aufeinanderfolgender
  aktiver Tage.

Darunter zeigt ein Balkendiagramm die pro Tag geschriebenen Wörter.

## Nach Buch und Kapitel

Die Liste **Nach Buch** zeigt die Wörter pro Buch im Zeitraum. Ein
Klick auf ein Buch klappt die Aufschlüsselung nach Kapitel auf. Wörter,
deren Kapitel inzwischen gelöscht wurde, sammeln sich unter
**Gelöschte Kapitel** und bleiben dem Buch zugeordnet.

## CSV-Export

**CSV exportieren** lädt den täglichen Verlauf des gewählten Zeitraums
als CSV-Datei (`day,words_written`) herunter - praktisch für eigene
Auswertungen oder Tabellen.

## Wie die Daten entstehen

Bibliogon zählt bei jedem Speichern eines Kapitels die Differenz der
Wortzahl und schreibt sie dem jeweiligen Buch + Kapitel des heutigen
Tages gut. Es werden nur netto geschriebene Wörter gezählt; das
Tagesziel selbst ist geräteabhängig und fließt nicht in den Verlauf
ein.
