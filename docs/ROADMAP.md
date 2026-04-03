# Bibliogon - Anforderungen und Roadmap

Offene Punkte, geplante Features und technische Schulden.
Checkboxen: `[ ]` = offen, `[x]` = erledigt.

---

## UI/UX

- [x] Papierkorb: Loeschen ohne Bestaetigungsdialog, direkt verschieben
- [x] Papierkorb: Roter "Endgueltig loeschen"-Button im Widget
- [x] BookCard: Drei-Punkte-Menu statt einzelnem Trash-Icon
- [x] CreateBookModal: Zwei-Stufen-Dialog (Pflicht + aufklappbar Optional)
- [x] CreateBookModal: Genre-Feld mit Datalist (eingabefaehig)
- [x] CreateBookModal: Serie hinter Checkbox versteckt
- [x] Sidebar: Aufklappbare Sektionen (Front-Matter, Kapitel, Back-Matter)
- [x] Responsive Layout: Hamburger-Menu auf Mobile
- [x] BookEditor: Sidebar als Overlay auf Mobile
- [x] GetStarted: Interaktiver Step-by-Step Wizard
- [x] Settings: White-Label Konfiguration (App umbenennen, Core-Plugins togglen)
- [x] Settings: Autor-Tab mit Pseudonym-Verwaltung
- [x] Core-Plugins: "Standard" Badge, kein Loeschen/Deaktivieren
- [x] Dashboard: Buch-Suche/Filter (nach Titel, Autor, Genre, Sprache)
- [ ] Dashboard: Sortierung (nach Datum, Titel, Autor)
- [ ] Dashboard: Buch-Cover als Thumbnail auf der BookCard
- [ ] Editor: Bild-Upload per Drag-and-Drop in den Editor
- [ ] Editor: Fussnoten-Support (tiptap-footnotes Extension)
- [ ] Editor: Suchen und Ersetzen im Kapitel
- [ ] Editor: Wortanzahl-Ziel pro Kapitel (Progress-Bar)
- [ ] Sidebar: Kapitel per Rechtsklick umbenennen
- [ ] Dark Mode: Sidebar-Theme unabhaengig vom Haupt-Theme
- [ ] Papierkorb: Auto-Loeschen nach X Tagen (konfigurierbar)

## i18n

- [x] useI18n Hook mit 216 Strings in 5 Sprachen
- [x] Alle Hauptkomponenten migriert (Sidebar, Editor, Settings, GetStarted, Export, Dashboard)
- [x] Settings: Restliche Strings migrieren (einige Toast-Messages noch hardcoded)
- [ ] Sprachumschaltung live ohne Reload
- [ ] Fehlende Sprachen: Portugiesisch, Tuerkisch, Japanisch

## Import/Export

- [x] write-book-template Import mit 21 Kapiteltypen
- [x] Section-Order aus export-settings.yaml
- [x] Asset-Import mit Pfad-Rewriting
- [x] EPUB-Export mit Bildern und manuellem TOC
- [x] Backup/Restore mit Assets und allen Metadaten
- [ ] PDF-Export: Cover-Bild als erste Seite
- [ ] EPUB: epubcheck-Validierung nach Export (automatisch)
- [ ] Import: Erkennung von Markdown-Dateien ohne write-book-template Struktur
- [ ] Export: Kapiteltyp-spezifische Formatierung (Widmung zentriert, Motto kursiv)
- [ ] Export: Custom CSS pro Kapiteltyp
- [ ] Batch-Export: Alle Formate auf einmal (EPUB + PDF + DOCX)

## Editor (TipTap)

- [x] 15 offizielle Extensions + Figure/Figcaption
- [x] 24 Toolbar-Buttons
- [x] Markdown-Toggle mit Bild-Erhalt
- [ ] Fussnoten (@buttondown/tiptap-footnotes)
- [ ] Suchen und Ersetzen (tiptap-search-n-replace)
- [ ] Office-Paste (tiptap-extension-office-paste)
- [ ] Bild-Resize per Drag
- [ ] Spellcheck-Integration (LanguageTool, wenn Grammar-Plugin aktiv)
- [ ] Lesezeit-Schaetzung pro Kapitel
- [ ] Focus-Mode (nur aktueller Absatz hervorgehoben)

## Backend

- [x] Auto-Migration fuer DB-Schema (fehlende Spalten)
- [x] Plugin-ZIP-Installation mit dynamischem Laden
- [x] Umgebungsvariablen (CORS, DEBUG, SECRET, DB_PATH)
- [x] Non-Root Docker, Health-Checks
- [ ] Alembic-Migrationen statt Auto-Migration (robuster)
- [ ] Structured Logging (JSON-Format fuer Produktion)
- [ ] Rate Limiting auf API-Endpunkte
- [ ] API-Versionierung (v1/v2 Prefix)
- [ ] Asynchrone Export-Jobs (lange Exports blockieren nicht)

## Tests

- [x] 33 Backend-Tests (pytest)
- [x] 48 Plugin-Tests (pytest)
- [x] 21 Frontend-Tests (Vitest)
- [x] 52 E2E-Tests (Playwright)
- [ ] E2E-Tests aktualisieren fuer Radix-Selektoren und neue Features
- [ ] Mutation Testing mit mutmut einrichten
- [ ] Roundtrip-Tests: Import -> Editor -> Export -> epubcheck
- [ ] API-Client Unit Tests (Vitest)
- [ ] mypy Type-Checking fuer Python Backend
- [ ] CI-Pipeline (GitHub Actions)

## Plugins (Roadmap)

### Phase 8: Audiobook-Plugin (v0.9.0, Premium)
- [ ] plugin-audiobook: TTS-basierte Audiobook-Generierung
- [ ] TTS-Engine Auswahl: Edge TTS, Google TTS, pyttsx3, ElevenLabs
- [ ] Voice-Settings pro Buch
- [ ] MP3 pro Kapitel, Merge zu Audiobook (ffmpeg)
- [ ] Vorhoer-Funktion im Editor

### Phase 9: Uebersetzungs-Plugin (v0.10.0, Premium)
- [ ] plugin-translation: DeepL/LLM Uebersetzung
- [ ] LMStudio fuer lokale LLM-Uebersetzung
- [ ] Kapitelweise Uebersetzung als neues Buch

### Phase 10: Manuskript-Qualitaet (v0.11.0)
- [ ] plugin-manuscript-tools: Style-Checks, Sanitization
- [ ] Filler-Woerter, Passiv, Satzlaenge
- [ ] Lesbarkeits-Metriken (Flesch-Kincaid)

### Phase 11: Multi-User und SaaS (v1.0.0)
- [ ] Benutzerregistrierung und Authentifizierung
- [ ] PostgreSQL statt SQLite
- [ ] Pen-Name-Verwaltung pro User (nicht global)
- [ ] Plugin-Marketplace
- [ ] Stripe-Integration

## Technische Schulden

- [ ] Hardcoded Strings in Dashboard (einige Dialog-Texte)
- [ ] BookCard: Genre-Badge i18n (zeigt aktuell den Key statt uebersetzten Namen)
- [ ] Settings-Seite: ~10 verbleibende hardcoded Strings
- [ ] Export-Plugin: tiptap_to_md.py unterstuetzt nicht alle neuen Extensions (Table, TaskList)
- [ ] Playwright E2E: Einige Tests brauchen Anpassung fuer Radix-Selektoren
- [ ] package.json: Chunk-Size Warning beim Build (>500KB)
- [ ] Docker: Multi-Stage Build fuer kleineres Backend-Image
