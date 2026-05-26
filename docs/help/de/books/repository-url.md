# Git-Repository-URL

Jedes Buch kann eine optionale **Git-Repository-URL** in den Metadaten halten — sinnvoll für Bücher, die in einem externen Git-Repo gepflegt werden (Backup, Versionierung, kollaboratives Arbeiten).

![Repository-URL-Feld im Metadaten-Tab](../../assets/screenshots/book-metadata-repository-url.png)

## Zwei Modi

Das Feld verhält sich abhängig davon, ob das Buch über das **plugin-git-sync** verwaltet wird:

- **Verwaltet** (Mapping vorhanden) — das Feld ist schreibgeschützt und zeigt die kanonische Mapping-URL. Manuelle Änderungen würden vom Round-Trip abweichen, deshalb blockiert die UI das Editieren. Ein kleiner Hinweis erklärt den Zustand direkt unter dem Eingabefeld.
- **Manuell** (kein Mapping) — das Feld ist ein normales freies URL-Eingabefeld, das die Spalte `Book.repository_url` schreibt. Praktisch für Bücher, die zwar auf einem externen Git-Host liegen, aber (noch) nicht über das Plugin synchronisiert werden.

## Speicherung

Die URL wird beim nächsten Speichern des Metadaten-Tabs persistiert. Ein leeres Feld wird als `NULL` gespeichert — das Feld ist optional, kein Buch braucht zwingend eine URL.
