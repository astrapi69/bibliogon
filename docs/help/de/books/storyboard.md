# Storyboard-Ansicht

Das **Storyboard** ist die Vogelperspektive auf ein Buch — jede Seite (bzw. bei Prosa-Büchern jedes Kapitel) als kleine Karte, in der Reihenfolge, mit Vorschau, einem Story-Beat- / Stimmungs- / Akt-Gruppen-Annotationssatz und etwaigen Story-Bibel-Entity-Badges. Praktisch, um die Erzähl-Dynamik über den ganzen Bogen zu planen: die 32 oder 40 Seiten eines KDP-Bilderbuchs, die Panels eines Comics oder die Kapitel eines Romans.

## Storyboard öffnen

Das Storyboard ist für **jeden Buchtyp** verfügbar:

- **Bilderbücher und Comic-Bücher** — klicke im Seiten-Editor auf den **Storyboard**-Button in der Kopfzeile (neben **Metadaten** + **PDF exportieren**). Die URL wechselt zu `?view=storyboard` — du kannst also direkt verlinken oder mit dem Browser-Zurück-Button zurück in den Editor.
- **Prosa-Bücher** — klicke auf den **Storyboard**-Button in der Kapitel-Sidebar, um die Kapitelkarten-Variante zu öffnen (siehe Abschnitt *Prosa-Bücher* weiter unten).

Bilderbuch- und Comic-Seiten teilen sich dieselben vier Annotationsspalten (`notes`, `story_beat`, `mood_color`, `act_group`); Prosa-Bücher tragen dieselben vier auf jedem `Chapter`. Die vier Inline-Editoren sind eine gemeinsame `StoryboardAnnotations`-Komponente, sodass das Annotations-Erlebnis auf allen drei Oberflächen identisch ist.

## Eine Karte lesen

Jede Karte zeigt von oben nach unten:

- **Vorschaubild** — das Bild-Asset der Seite (oder ein Platzhalter-Icon für reine Text- oder bildlose Seiten).
- **Seitenzahl + Titel** — erste nicht-leere Zeile des Seitentexts (TipTap-tauglich: behandelt sowohl Klartext- als auch JSON-Layouts; bei ~60 Zeichen abgeschnitten).
- **Layout-Tag** + optionaler **Story-Beat-Badge**.
- **Beat-Auswahl + Stimmungs-Swatches + Akt-Gruppe-Eingabe + Notizen-Textfeld** — Inline-Annotations-Editoren (siehe unten).

Die **Stimmungsfarbe** färbt zusätzlich den linken Rand der Karte ein — gut für schnelles Scannen über das ganze Grid.

## Klicken + Ziehen

- **Karte anklicken**, um in den Editor zurückzukehren — die geklickte Seite ist dann ausgewählt.
- **Den Greif-Anker** (oben rechts in jeder Karte) ziehen, um Seiten umzusortieren. Der Anker wird beim Hover sichtbar. Das Umsortieren nutzt die bestehende Pages-API — gleiche atomare Transaktion wie die Seiten-Sidebar.
- **Drag ändert die Akt-Gruppe NICHT.** Seiten bleiben in der vom Autor gesetzten Gruppe, unabhängig davon, wo du sie visuell ablegst. Die Gruppe änderst du über das Akt-Gruppe-Eingabefeld auf jeder Karte.

## Annotations-Editoren

Alle vier Annotationen speichern **beim Blur / bei Auswahl-Änderung** — kein expliziter Speichern-Button. Fehler erscheinen als Toast; deine Eingabe bleibt im Feld erhalten, damit du erneut versuchen kannst.

### Notizen

Ein freies Textfeld pro Karte. Nur Autor-Memo — wird nicht im exportierten Buch gerendert. Typische Verwendung: Pacing-Notizen, Überarbeitungs-Flags, "Hier noch einen Übergang einbauen", Referenzen.

Wird das Textfeld geleert, schreibt das Storyboard `NULL` zurück, sodass der Platzhalter wieder erscheint.

### Story-Beat

Ein Dropdown pro Karte mit den sechs Standard-Beats der dramatischen Struktur:

| Beat | Wann im Bogen |
|---|---|
| **Exposition** | Eröffnung — Figur + Welt etablieren |
| **Auslösendes Ereignis** | Das Ereignis, das den Status quo stört |
| **Steigende Handlung** | Spannung baut sich auf |
| **Höhepunkt** | Der Peak — größte Entscheidung / größtes Risiko / stärkstes Bild |
| **Fallende Handlung** | Konsequenzen spielen sich aus |
| **Auflösung** | Abklingen, Rückkehr zu einer neuen Normalität |

Die Option "— kein Beat —" entfernt den Beat. Der gewählte Beat erscheint als farbiger Badge über dem Dropdown — fürs schnelle visuelle Scannen des Bogens.

### Stimmungsfarbe

Eine Reihe von 10 voreingestellten Swatches, die typische Bilderbuch-Stimmungen abdecken:

