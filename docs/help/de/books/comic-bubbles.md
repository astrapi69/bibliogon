# Sprechblasen-Typen

Bibliogons Comic-Editor unterstützt sechs Sprechblasen-Typen. Jeder hat eine eigene Form, ein eigenes Tail-Verhalten und einen typischen Einsatzzweck. Diese Seite ist die visuelle Referenz: wie jeder Typ aussieht, wann man welchen wählt, welche Schrauben du hast.

Alle sechs Typen werden als ein einziger SVG-Pfad pro Sprechblase gerendert (Kontur + Tail in einer durchgehenden Form) — keine sichtbare Naht zwischen CSS-Form und Polygon-Tail, keine Rasterisierungs-Überraschungen beim PDF-Export. Der gleiche Pfad-Generator läuft sowohl in der Editor-Vorschau als auch im WeasyPrint-PDF-Walker, also passt das, was du im Browser siehst, zu dem, was KDP bekommt.

## Auf einen Blick

![Alle sechs Sprechblasen-Typen in einem Panel](../../assets/screenshots/comic-bubble-types-all.png)

| Typ | Form | Tail | Standard-Einsatz |
|---|---|---|---|
| **Speech** | Abgerundetes Rechteck | Bezier-S-Kurve | Gesprochener Dialog |
| **Thought** | Ellipse (Oval) | 1–3 kleiner werdende Kreise | Innerer Monolog |
| **Narration** | Rechteck | Kein Tail — der Erzähler zeigt nicht auf eine Person | Erzähler-Boxen / Szenen-Einstieg |
| **Shout** | 20-zackiger Stern | Eine Zacke zum Sprecher verlängert | Schreien, Ausruf, lauter Wort-Laut |
| **Whisper** | Abgerundetes Rechteck, gestrichelt | Bezier-S-Kurve | Leise Bemerkung, Geheimnis |
| **Sound-Effekt** | Keine Sprechblase — nur Text | Kein Tail | „BAM!", „WHOOSH!", Sound im Panel |

## Die sechs Typen im Detail

### Speech

![Speech-Sprechblase](../../assets/screenshots/comic-bubble-speech.png)

Die klassische Comic-Sprechblase. Ein abgerundetes Rechteck mit einer kurvigen Bezier-Spitze zum Sprecher. Die Spitze ist kein scharfes Dreieck, das seitlich angeklebt ist — sie fließt aus der Kontur heraus als Teil derselben Form, also wirkt die Blase wie eine organische Figur statt eine Form mit aufgeklebtem Dreieck.

Nimm sie für jeden Charakter-Dialog. Die Tail-Richtung, -Länge und -Position auf der Kante sind pro Sprechblase einstellbar.

### Thought

![Gedanken-Sprechblase](../../assets/screenshots/comic-bubble-thought.png)

Eine Ellipse (Oval) mit einer Kette von kleiner werdenden Kreisen in Tail-Richtung — das klassische „Denken"-Signal. Der ovale Körper trennt den Gedanken visuell vom gesprochenen Dialog, und die Kreis-Kette liest sich als „das wird nicht ausgesprochen, das wird gedacht". Die Kette zeigt 1 bis 3 Kreise, abhängig von der Tail-Länge (längerer Tail → mehr Kreise, kleiner). Jeder Kreis ist 60 % so groß wie der vorhergehende.

Nimm sie für innere Monologe, Träume, Hypothetisches — alles, was der Charakter nicht laut ausspricht.

### Narration

![Narration-Box](../../assets/screenshots/comic-bubble-narration.png)

Ein Rechteck ohne Tail. Narration-Boxen sind die Stimme des Erzählers, nicht eines Charakters — sie zeigen also auf niemanden. Selbst wenn das `tail_direction`-Feld einen Wert aus einer früheren Konvertierung enthält, ignoriert Narration ihn und rendert immer ohne Tail.

Die Standard-Füllung ist Pergament-Beige (`#f5f5dc`) — der übliche „das ist der Erzähler, nicht ein Charakter"-Farbcode. Pro Sprechblase überschreibbar im Eigenschaften-Panel.

Nimm sie für „Inzwischen, im Keller …", Zeitsprünge, Szenen-Einstellungen.

