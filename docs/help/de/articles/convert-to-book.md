# Artikel als Buch zusammenfassen

Das Artikel-Dashboard kann eine Auswahl von Artikeln zu einem neuen Buch zusammenfassen, mit den Artikeln als Kapitel. Ein geführter 6-Schritte-Assistent sammelt die Metadaten, optionale Vorspann-Kapitel (Titelseite, Widmung, Einleitung) und Nachspann-Kapitel (Danksagung, Über den Autor) und erstellt das Buch in einer einzigen Transaktion.

## Wann sinnvoll?

- Du hast eine Artikel-Serie zu einem Thema und willst sie gemeinsam als EPUB / PDF / KDP-Veröffentlichung ausliefern.
- Du hast einen mehrteiligen Long-Form-Beitrag geschrieben und willst die Teile zu einem veröffentlichbaren Artefakt bündeln.
- Du fasst die Beiträge eines Jahres zu einer Anthologie zusammen.

Für einen einzelnen Artikel produziert der Per-Artikel-Export im Zeilen-Menü bereits EPUB oder PDF. Der Konvertierungs-Assistent lohnt sich ab zwei Artikeln, sobald Vorspann / Nachspann oder eine Kapitelreihenfolge eine Rolle spielen.

## Schritt-für-Schritt

1. **Artikel auswählen** im Dashboard via Zeilen-Checkbox oder via "Alle auswählen". Sobald mindestens ein Artikel ausgewählt ist, erscheint die Aktionsleiste.
2. **"Als Buch"** in der Aktionsleiste klicken. Der Assistent öffnet sich mit deiner Auswahl als Eingabe.
3. **Schritt 0 - Auswahl.** Die Sortier-Dropdown legt die Kapitelreihenfolge fest (Datum alt zuerst, Datum neu zuerst, Titel A-Z, Titel Z-A oder manuell per Drag-and-Drop). Tag-Hilfsbuttons unter der Sortierung verengen die Arbeitsauswahl des Assistenten auf Artikel mit einem bestimmten Tag - nützlich, um eine große Vorauswahl auf einen Tag zu reduzieren. Der "Zurücksetzen"-Button stellt die ursprüngliche Auswahl wieder her.
4. **Schritt 1 - Buch-Metadaten.** Titel und Autor sind erforderlich; Untertitel, Sprache, Serie und Serien-Index sind optional. Bei Einzel-Artikel-Konvertierungen werden Untertitel und Cover-Bild aus dem Quellartikel vorbefüllt (siehe Einschränkungen unten).
5. **Schritt 2 - Vorspann (optional, überspringbar).** Hake die gewünschten Vorspann-Kapitel an: Titelseite (leeres Kapitel zur späteren Anpassung im Buch-Editor), Widmung (mit Text), Einleitung (mit Text). Reihenfolge: Titelseite -> Widmung -> Einleitung.
6. **Schritt 3 - Nachspann (optional, überspringbar).** Hake die gewünschten Nachspann-Kapitel an: Danksagung (mit Text), Über den Autor (mit Text). Reihenfolge: Danksagung -> Über den Autor.
7. **Schritt 4 - Kapitel-Einstellungen.** "Artikel-Titel als Kapitel-Titel verwenden" ist standardmäßig aktiv. Wenn deaktiviert, werden Kapitel als "Chapter 1", "Chapter 2" usw. benannt.
8. **Schritt 5 - Übersicht.** Die Übersicht zeigt Titel, Autor, Gesamtkapitelzahl (Vorspann + Artikel + Nachspann) und Sortierung. Klick auf **"Buch erstellen"** sendet die Anfrage, springt zum neuen Buch im Buch-Editor und leert die ursprüngliche Auswahl im Dashboard.

## Was bleibt, was wird kopiert?

**Entkoppelte Lebenszyklen.** Die ursprünglichen Artikel bleiben unverändert im Artikel-Dashboard. Das neue Buch trägt eine eigene Kopie des Artikel-Inhalts (TipTap JSON) als Kapitel. Spätere Artikel-Bearbeitungen aktualisieren das Buch **nicht**; Buch-Bearbeitungen aktualisieren die Artikel **nicht**. Beide Artefakte leben ab der Konvertierung unabhängig voneinander.

Das ist beabsichtigt. Nach Veröffentlichung soll das Buch stabil gegen zukünftige Artikel-Änderungen sein; umgekehrt sollen die Original-Artikel als eigenständige veröffentlichbare Artefakte erhalten bleiben.

## Bekannte Einschränkungen

