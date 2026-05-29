# Comic-Panels anordnen

Im Comic-Editor kannst du die Panels einer Seite umsortieren und ein Panel auf eine andere Seite verschieben. Beides bezieht sich auf die Panels, die du unter der Rastervorlage der Seite (Splash, nebeneinander, 2x2 usw.) bereits angelegt hast.

## Panels auf derselben Seite umsortieren

Jedes Panel hat oben links einen kleinen Ziehgriff. Greife den Griff und ziehe das Panel auf eine andere Rasterzelle; die Panels tauschen in die neue Reihenfolge und die Änderung wird automatisch gespeichert.

- Die Reihenfolge ist die Panel-**Position**, die der PDF-Export liest, wenn er die Panels in die Rasterzellen setzt. Umsortieren im Editor sortiert also auch die exportierte Seite.
- Gezogen wird nur über den Griff - ein Klick auf die Panel-Fläche wählt das Panel weiterhin aus, und das Ziehen einer Sprechblase im Panel verschiebt weiterhin die Blase, nicht das Panel.
- Die neue Reihenfolge wird in einem Schritt geschrieben, sodass keine halb umsortierte Seite entstehen kann, falls beim Speichern etwas schiefgeht.

## Ein Panel auf eine andere Seite verschieben

Wähle ein Panel aus und klicke dann in der Panel-Aktionsleiste auf **Auf andere Seite verschieben**. Ein kleines Menü listet die übrigen Seiten des Buchs mit ihrer aktuellen Belegung auf - zum Beispiel `Seite 3 - 2/4 Panels`. Wähle eine Seite, und das Panel wandert dorthin und behält sein Bild und seine Sprechblasen.

- **Volle Seiten sind ausgegraut** mit dem Hinweis `(voll)`. Die Kapazität einer Seite ist die Zellenzahl ihrer Rastervorlage (Splash fasst 1, ein 2x2-Raster fasst 4 usw.), eine bereits volle Seite kann also kein weiteres Panel aufnehmen.
- Das Panel wird hinter den vorhandenen Panels der Zielseite angehängt.
- Die Seite, **von** der du das Panel verschoben hast, wird neu durchnummeriert, damit die verbleibenden Panels lückenlos in der Reihenfolge 1, 2, 3 bleiben.
- Eine Meldung bestätigt das Verschieben (`Panel auf Seite N verschoben`).

Hat das Buch nur eine Seite, zeigt das Menü "Keine weiteren Seiten vorhanden" - lege zuerst eine zweite Seite über die Seitenleiste an.

## Warum Verschieben ein Menü ist und kein Ziehen

Ein Panel bis auf eine Seite in der Seitenleiste zu ziehen würde bedeuten, dass die Arbeitsfläche und die Seitenleiste denselben Drag-Kontext teilen. Die Seitenleiste ist dieselbe Komponente, die auch der Bilderbuch-Editor verwendet, und einen gemeinsamen Drag-Kontext hindurchzuführen wäre eine große Änderung für beide Editoren gewesen. Das Menü erledigt dasselbe - Ziel wählen, Belegung sehen, Panel verschieben - ohne diesen Aufwand.
