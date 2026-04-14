# KI-Assistent

Bibliogon enthält einen optionalen KI-Assistenten, der beim Schreiben, Bearbeiten und Vermarkten hilft. Er unterstützt mehrere KI-Anbieter und funktioniert sowohl mit Cloud-Diensten als auch mit lokalen Modellen.

## Einrichten

1. Öffne **Einstellungen > Allgemein > KI-Assistent**
2. Aktiviere **KI-Funktionen aktivieren**
3. Wähle deinen Anbieter (Anthropic, OpenAI, Google Gemini, Mistral oder LM Studio)
4. Gib deinen API-Schlüssel ein (nicht nötig für LM Studio)
5. Klicke **Verbindung testen** zur Überprüfung

Beim ersten Start führt ein Einrichtungsassistent durch diese Schritte.

Der KI-Assistent ist standardmäßig deaktiviert. Dein Text wird nur an den KI-Anbieter gesendet, wenn du eine KI-Funktion ausdrücklich nutzt. Im Hintergrund wird nichts gesendet.

## Anbieter

| Anbieter | API-Schlüssel nötig | Hinweise |
|----------|---------------------|----------|
| Anthropic (Claude) | Ja | Hochwertige Schreibhilfe |
| OpenAI (GPT) | Ja | Weit verbreitet |
| Google (Gemini) | Ja | Kostenlose Stufe verfügbar |
| Mistral | Ja | Europäischer Anbieter |
| LM Studio | Nein | Läuft lokal auf deinem Computer, vollständig offline |

LM Studio ist ideal, wenn du KI-Hilfe nutzen möchtest, ohne deinen Text an einen Cloud-Dienst zu senden.

## Textvorschläge

Markiere im Editor einen Text und klicke den KI-Button in der Toolbar. Vier Modi stehen zur Verfügung:

- **Verbessern** - Grammatik korrigieren, Klarheit und Fluss verbessern
- **Kürzen** - den Text prägnanter machen
- **Erweitern** - mehr Details und Beschreibungen hinzufügen
- **Eigener Prompt** - eigene Anweisung eingeben

Die KI liefert einen Vorschlag. Klicke **Übernehmen** um die Auswahl zu ersetzen, oder **Verwerfen** um das Original zu behalten.

Die KI passt ihre Vorschläge an das Genre und die Sprache deines Buches an.

## Kapitel-Review

Klicke den **Review**-Tab im KI-Panel. Die KI analysiert das gesamte Kapitel und gibt strukturiertes Feedback:

- **Zusammenfassung** - ein Satz zum Kapitelinhalt
- **Stärken** - was gut funktioniert, mit konkreten Verweisen
- **Vorschläge** - konkrete Verbesserungen mit Erklärungen
- **Gesamtbewertung** - eine kurze Einschätzung

Das Review berücksichtigt das Genre deines Buches und gibt genregerechtes Feedback (z.B. Pacing-Feedback für Thriller, Klarheits-Feedback für Sachbücher).

## Marketing-Texte

Unter **Buch-Metadaten > Marketing** hat jedes Textfeld einen kleinen KI-Button:

- **Buchbeschreibung (Amazon)** - generiert einen HTML-Klappentext für Online-Shops
- **Rückseitentext** - knapper Text für die gedruckte Rückseite
- **Autorenbiografie** - Kurzbiografie in dritter Person
- **Keywords** - Suchbegriffe für Amazon KDP

Die KI nutzt Buchtitel, Autorname, Genre, Beschreibung und Kapitelüberschriften, um relevante Texte zu generieren. Du kannst das Ergebnis vor dem Speichern bearbeiten.

## Nutzungsverfolgung

Bibliogon zählt, wie viele KI-Tokens jedes Buch verbraucht. Der aktuelle Stand und die geschätzten Kosten werden im Marketing-Tab angezeigt. So behältst du den Überblick über deine KI-Nutzung.

## Datenschutz

- KI-Funktionen sind standardmäßig deaktiviert
- Dein Text wird nur gesendet, wenn du einen KI-Button klickst
- Im Hintergrund wird nichts gesendet
- Der API-Schlüssel wird nur lokal gespeichert, nie weitergegeben
- LM Studio behält alles auf deinem Computer
