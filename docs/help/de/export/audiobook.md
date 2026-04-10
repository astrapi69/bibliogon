# Audiobook-Export

## Uebersicht

Das Audiobook-Plugin erzeugt aus deinen Buchkapiteln gesprochene Audiodateien (MP3) mithilfe von Text-to-Speech (TTS). Das Plugin ist ein Premium-Feature und erfordert eine gueltige Lizenz. Es baut auf dem Export-Plugin auf und nutzt dessen Kapitelstruktur.

Die Audiobook-Generierung laeuft asynchron im Hintergrund. Nach dem Start wird ein Fortschrittsdialog angezeigt, der den aktuellen Status jedes Kapitels anzeigt (ueber Server-Sent Events). Du kannst waehrend der Generierung weiterarbeiten. Die fertigen Dateien werden dauerhaft unter `uploads/{book_id}/audiobook/` gespeichert, sodass sie auch nach dem Schliessen des Browsers noch verfuegbar sind.

## TTS-Engines

Bibliogon unterstuetzt mehrere TTS-Engines, die sich in Qualitaet, Kosten und Verfuegbarkeit unterscheiden:

- **Edge TTS** (Standard): Microsofts kostenlose Text-to-Speech-Schnittstelle. Bietet eine grosse Auswahl an Stimmen in vielen Sprachen. Benoetigt eine Internetverbindung, ist aber kostenfrei. Die Stimmen werden beim Start automatisch in den Voice-Cache geladen.
- **Google Cloud TTS**: Googles cloudbasierte Sprachsynthese mit hoher Qualitaet. Erfordert ein Google-Cloud-Konto und einen API-Key. Kostenlos bis zu einem monatlichen Kontingent, danach kostenpflichtig.
- **ElevenLabs**: Hochwertige KI-Stimmen mit besonders natuerlichem Klang. Kostenpflichtig, erfordert einen API-Key. Der Key wird ueber Einstellungen > Audiobook konfiguriert und vor dem Speichern gegen die ElevenLabs-API validiert.
- **pyttsx3**: Offline-TTS-Engine, die auf den systemeigenen Sprachsynthese-Diensten aufbaut. Keine Internetverbindung und keine API-Keys erforderlich, die Sprachqualitaet ist jedoch eingeschraenkt.

Die Engine laesst sich in den Einstellungen unter Audiobook konfigurieren. Pro Buch kann die Engine auch in den Buch-Metadaten ueberschrieben werden.

## Stimmenauswahl

Nach der Auswahl einer Engine und einer Sprache zeigt das Stimmen-Dropdown die verfuegbaren Stimmen an. Die Liste wird vom Backend geliefert: zuerst wird der Voice-Cache abgefragt, dann der Live-Endpoint des Audiobook-Plugins. Falls fuer eine Engine-Sprache-Kombination keine Stimmen verfuegbar sind, zeigt das Dropdown einen leeren Zustand ("Keine Stimmen verfuegbar") statt einer Fallback-Liste.

Die Standardstimme kann in den Einstellungen festgelegt werden. In den Buch-Metadaten laesst sich pro Buch eine abweichende Stimme waehlen.

## Content-Hash-Cache

Das Audiobook-Plugin speichert zu jedem generierten Kapitel einen Content-Hash (basierend auf dem Kapiteltext und den TTS-Einstellungen). Bei einer erneuten Generierung werden nur Kapitel neu erzeugt, deren Inhalt sich geaendert hat. Unveraenderte Kapitel werden uebersprungen. Das spart Zeit und, bei kostenpflichtigen Engines wie ElevenLabs, auch Geld.

## Ausgabeoptionen

Die Konfiguration `merge` steuert, welche Dateien erzeugt werden:

- **merged**: Eine einzelne MP3-Datei fuer das gesamte Buch.
- **separate**: Eine MP3-Datei pro Kapitel.
- **both**: Sowohl Einzelkapitel als auch eine zusammengefuehrte Gesamtdatei.

Die generierten Dateien koennen einzeln heruntergeladen oder als ZIP-Archiv gespeichert werden. Bestimmte Kapiteltypen (Inhaltsverzeichnis, Impressum, Index, Bibliografie) werden standardmaessig uebersprungen, da sie sich nicht fuer die Vertonung eignen. Die Liste der uebersprungenen Typen ist in der Plugin-Konfiguration anpassbar.
