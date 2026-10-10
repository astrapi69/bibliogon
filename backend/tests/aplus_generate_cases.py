"""#890 stage 3b: the inputs the A+ generation record is built from.

Split out of ``test_aplus_generate_parity.py`` the same way
``aplus_context_cases.py`` is split out of the context recorder: this
file is the input space, that one is the recording. Adding a case here
is a data change.

Three input spaces, one per deterministic half of
``bibliogon_aplus.generator``:

- :data:`PROMPT_CASES` feed ``build_system_prompt`` /
  ``build_user_prompt`` - the text the model is asked for, which in the
  external sense IS the behaviour: a browser that sends a different
  prompt than the desktop gets different copy out of the same book.
- :data:`FRAGMENT_CASES` feed ``_build_draft_package`` - the tolerant
  construction from whatever the model actually replied.
- :data:`LOOP_CASES` feed ``generate_package`` with a scripted client,
  so the retry decision, the correction section and the
  attempt-exhausted return are recorded rather than described.
"""

from __future__ import annotations

from typing import Any

#: Every ruleset language, plus one the prompt builder has no name for.
#: ``_LANGUAGE_NAMES.get(language, language)`` falls back to the bare
#: code, and a port that hardcoded the four names would pass a record
#: that only ever asked for those four.
SYSTEM_PROMPT_LANGUAGES = ("de", "en", "fr", "es", "el")


#: One case per branch of ``build_user_prompt``: each optional context
#: line present and absent, the Kinderbuch clause, the empty-description
#: placeholder, and the correction section with none / one / several
#: findings.
PROMPT_CASES: list[dict[str, Any]] = [
    {
        "name": "full-context-no-findings",
        "book": {
            "title": "Der Kater auf dem Dach",
            "subtitle": "Eine Erzählung",
            "author": "Asterios Raptis",
            "language": "de",
            "description": "Ein Kater beobachtet die Stadt.",
            "genre": "Roman",
            "keywords": '["Katze", "Stadt"]',
            "categories": '["Belletristik"]',
            "bisac_codes": '["FIC000000"]',
        },
        "prior_findings": [],
    },
    {
        # Only the two required fields. Every optional line must be
        # absent, which is what pins that the port appends rather than
        # emitting an empty "Subtitle: ".
        "name": "minimal-context",
        "book": {"author": "A", "description": "Kurz."},
        "prior_findings": [],
    },
    {
        "name": "kinderbuch-adds-the-tone-clause",
        "book": {
            "title": "Der kleine Bär",
            "author": "A",
            "language": "de",
            "description": "Ein Bilderbuch für Kinder ab 3.",
            "genre": "Kinderbuch",
        },
        "prior_findings": [],
    },
    {
        # A genre key that is NOT kinderbuch: the clause must not appear,
        # so the record covers both sides of that branch.
        "name": "other-genre-omits-the-tone-clause",
        "book": {
            "author": "A",
            "language": "en",
            "description": "A reference work.",
            "genre": "Non-Fiction",
        },
        "prior_findings": [],
    },
    {
        "name": "one-prior-finding",
        "book": {"author": "A", "description": "Vorhanden.", "language": "de"},
        "prior_findings": [
            {
                "field": "short_description",
                "severity": "error",
                "message": "short_description is 312 characters; the limit is 200.",
            }
        ],
    },
    {
        "name": "several-prior-findings",
        "book": {"author": "A", "description": "Vorhanden.", "language": "en"},
        "prior_findings": [
            {
                "field": "bullets[0].heading",
                "severity": "error",
                "message": "bullets[0].heading starts with the marketing imperative 'Discover'.",
            },
            {
                "field": "module_header.alt_text",
                "severity": "error",
                "message": "module_header.alt_text must not be empty.",
            },
        ],
    },
    {
        # The language override the route applies when the caller asks
        # for a language other than the book's own.
        "name": "language-override-en-on-a-german-book",
        "book": {
            "author": "A",
            "language": "de",
            "description": "Ein deutsches Buch.",
        },
        "language_override": "en",
        "prior_findings": [],
    },
]


