# Glossary

## ASIN

Amazon Standard Identification Number. A 10-character identifier Amazon assigns to every product. Kindle e-books on Amazon are issued an ASIN automatically. In Bibliogon, the ASIN can be stored in the book metadata.

## EPUB

Electronic Publication. An open standard for e-books, maintained by the W3C. EPUB files are essentially ZIP archives containing XHTML content, CSS stylesheets, and metadata. Bibliogon produces EPUB files via manuscripta and Pandoc.

## ISBN

International Standard Book Number. A globally unique identifier for books. Bibliogon supports recording multiple ISBN variants per book: ISBN for ebook, paperback, and hardcover. The ISBN flows into the export metadata.

## manuscripta

A Python package (PyPI) that provides Bibliogon's export pipeline. Manuscripta handles scaffolding the write-book-template project structure and the Pandoc-based conversion to the target formats (EPUB, PDF, DOCX, HTML).

## Pandoc

A universal document conversion tool. Pandoc converts Markdown into many output formats including EPUB, PDF (via LaTeX), DOCX, and HTML. Bibliogon uses Pandoc as its export backend. Pandoc must be installed separately.

## Plugin

A self-contained extension that adds functionality to Bibliogon. Plugins are loaded through the PluginForge framework and register themselves at application startup. Each plugin contributes API endpoints and UI extensions. Plugins can depend on other plugins.

## PluginForge

An application-independent Python framework for plugin systems, available on PyPI. PluginForge is built on pluggy and provides base classes, hook specifications, and a plugin manager. Bibliogon uses PluginForge as the foundation for its plugin system.

## SQLite

A serverless, file-based SQL database engine. Bibliogon stores all books, chapters, and assets in a single SQLite file. No separate database installation is required. SQLite is well suited for single-user applications and the local-first approach.

## TipTap

A WYSIWYG editor framework for the web, based on ProseMirror. TipTap is the text editor used in Bibliogon and stores its content in its own JSON format (TipTap JSON). The editor is extensible via extensions and supports headings, lists, images, tables, footnotes, and more.

## TTS

Text-to-Speech. A technology that converts written text into spoken audio. The Audiobook plugin uses TTS engines (Edge TTS, Google Cloud TTS, ElevenLabs, pyttsx3) to generate audio files from book chapters.

## write-book-template

A standardized directory structure for book projects. A write-book-template project contains subfolders for front-matter, chapters, and back-matter, plus metadata and configuration files. Bibliogon uses this format as the intermediate step during export and supports importing projects in this format.
