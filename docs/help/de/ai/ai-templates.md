# KI-Vorlagen (Artikel + Bücher)

Mit Bibliogons KI-Vorlagen füllst du die Metadaten-Felder eines
Artikels oder Buches – SEO-Titel, Tags, Bildgenerierungs-Prompts,
Backcover-Texte, Kapitel-Zusammenfassungen und mehr – ohne alles
von Hand einzutippen. Dasselbe `.biblio.yaml`-Format treibt drei
gleichwertige Arbeitsabläufe; nimm den, der zu deinem Setup
passt.

> Screenshot: KI-Vorlage-Panel in der Artikel-Editor-Seitenleiste
> mit den drei Buttons „Mit KI füllen", „Vorlage exportieren",
> „Gefüllte Vorlage importieren", und dem Feldgruppen-Dialog
> geöffnet aus „Mit KI füllen" mit den Checkboxen für SEO / Tags
> / Thema / Auszug / Bildprompts.

## Die drei Arbeitsabläufe

### Arbeitsablauf A – Eingebaute KI

Du konfigurierst einen KI-Anbieter (Anthropic, OpenAI, Google,
Mistral) unter Einstellungen → KI-Assistent und klickst „Mit KI
füllen" im Artikel- oder Buch-Editor. Bibliogon ruft den Anbieter
direkt auf, parst die YAML-Antwort und übernimmt die Felder. Der
ergonomisch günstigste Weg; kostet, was der Anbieter pro Anfrage
verrechnet.

### Arbeitsablauf B – Eigener lokaler Endpoint