#: One case per tolerance branch of ``_build_draft_package``. The model
#: is the least reliable input in the whole path, so every shape it has
#: actually produced - and the ones it plausibly will - is recorded
#: rather than left to the port's author to imagine.
FRAGMENT_CASES: list[dict[str, Any]] = [
    {
        "name": "complete",
        "genre_key": None,
        "parsed": {
            "short_description": "Ein Kater beobachtet die Stadt.",
            "bullets": [
                {"heading": "Beobachtung", "body": "Der Kater sieht alles."},
                {"heading": "Stadt", "body": "Die Dächer sind seine Welt."},
                {"heading": "Nacht", "body": "Dann gehört ihm die Straße."},
            ],
            "module_header": {
                "title": "Über dem Dach",
                "text": "Eine Erzählung aus der Höhe.",
                "image_prompt": "cat on a rooftop, dusk, warm light",
                "alt_text": "Ein Kater sitzt auf einem Ziegeldach.",
            },
            "module_three_images": [
                {
                    "title": "Morgen",
                    "text": "Die Stadt wacht auf.",
                    "image_prompt": "rooftops at sunrise",
                    "alt_text": "Dächer im Morgenlicht.",
                },
                {
                    "title": "Mittag",
                    "text": "Schatten werden kurz.",
                    "image_prompt": "rooftops at noon",
                    "alt_text": "Dächer in der Mittagssonne.",
                },
            ],
        },
    },
    {
        # Nothing at all. Every field must default rather than raise -
        # a draft the validator can report on beats an exception.
        "name": "empty-mapping",
        "genre_key": None,
        "parsed": {},
    },
    {
        "name": "bullets-not-a-list",
        "genre_key": None,
        "parsed": {"short_description": "X", "bullets": "Beobachtung"},
    },
    {
        "name": "bullets-with-a-non-mapping-entry",
        "genre_key": None,
        "parsed": {
            "bullets": [
                {"heading": "Eins", "body": "Erster"},
                "zwei",
                {"heading": "Drei"},
            ]
        },
    },
    {
        # A bare ``image_prompt:`` line parses to None and must not
        # become the literal prompt "None".
        "name": "image-prompt-is-null",
        "genre_key": None,
        "parsed": {
            "module_header": {"title": "T", "image_prompt": None, "alt_text": "A"},
            "module_three_images": [{"title": "T", "image_prompt": None}],
        },
    },
    {
        "name": "image-prompt-is-whitespace",
        "genre_key": None,
        "parsed": {"module_header": {"image_prompt": "   \n  "}},
    },
    {
        # YAML turns an unquoted number into an int; the prompt is a
        # string field, so the port has to stringify the same way.
        "name": "image-prompt-is-a-number",
        "genre_key": None,
        "parsed": {"module_header": {"image_prompt": 42}},
    },
    {
        "name": "module-header-is-null",
        "genre_key": None,
        "parsed": {"module_header": None},
    },
    {
        "name": "three-images-not-a-list",
        "genre_key": None,
        "parsed": {"module_three_images": {"title": "T"}},
    },
    {
        # The style flags come from the genre, not from the model, so
        # the same fragment must build different image blocks per genre.
        "name": "kinderbuch-genre-stamps-its-own-style",
        "genre_key": "kinderbuch",
        "parsed": {
            "module_header": {"image_prompt": "a bear in a forest"},
            "module_three_images": [{"image_prompt": "a bear and a bee"}],
        },
    },
]


#: Raw AI responses, as text, so the fence stripping and the YAML parse
#: are recorded on the same bytes the port will be handed.
RAW_RESPONSE_CASES: list[dict[str, Any]] = [
    {"name": "plain-yaml", "text": "short_description: Ein Satz.\nbullets: []\n"},
    {
        "name": "fenced-yaml",
        "text": "```yaml\nshort_description: Ein Satz.\n```",
    },
    {"name": "fenced-bare", "text": "```\nshort_description: Ein Satz.\n```"},
    {
        "name": "fence-not-closed",
        "text": "```yaml\nshort_description: Ein Satz.",
    },
    {
        "name": "prose-around-the-document",
        "text": "Sure! Here you go:\nshort_description: Ein Satz.",
    },
    {"name": "empty", "text": ""},
    {"name": "whitespace-only", "text": "   \n\t\n"},
    {"name": "not-a-mapping", "text": "- eins\n- zwei\n"},
    {"name": "scalar-only", "text": "nope"},
    {
        # The shape a hand-written parser gets wrong: the colon inside
        # the value. YAML needs the quotes to read this as one scalar.
        "name": "value-contains-a-colon",
        "text": 'short_description: "Ein Buch: und ein Doppelpunkt"\n',
    },
    {
        "name": "broken-yaml",
        "text": "short_description: [unclosed\nbullets:\n  - : :\n",
    },
    {
        # Fenced AND prose-wrapped, which is what a chatty model sends.
        "name": "prose-then-fence",
        "text": "Here it is:\n\n```yaml\nshort_description: Ein Satz.\n```\n\nHope that helps!",
    },
]


