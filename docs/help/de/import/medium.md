# Aus einem Medium-Archiv importieren

Bibliogon kann ein Medium-HTML-Archiv importieren und daraus
pro Artikel einen **Artikel** plus einen **Publication**-Eintrag
erzeugen. Die Herkunft wird in einer eigenen Tabelle gespeichert,
sodass Mehrfach-Importe Duplikate erkennen.

## So holst du dein Archiv von Medium

1. Bei [medium.com](https://medium.com) anmelden.
2. **Einstellungen** → **Konto** → **Lade deine Informationen
   herunter** öffnen.
3. **ZIP herunterladen** anklicken. Medium schickt dir eine
   E-Mail mit einem Download-Link; das Archiv ist meist
   innerhalb weniger Minuten fertig.
4. Die ZIP lokal speichern. Du musst sie nicht entpacken.

## So importierst du in Bibliogon

1. **Einstellungen** → **Plugins** → **Medium-Import** öffnen.
2. Die ZIP in das Upload-Feld ziehen, oder mit **Datei auswählen**
   manuell wählen.
3. Auf **Importieren** klicken.

Bibliogon durchläuft jede `posts/*.html`-Datei im Archiv und
erzeugt pro Artikel:

- Einen **Artikel** mit Titel, Untertitel, Sprache
  (standardmäßig Englisch; im Editor pro Artikel umstellbar),
  TipTap-Inhalt und `status = published`.
- Einen **Publication**-Eintrag auf der Plattform **Medium**,
  inklusive Canonical-URL und ursprünglichem Veröffentlichungs-
  datum.
- Eine **Artikel-Importquelle** (Provenienz-Eintrag). Wenn du
  dasselbe Archiv erneut importierst, werden bereits importierte
  Artikel anhand ihrer Canonical-URL erkannt und übersprungen.

## Was wird importiert

- Titel, Untertitel, Autorname und Veröffentlichungsdatum.
- Inhalt: Absätze, Überschriften (H2 / H3 / H4), Zitate,
  Code-Blöcke (mit Sprache), Aufzählungen und nummerierte Listen,
  Inline-Auszeichnungen Fett, Kursiv, Inline-Code und Links.
- Bilder: Standardmäßig wird jedes Bild lokal gespeichert, damit
  der Artikel auch dann funktioniert, wenn Medium die CDN-URL
  irgendwann ändert. Bildunterschriften werden als Bildtitel
  übernommen.

## Was NICHT importiert wird (Medium liefert es nicht)

- **Tags**: Im HTML-Export sind keine Tags enthalten. Importierte
  Artikel haben anfangs eine leere Tag-Liste; trage sie im Editor
  nach.
- **Entwürfe**: Nur veröffentlichte Medium-Beiträge sind im
  Export enthalten.
- **Lesedauer, Claps, Antworten**: Das sind Plattform-Metriken,
  kein Inhalt.
- **Publikationszugehörigkeit**: Wenn ein Beitrag unter einer
  Medium-Publication erschienen ist, bleibt die Canonical-URL
  erhalten; der Publication-Name wird aber nicht als eigenes
  Feld gespeichert.

## Was passiert beim erneuten Import desselben Archivs

Artikel, deren Canonical-URL bereits zu einem bestehenden
Bibliogon-Artikel gehört, werden beim zweiten Lauf
**übersprungen**. Die Zusammenfassung am Ende listet jeden
übersprungenen Beitrag mit der ID des bereits vorhandenen
Artikels auf, damit du das Duplikat findest.

## Was passiert, wenn ein Beitrag nicht importiert werden kann

Die Zusammenfassung listet jeden fehlgeschlagenen Beitrag mit
dem Quell-Dateinamen und der Fehlermeldung. Andere Beiträge
laufen normal weiter; ein einzelner Fehler bricht den ganzen
Batch nicht ab.

## Nach dem Import

Die importierten Artikel erscheinen im **Dashboard** wie alle
manuell erstellten Artikel. Typische Folgeaufgaben:

- **Unerwünschte Artikel archivieren**: Im Dashboard auswählen
  und über **In den Papierkorb verschieben** entfernen. Beiträge,
  die du nicht in Bibliogon behalten möchtest (verlassene
  Posts, alte Versuche), kannst du nach dem Import bequem
  aussortieren.
- **Tags ergänzen**: Medium hat keine geliefert; pro Artikel im
  Editor nachtragen.
- **Sprache anpassen**: Standardmäßig Englisch. Deutsche /
  spanische / weitere Artikel im Metadaten-Panel des Editors
  umstellen.
- **Cross-Posts prüfen**: Der Publication-Eintrag verfolgt die
  Medium-URL. Wenn du denselben Artikel später auf Substack oder
  deinem eigenen Blog veröffentlichst, kannst du eine zweite
  Publication auf dieser Plattform anlegen.

## Einschränkungen

- Sequenzielle Verarbeitung: Bei 200 Beiträgen dauert der Import
  einige Minuten, während die Bilder heruntergeladen werden.
- Bild-Downloads können für einzelne Bilder fehlschlagen
  (Netzwerkprobleme, gelöschte Originale). Jeder Bild-Fehler
  wird als Warnung im Provenienz-Eintrag des Artikels
  festgehalten, bricht aber den Import nicht ab.
- Selektiver Import (Vorab-Auswahl bestimmter Beiträge) gehört
  **nicht** zur v1 des Importers. Importiere zunächst alles und
  archiviere danach, was du nicht behalten willst.
