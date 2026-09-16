"""Tests for the deterministic A+ Content validator (#825).

Runs entirely against the vendored ``ruleset.yaml`` - no AI, no
network, no DB. Every hard rule gets a positive and a negative case
per language; the Kinderbuch escalation gets its own pair proving the
SAME word is only a warning outside that genre.
"""

from __future__ import annotations

import pytest
from bibliogon_aplus.rules import get_ruleset
from bibliogon_aplus.schema import (
    AplusImage,
    AplusMeta,
    AplusPackage,
    Bullet,
    ModuleHeader,
    ThreeImageEntry,
)
from bibliogon_aplus.validation import validate_package

RULES = get_ruleset()


def _meta(language: str = "en") -> AplusMeta:
    return AplusMeta(
        book_id="b1",
        language=language,
        ruleset_version=RULES.version,
        generated_at="2026-09-15T00:00:00Z",
    )


def _package(
    *,
    short_description: str = "A clear, engaging description of the book's premise.",
    bullets: list[Bullet] | None = None,
    header_text: str = "An inviting overview of what the reader will find inside.",
    header_alt: str = "Illustration of the book's theme",
    header_prompt: str = "cinematic, warm lighting, book cover concept",
    three_images: list[ThreeImageEntry] | None = None,
    language: str = "en",
) -> AplusPackage:
    if bullets is None:
        bullets = [
            Bullet(heading="Clear structure", body="Chapters build on each other."),
            Bullet(heading="Real examples", body="Every idea comes with a concrete case."),
            Bullet(heading="Practical takeaways", body="Readers leave with something usable."),
        ]
    if three_images is None:
        three_images = [
            ThreeImageEntry(
                title="Concept one",
                text="A supporting idea from the book.",
                image=AplusImage(prompt="minimalist, flat colors"),
                alt_text="Icon representing concept one",
            ),
            ThreeImageEntry(
                title="Concept two",
                text="Another supporting idea.",
                image=AplusImage(prompt="minimalist, flat colors"),
                alt_text="Icon representing concept two",
            ),
            ThreeImageEntry(
                title="Concept three",
                text="A final supporting idea.",
                image=AplusImage(prompt="minimalist, flat colors"),
                alt_text="Icon representing concept three",
            ),
        ]
    return AplusPackage(
        short_description=short_description,
        bullets=bullets,
        module_header=ModuleHeader(
            title="Overview",
            text=header_text,
            image=AplusImage(prompt=header_prompt),
            alt_text=header_alt,
        ),
        module_three_images=three_images,
        meta=_meta(language),
    )


def _errors(findings) -> list:
    return [f for f in findings if f.severity == "error"]


def _warnings(findings) -> list:
    return [f for f in findings if f.severity == "warning"]


class TestCleanPackagePasses:
    def test_a_well_formed_package_has_no_errors(self) -> None:
        findings = validate_package(_package(), language="en", genre_key=None, rules=RULES)
        assert _errors(findings) == []


