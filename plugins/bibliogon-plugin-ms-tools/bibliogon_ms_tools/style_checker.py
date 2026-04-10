"""Style checker: detects filler words, passive voice, long sentences,
word repetitions, adverbs, and redundant phrases."""

import logging
import re
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

# Directory containing per-language YAML filler word lists.
# Users can edit these files to add/remove words.
_FILLERS_DIR = Path(__file__).resolve().parent.parent / "content" / "fillers"

# Hardcoded fallback (used when YAML files are missing or unreadable)
_FALLBACK_FILLERS: dict[str, list[str]] = {
    "de": [
        "eigentlich", "sozusagen", "quasi", "irgendwie", "gewissermaßen",
        "grundsätzlich", "im Grunde", "im Prinzip", "halt", "eben",
        "einfach", "wirklich", "ziemlich", "relativ", "durchaus",
        "natürlich", "selbstverständlich", "offensichtlich", "offenbar",
        "ja", "nun", "also", "jedenfalls", "übrigens", "bekanntlich",
        "naja", "tja", "sicherlich", "gewiss", "freilich",
    ],
    "en": [
        "actually", "basically", "essentially", "literally", "virtually",
        "really", "very", "quite", "rather", "somewhat",
        "just", "simply", "honestly", "frankly", "obviously",
        "clearly", "definitely", "certainly", "surely", "perhaps",
        "kind of", "sort of", "you know", "I mean", "in fact",
        "as a matter of fact", "to be honest", "needless to say",
    ],
}

# Cache: loaded once per process, cleared on reload
_filler_cache: dict[str, list[str]] = {}


def _load_fillers(language: str) -> list[str]:
    """Load filler words for a language from YAML, with fallback."""
    if language in _filler_cache:
        return _filler_cache[language]

    yaml_path = _FILLERS_DIR / f"{language}.yaml"
    if yaml_path.exists():
        try:
            data = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                _filler_cache[language] = [str(w) for w in data if w]
                return _filler_cache[language]
        except (yaml.YAMLError, OSError) as e:
            logger.warning("Failed to load filler list for %s: %s", language, e)

    # Fallback to hardcoded
    fallback = _FALLBACK_FILLERS.get(language, _FALLBACK_FILLERS.get("en", []))
    _filler_cache[language] = fallback
    return fallback


# Public alias for backward compatibility (tests import this)
FILLER_WORDS = _FALLBACK_FILLERS


# ---------------------------------------------------------------------------
# Allowlist: terms the user wants excluded from ALL checks
# ---------------------------------------------------------------------------

_ALLOWLIST_DIR = Path(__file__).resolve().parent.parent / "content" / "allowlist"
_allowlist_cache: dict[str, set[str]] = {}


def _load_allowlist(language: str) -> set[str]:
    """Load the user's allowlist for a language from YAML."""
    if language in _allowlist_cache:
        return _allowlist_cache[language]

    yaml_path = _ALLOWLIST_DIR / f"{language}.yaml"
    if yaml_path.exists():
        try:
            data = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                result = {str(w).lower() for w in data if w}
                _allowlist_cache[language] = result
                return result
        except (yaml.YAMLError, OSError) as e:
            logger.warning("Failed to load allowlist for %s: %s", language, e)

    _allowlist_cache[language] = set()
    return set()


def _filter_allowlist(findings: list[dict], language: str) -> list[dict]:
    """Remove findings whose word/phrase is in the user's allowlist."""
    allowlist = _load_allowlist(language)
    if not allowlist:
        return findings
    return [f for f in findings if f.get("word", "").lower() not in allowlist]

# Passive voice indicators per language
PASSIVE_PATTERNS: dict[str, list[re.Pattern]] = {
    "de": [
        re.compile(r"\b(wird|werden|wurde|wurden|worden|werde|wirst|werdet)\b\s+\w+[t]\b", re.I),
        re.compile(r"\b(ist|sind|war|waren)\b\s+\w+(t|en)\s+worden\b", re.I),
    ],
    "en": [
        re.compile(
            r"\b(is|are|was|were|been|being|be)\b\s+"
            r"(\w+\s+)?"
            r"(written|taken|made|done|seen|given|told|found|known|called|used|said|asked|"
            r"built|held|kept|left|lost|paid|read|run|set|shown|thought|understood|won|"
            r"\w+ed)\b",
            re.I,
        ),
    ],
}

