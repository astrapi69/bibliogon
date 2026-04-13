# Audiobook-Export

## Übersicht

Das Audiobook-Plugin erzeugt aus deinen Buchkapiteln gesprochene Audiodateien (MP3) mithilfe von Text-to-Speech (TTS). Es baut auf dem Export-Plugin auf und nutzt dessen Kapitelstruktur. Alle TTS-Engines werden seit v0.11 ueber [manuscripta](https://github.com/astrapi69/manuscripta) angesteuert.

Die Audiobook-Generierung laeuft asynchron im Hintergrund. Nach dem Start wird ein Fortschrittsdialog angezeigt, der den aktuellen Status jedes Kapitels zeigt (ueber Server-Sent Events). Du kannst waehrend der Generierung weiterarbeiten. Die fertigen Dateien werden dauerhaft unter `uploads/{book_id}/audiobook/` gespeichert, sodass sie auch nach dem Schliessen des Browsers noch verfuegbar sind.

## TTS-Engines

Bibliogon unterstuetzt mehrere TTS-Engines, die sich in Qualitaet, Kosten und Verfuegbarkeit unterscheiden:

- **Edge TTS** (Standard): Microsofts kostenlose Text-to-Speech-Schnittstelle. Bietet eine grosse Auswahl an Stimmen in vielen Sprachen. Benoetigt eine Internetverbindung, ist aber kostenfrei.
- **Google Cloud TTS**: Googles cloudbasierte Sprachsynthese mit hoher Qualitaet (Standard, WaveNet, Neural2, Studio, Journey). Erfordert ein Google-Cloud-Konto mit Service-Account-JSON. Kostenlos bis zu einem monatlichen Kontingent, danach kostenpflichtig. Der Service-Account-Schluessel wird verschluesselt in `config/google-credentials.enc` abgelegt.
- **ElevenLabs**: Hochwertige KI-Stimmen mit besonders natuerlichem Klang. Kostenpflichtig, erfordert einen API-Key. Der Key wird ueber Einstellungen > Audiobook konfiguriert und vor dem Speichern gegen die ElevenLabs-API validiert.
- **pyttsx3**: Offline-TTS-Engine auf Basis der systemeigenen Sprachsynthese. Keine Internetverbindung und keine API-Keys erforderlich, die Sprachqualitaet ist jedoch eingeschraenkt.
- **Google Translate TTS**: Kostenlose Fallback-Option ueber gTTS. Minimale Qualitaet, aber ohne Account nutzbar.

Die Engine laesst sich in den Einstellungen unter Audiobook global konfigurieren. Pro Buch kann sie auch in den Buch-Metadaten ueberschrieben werden.

## Per-Buch-Konfiguration

Alle audio-spezifischen Einstellungen leben seit v0.11 auf dem Buch selbst, nicht als globale Plugin-Settings. Im **BookEditor > Metadaten > Audiobook**-Tab kannst du pro Buch festlegen:

- Engine, Stimme, Geschwindigkeit, Merge-Modus, Dateiname-Praefix
- **Bestehende Dateien ueberschreiben**: Wenn aktiviert, wird bei der naechsten Generierung der Content-Hash-Cache ignoriert und jedes Kapitel neu erzeugt. Default aus.
- **Kapiteltypen ueberspringen**: Checkbox-Liste aller 26 ChapterTypes, sortiert nach "Im Buch vorhanden" und "Weitere Typen". Markierte Typen werden beim Export nicht vertont. Marketing-Typen (also_by_author, excerpt, call_to_action) sind per Default gesetzt.
- **Kapitel-Nummer ansagen**: Wenn aktiviert, sagt die TTS vor jedem Kapitel ein "Erstes Kapitel", "Zweites Kapitel" usw. an. Default aus.

Alle Einstellungen werden mit dem globalen Speichern-Button am oberen Rand des Metadaten-Editors persistiert - es gibt keine Auto-Save-Falle.

## Content-Hash-Cache

Das Audiobook-Plugin speichert zu jedem generierten Kapitel einen Content-Hash (basierend auf Kapiteltext, Engine, Stimme und Geschwindigkeit) in einer Sidecar-`.meta.json`-Datei. Bei einer erneuten Generierung werden nur Kapitel neu erzeugt, deren Hash sich geaendert hat. Unveraenderte Kapitel werden aus dem Cache uebernommen. Das spart Zeit und, bei kostenpflichtigen Engines wie ElevenLabs, auch Geld. Der Cache kann pro Buch per "Bestehende Dateien ueberschreiben"-Checkbox vollstaendig deaktiviert werden.

## Dry-Run und Kostenvoranschlag

Der Dry-Run-Modus erzeugt eine kurze Sample-MP3 aus dem ersten nicht-uebersprungenen Kapitel mit Inhalt und liefert in den Response-Headern eine Kostenschaetzung fuer den kompletten Export. So kannst du vor dem ersten teuren ElevenLabs- oder Google-Cloud-Lauf hoeren wie die Stimme klingt und wie hoch die Kosten fuer dein Buch grob sein werden.

## Ausgabeoptionen

Der Merge-Modus steuert welche Dateien erzeugt werden:

- **merged**: Eine einzelne MP3-Datei fuer das gesamte Buch.
- **separate**: Eine MP3-Datei pro Kapitel.
- **both**: Sowohl Einzelkapitel als auch eine zusammengefuegte Gesamtdatei.

Die generierten Dateien koennen einzeln heruntergeladen oder als ZIP-Archiv gespeichert werden, und bleiben auch nach einem Browser-Reload oder Neustart des Backends verfuegbar. Wenn beim erneuten Export bereits ein Audiobook existiert warnt die UI mit einem Confirm-Dialog bevor sie ueberschreibt (es sei denn "Bestehende Dateien ueberschreiben" ist bewusst gesetzt).
