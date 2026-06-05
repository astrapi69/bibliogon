# Textarten

Bibliogon unterstützt 9 Textarten, damit du jede lange Schreibform
in der passenden Struktur erfassen kannst. Der Typ wird beim Anlegen
gewählt und kann jederzeit im ArticleEditor geändert werden.

## Die 9 Typen auf einen Blick

| Typ | Wann verwenden | Typ-spezifische Felder |
|---|---|---|
| **Blogpost** | Standardform, kurze bis mittlere Beiträge | - |
| **Tutorial** | Schritt-für-Schritt-Anleitungen | Schwierigkeitsgrad, Voraussetzungen, geschätzte Dauer |
| **Rezension** | Bewertungen von Werken (Buch, Produkt, Film …) | Bewertetes Werk, Urheber, Bewertung 1-5 |
| **Essay** | Längere reflektierende Prosa | - |
| **Newsletter** | Wiederkehrende Beiträge in Ausgaben | Ausgabennummer, Versanddatum |
| **Interview** | Gespräche mit anderen Personen | Name + Rolle des Gesprächspartners |
| **Listicle** | Listen-basierte Beiträge (Top 10, 5 Tipps …) | - |
| **Kurzgeschichte** | Kurze, in sich geschlossene Erzählungen | - |
| **Artikel** | Allgemeiner Text ohne festgelegte Form | - |

## Feld-Sichtbarkeit pro Typ

Jeder Typ zeigt nur die Metadaten-Felder, die für ihn sinnvoll sind,
damit die Editor-Seitenleiste übersichtlich bleibt. **Immer sichtbar**
bei jedem Typ: Titel, Inhalt, Status, Untertitel, Autor, Sprache und
Thema. Die folgenden **optionalen Kernfelder** erscheinen je nach Typ:

| Kernfeld | blogpost | tutorial | rezension | essay | newsletter | interview | listicle | kurzgeschichte | artikel |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Tags | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | ✓ | ✓ |
| Excerpt | ✓ | ✓ | ✓ | - | - | - | ✓ | - | ✓ |
| SEO (Titel + Beschreibung) | ✓ | ✓ | ✓ | - | - | - | ✓ | - | ✓ |
| Canonical URL | ✓ | - | - | - | - | - | - | - | ✓ |
| Beitragsbild | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | - | ✓ |

Die Sichtbarkeit ist in der Single Source of Truth konfiguriert,
`backend/config/content-types.yaml` (`core_fields` pro Typ), und
bleibt so überall konsistent. Ein Typ-Wechsel im Editor blendet die
passenden Felder sofort ein oder aus.

## Jeder Typ im Detail

### Blogpost
Der Standard und der flexibelste Typ, für kurze bis mittlere Beiträge
zu beliebigen Themen. Zeigt alle optionalen Felder (Tags, Excerpt,
SEO, Canonical URL, Beitragsbild) und ist damit auch die richtige
Heimat für einen anderswo zuerst veröffentlichten Beitrag (Canonical
URL setzen).

### Tutorial
Eine Schritt-für-Schritt-Anleitung. Typ-spezifische Felder:
**Schwierigkeitsgrad** (Anfänger / Mittel / Fortgeschritten),
**Voraussetzungen** und **geschätzte Dauer (Minuten)**. Zeigt Tags,
Excerpt, SEO und ein Beitragsbild. Verwende ihn, wenn Lesende den
Schritten folgen.

### Rezension
Eine Bewertung eines Werks. Typ-spezifische Felder: **bewertetes
Werk**, dessen **Autor / Urheber** und eine **Bewertung (1-5)**.
Zeigt Tags, Excerpt, SEO und ein Beitragsbild. Verwende ihn für
Buch- / Produkt- / Film- / Album-Rezensionen, bei denen Bewertung +
Werk-Metadaten zählen.

### Essay
Längere, reflektierende Prosa. Keine typ-spezifischen Felder. Zeigt
nur Tags + ein Beitragsbild. Excerpt, SEO und Canonical URL sind
ausgeblendet, damit der Fokus auf dem Text statt auf Such-Snippets
liegt. Verwende ihn für Meinungs- oder reflektierende Stücke.

### Newsletter
Eine wiederkehrende Ausgabe. Typ-spezifische Felder:
**Ausgabennummer** und **Versanddatum**. Zeigt keines der optionalen
Kernfelder, denn ein Newsletter wird per E-Mail verteilt, daher sind
SEO-Snippets, Excerpts und Canonical URLs nicht relevant. Verwende
ihn für Ausgaben einer periodischen Publikation.

### Interview
Ein Gespräch mit jemandem. Typ-spezifische Felder: **Name** und
**Rolle des Gesprächspartners**. Zeigt Tags + ein Beitragsbild.
Verwende ihn für Q&A- oder Interview-Formate.

### Listicle
Ein listen-basierter Beitrag (Top 10, 5 Tipps …). Keine
typ-spezifischen Felder. Zeigt Tags, Excerpt, SEO und ein
Beitragsbild, denn Listen-Beiträge sind oft suchorientiert, daher
bleiben die SEO-Felder. Verwende ihn für gereihte oder aufgezählte
Inhalte.

### Kurzgeschichte
Eine kurze, in sich geschlossene Erzählung. Keine typ-spezifischen
Felder. Zeigt nur Tags, denn Belletristik braucht selten
SEO-Snippets, Canonical URLs oder Excerpts. Verwende sie für Fiktion,
die du von Sachtexten getrennt halten willst.

### Artikel
Der allgemeine, nicht festgelegte Typ. Keine typ-spezifischen Felder.
Zeigt dieselben optionalen Kernfelder wie ein Blogpost (Tags,
Excerpt, SEO, Canonical URL, Beitragsbild), trägt aber keine
spezielle Bedeutung wie Tutorial oder Rezension. Verwende ihn, wenn
keiner der spezifischeren Typen passt und du einfach einen neutralen
Text mit den vollen Veröffentlichungs-Feldern willst. Hinweis:
**Blogpost** bleibt der eingebaute Standard, **Artikel** ist die
generische Alternative dazu.

## Anlegen mit Typ

Auf dem Artikel-Dashboard klickst du auf den Pfeil rechts neben dem
**Neuer Artikel**-Button. Ein Menü erscheint mit allen Typen außer
dem Standard (Blogpost). Klick auf den gewünschten Typ legt direkt
einen neuen Artikel mit diesem Typ an.

Ein einfacher Klick auf **Neuer Artikel** legt den eingestellten
Standard an (ab Werk ein Blogpost), die häufigste Wahl, daher ohne
Umweg über das Menü. Welcher Typ der Standard ist, kannst du unter
Einstellungen festlegen (siehe
[Standardwerte](../settings/defaults.md)).

## Typ später ändern

Im ArticleEditor zeigt die rechte Seitenleiste einen
**Textart**-Dropdown direkt unter dem Status-Feld. Den Typ zu
ändern setzt die typ-spezifischen Felder zurück (z. B. von Tutorial
auf Rezension werden die Tutorial-Felder geleert und die
Rezensions-Felder erscheinen) und wendet die obige Feld-Sichtbarkeit
pro Typ neu an.

## Anzeige im Dashboard

Jede Artikel-Karte (Grid-View) und jede Listen-Zeile (List-View)
zeigt einen kleinen Badge mit dem Typ-Icon und der Bezeichnung. So
siehst du auf einen Blick, welche Artikel Tutorials, Rezensionen
usw. sind, ohne den Editor zu öffnen.

## Verwandte Themen

- [Übersicht](../articles.md)
- [Standardwerte](../settings/defaults.md)
