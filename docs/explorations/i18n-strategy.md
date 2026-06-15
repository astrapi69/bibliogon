# EXP-001: Internationalisierungs-Strategie (Sprach-Expansion)

**Kategorie:** Querschnitt · **Phase:** Zukunft · **Priorität:** P4 (Vision,
kein MVP-Blocker) · **Abhängig von:** bestehende i18n-Infrastruktur
(8-Sprachen-YAML-Kataloge, `make sync-i18n`-Äquivalent), TipTap-Editor
RTL-Support · **Issue:** -

> Design-Dokument. Kein Code. Vision-Dokument für nach v0.54.0. Es legt eine
> priorisierte Reihenfolge für Sprach-Expansion fest (UI + Autorensprache)
> und benennt die technischen Voraussetzungen je Sprache.

---

## 1. Idee

### Worum geht es?

Bibliogon unterstützt aktuell **8 UI-Sprachen** (de, el, en, es, fr, ja, pt,
tr) und erreicht damit grob **~3 Mrd. Sprecher** (~37% der Weltbevölkerung;
nach Überlappungs-Bereinigung ~2,2-2,5 Mrd. unique).

Ziel: Reichweite **systematisch** erweitern durch priorisierte Sprach-Expansion
(UI **und** Autorensprache), statt opportunistisch eine Sprache nach der
anderen hinzuzufügen.

Aktuelle Abdeckung:

| Sprache | Sprecher (Total) | Typ |
|---------|-----------------:|-----|
| English | 1.528 Mrd. | Lingua Franca |
| Español | 558 Mio. | Global |
| Français | 312 Mio. | Global + Afrika |
| Português | 267 Mio. | Brasilien + Afrika |
| Deutsch | 133 Mio. | DACH + Web |
| Japanisch | 123 Mio. | Buchmarkt / CJK |
| Türkisch | 90 Mio. | Türkei + Diaspora |
| Griechisch | 13 Mio. | Nische / Diaspora |

### Strategischer Kontext für Bibliogon

Bibliogon hat zwei Sprach-Achsen die sich von einer Lern-App unterscheiden:

1. **UI-Sprache:** In welcher Sprache bedient der Autor die App?
2. **Autorensprache:** In welcher Sprache schreibt der Autor sein Buch/Artikel?

Ein arabischer Autor will die UI auf Arabisch UND sein Buch auf Arabisch
schreiben. Das bedeutet: **RTL muss nicht nur in der UI funktionieren
sondern auch im TipTap-Editor** (Textrichtung pro Kapitel/Dokument).

Die Buch-Sprache ist bereits als Combobox implementiert (#237, 8 Defaults
+ Freitext). Die UI-Sprache wird in den Settings gewählt.

### Was sich ändert - und was nicht

- **UI-Sprache ist nicht Autorensprache.** Eine neue UI-Sprache macht die App
  bedienbar; ein Autor kann bereits jetzt in jeder Sprache schreiben
  (Freitext im TipTap-Editor). Aber RTL-Sprachen brauchen Editor-Support.
- Keine Architektur-Änderung: die bestehende YAML-Katalog-Pipeline
  skaliert auf weitere Sprachen. Offene Punkte: Schrift-/RTL-Support
  und die Skalierung der Sprachauswahl-UI.

---

## 2. Expansions-Optionen

Priorisierung nach: **Sprecherzahl x Self-Publishing-Markt-Relevanz x
Implementierungsaufwand x KDP-Unterstützung**.

### Tier 1 - höchste Priorität, größter ROI

- **Hindi** (609 Mio.) - größter wachsender Buchmarkt, hohe
  Smartphone-Penetration, KDP unterstützt Hindi. Schrift: Devanagari (LTR).
  Technisches Risiko gering.
- **Arabisch** (335 Mio.) - MENA-Region, wachsender Self-Publishing-Markt.
  **RTL-Support nötig** - die technisch anspruchsvollste Erweiterung.
  KDP unterstützt Arabisch.