| Swatch | Stimmung |
|---|---|
| #FFC857 | Sonnig |
| #FF6B6B | Leidenschaftlich |
| #4ECDC4 | Ruhig |
| #C7B8EA | Verträumt |
| #7FB069 | Friedlich |
| #F18A07 | Abenteuerlich |
| #F4A6CD | Zart |
| #6C7A89 | Düster |
| #2E4057 | Geheimnisvoll |
| #F4ECD8 | Sanft |

Klicke einen Swatch, um die Farbe zu setzen. Klicke den aktuell gewählten Swatch, um sie wieder zu entfernen. Der X-Button neben der Palette ist eine alternative Lösch-Möglichkeit (nur sichtbar, wenn eine Farbe gesetzt ist).

Die gewählte Farbe zeichnet den linken Rand der Karte ein. Eigene Hex-Farben sind eine spätere Erweiterung (`STORYBOARD-MOOD-FREE-PICKER-01`) — vorerst decken die 10 Presets die üblichen Fälle ohne zusätzliche Abhängigkeit ab.

### Akt-Gruppe

Ein freies Eingabefeld pro Karte. Seiten mit demselben `act_group`-Wert werden unter einer gemeinsamen Gruppen-Überschrift im Grid gerendert; Seiten ohne `act_group` landen in einer untitled trailing Gruppe.

Leere oder nur-Whitespace-Werte entfernen die Akt-Gruppe. **Enter** bestätigt den Wert (gleicher Effekt wie das Klicken außerhalb des Felds).

Typische Werte: `Akt I` / `Akt II` / `Akt III`, oder Kapitel-Labels wie `Prolog` / `Wald` / `Schloss`, oder jede andere Gruppierung, die für den Autor sinnvoll ist.

## Story-Bibel-Entities

Ist das [Story-Bibel](../story-bible.md)-Plugin aktiv, dient das
Storyboard zugleich als deine Oberfläche zur Auftrittsplanung:

- **Ziehe eine Entity** aus der Story-Bibel-Sidebar auf eine Karte,
  um festzuhalten, dass die Figur / der Schauplatz / der Gegenstand
  auf dieser Seite vorkommt.
- Verknüpfte Entities erscheinen als **farbcodierte Badges** auf der
  Karte, in ihrer Entity-Typ-Farbe.
- Der **Entity-Filter** oben im Storyboard schränkt das Raster auf
  die Seiten ein, auf denen die ausgewählten Entities auftreten —
  praktisch, um den Auftritts-Rhythmus einer Figur zu prüfen oder
  jede Seite zu finden, die sich zwei Figuren teilen.

Diese Verknüpfungen speisen den Auftritts-Tracker, die
[Arc-Ansicht](../story-bible/arc-view.md) und den
Kontinuitäts-Prüfer.

## Prosa-Bücher (Kapitelkarten)

Prosa-Bücher (Romane, Sachbücher, alles Kapitel-basierte) erhalten
eine Kapitelkarten-Variante des Storyboards, die über den
**Storyboard**-Button in der Kapitel-Sidebar geöffnet wird. Jede
Karte steht für ein Kapitel und zeigt:

- Den **Kapiteltitel** und eine **Wortzahl** (aus dem
  TipTap-Inhalt des Kapitels berechnet).
- Dieselben vier Inline-Annotationen wie eine Seitenkarte — Notizen,
  Story-Beat, Stimmungsfarbe und Akt-Gruppe — getragen von den
  gemeinsamen `StoryboardAnnotations`-Editoren.

Ziehe eine Karte am Anker, um Kapitel umzusortieren; klicke eine
Karte, um zu diesem Kapitel im Editor zurückzukehren. Nutze
Stimmungsfarben und Akt-Gruppen, um Akte und Pacing über ein ganzes
Manuskript hinweg auf einen Blick zu blocken.

## Was (noch) NICHT im Storyboard ist

Auf spätere Sessions verschoben, festgehalten in `PICTURE-BOOK-STORYBOARD-OPERATIONS-01`:

- Seite zwischen zwei anderen einfügen
- Seite duplizieren
- Seite teilen
- Seiten zusammenführen
- Storyboard ausdrucken
- Akt-Gruppe automatisch übernehmen, wenn eine Karte über Gruppen-Grenzen hinweg gezogen wird

Diese Items sind gegen konkrete User-Nachfrage angelegt. Die aktuelle v2 deckt den **Annotations- + Übersichts- + Umsortier-Workflow** ab, der den täglichen Bilderbuch-Authoring-Rhythmus trägt.

## Verwandte Themen

- [Story-Bibel](../story-bible.md) — die Entity-Datenbank, deren Badges und Auftritte auf den Karten erscheinen
- [Arc-Ansicht und Kontinuitäts-Prüfer](../story-bible/arc-view.md) — die Timeline aus den Storyboard-Auftritten
- [Text-Konfiguration für Bilderbuch-Seiten](text-configuration.md) — Tier 1 + Tier 2 Eigenschaften, die im Seiten-Editor pro Seite gesetzt werden
- [Editor-Anzeige-Einstellungen](../editor/display-settings.md) — Schriftart, Größe, Zeilenhöhe und Spaltenbreite pro Browser