Richte Bibliogons KI-Einstellungen auf LM Studio, Ollama oder
einen beliebigen OpenAI-kompatiblen lokalen Server. „Mit KI
füllen" nutzt dann dein lokales Modell statt einer kostenpflicht-
igen Cloud-API. Für die meisten lokalen Setups kein API-
Schlüssel nötig; die Latenz hängt von deiner Hardware ab. Siehe
[LM Studio-Anleitung](#lm-studio-anleitung) und
[Ollama-Anleitung](#ollama-anleitung) weiter unten.

### Arbeitsablauf C – Externe KI per YAML-Roundtrip

Exportiere eine leere (oder teilweise gefüllte) `.biblio.yaml`,
füge sie in Claude.ai oder ChatGPT ein, hol die gefüllte Antwort
zurück und lade sie über „Gefüllte Vorlage importieren" hoch.
Keine KI-Konfiguration auf der Bibliogon-Seite nötig; funktion-
iert mit jedem KI-Dienst, der YAML lesen und zurückgeben kann.

## Das Vorlagenformat

Jede `.biblio.yaml` ist selbsterklärend. Jedes ausfüllbare Feld
trägt drei Schlüssel: eine `description` in Klartext, ein
realistisches `example` und den `current_value` (den die KI
füllt). Ganz oben in der Datei steht der Regelblock für die KI –
nur `current_value` füllen, in der Sprache des Artikels
antworten, echte UTF-8-Zeichen verwenden, bei Unsicherheit Felder
auf null lassen. Diese Regeln reisen MIT der Datei, sodass
Arbeitsablauf C mit jeder KI funktioniert, die du gerade nutzt.

> Screenshot: eine `.biblio.yaml` in einem Code-Editor mit dem
> Kommentar-Header oben (Regeln für KI-Assistenten 1-7), gefolgt
> vom Referenzblock (id, language, body_word_count, body_preview)
> und den ersten zwei ausfüllbaren Feldern (title und seo_title),
> jedes mit description + example + current_value.

## Feldgruppen

Beim Klick auf „Mit KI füllen" wählst du, welche Kategorien die
KI füllen soll. Jede Gruppe ist ein LLM-Aufruf.

### Artikel

- **SEO** – SEO-Titel (max. 60 Zeichen) und Meta-Beschreibung
  (150-160 Zeichen).
- **Tags** – 5-10 kleingeschriebene Tags, die die Themen des
  Artikels widerspiegeln.
- **Thema** – Ein Wort oder ein kurzer Ausdruck als Hauptthema.
- **Auszug** – 200-300 Zeichen lange Kurzfassung für die
  Artikelliste.
- **Bildprompts** – Stable-Diffusion-Prompts: ein Hero-Bild +
  eines pro H2-Abschnitt (standardmäßig max. 5; im Dialog
  überschreibbar).

### Bücher

- **Marketing-Text** – Backcover-Beschreibung + Autorenbio +
  Amazon-HTML-Beschreibung.
- **Keywords** – 5-10 Marktplatz-Keywords.
- **Beschreibung & Genre** – interne Beschreibung + Hauptgenre.
- **Cover-Prompt** – Stable-Diffusion-Prompt für das Buchcover.
- **Kapitel-Zusammenfassungen** – ein-Satz-Zusammenfassung pro
  bestehendem Kapitel, zugeordnet über die chapter_id.

## Die Einführung im Editor

Das KI-Vorlage-Panel beginnt mit einem kurzen Abschnitt
**Einführung** (standardmäßig ausgeklappt), direkt im Editor —
zum Beispiel unter **Buch-Metadaten → KI-Vorlage**. Er erklärt in
zwei Sätzen, was eine `.biblio.yaml`-Vorlage ist und wie man sie
nutzt, sodass du den Editor nicht verlassen musst, um dich zu
orientieren. Ist noch kein KI-Anbieter konfiguriert, zeigt er
einen direkten Link **Einstellungen → KI öffnen**, und ein
**Mehr erfahren**-Link springt zu dieser Hilfeseite für die
vollständige Anleitung.

## Pro-Datensatz-Arbeitsabläufe

Die Artikel- und Buch-Editor-Seitenleisten tragen jeweils ein
**KI-Vorlage**-Panel mit drei Buttons:

- **Mit KI füllen** – öffnet den Feldgruppen-Dialog. Wähle die
  Klassen, aktiviere optional „Bestehende Werte überschreiben",
  klicke Füllen.
- **Vorlage exportieren** – lädt die `.biblio.yaml` des aktuellen
  Datensatzes herunter. Öffne sie in einem Editor, füll sie von
  Hand aus oder füg sie in einen KI-Chat ein.
- **Gefüllte Vorlage importieren** – lege eine gefüllte
  `.biblio.yaml` ab. Die `reference.id` der Vorlage muss zum
  Ziel-Datensatz passen. Die Überschreiben-Option funktioniert
  wie beim Füllen.

> Screenshot: Artikel-Editor-Seitenleiste mit dem KI-Vorlage-
> Panel zwischen PublicationsPanel und der Export-Sektion, alle
> drei Buttons sichtbar, Panel im Standard-Layout.

Standardmäßig werden Felder mit vorhandenem Wert übersprungen.
Die „Bestehende Werte überschreiben"-Option in beiden Dialogen
ersetzt sie.

### Aus Vorlage neu

Beide Dashboards haben einen **Aus Vorlage neu**-Button, der eine
leere `.biblio.yaml` in der gewählten Sprache generiert. Füll
sie manuell oder per KI, lade sie hoch, und ein frischer Daten-
satz wird mit allen Vorlagenfeldern angelegt.

> Screenshot: Artikel-Dashboard-Kopfzeile mit dem primären
> „Neuer Artikel"-Button neben dem sekundären „Aus Vorlage neu"-
> Button, und dem Aus-Vorlage-neu-Dialog mit dem Sprachenwähler
> (auf „de" voreingestellt) und der leeren Drop-Zone.

## Massen-Arbeitsabläufe

Für Stapel bis zu 50 Datensätzen zeigt die Massen-Aktionsleiste
auf jedem Dashboard ein **KI**-Dropdown mit drei Einträgen:

- **Vorlagen exportieren (ZIP)** – packt eine `.biblio.yaml` pro
  ausgewähltem Datensatz in eine ZIP. Bearbeite sie wie du
  willst, importiere sie zurück.
- **Gefüllte Vorlagen importieren (ZIP)** – lädt eine ZIP hoch
  und wendet jeden Eintrag auf seinen Ziel-Datensatz an
  (zugeordnet über `reference.id`). Pro-Eintrag-Fehler
  (Parse-Fehler, unbekannte ID, Schema-Mismatch) erscheinen in
  der Antwort, ohne den ganzen Stapel zu kippen.
- **Mit KI füllen...** – der Massen-KI-Füll-Ablauf. Wähle die
  Feldgruppen, sieh die Aufschlüsselung pro Eintrag vor dem
  Bestätigen, dann beobachte das persistente Dock, das den
  Fortschritt meldet.

> Screenshot: Artikel-Dashboard mit 3 ausgewählten Artikeln, der
> Massen-Aktionsleiste oben und dem geöffneten „KI"-Dropdown mit
> den drei Einträgen, das sekundäre Löschen-Dropdown daneben zum
> Vergleich.

### Kostenschätzung vorab

Der **KI-Füllung bestätigen**-Dialog zeigt jeden Eintrag und
dessen geschätzte Kosten. Unter 10 Einträgen ist die Tabelle
inline; ab 10 hinter einer „Aufschlüsselung pro Eintrag"-
Ausklappung. Die Gesamtsummen zeigen Einträge, LLM-Aufrufe,
Input-Tokens, Output-Tokens, Modellname und geschätzte USD-
Kosten. Der Modellname kommt direkt aus deinen KI-Einstellungen.

> Screenshot: der BulkAiFillConfirmDialog mit 5 ausgewählten
> Artikeln, der Gesamtsummen-Leiste mit 5 Einträgen / 5 LLM-
> Aufrufen / 4000 Input-Tokens / 1000 Output-Tokens / gpt-4o /
> $0.0125, und der Inline-Tabelle pro Eintrag darunter mit
> einer Zeile pro Artikel.

Wenn das konfigurierte Modell nicht in Bibliogons Preistabelle
steht, erscheinen die Kosten als „—" mit dem Hinweis „Kosten
unbekannt, weil das konfigurierte Modell nicht in der
Preistabelle steht". Der Job läuft trotzdem; nur die Schätzung
fehlt.

### Fortschritts-Dock

Nach **KI-Füllung starten** übernimmt das Dock. Es sitzt unten
links und zeigt den Live-Fortschrittsbalken plus den Titel des
aktuell verarbeiteten Eintrags. Klick darauf, um das volle Pro-
Eintrag-Modal mit Gesamtsummen (Einträge / aktualisiert /
Tokens / Kosten) und einer scrollbaren Liste aller Einträge zu
öffnen, farblich nach Status sortiert (läuft / fertig /
übersprungen / Fehler). Du kannst in anderen Bibliogon-Bereichen
weiterarbeiten, während der Job läuft.

> Screenshot: das Bulk-KI-Füll-Dock in der unteren linken Ecke
> des Dashboards mit „KI-Füllung: 3/5" und dem Fortschritts-
> balken bei 60%, darunter der aktuelle Eintragstitel, während
> der Rest des Dashboards interaktiv bleibt.

> Screenshot: das Bulk-KI-Füll-Modal ausgeklappt mit der
> Gesamtsummen-Leiste oben und der Pro-Eintrag-Liste mit 5
> Zeilen: 3 als fertig markiert (grüner Haken) mit Token- und
> Kostenwerten, 1 läuft (blauer Spinner), 1 wartet.

Nach Abschluss kannst du das Dock schließen, das Dashboard
aktualisieren, um alle aktualisierten Metadaten zu sehen, oder
einzelne Datensätze öffnen, um die Füllung zu prüfen.

Wenn du den Browser neu lädst, während ein Job läuft, verbindet
sich Bibliogon über localStorage wieder mit demselben Job, und
das Dock kommt zurück. Der Job läuft serverseitig weiter,
unabhängig davon, ob dein Browser offen ist.

## KI-Einstellungen

Öffne **Einstellungen → KI-Assistent**, um deinen Anbieter zu
konfigurieren.

> Screenshot: Einstellungsseite mit dem KI-Assistent-Tab
> ausgewählt, dem Anbieter-Dropdown (auf „OpenAI (GPT)"
> gesetzt), dem Base-URL-Feld, dem Modell-Feld, Temperature
> + Max-Tokens-Eingaben, dem maskierten API-Schlüssel-Feld mit
> dem Augen-Toggle und dem „Verbindung testen"-Button.

Das Anbieter-Dropdown hat sechs Optionen:

- **Anthropic (Claude)** – Standard-Sonnet-Modell, braucht
  einen Anthropic-API-Schlüssel.
- **OpenAI (GPT)** – Standard `gpt-4o`, braucht einen
  OpenAI-API-Schlüssel.
- **Google (Gemini)** – Standard `gemini-2.0-flash`, braucht
  einen Google-API-Schlüssel.
- **Mistral** – Standard `mistral-large-latest`, braucht einen
  Mistral-API-Schlüssel.
- **LM Studio (lokal)** – Standard `http://localhost:1234/v1`,
  kein API-Schlüssel nötig. Siehe [LM Studio-Anleitung](#lm-studio-anleitung).
- **Eigener Endpoint (OpenAI-kompatibel)** – lässt Base URL und
  Modell leer, du tippst eigene Werte. Für Ollama, vLLM,
  selbst gehostete Gateways oder jeden OpenAI-kompatiblen
  Endpoint ohne Preset.

Ein benannter Preset füllt Base URL + Standard-Modell automatisch
aus und leert den API-Schlüssel. **Eigener Endpoint** über-
schreibt deine bestehenden Werte nicht – er beschriftet nur das
Dropdown, damit die anderen Einstellungen Sinn ergeben.

**Verbindung testen** prüft, ob der Endpoint erreichbar ist und
der Schlüssel (falls vorhanden) authentifiziert. Testen vor dem
Speichern, damit du keine Tokens auf einen falsch konfigurierten
Client verschwendest.

## LM Studio-Anleitung

LM Studio ist eine Desktop-App (macOS / Windows / Linux), die
lokale LLM-Modelle mit einer OpenAI-kompatiblen API ausführt.
Kostenlos, vollständig lokal, das reibungsärmste „Arbeitsablauf
B"-Setup.

### 1. Herunterladen und installieren

Hole LM Studio von <https://lmstudio.ai>. Installiere es für
dein OS, starte es.

### 2. Modell herunterladen

Der Home-Tab zeigt empfohlene Modelle. Wähl ein Bibliogon-
freundliches – Llama 3.1 8B Instruct, Qwen 2.5 7B Instruct oder
ein instruct-getuntes Modell im 4-8B-Bereich funktioniert gut
für Metadaten-Generierung. Klick Download.

> Screenshot: LM Studio Home-Tab mit einer Modellsuche nach
> „qwen 2.5 7B instruct" mit dem Treffer + Download-Button.

### 3. Lokalen Server starten

Wechsle in den **Developer**-Tab (oder „Local Server" in älteren
Versionen). Wähl das heruntergeladene Modell aus dem Dropdown
oben, klick **Start Server** (der grüne Play-Button). LM Studio
meldet `Server running on port 1234` und listet die OpenAI-
kompatible Base URL.

> Screenshot: LM Studio Developer-Tab mit geladenem Modell,
> Server Status auf „Running on port 1234", und der API-
> Endpoint-URL `http://localhost:1234/v1` im rechten Panel.

### 4. Bibliogon konfigurieren

Bibliogon öffnen → Einstellungen → KI-Assistent. Wähl **LM
Studio (lokal)** aus dem Anbieter-Dropdown. Die Base URL füllt
sich automatisch zu `http://localhost:1234/v1`. Lass das Modell-
Feld leer (LM Studio liefert was geladen ist) oder tippe den
Namen, den LM Studio anzeigt. Klick **Verbindung testen** – du
solltest einen grünen „Verbindung erfolgreich"-Toast bekommen.
Klick **Speichern**.

### 5. KI-Features nutzen

Klick irgendwo in Bibliogon auf **Mit KI füllen**. Das lokale
Modell antwortet; kein API-Schlüssel nötig, keine Kosten pro
Anfrage, nach dem Modell-Download komplett offline.

Abwägung: Ein 7B-Modell produziert kürzere, weniger ausgefeilte
Metadaten als GPT-4o. Für SEO + Tags ist das in Ordnung. Für
Marketing-Texte willst du eventuell zu einem größeren lokalen
Modell wechseln (Mixtral 8x7B, wenn deine Hardware das schafft)
oder Arbeitsablauf A mit einem bezahlten Anbieter nutzen.

## Ollama-Anleitung

Ollama ist eine CLI-zuerst-Alternative zu LM Studio, beliebt auf
Servern und Headless-Setups. Gleiches Endergebnis.

### 1. Installieren und Modell ziehen

```bash
# macOS
brew install ollama

# Linux
curl https://ollama.ai/install.sh | sh

# Instruct-Modell ziehen
ollama pull llama3.1:8b-instruct
```

### 2. Server starten

```bash
ollama serve
```

Ollama lauscht standardmäßig auf `http://localhost:11434`. Der
OpenAI-kompatible Endpoint liegt unter `http://localhost:11434/v1`.

> Screenshot: Terminal zeigt `ollama serve` mit dem Start-Banner
> „Listening on 127.0.0.1:11434" und einer anschließenden
> `ollama list`-Ausgabe, die das gezogene Modell bestätigt.

### 3. Bibliogon konfigurieren

Einstellungen → KI-Assistent öffnen. Wähl **Eigener Endpoint
(OpenAI-kompatibel)** aus dem Anbieter-Dropdown. Trag in Base
URL ein: `http://localhost:11434/v1`. Trag in Modell ein:
`llama3.1:8b-instruct` (oder was du gezogen hast). API-Schlüssel
leer lassen.

> Screenshot: Bibliogon Einstellungen KI-Tab mit Anbieter auf
> „Eigener Endpoint (OpenAI-kompatibel)" gesetzt, Base-URL-Feld
> mit `http://localhost:11434/v1`, Modell-Feld mit
> `llama3.1:8b-instruct`, API-Schlüssel leer, Verbindung-testen-
> Button gerade geklickt mit grünem Häkchen.

Klick **Verbindung testen**, dann **Speichern**. **Mit KI füllen**
läuft jetzt über Ollama.

## Schema-Referenz

Für tiefere technische Details – die YAML-Struktur, die Pro-Feld-
Backend-Pipeline, Force-Override-Semantik, Kapitel-Zusammen-
fassungen-Abgleich-Regeln – siehe die Pro-Datensatz-API-
Endpoints in `/openapi.json`. Dieselbe Struktur treibt sowohl
die Pro-Datensatz- als auch die Massen-Abläufe.

## Fehlerbehebung

**„KI-Funktionen sind deaktiviert"-Toast.** Öffne Einstellungen
→ KI-Assistent und prüf den „KI-Funktionen aktivieren"-Schalter
oben.

**„Kosten unbekannt"-Hinweis in der Massen-Schätzung.** Das
konfigurierte Modell steht nicht in Bibliogons Preistabelle. Der
Job läuft normal; nur die USD-Schätzung fehlt. Füg dein Modell
in `backend/app/ai/pricing.py` hinzu, wenn du eine lokale Kopie
betreibst.

**Massen-KI-Füllung 422 „cap is 50".** Jeder Stapel kappt bei
50 Datensätzen. Spalte die Auswahl auf oder lauf zwei Stapel.

**chapter_summaries-Einträge verworfen.** Die KI hat eine
`chapter_id` erfunden, die es im Buch nicht gibt. Der Abgleich
versucht erst `chapter_id`, dann fällt er auf einen
whitespace-normalisierten case-insensitiven Titel-Match zurück;
was dann nicht passt, landet in `dropped_chapter_summaries`.
Mit der korrigierten Vorlage erneut versuchen, oder die richtige
`chapter_id` von Hand im YAML setzen.

**Arbeitsablauf C: „Template type is 'book'; this endpoint
accepts only article templates".** Du hast eine Buch-Vorlage an
den Artikel-Endpoint hochgeladen (oder umgekehrt). Das
`type`-Feld oben im YAML muss zum Datensatz-Typ passen.
