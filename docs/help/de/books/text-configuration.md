# Text-Konfiguration für Bilderbuch-Seiten

Bilderbuch-Seiten mit Textbereich (image_top_text_bottom, image_left_text_right, image_full_text_overlay) führen **Tier 1 + Tier 2**-Sektionen zur Text-Konfiguration im Eigenschaften-Bereich des Seiten-Editors. Gleiche Form wie die Sprechblasen-Konfiguration — der Textcontainer des Layouts erhält dieselben 14 Eigenschaften (8 visuelle Stile + 6 Typografie-Felder), plus zwei zusätzliche Maß-Slider für das Overlay-Layout.

## Die Tier-Sektionen öffnen

Öffne eine beliebige Bilderbuch-Seite, die eines der drei bildbasierten Layouts verwendet. Der Eigenschaften-Bereich zeigt die layout-spezifischen Steuerelemente (Bildposition, Bildanpassung, …), gefolgt von zwei aufklappbaren Sektionen:

- **Visueller Stil** (Tier 1) — Hintergründe, Rahmen, Schatten, Innenabstand
- **Typografie** (Tier 2) — Schriftart, -stärke, -größe, -farbe, Ausrichtung

Klicke auf das Chevron, um eine Sektion zu öffnen. Standardmäßig sind die Sektionen eingeklappt, damit der Eigenschaften-Bereich aufgeräumt bleibt.

## Tier 1 — Visueller Stil (8 Felder)

| Feld | Bereich / Werte | Standard |
|---|---|---|
| **Hintergrundfarbe** | Hex-Farbwähler | keine (transparent) |
| **Rahmenfarbe** | Hex-Farbwähler | `#000000` |
| **Rahmenbreite** | 0-8 px | 0 (kein Rahmen) |
| **Rahmenstil** | Durchgezogen / Gestrichelt / Gepunktet / Keiner | Keiner |
| **Eckenradius** | 0-50 % | 0 |
| **Schatten** | Umschalter | aus |
| **Schattenintensität** | 0-10 | 5 (deaktiviert wenn Schatten aus) |
| **Innenabstand** | 0-32 px | erbt den CSS-Standard |

Rahmen werden nur gezeichnet, wenn **Rahmenbreite > 0 UND Rahmenstil ≠ Keiner** ist. Standardstil ist "Keiner", damit eine Rahmenbreite ungleich Null nicht versehentlich einen Rahmen zeichnet.

## Tier 2 — Typografie (6 Felder)

| Feld | Bereich / Werte | Standard |
|---|---|---|
| **Schriftart** | Auswahl kinderfreundlicher Schriften | Atkinson Hyperlegible |
| **Schriftgröße** | 10-32 pt | erbt den CSS-Standard |
| **Schriftstärke** | Normal / Fett | erbt den CSS-Standard |
| **Kursiv** | Umschalter | aus |
| **Textfarbe** | Hex-Farbwähler | erbt den CSS-Standard |
| **Textausrichtung** | Links / Mitte / Rechts | erbt den CSS-Standard |

Wenn ein Tier-2-Feld auf "erbt" bleibt, gilt der CSS-Standard — dieselbe Optik wie bei einem frischen Bilderbuch ohne Tier-Konfiguration. Setze ein Feld, um es zu überschreiben.

## Nur Overlay — Textcontainer-Breite + -Höhe

Das `image_full_text_overlay`-Layout fügt **zwei Maß-Slider** über den Tier-Sektionen hinzu:

- **Textbereich-Breite** (30-100 %, Standard 100 %) — verschmälert das Textband horizontal mittig auf der Seite
- **Textbereich-Höhe** (15-100 %, Standard "auto") — begrenzt die Höhe des Bandes; "auto" lässt das Band entsprechend Textposition + Inhalt frei wachsen

Sie wirken zusammen mit den vorhandenen **Textposition**-Optionen (Oben / Mitte / Unten) und der **Hintergrund-Deckkraft**. Wird eine eigene Breite gesetzt, wird das Band mittig zentriert; die Seiten-Abstände füllen die übrige Canvas-Breite.