_CLEAN_RESPONSE = """
short_description: Ein Kater beobachtet die Stadt von den Daechern aus.
bullets:
  - heading: Beobachtung
    body: Der Kater sieht die Stadt von oben.
  - heading: Daecher
    body: Seine Welt endet an der Regenrinne.
  - heading: Nacht
    body: Dann gehoert ihm die Strasse.
module_header:
  title: Ueber dem Dach
  text: Eine Erzaehlung aus der Hoehe.
  image_prompt: cat on a rooftop, dusk, warm light
  alt_text: Ein Kater sitzt auf einem Ziegeldach.
module_three_images:
  - title: Morgen
    text: Die Stadt wacht auf.
    image_prompt: rooftops at sunrise
    alt_text: Daecher im Morgenlicht.
  - title: Mittag
    text: Schatten werden kurz.
    image_prompt: rooftops at noon
    alt_text: Daecher in der Mittagssonne.
  - title: Abend
    text: Die Ziegel geben die Waerme ab.
    image_prompt: rooftops at dusk
    alt_text: Daecher im Abendlicht.
"""

#: A reply with a hard error in it: an empty alt text, which the
#: validator reports as an error rather than a warning.
_ERROR_RESPONSE = _CLEAN_RESPONSE.replace(
    "  alt_text: Ein Kater sitzt auf einem Ziegeldach.", '  alt_text: ""'
)


#: The generation loop, scripted. Each entry's ``responses`` are handed
#: to the fake client in order; a loop that asks for more attempts than
#: there are responses re-uses the last one, so a case cannot silently
#: depend on the retry budget.
LOOP_CASES: list[dict[str, Any]] = [
    {
        "name": "first-attempt-is-clean",
        "book": {
            "title": "Der Kater auf dem Dach",
            "author": "Asterios Raptis",
            "language": "de",
            "description": "Ein Kater beobachtet die Stadt.",
            "genre": "Roman",
        },
        "language": "de",
        "responses": [{"content": _CLEAN_RESPONSE, "model": "test-model-1"}],
    },
    {
        # One hard error, then a clean reply: the second prompt has to
        # carry the correction section built from the FIRST attempt's
        # errors only.
        "name": "retry-fixes-the-error",
        "book": {
            "title": "Der Kater auf dem Dach",
            "author": "Asterios Raptis",
            "language": "de",
            "description": "Ein Kater beobachtet die Stadt.",
        },
        "language": "de",
        "responses": [
            {"content": _ERROR_RESPONSE, "model": "test-model-1"},
            {"content": _CLEAN_RESPONSE, "model": "test-model-2"},
        ],
    },
    {
        # Never clean. The package comes back WITH its errors after the
        # budget is spent, and the attempt count is 1 + the configured
        # retries - the #829 off-by-one.
        "name": "budget-exhausted-returns-the-errors",
        "book": {
            "title": "Der Kater auf dem Dach",
            "author": "Asterios Raptis",
            "language": "de",
            "description": "Ein Kater beobachtet die Stadt.",
        },
        "language": "de",
        "responses": [{"content": _ERROR_RESPONSE, "model": "test-model-1"}],
    },
    {
        # The model answers with nothing usable. The draft is empty, the
        # validator fills it with findings, and no exception escapes.
        "name": "unparseable-response",
        "book": {"author": "A", "description": "Vorhanden.", "language": "en"},
        "language": "en",
        "responses": [{"content": "I cannot help with that.", "model": ""}],
    },
    {
        # ``model_used`` is sticky: a later reply with an empty model
        # must not blank the one the first attempt reported.
        "name": "empty-model-keeps-the-previous-one",
        "book": {"author": "A", "description": "Vorhanden.", "language": "de"},
        "language": "de",
        "responses": [
            {"content": _ERROR_RESPONSE, "model": "test-model-1"},
            {"content": _ERROR_RESPONSE, "model": ""},
        ],
    },
]
