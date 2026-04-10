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


# --- Word Repetitions ---

from bibliogon_ms_tools.style_checker import (
    check_word_repetitions,
    check_adverbs,
    check_redundant_phrases,
)


def test_repetition_detected_within_window():
    text = "Der Baum stand am Weg. Der Baum war gross."
    findings = check_word_repetitions(text, "de", window=20)
    words = [f["word"] for f in findings]
    assert "baum" in words


def test_repetition_not_detected_outside_window():
    words = " ".join(["wort"] + ["filler"] * 60 + ["wort"])
    findings = check_word_repetitions(words, "de", window=50)
    assert not any(f["word"] == "wort" for f in findings)


def test_repetition_ignores_stop_words():
    text = "Der Mann ging. Der Mann kam."
    findings = check_word_repetitions(text, "de", window=20)
    words = [f["word"] for f in findings]
    assert "der" not in words
    assert "mann" in words


def test_repetition_short_words_ignored():
    text = "Es ist so. Es ist so."
    findings = check_word_repetitions(text, "de", window=20)
    # "es", "so" are < 3 chars or stop words
    assert len(findings) == 0


# --- Adverbs ---


def test_adverb_german_lich():
    text = "Er sprach freundlich und hoeflich."
    findings = check_adverbs(text, "de")
    words = [f["word"] for f in findings]
    assert "freundlich" in words
    assert "hoeflich" in words


def test_adverb_english_ly():
    text = "She quickly and carefully opened the door."
    findings = check_adverbs(text, "en")
    words = [f["word"] for f in findings]
    assert "quickly" in words
    assert "carefully" in words


def test_adverb_ignores_short_words():
    text = "The fly sat on the wall."
    findings = check_adverbs(text, "en")
    # "fly" ends in -ly but is too short (3 chars, suffix is 2)
    assert not any(f["word"] == "fly" for f in findings)


# --- Redundant Phrases ---


def test_redundant_phrase_german():
    text = "Das ist meine persoenliche Meinung zu dem Thema."
    findings = check_redundant_phrases(text, "de")
    assert len(findings) == 1
    assert findings[0]["suggestion"] == "Meinung"


def test_redundant_phrase_english():
    text = "We need advance planning for future plans."
    findings = check_redundant_phrases(text, "en")
    phrases = [f["word"] for f in findings]
    assert "advance planning" in phrases
    assert "future plans" in phrases


def test_no_false_positive_on_clean_text():
    text = "Die Planung war erfolgreich abgeschlossen."
    findings = check_redundant_phrases(text, "de")
    assert len(findings) == 0


# --- check_style integration ---


def test_check_style_includes_new_checks():
    text = "Er sprach freundlich. Die persoenliche Meinung war klar. Der Baum stand dort. Der Baum war gross."
    result = check_style(text, "de")
    assert "repetition_count" in result
    assert "adverb_count" in result
    assert "redundant_phrase_count" in result
    assert "passive_ratio" in result
    assert "adverb_ratio" in result


def test_default_sentence_length_is_25():
    """The doc says 25, not 30."""
    from bibliogon_ms_tools.style_checker import DEFAULT_MAX_SENTENCE_LENGTH
    assert DEFAULT_MAX_SENTENCE_LENGTH == 25


# --- Allowlist ---

from bibliogon_ms_tools.style_checker import _filter_allowlist, _allowlist_cache


def test_allowlist_filters_matching_findings():
    _allowlist_cache["de"] = {"eigentlich", "quasi"}
    findings = [
        {"type": "filler_word", "word": "eigentlich"},
        {"type": "filler_word", "word": "wirklich"},
        {"type": "filler_word", "word": "quasi"},
    ]
    filtered = _filter_allowlist(findings, "de")
    assert len(filtered) == 1
    assert filtered[0]["word"] == "wirklich"
    _allowlist_cache.clear()


def test_allowlist_empty_returns_all():
    _allowlist_cache["en"] = set()
    findings = [{"type": "filler_word", "word": "actually"}]
    filtered = _filter_allowlist(findings, "en")
    assert len(filtered) == 1
    _allowlist_cache.clear()


def test_allowlist_case_insensitive():
    _allowlist_cache["de"] = {"eigentlich"}
    findings = [{"type": "filler_word", "word": "Eigentlich"}]
    filtered = _filter_allowlist(findings, "de")
    assert len(filtered) == 0
    _allowlist_cache.clear()
