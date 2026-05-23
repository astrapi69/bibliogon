# Gefahrenzone

Die Gefahrenzone in den Einstellungen erlaubt es, die gesamte App auf den Erstinstallationszustand zurückzusetzen. Das ist unwiderruflich — vor der Ausführung sollte unbedingt ein Backup erstellt werden.

## Wann brauche ich das?

- Du möchtest Bibliogon an jemand anderen weitergeben und alle persönlichen Daten entfernen.
- Du willst die App komplett neu starten ("Werkseinstellungen").
- Beim Testen von Plugins oder Konfigurationen haben sich Reste angesammelt, die du loswerden willst.

Für einzelne Bücher oder Artikel ist das **nicht** das richtige Werkzeug — dafür gibt es die normalen Löschen-Funktionen plus den Papierkorb (90 Tage Wiederherstellung).

## Was wird gelöscht?

Beim Klick auf **Endgültig löschen** werden unwiderruflich gelöscht:

- Alle Bücher und Kapitel (inklusive Kindle-Direct-Publishing-Daten und ARC-Rezensenten)
- Alle Artikel und Kommentare
- Alle hochgeladenen Bilder und sonstigen Assets (Cover, Figuren)
- Alle Comic-Buch-Seiten, Panels und Sprechblasen
- Alle Bilderbuch-Seiten
- Alle Vorlagen und Autoren-Datenbank-Einträge (die mitgelieferten Standard-Vorlagen werden neu eingespielt)
- Alle Einstellungen und Voreinstellungen (App-Sprache, Theme, Plugin-Konfigurationen)
- Der KI-API-Schlüssel
- Backup-Historie
- Selbst installierte Plugins (ZIP-Installationen)
- Alle ungespeicherten Editor-Entwürfe im Browser
- Alle laufenden Hintergrund-Jobs (Audiobook-Generierung, Medium-Import, KI-Bulk-Fill)

## Was bleibt erhalten?

- Die Bibliogon-App selbst (Backend + Frontend)
- Der Launcher-Installationsstatus (Version, Installationspfad)
- Die mitgelieferten Standard-Vorlagen (werden nach dem Reset wieder neu eingespielt)
- Das Datenverzeichnis als solches (nur dessen Inhalt wird gelöscht)

## Ablauf

1. **Einstellungen → Gefahrenzone** öffnen (letzter Tab).
2. **Alles zurücksetzen** klicken.
3. Der Dialog zeigt die vollständige Liste dessen, was gelöscht wird, plus einen prominent platzierten **Backup erstellen**-Knopf.
4. Optional: Klick auf **Backup erstellen** lädt ein `.bgb`-Backup aller Bücher und Artikel herunter. Das Backup landet im Standard-Download-Verzeichnis des Browsers. Der Dialog bleibt geöffnet.
5. In das Textfeld am unteren Rand des Dialogs **RESET** (Großbuchstaben) eingeben. Erst dann wird die rote Schaltfläche **Endgültig löschen** aktiv.
6. **Endgültig löschen** klicken.

Nach dem Reset wird die App automatisch zum Dashboard zurückgeleitet und verhält sich wie ein frisches Erstinstallation: leere Dashboards, kein KI-Schlüssel hinterlegt, Theme auf Standardwert.

## Sicherheitsmechanismen

Das Reset ist absichtlich mehrstufig abgesichert, damit es nicht versehentlich ausgeführt werden kann:

- **Drei Klicks**: Reset-Knopf in der Gefahrenzone → Dialog öffnen → Endgültig löschen.
- **Wort-Bestätigung**: Das exakte Wort "RESET" (Großbuchstaben) muss getippt werden. Kleinbuchstaben oder Tippfehler deaktivieren den Lösch-Knopf.
- **HMAC-Token**: Im Hintergrund wird beim Öffnen des Dialogs ein 5-Minuten-Token vom Server angefordert. Dieser Token muss zusammen mit dem RESET-Wort an den Server gesendet werden; eine externe Seite oder eine versehentliche zweite Anfrage hat ohne diesen Token keine Wirkung.
- **Backup-Angebot**: Bevor der Lösch-Knopf aktiv wird, wird das Backup-Angebot prominent dargestellt.

## Fehlerfälle

- Wenn der Server während der Vorbereitung des Resets nicht erreichbar ist, bleibt der **Endgültig löschen**-Knopf deaktiviert und eine Fehlermeldung erscheint.
- Wenn das Reset selbst fehlschlägt (Backend-Fehler), bleibt der Dialog geöffnet und ein neuer Token wird automatisch angefordert. Du kannst das RESET-Wort erneut tippen und es noch einmal versuchen.

## Siehe auch

- [Backup-Übersicht](../articles/bulk-export.md)
- [Plugins-Übersicht](../plugins/uebersicht.md)
