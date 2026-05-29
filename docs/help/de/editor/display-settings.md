# Editor-Anzeige-Einstellungen

Über das Zahnrad-Symbol rechts neben der Editor-Toolbar lässt sich ein kleines Popover öffnen, in dem die Editor-Darstellung pro Gerät angepasst werden kann.

![Editor-Anzeige-Einstellungen-Popover](../../assets/screenshots/editor-display-settings.png)

## Optionen

- **Breite** — Voll (keine Begrenzung), 900, 780 oder 680 Pixel. Engere Spalten lesen sich auf großen Monitoren angenehmer.
- **Schriftart** — Serif oder Sans-Serif.
- **Schriftgröße** — Klein, Mittel oder Groß.
- **Zeilenhöhe** — Kompakt, Normal oder Entspannt.

## Persistenz

Die Einstellungen werden in `localStorage` gespeichert (Schlüssel `bibliogon-editor-display-settings`). Sie gelten **pro Browser und Gerät**, nicht pro Konto oder pro Buch — eine Wahl auf dem Laptop verändert das Tablet nicht. Mit **Standard wiederherstellen** lassen sich alle vier Werte auf die Voreinstellung zurücksetzen.

Die Einstellungen wirken sowohl im Buch- als auch im Artikel-Editor — beide nutzen denselben Editor-Code.

## Vollbildmodus

Die Seiteneditoren (Bilderbuch, Comic) und die Storyboard-Ansicht haben einen **Vollbild-Umschalter** im Kopfbereich — das Vergrößern-Symbol bei den übrigen Kopf-Steuerelementen. Er nutzt den nativen Vollbildmodus des Browsers, sodass die Arbeitsfläche den ganzen Bildschirm ohne App-Rahmen füllt; zum Beenden das Symbol erneut anklicken, **Esc** oder **F11** drücken. Vollbild ist praktisch beim Anordnen von Comic-Panels oder beim Gestalten einer Collage, wo jeder Pixel Arbeitsfläche zählt.

## Verwandte Themen

- [Zeilenumbruch (Alt+Z)](word-wrap.md) — Tastenkürzel für langes-Zeile-Layout im Markdown-Modus
- [Storyboard-Ansicht](../books/storyboard.md) — Bilderbuch-Übersicht mit Drag-Reorder + Annotationen
- [Einstellungen-Navigation](../settings/sidebar.md) — App-weite Einstellungen unter dem Sidebar-Layout
