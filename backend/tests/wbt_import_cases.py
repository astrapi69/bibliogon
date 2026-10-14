"""#736: the write-book-template project ZIPs the client-import record is built from.

Each case is a path -> content map rather than a committed binary, for
two reasons. A diff of a `.zip` tells a reviewer nothing, and the
browser port has to be handed the SAME archive - so the record carries
the file tree and both sides build the ZIP from it, the recorder with
`zipfile` and the Vitest with `fflate`. Identical input by
construction rather than by a checked-in blob nobody can read.

Content is text except where a case needs real image bytes; those
carry `b64` and the record emits them base64-encoded.

One case per branch the importer can take. The branches are not
obvious from the outside, so each case names the one it covers.
"""

from __future__ import annotations

import base64
from typing import Any

#: The smallest valid PNG: 1x1, fully transparent. Only the extension
#: and the folder name drive classification, so the pixels are
#: irrelevant - but a real header keeps the fixture honest for any
#: future consumer that sniffs the bytes.
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=="
)


def _file(text: str) -> dict[str, Any]:
    return {"text": text}


def _binary(raw: bytes) -> dict[str, Any]:
    return {"b64": base64.b64encode(raw).decode("ascii")}


_FULL_METADATA = """---
title: Der Kater auf dem Dach
subtitle: Eine Erzählung
author: Asterios Raptis
lang: de-DE
description: Ein Kater beobachtet die Stadt.
edition: 2. Auflage
publisher: Eigenverlag
publisher_city: Zürich
date: 2026-03-01
series:
  title: Dachgeschichten
  volume: 2
isbn:
  ebook: 978-3-000000-01-0
  paperback: 978-3-000000-02-7
  hardcover: 978-3-000000-03-4
asin:
  ebook: B0TEST0001
  paperback: B0TEST0002
  hardcover: B0TEST0003
keywords:
  - Katze
  - Stadt
cover-image: assets/covers/cover.png
---
"""


