# Manueller Test: Bilderbuch-Seiten / Manual Test: Picture-Book Pages

**Geprüfte Version / Tested version:** Phase-4 Kinderbuch Session 2 (2026-05-16)

**Hintergrund / Background:**
Session 2 hat die Backend-Foundation für Bilderbücher implementiert
(Datenbank-Schema, Pydantic-Schemas, REST-API). Es gibt NOCH KEINE
Bedienoberfläche; dieser Guide testet die API direkt. Die UI folgt
in Session 3.

Session 2 shipped the backend foundation for picture books (DB
schema, Pydantic schemas, REST API). There is NO frontend UI yet;
this guide exercises the API directly. UI lands in Session 3.

**Verweise / References:**
- Strukturierter Smoke-Test / Structured smoke test:
  [picture-book-pages.md](./picture-book-pages.md)
- Code: [pages.py](../../../plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/pages.py)

---

## Voraussetzungen / Prerequisites

- Bibliogon Dev-Backend läuft (`make dev` oder `make dev-bg`).
- Backend erreichbar unter `http://localhost:8000`.
- `curl` (oder eine UI wie Bruno, Insomnia, oder
  `http://localhost:8000/docs` für die FastAPI-Swagger-Ansicht).
- `jq` empfohlen für JSON-Parsen.

Bibliogon dev backend running (`make dev` or `make dev-bg`).
Backend reachable at `http://localhost:8000`. `curl` (or a UI like
Bruno, Insomnia, or `http://localhost:8000/docs` for the FastAPI
Swagger view). `jq` recommended for JSON parsing.

---

## Szenario 1: Happy Path (3 Seiten anlegen + neu sortieren + löschen)

### Schritt 1: Bilderbuch erstellen

```bash
BOOK_ID=$(curl -s -X POST http://localhost:8000/api/books \
  -H 'Content-Type: application/json' \
  -d '{"title": "Mein erstes Bilderbuch", "author": "Maus", "book_type": "picture_book"}' \
  | jq -r .id)
echo "Buch-ID: $BOOK_ID"
```

**Erwartet / Expected:** Eine UUID-ähnliche Zeichenkette wird ausgegeben.

### Schritt 2: Drei Seiten anlegen

```bash
PAGE_1=$(curl -s -X POST http://localhost:8000/api/books/$BOOK_ID/pages \
  -H 'Content-Type: application/json' \
  -d '{"layout": "image_only"}' | jq -r .id)

PAGE_2=$(curl -s -X POST http://localhost:8000/api/books/$BOOK_ID/pages \
  -H 'Content-Type: application/json' \
  -d '{"layout": "text_under_image", "text_content": "Seite 2"}' | jq -r .id)

PAGE_3=$(curl -s -X POST http://localhost:8000/api/books/$BOOK_ID/pages \
  -H 'Content-Type: application/json' \
  -d '{"layout": "split_left_right", "text_content": "Seite 3"}' | jq -r .id)

echo "Seite 1: $PAGE_1 / Seite 2: $PAGE_2 / Seite 3: $PAGE_3"
```

**Erwartet / Expected:** Drei IDs werden ausgegeben.

### Schritt 3: Reihenfolge prüfen

```bash
curl -s http://localhost:8000/api/books/$BOOK_ID/pages | jq '[.[] | {id, position}]'
```

**Erwartet / Expected:**
```json
[
  {"id": "...", "position": 1},
  {"id": "...", "position": 2},
  {"id": "...", "position": 3}
]
```
Positionen sind dicht 1, 2, 3 / positions are dense 1, 2, 3.

### Schritt 4: Reihenfolge umkehren

```bash
curl -s -X POST http://localhost:8000/api/books/$BOOK_ID/pages/reorder \
  -H 'Content-Type: application/json' \
  -d "{\"page_ids\": [\"$PAGE_3\", \"$PAGE_2\", \"$PAGE_1\"]}" \
  | jq '[.[] | {id, position}]'
```

**Erwartet / Expected:** Antwort zeigt Seite 3 auf Position 1, Seite 1
auf Position 3. Positionen bleiben 1, 2, 3.

### Schritt 5: Mittlere Seite löschen

```bash
curl -s -X DELETE http://localhost:8000/api/books/$BOOK_ID/pages/$PAGE_2 -w '%{http_code}\n'
curl -s http://localhost:8000/api/books/$BOOK_ID/pages | jq '[.[] | {id, position}]'
```

**Erwartet / Expected:** HTTP 204 (kein Body), dann eine 2-elementige
Liste mit Positionen 1, 2 (dicht — Position 3 ist nicht mehr da, weil
die übrige Seite nach oben gerutscht ist).

