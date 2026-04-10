# Glossar

## ASIN

Amazon Standard Identification Number. Eine zehnstellige Kennung, die Amazon jedem Produkt zuweist. Fuer E-Books auf Amazon (Kindle) wird automatisch eine ASIN vergeben. In Bibliogon kann die ASIN in den Buch-Metadaten hinterlegt werden.

## EPUB

Electronic Publication. Ein offenes Standardformat fuer E-Books, das vom W3C gepflegt wird. EPUB-Dateien sind im Kern ZIP-Archive mit XHTML-Inhalten, CSS-Stylesheets und Metadaten. Bibliogon erzeugt EPUB-Dateien ueber manuscripta und Pandoc.

## ISBN

International Standard Book Number. Eine weltweit eindeutige Kennung fuer Buecher. Bibliogon unterstuetzt die Erfassung mehrerer ISBN-Varianten pro Buch: ISBN fuer E-Book, Paperback und Hardcover. Die ISBN fliesst in die Export-Metadaten ein.

## manuscripta

Ein Python-Paket (PyPI), das die Export-Pipeline von Bibliogon bereitstellt. Manuscripta uebernimmt das Scaffolding der write-book-template-Projektstruktur und die Konvertierung ueber Pandoc zu den Zielformaten (EPUB, PDF, DOCX, HTML).

## Pandoc

Ein universelles Dokumenten-Konvertierungswerkzeug. Pandoc wandelt Markdown in zahlreiche Ausgabeformate um, darunter EPUB, PDF (ueber LaTeX), DOCX und HTML. Bibliogon nutzt Pandoc als Backend fuer den Export. Pandoc muss separat installiert werden.

## Plugin

Eine eigenstaendige Erweiterung, die Bibliogon um zusaetzliche Funktionen ergaenzt. Plugins werden ueber das PluginForge-Framework geladen und registrieren sich beim Anwendungsstart. Jedes Plugin stellt API-Endpunkte und UI-Erweiterungen bereit. Plugins koennen von anderen Plugins abhaengen.

## PluginForge

Ein anwendungsunabhaengiges Python-Framework fuer Plugin-Systeme, verfuegbar auf PyPI. PluginForge basiert auf pluggy und stellt Basisklassen, Hook-Spezifikationen und einen Plugin-Manager bereit. Bibliogon nutzt PluginForge als Grundlage fuer sein Plugin-System.

## SQLite

Ein serverloser, dateibasierter SQL-Datenbankmotor. Bibliogon speichert alle Buecher, Kapitel und Assets in einer einzelnen SQLite-Datei. Es ist keine separate Datenbankinstallation erforderlich. SQLite eignet sich besonders fuer Einzelplatzanwendungen und den Local-first-Ansatz.

## TipTap

Ein WYSIWYG-Editorframework fuer das Web, basierend auf ProseMirror. TipTap wird in Bibliogon als Texteditor verwendet und speichert Inhalte in einem eigenen JSON-Format (TipTap-JSON). Der Editor ist ueber Extensions erweiterbar und unterstuetzt Ueberschriften, Listen, Bilder, Tabellen, Fussnoten und weitere Elemente.

## TTS

Text-to-Speech. Eine Technologie, die geschriebenen Text in gesprochene Sprache umwandelt. Das Audiobook-Plugin nutzt TTS-Engines (Edge TTS, Google Cloud TTS, ElevenLabs, pyttsx3), um aus Buchkapiteln Audiodateien zu erzeugen.

## write-book-template

Eine standardisierte Verzeichnisstruktur fuer Buchprojekte. Ein write-book-template-Projekt enthaelt Unterordner fuer Front-Matter, Kapitel und Back-Matter sowie Metadaten- und Konfigurationsdateien. Bibliogon nutzt dieses Format als Zwischenschritt beim Export und unterstuetzt den Import von Projekten in diesem Format.