CASES: list[dict[str, Any]] = [
    {
        # Every metadata field at once, a section_order under `ebook`,
        # one asset, the backpage sidecars under their CURRENT names,
        # and a stylesheet in config/.
        "name": "full-project-with-section-order",
        "files": {
            "config/metadata.yaml": _file(_FULL_METADATA),
            "config/export-settings.yaml": _file(
                "section_order:\n"
                "  ebook:\n"
                "    - front-matter/toc.md\n"
                "    - front-matter/preface.md\n"
                "    - chapters\n"
                "    - back-matter/epilogue.md\n"
            ),
            "config/book-description.html": _file("<p>Eine <b>Erzählung</b>.</p>"),
            "config/backpage-description.md": _file("Wenn die Stadt schläft."),
            "config/backpage-author-description.md": _file("Asterios Raptis lebt in Zürich."),
            "config/custom.css": _file("body { font-family: serif; }"),
            "manuscript/front-matter/toc.md": _file("# Inhalt\n\n- Eins\n- Zwei\n"),
            "manuscript/front-matter/preface.md": _file("# Vorwort\n\nEin Anfang.\n"),
            "manuscript/chapters/01-das-dach.md": _file("# Das Dach\n\nEr sitzt oben.\n"),
            "manuscript/chapters/02-die-strasse.md": _file("# Die Strasse\n\nUnten ist Lärm.\n"),
            "manuscript/back-matter/epilogue.md": _file("# Nachwort\n\nEr bleibt.\n"),
            "assets/covers/cover.png": _binary(PNG_1X1),
        },
    },
    {
        # `section_order.paperback` with no `ebook` key: the reader
        # falls back to it. A port that only read `ebook` would land in
        # the alphabetical layout and produce different POSITIONS,
        # which is the thing that is invisible until a book opens in
        # the wrong order.
        "name": "section-order-under-paperback-only",
        "files": {
            "config/metadata.yaml": _file("title: Nur Paperback\nauthor: A\n"),
            "config/export-settings.yaml": _file(
                "section_order:\n  paperback:\n    - front-matter/preface.md\n    - chapters\n"
            ),
            "manuscript/front-matter/preface.md": _file("# Vorwort\n\nText.\n"),
            "manuscript/chapters/01-eins.md": _file("# Eins\n\nText.\n"),
        },
    },
    {
        # No export-settings.yaml at all: the alphabetical layout, whose
        # positions are 0+ for front matter, 100+ for chapters and 900+
        # for back matter. Those three bases are the contract.
        "name": "no-export-settings-alphabetical-layout",
        "files": {
            "config/metadata.yaml": _file("title: Alphabetisch\nauthor: A\n"),
            "manuscript/front-matter/preface.md": _file("# Vorwort\n\nText.\n"),
            "manuscript/front-matter/toc.md": _file("# Inhalt\n\nText.\n"),
            # Untyped, in neither matter map, so this layout drops it the
            # same way the section-order layout does - pinned here too,
            # because the two layouts take their files through different
            # code and only one of them had a fixture for the drop.
            "manuscript/front-matter/notizen.md": _file("# Notizen\n\nText.\n"),
            "manuscript/chapters/01-eins.md": _file("# Eins\n\nText.\n"),
            "manuscript/chapters/02-zwei.md": _file("# Zwei\n\nText.\n"),
            "manuscript/back-matter/epilogue.md": _file("# Nachwort\n\nText.\n"),
            "manuscript/back-matter/glossary.md": _file("# Glossar\n\nText.\n"),
            "manuscript/back-matter/anhaenge.md": _file("# Anhaenge\n\nText.\n"),
        },
    },
    {
        # A typed front/back-matter file the section_order does not
        # mention still gets imported, at the END and after everything
        # the order listed. An UNtyped one (`notes.md` is in neither
        # map) does not get imported at all.
        "name": "unlisted-typed-files-are-appended-untyped-are-dropped",
        "files": {
            "config/metadata.yaml": _file("title: Reste\nauthor: A\n"),
            "config/export-settings.yaml": _file(
                "section_order:\n  ebook:\n    - front-matter/preface.md\n    - chapters\n"
            ),
            "manuscript/front-matter/preface.md": _file("# Vorwort\n\nText.\n"),
            "manuscript/front-matter/dedication.md": _file("# Widmung\n\nText.\n"),
            "manuscript/chapters/01-eins.md": _file("# Eins\n\nText.\n"),
            "manuscript/back-matter/glossary.md": _file("# Glossar\n\nText.\n"),
            "manuscript/back-matter/notes.md": _file("# Notizen\n\nNicht importiert.\n"),
        },
    },
    {
        # `*-print.md` variants are skipped in every layout.
        "name": "print-variants-are-skipped",
        "files": {
            "config/metadata.yaml": _file("title: Druckvarianten\nauthor: A\n"),
            "manuscript/chapters/01-eins.md": _file("# Eins\n\nText.\n"),
            "manuscript/chapters/01-eins-print.md": _file("# Eins Druck\n\nText.\n"),
            "manuscript/front-matter/preface.md": _file("# Vorwort\n\nText.\n"),
            "manuscript/front-matter/preface-print.md": _file("# Vorwort Druck\n\nText.\n"),
        },
    },
    {
        # Chapter types from the filename stem: the numeric prefix is
        # stripped first, so `01-0-part-1-intro` is a PART_INTRO and
        # `05-1-interludium` an INTERLUDE.
        "name": "chapter-types-from-the-filename-stem",
        "files": {
            "config/metadata.yaml": _file("title: Typen\nauthor: A\n"),
            "manuscript/chapters/01-0-part-1-intro.md": _file("# Teil 1\n\nText.\n"),
            "manuscript/chapters/02-kapitel.md": _file("# Kapitel\n\nText.\n"),
            "manuscript/chapters/05-1-interludium.md": _file("# Zwischenspiel\n\nText.\n"),
            "manuscript/chapters/06-interlude.md": _file("# Interlude\n\nText.\n"),
        },
    },
    {
        # No H1: the title comes from the stem, with the numeric prefix
        # stripped, hyphens turned into spaces and Title Case applied.
        "name": "title-falls-back-to-the-filename-stem",
        "files": {
            "config/metadata.yaml": _file("title: Ohne H1\nauthor: A\n"),
            "manuscript/chapters/03-2-der-lange-weg.md": _file("Kein Titel, nur Text.\n"),
            "manuscript/chapters/04-zweites.md": _file("## Nur H2\n\nText.\n"),
        },
    },
    {
        # The bare (non-Pandoc-wrapped) metadata shape, an author LIST,
        # a series as a plain STRING with a sibling series_index, ISBNs
        # under `identifiers.*` rather than `isbn.*`, and the
        # snake_case `cover_image` key.
        "name": "bare-metadata-author-list-string-series-identifiers",
        "files": {
            "config/metadata.yaml": _file(
                "title: Mehrere Autoren\n"
                "author:\n"
                "  - Erste Autorin\n"
                "  - Zweiter Autor\n"
                "series: Eine Reihe\n"
                "series_index: 3\n"
                "identifiers:\n"
                "  isbn_ebook: 978-3-111111-11-1\n"
                "  isbn_paperback: 978-3-111111-12-8\n"
                "cover_image: assets/figures/nicht-da.png\n"
                "lang: en\n"
            ),
            "manuscript/chapters/01-eins.md": _file("# Eins\n\nText.\n"),
        },
    },
    {
        # An author list of MAPPINGS carrying `name`, which is the
        # Pandoc shape, plus the alternative spellings the parser
        # accepts for the same three things: the legacy
        # `cover-back-page-*` sidecar names, the plain `cover`
        # metadata key, and `language` as the fallback for `lang`
        # (every other case uses `lang`, so without this one a port
        # could drop the fallback and the record would not notice).
        "name": "author-mappings-legacy-sidecars-plain-cover-key",
        "files": {
            "config/metadata.yaml": _file(
                "title: Pandoc-Autoren\n"
                "author:\n"
                "  - name: Marta Rivers\n"
                "    affiliation: Lissabon\n"
                "  - name: Jan Berg\n"
                "cover: assets/covers/cover.png\n"
                "language: pt\n"
            ),
            "config/cover-back-page-description.md": _file("Alte Rückseite."),
            "config/cover-back-page-author-introduction.md": _file("Alte Biografie."),
            "manuscript/chapters/01-eins.md": _file("# Eins\n\nText.\n"),
            "assets/covers/cover.png": _binary(PNG_1X1),
        },
    },
    {
        # An author shape with nothing usable in it falls back to
        # "Unknown" rather than to the YAML repr.
        "name": "unusable-author-falls-back-to-unknown",
        "files": {
            "config/metadata.yaml": _file("title: Ohne Autor\nauthor:\n  - {}\n"),
            "manuscript/chapters/01-eins.md": _file("# Eins\n\nText.\n"),
        },
    },
    {
        # One wrapper directory, which is what a ZIP downloaded from
        # GitHub looks like. `find_project_root` tolerates exactly one
        # level.
        "name": "one-wrapper-directory",
        "files": {
            "mein-buch-main/config/metadata.yaml": _file("title: Im Ordner\nauthor: A\n"),
            "mein-buch-main/manuscript/chapters/01-eins.md": _file("# Eins\n\nText.\n"),
        },
    },
    {
        # Asset classification by folder, with the subfolder override,
        # and a non-image that must NOT become an asset. The cover is
        # chosen from the cover-typed asset because the metadata names
        # a file that was never imported.
        "name": "asset-classification-and-cover-fallback",
        "files": {
            "config/metadata.yaml": _file(
                "title: Bilder\nauthor: A\ncover-image: assets/covers/fehlt.png\n"
            ),
            "manuscript/chapters/01-eins.md": _file(
                "# Eins\n\n![Ein Bild](assets/figures/bild.png)\n"
            ),
            "assets/covers/echtes-cover.png": _binary(PNG_1X1),
            "assets/figures/bild.png": _binary(PNG_1X1),
            "assets/figures/diagrams/plan.png": _binary(PNG_1X1),
            "assets/author/portrait.png": _binary(PNG_1X1),
            "assets/figures/notiz.txt": _file("kein Bild"),
        },
    },
    {
        # A `style` attribute in raw HTML inside a chapter.
        #
        # End-to-end this case records an EMPTY style list, and that is
        # the finding rather than a gap: ms-tools' `content_pre_import`
        # hook runs first and strips every style attribute, so the
        # core's own allowlist filter never sees one. The browser has
        # no ms-tools, so the control it has to reproduce is the core
        # filter - recorded on its own in STYLE_FILTER_CASES below,
        # where the plugin cannot reach it. Same shape as the #988
        # lesson in `lessons-learned.md`: a security property that
        # holds only while an optional plugin is enabled is not held.
        "name": "style-attributes-are-filtered-on-import",
        "files": {
            "config/metadata.yaml": _file("title: Styles\nauthor: A\n"),
            "manuscript/chapters/01-eins.md": _file(
                "# Eins\n\n"
                '<p style="text-align: center; position: fixed">Zentriert</p>\n\n'
                "<p style=\"font-family: 'Arial'; color: red\">Rot</p>\n\n"
                "<p style=position:fixed>Unquoted</p>\n\n"
                '<p style="position: fixed">Nur verboten</p>\n'
            ),
        },
    },
    {
        # A YAML front-matter block at the top of a chapter is dropped
        # rather than rendered into the body - the shape a git-sync
        # round trip produces.
        "name": "chapter-front-matter-is-dropped",
        "files": {
            "config/metadata.yaml": _file("title: Frontmatter\nauthor: A\n"),
            "manuscript/chapters/01-eins.md": _file(
                "---\ntitle: Eins\nposition: 0\n---\n\n# Eins\n\nText.\n"
            ),
        },
    },
    {
        # No manuscript directory at all: zero chapters, and the import
        # still produces a book rather than failing.
        "name": "empty-manuscript",
        "files": {
            "config/metadata.yaml": _file("title: Leer\nauthor: A\n"),
            "manuscript/.keep": _file(""),
        },
    },
    {
        # The keywords column stores a json.dumps of the list, and both
        # deployments have to write the SAME bytes or a .bgb diff and the
        # backup comparison report a change nobody made. Two things about
        # json.dumps are invisible to an ASCII-only fixture: the ", "
        # separator, and ensure_ascii, which escapes every code point at or
        # above U+007F - including an astral character as a surrogate pair.
        "name": "keywords-carry-python-json-escaping",
        "files": {
            "config/metadata.yaml": _file(
                "title: Schlagworte\nauthor: A\nkeywords:\n  - Käse\n  - Stadt\n  - 😀\n  - ascii\n"
            ),
            "manuscript/chapters/01-eins.md": _file("# Eins\n\nText.\n"),
        },
    },
    {
        # A stylesheet NOT in config/: the loader scans assets/css and
        # assets/styles before falling back to an rglob.
        "name": "stylesheet-from-assets-css",
        "files": {
            "config/metadata.yaml": _file("title: Stil\nauthor: A\n"),
            "manuscript/chapters/01-eins.md": _file("# Eins\n\nText.\n"),
            "assets/css/book.css": _file("h1 { color: #333; }"),
        },
    },
]


