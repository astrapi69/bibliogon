# Artikel

Artikel sind eigenstaendige lange Dokumente — Blogposts, Essays, Release-Ankuendigungen, Ideen, die du veröffentlichen willst, ohne sie in ein Buch zu packen. Jeder Artikel lebt unter `/articles`, getrennt von Büchern.

## Was ein Artikel ist (und was nicht)

Ein Artikel ist:

- Ein einzelnes TipTap-Dokument (keine Kapitel).
- Minimale Metadaten: Titel, Untertitel, Autor, Sprache, Status.
- Ein einfacher Lebenszyklus: **Entwurf → Veröffentlicht → Archiviert**.

Ein Artikel ist **nicht**:

- Ein Buch (keine Front-Matter, kein ISBN, keine Kapitel, kein Hoerbuch-Export).
- Eine Multi-Plattform-Veröffentlichung (Phase 2 bringt Cross-Posting auf Medium / Substack / X / LinkedIn).
- Ein Promo-Post (Tweets, Threads, LinkedIn-Ankuendigungen über den Artikel kommen in Phase 2).

Wenn du Kapitel oder eine Backpage-Beschreibung brauchst, willst du ein Buch, keinen Artikel.

## Artikel erstellen

1. Im Dashboard auf **Artikel** in der Kopfzeile klicken. Die Artikelliste öffnet sich.
2. **Neuer Artikel** klicken (oder den Empty-State-CTA beim ersten Aufruf).
3. Bibliogon legt einen Entwurf an und öffnet sofort den Editor. Deine Änderungen werden mit 1-Sekunden-Verzoegerung automatisch gespeichert; die Kopfzeile zeigt während des Tippens "Speichert…" / "Gespeichert".

## Der Editor

Der Artikel-Editor unterscheidet sich bewusst vom Buch-Editor:

- **Keine Kapitel-Sidebar** — Artikel sind einzelne Dokumente.
- **Keine Front-Matter-Tabs** — kein Schmutztitel, Copyright, Widmung.
- **Sidebar** zeigt Untertitel, Autor, Sprache, Status, Wortzahl.
- **Auto-Save** loest bei jedem Tastendruck mit 1 Sekunde Debounce aus.
- **Status-Auswahl** bewegt einen Artikel durch Entwurf / Veröffentlicht / Archiviert.

Der Titel laesst sich oben auf der Seite inline editieren. Auf den Titel klicken und tippen.

## Thema und SEO

Jeder Artikel hat ein **Thema**-Dropdown in der Metadaten-Sidebar. Themen sind die primaere Kategorie eines Artikels und kommen aus einer einzigen Liste, die unter **Einstellungen → Themen** verwaltet wird. Das Dropdown ist deaktiviert, solange noch kein Thema definiert ist; ein Hinweis verlinkt auf den passenden Einstellungs-Tab.

Thema ist einwertig (ein Artikel gehoert zu genau einem Thema). Tags bleiben ein separates, mehrwertiges Feld für feinere Quer-Etiketten.

Die **SEO**-Sektion (unter Status) sammelt zwei dedizierte Felder:

- **SEO-Titel** — uebersteuert den Artikeltitel in Such-Snippets. Faellt bei leerem Wert auf den Artikeltitel zurück.
- **SEO-Beschreibung** — uebersteuert den Auszug in Such-Snippets. Faellt bei leerem Wert auf den Artikel-Auszug zurück.

Das sind Artikel-Level-Defaults. Publikationen (Medium, Substack, X, LinkedIn) erben sie; pro-Plattform-Overrides gehen in den platform_metadata-Blob.

## Status

- **Entwurf** — in Arbeit. Standard für neue Artikel.
- **Veröffentlicht** — Inhalt ist final. Der Artikel ist bereit oder bereits geteilt.
- **Archiviert** — historisch. Nicht gelöscht, aber aus der Standard-Listenansicht entfernt.

Die Filter-Pills auf der Listenseite engen auf einen Status ein. Die Standard-Ansicht `Alle` zeigt alles.

## Artikel löschen

Der **Löschen**-Button in der Sidebar (rot, unten im Metadaten-Bereich) entfernt den Artikel. Ein Bestaetigungsdialog laesst dich anerkennen, dass die Aktion nicht rückgängig gemacht werden kann — Bibliogon legt Artikel derzeit nicht in einen Papierkorb (das ist ein Phase-2-Polish-Punkt, parallel zum Buch-Papierkorb).

