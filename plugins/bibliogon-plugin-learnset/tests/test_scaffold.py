"""Unit tests for the Phase-1 learnset scaffold (#763).

Covers slug rules (engine#105 SlugId contract), chapter skipping,
manifest shape (content-manifest 1.6 required fields incl. per-set
version + lesson_count + the engine#769 book block), the
one-theory-step-per-lesson rule (lesson.steps minItems=1), and the
end-to-end validation of every generated artifact through the
engine's sanctioned validator (vendored lce_schema, engine#115).
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import yaml
from bibliogon_learnset.scaffold import (
    DEFAULT_SKIP_CHAPTER_TYPES,
    ENGINE_VERSION,
    ChapterInput,
    build_lessons,
    build_manifest,
    build_scaffold_zip,
    estimate_minutes,
    slugify_ascii,
)
from bibliogon_learnset.validation import validate_lesson, validate_manifest


class BookStub:
    def __init__(self, **kwargs: object) -> None:
        self.title = "Biologische Souveränität"
        self.description = "Ein Buch über CRISPR."
        self.language = "de"
        self.author = "Asterios Raptis"
        self.asin_ebook = "B0GSG1CNWF"
        for key, val in kwargs.items():
            setattr(self, key, val)


def chapter(title: str, text: str = "Ein Satz.", chapter_type: str = "chapter") -> ChapterInput:
    return ChapterInput(title=title, chapter_type=chapter_type, markdown=text)


class TestSlug:
    def test_german_umlauts_transliterate_to_ascii(self) -> None:
        assert slugify_ascii("Biologische Souveränität") == "biologische-souveranitat"

    def test_slug_matches_engine_slugid_contract(self) -> None:
        for raw in ("Kapitel 1: Die Schere!", "  --Weird__Title--  ", "L'Éternité façonnable"):
            slug = slugify_ascii(raw)
            assert slug
            assert slug == slug.lower()
            assert not slug.startswith("-") and not slug.endswith("-")
            assert "--" not in slug and "_" not in slug and " " not in slug


class TestLessons:
    def test_one_lesson_per_content_chapter_ordered_with_nn_prefix(self) -> None:
        lessons = build_lessons(
            [
                chapter("Einleitung"),
                chapter("Die Schere"),
                chapter("Impressum", chapter_type="imprint"),
            ],
            language="de",
        )
        assert [lesson["id"] for lesson in lessons] == ["01-einleitung", "02-die-schere"]

    def test_skip_list_defaults_cover_front_and_back_matter(self) -> None:
        assert {"toc", "imprint", "copyright", "call_to_action"} <= DEFAULT_SKIP_CHAPTER_TYPES
        assert "chapter" not in DEFAULT_SKIP_CHAPTER_TYPES

    def test_lesson_carries_one_theory_step_with_chapter_markdown(self) -> None:
        lessons = build_lessons(
            [chapter("Einleitung", text="# Intro\n\nText hier.")], language="de"
        )
        steps = lessons[0]["steps"]
        assert len(steps) == 1
        assert steps[0]["type"] == "theory"
        assert "Text hier." in steps[0]["body"]

    def test_estimate_minutes_floor_one(self) -> None:
        assert estimate_minutes(1) == 1
        assert estimate_minutes(400) == 2

    def test_a_long_or_duplicated_title_produces_an_id_within_the_schema_cap(self) -> None:
        """Real production failure: a chapter titled 'Teil 4: Der digitale
        Geist - KI, Unsterblichkeit, die Zukunft der Realitaet - Teil 4:
        Der digitale Geist - KI, Unsterblichkeit, die Zukunft der
        Realitaet' (the author's title, verbatim) slugified past the
        engine's 120-char SlugId cap and the export failed with
        'Generated learnset failed schema validation'."""
        long_title = (
            "Teil 4: Der digitale Geist - KI, Unsterblichkeit, die Zukunft der "
            "Realitaet - Teil 4: Der digitale Geist - KI, Unsterblichkeit, "
            "die Zukunft der Realitaet"
        )
        lessons = build_lessons([chapter(long_title)], language="de")
        assert len(lessons[0]["id"]) <= 120

    def test_the_capped_id_still_matches_the_engine_slugid_pattern(self) -> None:
        """Truncation must not leave a dangling hyphen or an empty
        segment - both violate SlugId's pattern."""
        long_title = "Ein-" * 60 + "Titel"
        lessons = build_lessons([chapter(long_title)], language="de")
        lesson_id = lessons[0]["id"]
        assert not lesson_id.endswith("-")
        assert "--" not in lesson_id

    def test_truncation_keeps_the_ids_of_two_over_long_chapters_distinct(self) -> None:
        """The NN- position prefix already disambiguates, but the test
        pins it explicitly - a naive truncate-and-hope approach could
        still collide if the prefix were ever dropped."""
        long_title = "Ein-" * 60 + "Titel"
        lessons = build_lessons(
            [chapter(long_title, text="Erstes."), chapter(long_title, text="Zweites.")],
            language="de",
        )
        assert lessons[0]["id"] != lessons[1]["id"]

    def test_a_normal_length_title_is_not_truncated(self) -> None:
        lessons = build_lessons([chapter("Kurzer Titel")], language="de")
        assert lessons[0]["id"] == "01-kurzer-titel"


