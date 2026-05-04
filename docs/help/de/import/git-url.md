# Import aus einer Git-URL

Bibliogon kann ein oeffentliches Git-Repository klonen, das der
[write-book-template](https://github.com/astrapi69/write-book-template)-Struktur
folgt, und als neues Buch importieren.

## Bedienung

1. Oeffne den Import-Assistenten vom Dashboard.
2. Füge die Repo-URL in das Feld "Import aus einer Git-URL"
   oben in Schritt 1 ein.
3. Klicke auf **Klonen + Importieren**.

Bibliogon klont das Repository in ein temporaeres Staging-
Verzeichnis, erkennt das Format wie gewohnt, zeigt das
Preview-Panel und importiert nach Bestätigung.

## Akzeptierte URL-Formen

- `https://github.com/user/repo`
- `https://github.com/user/repo.git`
- `git@github.com:user/repo.git`
- `ssh://git@host/user/repo.git`

## Was aktuell nicht unterstützt wird

Die erste Version von plugin-git-sync ist reiner Import für
**oeffentliche** Repositories. Folgendes ist aufgeschoben:

- Authentifizierung für private Repositories (Basic HTTPS,
  SSH-Keys, GitHub-Tokens).
- Auswahl eines bestimmten Branches oder Tags — der
  Default-Branch wird geklont.
- Shallow Clones für große Repositories.
- Git-LFS-Unterstützung.
- Rückschreiben von Bibliogon-Änderungen ins Repo
  ("Sync-back").
- Smart-Merge beim erneuten Import eines Repositories, das
  sich seit dem letzten Import geändert hat.

## Wenn der Klon fehlschlägt

Der Assistent bleibt im Fehlerschritt stehen und zeigt die
Git-Fehlermeldung. Typische Ursachen:

- Tippfehler in der URL.
- Repository existiert nicht oder ist privat.
- Netzwerk nicht erreichbar.
- Server hat länger als 120 Sekunden gebraucht (Timeout).

Ursache beheben und auf **Erneut versuchen** klicken.

## Wenn das Repository kein Buch ist

Existiert das Repository, entspricht aber nicht der
write-book-template-Struktur (fehlende `config/metadata.yaml`,
fehlendes `manuscript/`-Verzeichnis), läuft der Import über
den generischen Ordner-Importer. Das resultierende Buch ist
dann meist leer. Aus dem Papierkorb löschen und eine andere
URL versuchen.

## Verwandte Themen

- [Git-Sicherung](../git-backup/basics.md) — das Kernfeature, das ein
  Buch versioniert, das du in Bibliogon bearbeitest. Orthogonal
  zum Git-URL-Import: das eine zieht ein Buch rein, das andere
  verfolgt Änderungen an einem bereits in Bibliogon liegenden
  Buch.
