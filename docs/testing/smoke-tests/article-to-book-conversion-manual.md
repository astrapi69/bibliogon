# Manuelle Test-Anleitung: Artikel-zu-Buch-Konvertierung / Manual Test Guide: Article-to-Book Conversion

Bilinguale Anleitung - Deutsch zuerst, English mirror unten / Bilingual guide - German first, English mirror below.

**Shipped:** 2026-05-15
**Verwandte Dokumente / Related docs:**
- Deterministische Smoke-Test-Schritte: [article-to-book-conversion.md](./article-to-book-conversion.md)
- Hilfe-Doku (DE): [../../help/de/articles/convert-to-book.md](../../help/de/articles/convert-to-book.md)
- Help doc (EN): [../../help/en/articles/convert-to-book.md](../../help/en/articles/convert-to-book.md)

---

# 🇩🇪 Manuelle Test-Anleitung (Deutsch)

## Voraussetzungen

- Bibliogon läuft lokal oder in einer Dev-Umgebung (`make dev`)
- Mindestens 5 Artikel im Artikel-Dashboard
- Idealerweise: einige Artikel mit gleichen Tags (z.B. eine `living-health`-Serie aus dem Medium-Import) für die Tag-Helper-Szenarien
- Browser auf `/articles` geöffnet
- Optional: Dev-Tools-Konsole offen, damit Fehler sofort sichtbar werden

## Test-Szenario 1: Erste Konvertierung (Single-Article)

**Ziel:** Eine grundlegende Konvertierung durchführen und prüfen, dass das neue Buch erstellt wird, der Quellartikel unverändert bleibt und der Toast-CTA funktioniert.

1. Im Artikel-Dashboard einen Artikel deiner Wahl per Zeilen-Checkbox auswählen.
2. **Erwartung:** Die Aktionsleiste oben erscheint mit der Anzeige "1 ausgewählt".
3. Auf **"Als Buch"** klicken.
4. **Erwartung:** Der Assistent öffnet sich. Du siehst Schritt 0 (Auswahl) mit deinem Artikel als Listeneintrag.
5. *(Screenshot-Marker: 📸 Wizard Step 0)*
6. Auf **"Weiter"** klicken - Schritt 1 (Buch-Metadaten).
7. **Erwartung:** Wenn dein Artikel einen Untertitel hat, erscheint dieser als Platzhalter im Untertitel-Feld.
8. **Erwartung:** Wenn dein Artikel ein Beitragsbild hat, erscheint ein Cover-Hinweis-Banner.
9. **Erwartung:** Der Cursor sitzt automatisch im Titel-Feld (Fokus-Management).
10. Titel eintragen: `Mein Erstes Test-Buch`
11. Autor eintragen: dein Name oder `Test Autor`
12. Auf **"Weiter"** klicken - Schritt 2 (Vorspann). Auf **"Überspringen"** klicken.
13. Schritt 3 (Nachspann). Auf **"Überspringen"** klicken.
14. Schritt 4 (Kapitel-Einstellungen). **"Weiter"** klicken.
15. Schritt 5 (Übersicht).
16. **Erwartung:** Die Übersicht zeigt `Mein Erstes Test-Buch`, deinen Autor und `1` als Kapitel-Gesamtzahl.
17. *(Screenshot-Marker: 📸 Wizard Step 5 Review)*
18. Auf **"Buch erstellen"** klicken.
19. **Erwartung:** Der Button-Text wechselt kurz auf "Wird konvertiert ...", dann schliesst sich der Assistent.
20. **Erwartung:** Ein Toast erscheint unten rechts mit der Nachricht "Buch erstellt." und einem **"Buch öffnen"**-Button.
21. **Wichtig:** Du bleibst zunächst auf `/articles` - kein automatischer Sprung.
22. Auf **"Buch öffnen"** im Toast klicken.
23. **Erwartung:** Browser navigiert zu `/book/{id}`. Der Buch-Editor zeigt das neue Buch mit einem Kapitel, dessen Titel deinem Artikel entspricht.
24. *(Screenshot-Marker: 📸 New book in BookEditor)*
25. In der Browser-Adresszeile zurück zu `/articles`.
26. **Erwartung:** Dein ursprünglicher Artikel ist noch da, unverändert, NICHT im Papierkorb (entkoppelte Lebenszyklen).

