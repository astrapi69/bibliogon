# KI-Vorlagen (Artikel + Bücher)

> Status: ab v0.31.0+ verfügbar (Backend Session 1 fertig;
> Frontend Session 2 in Arbeit). Screenshots sowie die
> Schritt-für-Schritt-Anleitungen für LM Studio und Ollama
> kommen mit Session 2.

## Was es ist

Mit Bibliogons KI-Vorlagen füllst du die Metadaten-Felder eines
Artikels oder Buches – SEO-Titel, Tags, Bildgenerierungs-Prompts,
Backcover-Texte, Kapitel-Zusammenfassungen und mehr – ohne alles
von Hand einzutippen. Drei Arbeitsabläufe stehen zur Verfügung,
alle nutzen dasselbe `.biblio.yaml`-Vorlagenformat:

1. **Eingebaute KI** — Klick auf „Mit KI füllen" in der
   Artikel- oder Buch-Seitenleiste. Bibliogon ruft deinen
   konfigurierten Provider (Anthropic, OpenAI, Google, Mistral)
   auf und übernimmt das Ergebnis.
2. **Eigener lokaler Endpoint** — Richte Bibliogons KI-
   Einstellungen auf LM Studio, Ollama oder einen beliebigen
   OpenAI-kompatiblen lokalen Server. „Mit KI füllen" nutzt
   dann dein lokales Modell statt einer kostenpflichtigen
   Cloud-API.
3. **Externe KI per YAML-Roundtrip** — Exportiere eine leere
   (oder teilweise gefüllte) Vorlage, füge das YAML in Claude.ai
   oder ChatGPT ein, hole die gefüllte Antwort zurück und
   importiere sie. Kein API-Schlüssel nötig.

Alle drei Wege produzieren dieselbe `.biblio.yaml` und laufen
durch dieselbe Import-Pipeline.

## Das Vorlagenformat

Eine `.biblio.yaml` ist selbsterklärend: Jedes ausfüllbare Feld
trägt eine `description`, ein realistisches `example` und den
`current_value` (den die KI füllt). Ganz oben in der Datei steht
der Regelblock für die KI – damit dieselbe Datei mit jeder KI
funktioniert, ohne Bibliogon-Kontext.

> Screenshots und ein vollständiges Beispiel folgen mit dem
> Frontend-Release von Session 2.

## Feldgruppen

Wähle, welche Kategorien gefüllt werden sollen. Du musst nicht
alle auf einmal abarbeiten.

**Artikel**

- `seo` — seo_title + seo_description
- `tags` — 5-10 kleingeschriebene Tags
- `topic` — ein Hauptthema
- `excerpt` — 200-300 Zeichen Kurzfassung
- `image_prompts` — Hero-Bildprompt + Inline-Prompts pro
  Abschnitt (einer pro H2-Überschrift, maximal 5)

**Bücher**

- `marketing_copy` — backpage_description,
  backpage_author_bio, html_description (Amazon-Stil)
- `tags` — Keywords für die Marktplatz-Suche
- `description_genre` — interne Beschreibung + Genre
- `cover_prompt` — Stable-Diffusion-Prompt fürs Cover
- `chapter_summaries` — ein-Satz-Zusammenfassung pro Kapitel

## Massenoperationen

Für größere Stapel (bis zu 50 Einträge gleichzeitig):

- **Vorlagen-Export im Stapel** → ZIP mit einer `.biblio.yaml`
  pro Eintrag. Bearbeite sie wie du willst.
- **Vorlagen-Import im Stapel** → ZIP zurück. Jeder Eintrag
  wird über `reference.id` seinem Datensatz zugeordnet.
- **Massen-KI-Füllung** → startet einen Hintergrundjob. Du
  beobachtest den Fortschritt live über den SSE-Stream. Bevor
  du bestätigst, zeigt der **Kostenschätzungs-Dialog** die
  Aufschlüsselung pro Eintrag für die gewählten Feldgruppen
  sowie die Gesamtsumme.

## Bestehende Werte überschreiben

Standardmäßig überspringt die KI-Füllung Felder mit bereits
gesetztem Wert. Zum Überschreiben aktivierst du im Dialog die
Option „Bestehende Werte überschreiben" (oder gibst
`?force=true` über die API mit).

> Anleitungen für den lokalen LM Studio-Server und Ollamas
> `ollama serve`-Modus folgen mit Session 2.
