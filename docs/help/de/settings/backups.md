# Backups verwalten

Der Reiter **Einstellungen > Backups** ist die zentrale Anlaufstelle für alle Backup-bezogenen Vorgänge. Hier siehst du die Versions-Historie deiner letzten Sicherungen und kannst zwei Backup-Stände miteinander vergleichen.

## Versions-Historie

Beim Öffnen des Reiters lädt die letzte Sicherungs-Historie automatisch (bis zu 20 Einträge). Jeder Eintrag zeigt:

- **Datum + Uhrzeit** der Sicherung
- **Aktion** (Export, Import, automatische Sicherung)
- **Anzahl der gesicherten Bücher**
- **Dateiname** der Sicherungs-Datei

## Einzelne Einträge löschen

Neben jedem Eintrag in der Liste findet sich ein Papierkorb-Symbol. Ein Klick darauf entfernt diesen einzelnen Eintrag aus der Historie — die zugehörige `.bgb`-Datei auf der Festplatte bleibt davon unberührt; nur der Verweis in der Historie verschwindet.

Optimistic-Update: der Eintrag verschwindet sofort aus der Anzeige. Wenn der Server die Löschung ablehnt, erscheint die Liste mit dem Eintrag in seinem ursprünglichen Zustand wieder, und eine Fehlermeldung erscheint als Toast.

## Komplette Historie leeren

Der Knopf **Alle Einträge löschen** entfernt jeden Verweis aus der Versions-Historie auf einmal. Eine Bestätigungs-Dialog warnt vor dem Vorgang. Auch hier gilt: die `.bgb`-Dateien auf der Festplatte werden NICHT angetastet — nur die Historie-Liste wird geleert.

## Backups vergleichen

Der **Vergleichen**-Knopf öffnet einen Dialog, in dem du zwei `.bgb`-Stände auswählen und gegeneinander stellen kannst. Der Vergleich zeigt pro Buch:

- Neue Bücher (nur in einem der beiden Stände)
- Gelöschte Bücher (nur in einem der beiden Stände)
- Geänderte Bücher (Inhalts-Hash differiert)

Praktisch, wenn du wissen willst, was sich zwischen zwei Sicherungs-Zeitpunkten verändert hat — etwa bei der Suche nach einem versehentlich gelöschten Kapitel.

## Wo liegen die Backup-Dateien?

Die tatsächlichen `.bgb`-Dateien werden im benutzer-spezifischen Daten-Verzeichnis abgelegt:

- Linux / macOS: `~/.local/share/bibliogon/backups/`
- Windows: `%LOCALAPPDATA%\bibliogon\backups\`
- Docker (Produktion): im benannten Volume `bibliogon-data` unter `/app/data/backups/`

Manuelles Aufräumen der Festplatte (z. B. um Speicherplatz freizugeben) geschieht direkt im Datei-System; die Versions-Historie ist davon unabhängig.

## Verwandte Themen

- [Gefahrenzone — System-Reset](danger-zone.md) — komplettes Zurücksetzen aller Daten
- [Einstellungen-Navigation](sidebar.md) — wo der Backups-Reiter sitzt
- [Git-Sicherung](../git-backup/basics.md) — alternative Backup-Strategie über Git-Remote
