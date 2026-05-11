# Medium-Import

Bibliogon importiert das gesamte Medium-Archiv, das du über "Download your information" erhältst. Jeder Beitrag wird ein Bibliogon-Artikel mit Provenienz-Metadaten und (optional) lokal heruntergeladenen Bildern.

## Wann verwenden

- Du verlässt Medium und möchtest eine strukturierte lokale Kopie jedes Beitrags.
- Du bist auf deine eigene Publikation umgezogen und möchtest den gesamten Katalog in Bibliogon durchsuchbar haben.
- Du willst weiter in Bibliogon schreiben und parallel zu Medium spiegeln.

## Archiv abholen

1. Auf Medium **Settings → Security and apps → Download your information** öffnen.
2. **Download .zip** klicken. Medium schickt den Link per E-Mail – bei kleinen Accounts in Minuten, bei großen in Stunden.
3. Die ZIP-Datei lokal speichern. **Nicht** entpacken – Bibliogon liest die ZIP direkt.

## Import durchführen

1. **Artikel** in der Seitenleiste öffnen.
2. **Aus Medium importieren** in der Werkzeugleiste klicken.
3. Die dedizierte Import-Seite öffnet sich unter `/articles/import/medium`. Bei Bedarf Einstellungen anpassen (siehe unten), dann die ZIP-Datei in die Upload-Zone ziehen oder per Dateidialog auswählen. Maximalgröße: 200 MB.
4. **Import starten** klicken. Der Fortschrittsbalken zeigt den Upload in Prozent; sobald der Upload abgeschlossen ist, wechselt das Panel auf eine Server-Verarbeitungsanzeige. Ein Archiv mit 200 Artikeln dauert typischerweise 30–60 Sekunden.
5. Das Ergebnis erscheint darunter mit drei Bereichen: importiert, übersprungen (bereits vorhanden), Fehler. Die Titel der importierten Artikel verlinken direkt auf den Bibliogon-Artikel.

Du kannst die Seite während des Imports verlassen und später zurückkehren. Das Ergebnis-Panel geht beim Verlassen verloren – unerwartete Fehler vorher notieren.

## Einstellungen

Die Einstellungen gelten für jeden Import; Überschreibungen pro Archiv werden nicht unterstützt.

- **Bilder lokal herunterladen** – empfohlen. Bibliogon speichert jedes Bild im Bibliogon-Datenverzeichnis statt das Medium-CDN zu referenzieren. Nur deaktivieren, wenn du absichtlich CDN-gehostete Bilder behalten willst.
- **Timeout pro Bild-Download (Sekunden)** – Standard 30. Auf langsamen Verbindungen erhöhen; bei Timeout überspringt der Importer das Bild und setzt fort.
- **Bereits importierte Artikel überspringen** – standardmäßig an. Erkennung erfolgt über die kanonische Medium-URL. Nur deaktivieren, wenn du ein korrigiertes Archiv erneut über ein bestehendes laufen lassen willst (siehe "Erneuter Import" unten).
- **Standardstatus für importierte Artikel** – Entwurf, Veröffentlicht oder Archiviert. Standard ist Veröffentlicht, da Medium-Beiträge per Definition veröffentlicht sind.
- **Erstes Bild als Titelbild setzen** – standardmäßig an. Das erste Bild im Beitragstext wird als Titelbild des Artikels gespeichert (`Article.featured_image_url`). Beiträge ohne Bilder bleiben ohne Titelbild; kein Fehler, keine Warnung. Deaktivieren, wenn du Titelbilder manuell kuratierst.

Diese Einstellung wirkt nur auf neue Importe. Um Titelbilder rückwirkend auf bereits importierte Artikel zu setzen, das Skript `scripts/fix_medium_import_featured_images.py` ausführen (Dry-run als Standard; mit `--apply` schreiben). Artikel mit bereits gesetztem Titelbild werden übersprungen – deine manuelle Kuratierung bleibt erhalten.

## Erneuter Import desselben Archivs

Der Importer ist idempotent über die kanonische Medium-URL. Dasselbe Archiv zweimal mit Standardeinstellungen zu importieren erzeugt keine Änderungen – jeder Beitrag landet im "Übersprungen"-Bereich. Um einen Re-Import zu erzwingen (du hast etwas am Archiv korrigiert oder willst die Bilder neu laden), vor dem erneuten Lauf **Bereits importierte Artikel überspringen** ausschalten.

## Was pro Beitrag importiert wird

