# Qualitaetspruefung und Teststrategie

## Schnell-Check nach jeder Aenderung

### 1. Tests laufen lassen

```bash
# Alles auf einmal (MUSS gruen sein vor jedem Commit)
make test

# Einzeln wenn gezielt:
make test-backend           # pytest Backend (38 Tests)
make test-plugins           # Alle Plugin-Tests (48 Tests)
make test-plugin-export     # Nur Export (23 Tests)
make test-plugin-grammar    # Nur Grammar (7 Tests)
make test-plugin-kdp        # Nur KDP (10 Tests)
make test-plugin-kinderbuch # Nur Kinderbuch (8 Tests)
make test-frontend          # Vitest (21 Tests)

# E2E (braucht laufende App)
make dev                    # App starten
npx playwright test         # 52 E2E-Tests
```

### 2. Type-Check

```bash
# Frontend: TypeScript Compiler
cd frontend && npx tsc --noEmit

# Backend: mypy (optional, noch nicht eingerichtet)
# cd backend && poetry run mypy app/
```

### 3. Richtlinien manuell pruefen

Vor dem Commit diese Checkliste durchgehen:

- [ ] Kein `any` in TypeScript ohne Kommentar
- [ ] Keine fetch()-Aufrufe ausserhalb von api/client.ts
- [ ] Keine Browser-Dialoge (alert, confirm, prompt), AppDialog nutzen
- [ ] Keine hardcodierten Strings in UI, i18n YAML nutzen
- [ ] Neue UI-Elemente funktionieren in allen 6 Theme-Varianten (3 Themes x Light/Dark)
- [ ] CSS nutzt Variables, keine festen Farben
- [ ] Kein Em-Dash in Code oder Texten
- [ ] Conventional Commit Message (feat:, fix:, refactor:, ...)

---

## Teststrategie

### Testpyramide

```
      /    E2E     \        Playwright (52 Tests)
     / ------------ \       Wenige, kritische User-Flows
    / Integration    \      pytest + TestClient (38 Tests)
   / ---------------- \    API-Endpunkte mit echtem DB-Zustand
  /    Unit Tests      \    pytest + Vitest (69+ Tests)
 / -------------------- \  Geschaeftslogik isoliert
/   Mutation Testing      \ mutmut (Nightly/manuell, noch einzurichten)
 --------------------------  Prueft ob Tests echte Fehler finden
```

### Unit Tests (Backend - pytest)

**Was testen:** Service-Logik, Konvertierungen, Validierungen, Mappings.
**Was NICHT testen:** FastAPI-Routing (das decken Integrationstests ab).

**Wo:** `backend/tests/` und `plugins/{name}/tests/`

**Beispiel - neuer Service:**
```python
# plugins/bibliogon-plugin-export/tests/test_tiptap_to_md.py

def test_heading_conversion():
    """H2 Node wird zu ## Markdown."""
    tiptap_json = {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 2},
             "content": [{"type": "text", "text": "Titel"}]}
        ]
    }
    result = tiptap_to_markdown(tiptap_json)
    assert result.strip() == "## Titel"

def test_image_roundtrip():
    """Bild bleibt nach Import -> Export erhalten."""
    md_input = "![Alt Text](assets/figures/bild.png)"
    html = markdown_to_html(md_input)
    tiptap_json = html_to_tiptap(html)
    md_output = tiptap_to_markdown(tiptap_json)
    assert "bild.png" in md_output
```

**Namenskonvention:** `test_{was_getestet_wird}.py`, Funktionen: `test_{szenario}()`

**Wann neue Tests schreiben:**
- Neuer Service oder neue Funktion: Mindestens Happy-Path + ein Fehlerfall.
- Bugfix: Erst failing Test, dann Fix.
- Import/Export-Logik: Roundtrip testen (Input -> Transformation -> Output -> Vergleich).

### Unit Tests (Frontend - Vitest)

**Status:** Eingerichtet, 21 Tests aktiv (happy-dom, Node 18 kompatibel).

**Was testen:** API Client Funktionen, Utility-Funktionen, komplexe Hooks.
**Was NICHT testen:** Einfache Komponenten die nur rendern (das decken E2E-Tests ab).

**Wo:** Neben der Datei: `api/client.test.ts`, `hooks/useI18n.test.ts`