### Tier 2 - hohe Priorität, moderate Komplexität

- **Koreanisch** (82 Mio.) - tech-affine Bevölkerung, starker
  Webtoon/Webnovel-Markt (relevant für Comic/Bilderbuch-Features).
  Schrift: Hangul.
- **Indonesisch** (200 Mio.+) - größter südostasiatischer Markt,
  Latin-Script, geringste technische Hürde.

> **Hinweis:** Japanisch ist bereits eine der 8 UI-Sprachen (`ja`). Es ist
> daher kein UI-Übersetzungs-Kandidat mehr. Offen bleibt für Japanisch nur
> der CJK-Feinschliff der **Autorensprache** (Font-Stack, Zeilenumbruch-Regeln)
> und die **Manga-Leserichtung** im Comic-Editor - siehe 3.4 und I18N-11.

### Tier 3 - Nische, strategisch

- **Bengalisch** (284 Mio.) - große Sprecherzahl, niedrigere
  Smartphone-Penetration. Schrift: Bengali.
- **Russisch** (255 Mio.) - geopolitisch kompliziert, großer Buchmarkt.
- **Polnisch** (45 Mio.) - DACH-Diaspora-Relevanz.
- **Niederländisch** (30 Mio.) - starker Self-Publishing-Markt in Benelux.
- **Chinesisch** (1.138 Mio.) - riesiger Markt, aber eigenes Ökosystem
  (nicht KDP-zentriert), hohe technische Komplexität.

---

## 3. Technische Herausforderungen

### 3.1 UI-Übersetzung (i18n-Kataloge)

- Aufwand pro Sprache: 1 neuer YAML-Katalog, aktuell rund 3000 Keys pro
  Katalog (en.yaml: 3003, Stand v0.53.0), plus Seed-Kataloge.
- Qualitätssicherung: LLM als Draft + Native-Speaker-Review.
- i18n-Paritäts-Test (`test_i18n_parity`) pinnt gleiche Key-Anzahl
  über alle Kataloge.
- Lazy-geladene Kataloge: neue Sprache bläht den Haupt-Chunk nicht auf.

### 3.2 Autorensprache vs. UI-Sprache

Bibliogon-spezifisch: Der TipTap-Editor muss die Textrichtung
des Dokuments unterstützen, unabhängig von der UI-Sprache.

- **LTR-Sprachen (Hindi, Koreanisch, etc.):** TipTap unterstützt das
  nativ. Nur Font-Stack prüfen.
- **RTL-Sprachen (Arabisch, Hebräisch):** TipTap braucht
  `dir="rtl"` pro Block oder Dokument. Mixed-Direction
  (Arabisch-Text mit englischen Zitaten) ist komplex.
- **Buch-Metadaten:** Titel, Beschreibung, Keywords in
  Autorensprache - RTL-Rendering in Metadaten-Formularen.
- **KDP-Export:** PDF/EPUB müssen die korrekte Textrichtung
  enthalten. Pandoc/pdfmake/epub-gen-memory auf RTL prüfen.

### 3.3 RTL-Support (Arabisch, später Hebräisch/Persisch)

Betrifft die GESAMTE App, nicht nur den Editor:

**UI:**
- CSS logical properties (`margin-inline` statt `margin-left`)
- Tailwind-RTL-Plugin oder `dir="rtl"`-Strategie
- Icon-Spiegelung (Pfeile, Navigation, Sidebar-Collapse)
- Settings-Sidebar / Book-Metadata-Tabs: Layout spiegeln
- Dashboard Kacheln/Listen: Leserichtung

**Editor (TipTap):**
- `dir="rtl"` auf Document-Level oder Block-Level
- Mixed-Direction Support (RTL-Text mit LTR-Code-Blöcken)
- Toolbar-Icons die Richtung implizieren (Einrückung, Listen)
- Cursor-Verhalten in RTL