- **Eingebettete Bilder verweisen auf die Quellartikel.** Wenn ein Artikel-Body ein Bild (`imageFigure`-Knoten) enthält, zeigt das `src`-Attribut weiterhin auf den ursprünglichen Artikel-Asset-Endpunkt (`/articles/{id}/assets/...`). Wenn du später den Quellartikel löschst, gehen diese Bilder im Buch verloren. Die Lösung - Assets ins Buch kopieren und URLs umschreiben - ist als `CONVERT-TO-BOOK-ASSET-CLONE-01` für eine spätere Version vorgemerkt. Workaround: Quellartikel mit bereits durchgeführter Konvertierung nicht löschen, oder betroffene Bilder im Kapitel-Editor des Buchs neu hochladen.
- **Cover-Übernahme nur bei Einzel-Artikel.** Wenn du genau einen Artikel konvertierst UND dieser eine `featured_image_url` hat, befüllt der Assistent `Book.cover_image` mit derselben URL vor. Mehr-Artikel-Konvertierungen weisen kein Cover automatisch zu; nutze den bestehenden Cover-Upload-Pfad im Buch-Editor nach der Konvertierung.
- **Alle Kapitel haben den Typ `chapter`.** Der Assistent versucht nicht, aus Artikel-Titeln `introduction` / `epilogue` / `appendix` zu erraten. Wenn ein Kapitel einen anderen `chapter_type` tragen soll (sodass manuscripta-export es als Vorspann / Nachspann behandelt), ändere den Typ nach der Konvertierung in der Kapitel-Seitenleiste des Buch-Editors. Smart-Typing ist als `CONVERT-TO-BOOK-CHAPTER-TYPE-DETECTION-01` für eine spätere Version vorgemerkt.

## Validierungsfehler

Wenn deine Auswahl Artikel enthält, die der Server nicht konvertieren kann, kehrt der Assistent zu Schritt 0 zurück und zeigt einen Banner mit allen Problem-Artikeln auf einmal:

- **Im Papierkorb** - Artikel mit gesetztem `deleted_at`. Zuerst über den Papierkorb-Tab des Artikel-Dashboards wiederherstellen.
- **Falscher Inhaltstyp** - Artikel mit einem `content_type` ungleich `"article"` (reserviert für zukünftige Blogpost- / Tweet-Typen). v1 schreibt diese nie, dieser Fall ist heute unerreichbar, wird aber relevant, sobald neue Inhaltstypen ausgeliefert werden.
- **Nicht gefunden** - Artikel-IDs, die der Server nicht auflösen kann. Tritt nur auf, wenn ein Artikel zwischen Auswahl und Konvertierung in einem anderen Tab gelöscht wurde.

Die gesamte Auswahl wird mit 422 abgelehnt, wenn auch nur ein einzelner Artikel scheitert. Bewusste Designentscheidung: so kannst du alle Probleme in einem Durchgang beheben, statt schrittweise durch Ablehnungen zu iterieren.

## FAQ

**Was passiert mit meinen Artikeln nach der Konvertierung?**
Sie bleiben im Artikel-Dashboard unverändert. Die Konvertierung erzeugt ein neues Buch; die ursprünglichen Artikel werden weder gelöscht noch archiviert noch verändert. Du kannst sie weiter bearbeiten, einzeln exportieren oder erneut zu einem anderen Buch konvertieren.

**Kann ich das Buch aktualisieren, wenn ich später die Artikel bearbeite?**
Nein. Bücher und Artikel sind entkoppelt. Nach der Konvertierung trägt das Buch eine eigene Kopie jedes Kapitels und Änderungen an den Quellartikeln werden nicht propagiert. Reverse-Link-Tracking (damit der Buch-Editor ein "Aus Quellartikeln aktualisieren" anbieten könnte) ist als `CONVERT-TO-BOOK-REVERSE-LINK-01` für eine spätere Version vorgemerkt.

**Wie mache ich die Konvertierung rückgängig?**
Buch im Bücher-Dashboard löschen. Die Quellartikel bleiben unberührt - die Löschung entfernt nur das Buch und seine Kapitel. Du kannst den Assistenten mit derselben Artikel-Auswahl neu starten, wenn du eine frische Konvertierung mit anderen Metadaten möchtest.

**Gibt es eine Auswahl-Obergrenze?**
Keine feste Grenze. Die Konvertierung ist ein einziger transaktionaler Datenbankschreibvorgang (Buch + N Kapitel-Inserts); die Kosten liegen unabhängig von der Auswahlgröße im Sub-Sekunden-Bereich. Anders als beim Bulk-Export, wo Pandoc pro Artikel real Zeit braucht und die 200er-Obergrenze gilt.

**Was wird aus den Quellartikeln ins Buch übernommen?**
Tags aller ausgewählten Artikel werden dedupliziert (Groß-/Kleinschreibung wird ignoriert) und in `Book.keywords` zusammengeführt. Teilen alle ausgewählten Artikel denselben `series`-Wert, wird dieser als `Book.series` vorbefüllt (in Schritt 1 überschreibbar). Andere Per-Artikel-Felder (canonical_url, excerpt, SEO-Meta) werden nicht aggregiert - sie gehören nur zu den Original-Artikeln.

## Zum manuellen Testen dieses Features

Wenn du die Konvertierung end-to-end manuell verifizieren möchtest (z.B. nach einem Upgrade oder vor einem Bug-Report), folge der [bilingualen manuellen Test-Anleitung](https://github.com/astrapi69/bibliogon/blob/main/docs/testing/smoke-tests/article-to-book-conversion-manual.md). Für die deterministische / CI-artige Checkliste siehe den [Smoke-Test-Plan](https://github.com/astrapi69/bibliogon/blob/main/docs/testing/smoke-tests/article-to-book-conversion.md). Beide Dateien liegen im Repo unter `docs/testing/smoke-tests/` (sie sind nicht Teil der In-App-Hilfe, nur des GitHub-Repos).