**Ausfuehrung:**
```bash
make test-frontend          # Alle Frontend-Tests
cd frontend && npx vitest   # Watch-Mode
```

**Beispiel:**
```typescript
// src/api/client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { fetchBooks, createBook } from './client'

describe('API Client', () => {
  it('fetchBooks returns book list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: '1', title: 'Test' }])
    })
    const books = await fetchBooks()
    expect(books).toHaveLength(1)
    expect(books[0].title).toBe('Test')
  })
})
```

### Integrationstests (Backend - pytest + TestClient)

**Was testen:** API-Endpunkte mit echtem DB-Zustand, Plugin-Interaktion.
**Unterschied zu Unit Tests:** Hier laeuft FastAPI mit TestClient und echter SQLite-DB (in-memory).

**Wo:** `backend/tests/test_api.py`, `backend/tests/test_phase4.py` (existieren bereits)

**Beispiel:**
```python
# backend/tests/test_api.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_and_export_book():
    """Buch anlegen, Kapitel hinzufuegen, exportieren."""
    # Buch erstellen
    resp = client.post("/api/books", json={"title": "Test", "author": "A"})
    assert resp.status_code == 200
    book_id = resp.json()["id"]

    # Kapitel hinzufuegen
    resp = client.post(f"/api/books/{book_id}/chapters",
                       json={"title": "Kapitel 1", "content": "{}"})
    assert resp.status_code == 200

    # Export triggern
    resp = client.get(f"/api/books/{book_id}/export/epub")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/epub+zip"
```

**Wann neue Integrationstests:**
- Neuer API-Endpunkt: Happy-Path + Fehlerfall (404, 422).
- Plugin-Installation: ZIP-Upload -> Plugin aktiv -> Endpunkt erreichbar.
- Import: Echtes write-book-template Projekt -> alle Kapitel, Assets, Metadaten korrekt.

### E2E-Tests (Playwright)

**Was testen:** Kritische User-Flows aus Autorenperspektive.
**Wo:** `frontend/tests/` oder `e2e/` (52 Tests existieren)

**Bestehende Abdeckung:**
- Dashboard: Buch erstellen, loeschen, Backup/Import
- Editor: Kapitel anlegen, editieren, sortieren, Metadaten
- Export: Format waehlen, exportieren, Datei herunterladen
- Settings: Plugins, Lizenzen, Sprache, Theme
- Navigation: Alle Seiten erreichbar, Links funktionieren

**Wann neue E2E-Tests:**
- Neues Plugin mit UI: Mindestens ein Flow (Plugin aktivieren -> Feature nutzen).
- Neuer Dialog/Modal: Oeffnen, Formular ausfuellen, Absenden, Ergebnis pruefen.
- Regression: Wenn ein Bug im UI gefunden wird, E2E-Test dafuer schreiben.

**Beispiel:**
```typescript
// e2e/export.spec.ts
import { test, expect } from '@playwright/test'

test('export book as EPUB with manual TOC', async ({ page }) => {
  await page.goto('/books/test-book-id')

  // Export-Dialog oeffnen
  await page.click('[data-testid="export-button"]')
  await expect(page.locator('.export-dialog')).toBeVisible()

  // EPUB waehlen, manuelles TOC aktivieren
  await page.click('[data-testid="format-epub"]')
  await page.check('[data-testid="use-manual-toc"]')
  await page.click('[data-testid="export-start"]')

  // Download pruefen
  const download = await page.waitForEvent('download')
  expect(download.suggestedFilename()).toContain('.epub')
})
```

### Mutation Testing (Backend - mutmut)

**Zweck:** Prueft ob die Tests echte Fehler finden wuerden. mutmut veraendert den Quellcode (Mutanten) und prueft ob mindestens ein Test fehlschlaegt. Ueberlebende Mutanten zeigen Luecken in der Testqualitaet.

**Status:** Einzurichten. Dev-Dependency via Poetry.

**Setup:**
```bash
cd backend
poetry add --group dev mutmut
```

**pyproject.toml Konfiguration:**
```toml
[tool.mutmut]
paths_to_mutate = "app/"
tests_dir = "tests/"
runner = "python -m pytest"
dict_synonyms = "Struct,NamedStruct"
```

**Fuer Plugins separat:**
```toml
# plugins/bibliogon-plugin-export/pyproject.toml
[tool.mutmut]
paths_to_mutate = "bibliogon_export/"
tests_dir = "tests/"
runner = "python -m pytest"
```

