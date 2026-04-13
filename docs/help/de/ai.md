# KI-Assistent

Bibliogon enthaelt einen optionalen KI-Assistenten, der beim Schreiben, Bearbeiten und Vermarkten hilft. Er unterstuetzt mehrere KI-Anbieter und funktioniert sowohl mit Cloud-Diensten als auch mit lokalen Modellen.

## Einrichten

1. Oeffne **Einstellungen > Allgemein > KI-Assistent**
2. Aktiviere **KI-Funktionen aktivieren**
3. Waehle deinen Anbieter (Anthropic, OpenAI, Google Gemini, Mistral oder LM Studio)
4. Gib deinen API-Schluessel ein (nicht noetig fuer LM Studio)
5. Klicke **Verbindung testen** zur Ueberpruefung

Beim ersten Start fuehrt ein Einrichtungsassistent durch diese Schritte.

Der KI-Assistent ist standardmaessig deaktiviert. Dein Text wird nur an den KI-Anbieter gesendet, wenn du eine KI-Funktion ausdruecklich nutzt. Im Hintergrund wird nichts gesendet.

## Anbieter

| Anbieter | API-Schluessel noetig | Hinweise |
|----------|----------------------|----------|
| Anthropic (Claude) | Ja | Hochwertige Schreibhilfe |
| OpenAI (GPT) | Ja | Weit verbreitet |
| Google (Gemini) | Ja | Kostenlose Stufe verfuegbar |
| Mistral | Ja | Europaeischer Anbieter |
| LM Studio | Nein | Laeuft lokal auf deinem Computer, vollstaendig offline |

LM Studio ist ideal, wenn du KI-Hilfe nutzen moechtest, ohne deinen Text an einen Cloud-Dienst zu senden.

## Textvorschlaege

Markiere im Editor einen Text und klicke den KI-Button in der Toolbar. Vier Modi stehen zur Verfuegung:

- **Verbessern** - Grammatik korrigieren, Klarheit und Fluss verbessern
- **Kuerzen** - den Text praegnanter machen
- **Erweitern** - mehr Details und Beschreibungen hinzufuegen
- **Eigener Prompt** - eigene Anweisung eingeben

Die KI liefert einen Vorschlag. Klicke **Uebernehmen** um die Auswahl zu ersetzen, oder **Verwerfen** um das Original zu behalten.

Die KI passt ihre Vorschlaege an das Genre und die Sprache deines Buches an.

## Kapitel-Review

Klicke den **Review**-Tab im KI-Panel. Die KI analysiert das gesamte Kapitel und gibt strukturiertes Feedback:

- **Zusammenfassung** - ein Satz zum Kapitelinhalt
- **Staerken** - was gut funktioniert, mit konkreten Verweisen
- **Vorschlaege** - konkrete Verbesserungen mit Erklaerungen
- **Gesamtbewertung** - eine kurze Einschaetzung

Das Review beruecksichtigt das Genre deines Buches und gibt genregerechtes Feedback (z.B. Pacing-Feedback fuer Thriller, Klarheits-Feedback fuer Sachbuecher).

## Marketing-Texte

Unter **Buch-Metadaten > Marketing** hat jedes Textfeld einen kleinen KI-Button:

- **Buchbeschreibung (Amazon)** - generiert einen HTML-Klappentext fuer Online-Shops
- **Rueckseitentext** - knapper Text fuer die gedruckte Rueckseite
- **Autorenbiografie** - Kurzbiografie in dritter Person
- **Keywords** - Suchbegriffe fuer Amazon KDP

Die KI nutzt Buchtitel, Autorname, Genre, Beschreibung und Kapitelueberschriften, um relevante Texte zu generieren. Du kannst das Ergebnis vor dem Speichern bearbeiten.

## Nutzungsverfolgung

Bibliogon zaehlt, wie viele KI-Tokens jedes Buch verbraucht. Der aktuelle Stand und die geschaetzten Kosten werden im Marketing-Tab angezeigt. So behaeltst du den Ueberblick ueber deine KI-Nutzung.

## Datenschutz

- KI-Funktionen sind standardmaessig deaktiviert
- Dein Text wird nur gesendet, wenn du einen KI-Button klickst
- Im Hintergrund wird nichts gesendet
- Der API-Schluessel wird nur lokal gespeichert, nie weitergegeben
- LM Studio behaelt alles auf deinem Computer
