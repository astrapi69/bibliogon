# Plugins Overview

## What plugins are

Bibliogon is built in layers. The core covers the basics: managing books and
chapters, the TipTap editor, backup and restore, and the user interface.
Everything beyond that - export, grammar checking, translation, audiobook
generation - is a plugin.

Plugins are standalone packages loaded through the PluginForge framework
(built on pluggy). Each registers itself at startup and provides its features
as API endpoints. A plugin may depend on another: the audiobook plugin builds
on the export plugin.

## Available plugins

Every plugin is free and usable without restriction. The name in brackets is
the identifier the plugin carries in `plugins.enabled` and in the
`plugin.yaml` of a plugin ZIP.

- **A+ Content** (`aplus`) - an Amazon A+ package from the book's metadata: short description, three bullets, header and three-image modules, checked against a per-language ruleset.
- **Audiobook** (`audiobook`) - an audiobook read from the chapters by speech synthesis, with the engine and voice chosen per book.
- **Comics** (`comics`) - comic pages with multiple panels, speech bubbles and their own PDF rendering.
- **Export** (`export`) - EPUB, PDF, DOCX, HTML, Markdown, LaTeX and the project structure as a ZIP.
- **Get started** (`getstarted`) - onboarding and a sample book to read along with.
- **Git sync** (`git-sync`) - import from a Git repository and sync in both directions.
- **Grammar** (`grammar`) - grammar and spelling checks through LanguageTool.
- **Help** (`help`) - this help, the keyboard-shortcut overview and the FAQ.
- **KDP** (`kdp`) - Amazon KDP metadata, cover validation and a completeness check.
- **Picture book** (`kinderbuch`) - one-image-per-page layouts for picture books.
- **Learn set** (`learnset`) - export a book as a learn set for adaptive-learner.
- **Medium import** (`medium-import`) - imports a Medium HTML export with its publications and provenance.
- **MS tools** (`ms-tools`) - style checks, text sanitization and text metrics, with per-book thresholds.
- **Promotion** (`promotion`) - a portfolio view of a book's retail formats: status, store links, ASIN.
- **Story bible** (`story-bible`) - a per-book database of characters, settings and plot points, linked to chapters and pages.
- **Translation** (`translation`) - translation through DeepL or LMStudio.

Which of these run in the web app without a desktop installation is listed in
the offline overview; some need a program on your own machine and are
therefore shown disabled with a reason in the browser rather than hidden.

## Installing plugins

The bundled plugins load automatically at startup. Third-party plugins can be
installed as a ZIP file through Settings > Plugins. The ZIP must contain a
`plugin.yaml` and a Python package with a plugin class. After the upload the
plugin is extracted into `plugins/installed/` and registered at the next
start.

A plugin provides server-side features: API endpoints, hooks and its
configuration. The interface for them belongs to the application itself and
appears depending on which book type is open and which plugins are active -
the comic editor only for a comic book, for instance. A plugin does not ship
buttons of its own.

## Managing plugins

Settings > Plugins lists every installed plugin with its name, version and
status. Plugins can be enabled or disabled, and each plugin's state is visible
at a glance.

![Settings > Plugins](../../assets/screenshots/settings-plugins.png)
