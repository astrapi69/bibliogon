# KI offline (eigener API-Schlüssel)

In der Web-App (dem Backend-losen Build unter
[astrapi69.github.io/bibliogon](https://astrapi69.github.io/bibliogon/))
spricht der KI-Assistent **direkt aus dem Browser** mit deinem KI-Anbieter,
über deinen eigenen API-Schlüssel. Es gibt keinen Bibliogon-Server
dazwischen: dein Text und dein Schlüssel gehen vom Browser direkt zum
gewählten Anbieter und nirgendwo sonst hin.

Diese Seite beschreibt die Browser-direkte Einrichtung. Für die
Textvorschläge im Editor, die Kapitel-Analyse und den Desktop-Ablauf siehe
[KI-Assistent](../ai.md); für die Vorlagen-Befüllung siehe
[KI-Vorlagen](ai-templates.md).

## Schlüssel einrichten

1. Öffne **Einstellungen > KI-Assistent** (den "KI"-Tab).
2. Stelle sicher, dass **KI-Funktionen aktivieren** an ist.
3. Wähle deinen **Anbieter**. Die Auswahl füllt die Standard-Basis-URL und ein
   passendes Modell vor; beides kannst du überschreiben.
4. Gib deinen **API-Schlüssel** ein (bei LM Studio nicht nötig).
5. Klicke **Verbindung testen**. Der Testaufruf läuft komplett im Browser
   gegen den Anbieter — kommt OK zurück, bist du startklar.

Dein Schlüssel wird **lokal in der IndexedDB deines Browsers** gespeichert
(derselbe Speicher, der auch deine Offline-Bücher hält). Er wird **nur an den
Anbieter** gesendet, wenn du eine KI-Funktion nutzt, niemals an einen
Bibliogon-Server.

## Unterstützte Anbieter

| Anbieter | API-Schlüssel | Browser-direkt (CORS) |
|----------|---------------|------------------------|
| OpenAI (GPT) | Ja | Funktioniert |
| Google (Gemini) | Ja | Funktioniert |
| Anthropic (Claude) | Ja | Funktioniert (siehe Header-Hinweis) |
| Mistral | Ja | Kann von CORS blockiert werden |
| LM Studio (lokal) | Nein | Funktioniert immer |

### Anthropic-Header

Ein direkter Browser-Aufruf an Anthropic braucht den Header
`anthropic-dangerous-direct-browser-access`. **Bibliogon setzt diesen
automatisch** — du musst nichts tun. Anbieter Anthropic wählen, Schlüssel
eingeben, fertig.

### CORS: warum manche Anbieter im Browser nicht antworten

Ein Browser-direkter Aufruf unterliegt der CORS-Richtlinie des Anbieters.
OpenAI, Google und ein lokales LM Studio akzeptieren Browser-Anfragen; manche
Anbieter (oder manche Firmennetze) blockieren Cross-Origin-Browser-Aufrufe.
Das zeigt sich beim **Verbindung testen** als Netzwerk-/Transportfehler,
obwohl der Schlüssel korrekt ist.

Wird ein Cloud-Anbieter in deinem Browser blockiert, ist **LM Studio** (oder
ein beliebiger OpenAI-kompatibler lokaler Endpunkt) der zuverlässige
Offline-Weg: es läuft auf deinem eigenen Rechner unter
`http://localhost:1234/v1`, braucht keinen Schlüssel und trifft keine
CORS-Grenze. Richte die Basis-URL auf deinen lokalen Server, und du hast
vollständig lokale, vollständig offline laufende KI.

## Was offline funktioniert

- **Einzelfeld-Generierung** — der kleine KI-Knopf neben einem Feld (der
  `AiGenerateButton`) erzeugt SEO- und Marketing-Text für genau dieses Feld
  (Buchbeschreibung, Rückseitentext, Autoren-Bio, Keywords).
- **"Mit KI füllen"** — die Vorlagen-Befüllung, die ein ganzes Set von
  **Artikel- oder Buch-Metadaten** auf einmal füllt, Browser-direkt gegen
  deinen Anbieter.

Beides läuft komplett clientseitig und feuert **null** Bibliogon-`/api`-Aufrufe.

## Was NICHT offline funktioniert

- Der **`.biblio.yaml` Export-/Import-Roundtrip** — der Ablauf, bei dem du eine
  Vorlagendatei exportierst, sie in einer externen KI (z. B. einem
  Chat-Assistenten) ausfüllst und wieder importierst — braucht die Desktop-App.
  (Das *In-App-* "Mit KI füllen" oben ist das Offline-Äquivalent und deckt
  dieselben Metadaten ab.)

Die vollständige Liste, was ohne Desktop-App geht und was nicht, steht unter
[Web-App](../web-app.md).