---

## Szenario 2: Stress (50 Seiten anlegen + neu sortieren)

### Schritt 1: 50 Seiten in einer Schleife anlegen

```bash
BOOK_ID=$(curl -s -X POST http://localhost:8000/api/books \
  -H 'Content-Type: application/json' \
  -d '{"title": "50-Seiten-Stresstest", "author": "Stress", "book_type": "picture_book"}' \
  | jq -r .id)

for i in $(seq 1 50); do
  curl -s -o /dev/null -X POST http://localhost:8000/api/books/$BOOK_ID/pages \
    -H 'Content-Type: application/json' \
    -d "{\"layout\": \"text_under_image\", \"text_content\": \"Seite $i\"}"
done

echo "Anzahl Seiten:"
curl -s http://localhost:8000/api/books/$BOOK_ID/pages | jq 'length'
```

**Erwartet / Expected:** `50`.

### Schritt 2: Reihenfolge komplett umkehren

```bash
PAGE_IDS=$(curl -s http://localhost:8000/api/books/$BOOK_ID/pages \
  | jq -r '[.[].id] | reverse | @json')

curl -s -X POST http://localhost:8000/api/books/$BOOK_ID/pages/reorder \
  -H 'Content-Type: application/json' \
  -d "{\"page_ids\": $PAGE_IDS}" \
  -w 'HTTP %{http_code}, Dauer %{time_total}s\n' -o /dev/null
```

**Erwartet / Expected:** HTTP 200, Dauer unter 1 Sekunde
(die Zweiphasen-Transaktion ist single-flush).

---

## Szenario 3: Edge Case (Reorder mit veralteter ID-Liste)

### Schritt 1: Bilderbuch mit 3 Seiten anlegen (wie Szenario 1)

### Schritt 2: Eine Seite löschen, dann mit ALLEN 3 alten IDs neu sortieren

```bash
curl -s -X DELETE http://localhost:8000/api/books/$BOOK_ID/pages/$PAGE_2

# Versuche einen Reorder mit der nun ungültigen PAGE_2-ID in der Liste:
curl -s -X POST http://localhost:8000/api/books/$BOOK_ID/pages/reorder \
  -H 'Content-Type: application/json' \
  -d "{\"page_ids\": [\"$PAGE_3\", \"$PAGE_2\", \"$PAGE_1\"]}" \
  -w '\nHTTP %{http_code}\n'
```

**Erwartet / Expected:** HTTP 400, detail-Text erwähnt
"Missing"/"unknown" und nennt die fehlerhaften IDs.

### Schritt 3: Reorder mit korrekter 2-ID-Liste

```bash
curl -s -X POST http://localhost:8000/api/books/$BOOK_ID/pages/reorder \
  -H 'Content-Type: application/json' \
  -d "{\"page_ids\": [\"$PAGE_3\", \"$PAGE_1\"]}" \
  | jq '[.[] | {id, position}]'
```

**Erwartet / Expected:** HTTP 200, beide übrigen Seiten in der neuen
Reihenfolge.

---

## Bug-Report-Template / Bug report template

Wenn ein Schritt fehlschlägt: bitte Folgendes als GitHub-Issue posten:

If a step fails: please file a GitHub issue with the following:

1. **Welcher Schritt? / Which step?** (z.B. "Szenario 1, Schritt 3")
2. **Erwarteter Wert / Expected:** (siehe oben)
3. **Tatsächlicher Wert / Actual:** (rohe Curl-Ausgabe einkopieren)
4. **Backend-Logs / Backend logs:** (`make dev-logs` falls
   Background-Modus, sonst die laufende `make dev` Konsole)
5. **Reproduktionsschritte / Repro steps:** (welche Schritte
   wurden vorher genommen?)

---

## Bekannte Einschränkungen / Known limitations

- **Keine Frontend-UI in Session 2.** Diese kommt erst in Session 3.
  Wer die API derzeit testet, muss `curl` oder Swagger nutzen.
- **Speech bubbles werden noch nicht gerendert.** `speech_bubble_config`
  ist eine JSON-Spalte; die UI in Session 3 fügt einen Editor hinzu.
- **Asset-Upload für `image_asset_id` ist noch nicht angeschlossen.**
  Aktuell akzeptiert die API `image_asset_id` als String, aber es
  gibt keine UI zum Hochladen. Das Feld bleibt vorerst `null`.

In Session 2 there is no frontend UI; UI lands in Session 3. Speech
bubbles are stored in the JSON column but not yet rendered. Asset
upload for `image_asset_id` is not wired to a UI yet; the field
stays `null` for now.