**Ausfuehrung:**
```bash
# Backend komplett (dauert lange, Nightly oder manuell)
cd backend && poetry run mutmut run

# Nur ein bestimmtes Modul (schneller, gezielt)
cd backend && poetry run mutmut run --paths-to-mutate app/services/

# Nur ein Plugin
cd plugins/bibliogon-plugin-export && poetry run mutmut run

# Ergebnisse anzeigen
poetry run mutmut results

# Ueberlebende Mutanten im Detail
poetry run mutmut show <id>

# HTML-Report
poetry run mutmut html
```

**Wann ausfuehren:**
- Nach groesseren Refactorings (pruefen ob Tests noch greifen).
- Bevor eine Phase als abgeschlossen gilt.
- Nightly in der CI-Pipeline (spaeter).
- Wenn Coverage hoch ist aber Vertrauen in Testqualitaet niedrig.

**Wie mit Ergebnissen umgehen:**
- Ueberlebende Mutanten in kritischem Code (Services, Konvertierungen): Tests ergaenzen.
- Ueberlebende Mutanten in trivialem Code (Logging, Formatierung): Ignorieren, kein Test-Bloat.
- Mutation Score als Richtwert: >= 60% fuer Kernmodule (app/services/, Plugin-Logik), kein hartes Gate.
- `mutmut results` in die Session-Zusammenfassung aufnehmen wenn ausgefuehrt.

**Kritische Module zuerst testen:**
1. `plugins/bibliogon-plugin-export/bibliogon_export/tiptap_to_md.py` - Konvertierungslogik
2. `plugins/bibliogon-plugin-export/bibliogon_export/scaffolder.py` - Projektstruktur
3. `backend/app/services/` - Kern-Geschaeftslogik
4. `backend/app/licensing.py` - Sicherheitskritisch

**Referenz-Prompt fuer Claude Code:**
```
Ich moechte mutmut (Mutation Testing) in dieses Projekt integrieren.

Schritte:
1. Analysiere die vorhandene pyproject.toml und die bestehende Teststruktur
2. Fuege mutmut als dev-Dependency via Poetry hinzu
3. Konfiguriere mutmut in der pyproject.toml (paths_to_mutate, tests_dir, runner)
4. Fuehre einen ersten mutmut run durch und zeige mir die Ergebnisse
5. Falls Tests fehlen oder Mutanten ueberleben, schlage konkrete Verbesserungen vor

Wichtig: Nutze Poetry fuer alles, keine pip-Aufrufe.
```

---

## Automatisierung (noch aufzubauen)

### Empfohlene Makefile-Erweiterungen

```makefile
# Type-Check Frontend
check-types:
	cd frontend && npx tsc --noEmit

# Mutation Testing (Nightly/manuell)
mutmut-backend:
	cd backend && poetry run mutmut run

mutmut-export:
	cd plugins/bibliogon-plugin-export && poetry run mutmut run

mutmut-results:
	cd backend && poetry run mutmut results

mutmut-html:
	cd backend && poetry run mutmut html
	@echo "Report: backend/html/index.html"

# Alle Checks zusammen (vor Push)
check-all: test check-types
	@echo "Alle Checks bestanden."

# Alles zusammen
test-all: test test-frontend
	@echo "Alle Tests bestanden."
```

### CI-Pipeline (spaeter, wenn GitHub Actions eingerichtet)

```
1. make check-types        # TypeScript Compiler
2. make test-backend       # pytest Backend
3. make test-plugins       # pytest Plugins
4. make test-frontend      # Vitest
5. make dev-bg             # App starten
6. npx playwright test     # E2E
7. make dev-down           # App stoppen

Nightly (separat, dauert laenger):
8. make mutmut-backend     # Mutation Testing Backend
9. make mutmut-export      # Mutation Testing Export-Plugin
```

---

## Prioritaet fuer naechste Verbesserungen

1. **mutmut einrichten** - Mutation Testing fuer Backend und Export-Plugin
2. **make check-all** - Ein Befehl fuer alles vor dem Push
3. **Roundtrip-Tests** - Import -> Editor -> Export -> epubcheck fuer jedes Buchformat
4. **mypy einrichten** - Type-Checking fuer Python Backend
5. **CI-Pipeline** - GitHub Actions mit allen Checks + Nightly mutmut
