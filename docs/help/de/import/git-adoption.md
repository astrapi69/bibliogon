# Git-Historie aus einem importierten ZIP übernehmen

Wenn du ein write-book-template-ZIP importierst, das ein
`.git/`-Verzeichnis enthält, kann Bibliogon dessen gesamte
Commit-Historie in das Git-Backup des Buches übernehmen. Drei
Modi im Schritt 3 des Import-Assistenten:

- **Neu anfangen** (Standard): das `.git/` wird ignoriert. Das
  Buch startet ohne Git; du kannst später jederzeit ein neues
  Repo über den Git-Sicherungs-Dialog anlegen.
- **Nur Historie übernehmen**: das `.git/` (mit Historie) wird
  in das Uploads-Verzeichnis des Buches kopiert. Die Remote-URL
  wird nicht übernommen; du bindest bei Bedarf manuell eine
  neue an.
- **Historie + Remote übernehmen**: `.git/` wird kopiert UND
  die `origin`-Remote-URL aus der Quelle bleibt erhalten. Den
  PAT gibst du nach dem Import über den Git-Sicherungs-Dialog
  erneut ein (ein im Quell-`.git/` vorhandener PAT wird aus
  Sicherheitsgruenden entfernt).

## Sicherheitsgarantien beim Übernehmen

Jeder Adoptionspfad läuft vor dem Kopieren durch eine
Sanitize-Stufe:

1. `http.*.extraheader` (Basic/Bearer Auth) wird aus
   `.git/config` entfernt.
2. `[credential]`-Sektion wird komplett entfernt — alle Helper.
3. Reflog wird per `git reflog expire --expire=now --all`
   geleert, gefolgt von `git gc --prune=now`, um unerreichbare
   Objekte (die Credential-Fragmente enthalten können) zu
   verwerfen.
4. Eigene Hooks werden **nicht** übernommen. Nur die
   Default-`*.sample`-Dateien wandern mit.
5. Nicht-standardisierte Refs in `packed-refs` (außerhalb von
   `refs/heads/`, `refs/tags/`, `refs/remotes/`) werden
   entfernt.

Der Schritt 3 des Assistenten listet die Befunde vor dem
Commit auf, damit du genau siehst, was entfernt wird.

## Was nach der Uebernahme passiert

Das uebernommene Buch hat `uploads/<book_id>/.git/` auf der
Festplatte. Alle Git-Backup-Endpoints (`commit`, `push`,
`pull`, `status`, `log`, `merge`) funktionieren sofort.

**Wichtig**: Dein erster Bibliogon-Commit nach der
Uebernahme ueberschreibt die übernommenen Working-Tree-
Dateien. Bibliogon schreibt `manuscript/*.json` (kanonische
TipTap-Struktur) und `config/metadata.yaml`. Die
übernommenen Commits bleiben in der Historie unverändert
erhalten; nur der Working-Tree ändert sich.

## Nachtraegliche Uebernahme (für Bücher, die vor diesem Feature importiert wurden)

Wenn du ein Buch hast, das vor Einführung des
Uebernahme-Features importiert wurde, kannst du dessen
Historie weiterhin aus dem Quell-ZIP übernehmen:

```
POST /api/books/{book_id}/git-import/adopt
```

Multipart-Upload: `file` (das ZIP) + Formularfeld
`preserve_remote`. Der Endpoint verweigert die Uebernahme,
wenn das Buch bereits ein `.git/` besitzt — loesche das
vorhandene Repo zuerst über den Git-Sicherungs-Dialog.

## Welchen Modus wann

- **Neu anfangen**: die meisten Importe. Bibliogon trackt
  das Buch ab jetzt neu im Git-Backup.
- **Nur Historie übernehmen**: du willst die Historie
  behalten, aber die Remote der Quelle ist privat, tot oder
  du wirst sie selbst neu anbinden.
- **Historie + Remote übernehmen**: du importierst ein
  Buch direkt von GitHub/GitLab und willst, dass Bibliogon
  weiterhin dorthin pusht. Du brauchst einen PAT
  (Neueingabe im Git-Sicherungs-Dialog).

## Grenzfaelle

- **Shallow-Clone**: wird unverändert übernommen. `push`
  könnte von manchen Remotes abgelehnt werden; per
  `git fetch --unshallow` im Repo bei Bedarf auflösen.
- **Git-LFS-Pointer**: `.gitattributes` mit `filter=lfs`
  wird in den Sicherheitswarnungen angezeigt. LFS-Inhalte
  werden NICHT nachgeladen; Pointer-Dateien erscheinen in
  Kapiteln als defekte Bildreferenzen.
- **Submodule**: `.gitmodules` wird angezeigt.
  Submodul-Inhalte werden in diesem MVP nicht geladen.
- **Beschaedigte Quelle**: `git fsck` läuft nach der
  Sanitize-Stufe. Eine beschädigte Quelle wird mit
  klarer Fehlermeldung abgelehnt; nichts wird in das
  Uploads-Verzeichnis des Buches geschrieben.
