# Plugins - Übersicht

## Was sind Plugins?

Bibliogon ist modular aufgebaut. Der Kern der Anwendung umfasst die grundlegenden Funktionen: Bücher und Kapitel verwalten, den TipTap-Editor, Backup und Restore sowie die Benutzeroberflaeche. Alle weitergehenden Funktionen wie Export, Grammatikpruefung, Übersetzung und Audiobook-Generierung sind als Plugins realisiert.

Plugins sind eigenständige Pakete, die über das PluginForge-Framework (basierend auf pluggy) geladen werden. Jedes Plugin registriert sich beim Start der Anwendung automatisch und stellt seine Funktionen über API-Endpunkte und UI-Erweiterungen bereit. Plugins können von anderen Plugins abhängen, zum Beispiel baut das Audiobook-Plugin auf dem Export-Plugin auf.

## Verfuegbare Plugins

Alle Plugins sind kostenlos und können frei verwendet werden:

- **Export**: EPUB, PDF, DOCX, HTML, Markdown und Projektstruktur-Export.
- **Hilfe**: In-App-Hilfe, Tastenkürzel und FAQ.
- **Erste Schritte**: Onboarding-Assistent und Beispielbuch.
- **MS-Tools**: Stil-Checks, Text-Sanitization und Textmetriken.
- **Audiobook**: TTS-basierte Audiobook-Generierung aus Buchkapiteln.
- **Translation**: Übersetzung über DeepL oder LMStudio.
- **Grammar**: Grammatik- und Rechtschreibprüfung über LanguageTool.
- **Kinderbuch** (geplant): Bild-pro-Seite-Layout für Kinderbücher.
- **KDP** (geplant): Amazon KDP-Metadaten und Validierung.

## Plugin-Installation

Die mitgelieferten Plugins werden automatisch beim Start geladen. Drittanbieter-Plugins lassen sich als ZIP-Datei über Einstellungen > Plugins installieren. Die ZIP-Datei muss eine `plugin.yaml` und ein Python-Paket mit einer Plugin-Klasse enthalten. Nach dem Upload wird das Plugin in `plugins/installed/` extrahiert und beim nächsten Start registriert.

Jedes Plugin deklariert seine UI-Erweiterungen über ein Frontend-Manifest. Dadurch können Plugins Schaltflächen in der Toolbar, Panels neben dem Editor, Abschnitte in den Einstellungen oder Optionen im Export-Dialog hinzufügen, ohne den Kern der Anwendung zu verändern.

## Plugin-Verwaltung

In den Einstellungen unter "Plugins" siehst du eine Liste aller installierten Plugins mit Name, Version und Status. Plugins können aktiviert oder deaktiviert werden. Der Status jedes Plugins (aktiv, inaktiv) wird auf einen Blick angezeigt.
