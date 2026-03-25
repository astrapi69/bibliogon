# Bibliogon - Konzeptdokument

**Repository:** [github.com/astrapi69/bibliogon](https://github.com/astrapi69/bibliogon)
**Verwandtes Projekt:** [github.com/astrapi69/write-book-template](https://github.com/astrapi69/write-book-template)
**Version:** 0.2.0 (geplant)
**Stand:** 2026-03-25

---

## 1. Ziel

Bibliogon ist eine Open-Source Web-Plattform zum Schreiben und Exportieren von Buechern. Der Kern der Idee: Was bisher ueber die Kommandozeile mit dem [write-book-template](https://github.com/astrapi69/write-book-template) passiert, soll ueber eine Browser-UI bedienbar werden, auch fuer Anwender ohne technischen Hintergrund.

Bibliogon ersetzt das write-book-template nicht, sondern baut darauf auf. Die UI erzeugt beim Export exakt die gleiche Verzeichnisstruktur, die das Template definiert. Das bedeutet: Ein in Bibliogon geschriebenes Buch kann jederzeit als write-book-template-Projekt exportiert und mit den bestehenden CLI-Tools (Pandoc, `full_export_book.py`) weiterverarbeitet werden.

Langfristiges Ziel ist ein kommerzielles SaaS-Produkt. Die Basis bleibt Open Source (MIT-Lizenz).

---

## 2. Architektur

```
Browser (React + TipTap)
    |
    | REST API
    v
FastAPI (Python)
    |
    +-- SQLite/PostgreSQL (Buch- und Kapitel-Daten)
    +-- Pandoc (EPUB/PDF-Export)
    +-- Dateisystem (write-book-template Struktur)
```

**Tech-Stack:**

| Komponente | Technologie |
|------------|-------------|
| Frontend | React 18, TypeScript, TipTap, Vite |
| Backend | Python 3.11+, FastAPI, SQLAlchemy |
| Datenbank | SQLite (Open Source), PostgreSQL (SaaS) |
| Export | Pandoc, write-book-template Struktur |
| Tooling | Poetry, npm, Docker, Make |

---

## 3. write-book-template Integration

### 3.1 Verzeichnisstruktur

Beim Export erzeugt Bibliogon die vollstaendige write-book-template Struktur:

```
{buch-titel}/
├── manuscript/
│   ├── chapters/
│   │   ├── 01-kapitel-titel.md
│   │   ├── 02-kapitel-titel.md
│   │   └── ...
│   ├── front-matter/
│   │   ├── toc.md
│   │   ├── preface.md
│   │   ├── foreword.md
│   │   └── acknowledgments.md
│   ├── back-matter/
│   │   ├── about-the-author.md
│   │   ├── appendix.md
│   │   ├── bibliography.md
│   │   ├── glossary.md
│   │   └── index.md
│   ├── figures/
│   └── tables/
├── assets/
│   ├── covers/
│   └── figures/
│       ├── diagrams/
│       └── infographics/
├── config/
│   ├── metadata.yaml
│   ├── styles.css
│   └── template.tex          (optional)
├── output/
│   ├── book.epub
│   └── book.pdf
├── scripts/
├── README.md
└── pyproject.toml             (optional, fuer CLI-Nutzung)
```

### 3.2 Mapping: Bibliogon-Datenmodell zu Dateisystem

| Bibliogon (DB) | write-book-template (Dateisystem) |
|----------------|-----------------------------------|
| `Book.title` | Projektordner-Name, `config/metadata.yaml` -> `title` |
| `Book.subtitle` | `config/metadata.yaml` -> `subtitle` |
| `Book.author` | `config/metadata.yaml` -> `author`, `manuscript/back-matter/about-the-author.md` |
| `Book.language` | `config/metadata.yaml` -> `lang` |
| `Book.series` | `config/metadata.yaml` -> `series` |
| `Book.series_index` | `config/metadata.yaml` -> `series_index` |
| `Book.description` | `config/metadata.yaml` -> `description` |
| `Chapter.title` | Dateiname `{NN}-{slug}.md`, H1-Ueberschrift im Inhalt |
| `Chapter.content` | Markdown-Body der Datei |
| `Chapter.position` | Numerisches Praefix im Dateinamen (`01-`, `02-`, ...) |

### 3.3 Export-Formate

| Format | Endpoint | Beschreibung |
|--------|----------|--------------|
| ZIP | `GET /api/books/{id}/export/project` | Komplette Verzeichnisstruktur als ZIP |
| EPUB | `GET /api/books/{id}/export/epub` | Pandoc-generiertes EPUB via Kapitel-Dateien |
| PDF | `GET /api/books/{id}/export/pdf` | Pandoc-generiertes PDF via Kapitel-Dateien |

Der EPUB/PDF-Export laeuft intern ueber die gleiche Verzeichnisstruktur: Zuerst wird das Projekt scaffolded, dann ruft Pandoc die sortierten Markdown-Dateien aus `manuscript/chapters/` auf und nutzt `config/metadata.yaml` als Metadaten-Quelle.

### 3.4 Import (geplant)

Ein bestehender write-book-template Ordner kann importiert werden:

1. `config/metadata.yaml` wird gelesen und in ein `Book`-Objekt ueberfuehrt.
2. Alle `manuscript/chapters/*.md` werden als `Chapter`-Objekte angelegt. Die Reihenfolge ergibt sich aus dem Dateinamen-Praefix.
3. Front-Matter und Back-Matter werden als spezielle Kapitel-Typen importiert (spaetere Erweiterung des Datenmodells).

---

## 4. Datenmodell

### 4.1 Aktuell (v0.1.0)

```
Book
  id: str (UUID)
  title: str
  subtitle: str?
  author: str
  language: str (default: "de")
  series: str?
  series_index: int?
  description: str?
  created_at: datetime
  updated_at: datetime
  chapters: [Chapter]

Chapter
  id: str (UUID)
  book_id: str (FK -> Book)
  title: str
  content: str (HTML von TipTap)
  position: int
  created_at: datetime
  updated_at: datetime
```

### 4.2 Geplante Erweiterungen (v0.3.0+)

```
ChapterType (enum)
  CHAPTER          -> manuscript/chapters/
  PREFACE          -> manuscript/front-matter/preface.md
  FOREWORD         -> manuscript/front-matter/foreword.md
  ACKNOWLEDGMENTS  -> manuscript/front-matter/acknowledgments.md
  ABOUT_AUTHOR     -> manuscript/back-matter/about-the-author.md
  APPENDIX         -> manuscript/back-matter/appendix.md
  BIBLIOGRAPHY     -> manuscript/back-matter/bibliography.md
  GLOSSARY         -> manuscript/back-matter/glossary.md

Asset
  id: str
  book_id: str (FK -> Book)
  filename: str
  asset_type: str (cover, figure, diagram, table)
  path: str
  uploaded_at: datetime
```

---

## 5. Roadmap

### Phase 1: MVP (v0.1.0) - erledigt

- Backend: Book/Chapter CRUD, Pandoc-Export (EPUB, PDF)
- Frontend: Dashboard, Kapitel-Editor mit TipTap, Export-Buttons
- Deployment: Docker Compose, Makefile

### Phase 2: write-book-template Integration (v0.2.0)

- Export-Service umbauen auf Verzeichnisstruktur-Scaffolding
- ZIP-Export der kompletten Projektstruktur
- `config/metadata.yaml` Generierung
- Front-Matter/Back-Matter Platzhalter-Dateien
- EPUB/PDF-Export ueber scaffolded Verzeichnis statt Einzeldatei
- HTML-zu-Markdown Konvertierung fuer den Export (TipTap speichert HTML)
- Neuer Endpoint: `GET /api/books/{id}/export/project`

### Phase 3: Import und erweiterte Kapiteltypen (v0.3.0)

- write-book-template Projekt importieren (ZIP-Upload oder Pfad)
- ChapterType-Enum fuer Front-Matter und Back-Matter
- UI: Separate Sektionen in der Sidebar (Vorwort, Kapitel, Anhang)
- Asset-Upload (Cover, Bilder, Diagramme)
- Bilder in `manuscript/figures/` und `assets/` ablegen

### Phase 4: Editor-Erweiterungen (v0.4.0)

- Markdown-Modus im Editor (TipTap Umschaltung WYSIWYG/Markdown)
- Live-Vorschau des generierten Buches
- Kapitel Drag-and-Drop Sortierung im Frontend
- Autosave-Indikator (gespeichert/speichert...)
- Wortzaehler pro Kapitel und Gesamt

### Phase 5: Kinderbuch-Modus (v0.5.0)

- Bild-pro-Seite Layout
- Bild-Upload und Positionierung
- Spezielle Kinderbuch-Templates fuer den Export
- Seitenvorschau mit Bild/Text-Verhaeltnis

### Phase 6: Multi-User und SaaS (v1.0.0)

- Benutzerregistrierung und Authentifizierung
- Projekte pro Benutzer
- PostgreSQL statt SQLite
- KDP-Metadaten-Export (Keywords, Kategorien, Beschreibung)
- Pen-Name-Verwaltung
- Abrechnungsintegration (Stripe)

---

## 6. Abgrenzung

### Was Bibliogon ist

- Eine Web-UI zum Schreiben von Buechern
- Ein Generator fuer write-book-template Projektstrukturen
- Ein EPUB/PDF-Export-Tool via Pandoc
- Ein Open-Source-Projekt mit SaaS-Potenzial

### Was Bibliogon nicht ist

- Kein Ersatz fuer das write-book-template CLI-Tooling
- Kein KI-Textgenerator
- Kein kollaboratives Echtzeit-Tool (nicht in Phase 1-5)
- Kein Layoutprogramm (kein InDesign-Ersatz)

---

## 7. Konkurrenzanalyse

| Tool | Open Source | Web-basiert | EPUB/PDF | Projektstruktur | Zielgruppe |
|------|-----------|-------------|----------|-----------------|------------|
| Scrivener | Nein | Nein | Nur ueber Compile | Proprietaer | Power-Autoren |
| Reedsy Studio | Nein | Ja | Ja | Nein | Einsteiger |
| Manuskript | Ja | Nein (Desktop) | Begrenzt | Proprietaer | Plotter |
| LivingWriter | Nein | Ja | Begrenzt | Nein | Allgemein |
| Bibisco | Ja | Nein (Desktop) | Begrenzt | Proprietaer | Fiction |
| **Bibliogon** | **Ja** | **Ja** | **Ja (Pandoc)** | **write-book-template** | **Autoren + Entwickler** |

Der Differenzierungsfaktor von Bibliogon ist die Kombination aus Web-UI, Open Source, und einer standardisierten, Pandoc-kompatiblen Projektstruktur, die auch ohne die UI funktioniert.

---

## 8. Offene Fragen

1. **HTML zu Markdown:** TipTap speichert Inhalte als HTML. Beim Export in die write-book-template Struktur muss eine HTML-zu-Markdown Konvertierung stattfinden. Optionen: `markdownit` (JS-seitig), `html2text` (Python), oder Pandoc selbst (`pandoc -f html -t markdown`).

2. **Bilder-Handling:** Wo werden hochgeladene Bilder gespeichert? Lokal im Dateisystem, in der DB als Blob, oder in einem Object Store (S3 fuer SaaS)?

3. **Template-Varianten:** Soll Bibliogon verschiedene Projektstrukturen unterstuetzen (z.B. Sachbuch vs. Roman vs. Kinderbuch), oder bleibt die write-book-template Struktur der einzige Standard?

4. **Versionierung:** Soll Bibliogon eine eigene Versionsgeschichte pro Kapitel fuehren, oder wird das an Git delegiert (Export -> Commit)?
