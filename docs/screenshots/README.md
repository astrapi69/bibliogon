# Feature-Screenshots

A visual catalog of Bibliogon's features, for documentation, README, Medium
articles, and onboarding. **Not** a regression suite — pixel-diff regression
lives in `e2e/visual/` (VISUAL-REGRESSION-SCREENSHOTS-01).

Generated on-demand:

```bash
make capture-screenshots          # or: cd e2e && npx playwright test --project=feature-screenshots
```

- **Viewport:** 1280x720 (desktop, 16:9)
- **Theme:** default (Warm Literary, light — no dark mode)
- **Locale:** de-DE
- **Format:** PNG (lossless), `fullPage:false` unless noted, reduced motion
- **Data:** realistic German titles + prose, seeded fresh per shot

The capture spec is `e2e/feature-screenshots/capture-features.spec.ts`. It takes
no assertions — success is "all screenshots generated without crash". Re-run it
whenever a screenshotted surface changes; the committed PNGs render this catalog
without re-running Playwright (the chromium binary is not downloadable in every
environment, so the PNGs are committed alongside the spec). They are tracked as
binary via the repo-level `.gitattributes` (`*.png binary`) — plain git, no LFS.

> First-time / CI-less environments: if `make capture-screenshots` reports a
> missing browser, run `cd e2e && npx playwright install chromium` once (needs
> network access to `cdn.playwright.dev`).

---

## Dashboard

| Feature | Screenshot |
| --- | --- |
| Book dashboard — grid view | ![Book Dashboard Grid](dashboard/book-dashboard-grid.png) |
| Book dashboard — list view | ![Book Dashboard List](dashboard/book-dashboard-list.png) |
| Article dashboard | ![Article Dashboard](dashboard/article-dashboard.png) |
| Recent documents | ![Recent Documents](dashboard/recent-documents.png) |
| Trash view | ![Trash View](dashboard/trash-view.png) |

## Book Editor

| Feature | Screenshot |
| --- | --- |
| Chapter sidebar + editor | ![Chapter Sidebar](book-editor/chapter-sidebar.png) |
| Editor toolbar | ![Editor Toolbar](book-editor/editor-with-toolbar.png) |
| Composition mode (distraction-free) | ![Composition Mode](book-editor/composition-mode.png) |
| Chapter status + labels | ![Chapter Status Labels](book-editor/chapter-status-labels.png) |
| Chapter outliner (synopsis + Inspector notes columns) | ![Chapter Outliner](book-editor/chapter-outliner.png) |
| Chapter collections (Sammlungen bar + colour dots) | ![Chapter Collections](book-editor/chapter-collections.png) |
| Writing goals | ![Writing Goals](book-editor/writing-goals.png) |
| Storyboard | ![Storyboard](book-editor/storyboard.png) |
| Story Bible | ![Story Bible](book-editor/story-bible.png) |
| Editor context menu | ![Context Menu](book-editor/context-menu.png) |

## Article Editor

| Feature | Screenshot |
| --- | --- |
| Article editor | ![Article Editor](article-editor/article-editor.png) |
| Article metadata (tags / excerpt / SEO) | ![Article Metadata](article-editor/article-metadata.png) |

## Comic Editor

| Feature | Screenshot |
| --- | --- |
| Comic page with panels | ![Comic Page With Panels](comic-editor/comic-page-with-panels.png) |
| Fullscreen mode | ![Comic Fullscreen](comic-editor/fullscreen-mode.png) |

## Picture Book Editor

| Feature | Screenshot |
| --- | --- |
| Page editor | ![Page Editor](picture-book-editor/page-editor.png) |
| Page canvas | ![Page Canvas](picture-book-editor/page-canvas.png) |

## Settings

| Feature | Screenshot |
| --- | --- |
| General settings | ![General Settings](settings/general-settings.png) |
| AI provider table | ![KI Provider Table](settings/ki-provider-table.png) |
| Update checker | ![Update Checker](settings/update-checker.png) |
| Data management | ![Data Management](settings/data-management.png) |
| Data migration welcome (.bgb from online, #591) | ![Data Migration](settings/data-migration.png) |
| About / version | ![About Version](settings/about-version.png) |
| Auto-save behaviour tab (no Save button, #473) | ![Settings Auto-Save](settings/auto-save.png) |
| Preview / test-version banner + build-info (#644) | ![Preview Build Info](settings/preview-build-info.png) |
| Share-app QR section (#644) | ![Share App](settings/share-app.png) |

## Shortcuts

| Feature | Screenshot |
| --- | --- |
| Shortcuts overview dialog (Ctrl+/ or ?, #662) | ![Shortcuts Overview](shortcuts/overview-dialog.png) |

## Quality Report

| Feature | Screenshot |
| --- | --- |
| Metrics table | ![Metrics Table](quality/metrics-table.png) |
| Flesch scale | ![Flesch Scale](quality/flesch-scale.png) |
| Complex sentences (Schachtelsätze) | ![Complex Sentences](quality/complex-sentences.png) |

## Import / Export

| Feature | Screenshot |
| --- | --- |
| Import wizard | ![Import Wizard](import-export/import-wizard.png) |
| Scrivener import (.scriv via the .zip upload path) | ![Scrivener Import](import-export/scrivener-import.png) |
| Export preview | ![Export Preview](import-export/export-preview.png) |
| Full-data backup (.bgb) | ![BGB Backup](import-export/bgb-backup.png) |
| KDP wizard — format step (eBook/Taschenbuch/Hardcover + trim + margins) | ![KDP Format Step](import-export/kdp-format-step.png) |
| KDP wizard — upload guide (kdp.amazon.com + walkthrough) | ![KDP Guide Step](import-export/kdp-guide-step.png) |

---

## Scope

This catalog is for **documentation/marketing**. Deliberately out of scope (each
a separate later category):

- Regression screenshots — stay in `e2e/visual/`.
- Mobile-viewport screenshots.
- Dark-mode screenshots.
- Error-state screenshots.

Panel drag-and-drop is not captured: a mid-drag frame cannot be screenshotted
deterministically; the static panel grid is shown in *Comic page with panels*.

The EVT event-recording axes (EVT-05/06) are not yet captured: `EventRecorderSetup`
mounts globally in `App.tsx` with no stable testid/route to target a clean shot —
deferred until it exposes a screenshot anchor.

The two KDP-wizard shots (format step + upload guide) are **deep gated** captures:
the format step seeds a KDP-ready book (complete metadata + a generated
700×1100 cover) to pass the metadata + cover gates, and the guide step
additionally generates the export package (a real backend Pandoc export, up to
~60 s). Both blocks are crash-resistant — if a gate blocks, they screenshot
whatever rendered — so verify these two when running `make capture-screenshots`.

> The PNGs for the features added since the catalog shipped (Chapter
> collections, Settings auto-save, Scrivener import — and the synopsis +
> Inspector-notes columns folded into the Chapter-outliner shot) are generated
> by `make capture-screenshots` in a browser-enabled environment; the capture
> spec already covers them.