**Export:**
- PDF: Textrichtung korrekt in pdfmake/Pandoc
- EPUB: `dir="rtl"` im OPF und Content-Dokumenten
- LaTeX: `\setRL` oder Babel-Konfiguration
- Comic/Bilderbuch: Leserichtung der Panels (Manga-Style vs Western)

### 3.4 CJK-Besonderheiten

- **Japanisch/Koreanisch:** Font-Stack, Zeilenumbruch-Regeln
  (kein Wort-basierter Umbruch). Kein RTL.
- **Chinesisch:** Zusätzlich vertikale Schreibrichtung
  (traditionell). Nicht in diesem Dokument priorisiert.

### 3.5 Schrift-Systeme

| Schrift | Sprachen | Status |
|---------|----------|--------|
| Latin | de/en/es/fr/pt/tr + id/nl/pl/vi | Gelöst |
| Griechisch | el | Gelöst |
| Kana + Kanji | Japanisch (`ja`) | UI gelöst; Authoring-Font-Stack prüfen |
| Devanagari | Hindi | Font-Stack prüfen |
| Arabisch | ar | RTL + verbundene Schrift |
| Hangul | Koreanisch | Font-Stack prüfen |
| Bengali | Bengalisch | Font-Stack prüfen |
| Kyrillisch | Russisch | Font-Stack prüfen |

### 3.6 Sprachauswahl-UI skalieren

Bei >8 Sprachen wird das aktuelle Dropdown/Select unübersichtlich.

