# Git-Sicherung: Remote

Mit einem Remote (GitHub, GitLab, Gitea, Codeberg, eigener Server) kannst du Commits vom lokalen Repository hochladen (Push) und von dort holen (Pull). So synchronisierst du dein Buch zwischen Geräten oder sicherst es extern.

Bibliogon spricht standardmäßig Git über HTTPS mit einem Personal Access Token (PAT). SSH wird in **Git-Sicherung > SSH-Schlüssel** beschrieben.

## Privates Repository erstellen

Bevor du in Bibliogon konfigurierst, lege ein leeres Repository bei deinem Host an.

### GitHub

1. Gehe zu [github.com/new](https://github.com/new).
2. **Repository name**: beliebig (z. B. `mein-buch`).
3. **Private** wählen. Ein öffentliches Repo bedeutet, dass dein unveröffentlichtes Manuskript weltweit lesbar ist.
4. **Add a README file** deaktivieren — das Repository muss leer sein, sonst kollidiert es mit dem ersten Push.
5. **Create repository** klicken.

Die HTTPS-URL siehst du anschließend (z. B. `https://github.com/dein-nutzer/mein-buch.git`).

### GitLab

1. [gitlab.com/projects/new](https://gitlab.com/projects/new) → **Create blank project**.
2. **Project name** eingeben, **Visibility** auf **Private**.
3. **Initialize repository with a README** deaktivieren.
4. **Create project**.

### Gitea / selbstgehostet

Funktioniert wie GitHub/GitLab. Wichtig: leeres Repo, HTTPS-URL notieren.

## Personal Access Token erstellen

Ein PAT ist ein Ersatz für dein Passwort. Er gibt Bibliogon nur die Rechte, die für Push/Pull nötig sind.

### GitHub

1. [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token** → **Fine-grained token**.
2. **Repository access** → **Only select repositories** → dein Buch-Repo wählen.
3. **Repository permissions** → **Contents: Read and write**. Keine anderen Rechte.
4. **Expiration** setzen (90 Tage empfohlen).
5. Token kopieren und sicher verwahren — er wird nur einmal angezeigt.

### GitLab

1. **Preferences** → **Access Tokens** → neuer Token.
2. **Scopes**: `read_repository`, `write_repository`.
3. **Expiration** setzen.
4. Token kopieren.

## Remote in Bibliogon konfigurieren

1. **Git-Sicherung** öffnen (Sidebar des Buchs).
2. Bei noch nicht konfiguriertem Remote: **Remote konfigurieren**.
3. **Remote-URL**: die HTTPS-URL vom Host (z. B. `https://github.com/dein-nutzer/mein-buch.git`).
4. **Personal Access Token**: den eben erstellten PAT.
5. **Speichern**.

Bibliogon verschlüsselt den PAT mit Fernet und speichert ihn lokal in `config/git_credentials/<Buch-ID>.enc`. Der Token wird nie in Git-Configs, Commits oder API-Antworten sichtbar.

## Push und Pull

**Push** lädt deine lokalen Commits zum Remote:

1. **Git-Sicherung** öffnen.
2. **Push** klicken.
3. Erfolgsmeldung: **Push erfolgreich**.

**Pull** holt Remote-Commits:

1. **Git-Sicherung** öffnen.
2. **Pull** klicken.
3. Drei Ergebnisse möglich:
   - **Pull erfolgreich** — neue Remote-Commits sind jetzt lokal.
   - **Bereits aktuell** — Remote hatte nichts Neues.
   - **Konflikte** — lokale und Remote-Historie divergieren. Siehe **Konflikte auflösen** unten.

Die **Synchron-Anzeige** (Badge im Dialog, Punkt an der Sidebar) zeigt den letzten bekannten Zustand: **synchron**, **lokal vorne** (du hast Commits, die nicht am Remote sind), **Remote hat Änderungen** (Remote hat Commits, die nicht lokal sind), **divergiert**.

## Konflikte auflösen

Wenn Push abgelehnt wird (Remote hat neuere Commits) oder Pull divergiert, öffnet sich das Auflösungs-Panel mit drei Optionen:

- **Mergen** — 3-Wege-Merge versuchen. Bei unterschiedlichen Dateien auf beiden Seiten: automatisches Merge-Commit. Bei überlappenden Änderungen in derselben Datei: Datei-für-Datei-Auswahl.
- **Lokal erzwingen (Force Push)** — lokale Historie überschreibt Remote. Bestätigung erforderlich. Remote-Commits gehen verloren.
- **Abbrechen** — nichts passiert.

Bei Datei-für-Datei-Konflikten pro Datei entweder **Lokal** oder **Remote** wählen, dann **Auflösung anwenden**. Oder **Merge abbrechen** — der pre-Merge-Zustand wird wiederhergestellt.

## Best Practices

- **Immer privates Repo.** Öffentliche Repos zeigen jeden Commit weltweit.
- **Nie Geheimnisse committen.** Der `.gitignore` blockt Audiobooks und Exporte, aber keine manuell in Kapiteln hinterlegten API-Keys oder Passwörter.
- **PAT regelmäßig rotieren.** 90-Tage-Ablauf ist ein guter Mittelweg zwischen Sicherheit und Bequemlichkeit.
- **Vor Force Push dreimal überlegen.** Wenn das Remote-Repository von anderen genutzt wird, zerstört Force Push deren Arbeit.
- **Pull vor Push.** Besonders wenn du auf mehreren Geräten arbeitest.

## Fehlerbehebung

**Authentifizierung fehlgeschlagen: PAT prüfen.**
Der PAT ist falsch, abgelaufen oder hat keine Schreibrechte auf das Repo. Neuen PAT erstellen, in Bibliogon **Remote bearbeiten**, neuen Token eintragen.

**Push abgelehnt.**
Remote hat Commits, die du nicht hast. Entweder **Mergen** (saubere Auflösung) oder **Lokal erzwingen** (wenn du sicher bist, dass Remote überschrieben werden darf).

**Netzwerk-Fehler.**
Keine Internetverbindung oder Host nicht erreichbar. Bibliogon arbeitet weiter lokal — commit wie gewohnt, push wenn die Verbindung zurück ist.
