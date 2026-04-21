# Git-Sicherung: SSH-Schlüssel

SSH ist eine Alternative zur HTTPS-Authentifizierung für Git. Statt eines Personal Access Tokens verwendest du einen kryptografischen Schlüssel, den du einmal einrichtest.

Vorteile gegenüber HTTPS+PAT:
- Kein Token-Ablauf, kein regelmäßiges Erneuern.
- Kein Passwort-Dialog bei jedem Push/Pull.
- Funktioniert auch auf Hosts, die HTTPS nicht unterstützen.

Nachteile:
- Einmaliger Setup-Aufwand.
- Der öffentliche Schlüssel muss bei jedem Host hinterlegt werden.
- Der private Schlüssel darf niemals geteilt werden.

Bibliogon erzeugt **einen Schlüssel pro Installation** (nicht pro Buch). Derselbe Schlüssel funktioniert für alle SSH-Remotes.

## Schlüssel in Bibliogon erzeugen

1. **Einstellungen > Allgemein** öffnen.
2. Abschnitt **SSH-Schlüssel für Git** finden.
3. Optional: einen **Kommentar** eintragen (z. B. `bibliogon-aster-laptop`). Dieser erscheint im UI des Git-Hosts als Label.
4. **Schlüssel erzeugen** klicken.

Bibliogon generiert ein Ed25519-Schlüsselpaar nach OpenSSH-Format. Der private Teil wird unter `config/ssh/id_ed25519` mit Rechten `0600` abgelegt; der öffentliche unter `config/ssh/id_ed25519.pub` mit `0644`.

Nach Erzeugung siehst du den öffentlichen Schlüssel im Textfeld. Er hat die Form:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... dein-kommentar
```

Mit **Öffentlichen Schlüssel kopieren** in die Zwischenablage übernehmen.

## Öffentlichen Schlüssel beim Host hinterlegen

### GitHub

1. [github.com/settings/keys](https://github.com/settings/keys) → **New SSH key**.
2. **Title**: aussagekräftig, z. B. „Bibliogon (Arbeit)".
3. **Key type**: `Authentication Key`.
4. **Key**: aus der Zwischenablage einfügen.
5. **Add SSH key**.

### GitLab

1. **Preferences** → **SSH Keys** → neuer Key.
2. **Key**: einfügen.
3. **Title**: z. B. „Bibliogon".
4. **Expires at** optional setzen.
5. **Add key**.

### Gitea / selbstgehostet

Konto-Einstellungen → SSH / GPG Keys → Add Key.

## SSH-URL verwenden

Statt einer HTTPS-URL konfigurierst du im Buch-Remote die SSH-Variante:

- GitHub: `git@github.com:dein-nutzer/mein-buch.git`
- GitLab: `git@gitlab.com:dein-nutzer/mein-buch.git`
- Gitea: `git@gitea.example.com:dein-nutzer/mein-buch.git`

1. **Git-Sicherung** öffnen, **Remote bearbeiten**.
2. **Remote-URL** auf die SSH-Form ändern.
3. **PAT-Feld leer lassen** — bei SSH-URLs wird das Token ignoriert. Vorhandene PATs kannst du gespeichert lassen oder beim Speichern eines leeren Felds löschen, falls du HTTPS nicht mehr nutzen wirst.
4. **Speichern**.

Beim nächsten Push/Pull greift Bibliogon automatisch auf den SSH-Schlüssel zu — keine weitere Eingabe nötig.

## Sicherheit

- **Privater Schlüssel bleibt lokal.** `config/ssh/id_ed25519` wird nie übertragen, kopiert oder geteilt. Wer ihn bekommt, kann in deinem Namen auf jedes Repo zugreifen, bei dem der öffentliche Teil hinterlegt ist.
- **Rechte 0600 sind Pflicht.** OpenSSH verweigert Schlüssel mit offeneren Rechten. Bibliogon setzt die Rechte automatisch.
- **Schlüssel ersetzen statt kopieren.** Neuer Rechner? Lieber einen neuen Schlüssel pro Installation erzeugen und den alten löschen.
- **Kommentar identifiziert den Schlüssel.** Der Kommentar ist kein Geheimnis, aber er hilft beim Aufräumen: wenn du im Host-UI zehn Schlüssel siehst und nicht mehr weißt, welcher zu welchem Gerät gehört, helfen sprechende Kommentare.

## Von HTTPS zu SSH wechseln

1. SSH-Schlüssel in Bibliogon erzeugen (siehe oben).
2. Öffentlichen Teil beim Host hinterlegen.
3. Im Buch-Dialog **Remote bearbeiten** → URL auf SSH-Form ändern.
4. Ersten Push machen — Bibliogon nutzt nun SSH.

Der alte PAT bleibt verschlüsselt gespeichert, falls du zurückwechseln willst. Zum Entfernen: in Bibliogon **Remote löschen**, dann neu mit nur der SSH-URL (ohne PAT) konfigurieren.

## Fehlerbehebung

**„Permission denied (publickey)."**
Der öffentliche Schlüssel wurde beim Host nicht hinterlegt oder einem anderen Konto zugeordnet. Im Host-UI prüfen, ob der Schlüssel dort sichtbar ist und zum richtigen Benutzer gehört.

**„Host key verification failed."**
Erster Kontakt mit einem Host. Bibliogon akzeptiert unbekannte Hosts einmalig (`StrictHostKeyChecking=accept-new`) und pinnt den Fingerprint für alle weiteren Verbindungen. Wenn die Fehlermeldung bei einem bekannten Host auftritt, könnte ein Man-in-the-Middle im Spiel sein — nicht ignorieren.

**SSH-Schlüssel verloren.**
Privaten Schlüssel nicht mehr auffindbar (Bibliogon neu installiert, Home-Verzeichnis gelöscht, etc.): in **Einstellungen > SSH-Schlüssel** neuen Schlüssel erzeugen, dabei Option **überschreiben** bestätigen. Alten öffentlichen Schlüssel beim Host entfernen, neuen hinterlegen.
