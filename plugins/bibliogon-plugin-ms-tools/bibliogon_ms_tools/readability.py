"""Readability metrics: Flesch-Kincaid, Flesch Reading Ease, and more."""

import re

# Vowel patterns for syllable counting per language
VOWEL_GROUPS: dict[str, re.Pattern] = {
    "de": re.compile(r"[aeiouyäöü]+", re.I),
    "en": re.compile(r"[aeiouy]+", re.I),
    "es": re.compile(r"[aeiouáéíóúü]+", re.I),
    "fr": re.compile(r"[aeiouyàâéèêëïîôùûü]+", re.I),
    "el": re.compile(r"[αεηιοουωάέήίόύώϊϋΐΰ]+", re.I),
}


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return [s.strip() for s in sentences if s.strip()]


def _split_words(text: str) -> list[str]:
    """Split text into words."""
    return [w for w in re.findall(r"\b\w+\b", text) if len(w) > 0]


def count_syllables(word: str, language: str = "de") -> int:
    """Count syllables in a word using vowel group heuristic.

    This is an approximation. For German, silent-e and diphthong rules
    are simplified. For English, trailing silent-e is handled.
    """
    word = word.lower().strip()
    if not word:
        return 0

    pattern = VOWEL_GROUPS.get(language, VOWEL_GROUPS.get("en"))
    groups = pattern.findall(word)
    count = len(groups)

    if language == "en":
        # Trailing silent-e (e.g. "make", "time") but not "be", "the"
        if word.endswith("e") and count > 1:
            count -= 1
        # -le at end counts as syllable if preceded by consonant
        if word.endswith("le") and len(word) > 2 and word[-3] not in "aeiouy":
            count += 1
        # -ed at end usually not a syllable unless preceded by t/d
        if word.endswith("ed") and count > 1 and word[-3] not in "td":
            count -= 1

    # Every word has at least one syllable
    return max(1, count)


def count_syllables_text(text: str, language: str = "de") -> int:
    """Count total syllables in text."""
    words = _split_words(text)
    return sum(count_syllables(w, language) for w in words)


def flesch_reading_ease(text: str, language: str = "de") -> float:
    """Calculate Flesch Reading Ease score.

    Uses language-specific coefficients where available.
    Higher = easier to read. Scale: 0 (very hard) to 100+ (very easy).

    Coefficients:
    - EN: 206.835 - 1.015 * ASL - 84.6 * ASW (original Flesch)
    - DE: 180.0 - 1.0 * ASL - 58.5 * ASW (Amstad adaptation)
    - ES: 206.835 - 1.02 * ASL - 60.0 * ASW (Fernandez-Huerta)
    - FR: 207.0 - 1.015 * ASL - 73.6 * ASW (Kandel-Moles)
    """
    sentences = _split_sentences(text)
    words = _split_words(text)
    if not sentences or not words:
        return 0.0

    total_syllables = count_syllables_text(text, language)
    asl = len(words) / len(sentences)  # average sentence length
    asw = total_syllables / len(words)  # average syllables per word

    # Language-specific coefficients
    coefficients = {
        "en": (206.835, 1.015, 84.6),
        "de": (180.0, 1.0, 58.5),
        "es": (206.835, 1.02, 60.0),
        "fr": (207.0, 1.015, 73.6),
    }
    base, c_asl, c_asw = coefficients.get(language, coefficients["en"])

    score = base - (c_asl * asl) - (c_asw * asw)
    return round(score, 2)


def flesch_kincaid_grade(text: str, language: str = "en") -> float:
    """Calculate Flesch-Kincaid Grade Level.

    Returns US school grade level needed to understand the text.
    Lower = easier. Typically 1-12 for general text, higher for academic.
    """
    sentences = _split_sentences(text)
    words = _split_words(text)
    if not sentences or not words:
        return 0.0

    total_syllables = count_syllables_text(text, language)
    asl = len(words) / len(sentences)
    asw = total_syllables / len(words)

    grade = 0.39 * asl + 11.8 * asw - 15.59
    return round(max(0, grade), 2)


def wiener_sachtextformel(text: str) -> float:
    """Calculate Wiener Sachtextformel (Vienna factual text formula).

    Designed specifically for German texts. Returns school grade level (1-15).
    Uses the first variant (WSTF 1).
    """
    sentences = _split_sentences(text)
    words = _split_words(text)
    if not sentences or not words:
        return 0.0

    total_syllables = count_syllables_text(text, "de")
    n_words = len(words)
    n_sentences = len(sentences)

    # Count words with 3+ syllables (long words percentage)
    long_words = sum(1 for w in words if count_syllables(w, "de") >= 3)
    # Count single-syllable words
    short_words = sum(1 for w in words if count_syllables(w, "de") == 1)

    ms = long_words / n_words * 100  # percentage of long words
    sl = n_words / n_sentences  # average sentence length
    iw = short_words / n_words * 100  # percentage of short words
    es = total_syllables / n_words  # average syllables per word

    # WSTF 1
    score = 0.1935 * ms + 0.1672 * sl + 0.1297 * es - 0.0327 * iw - 0.875
    return round(max(0, score), 2)


def reading_time_minutes(text: str, words_per_minute: int = 200) -> float:
    """Estimate reading time in minutes."""
    words = _split_words(text)
    return round(len(words) / words_per_minute, 1)


def analyze_readability(text: str, language: str = "de") -> dict:
    """Run all readability analyses on text.

    Returns comprehensive readability report.
    """
    sentences = _split_sentences(text)
    words = _split_words(text)
    total_syllables = count_syllables_text(text, language)

    n_words = len(words)
    n_sentences = len(sentences)
    n_syllables = total_syllables

    avg_sentence_length = round(n_words / n_sentences, 1) if n_sentences > 0 else 0
    avg_syllables_per_word = round(n_syllables / n_words, 2) if n_words > 0 else 0

    fre = flesch_reading_ease(text, language)
    fkg = flesch_kincaid_grade(text, language)

    # Interpret Flesch Reading Ease score
    if fre >= 80:
        difficulty = "easy"
        difficulty_label = {"de": "Leicht", "en": "Easy"}
    elif fre >= 60:
        difficulty = "medium"
        difficulty_label = {"de": "Mittel", "en": "Medium"}
    elif fre >= 40:
        difficulty = "difficult"
        difficulty_label = {"de": "Schwer", "en": "Difficult"}
    else:
        difficulty = "very_difficult"
        difficulty_label = {"de": "Sehr schwer", "en": "Very difficult"}

    result = {
        "word_count": n_words,
        "sentence_count": n_sentences,
        "syllable_count": n_syllables,
        "avg_sentence_length": avg_sentence_length,
        "avg_syllables_per_word": avg_syllables_per_word,
        "flesch_reading_ease": fre,
        "flesch_kincaid_grade": fkg,
        "difficulty": difficulty,
        "difficulty_label": difficulty_label,
        "reading_time_minutes": reading_time_minutes(text),
    }

    # Add German-specific metric
    if language == "de":
        result["wiener_sachtextformel"] = wiener_sachtextformel(text)

    return result
