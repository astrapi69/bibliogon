# Lizenzen

## Lizenzmodell

Bibliogon verwendet ein Freemium-Modell. Core-Plugins (Export, Hilfe, Erste Schritte, MS-Tools) sind kostenlos und unter MIT-Lizenz verfuegbar. Premium-Plugins (Audiobook, Translation, Grammar) erfordern einen Lizenzschluessel zur Aktivierung.

Lizenzschluessel sind HMAC-SHA256-signiert und werden vollstaendig offline validiert. Es gibt keinen Lizenzserver, keine Internetverbindung ist fuer die Validierung erforderlich. Die Schluessel enthalten den Plugin-Namen, ein Ablaufdatum und eine kryptografische Signatur, die Manipulation verhindert.

## Lizenz aktivieren

1. Navigiere zu **Einstellungen > Lizenzen**.
2. Gib den Plugin-Namen ein (z.B. "audiobook", "translation", "grammar").
3. Fuege den Lizenzschluessel in das Eingabefeld ein.
4. Klicke auf "Aktivieren".

Der Schluessel wird sofort validiert. Bei Erfolg wird das Plugin aktiviert und steht zur Verfuegung. Bei einem ungueltigen oder abgelaufenen Schluessel erscheint eine Fehlermeldung mit dem genauen Grund (z.B. "Schluessel abgelaufen", "Ungueltige Signatur", "Falsches Plugin").

Lizenzschluessel werden lokal in `config/licenses.json` gespeichert. Pro Plugin kann ein Schluessel hinterlegt werden.

## Trial-Keys

Fuer Testzwecke koennen 30-Tage-Trial-Keys generiert werden. Trial-Keys gelten als Wildcard fuer alle Premium-Plugins gleichzeitig. Sie werden ueber die Kommandozeile erzeugt:

```
make generate-trial-key
```

Der generierte Key wird in der Konsole ausgegeben und kann wie ein regulaerer Lizenzschluessel in den Einstellungen eingegeben werden. Nach Ablauf der 30 Tage wird das Plugin automatisch deaktiviert.

Trial-Keys werden unter dem Wildcard-Eintrag `"*"` in `licenses.json` gespeichert. Die Validierung prueft zuerst einen plugin-spezifischen Schluessel und faellt dann auf den Wildcard-Schluessel zurueck.

## Lizenzformat

Lizenzschluessel folgen dem Format:

```
BIBLIOGON-{PLUGIN}-v{VERSION}-{base64-payload}.{base64-signatur}
```

Der Payload enthaelt den Plugin-Namen (oder `*` fuer Trial), das Ablaufdatum und optionale Felder. Die Signatur wird mit dem geheimen Schluessel (`BIBLIOGON_SECRET_KEY`) erzeugt. Ohne den geheimen Schluessel koennen keine gueltigen Lizenzen erstellt werden, aber die Validierung funktioniert offline.

## Haeufige Probleme

- **"Lizenz abgelaufen"**: Der Schluessel hat sein Ablaufdatum ueberschritten. Du benoetigst einen neuen Schluessel.
- **"Plugin nicht gefunden"**: Der Plugin-Name im Schluessel stimmt nicht mit dem installierten Plugin ueberein. Pruefe die Schreibweise.
- **"Ungueltige Signatur"**: Der Schluessel wurde veraendert oder mit einem anderen Secret erzeugt. Stelle sicher, dass der Schluessel korrekt eingefuegt wurde.