## Wie die Konfiguration gespeichert wird

Jedes Tier-Element speichert automatisch nach einer kurzen Verzögerung (300 ms bei Slidern + Farbwählern; sofort bei Dropdowns + Checkboxen). Gespeichert wird über das `layout_config`-Feld der Seite; das pro-Layout-Namespacing hält die Einstellungen je Layout unabhängig (Wechsel image_top → image_left → image_top bewahrt also die image_top-Konfiguration über die ganze Sequenz).

Es gibt keinen Speichern-Button. Schlägt das Speichern fehl, erscheint eine Fehler-Toast; deine laufende Eingabe bleibt im Feld, damit du es erneut versuchen kannst.

## Layout-Wechsel bewahrt Tier-Konfiguration

Frühere Bibliogon-Versionen (v0.33.1) haben die `layout_config` beim Layout-Wechsel **geleert** (um zu verhindern, dass alte Schlüssel von einem Layout ins andere bluten). Mit Fix B (dieser Release) lebt jede Layout-Konfiguration in ihrem eigenen Namespace innerhalb der `layout_config`. Der Wechsel zwischen Layouts bewahrt beide Konfigurationen — ein Rück-Wechsel reaktiviert die zuvor gesetzte Tier-Konfiguration.

Wenn du vor Fix B mit den Layouts experimentiert hast, wurden deine alten Konfigurationen bereits gelöscht (Fix A hatte sie geleert). Ab jetzt bleiben Konfigurationen erhalten.

## Was abgedeckt ist + was vertagt wurde

**Abgedeckt (dieser Release):**
- Tier 1 + Tier 2 für image_top_text_bottom, image_left_text_right, image_full_text_overlay
- Overlay-Maß-Slider für Breite + Höhe
- Layout-Wechsel-Bewahrung über den pro-Layout-Namespace
- TipTap-Reichtext-Bearbeitung (bereits in v0.35.0 ausgeliefert) für image_top, image_left, text_only
- Aktive Text-Konvertierung beim Layout-Wechsel: wechselst du von einem TipTap-Layout (image_top, image_left, text_only) zu einem Tier-Property-Layout (speech_bubble, image_full_text_overlay), wird der Text automatisch in die einfache Textform umgewandelt. Beim Rückwechsel wird der einfache Text wieder in eine TipTap-Struktur eingebettet.

**Vertagt auf Folge-Sessions:**
- Das `text_only`-Layout hat in diesem Release keine Tier-Sektionen (kein Bild zum Komponieren; das Layout hat aktuell überhaupt keine Konfiguration-UI). Wird gefiled, sobald Autor-Nachfrage entsteht.

## Wo findest du die Steuerungen?

| Layout | Inhalte im Eigenschaften-Bereich (oben nach unten) |
|---|---|
| `image_top_text_bottom` | Bildposition (Radio) + Bildanpassung (Dropdown) + Tier 1 + Tier 2 |
| `image_left_text_right` | Aufteilungs-Slider + Bildanpassung (Dropdown) + Tier 1 + Tier 2 |
| `image_full_text_overlay` | Textposition (Dropdown) + Hintergrund-Deckkraft + Container-Breite + Container-Höhe + Tier 1 + Tier 2 |
| `speech_bubble` | Anker-3×3-Raster + Deckkraft + Breite + Höhe + Tier 1 + Tier 2 |
| `text_only` | (keine Konfiguration-UI in diesem Release) |

Alle Tier-Konfigurationen werden im Editor-Preview und im exportierten PDF identisch wiedergegeben.

## Verwandte Themen

- [Storyboard-Ansicht](storyboard.md) — Drag-Reorder-Raster mit Notizen, Story-Beats, Stimmungsfarben und Akt-Gruppen
- [Editor-Anzeige-Einstellungen](../editor/display-settings.md) — Schriftart, Größe, Zeilenhöhe pro Browser
- [Export](../export/pdf.md) — wie die Tier-Konfiguration im exportierten PDF rendert
