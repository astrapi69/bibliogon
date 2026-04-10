# Fehlerbehebung

## Export schlaegt fehl: "Pandoc not found"

Wenn der PDF-, DOCX- oder HTML-Export mit der Fehlermeldung "Pandoc not found" abbricht, ist Pandoc nicht auf dem System installiert oder nicht im PATH verfuegbar.

**Loesung:**

1. Pruefe, ob Pandoc installiert ist: `pandoc --version`
2. Falls nicht installiert:
   - Linux (Debian/Ubuntu): `sudo apt install pandoc`
   - macOS: `brew install pandoc`
   - Windows: Installer von [pandoc.org](https://pandoc.org/installing.html)
3. Fuer PDF-Export zusaetzlich eine LaTeX-Distribution installieren (z.B. `sudo apt install texlive-full`).
4. Starte das Backend nach der Installation neu.

Wenn du Docker verwendest (`make prod`), sind Pandoc und LaTeX bereits im Container enthalten. In diesem Fall liegt das Problem wahrscheinlich an einem Konfigurationsfehler.

EPUB-Export funktioniert auch ohne Pandoc, da manuscripta eine eigene EPUB-Generierung mitbringt.

## Stimmen werden nicht geladen

Wenn das Stimmen-Dropdown im Audiobook-Bereich leer bleibt oder "Keine Stimmen verfuegbar" anzeigt, kann das mehrere Ursachen haben:

- **Edge TTS**: Benoetigt eine Internetverbindung. Die Stimmen werden beim Start der Anwendung in den Voice-Cache geladen. Starte die Anwendung neu, wenn die Stimmen nicht erscheinen.
- **ElevenLabs**: Pruefe, ob der API-Key in den Einstellungen hinterlegt ist (Einstellungen > Audiobook). Der Key wird beim Speichern gegen die ElevenLabs-API validiert.
- **Google Cloud TTS**: Stelle sicher, dass die API-Zugangsdaten korrekt konfiguriert sind.
- **pyttsx3**: Die verfuegbaren Stimmen haengen vom Betriebssystem ab. Unter Linux muss espeak oder espeak-ng installiert sein.
- **Falsche Sprache**: Manche Engines bieten nur Stimmen fuer bestimmte Sprachen an. Stelle sicher, dass die gewaehlte Buchsprache von der Engine unterstuetzt wird.

## Plugin laesst sich nicht aktivieren

Wenn ein Premium-Plugin in den Einstellungen als "Lizenz fehlt" angezeigt wird und sich nicht aktivieren laesst:

1. Navigiere zu **Einstellungen > Lizenzen**.
2. Gib den korrekten Plugin-Namen ein (kleingeschrieben, z.B. "audiobook", nicht "Audiobook").
3. Fuege den Lizenzschluessel ein und klicke auf "Aktivieren".
4. Pruefe die Fehlermeldung:
   - "Schluessel abgelaufen": Du benoetigst einen neuen Schluessel.
   - "Ungueltige Signatur": Der Schluessel ist beschaedigt oder wurde mit einem anderen Secret erzeugt.
   - "Plugin nicht gefunden": Der Plugin-Name im Schluessel stimmt nicht ueberein.

Fuer Testzwecke generiere einen Trial-Key: `make generate-trial-key`. Dieser gilt 30 Tage fuer alle Premium-Plugins.

## Bilder werden im Export nicht angezeigt

Wenn Bilder im Editor sichtbar sind, aber in der exportierten EPUB- oder PDF-Datei fehlen:

- Stelle sicher, dass die Bilder als Assets im Buch gespeichert sind (nicht nur als externe URLs).
- Pruefe in den Buch-Metadaten, ob das Coverbild korrekt hinterlegt ist.
- Bei EPUB: Oeffne die EPUB-Datei mit einem ZIP-Tool und pruefe, ob die Bilder im `assets/`-Ordner vorhanden sind.
- Beim Import aus einem write-book-template-Projekt: Die Bildpfade werden automatisch umgeschrieben. Falls Bilder fehlen, pruefe, ob sie im `assets/figures/`-Ordner des Quellprojekts vorhanden waren.

## Backend startet nicht

Wenn `make dev` oder `make prod` nicht startet:

- Pruefe, ob alle Abhaengigkeiten installiert sind: `make install`
- Pruefe, ob Port 8000 (Backend) und Port 5173 (Frontend) frei sind.
- Pruefe die Log-Ausgabe auf Fehlermeldungen. Haeufige Ursachen: fehlende Python-Pakete, fehlerhafte Plugin-Konfiguration oder beschaedigte SQLite-Datei.
- Im Docker-Modus: Pruefe mit `docker compose logs` die Container-Ausgabe.