## Test-Szenario 2: Stress-Test mit 22 Artikeln (Multi-Article + Front-Matter)

**Ziel:** Eine realistische Konvertierung mit der `living-health`-Serie testen. Performance beobachten.

1. Im Artikel-Dashboard nach Tag `living-health` filtern (oder einen anderen Tag mit 10+ Artikeln).
2. Auf **"Alle auswählen"** klicken.
3. **Erwartung:** Die Aktionsleiste zeigt die Anzahl (z.B. 22).
4. Auf **"Als Buch"** klicken.
5. **Erwartung:** Schritt 0 zeigt alle Artikel als ziehbare Zeilen.
6. Sortier-Strategie auf **"Datum (alt zuerst)"** stellen.
7. **Erwartung:** Die Reihenfolge ändert sich entsprechend.
8. Eine Zeile per Drag-and-Drop ans Ende ziehen.
9. **Erwartung:** Sortierung wechselt automatisch auf "Manuell"; die manuelle Reihenfolge bleibt erhalten.
10. **"Weiter"** klicken - Schritt 1.
11. **Erwartung:** Bei Multi-Article-Konvertierung KEIN Untertitel-Platzhalter und KEIN Cover-Banner.
12. Titel: `Living Health: Die komplette Serie`
13. Autor: `Asterios Raptis`
14. **"Weiter"** klicken - Schritt 2.
15. **"Titelseite"** anhaken.
16. **"Widmung"** anhaken; Text: `Für meine Leser.`
17. **"Einleitung"** anhaken; Text: `Diese Serie versammelt 22 Artikel zu einem Thema.`
18. **"Weiter"** - Schritt 3.
19. **"Danksagung"** anhaken; Text: `Danke an die Medium-Community.`
20. **"Weiter"** - Schritt 4. Defaults belassen. **"Weiter"** - Schritt 5.
21. **Erwartung:** Kapitelzahl = 22 Artikel + 3 Vorspann + 1 Nachspann = **26 Kapitel insgesamt**.
22. **Performance-Beobachtung starten** (Uhr beginnen): **"Buch erstellen"** klicken.
23. **Performance-Beobachtung stoppen** (sobald Toast erscheint).
24. **Erwartung:** Konvertierung 1-3 Sekunden (Backend-Op ist Sub-Sekunde + Netzwerk-Roundtrip).
25. Falls länger als 5 Sekunden: notieren, ggf. Issue dokumentieren.
26. Auf **"Buch öffnen"** klicken.
27. **Erwartung:** BookEditor zeigt 26 Kapitel in korrekter Reihenfolge: Titelseite → Widmung → Einleitung → 22 Artikel-Kapitel → Danksagung.

## Test-Szenario 3: Edge-Cases

Diese Szenarien decken Grenzfälle ab.

### 3a: Validierungsfehler (Artikel im Papierkorb)

1. Einen Artikel ins Papierkorb verschieben (Zeilen-Menü).
2. Mehrere Artikel auswählen, davon einen, der noch live ist.
3. Konvertierung starten und bis Schritt 5 durchlaufen.
4. **Direkter API-Call mit der trashed-Artikel-ID** (über Browser-DevTools-Konsole oder cURL):
   ```bash
   curl -X POST http://localhost:8000/api/books/from-articles \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","author":"T","article_ids":["<TRASHED-ID>"]}'
   ```
5. **Erwartung:** HTTP 422 mit JSON-Body, der die trashed-IDs auflistet.
6. **Erwartung (im Wizard-UI):** Wenn der Assistent die 422 empfängt, springt er zu Schritt 0 zurück und zeigt einen Banner mit den Titeln der problematischen Artikel.

### 3b: Leerer Autor blockiert "Weiter" in Schritt 1

1. Konvertierung starten.
2. In Schritt 1 nur den Titel eintragen, Autor leer lassen.
3. **Erwartung:** Der "Weiter"-Button ist deaktiviert (grau).
4. **Erwartung:** Unter dem Autor-Feld erscheint "Autor ist erforderlich".
5. Autor eintragen.
6. **Erwartung:** Button wird aktiviert.