#: Raw HTML fed straight to the core's `filter_import_styles`, bypassing
#: the import pipeline.
#:
#: Recorded separately because ms-tools strips every style attribute
#: before the core filter runs, so an end-to-end case cannot observe the
#: control at all (see `style-attributes-are-filtered-on-import`). The
#: browser has no ms-tools; the core allowlist is what it must mirror,
#: and it is the half that is a security control rather than a cleanup.
#:
#: One entry per form HTML allows for an attribute value, because an
#: attribute the filter does not RECOGNISE is an attribute that ships
#: unfiltered - the failure mode a value-shaped regex has.
STYLE_FILTER_CASES: list[dict[str, Any]] = [
    {
        "name": "allowlisted-survives-forbidden-is-dropped",
        "html": '<p style="text-align: center; position: fixed">X</p>',
    },
    {
        # A double-quoted value containing an apostrophe, which a
        # character class excluding BOTH quotes would fail to match -
        # leaving the whole attribute, declarations and all, unfiltered.
        "name": "double-quoted-value-with-an-apostrophe",
        "html": "<p style=\"font-family: 'Arial'; color: red\">X</p>",
    },
    {
        "name": "single-quoted-value",
        "html": "<p style='color: red; position: fixed'>X</p>",
    },
    {
        # HTML allows an unquoted value; it is re-emitted quoted.
        "name": "unquoted-value",
        "html": "<p style=color:red>X</p>",
    },
    {
        "name": "nothing-allowlisted-drops-the-attribute",
        "html": '<p style="position: fixed">X</p>',
    },
    {
        "name": "a-fragment-without-a-colon-is-not-a-declaration",
        "html": '<p style="text-align: center; nonsense">X</p>',
    },
    {
        "name": "property-names-are-matched-case-insensitively",
        "html": '<p style="TEXT-ALIGN: Center">X</p>',
    },
    {
        "name": "a-url-background-is-dropped",
        "html": '<p style="background-image: url(https://example.invalid/x.png)">X</p>',
    },
    {
        "name": "table-column-widths-survive",
        "html": '<td style="width: 120px; min-width: 60px"></td>',
    },
    {
        "name": "several-attributes-in-one-document",
        "html": (
            '<p style="color: red">A</p><p style="position: fixed">B</p>'
            '<p style="background-color: yellow">C</p>'
        ),
    },
    {
        "name": "markup-without-any-style-attribute-is-untouched",
        "html": "<p>Plain</p>",
    },
]
