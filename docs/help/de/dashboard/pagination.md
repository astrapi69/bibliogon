# Paginierung im Dashboard

Sowohl das Bücher- als auch das Artikel-Dashboard laden ihre Einträge seitenweise, damit auch große Sammlungen schnell anzeigen.

![Mehr-laden-Button + Pro-Seite-Auswahl](../../assets/screenshots/dashboard-pagination.png)

## Bedienung

Unter der Liste am Ende der Seite stehen zwei Bedienelemente:

- **Mehr laden (N / M)** — zeigt die nächste Seite an. N ist die Anzahl der gerade sichtbaren Einträge, M die Gesamtzahl nach Filter.
- **Pro Seite** — Dropdown mit 10, 25, 50 oder 100 Einträgen pro Seite. Die Auswahl wird pro Dashboard separat gespeichert (Bücher und Artikel haben unabhängige Werte).

## Persistenz

Die Pro-Seite-Auswahl liegt in den App-Einstellungen unter `ui.dashboard.books_page_size` bzw. `ui.dashboard.articles_page_size`. Sie folgt also dem Konto, nicht dem Browser — derselbe Wert gilt auf allen Geräten.

## Auswahl und Massen-Aktionen

"Alle auswählen" bezieht sich immer auf den **gesamten gefilterten Satz**, nicht nur auf die gerade sichtbare Seite. Das stellt sicher, dass Massen-Export oder Massen-Löschen nicht versehentlich Einträge auslässt, die der Filter eigentlich freigibt.

## Verwandte Themen

- [Papierkorb und Wiederherstellen](trash-and-restore.md) — paginierte Trash-Ansicht mit Bulk-Restore
- [Einstellungen-Navigation](../settings/sidebar.md) — wo die globale Pro-Seite-Wahl liegt