### Shout

![Shout-Sprechblase](../../assets/screenshots/comic-bubble-shout.png)

Ein 20-zackiger Stern — das visuelle Signal für Schreien, Ausruf, alles Laute. Der Tail wird nicht als separates Element gezeichnet: die Zacke, die der Tail-Richtung am nächsten liegt, wird nach außen verlängert, und die zwei Nachbarzacken bilden die natürliche Basis. Der Stern absorbiert den Tail in seine eigene Kontur.

Nimm sie, wenn der Charakter schreit, ausruft oder ein lautes Wort als erkennbare Sprache produziert. Für reine Sound-Effekte („BAM!") nimm stattdessen **Sound-Effekt**.

### Whisper

![Whisper-Sprechblase](../../assets/screenshots/comic-bubble-whisper.png)

Gleiche Konturform wie Speech, aber die Linie ist gestrichelt. Das visuelle Signal ist „das ist leise" — die gebrochene Kontur liest sich als gedämpfte Stimme.

Nimm sie für Bemerkungen am Rande, Geheimnisse, Halbgesprochenes. Der Bezier-S-Kurven-Tail ist identisch mit Speech — nur der Linien-Stil unterscheidet sich.

### Sound-Effekt

![Sound-Effekt](../../assets/screenshots/comic-bubble-sound-effect.png)

Gar keine Sprechblase — nur der gestylte Text im Panel. Fett, kursiv, mit subtilem Text-Schatten, damit der Text auch auf vollen Panel-Bildern lesbar bleibt.

Nimm ihn für „BAM!", „WHOOSH!", „KNACK!" — Lautmalerei, wo die Schrift selbst die Illustration ist. Größe und Position wie bei jeder anderen Sprechblase einstellbar; der Unterschied ist nur, dass keine Kontur gezeichnet wird.

## Eine Sprechblase konfigurieren

Jede Sprechblase trägt dieselben Felder, egal welcher Typ:

- **Sprechblasen-Typ** — der Picker oben im Eigenschaften-Panel. Beim Typ-Wechsel rendert die Form sofort neu; der Textinhalt bleibt erhalten.
- **Anker** (`x_pct` / `y_pct`) — wo im Panel das Zentrum der Sprechblase sitzt, in Prozent. Per Drag visuell setzbar; der Slider im Eigenschaften-Panel zeigt denselben Wert.
- **Breite** / **Höhe** (`width_pct` / `height_pct`) — Größe in Prozent der Panel-Größe.
- **Tail-Richtung** — eine der 8 Oktanten (N, NE, E, SE, S, SW, W, NW) oder `none`. Bei Narration + Sound-Effekt ignoriert (zeichnen nie einen Tail).
- **Tail-Position** (`tail_position_pct`) — wo entlang der Sprechblasen-Kante der Tail startet. 0 = ferne Ecke; 100 = die andere Ecke; 50 = Mitte der Kante.
- **Tail-Länge** (`tail_length_px`) — wie weit der Tail über die Sprechblasen-Box hinausgeht. Die Thought-Kette nutzt diesen Wert, um zu entscheiden, wie viele Kreise zu zeichnen sind.

Pro-Sprechblase-Style-Overrides (Farbe, Linienstärke, Schrift, Padding) liegen im selben Eigenschaften-Panel unter **Style**.

## Was beim PDF-Export überlebt

Derselbe SVG-Pfad, den der Editor zeichnet, wird in das von WeasyPrint generierte PDF eingebettet. Es gibt keine separate „PDF-Render-Pipeline", die Sprechblasen von Grund auf neu erzeugt — der Pfad-String fließt direkt durch. Also:

- Visuelle Eigenheiten, die du im Editor siehst (Tail in die falsche Richtung, zu dünne Linie), erscheinen im PDF genauso.
- Im Editor gefixt = im PDF gefixt.
- Die KDP-Print-Profile, die `picture_book_pdf` unterstützt (5 Trim-Größen + optionale Anschnitt-Marken), funktionieren bei Comics genauso.

Wenn das PDF-Render von der Editor-Vorschau abweicht, ist das ein Bug — bitte melde ihn mit dem Editor-Screenshot UND der PDF-Seite.
