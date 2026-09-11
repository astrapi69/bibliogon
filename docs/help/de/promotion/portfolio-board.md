# Portfolio-Board

Das Portfolio-Board zeigt in einer Matrix, welches Buch in welchem Verkaufsformat existiert und welches Format noch fehlt. Eine Zeile pro Buch, eine Spalte pro Format: eBook, Taschenbuch, Hardcover.

Du erreichst es über das Raster-Symbol in der Kopfzeile des Bücher-Dashboards oder direkt über `/portfolio`.

## Wofür das Board gut ist

Vorher lebte diese Information in einer handgepflegten CSV-Datei plus einer Notizliste mit Einträgen wie „Hardcover fehlt". Beide sind auseinandergelaufen. Das Board liest denselben Zustand aus der Datenbank, und jede Änderung wird sofort gespeichert.

## Status pro Format

Jede Zelle hat einen Status:

- **Im Verkauf** — das Format ist veröffentlicht und kaufbar.
- **Entwurf** — hochgeladen, aber noch nicht veröffentlicht.
- **Fehlt** — das Format existiert noch nicht.

Entwurf und Fehlt gelten als Lücke. Lücken sind farblich markiert und stehen zusätzlich als Chip in der Buchzeile. Ein Buch ohne Lücke zeigt „vollständig".

Der Status wird direkt im Auswahlfeld der Zelle geändert. Eine Auswahl, ein Schreibvorgang.

## Shop-Link und ASIN

Über das Stift-Symbol in der Zelle öffnet sich ein Feld für den Shop-Link. Speichern schreibt ihn sofort; danach wird der Link als „Shop" in der Zelle angezeigt und öffnet sich in einem neuen Tab.

Die ASIN wird nur angezeigt, nicht bearbeitet. Sie liegt in den Buchmetadaten (`asin_ebook`, `asin_paperback`, `asin_hardcover`), die auch das KDP-Plugin liest. Geändert wird sie im Metadaten-Editor des Buchs, damit es nur eine Quelle gibt.

## Universal-Link

Die letzte Spalte nimmt den plattformübergreifenden Link pro Buch auf, etwa einen books2read-Link. Die Schaltfläche zum Speichern ist erst aktiv, wenn du den Wert geändert hast. Ein leeres Feld löscht den Link.

## Filter

- **Pen Name** und **Sprache** filtern serverseitig. Die Auswahllisten kommen aus dem vollständigen Board, nicht aus der gefilterten Ansicht — du kommst also immer zurück.
- **Nur Lücken** zeigt ausschließlich Bücher mit mindestens einem nicht verkauften Format. Das ist die Arbeitsliste.
- **Filter zurücksetzen** erscheint, sobald ein Filter aktiv ist.

Passt kein Buch zum Filter, meldet das Board „Keine Treffer". Das ist etwas anderes als der Erstzustand, der erscheint, solange überhaupt kein Buch angelegt ist.

## Nur in der Desktop-App

Der Zustand pro Format liegt in einer Tabelle des Promotion-Plugins und hat keine Offline-Kopie im Browser. In der reinen Browser-Version ist das Board deshalb sichtbar, aber deaktiviert, mit einem entsprechenden Hinweis.
