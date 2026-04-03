"""Tests for style checker module."""

from bibliogon_ms_tools.style_checker import (
    check_filler_words,
    check_passive_voice,
    check_sentence_length,
    check_style,
)


# --- Filler Words ---


def test_filler_words_german():
    text = "Das ist eigentlich ziemlich einfach zu verstehen."
    findings = check_filler_words(text, "de")
    words = {f["word"] for f in findings}
    assert "eigentlich" in words
    assert "ziemlich" in words
    assert "einfach" in words


def test_filler_words_english():
    text = "I basically just want to literally explain this."
    findings = check_filler_words(text, "en")
    words = {f["word"] for f in findings}
    assert "basically" in words
    assert "just" in words
    assert "literally" in words


def test_filler_words_none_found():
    text = "Der Hund lief durch den Park."
    findings = check_filler_words(text, "de")
    assert len(findings) == 0


def test_filler_words_unknown_language_falls_back_to_english():
    text = "This is basically a test."
    findings = check_filler_words(text, "xx")
    words = {f["word"] for f in findings}
    assert "basically" in words


# --- Passive Voice ---


def test_passive_voice_german():
    text = "Das Buch wurde geschrieben. Der Brief wird gesendet."
    findings = check_passive_voice(text, "de")
    assert len(findings) >= 1
    assert all(f["type"] == "passive_voice" for f in findings)


def test_passive_voice_english():
    text = "The book was written by the author. The letter is being sent."
    findings = check_passive_voice(text, "en")
    assert len(findings) >= 1


def test_passive_voice_active_sentence():
    text = "The author wrote the book."
    findings = check_passive_voice(text, "en")
    assert len(findings) == 0


# --- Sentence Length ---


def test_long_sentence_detected():
    # 35 words
    text = (
        "Dies ist ein sehr langer Satz der viel zu viele Woerter enthaelt "
        "und eigentlich aufgeteilt werden sollte weil er den Leser verwirrt "
        "und die Lesbarkeit des Textes deutlich verschlechtert wird dadurch."
    )
    findings = check_sentence_length(text, max_words=30)
    assert len(findings) == 1
    assert findings[0]["type"] == "long_sentence"
    assert findings[0]["word_count"] > 30


def test_short_sentences_ok():
    text = "Kurzer Satz. Noch einer. Alles gut."
    findings = check_sentence_length(text, max_words=30)
    assert len(findings) == 0


def test_sentence_length_custom_limit():
    text = "Ein Satz mit genau zehn Woertern ist hier drin."
    findings = check_sentence_length(text, max_words=5)
    assert len(findings) == 1


# --- Full Style Check ---


def test_check_style_returns_summary():
    text = "Das ist eigentlich ziemlich einfach. Der Brief wurde gesendet."
    result = check_style(text, language="de")
    assert "total_words" in result
    assert "total_sentences" in result
    assert "finding_count" in result
    assert "filler_count" in result
    assert "passive_count" in result
    assert "long_sentence_count" in result
    assert "filler_ratio" in result
    assert "findings" in result
    assert result["filler_count"] >= 2
    assert result["total_sentences"] == 2


def test_check_style_clean_text():
    text = "Der Autor schrieb ein Buch."
    result = check_style(text, language="de")
    assert result["finding_count"] == 0
    assert result["filler_count"] == 0
    assert result["passive_count"] == 0


def test_check_style_empty_text_handling():
    text = "Wort."
    result = check_style(text, language="de")
    assert result["total_words"] == 1


def test_findings_have_required_fields():
    text = "Das ist eigentlich gut."
    result = check_style(text, language="de")
    for finding in result["findings"]:
        assert "type" in finding
        assert "word" in finding
        assert "offset" in finding
        assert "severity" in finding
        assert "message" in finding
        assert "de" in finding["message"]
        assert "en" in finding["message"]
