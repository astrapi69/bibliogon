"""Style checker: detects filler words, passive voice, and long sentences."""

import re

# Filler words per language
FILLER_WORDS: dict[str, list[str]] = {
    "de": [
        "eigentlich", "sozusagen", "quasi", "irgendwie", "gewissermassen",
        "grundsaetzlich", "im Grunde", "im Prinzip", "halt", "eben",
        "einfach", "wirklich", "ziemlich", "relativ", "durchaus",
        "natuerlich", "selbstverstaendlich", "offensichtlich", "offenbar",
        "ja", "nun", "also", "jedenfalls", "uebrigens", "bekanntlich",
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

# Default thresholds
DEFAULT_MAX_SENTENCE_LENGTH = 30  # words
DEFAULT_MAX_FILLER_RATIO = 0.05  # 5% of total words


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences."""
    # Split on sentence-ending punctuation followed by whitespace or end
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip()]


def _word_count(text: str) -> int:
    """Count words in text."""
    return len(text.split())


def check_filler_words(text: str, language: str = "de") -> list[dict]:
    """Find filler words in text.

    Returns list of findings with word, position, and suggestion.
    """
    fillers = FILLER_WORDS.get(language, FILLER_WORDS.get("en", []))
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
    """Detect passive voice constructions.

    Returns list of findings with matched text and position.
    """
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
    """Find sentences that exceed the word limit.

    Returns list of findings with sentence text and word count.
    """
    sentences = _split_sentences(text)
    findings: list[dict] = []

    offset = 0
    for sentence in sentences:
        wc = _word_count(sentence)
        # Find actual position in text
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


def check_style(
    text: str,
    language: str = "de",
    max_sentence_length: int = DEFAULT_MAX_SENTENCE_LENGTH,
) -> dict:
    """Run all style checks on text.

    Returns summary with findings grouped by type.
    """
    findings = []
    findings.extend(check_filler_words(text, language))
    findings.extend(check_passive_voice(text, language))
    findings.extend(check_sentence_length(text, max_sentence_length))

    total_words = _word_count(text)
    filler_count = sum(1 for f in findings if f["type"] == "filler_word")

    return {
        "total_words": total_words,
        "total_sentences": len(_split_sentences(text)),
        "finding_count": len(findings),
        "filler_count": filler_count,
        "passive_count": sum(1 for f in findings if f["type"] == "passive_voice"),
        "long_sentence_count": sum(1 for f in findings if f["type"] == "long_sentence"),
        "filler_ratio": round(filler_count / total_words, 4) if total_words > 0 else 0,
        "findings": findings,
    }
