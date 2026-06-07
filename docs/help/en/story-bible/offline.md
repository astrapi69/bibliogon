# Story Bible offline

The Story Bible works in the backendless [web app](../web-app.md) and
while the desktop app is offline. Your fiction database lives in the
browser like the rest of your data, so you can build it up entirely
without a server.

## What works offline

- **Creating and editing entities** — characters, settings, items,
  plot points and lore, with their rich-text descriptions and per-type
  metadata.
- **Linking entities** to chapters and pages (the appearances that power
  the Storyboard badges and the appearance tracker).
- **Relationships** between entities (ally, rival, family, mentor,
  romantic, neutral) — created and edited offline.
- **Markdown export** of the Story Bible.

For the concepts themselves, see the
[Story Bible overview](../story-bible.md), the
[relationship graph](relationship-graph.md), and
[Arc View and continuity](arc-view.md).

## What needs the desktop (or a backend)

Two helpers depend on server-side text analysis and are unavailable
offline:

- **Auto-detect** — scanning your chapter and page text for entity-name
  mentions to propose links. Offline it simply finds nothing; run it on
  the desktop app (with the backend) to get proposals.
- **Continuity checker** — the advisory warnings about an entity
  disappearing, gaps, or empty pages. These are not computed offline.

Everything you author by hand — entities, links, relationships — is
stored locally and is waiting for you, fully intact, the next time you
open the desktop app where auto-detect and the continuity checker can
run over it.
