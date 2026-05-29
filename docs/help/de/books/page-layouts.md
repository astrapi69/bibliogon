# Bilderbuch-Seitenlayouts

Jede Bilderbuchseite wählt ein **Layout** — wie ihre Bilder und ihr Text auf der Seite angeordnet sind. Das Layout wird in einem kategorisierten Picker im Seiteneditor gewählt; ein Layout-Wechsel erhält die Einstellungen jedes Layouts (siehe [Text-Konfiguration](text-configuration.md) für die Tier-Eigenschaften pro Layout).

Es gibt 13 Layouts in 5 Kategorien.

## Bild mit Text

Die Einzelbild-Layouts kombinieren ein Bild mit einer Textregion:

- **Bild oben, Text unten** — Bild füllt den oberen Bereich, Text darunter.
- **Bild unten, Text oben** — das vertikale Spiegelbild.
- **Bild links, Text rechts** — nebeneinander mit einstellbarem Teilungsverhältnis.
- **Bild rechts, Text links** — das horizontale Spiegelbild.
- **Vollbild mit Text-Overlay** — Text liegt über einem randlosen Bild, mit Steuerung für Textposition, Hintergrund-Deckkraft und Container-Breite/-Höhe.
- **Bild als Rahmen mit zentriertem Text** — das Bild rahmt die Seite; der Text ist mittig platziert.

## Nur Bild

- **Vollbild (ohne Text)** — ein randloses Bild ohne Textregion. Für textlose Doppelseiten.

## Mehrere Bilder

- **Zwei Bilder mit zentriertem Text** — zwei Bilder mit einem zentrierten Textband dazwischen.
- **Split horizontal** — zwei Bilder nebeneinander.
- **Split vertikal** — zwei Bilder übereinander.
- **Collage** — siehe unten.

## Nur Text

- **Nur Text** — eine Textseite ohne Bild (z. B. eine Widmung oder ein Titel-Spread).

## Spezial

- **Sprechblase** — ein Bild mit einer oder mehreren positionierten Sprechblasen (Anker-Raster + Deckkraft + Größe), gemeinsam mit dem Comic-Blasen-Modell.

## Collage

Das **Collage**-Layout ist frei: du platzierst beliebig viele Bild- und Textregionen überall auf der Seite und änderst ihre Größe unabhängig.

- **Region hinzufügen** über die Editor-Werkzeugleiste, dann **ziehen** zum Positionieren und **an der Kante ziehen** zum Skalieren. Jede Region merkt sich Position und Größe.
- **Z-Index-Reihenfolge** bestimmt, welche Region oben liegt, wenn sich zwei überlappen — eine Region nach vorne holen oder nach hinten schieben.
- Die Regionsgeometrie wird pro Seite gespeichert; der WeasyPrint-PDF-Walker spiegelt das Editor-Layout, sodass das exportierte PDF zu deiner Anordnung auf der Arbeitsfläche passt.

Collage ist das flexibelste Layout — für Scrapbook-artige Doppelseiten, annotierte Illustrationen oder jede Seite, für die die strukturierten Layouts oben nicht passen.

## Layout wechseln

Ein Layout-Wechsel verliert nie die Konfiguration eines anderen Layouts: Die Einstellungen jedes Layouts liegen in einem eigenen Namensraum innerhalb des `layout_config` der Seite. Wechsle von Bild-oben zu Collage und zurück, und die Bild-oben-Einstellungen sind genau so, wie du sie verlassen hast. Beim Wechsel zwischen einem Rich-Text-Layout (TipTap) und einem eigenschaftsbasierten Layout wird der Textinhalt automatisch in die richtige Form konvertiert.

## Verwandte Themen

- [Text-Konfiguration](text-configuration.md) — Tier 1 (Visueller Stil) + Tier 2 (Typografie) Eigenschaften pro Layout
- [Storyboard-Ansicht](storyboard.md) — Drag-Reorder-Rasterübersicht aller Seiten
- [Export](../export/pdf.md) — wie Layouts im exportierten PDF gerendert werden
