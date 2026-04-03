# Bibliogon - Anforderungen und Roadmap

Offene Punkte, geplante Features und technische Schulden.
Checkboxen: `[ ]` = offen, `[x]` = erledigt.
IDs: U=UI/UX, I=i18n, X=Import/Export, T=TipTap, B=Backend, Q=Tests, P=Plugin, S=Schulden.

Prompt-Referenz: `Setze T-01 um.` reicht als Anweisung.

---

## Naechste Schritte (priorisiert)

Diese Punkte haben Vorrang vor den kategorisierten Listen unten.

- [ ] Q-06: CI-Pipeline (GitHub Actions)
- [ ] T-03: Office-Paste (tiptap-extension-office-paste)
- [ ] T-07: Focus-Mode (nur aktueller Absatz hervorgehoben)
- [ ] U-07: Sidebar: Kapitel per Rechtsklick umbenennen
- [ ] I-01: Sprachumschaltung live ohne Reload
- [ ] B-01: Alembic-Migrationen statt Auto-Migration (robuster)
- [ ] Q-02: Mutation Testing mit mutmut einrichten
- [ ] U-09: Papierkorb: Auto-Loeschen nach X Tagen (konfigurierbar)
- [ ] T-03: Office-Paste (tiptap-extension-office-paste)

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
- [x] U-01: Dashboard: Sortierung (nach Datum, Titel, Autor)
- [x] U-02: Dashboard: Buch-Cover als Thumbnail auf der BookCard
- [x] U-03: Editor: Bild-Upload per Drag-and-Drop in den Editor
- [x] U-04: Editor: Fussnoten-Support (tiptap-footnotes Extension)
- [x] U-05: Editor: Suchen und Ersetzen im Kapitel
- [x] U-06: Editor: Wortanzahl-Ziel pro Kapitel (Progress-Bar)
- [ ] U-07: Sidebar: Kapitel per Rechtsklick umbenennen
- [ ] U-08: Dark Mode: Sidebar-Theme unabhaengig vom Haupt-Theme
- [ ] U-09: Papierkorb: Auto-Loeschen nach X Tagen (konfigurierbar)

## i18n

- [x] useI18n Hook mit 216 Strings in 5 Sprachen
- [x] Alle Hauptkomponenten migriert (Sidebar, Editor, Settings, GetStarted, Export, Dashboard)
- [x] Settings: Restliche Strings migrieren (einige Toast-Messages noch hardcoded)
- [ ] I-01: Sprachumschaltung live ohne Reload
- [ ] I-02: Fehlende Sprachen: Portugiesisch, Tuerkisch, Japanisch

## Import/Export

- [x] write-book-template Import mit 21 Kapiteltypen
- [x] Section-Order aus export-settings.yaml
- [x] Asset-Import mit Pfad-Rewriting
- [x] EPUB-Export mit Bildern und manuellem TOC
- [x] Backup/Restore mit Assets und allen Metadaten
- [x] PDF-Export: Cover-Bild als erste Seite
- [x] X-01: EPUB: epubcheck-Validierung nach Export (automatisch)
- [x] X-02: Import: Erkennung von Markdown-Dateien ohne write-book-template Struktur
- [x] X-03: Export: Kapiteltyp-spezifische Formatierung (Widmung zentriert, Motto kursiv)
- [x] X-04: Export: Custom CSS pro Kapiteltyp
- [x] X-05: Batch-Export: Alle Formate auf einmal (EPUB + PDF + DOCX)

## Editor (TipTap)

- [x] 15 offizielle Extensions + Figure/Figcaption
- [x] 24 Toolbar-Buttons
- [x] Markdown-Toggle mit Bild-Erhalt
- [x] T-01: Fussnoten (tiptap-footnotes)
- [x] T-02: Suchen und Ersetzen (@sereneinserenade/tiptap-search-and-replace)
- [ ] T-03: Office-Paste (tiptap-extension-office-paste)
- [x] T-04: Bild-Resize per Drag
- [ ] T-05: Spellcheck-Integration (LanguageTool, wenn Grammar-Plugin aktiv)
- [x] T-06: Lesezeit-Schaetzung pro Kapitel
- [ ] T-07: Focus-Mode (nur aktueller Absatz hervorgehoben)

