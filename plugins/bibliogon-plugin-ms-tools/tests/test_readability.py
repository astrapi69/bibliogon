"""Tests for readability metrics module."""

from bibliogon_ms_tools.readability import (
    analyze_readability,
    count_syllables,
    count_syllables_text,
    flesch_kincaid_grade,
    flesch_reading_ease,
    reading_time_minutes,
    wiener_sachtextformel,
)


# --- Syllable Counting ---


def test_syllable_count_german():
    assert count_syllables("Haus", "de") == 1
    assert count_syllables("Fenster", "de") == 2
    assert count_syllables("Bibliothek", "de") == 3
    assert count_syllables("Schokolade", "de") == 4


def test_syllable_count_english():
    assert count_syllables("cat", "en") == 1
    assert count_syllables("water", "en") == 2
    assert count_syllables("beautiful", "en") == 3
    assert count_syllables("university", "en") == 5


def test_syllable_count_silent_e_english():
    # "make" should be 1 syllable (silent e)
    assert count_syllables("make", "en") == 1
    assert count_syllables("time", "en") == 1


def test_syllable_count_minimum_one():
    assert count_syllables("x", "en") >= 1
    assert count_syllables("gym", "en") >= 1


def test_syllable_count_empty():
    assert count_syllables("", "de") == 0


def test_count_syllables_text():
    text = "Der Hund lief durch den Park."
    count = count_syllables_text(text, "de")
    assert count >= 6  # each word at least 1 syllable


# --- Flesch Reading Ease ---


def test_flesch_reading_ease_easy_german():
    # Short sentences, simple words -> high score
    text = "Der Hund lief. Die Katze schlief. Es war warm."
    score = flesch_reading_ease(text, "de")
    assert score > 60  # should be easy


def test_flesch_reading_ease_hard_german():
    # Long sentence, complex words -> low score
    text = (
        "Die Implementierung der infrastrukturellen Rahmenbedingungen "
        "erfordert eine umfassende Beruecksichtigung der soziokulturellen "
        "Gegebenheiten und wirtschaftspolitischen Handlungsfelder."
    )
    score = flesch_reading_ease(text, "de")
    assert score < 40  # should be hard


def test_flesch_reading_ease_english():
    text = "The cat sat on the mat. It was a good day."
    score = flesch_reading_ease(text, "en")
    assert score > 60


def test_flesch_reading_ease_empty():
    assert flesch_reading_ease("", "de") == 0.0


# --- Flesch-Kincaid Grade ---


def test_flesch_kincaid_grade_simple():
    text = "The cat sat. The dog ran. It was fun."
    grade = flesch_kincaid_grade(text, "en")
    assert grade < 5  # elementary school level


def test_flesch_kincaid_grade_complex():
    text = (
        "The implementation of comprehensive infrastructure development "
        "requires sophisticated understanding of socioeconomic conditions "
        "and geopolitical considerations affecting regional cooperation."
    )
    grade = flesch_kincaid_grade(text, "en")
    assert grade > 10  # college level


def test_flesch_kincaid_grade_empty():
    assert flesch_kincaid_grade("", "en") == 0.0


# --- Wiener Sachtextformel ---


def test_wiener_sachtextformel_simple_german():
    text = "Der Hund lief. Die Katze schlief. Es war warm."
    score = wiener_sachtextformel(text)
    assert score < 6  # elementary level


def test_wiener_sachtextformel_complex_german():
    text = (
        "Die infrastrukturelle Restrukturierung der Wirtschaftsgemeinschaft "
        "erfordert eine grundlegende Neuausrichtung der ordnungspolitischen "
        "Instrumentarien unter Beruecksichtigung der gesamtwirtschaftlichen Rahmenbedingungen."
    )
    score = wiener_sachtextformel(text)
    assert score > 8  # advanced level


def test_wiener_sachtextformel_empty():
    assert wiener_sachtextformel("") == 0.0


# --- Reading Time ---


def test_reading_time_short():
    text = " ".join(["word"] * 200)  # 200 words
    time = reading_time_minutes(text)
    assert time == 1.0  # 200 words / 200 wpm


def test_reading_time_custom_wpm():
    text = " ".join(["word"] * 300)
    time = reading_time_minutes(text, words_per_minute=150)
    assert time == 2.0


# --- Full Analysis ---


def test_analyze_readability_returns_all_fields():
    text = "Der Hund lief durch den Park. Es war ein schoener Tag."
    result = analyze_readability(text, "de")

    assert "word_count" in result
    assert "sentence_count" in result
    assert "syllable_count" in result
    assert "avg_sentence_length" in result
    assert "avg_syllables_per_word" in result
    assert "flesch_reading_ease" in result
    assert "flesch_kincaid_grade" in result
    assert "difficulty" in result
    assert "difficulty_label" in result
    assert "reading_time_minutes" in result
    assert "wiener_sachtextformel" in result  # German-specific


def test_analyze_readability_english_no_wiener():
    text = "The cat sat on the mat."
    result = analyze_readability(text, "en")
    assert "wiener_sachtextformel" not in result


def test_analyze_readability_difficulty_levels():
    easy = "Der Hund lief. Die Katze schlief. Es war warm."
    result = analyze_readability(easy, "de")
    assert result["difficulty"] in ("easy", "medium", "difficult", "very_difficult")
    assert "de" in result["difficulty_label"]
    assert "en" in result["difficulty_label"]


def test_analyze_readability_word_count():
    text = "Eins zwei drei vier fuenf."
    result = analyze_readability(text, "de")
    assert result["word_count"] == 5
    assert result["sentence_count"] == 1


# --- New metrics fields ---


def test_analyze_includes_char_counts():
    from bibliogon_ms_tools.readability import analyze_readability
    text = "Dies ist ein Satz. Und noch einer."
    result = analyze_readability(text, "de")
    assert "char_count_with_spaces" in result
    assert "char_count_without_spaces" in result
    assert result["char_count_with_spaces"] > result["char_count_without_spaces"]


def test_analyze_includes_paragraph_count():
    from bibliogon_ms_tools.readability import analyze_readability
    text = "Erster Absatz.\n\nZweiter Absatz.\n\nDritter Absatz."
    result = analyze_readability(text, "de")
    assert result["paragraph_count"] == 3


def test_analyze_includes_avg_word_length_chars():
    from bibliogon_ms_tools.readability import analyze_readability
    text = "Das ist ein kurzer Satz."
    result = analyze_readability(text, "de")
    assert "avg_word_length_chars" in result
    assert result["avg_word_length_chars"] > 0


def test_analyze_includes_estimated_pages():
    from bibliogon_ms_tools.readability import analyze_readability
    text = " ".join(["Wort"] * 500)
    result = analyze_readability(text, "de")
    assert result["estimated_pages"] == 2.0  # 500 / 250
