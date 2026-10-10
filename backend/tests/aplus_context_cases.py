"""#890: the book rows and image slots the A+ context record is built from.

Split out of ``test_aplus_context_parity.py`` so each file stays one
concern: this one is the input space, that one is the recording and the
assertions over it. Adding a case here is a data change; the generator
does not have to move.

``BookStub`` stands in for a ``Book`` ORM row. It is deliberately NOT a
real ``Book``: the assembly reads attributes and nothing else, and a
stub makes a sparse case readable while ``as_row`` still yields every
column the record has to carry - a record built from the sparse case
input instead of the resolved row is how #1042's sibling mistake
happened here, with every frontend case reading ``book_id: undefined``.
"""

from __future__ import annotations

from typing import Any

#: JSON-encoded list columns. The ORM stores them as text; the
#: frontend's Book type has them decoded.
LIST_FIELDS = ("bisac_codes", "categories", "keywords")


#: Every attribute ``build_book_context`` / ``find_missing_fields`` read.
BOOK_FIELDS = (
    "id",
    "title",
    "subtitle",
    "author",
    "language",
    "description",
    "html_description",
    "backpage_description",
    "genre",
    "book_type",
    *LIST_FIELDS,
)


class BookStub:
    """A Book-shaped object. ``build_book_context`` duck-types its input."""

    def __init__(self, **fields: Any) -> None:
        self.id = fields.pop("id", "book-1")
        self.title = fields.pop("title", "Ein Buch")
        for name in BOOK_FIELDS[2:]:
            setattr(self, name, fields.pop(name, None))
        assert not fields, f"unknown Book fields: {sorted(fields)}"

    def as_row(self) -> dict[str, Any]:
        """The row as processed, defaults included.

        The case inputs are sparse; what reaches the port is this. The
        record carries the resolved row so the two sides read the same
        input rather than the port guessing at the defaults.
        """
        return {name: getattr(self, name) for name in BOOK_FIELDS}


#: One case per branch of the genre chain, per description-fallback
#: step and per missing-field rule, plus the shapes where the two
#: runtimes could disagree: HTML-shaped source text, malformed JSON in
#: a list column, and a language that is absent or empty.
CASES: list[dict[str, Any]] = [
    {
        "name": "complete-de",
        "book": {
            "title": "Der Kater auf dem Dach",
            "subtitle": "Eine Erzählung",
            "author": "Asterios Raptis",
            "language": "de",
            "description": "Ein Kater beobachtet die Stadt.",
            "genre": "Roman",
            "keywords": '["Katze", "Stadt"]',
            "categories": '["Belletristik"]',
        },
    },
    {
        "name": "missing-author",
        "book": {"author": "   ", "description": "Vorhanden."},
    },
    {
        "name": "missing-description",
        "book": {"author": "Asterios Raptis"},
    },
    {
        "name": "missing-both",
        "book": {},
    },
    {
        "name": "description-whitespace-only-counts-as-missing",
        "book": {"author": "A", "description": "   ", "html_description": "\n"},
    },
    {
        "name": "html-description-is-stripped",
        "book": {
            "author": "A",
            "description": "<p>Erster Satz.</p><p>Zweiter <strong>Satz</strong>.</p>",
        },
    },
    {
        "name": "description-falls-back-to-html_description",
        "book": {"author": "A", "html_description": "<p>Nur HTML.</p>"},
    },
    {
        "name": "description-falls-back-to-backpage",
        "book": {"author": "A", "backpage_description": "Nur Rückseite."},
    },
    {
        # Two populated description columns, so the record pins WHICH one
        # wins rather than only that a fallback happens. Without this,
        # swapping the first two entries of the preference order passed
        # every case - the cases each had exactly one column filled.
        "name": "description-prefers-description-over-html",
        "book": {
            "author": "A",
            "description": "Die Spalte description.",
            "html_description": "<p>Die Spalte html_description.</p>",
        },
    },
    {
        "name": "description-prefers-html-over-backpage",
        "book": {
            "author": "A",
            "html_description": "<p>Die Spalte html_description.</p>",
            "backpage_description": "Die Spalte backpage_description.",
        },
    },
    {
        "name": "description-all-three-populated",
        "book": {
            "author": "A",
            "description": "Die Spalte description.",
            "html_description": "<p>Die Spalte html_description.</p>",
            "backpage_description": "Die Spalte backpage_description.",
        },
    },
    {
        "name": "genre-explicit-wins",
        "book": {
            "author": "A",
            "description": "Ein Bilderbuch für Kinder.",
            "genre": "  Sachbuch  ",
            "book_type": "picture_book",
        },
    },
    {
        "name": "genre-from-picture-book-type",
        "book": {"author": "A", "description": "Text.", "book_type": "picture_book"},
    },
    {
        "name": "genre-from-juv-bisac",
        "book": {
            "author": "A",
            "description": "Text.",
            "bisac_codes": '["JUV002000"]',
        },
    },
    {
        "name": "genre-from-german-text-marker",
        "book": {"author": "A", "title": "Mein Bilderbuch", "description": "Text."},
    },
    {
        "name": "genre-from-backpage-marker-only",
        # #839: html_description wins the description resolution while
        # the only marker sits in backpage_description.
        "book": {
            "author": "A",
            "html_description": "<p>Eine Geschichte.</p>",
            "backpage_description": "Ein Bilderbuch zum Vorlesen.",
        },
    },
    {
        "name": "genre-from-spanish-marker-in-german-book",
        "book": {
            "author": "A",
            "language": "de",
            "description": "Un libro infantil sobre un gato.",
        },
    },
    {
        "name": "genre-none",
        "book": {"author": "A", "description": "Ein Roman über eine Stadt."},
    },
    {
        "name": "language-absent-defaults-to-en",
        "book": {"author": "A", "description": "Text."},
    },
    {
        "name": "language-empty-defaults-to-en",
        "book": {"author": "A", "description": "Text.", "language": ""},
    },
    {
        "name": "language-override-de-to-en",
        "book": {"author": "A", "description": "Text.", "language": "de"},
        "language_override": "en",
    },
    {
        "name": "lists-malformed-json",
        "book": {
            "author": "A",
            "description": "Text.",
            "keywords": "not json",
            "categories": '{"not": "a list"}',
            "bisac_codes": "",
        },
    },
    {
        "name": "umlauts-everywhere",
        "book": {
            "title": "Über Bären und Käfer",
            "subtitle": "Größer als groß",
            "author": "Asterios Raptis",
            "language": "de",
            "description": "Ein Käfer läuft über die Straße.",
            "keywords": '["Käfer", "Straße"]',
        },
    },
]

