# Storyboard-Ansicht

Das **Storyboard** ist die Vogelperspektive auf alle Seiten eines Bilderbuchs — jede Seite als kleine Karte, in der Reihenfolge, mit Vorschaubild + erstem Textauszug + Layout-Tag + Inline-Annotationen. Praktisch, um die Erzähl-Dynamik über die typischen 32 oder 40 KDP-Bilderbuch-Seiten hinweg zu planen.

## Storyboard öffnen

Klicke im Bilderbuch-Editor auf den **Storyboard**-Button in der Kopfzeile (neben **Metadaten** + **PDF exportieren**). Die URL wechselt zu `?view=storyboard` — du kannst also direkt verlinken oder mit dem Browser-Zurück-Button zurück in den Editor.

Die Storyboard-Route ist in v1 **nur für Bilderbücher** verfügbar. Comic-Bücher und Prosa-Bücher zeigen den Button nicht. Die Schema-Spalten, auf denen das Storyboard arbeitet (notes, story_beat, mood_color, act_group), liegen schon im gemeinsamen Page-Modell, sodass eine spätere v2-Erweiterung auf Comic-Bücher ohne Schema-Migration funktioniert.

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

## Was (noch) NICHT im Storyboard ist

Auf spätere Sessions verschoben, festgehalten in `PICTURE-BOOK-STORYBOARD-OPERATIONS-01`:

- Seite zwischen zwei anderen einfügen
- Seite duplizieren
- Seite teilen
- Seiten zusammenführen
- Storyboard ausdrucken
- Akt-Gruppe automatisch übernehmen, wenn eine Karte über Gruppen-Grenzen hinweg gezogen wird

Diese Items sind gegen konkrete User-Nachfrage angelegt. Die aktuelle v2 deckt den **Annotations- + Übersichts- + Umsortier-Workflow** ab, der den täglichen Bilderbuch-Authoring-Rhythmus trägt.
