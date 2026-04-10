# Plugins - Uebersicht

## Was sind Plugins?

Bibliogon ist modular aufgebaut. Der Kern der Anwendung umfasst die grundlegenden Funktionen: Buecher und Kapitel verwalten, den TipTap-Editor, Backup und Restore sowie die Benutzeroberflaeche. Alle weitergehenden Funktionen wie Export, Grammatikpruefung, Uebersetzung und Audiobook-Generierung sind als Plugins realisiert.

Plugins sind eigenstaendige Pakete, die ueber das PluginForge-Framework (basierend auf pluggy) geladen werden. Jedes Plugin registriert sich beim Start der Anwendung automatisch und stellt seine Funktionen ueber API-Endpunkte und UI-Erweiterungen bereit. Plugins koennen von anderen Plugins abhaengen, zum Beispiel baut das Audiobook-Plugin auf dem Export-Plugin auf.

## Core- und Premium-Plugins

Bibliogon unterscheidet zwei Plugin-Kategorien:

**Core-Plugins** (MIT-Lizenz, kostenlos):

- **Export**: EPUB, PDF, DOCX, HTML, Markdown und Projektstruktur-Export.
- **Hilfe**: In-App-Hilfe, Tastenkuerzel und FAQ.
- **Erste Schritte**: Onboarding-Assistent und Beispielbuch.
- **MS-Tools**: Stil-Checks, Text-Sanitization und Textmetriken.

**Premium-Plugins** (Lizenz erforderlich):

- **Audiobook**: TTS-basierte Audiobook-Generierung aus Buchkapiteln.
- **Translation**: Uebersetzung ueber DeepL oder LMStudio.
- **Grammar**: Grammatik- und Rechtschreibpruefung ueber LanguageTool.
- **Kinderbuch** (geplant): Bild-pro-Seite-Layout fuer Kinderbuecher.
- **KDP** (geplant): Amazon KDP-Metadaten und Validierung.

Premium-Plugins benoetigen einen gueltigen Lizenzschluessel. Ohne Lizenz ist das Plugin sichtbar, laesst sich aber nicht aktivieren. Trial-Keys fuer 30 Tage koennen ueber `make generate-trial-key` erzeugt werden.

## Plugin-Installation

Die mitgelieferten Plugins werden automatisch beim Start geladen. Drittanbieter-Plugins lassen sich als ZIP-Datei ueber Einstellungen > Plugins installieren. Die ZIP-Datei muss eine `plugin.yaml` und ein Python-Paket mit einer Plugin-Klasse enthalten. Nach dem Upload wird das Plugin in `plugins/installed/` extrahiert und beim naechsten Start registriert.

Jedes Plugin deklariert seine UI-Erweiterungen ueber ein Frontend-Manifest. Dadurch koennen Plugins Schaltflaechen in der Toolbar, Panels neben dem Editor, Abschnitte in den Einstellungen oder Optionen im Export-Dialog hinzufuegen, ohne den Kern der Anwendung zu veraendern.

## Plugin-Verwaltung

In den Einstellungen unter "Plugins" siehst du eine Liste aller installierten Plugins mit Name, Version, Lizenztyp und Status. Core-Plugins koennen aktiviert oder deaktiviert werden. Premium-Plugins zeigen stattdessen einen Button zur Lizenzeingabe, wenn noch keine gueltige Lizenz hinterlegt ist. Der Status jedes Plugins (aktiv, inaktiv, Lizenz fehlt) wird auf einen Blick angezeigt.