#: Genre keys for the image-style context: none, the one the ruleset
#: overrides, and one it does not know.
STYLE_GENRES = [None, "kinderbuch", "sachbuch"]

#: Image slots for the rendered copy-and-paste string.
RENDER_CASES: list[dict[str, Any]] = [
    {"name": "empty-prompt", "image": {"prompt": "   "}},
    {
        # An empty prompt with parameters set is the case that bites: a
        # bare "--ar 1:1 --no text" is a parameter tail, not a prompt.
        # The variant above has nothing to append, so it renders "" even
        # from a port that forgot the rule - it proved nothing on its own.
        "name": "empty-prompt-with-ratio-and-flags",
        "image": {
            "prompt": "",
            "aspect_ratio": "1:1",
            "size": "300x300",
            "style_flags": ["--no text"],
        },
    },
    {
        "name": "whitespace-prompt-with-ratio",
        "image": {"prompt": "  \n ", "aspect_ratio": "97:60"},
    },
    {
        "name": "prompt-is-trimmed",
        "image": {"prompt": "  a cat  ", "aspect_ratio": "1:1"},
    },
    {"name": "prompt-only", "image": {"prompt": "a cat on a roof"}},
    {
        "name": "prompt-and-ratio",
        "image": {"prompt": "a cat on a roof", "aspect_ratio": "97:60"},
    },
    {
        "name": "prompt-ratio-and-flags",
        "image": {
            "prompt": "a cat on a roof",
            "aspect_ratio": "1:1",
            "size": "300x300",
            "style_flags": ["--style raw", "--no text"],
        },
    },
    {
        "name": "prompt-and-flags-without-ratio",
        "image": {"prompt": "a cat", "style_flags": ["--no text"]},
    },
]

#: Packages for with_rendered_prompts, including the shapes it has to
#: tolerate: no image blocks at all, and a missing tile list.
PACKAGE_CASES: list[dict[str, Any]] = [
    {
        "name": "header-and-tiles",
        "package": {
            "module_header": {
                "headline": "Ein Kater",
                "image": {
                    "prompt": "a cat on a roof",
                    "aspect_ratio": "97:60",
                    "size": "970x600",
                    "style_flags": ["--style raw"],
                },
            },
            "module_three_images": [
                {
                    "caption": "Eins",
                    "image": {"prompt": "one", "aspect_ratio": "1:1"},
                },
                {"caption": "Zwei", "image": {"prompt": "   "}},
            ],
        },
    },
    {
        "name": "no-image-blocks",
        "package": {
            "module_header": {"headline": "Ohne Bild"},
            "module_three_images": [{"caption": "Eins"}],
        },
    },
    {
        "name": "tiles-not-a-list",
        "package": {"module_header": {"headline": "X"}, "module_three_images": None},
    },
]
