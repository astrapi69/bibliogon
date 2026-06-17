# Import von GitHub

Bibliogon kann Dateien direkt aus einem GitHub-Repository
importieren, ohne dass Git installiert sein muss. Der Import
läuft vollständig im Browser über die öffentliche GitHub-REST-API
und funktioniert daher auch in der reinen Web-App (GitHub Pages)
genauso wie in der Desktop-App.

## Bedienung

1. Öffne den Import-Dialog (Schaltfläche **Importieren** auf dem
   Dashboard oder in der Artikelliste).
2. Wechsle auf den Tab **Von GitHub**.
3. Füge die Repository-URL ein, z. B.
   `https://github.com/benutzer/mein-buch`, und klicke auf
   **Laden**.
4. Navigiere durch die Ordner und setze Häkchen bei den Dateien,
   die du importieren möchtest.
5. Klicke auf **importieren**.

## Akzeptierte URL-Formen

- `https://github.com/benutzer/repo`
- `https://github.com/benutzer/repo/tree/main/unterordner`
- `benutzer/repo` (Kurzform)

## Was importiert wird

- Eine einzelne Markdown-Datei wird zu einem Kapitel (oder einem
  neuen Buch).
- Mehrere ausgewählte Markdown-Dateien werden zu einem Buch mit
  mehreren Kapiteln zusammengefasst.
- `.bgb`- und JSON-Backups werden über den Backup-Import
  eingelesen.
- Ein Medium-ZIP läuft über den Medium-Import.

## Private Repositories und Anfragelimit

Ohne Token erlaubt GitHub 60 Anfragen pro Stunde. Für private
Repositories oder ein höheres Limit (5000 Anfragen pro Stunde)
kannst du unter **Privates Repo? Token hinzufügen** ein GitHub
Personal Access Token eintragen. Das Token wird ausschließlich
lokal im Browser gespeichert und nur an GitHub gesendet.

## Offline

Der GitHub-Import benötigt eine Internetverbindung. Ohne
Netzwerk ist der Tab deaktiviert und zeigt einen entsprechenden
Hinweis.

## Verwandte Themen

- [Import aus einer Git-URL](git-url.md) — die Desktop-Variante
  über einen echten Git-Klon.
- [Import von einer URL](url.md) — eine einzelne Datei von einer
  beliebigen Adresse.