class TestManifest:
    def test_manifest_carries_required_set_fields_and_book_block(self) -> None:
        lessons = build_lessons([chapter("Einleitung")], language="de")
        manifest = build_manifest(BookStub(), lessons)
        content_set = manifest["sets"][0]
        assert manifest["schema_version"] == "1.6"
        assert content_set["id"] == "biologische-souveranitat"
        assert content_set["level"] == "none"
        assert content_set["version"] == "1.0.0"
        assert content_set["lesson_count"] == 1
        assert content_set["book"]["title"] == "Biologische Souveränität"
        assert content_set["book"]["asin"] == "B0GSG1CNWF"


class TestValidation:
    def test_generated_artifacts_pass_the_engine_validator(self) -> None:
        lessons = build_lessons(
            [chapter("Einleitung"), chapter("Die Schere", text="## Abschnitt\n\nMehr Text.")],
            language="de",
        )
        manifest = build_manifest(BookStub(), lessons)
        assert validate_manifest(manifest) == []
        for lesson in lessons:
            assert validate_lesson(lesson) == []

    def test_validator_rejects_bad_slug(self) -> None:
        lessons = build_lessons([chapter("Einleitung")], language="de")
        lessons[0]["id"] = "Bad_Slug"
        errors = validate_lesson(lessons[0])
        assert errors and any("id" in error for error in errors)


class TestZip:
    def test_zip_layout_matches_alc_convention(self) -> None:
        book = BookStub()
        zip_bytes = build_scaffold_zip(
            book,
            [chapter("Einleitung"), chapter("Die Schere")],
        )
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
        names = sorted(archive.namelist())
        base = "sets/de/biologische-souveranitat"
        assert f"{base}/manifest.yaml" in names
        assert f"{base}/lessons/01-einleitung.json" in names
        assert f"{base}/lessons/02-die-schere.json" in names
        manifest = yaml.safe_load(archive.read(f"{base}/manifest.yaml"))
        assert manifest["sets"][0]["lesson_count"] == 2
        lesson = json.loads(archive.read(f"{base}/lessons/01-einleitung.json"))
        assert lesson["steps"][0]["type"] == "theory"


class TestEngineVersionStamp:
    """The export must say which engine/schema version produced it -
    the vendored copies can drift from upstream, and a set committed
    into an alc-* repo outlives the session that produced it (#775)."""

    def test_manifest_records_the_engine_and_schema_version(self) -> None:
        lessons = build_lessons([chapter("Einleitung")], language="de")
        manifest = build_manifest(BookStub(), lessons)
        metadata = manifest["metadata"]
        assert metadata["engine_version"] == ENGINE_VERSION
        assert "bibliogon" in metadata["generated_by"].lower()
        assert metadata["schema_version"] == "1.6"

    def test_stamped_manifest_still_validates(self) -> None:
        lessons = build_lessons([chapter("Einleitung")], language="de")
        assert validate_manifest(build_manifest(BookStub(), lessons)) == []

    def test_engine_version_comes_from_the_vendored_pin(self) -> None:
        pinned = (
            Path(__file__).resolve().parent.parent
            / "bibliogon_learnset"
            / "vendor"
            / "engine-version.txt"
        )
        assert ENGINE_VERSION == pinned.read_text(encoding="utf-8").strip()


class TestBookBlockAsin:
    """Each translation variant is its own Book row, so each must export
    its own ASIN - and a book without one must stay valid (#775)."""

    def test_each_variant_exports_its_own_asin(self) -> None:
        de_manifest = build_manifest(
            BookStub(title="Deutsche Fassung", asin_ebook="B0DE00001"),
            build_lessons([chapter("Kapitel")], language="de"),
        )
        en_manifest = build_manifest(
            BookStub(title="English Edition", asin_ebook="B0EN00002"),
            build_lessons([chapter("Chapter")], language="en"),
        )
        assert de_manifest["sets"][0]["book"]["asin"] == "B0DE00001"
        assert en_manifest["sets"][0]["book"]["asin"] == "B0EN00002"

    def test_book_without_asin_stays_schema_valid(self) -> None:
        lessons = build_lessons([chapter("Kapitel")], language="de")
        manifest = build_manifest(BookStub(asin_ebook=None), lessons)
        assert manifest["sets"][0]["book"]["asin"] is None
        assert validate_manifest(manifest) == []

    def test_book_block_survives_a_missing_attribute(self) -> None:
        class Minimal:
            title = "Ohne Felder"
            language = "de"
            author = "Autor"

        manifest = build_manifest(Minimal(), build_lessons([chapter("K")], language="de"))
        assert manifest["sets"][0]["book"]["asin"] is None
        assert validate_manifest(manifest) == []