class TestDashes:
    def test_em_dash_is_an_error(self) -> None:
        pkg = _package(short_description="A story about hope—and survival.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    def test_en_dash_is_an_error(self) -> None:
        pkg = _package(short_description="Chapters 1–5 cover the setup.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    def test_a_plain_hyphen_is_fine(self) -> None:
        pkg = _package(short_description="A well-paced, character-driven story.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert _errors(findings) == []


class TestEmoji:
    def test_emoji_is_an_error(self) -> None:
        pkg = _package(short_description="An uplifting story of hope \U0001f600.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    def test_plain_text_without_emoji_is_fine(self) -> None:
        pkg = _package(short_description="An uplifting story of hope and change.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert _errors(findings) == []


class TestZeroWidthAndControlChars:
    def test_zero_width_space_is_an_error(self) -> None:
        pkg = _package(short_description="An uplifting​ story of hope.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    def test_hidden_control_character_is_an_error(self) -> None:
        pkg = _package(short_description="An uplifting\x07 story of hope.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    def test_a_normal_newline_in_body_text_is_fine(self) -> None:
        pkg = _package(header_text="Line one.\nLine two continues the thought.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert _errors(findings) == []

    def test_lone_surrogate_is_an_error(self) -> None:
        """Cannot round-trip to UTF-8 - the closest thing to Bibliogon's
        actual encoding boundary once the string is already a Python str."""
        pkg = _package(short_description="Broken text \ud800 here.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))


class TestMarketingImperatives:
    @pytest.mark.parametrize(
        ("language", "phrase"),
        [
            ("de", "Lernen Sie, wie man Tag fuer Tag bessere Entscheidungen trifft."),
            ("en", "Learn how to make better decisions every single day."),
            ("fr", "Apprenez a prendre de meilleures decisions chaque jour."),
            ("es", "Aprenda a tomar mejores decisiones cada dia."),
        ],
    )
    def test_marketing_imperative_is_an_error(self, language: str, phrase: str) -> None:
        pkg = _package(short_description=phrase, language=language)
        findings = validate_package(pkg, language=language, genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    @pytest.mark.parametrize(
        ("language", "phrase"),
        [
            ("de", "Ein Buch ueber die Kraft kleiner Gewohnheiten."),
            ("en", "A book about the power of small habits."),
            ("fr", "Un livre sur le pouvoir des petites habitudes."),
            ("es", "Un libro sobre el poder de los pequenos habitos."),
        ],
    )
    def test_descriptive_prose_without_imperative_is_fine(self, language: str, phrase: str) -> None:
        pkg = _package(short_description=phrase, language=language)
        findings = validate_package(pkg, language=language, genre_key=None, rules=RULES)
        assert _errors(findings) == []

    def test_the_827_report_example_is_now_caught(self) -> None:
        """Regression pin (#828): this exact sentence shipped in #827's
        closing report as a generated example and was NOT flagged -
        "Master" was missing from the EN word list."""
        pkg = _package(
            short_description="Master AI conversations without writing a single line of code.",
            language="en",
        )
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(
            f.field == "short_description" and "Master" in f.message for f in _errors(findings)
        )

    @pytest.mark.parametrize(
        ("language", "phrase"),
        [
            ("de", "Erschliessen Sie neue Perspektiven mit jedem Kapitel."),
            ("en", "Unlock a fresh perspective with every chapter."),
            ("fr", "Debloquez de nouvelles perspectives a chaque chapitre."),
            ("es", "Desbloquee nuevas perspectivas en cada capitulo."),
        ],
    )
    def test_a_newly_added_imperative_word_is_an_error(self, language: str, phrase: str) -> None:
        pkg = _package(short_description=phrase, language=language)
        findings = validate_package(pkg, language=language, genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))


class TestLeadingImperativeHeuristic:
    """A word list can never be exhaustive (#828). German and French
    have imperative morphology a regex can catch even for a verb not
    in the enumerated list; English/Spanish do not, and rely on the
    list alone (documented limitation in validation.py)."""

    def test_an_unlisted_german_verb_opening_with_sie_is_still_caught(self) -> None:
        pkg = _package(
            short_description="Erobern Sie neue Wissensgebiete mit diesem Buch.", language="de"
        )
        findings = validate_package(pkg, language="de", genre_key=None, rules=RULES)
        assert any("Erobern Sie" in f.message for f in _errors(findings))

    def test_german_prose_not_opening_with_an_imperative_is_fine(self) -> None:
        pkg = _package(
            short_description="Dieses Buch begleitet Sie durch vier Jahreszeiten.", language="de"
        )
        findings = validate_package(pkg, language="de", genre_key=None, rules=RULES)
        assert _errors(findings) == []

    def test_an_unlisted_french_vous_form_verb_opening_is_still_caught(self) -> None:
        pkg = _package(short_description="Gagnez en clarte des le premier chapitre.", language="fr")
        findings = validate_package(pkg, language="fr", genre_key=None, rules=RULES)
        assert any("Gagnez" in f.message for f in _errors(findings))

    def test_french_prose_not_opening_with_an_imperative_is_fine(self) -> None:
        pkg = _package(
            short_description="Ce livre explore quatre saisons dans une foret paisible.",
            language="fr",
        )
        findings = validate_package(pkg, language="fr", genre_key=None, rules=RULES)
        assert _errors(findings) == []

    def test_the_french_heuristic_does_not_flag_a_known_non_verb_ez_word(self) -> None:
        pkg = _package(
            short_description="Assez de theorie, ce livre passe directement a la pratique.",
            language="fr",
        )
        findings = validate_package(pkg, language="fr", genre_key=None, rules=RULES)
        assert _errors(findings) == []

    @pytest.mark.parametrize("word", ["Start", "Build", "Get", "Take"])
    def test_a_leading_only_english_word_is_an_error_when_it_opens_the_field(
        self, word: str
    ) -> None:
        """These words are too common to block anywhere in text (see
        the anywhere-match regression this replaced: the shared test
        fixture's own "Chapters build on each other" bullet body was
        a false positive under the original anywhere-match design).
        Opening a field with them is unambiguous, though."""
        pkg = _package(short_description=f"{word} a new habit, one chapter at a time.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    @pytest.mark.parametrize("word", ["start", "build", "get", "take"])
    def test_a_leading_only_word_mid_sentence_is_not_an_error(self, word: str) -> None:
        pkg = _package(short_description=f"Every chapter helps readers {word} lasting confidence.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert _errors(findings) == []

    def test_english_has_no_leading_heuristic_beyond_the_word_list(self) -> None:
        """Documented limitation: an imperative-looking EN verb NOT on
        the list is not caught by a heuristic - only by keeping the
        list current. This pins the documented behavior so a future
        change doesn't silently start (or silently fail to start)
        catching these without an explicit decision."""
        pkg = _package(
            short_description="Conquer every chapter with confidence and curiosity.",
            language="en",
        )
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert _errors(findings) == []


class TestPriceShippingAvailability:
    @pytest.mark.parametrize(
        ("language", "phrase"),
        [
            ("de", "Jetzt kostenlos lesen und sparen."),
            ("en", "Available now with free shipping."),
            ("fr", "Livraison gratuite dans le monde entier."),
            ("es", "Envio gratis a todo el mundo."),
        ],
    )
    def test_price_or_shipping_claim_is_an_error(self, language: str, phrase: str) -> None:
        pkg = _package(short_description=phrase, language=language)
        findings = validate_package(pkg, language=language, genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    def test_prose_about_the_story_itself_is_fine(self) -> None:
        pkg = _package(short_description="The characters travel across three continents.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert _errors(findings) == []


class TestCompetitorBrands:
    def test_a_competitor_brand_reference_is_an_error(self) -> None:
        pkg = _package(short_description="Also available on Kindle Unlimited today.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    def test_no_brand_mention_is_fine(self) -> None:
        pkg = _package(short_description="A quiet, character-driven family drama.")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert _errors(findings) == []


class TestMissingAltText:
    def test_empty_header_alt_text_is_an_error(self) -> None:
        pkg = _package(header_alt="")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "module_header.alt_text" for f in _errors(findings))

    def test_whitespace_only_alt_text_is_an_error(self) -> None:
        pkg = _package(header_alt="   ")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "module_header.alt_text" for f in _errors(findings))

    def test_a_real_alt_text_is_fine(self) -> None:
        pkg = _package(header_alt="A reader immersed in the book's opening scene")
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert not any(f.field == "module_header.alt_text" for f in _errors(findings))


class TestSchemaLengthLimits:
    def test_short_description_at_the_limit_is_fine(self) -> None:
        text = "A" * 300
        pkg = _package(short_description=text)
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert not any(f.field == "short_description" for f in _errors(findings))

    def test_short_description_one_over_the_limit_is_an_error(self) -> None:
        text = "A" * 301
        pkg = _package(short_description=text)
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    def test_bullet_heading_at_the_limit_is_fine(self) -> None:
        pkg = _package(
            bullets=[
                Bullet(heading="H" * 160, body="Body text."),
                Bullet(heading="Two", body="Body text."),
                Bullet(heading="Three", body="Body text."),
            ]
        )
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert not any(f.field == "bullets[0].heading" for f in _errors(findings))

    def test_bullet_heading_one_over_the_limit_is_an_error(self) -> None:
        pkg = _package(
            bullets=[
                Bullet(heading="H" * 161, body="Body text."),
                Bullet(heading="Two", body="Body text."),
                Bullet(heading="Three", body="Body text."),
            ]
        )
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "bullets[0].heading" for f in _errors(findings))

    def test_bullet_body_at_the_limit_is_fine(self) -> None:
        pkg = _package(
            bullets=[
                Bullet(heading="One", body="B" * 1000),
                Bullet(heading="Two", body="Body text."),
                Bullet(heading="Three", body="Body text."),
            ]
        )
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert not any(f.field == "bullets[0].body" for f in _errors(findings))

    def test_bullet_body_one_over_the_limit_is_an_error(self) -> None:
        pkg = _package(
            bullets=[
                Bullet(heading="One", body="B" * 1001),
                Bullet(heading="Two", body="Body text."),
                Bullet(heading="Three", body="Body text."),
            ]
        )
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "bullets[0].body" for f in _errors(findings))

    def test_alt_text_at_the_limit_is_fine(self) -> None:
        pkg = _package(header_alt="A" * 200)
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert not any(f.field == "module_header.alt_text" for f in _errors(findings))

    def test_alt_text_one_over_the_limit_is_an_error(self) -> None:
        pkg = _package(header_alt="A" * 201)
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "module_header.alt_text" for f in _errors(findings))


class TestStructuralCounts:
    def test_fewer_than_three_bullets_is_an_error(self) -> None:
        pkg = _package(
            bullets=[
                Bullet(heading="One", body="Body text."),
                Bullet(heading="Two", body="Body text."),
            ]
        )
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "bullets" for f in _errors(findings))

    def test_fewer_than_three_image_entries_is_an_error(self) -> None:
        pkg = _package(
            three_images=[
                ThreeImageEntry(
                    title="One", text="Text", image=AplusImage(prompt="p"), alt_text="a"
                ),
            ]
        )
        findings = validate_package(pkg, language="en", genre_key=None, rules=RULES)
        assert any(f.field == "module_three_images" for f in _errors(findings))


class TestSoftWordsAndKinderbuchEscalation:
    def test_soft_word_outside_kinderbuch_is_a_warning_not_an_error(self) -> None:
        pkg = _package(short_description="A gripping tale of theft and betrayal in deep space.")
        findings = validate_package(pkg, language="en", genre_key="scifi", rules=RULES)
        assert _errors(findings) == []
        assert any(f.field == "short_description" for f in _warnings(findings))

    def test_the_same_word_is_an_error_when_the_genre_is_kinderbuch(self) -> None:
        pkg = _package(short_description="A gripping tale of theft and betrayal.")
        findings = validate_package(pkg, language="en", genre_key="kinderbuch", rules=RULES)
        assert any(f.field == "short_description" for f in _errors(findings))

    def test_a_word_not_on_the_soft_list_produces_no_finding(self) -> None:
        pkg = _package(short_description="A gentle story about friendship and curiosity.")
        findings = validate_package(pkg, language="en", genre_key="kinderbuch", rules=RULES)
        assert findings == []


class TestUnknownGenreKeyDoesNotCrash:
    def test_an_unrecognised_genre_key_behaves_like_no_genre(self) -> None:
        pkg = _package(short_description="A gripping tale of theft in the outer colonies.")
        findings = validate_package(pkg, language="en", genre_key="totally-unknown", rules=RULES)
        assert _errors(findings) == []
        assert any(f.field == "short_description" for f in _warnings(findings))