### 3c: Single-Article mit leerem Body

1. Einen Artikel ohne TipTap-Inhalt erstellen (oder einen existierenden komplett leeren).
2. Diesen einen Artikel konvertieren.
3. **Erwartung:** Konvertierung gelingt. Das Kapitel im neuen Buch ist leer (kein Fehler, kein Warning).

## Erwartete Resultate (Übersicht)

| Was sollte passieren | Was sollte NICHT passieren |
|---|---|
| Toast mit "Buch öffnen"-CTA nach erfolgreichem Submit | Automatische Navigation ohne Toast |
| Ursprüngliche Artikel bleiben unverändert im Dashboard | Ursprüngliche Artikel landen im Papierkorb |
| Drag-Reorder bleibt nach Step-Wechsel erhalten | Sortierung wird beim Zurückkehren zu Schritt 0 zurückgesetzt |
| 422-Response routet zurück zu Schritt 0 mit Banner | Stiller Fehler oder generischer Error-Toast |
| Fokus landet automatisch auf erstem Eingabefeld jedes Schritts | Fokus bleibt auf "Weiter"-Button hängen |
| Step-Indicator hat lokalisiertes aria-label | Hardcoded "Wizard progress" für deutsche User |

## Bug-Report-Template

Falls etwas nicht wie erwartet funktioniert, dokumentiere bitte:

```
**Browser + OS:** z.B. Firefox 134 auf Ubuntu 24.04
**Steps-to-Reproduce:**
1. ...
2. ...
3. ...

**Expected:** Was hätte passieren sollen
**Actual:** Was tatsächlich passiert ist

**Browser-Konsole (F12 → Console):**
```
<paste relevant errors>
```

**Network-Tab (F12 → Network):**
- Endpoint:
- Status-Code:
- Response-Body:

**Screenshots:** falls visueller Bug
```

Gegen GitHub Issue eröffnen mit diesem Template als Body.

---

# 🇬🇧 Manual Test Guide (English)

## Prerequisites

- Bibliogon runs locally or in a dev environment (`make dev`)
- At least 5 articles on the Articles dashboard
- Ideally: some articles share tags (e.g. a `living-health` series from a Medium import) for the tag-helper scenarios
- Browser open on `/articles`
- Optional: DevTools console open so errors surface immediately

## Test Scenario 1: First Conversion (Single Article)

**Goal:** Perform a baseline conversion and verify the new book is created, the source article stays untouched, and the toast CTA works.

1. On the Articles dashboard, select one article via its row checkbox.
2. **Expected:** the bulk-action bar appears with "1 selected".
3. Click **"As book"**.
4. **Expected:** the wizard opens. You see Step 0 (Selection) with your article as a list row.
5. *(Screenshot marker: 📸 Wizard Step 0)*
6. Click **"Next"** → Step 1 (Book metadata).
7. **Expected:** if your article has a subtitle, it appears as a placeholder in the Subtitle field.
8. **Expected:** if your article has a featured image, a cover-info banner appears.
9. **Expected:** the cursor automatically lands in the Title input (focus management).
10. Type Title: `My First Test Book`
11. Type Author: your name or `Test Author`
12. Click **"Next"** → Step 2 (Front-matter). Click **"Skip"**.
13. Step 3 (Back-matter). Click **"Skip"**.
14. Step 4 (Chapter settings). **"Next"**.
15. Step 5 (Review).
16. **Expected:** the review shows `My First Test Book`, your author, and `1` as the total chapter count.
17. *(Screenshot marker: 📸 Wizard Step 5 Review)*
18. Click **"Create book"**.
19. **Expected:** the button briefly changes to "Converting ...", then the wizard closes.
20. **Expected:** a toast appears bottom-right with "Book created." and a **"View book"** button.
21. **Important:** you stay on `/articles` initially - no auto-jump.
22. Click **"View book"** in the toast.
23. **Expected:** browser navigates to `/book/{id}`. The Book editor shows the new book with one chapter whose title matches your article.
24. *(Screenshot marker: 📸 New book in BookEditor)*
25. Navigate back to `/articles` via the browser address bar.
26. **Expected:** your original article is still there, untouched, NOT in trash (decoupled lifecycles).

