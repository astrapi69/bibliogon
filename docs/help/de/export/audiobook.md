# Audiobook-Export

## Übersicht

Das Audiobook-Plugin erzeugt aus deinen Buchkapiteln gesprochene Audiodateien (MP3) mithilfe von Text-to-Speech (TTS). Es baut auf dem Export-Plugin auf und nutzt dessen Kapitelstruktur. Alle TTS-Engines werden seit v0.11 über [manuscripta](https://github.com/astrapi69/manuscripta) angesteuert.

Die Audiobook-Generierung läuft asynchron im Hintergrund. Nach dem Start wird ein Fortschrittsdialog angezeigt, der den aktuellen Status jedes Kapitels zeigt (über Server-Sent Events). Du kannst während der Generierung weiterarbeiten. Die fertigen Dateien werden dauerhaft unter `uploads/{book_id}/audiobook/` gespeichert, sodass sie auch nach dem Schließen des Browsers noch verfügbar sind.

## TTS-Engines

Bibliogon unterstützt mehrere TTS-Engines, die sich in Qualität, Kosten und Verfügbarkeit unterscheiden:

- **Edge TTS** (Standard): Microsofts kostenlose Text-to-Speech-Schnittstelle. Bietet eine große Auswahl an Stimmen in vielen Sprachen. Benötigt eine Internetverbindung, ist aber kostenfrei.
- **Google Cloud TTS**: Googles cloudbasierte Sprachsynthese mit hoher Qualität (Standard, WaveNet, Neural2, Studio, Journey). Erfordert ein Google-Cloud-Konto mit Service-Account-JSON. Kostenlos bis zu einem monatlichen Kontingent, danach kostenpflichtig. Der Service-Account-Schlüssel wird verschlüsselt in `config/google-credentials.enc` abgelegt.
- **ElevenLabs**: Hochwertige KI-Stimmen mit besonders natürlichem Klang. Kostenpflichtig, erfordert einen API-Key. Der Key wird über Einstellungen > Audiobook konfiguriert und vor dem Speichern gegen die ElevenLabs-API validiert.
- **pyttsx3**: Offline-TTS-Engine auf Basis der systemeigenen Sprachsynthese. Keine Internetverbindung und keine API-Keys erforderlich, die Sprachqualität ist jedoch eingeschränkt.
- **Google Translate TTS**: Kostenlose Fallback-Option über gTTS. Minimale Qualität, aber ohne Account nutzbar.

Die Engine lässt sich in den Einstellungen unter Audiobook global konfigurieren. Pro Buch kann sie auch in den Buch-Metadaten überschrieben werden.

## Per-Buch-Konfiguration

Alle audio-spezifischen Einstellungen leben seit v0.11 auf dem Buch selbst, nicht als globale Plugin-Settings. Im **BookEditor > Metadaten > Audiobook**-Tab kannst du pro Buch festlegen:

- Engine, Stimme, Geschwindigkeit, Merge-Modus, Dateiname-Praefix
- **Bestehende Dateien überschreiben**: Wenn aktiviert, wird bei der nächsten Generierung der Content-Hash-Cache ignoriert und jedes Kapitel neu erzeugt. Default aus.
- **Kapiteltypen überspringen**: Checkbox-Liste aller 26 ChapterTypes, sortiert nach "Im Buch vorhanden" und "Weitere Typen". Markierte Typen werden beim Export nicht vertont. Marketing-Typen (also_by_author, excerpt, call_to_action) sind per Default gesetzt.
- **Kapitel-Nummer ansagen**: Wenn aktiviert, sagt die TTS vor jedem Kapitel ein "Erstes Kapitel", "Zweites Kapitel" usw. an. Default aus.

Alle Einstellungen werden mit dem globalen Speichern-Button am oberen Rand des Metadaten-Editors persistiert - es gibt keine Auto-Save-Falle.

## Content-Hash-Cache

Das Audiobook-Plugin speichert zu jedem generierten Kapitel einen Content-Hash (basierend auf Kapiteltext, Engine, Stimme und Geschwindigkeit) in einer Sidecar-`.meta.json`-Datei. Bei einer erneuten Generierung werden nur Kapitel neu erzeugt, deren Hash sich geändert hat. Unveränderte Kapitel werden aus dem Cache übernommen. Das spart Zeit und, bei kostenpflichtigen Engines wie ElevenLabs, auch Geld. Der Cache kann pro Buch per "Bestehende Dateien überschreiben"-Checkbox vollständig deaktiviert werden.

## Dry-Run und Kostenvoranschlag

Der Dry-Run-Modus erzeugt eine kurze Sample-MP3 aus dem ersten nicht-übersprungenen Kapitel mit Inhalt und liefert in den Response-Headern eine Kostenschätzung für den kompletten Export. So kannst du vor dem ersten teuren ElevenLabs- oder Google-Cloud-Lauf hören wie die Stimme klingt und wie hoch die Kosten für dein Buch grob sein werden.

## Ausgabeoptionen

Der Merge-Modus steuert welche Dateien erzeugt werden:

- **merged**: Eine einzelne MP3-Datei für das gesamte Buch.
- **separate**: Eine MP3-Datei pro Kapitel.
- **both**: Sowohl Einzelkapitel als auch eine zusammengefuegte Gesamtdatei.

Die generierten Dateien können einzeln heruntergeladen oder als ZIP-Archiv gespeichert werden, und bleiben auch nach einem Browser-Reload oder Neustart des Backends verfügbar. Wenn beim erneuten Export bereits ein Audiobook existiert warnt die UI mit einem Confirm-Dialog bevor sie überschreibt (es sei denn "Bestehende Dateien überschreiben" ist bewusst gesetzt).