# Redundant phrases per language (conservative list)
REDUNDANT_PHRASES: dict[str, list[tuple[str, str]]] = {
    "de": [
        ("persoenliche Meinung", "Meinung"),
        ("zukuenftige Plaene", "Plaene"),
        ("kurze Zusammenfassung", "Zusammenfassung"),
        ("komplett fertig", "fertig"),
        ("voellig ueberfluessig", "ueberfluessig"),
        ("bereits schon", "bereits"),
        ("nochmals wieder", "nochmals"),
        ("gemeinsam zusammen", "gemeinsam"),
        ("einzelne Details", "Details"),
        ("neue Innovation", "Innovation"),
        ("freies Geschenk", "Geschenk"),
        ("aktuelle Gegenwart", "Gegenwart"),
        ("runde Form", "Form"),
        ("weiter fortsetzen", "fortsetzen"),
        ("vorher planen", "planen"),
    ],
    "en": [
        ("personal opinion", "opinion"),
        ("future plans", "plans"),
        ("brief summary", "summary"),
        ("completely finished", "finished"),
        ("absolutely essential", "essential"),
        ("advance planning", "planning"),
        ("added bonus", "bonus"),
        ("end result", "result"),
        ("free gift", "gift"),
        ("past history", "history"),
        ("new innovation", "innovation"),
        ("completely eliminate", "eliminate"),
        ("each and every", "each"),
        ("basic fundamentals", "fundamentals"),
        ("close proximity", "proximity"),
    ],
}

# Adverb suffixes per language
ADVERB_SUFFIXES: dict[str, list[str]] = {
    "de": ["lich", "weise", "falls", "lings", "waerts"],
    "en": ["ly"],
    "es": ["mente"],
    "fr": ["ment"],
}

# Stop words excluded from repetition detection
STOP_WORDS: dict[str, set[str]] = {
    "de": {
        "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer",
        "einem", "einen", "und", "oder", "aber", "ist", "sind", "war",
        "hat", "haben", "wird", "werden", "nicht", "sich", "mit", "auf",
        "fuer", "von", "zu", "an", "in", "aus", "bei", "nach", "vor",
        "um", "als", "wie", "wenn", "dass", "es", "er", "sie", "ich",
        "du", "wir", "ihr", "man", "so", "da", "noch", "schon", "auch",
    },
    "en": {
        "the", "a", "an", "and", "or", "but", "is", "are", "was", "were",
        "has", "have", "had", "will", "would", "not", "with", "for", "of",
        "to", "at", "in", "on", "from", "by", "as", "if", "that", "it",
        "he", "she", "we", "they", "you", "i", "this", "be", "do", "so",
    },
}

# Default thresholds
DEFAULT_MAX_SENTENCE_LENGTH = 25  # words (was 30, doc says 25)
DEFAULT_MAX_FILLER_RATIO = 0.05  # 5% of total words
DEFAULT_REPETITION_WINDOW = 50  # words


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip()]


def _word_count(text: str) -> int:
    """Count words in text."""
    return len(text.split())


def _split_words(text: str) -> list[str]:
    """Split text into individual words."""
    return re.findall(r"\b\w+\b", text)


def check_filler_words(text: str, language: str = "de") -> list[dict]:
    """Find filler words in text.

    Loads the word list from content/fillers/{language}.yaml if
    available, falling back to the hardcoded list otherwise.
    """
    fillers = _load_fillers(language)
    findings: list[dict] = []

    text_lower = text.lower()
    for filler in fillers:
        pattern = re.compile(r"\b" + re.escape(filler) + r"\b", re.I)
        for match in pattern.finditer(text_lower):
            findings.append({
                "type": "filler_word",
                "word": filler,
                "offset": match.start(),
                "length": len(filler),
                "severity": "info",
                "message": {
                    "de": f"Fuellwort '{filler}' - kann oft gestrichen werden.",
                    "en": f"Filler word '{filler}' - consider removing.",
                },
            })

    return findings


def check_passive_voice(text: str, language: str = "de") -> list[dict]:
    """Detect passive voice constructions."""
    patterns = PASSIVE_PATTERNS.get(language, PASSIVE_PATTERNS.get("en", []))
    findings: list[dict] = []

    for pattern in patterns:
        for match in pattern.finditer(text):
            findings.append({
                "type": "passive_voice",
                "word": match.group(),
                "offset": match.start(),
                "length": len(match.group()),
                "severity": "warning",
                "message": {
                    "de": f"Passiv-Konstruktion: '{match.group()}' - aktive Formulierung bevorzugen.",
                    "en": f"Passive voice: '{match.group()}' - prefer active voice.",
                },
            })

    return findings


def check_sentence_length(
    text: str, max_words: int = DEFAULT_MAX_SENTENCE_LENGTH
) -> list[dict]:
    """Find sentences that exceed the word limit."""
    sentences = _split_sentences(text)
    findings: list[dict] = []

    offset = 0
    for sentence in sentences:
        wc = _word_count(sentence)
        idx = text.find(sentence, offset)
        if idx == -1:
            idx = offset

        if wc > max_words:
            findings.append({
                "type": "long_sentence",
                "word": sentence[:80] + ("..." if len(sentence) > 80 else ""),
                "offset": idx,
                "length": len(sentence),
                "word_count": wc,
                "max_words": max_words,
                "severity": "warning",
                "message": {
                    "de": f"Satz mit {wc} Woertern (Maximum: {max_words}) - kuerzen oder aufteilen.",
                    "en": f"Sentence with {wc} words (max: {max_words}) - consider splitting.",
                },
            })

        offset = idx + len(sentence)

    return findings