## Test Scenario 2: Stress Test with 22 Articles (Multi-Article + Front-Matter)

**Goal:** A realistic conversion using the `living-health` series. Observe performance.

1. On the Articles dashboard, filter by tag `living-health` (or any tag with 10+ articles).
2. Click **"Select all"**.
3. **Expected:** the bar shows the count (e.g. 22).
4. Click **"As book"**.
5. **Expected:** Step 0 shows every article as a draggable row.
6. Set the sort dropdown to **"Date (oldest first)"**.
7. **Expected:** the row order updates accordingly.
8. Drag one row to the end via drag-and-drop.
9. **Expected:** the sort dropdown auto-flips to "Manual"; the manual order persists.
10. Click **"Next"** → Step 1.
11. **Expected:** for multi-article conversions, NO subtitle placeholder, NO cover-info banner.
12. Title: `Living Health: The Complete Series`
13. Author: `Asterios Raptis`
14. Click **"Next"** → Step 2.
15. Check **"Title page"**.
16. Check **"Dedication"**; text: `For my readers.`
17. Check **"Introduction"**; text: `This series collects 22 articles on one topic.`
18. **"Next"** → Step 3.
19. Check **"Acknowledgments"**; text: `Thanks to the Medium community.`
20. **"Next"** → Step 4. Accept defaults. **"Next"** → Step 5.
21. **Expected:** chapter count = 22 articles + 3 front-matter + 1 back-matter = **26 chapters total**.
22. **Start a stopwatch** and click **"Create book"**.
23. **Stop the stopwatch** when the toast appears.
24. **Expected:** conversion takes 1-3 seconds (sub-second backend op + network round-trip).
25. If it takes longer than 5 seconds: note it, file an issue if it reproduces.
26. Click **"View book"**.
27. **Expected:** BookEditor shows 26 chapters in the correct order: Title page → Dedication → Introduction → 22 article chapters → Acknowledgments.

## Test Scenario 3: Edge Cases

These scenarios exercise boundary conditions.

### 3a: Validation Error (trashed article)

1. Move one article to trash via the row menu.
2. Select several live articles.
3. Start the conversion and walk through to Step 5.
4. **Direct API call with the trashed article id** (via DevTools console or cURL):
   ```bash
   curl -X POST http://localhost:8000/api/books/from-articles \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","author":"T","article_ids":["<TRASHED-ID>"]}'
   ```
5. **Expected:** HTTP 422 with a JSON body listing the trashed ids.
6. **Expected (in the wizard UI):** when the wizard receives the 422, it rewinds to Step 0 and shows a banner listing the offending article titles.

### 3b: Empty Author Blocks "Next" on Step 1

1. Start the conversion.
2. On Step 1, fill only the Title; leave Author empty.
3. **Expected:** the "Next" button is disabled (greyed out).
4. **Expected:** under the Author field, "Author is required" appears.
5. Fill the Author.
6. **Expected:** the button enables.

### 3c: Single Article with Empty Body

1. Create an article with no TipTap content (or pick an existing empty one).
2. Convert that single article.
3. **Expected:** conversion succeeds. The chapter in the new book is empty (no error, no warning).

## Expected Results (Summary)

| Should happen | Should NOT happen |
|---|---|
| Toast with "View book" CTA after a successful submit | Auto-navigation without showing the toast |
| Source articles stay unchanged on the dashboard | Source articles land in trash |
| Drag-reorder persists across step navigation | Sort resets when returning to Step 0 |
| 422 response routes back to Step 0 with the banner | Silent failure or generic error toast |
| Focus lands on the first input of every step automatically | Focus stays on the "Next" button |
| Step indicator has a localised aria-label | Hardcoded "Wizard progress" for non-English users |

## Bug Report Template

If something does not work as expected, please document:

```
**Browser + OS:** e.g. Firefox 134 on Ubuntu 24.04
**Steps to reproduce:**
1. ...
2. ...
3. ...

**Expected:** what should have happened
**Actual:** what happened instead

**Browser console (F12 → Console):**
```
<paste relevant errors>
```

**Network tab (F12 → Network):**
- Endpoint:
- Status code:
- Response body:

**Screenshots:** if visual bug
```

Open a GitHub issue with this template as the body.
