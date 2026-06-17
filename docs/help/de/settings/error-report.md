# Fehlerberichte

Wenn etwas schiefläuft, kann Bibliogon einen fertigen Fehlerbericht für dich vorbereiten — mit genug technischem Detail, um direkt bearbeitbar zu sein, und der strikten Garantie, dass nichts Privates deinen Rechner verlässt.

## Wo du ihn findest

Öffne **Einstellungen → Über** und klicke auf **Fehlerbericht erstellen**. Das öffnet den Berichts-Dialog auch ohne vorausgehenden Absturz, sodass du ihn jederzeit nutzen kannst, um ein Problem zu beschreiben.

Derselbe Dialog erscheint außerdem automatisch, nachdem Bibliogon einen Fehler abgefangen hat — dann bereits mit Fehlermeldung und Stacktrace ausgefüllt.

## Was der Bericht enthält

Der Dialog zeigt dir genau, was enthalten sein wird, bevor du irgendetwas damit machst. Über Checkboxen wählst du, welche Teile angehängt werden:

- **Fehlermeldung und Stacktrace** — nur vorhanden, wenn der Bericht auf einen echten Fehler folgt (dann ist die Checkbox fest aktiviert).
- **Umgebungsinformationen** — Bibliogon-Version, Browser und Betriebssystem. Standardmäßig an.
- **Aktions-Historie** — ein kurzes Protokoll deiner letzten Aktionen (Klicks, Navigation, geöffnete Dialoge, API-Aufrufe und ihr Status). Du kannst es aufklappen und jeden Eintrag lesen, bevor du entscheidest, ob du es mitschickst.

## Was aufgezeichnet wird — und was NICHT

Damit die Aktions-Historie nützlich ist, hält Bibliogon ein kleines, rollierendes Protokoll der letzten Ereignisse im Arbeitsspeicher. Die Datenschutz-Garantien dahinter sind bewusst und strikt:

- **Es werden niemals Buch-Inhalte aufgezeichnet.** Deine Kapitel, Artikel und jeder Editor-Text landen nie im Protokoll.
- **Es werden keine Tastatureingaben aufgezeichnet.** Eingaben über die Tastatur werden nie erfasst.
- **Sensible Felder werden geschwärzt.** Alles, was nach Passwort, Token, API-Schlüssel, Lizenz oder Zugangsdaten aussieht, wird durch `[REDACTED]` ersetzt, noch bevor es überhaupt gespeichert wird.
- **URLs werden von Query-Parametern befreit**, und jeder Protokoll-Eintrag wird auf eine kurze Länge gekürzt.
- **Es wird nichts automatisch irgendwohin gesendet.** Das Protokoll liegt nur im Arbeitsspeicher und wird beim Schließen des Tabs verworfen.

Der Dialog sagt es klar: keine Buch-Inhalte, keine Passwörter und keine Lizenz-Keys werden jemals gesendet.

## Was du mit dem Bericht tun kannst

Der Dialog bietet drei unabhängige Wege, ihn zu nutzen — keiner davon sendet von sich aus Daten:

- **Issue auf GitHub erstellen** — öffnet ein vorausgefülltes GitHub-Issue in einem neuen Tab. Du prüfst es dort und entscheidest, ob du es absendest. (Lange Berichte werden automatisch gekürzt, damit sie in die URL-Längenbegrenzung von GitHub passen.)
- **Vorschau kopieren** — kopiert den vollständigen Berichtstext in die Zwischenablage, sodass du ihn beliebig einfügen kannst.
- **Als JSON herunterladen** — speichert den Bericht als Datei `bibliogon-fehlerbericht-…json`, die du an eine E-Mail anhängen oder für deine Unterlagen behalten kannst.

Mit **Vorschau anzeigen** liest du den kompletten Berichtstext, bevor du eine der obigen Aktionen wählst.

## Verwandte Themen

- [Einstellungen-Navigation](sidebar.md) — wo der Über-Reiter sitzt
- [Fehlerbehebung](../troubleshooting.md) — häufige Probleme und Lösungen
