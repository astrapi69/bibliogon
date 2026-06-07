# Story-Bibel offline

Die Story-Bibel funktioniert in der backendlosen [Web-App](../web-app.md)
und während die Desktop-App offline ist. Deine Fiktions-Datenbank liegt
wie deine übrigen Daten im Browser, sodass du sie vollständig ohne Server
aufbauen kannst.

## Was offline funktioniert

- **Entitäten anlegen und bearbeiten** — Charaktere, Schauplätze,
  Gegenstände, Handlungspunkte und Lore, mitsamt ihren
  Rich-Text-Beschreibungen und typ-spezifischen Metadaten.
- **Entitäten verknüpfen** mit Kapiteln und Seiten (die Auftritte, die
  die Storyboard-Badges und den Auftritts-Tracker speisen).
- **Beziehungen** zwischen Entitäten (Verbündete, Rivalen, Familie,
  Mentor, romantisch, neutral) — offline anlegbar und bearbeitbar.
- **Markdown-Export** der Story-Bibel.

Zu den Konzepten selbst siehe die
[Story-Bibel-Übersicht](../story-bible.md), den
[Beziehungsgraphen](relationship-graph.md) und
[Arc-Ansicht und Kontinuität](arc-view.md).

## Was den Desktop (oder ein Backend) braucht

Zwei Helfer hängen an einer serverseitigen Textanalyse und sind offline
nicht verfügbar:

- **Auto-Erkennung** — das Durchsuchen deiner Kapitel- und Seitentexte
  nach Erwähnungen von Entitätsnamen, um Verknüpfungen vorzuschlagen.
  Offline findet sie schlicht nichts; führe sie in der Desktop-App (mit
  Backend) aus, um Vorschläge zu erhalten.
- **Kontinuitäts-Prüfung** — die hinweisenden Warnungen, wenn eine
  Entität verschwindet, Lücken entstehen oder Seiten leer sind. Diese
  werden offline nicht berechnet.

Alles, was du von Hand erstellst — Entitäten, Verknüpfungen, Beziehungen
— wird lokal gespeichert und steht beim nächsten Öffnen der Desktop-App
vollständig bereit, wo Auto-Erkennung und Kontinuitäts-Prüfung darüber
laufen können.