def check_word_repetitions(
    text: str, language: str = "de", window: int = DEFAULT_REPETITION_WINDOW,
) -> list[dict]:
    """Find words that repeat within a sliding window.

    Stop words (der, die, das, and, the, ...) are excluded.
    """
    words = _split_words(text)
    stop = STOP_WORDS.get(language, STOP_WORDS.get("en", set()))
    findings: list[dict] = []
    seen: dict[str, int] = {}  # word -> last position in words list

    for i, raw_word in enumerate(words):
        word = raw_word.lower()
        if len(word) < 3 or word in stop:
            continue
        if word in seen and (i - seen[word]) <= window:
            # Find offset in original text for the second occurrence
            offset = 0
            for j in range(i):
                offset = text.find(words[j], offset) + len(words[j])
            actual_offset = text.find(raw_word, offset)
            if actual_offset == -1:
                actual_offset = offset

            findings.append({
                "type": "word_repetition",
                "word": word,
                "offset": actual_offset,
                "length": len(word),
                "distance": i - seen[word],
                "severity": "info",
                "message": {
                    "de": f"Wortwiederholung '{word}' (Abstand: {i - seen[word]} Woerter).",
                    "en": f"Word repetition '{word}' ({i - seen[word]} words apart).",
                },
            })
        seen[word] = i

    return findings


def check_adverbs(text: str, language: str = "de") -> list[dict]:
    """Detect adverbs by suffix (-ly, -lich, -ment, -mente).

    Helps identify weak verb+adverb combinations that could be
    replaced by a stronger verb.
    """
    suffixes = ADVERB_SUFFIXES.get(language, ADVERB_SUFFIXES.get("en", ["ly"]))
    findings: list[dict] = []

    for match in re.finditer(r"\b(\w+)\b", text):
        word = match.group(1)
        if len(word) < 4:
            continue
        word_lower = word.lower()
        for suffix in suffixes:
            if word_lower.endswith(suffix) and len(word_lower) > len(suffix) + 1:
                findings.append({
                    "type": "adverb",
                    "word": word,
                    "offset": match.start(),
                    "length": len(word),
                    "severity": "info",
                    "message": {
                        "de": f"Adverb '{word}' - staerkeres Verb statt Adverb+schwaches Verb?",
                        "en": f"Adverb '{word}' - consider a stronger verb instead.",
                    },
                })
                break

    return findings


def check_redundant_phrases(text: str, language: str = "de") -> list[dict]:
    """Detect redundant phrases that can be shortened."""
    phrases = REDUNDANT_PHRASES.get(language, REDUNDANT_PHRASES.get("en", []))
    findings: list[dict] = []

    for phrase, suggestion in phrases:
        pattern = re.compile(r"\b" + re.escape(phrase) + r"\b", re.I)
        for match in pattern.finditer(text):
            findings.append({
                "type": "redundant_phrase",
                "word": phrase,
                "offset": match.start(),
                "length": len(phrase),
                "suggestion": suggestion,
                "severity": "info",
                "message": {
                    "de": f"Redundant: '{phrase}' - '{suggestion}' reicht.",
                    "en": f"Redundant: '{phrase}' - '{suggestion}' is sufficient.",
                },
            })

    return findings


def check_style(
    text: str,
    language: str = "de",
    max_sentence_length: int = DEFAULT_MAX_SENTENCE_LENGTH,
    repetition_window: int = DEFAULT_REPETITION_WINDOW,
) -> dict:
    """Run all style checks on text.

    Returns summary with findings grouped by type.
    """
    findings: list[dict] = []
    findings.extend(check_filler_words(text, language))
    findings.extend(check_passive_voice(text, language))
    findings.extend(check_sentence_length(text, max_sentence_length))
    findings.extend(check_word_repetitions(text, language, repetition_window))
    findings.extend(check_adverbs(text, language))
    findings.extend(check_redundant_phrases(text, language))

    # Apply user allowlist: remove findings for explicitly excluded terms
    findings = _filter_allowlist(findings, language)

    total_words = _word_count(text)
    total_sentences = len(_split_sentences(text))
    filler_count = sum(1 for f in findings if f["type"] == "filler_word")
    passive_count = sum(1 for f in findings if f["type"] == "passive_voice")
    adverb_count = sum(1 for f in findings if f["type"] == "adverb")

    return {
        "total_words": total_words,
        "total_sentences": total_sentences,
        "finding_count": len(findings),
        "filler_count": filler_count,
        "passive_count": passive_count,
        "long_sentence_count": sum(1 for f in findings if f["type"] == "long_sentence"),
        "repetition_count": sum(1 for f in findings if f["type"] == "word_repetition"),
        "adverb_count": adverb_count,
        "redundant_phrase_count": sum(1 for f in findings if f["type"] == "redundant_phrase"),
        "filler_ratio": round(filler_count / total_words, 4) if total_words > 0 else 0,
        "passive_ratio": round(passive_count / total_sentences, 4) if total_sentences > 0 else 0,
        "adverb_ratio": round(adverb_count / total_words, 4) if total_words > 0 else 0,
        "findings": findings,
    }