## Publikationen (AR-02 Phase 2)

Eine Publikation verfolgt ein einzelnes Stück Inhalt auf einer Plattform: die Hauptpublikation eines Artikels auf Medium / Substack / X / LinkedIn oder ein Promo-Post, der dahin zurueckverlinkt.

### Publikation hinzufügen

1. Artikel im Editor öffnen.
2. In der Sidebar zu **Publikationen** scrollen und **Hinzufügen** klicken.
3. Plattform aus dem Dropdown wählen. Das Formular fuellt sich mit den Pflicht- + optionalen Feldern dieser Plattform.
4. Daten ausfuellen (z.B. Medium braucht Titel + Tags; X braucht Body) und absenden.

Die Publikation startet im Status **Geplant**. Bibliogon kontaktiert keine Plattform-API — es speichert nur, was du veröffentlichen willst.

### Lebenszyklus

- **Geplant** — angelegt, noch nicht live.
- **Eingeplant** — hat ein scheduled_at-Datum; noch nicht live.
- **Veröffentlicht** — du hast es als veröffentlicht markiert nachdem der Artikel auf der Plattform online war. Bibliogon snappt den TipTap-Content für Drift-Detection.
- **Nicht synchron** — der Artikel-Content hat sich seit der Markierung geändert. Bibliogon flaggt die Publikation, damit du nicht vergisst, die Live-Version zu aktualisieren.
- **Archiviert** — historisch, nicht mehr aktiv.

### Als veröffentlicht markieren

Wenn du den Artikel auf Medium (oder einer anderen Plattform) eingefuegt hast und die Live-URL steht:

1. **Als veröffentlicht** auf der Zeile klicken.
2. Optional die Live-URL angeben (Bibliogon speichert sie unter `platform_metadata.published_url`).

Bibliogon snappt das aktuelle `content_json` als Baseline für Drift-Detection.

### Drift-Detection

Jedes Mal wenn du den Artikel nach Markierung als **Veröffentlicht** editierst, vergleicht Bibliogon beim nächsten View den Snapshot gegen den aktuellen Entwurf. Abweichung kippt die Publikation auf **Nicht synchron** mit Warn-Banner.

### Live bestätigen

Wenn du die Live-Version aktualisiert hast (oder akzeptierst, dass der lokale Entwurf die neue Baseline ist):

1. **Live bestätigen** auf der out-of-sync-Zeile klicken.
2. Bibliogon re-snappt den Artikel und loescht den out-of-sync-Status.

### Promo-Posts

Eine Publikation mit `is_promo=true` ist ein kurzer Begleit-Post — ein Tweet, Thread oder LinkedIn-Ankuendigung, die auf eine Hauptpublikation auf Medium/Substack zurueckverlinkt. Gleicher Lebenszyklus, gleiche Drift-Detection.

### SEO-Metadaten

Die Artikel-Level-SEO-Felder (SEO-Titel, SEO-Beschreibung, Canonical URL, Featured Image, Auszug, Tags) liegen über dem Publikationen-Panel. Publikationen erben sie als Defaults; pro-Plattform-Overrides gehen in den platform_metadata-Blob beim Hinzufügen.

SEO-Titel und SEO-Beschreibung fallen bei leerem Wert zur Veröffentlichung auf Titel und Auszug des Artikels zurück — leer lassen ist für die meisten Artikel ok.

### Was weiterhin NICHT im Umfang ist (Phase 3+)

- Plattform-API-Integration (Medium / Substack / X / LinkedIn). Veroeffentlichen bleibt manuell.
- Geplante Veröffentlichung als Background-Job.
- Cross-Posting-Automatisierung.
- Analytics-Abruf.
- Tag-Taxonomie (Tags sind Freitext, kein Autocomplete artikeluebergreifend).
- Papierkorb + Wiederherstellung für Artikel.

Wenn dein Cross-Posting-Workflow eine Friction zeigt, die Bibliogon loesen kann, log sie in `docs/journal/article-workflow-observations.md`, damit der Fall konkret ist bevor Phase-3-Prioritaeten gesetzt werden.
