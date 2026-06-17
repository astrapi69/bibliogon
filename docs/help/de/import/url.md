# Import von einer URL

Bibliogon kann eine einzelne Markdown-, HTML- oder Textdatei von
einer beliebigen öffentlichen Adresse importieren. Der Import
läuft vollständig im Browser und funktioniert online wie in der
Web-App.

## Bedienung

1. Öffne den Import-Dialog (Schaltfläche **Importieren**).
2. Wechsle auf den Tab **Von URL**.
3. Füge die Adresse der Datei ein, z. B.
   `https://example.com/dokument.md`.
4. Klicke auf **Importieren**.

Bibliogon lädt die Datei, erkennt das Format und legt daraus ein
neues Buch mit einem Kapitel an.

## CORS-Hinweis

Der Abruf erfolgt direkt aus dem Browser. Die Zielseite muss das
über die entsprechenden CORS-Header erlauben. Schlägt der Abruf
fehl, blockiert die Seite vermutlich den Cross-Origin-Zugriff —
lade die Datei in dem Fall herunter und importiere sie über den
Tab **Datei**.

## Offline

Der URL-Import benötigt eine Internetverbindung. Ohne Netzwerk
ist der Tab deaktiviert.

## Verwandte Themen

- [Import von GitHub](github.md) — mehrere Dateien aus einem
  Repository.
