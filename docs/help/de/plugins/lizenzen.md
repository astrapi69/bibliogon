# Lizenzen

## Lizenzmodell

Bibliogon verwendet ein Freemium-Modell. Core-Plugins (Export, Hilfe, Erste Schritte, MS-Tools) sind kostenlos und unter MIT-Lizenz verfügbar. Premium-Plugins (Audiobook, Translation, Grammar) erfordern einen Lizenzschlüssel zur Aktivierung.

Lizenzschlüssel sind HMAC-SHA256-signiert und werden vollstaendig offline validiert. Es gibt keinen Lizenzserver, keine Internetverbindung ist für die Validierung erforderlich. Die Schlüssel enthalten den Plugin-Namen, ein Ablaufdatum und eine kryptografische Signatur, die Manipulation verhindert.

## Lizenz aktivieren

1. Navigiere zu **Einstellungen > Lizenzen**.
2. Gib den Plugin-Namen ein (z.B. "audiobook", "translation", "grammar").
3. Fuege den Lizenzschlüssel in das Eingabefeld ein.
4. Klicke auf "Aktivieren".

Der Schlüssel wird sofort validiert. Bei Erfolg wird das Plugin aktiviert und steht zur Verfuegung. Bei einem ungueltigen oder abgelaufenen Schlüssel erscheint eine Fehlermeldung mit dem genauen Grund (z.B. "Schlüssel abgelaufen", "Ungueltige Signatur", "Falsches Plugin").

Lizenzschlüssel werden lokal in `config/licenses.json` gespeichert. Pro Plugin kann ein Schlüssel hinterlegt werden.

## Trial-Keys

Für Testzwecke koennen 30-Tage-Trial-Keys generiert werden. Trial-Keys gelten als Wildcard für alle Premium-Plugins gleichzeitig. Sie werden über die Kommandozeile erzeugt:

```
make generate-trial-key
```

Der generierte Key wird in der Konsole ausgegeben und kann wie ein regulaerer Lizenzschlüssel in den Einstellungen eingegeben werden. Nach Ablauf der 30 Tage wird das Plugin automatisch deaktiviert.

Trial-Keys werden unter dem Wildcard-Eintrag `"*"` in `licenses.json` gespeichert. Die Validierung prueft zuerst einen plugin-spezifischen Schlüssel und faellt dann auf den Wildcard-Schlüssel zurück.

## Lizenzformat

Lizenzschlüssel folgen dem Format:

```
BIBLIOGON-{PLUGIN}-v{VERSION}-{base64-payload}.{base64-signatur}
```

Der Payload enthaelt den Plugin-Namen (oder `*` für Trial), das Ablaufdatum und optionale Felder. Die Signatur wird mit dem geheimen Schlüssel (`BIBLIOGON_SECRET_KEY`) erzeugt. Ohne den geheimen Schlüssel koennen keine gueltigen Lizenzen erstellt werden, aber die Validierung funktioniert offline.

## Häufige Probleme

- **"Lizenz abgelaufen"**: Der Schlüssel hat sein Ablaufdatum überschritten. Du benötigst einen neuen Schlüssel.
- **"Plugin nicht gefunden"**: Der Plugin-Name im Schlüssel stimmt nicht mit dem installierten Plugin überein. Pruefe die Schreibweise.
- **"Ungueltige Signatur"**: Der Schlüssel wurde verändert oder mit einem anderen Secret erzeugt. Stelle sicher, dass der Schlüssel korrekt eingefuegt wurde.