Lösungen:
- Combobox mit Suchfeld (analog Buch-Sprache #237)
- Gruppierung nach Region/Schrift-System
- Favoriten/Häufig-genutzte oben

---

## 4. Roadmap-Tasks

Prefix `I18N-`. Aufgeteilt nach Tier / Voraussetzung. Aufwand: S/M/L.

| ID | Task | Tier | Aufwand |
|----|------|------|---------|
| I18N-01 | RTL-Infrastruktur UI (CSS logical properties, Tailwind-RTL, Icon-Spiegelung) | Voraussetzung Arabisch | M |
| I18N-02 | RTL-Infrastruktur Editor (TipTap dir="rtl", Mixed-Direction, Toolbar) | Voraussetzung Arabisch | L |
| I18N-03 | RTL-Infrastruktur Export (PDF/EPUB/LaTeX RTL-Support) | Voraussetzung Arabisch | M |
| I18N-04 | Sprachauswahl-UI skalieren (>8 Sprachen: Combobox/Gruppierung) | Voraussetzung alle | S |
| I18N-05 | Hindi UI-Übersetzung + Devanagari Font-Stack | Tier 1 | S |
| I18N-06 | Arabisch UI-Übersetzung (hängt an I18N-01/02/03) | Tier 1 | M |
| I18N-07 | Japanisch CJK-Authoring-Feinschliff (Font-Stack + Zeilenumbruch; UI bereits übersetzt) | Tier 2 | S |
| I18N-08 | Koreanisch UI-Übersetzung + Hangul Font-Stack | Tier 2 | S |
| I18N-09 | Indonesisch UI-Übersetzung | Tier 2 | S |
| I18N-10 | Übersetzungs-QA-Pipeline (LLM Draft + Native Review + Community PR) | Infrastruktur | M |
| I18N-11 | Comic/Bilderbuch RTL-Leserichtung (Panel-Order, Manga-Style Option) | Bonus | M |

---

## 5. Offene Fragen

1. **Zielgruppe - deutschsprachige Autoren oder globale Autoren?**
   Bestimmt ob Polnisch/Arabisch (Diaspora in DACH) oder Hindi/Indonesisch
   (globaler Self-Publishing-Markt) zuerst kommen. Aktuell: Fokus auf
   deutschsprachige Autoren (KDP DE), aber die Plattform ist sprachagnostisch.

2. **RTL-Investment jetzt oder später?** Empfehlung: Hindi (LTR) zuerst,
   RTL-Infra (I18N-01/02/03) parallel vorbereiten, Arabisch danach.

3. **Maschinelle Übersetzung als Startpunkt?** Empfehlung: LLM als Draft,
   Native-Speaker-Review. Konsistent mit der bestehenden Praxis
   (PT/TR wurden AI-generiert).

4. **Font-Loading-Strategie:** Lazy-Load pro Sprache (konsistent mit
   bestehender lazy i18n-Katalog-Strategie). Kein Bundling aller Schriften.

5. **KDP-Sprachenliste als Referenz?** KDP unterstützt ~40+ Sprachen.
   Die Buch-Sprache-Combobox (#237) lässt bereits Freitext zu.
   UI-Sprachen müssen nicht alle KDP-Sprachen abdecken.

6. **Vertikale Schreibrichtung (Japanisch/Chinesisch traditionell)?**
   Für Bibliogon relevant bei Buchtypen die traditionelle Layouts
   nutzen. Sehr hohe Komplexität. Nicht priorisiert.

---

## 6. Bibliogon-spezifische Überlegungen

### Self-Publishing-Markt nach Sprache

| Region | Markt | KDP-Präsenz | Prio für Bibliogon |
|--------|-------|-------------|---------------------|
| DACH | Stark | Hoch | Bereits abgedeckt (DE) |
| USA/UK | Dominant | Sehr hoch | Bereits abgedeckt (EN) |
| Spanien/LatAm | Wachsend | Mittel-Hoch | Bereits abgedeckt (ES) |
| Frankreich | Stabil | Mittel | Bereits abgedeckt (FR) |
| Brasilien | Wachsend | Mittel | Bereits abgedeckt (PT) |
| Japan | Stabil | Hoch | UI bereits abgedeckt (JA); CJK-Authoring = Tier 2 |
| Indien | Explosiv wachsend | Mittel | Hindi = Tier 1 |
| MENA | Wachsend | Niedrig-Mittel | Arabisch = Tier 1 |
| Südkorea | Webtoon/Webnovel | Mittel | Koreanisch = Tier 2 |
| Südostasien | Wachsend | Niedrig | Indonesisch = Tier 2 |

### Comic/Bilderbuch-Besonderheiten

- **Manga (Japanisch):** Leserichtung rechts-nach-links für Panels.
  Bibliogons Comic-Editor müsste eine Panel-Order-Option bekommen.
- **Manhwa (Koreanisch):** Leserichtung links-nach-rechts (wie Western).
- **Arabische Comics:** RTL-Leserichtung für Panels UND Sprechblasen.

### KDP-Export-Anforderungen

KDP hat spezifische Anforderungen pro Sprache:
- Korrekte Sprachkennung im EPUB/PDF-Metadata
- Korrekte Textrichtung
- Korrekte Schrifteinbettung
- Bibliogons Export-Pipeline muss diese Anforderungen pro Sprache erfüllen

---

## 7. Bewertung

Die 8 aktuellen Sprachen decken den europäischen + lateinamerikanischen
Markt solide ab (plus Japanisch als einzige aktuelle CJK-Sprache). Die
größten Reichweiten-Sprünge kommen von **Hindi** (+609 Mio.) und
**Arabisch** (+335 Mio.).

Empfohlener Schnitt für Bibliogon:

1. **Hindi** als nächste Sprache - größte Reichweite, geringstes
   technisches Risiko (LTR, nur Font-Stack), explosiver
   Self-Publishing-Markt in Indien.
2. **RTL-Infrastruktur (I18N-01/02/03) parallel** vorbereiten -
   UI, Editor und Export.
3. **Arabisch** danach - RTL komplett, MENA-Markt erschließen.
4. **Koreanisch** - Tier-2 UI-Sprache, besonders relevant für
   Comic/Bilderbuch (Manhwa). Japanisch ist bereits UI-Sprache;
   offen ist dort nur der CJK-Authoring-Feinschliff (Font-Stack,
   Zeilenumbruch, Manga-Leserichtung).
5. **Tier-3-Sprachen** nach Community-Nachfrage.

**Kein MVP-Blocker.** Vision-Dokument für nach v0.54.0.