## Backend

- [x] Auto-Migration fuer DB-Schema (fehlende Spalten)
- [x] Plugin-ZIP-Installation mit dynamischem Laden
- [x] Umgebungsvariablen (CORS, DEBUG, SECRET, DB_PATH)
- [x] Non-Root Docker, Health-Checks
- [ ] B-01: Alembic-Migrationen statt Auto-Migration (robuster)
- [ ] B-02: Structured Logging (JSON-Format fuer Produktion)
- [ ] B-03: Rate Limiting auf API-Endpunkte
- [ ] B-04: API-Versionierung (v1/v2 Prefix)
- [ ] B-05: Asynchrone Export-Jobs (lange Exports blockieren nicht)

## Tests

- [x] 38 Backend-Tests (pytest)
- [x] 48 Plugin-Tests (pytest)
- [x] 21 Frontend-Tests (Vitest)
- [x] 52 E2E-Tests (Playwright)
- [x] Q-01: E2E-Tests aktualisieren fuer Radix-Selektoren und neue Features
- [ ] Q-02: Mutation Testing mit mutmut einrichten
- [x] Q-03: Roundtrip-Tests: Import -> Editor -> Export -> epubcheck
- [ ] Q-04: API-Client Unit Tests (Vitest)
- [ ] Q-05: mypy Type-Checking fuer Python Backend
- [ ] Q-06: CI-Pipeline (GitHub Actions)

## Plugins (Roadmap)

### Phase 8: Manuskript-Qualitaet (v0.9.0)
- [x] P-09: plugin-manuscript-tools: Style-Checks, Sanitization
- [x] P-10: Filler-Woerter, Passiv, Satzlaenge
- [x] P-11: Lesbarkeits-Metriken (Flesch-Kincaid)

### Phase 9: Uebersetzungs-Plugin (v0.10.0, Premium)
- [ ] P-06: plugin-translation: DeepL/LLM Uebersetzung
- [ ] P-07: LMStudio fuer lokale LLM-Uebersetzung
- [ ] P-08: Kapitelweise Uebersetzung als neues Buch
  
### Phase 10: Audiobook-Plugin (v0.11.0, Premium)
- [ ] P-01: plugin-audiobook: TTS-basierte Audiobook-Generierung
- [ ] P-02: TTS-Engine Auswahl: Edge TTS, Google TTS, pyttsx3, ElevenLabs
- [ ] P-03: Voice-Settings pro Buch
- [ ] P-04: MP3 pro Kapitel, Merge zu Audiobook (ffmpeg)
- [ ] P-05: Vorhoer-Funktion im Editor

### Phase 11: Multi-User und SaaS (v1.0.0)
- [ ] P-12: Benutzerregistrierung und Authentifizierung
- [ ] P-13: PostgreSQL statt SQLite
- [ ] P-14: Pen-Name-Verwaltung pro User (nicht global)
- [ ] P-15: Plugin-Marketplace
- [ ] P-16: Stripe-Integration

## Technische Schulden

- [x] S-01: Hardcoded Strings in Dashboard (einige Dialog-Texte)
- [x] S-02: BookCard: Genre-Badge i18n (zeigt aktuell den Key statt uebersetzten Namen)
- [x] S-03: Settings-Seite: ~10 verbleibende hardcoded Strings
- [x] S-04: Export-Plugin: tiptap_to_md.py unterstuetzt nicht alle neuen Extensions (Table, TaskList)
- [x] S-05: Playwright E2E: Einige Tests brauchen Anpassung fuer Radix-Selektoren (erledigt in Q-01)
- [x] S-06: package.json: Chunk-Size Warning beim Build (>500KB)
- [x] S-07: Docker: Multi-Stage Build fuer kleineres Backend-Image
