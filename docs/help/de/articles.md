# Artikel

Artikel sind eigenstaendige lange Dokumente — Blogposts, Essays, Release-Ankuendigungen, Ideen, die du veroeffentlichen willst, ohne sie in ein Buch zu packen. Jeder Artikel lebt unter `/articles`, getrennt von Buechern.

## Was ein Artikel ist (und was nicht)

Ein Artikel ist:

- Ein einzelnes TipTap-Dokument (keine Kapitel).
- Minimale Metadaten: Titel, Untertitel, Autor, Sprache, Status.
- Ein einfacher Lebenszyklus: **Entwurf → Veroeffentlicht → Archiviert**.

Ein Artikel ist **nicht**:

- Ein Buch (keine Front-Matter, kein ISBN, keine Kapitel, kein Hoerbuch-Export).
- Eine Multi-Plattform-Veroeffentlichung (Phase 2 bringt Cross-Posting auf Medium / Substack / X / LinkedIn).
- Ein Promo-Post (Tweets, Threads, LinkedIn-Ankuendigungen ueber den Artikel kommen in Phase 2).

Wenn du Kapitel oder eine Backpage-Beschreibung brauchst, willst du ein Buch, keinen Artikel.

## Artikel erstellen

1. Im Dashboard auf **Artikel** in der Kopfzeile klicken. Die Artikelliste oeffnet sich.
2. **Neuer Artikel** klicken (oder den Empty-State-CTA beim ersten Aufruf).
3. Bibliogon legt einen Entwurf an und oeffnet sofort den Editor. Deine Aenderungen werden mit 1-Sekunden-Verzoegerung automatisch gespeichert; die Kopfzeile zeigt waehrend des Tippens "Speichert…" / "Gespeichert".

## Der Editor

Der Artikel-Editor unterscheidet sich bewusst vom Buch-Editor:

- **Keine Kapitel-Sidebar** — Artikel sind einzelne Dokumente.
- **Keine Front-Matter-Tabs** — kein Schmutztitel, Copyright, Widmung.
- **Sidebar** zeigt Untertitel, Autor, Sprache, Status, Wortzahl.
- **Auto-Save** loest bei jedem Tastendruck mit 1 Sekunde Debounce aus.
- **Status-Auswahl** bewegt einen Artikel durch Entwurf / Veroeffentlicht / Archiviert.

Der Titel laesst sich oben auf der Seite inline editieren. Auf den Titel klicken und tippen.

## Status

- **Entwurf** — in Arbeit. Standard fuer neue Artikel.
- **Veroeffentlicht** — Inhalt ist final. Der Artikel ist bereit oder bereits geteilt.
- **Archiviert** — historisch. Nicht geloescht, aber aus der Standard-Listenansicht entfernt.

Die Filter-Pills auf der Listenseite engen auf einen Status ein. Die Standard-Ansicht `Alle` zeigt alles.

## Artikel loeschen

Der **Loeschen**-Button in der Sidebar (rot, unten im Metadaten-Bereich) entfernt den Artikel. Ein Bestaetigungsdialog laesst dich anerkennen, dass die Aktion nicht rueckgaengig gemacht werden kann — Bibliogon legt Artikel derzeit nicht in einen Papierkorb (das ist ein Phase-2-Polish-Punkt, parallel zum Buch-Papierkorb).

## Was als Naechstes kommt (Phase 2+)

Die Exploration in `docs/explorations/article-authoring.md` dokumentiert die volle Roadmap. Kandidaten fuer Phase 2:

- Multi-Plattform-Veroeffentlichung: Denselben Artikel mit einem Klick auf Medium, Substack, X, LinkedIn cross-posten und die Pro-Plattform-URLs verfolgen.
- Promo-Posts: Kurze Begleitposts (Tweets, Threads, LinkedIn-Ankuendigungen), die auf den Artikel zurueckverlinken.
- SEO-Metadaten: Pro-Plattform-SEO-Titel, -Beschreibung, kanonische URL, Featured Image, Tags.
- Drift-Detection: Warnen, wenn ein veroeffentlichter Artikel lokal editiert wurde und die Plattformen noch die aeltere Version ausliefern.
- Papierkorb + Wiederherstellung (Paritaet mit Buechern).

Phase 1 liefert die Datenfundamente — Entitaet, Editor, Liste, einfaches CRUD. Phase 2 landet, wenn Validierungsdaten zeigen, dass der Cross-Posting-Workflow repetitiv genug ist, um automatisiert zu werden.