- Titel, Untertitel (Medium-"Kicker"), Veröffentlichungsdatum, kanonische URL.
- **SEO-Standardwerte.** `seo_title` wird auf den Artikeltitel gesetzt; `seo_description` auf den Medium-Untertitel, sofern vorhanden. Tags bleiben leer (Mediums HTML-Export liefert keine). Alle drei Felder sind im Editor bearbeitbar; der bestehende AI-Generieren-Button ist der Weg zur Verfeinerung. Bei Artikeln ohne Untertitel bleibt `seo_description` bewusst leer — keine Heuristik-Rätselei aus dem Body-Text.
- Inhalt, von Medium-HTML in TipTap-JSON (Bibliogons Editor-Format) konvertiert.
- **Sprache**, automatisch aus dem Beitragstext erkannt mittels `langdetect`. Medium-HTML enthält keine Sprachangabe, daher erfolgt die Erkennung statistisch über den Beitragstext. Sichere Erkennungen (≥0,85) werden in `Article.language` gespeichert; mehrdeutige oder sehr kurze Beiträge fallen auf `default_language` ("en") zurück. Du kannst die Sprache jedes Artikels im Editor ändern; ein erneuter Import überschreibt manuelle Änderungen nicht.
- Bilder, lokal gespeichert, wenn die Einstellung aktiv ist. Bildreferenzen im Beitragstext werden auf die lokalen Kopien umgeschrieben.
- Provenienz: Ein `ArticleImportSource`-Eintrag speichert den Namen der Quell-ZIP und den ursprünglichen HTML-Dateinamen darin. Nützlich, um einen Artikel auf seinen Medium-Ursprung zurückzuführen.
- Publikationszugehörigkeit: Eine `Publication` wird für jede im Archiv referenzierte Medium-Publikation angelegt (oder gematcht), und der Artikel wird damit verknüpft.

Um die Sprache rückwirkend für vor dem Feature importierte Artikel zu erkennen, das Skript `scripts/fix_medium_import_language.py` ausführen (Dry-run als Standard; mit `--apply` schreiben). Manuell korrigierte Zeilen werden übersprungen – das Skript fasst nur Zeilen an, die noch auf dem historischen `"en"`-Default stehen.

Um `seo_title` und `seo_description` rückwirkend für vor Commit `2062393` importierte Artikel zu setzen, das Skript `scripts/fix_medium_import_seo.py` ausführen (Dry-run als Standard; mit `--apply` schreiben). Das Skript füllt `seo_title` aus `title` und `seo_description` aus `subtitle` nur dort, wo das Feld aktuell leer ist – manuelle Bearbeitungen bleiben erhalten.

## Was NICHT importiert wird

- Entwürfe, die nie auf Medium veröffentlicht wurden (Medium nimmt sie nicht ins Archiv auf).
- Kommentare, Claps, Follower-Listen.
- Eigenes CSS oder Formatierungen, die Medium über Inline-Styles außerhalb des Body-Elements behandelt.
- Member-only-Paywall-Flags. Alle importierten Artikel erhalten den gewählten Standardstatus; Medium-spezifische Paywall-Metadaten werden nicht übernommen.

## Fehlersuche

- **"Datei zu groß"-Fehler**: Das Frontend lehnt ZIPs über 200 MB hart ab. Für größere Archive entpacken und in Batches neu zippen (jeder ZIP wird unabhängig verarbeitet).
- **Ein Artikel landet unter "Fehler" mit einem Parse-Fehler**: Das Post-HTML im Archiv ist defekt (ein bekannter Edge-Case bei sehr alten Medium-Beiträgen). Die Fehlermeldung nennt die betreffende Datei. Die übrigen Beiträge sind nicht betroffen.
- **Bilder wurden nicht heruntergeladen**: Prüfen, ob **Bilder lokal herunterladen** an ist und der Timeout pro Bild für deine Verbindung nicht zu niedrig liegt. Artikel werden auch dann erfolgreich importiert, wenn einzelne Bilder fehlschlagen; Bildfehler erscheinen als Warnungen auf der importierten Zeile.
- **Server-Verarbeitung dauert deutlich länger als 60 Sekunden**: Große Archive mit Bilddownloads können mehrere Minuten laufen. Die Verarbeitungsphase zeigt einen unbestimmten Balken – Seite offen lassen. Den Browser-Tab zu schließen bricht den Import ab.

## Einstellungs-Karte unter Settings → Plugins

Die Karte unter Settings → Plugins → Medium-Import zeigt einen Verweis-Button auf diese Seite. Einstellungen sind im Settings-Tab nicht editierbar; die dedizierte Seite ist die einzige Quelle der Wahrheit.
