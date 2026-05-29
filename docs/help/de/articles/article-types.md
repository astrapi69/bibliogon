# Artikel-Typen

Bibliogon unterstützt 8 Artikel-Typen, damit du jede lange Schreibform
in der passenden Struktur erfassen kannst. Der Typ wird beim Anlegen
gewählt und kann jederzeit im ArticleEditor geändert werden.

## Die 8 Typen

| Typ | Wann verwenden | Zusatzfelder |
|---|---|---|
| **Blogpost** | Standardform, kurze bis mittlere Beiträge | — |
| **Tutorial** | Schritt-für-Schritt-Anleitungen | Schwierigkeitsgrad, Voraussetzungen, geschätzte Dauer |
| **Rezension** | Bewertungen von Werken (Buch, Produkt, Film …) | Bewertetes Werk, Urheber, Bewertung 1-5 |
| **Essay** | Längere reflektierende Prosa | — |
| **Newsletter** | Wiederkehrende Beiträge in Ausgaben | Ausgabennummer, Versanddatum |
| **Interview** | Gespräche mit anderen Personen | Name + Rolle des Gesprächspartners |
| **Listicle** | Listen-basierte Beiträge (Top 10, 5 Tipps …) | — |
| **Kurzgeschichte** | Kurze, in sich geschlossene Erzählungen | — |

## Anlegen mit Typ

Auf dem Artikel-Dashboard klickst du auf den Pfeil rechts neben dem
**Neuer Artikel**-Button. Ein Menü erscheint mit allen Typen außer
dem Standard (Blogpost). Klick auf den gewünschten Typ legt direkt
einen neuen Artikel mit diesem Typ an.

Ein einfacher Klick auf **Neuer Artikel** legt einen Blogpost an —
die häufigste Wahl, daher ohne Umweg über das Menü.

## Typ später ändern

Im ArticleEditor zeigt die rechte Seitenleiste einen
**Artikel-Typ**-Dropdown direkt unter dem Status-Feld. Den Typ zu
ändern setzt die typ-spezifischen Felder zurück (z. B. von Tutorial
auf Rezension werden die Tutorial-Felder geleert und die
Rezensions-Felder erscheinen).

## Typ-spezifische Felder

Tutorial, Rezension, Newsletter und Interview haben jeweils
zusätzliche Felder, die unter dem Typ-Dropdown im Abschnitt
**Typ-spezifische Felder** erscheinen. Die Werte werden im JSON-Feld
`article_metadata` gespeichert und in zukünftigen Versionen für die
Plattform-Veröffentlichung verwendbar (KDP, Medium, Substack …).

## Anzeige im Dashboard

Jede Artikel-Karte (Grid-View) und jede Listen-Zeile (List-View)
zeigt einen kleinen Badge mit dem Typ-Icon und der Bezeichnung. So
siehst du auf einen Blick, welche Artikel Tutorials, Rezensionen
usw. sind, ohne den Editor zu öffnen.
