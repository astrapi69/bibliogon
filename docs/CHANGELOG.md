# Changelog - Bibliogon

Erledigte Phasen und deren Inhalt. Aktueller Stand in CLAUDE.md, offene Punkte in ROADMAP.md.

## Phase 9: Uebersetzung, Audiobook, Infrastruktur (v0.10.0)

- plugin-translation (Premium): DeepL + LMStudio Client, kapitelweise Buchuebersetzung als neues Buch
- plugin-audiobook (Premium): Edge TTS, TTS Engine Abstraction, MP3 pro Kapitel, ffmpeg Merge, Vorhoer-Funktion
- Freemium-Lizenzsystem: license_tier (core/premium), Trial-Keys (Wildcard), Settings UI mit Premium-Badges
- Infrastruktur: Alembic-Migrationen, GitHub Actions CI, mypy, mutmut, Structured Logging, Async Export Jobs
- Editor: Focus Mode, Office Paste, Spellcheck Panel, Kapitel-Rename (Rechtsklick/Doppelklick), Audio Preview
- i18n: 8 Sprachen (DE, EN, ES, FR, EL, PT, TR, JA), Live-Sprachumschaltung
- 303 Tests (78 backend, 125 plugin, 50 vitest, 52 e2e)

## Phase 8: Manuskript-Qualitaet, Editor, Export (v0.9.0)

- plugin-manuscript-tools (MIT): Style-Checks (Filler-Woerter DE+EN, Passiv, Satzlaenge), Sanitization (typografische Anfuehrungszeichen 5 Sprachen, Whitespace, Dashes, Ellipsis), Lesbarkeits-Metriken (Flesch Reading Ease, Flesch-Kincaid Grade, Wiener Sachtextformel, Lesezeit)
- TipTap-Erweiterungen: Fussnoten, Suchen/Ersetzen, Bild-Resize per Drag, Bild-DnD-Upload
- Export: Batch-Export (EPUB+PDF+DOCX), Kapiteltyp-spezifisches CSS, Custom CSS, epubcheck-Validierung
- Import: Plain-Markdown-ZIP ohne Projektstruktur, tiptap_to_md erweitert (Table, TaskList, Figure)
- UI: Dashboard-Sortierung, Cover-Thumbnails, Wortanzahl-Ziel pro Kapitel, Keyword-Tag-Editor
- Infrastruktur: Multi-Stage Docker Build, Frontend-Chunk-Splitting, Roundtrip-Tests

## Phase 7: Erweiterte Buch-Metadaten (v0.7.0)

- Erweiterte Metadaten pro Buch: ISBN (ebook/paperback/hardcover), ASIN, Publisher, Edition, Datum
- Buch-Beschreibung als HTML (fuer Amazon), Rueckseitenbeschreibung, Autor-Kurzbiographie
- Keywords pro Buch (7 SEO-optimierte Keywords fuer KDP)
- Cover-Image Zuordnung pro Buch
- Custom CSS-Styles pro Buch (EPUB-Styles)
- "Config von anderem Buch uebernehmen" Wizard/Dialog
- Erweiterte Kapiteltypen: Epilog, Impressum, Naechstes-in-der-Reihe, Part-Intros, Interludien
- Buch-Metadaten-Editor im BookEditor (5 Sektionen: Allgemein, Verlag, ISBN, Marketing, Design)
- Playwright E2E-Tests erweitert auf 52 Tests

## Phase 6: Editor-Erweiterungen (v0.6.0)

- WYSIWYG/Markdown Umschaltung mit Markdown-zu-HTML Konvertierung beim Wechsel
- Drag-and-Drop Kapitel-Sortierung
- Autosave-Indikator, Wortzaehler
- plugin-grammar (LanguageTool)
- i18n: ES, FR, EL hinzugefuegt (5 Sprachen total)
- Dark Mode mit 3 Themes (Warm Literary, Cool Modern, Nord)
- Settings-Seite mit App-, Plugin- und Lizenz-Konfiguration
- Settings API zum Lesen/Schreiben von YAML-Configs ueber die UI
- PluginForge als PyPI-Paket ausgelagert (pluginforge ^0.5.0)
- Lizenzierung in Backend verschoben (app/licensing.py)
- pre_activate Callback fuer Lizenzpruefung
- plugin-help und plugin-getstarted als Standard-Plugins
- Export-Plugin auf manuscripta umgestellt
- Export-Dialog mit Format/Buchtyp/TOC-Tiefe/Section-Order Auswahl
- Papierkorb (Soft-Delete) mit Wiederherstellen und endgueltigem Loeschen
- Eigene Dateiformate: .bgb (Backup), .bgp (Projekt)
- Custom Dialog-System (AppDialog) statt nativer Browser-Dialoge
- Toast-Notifications (react-toastify)
- Playwright E2E-Tests (39 Tests)
- Umfassende Hilfe (23 FAQ, 12 Shortcuts, bilingual DE/EN)
- write-book-template Import kompatibel mit echten Projekten

## Phase 5: Premium-Plugins und Lizenzierung (v0.5.0)

- Offline-Lizenzierung (HMAC-SHA256, LicenseStore)
- plugin-kinderbuch, plugin-kdp

## Phase 4: Import, Backup, Kapiteltypen (v0.4.0)

- ChapterType Enum, Asset Upload, Full-Data Backup/Restore
- write-book-template ZIP Import

## Phase 3: Export als Plugin (v0.3.0)

- bibliogon-plugin-export (TipTap-JSON -> Markdown, Scaffolder, Pandoc)
- Alter Export-Code entfernt, Editor auf TipTap-JSON umgestellt

## Phase 2: PluginForge (v0.2.0)

- PluginManager auf pluggy, YAML-Config, Lifecycle, FastAPI-Integration
- Entry Point Discovery, Hook-Specs

## Phase 1: MVP (v0.1.0)

- Book/Chapter CRUD, TipTap Editor, Pandoc Export, Docker
