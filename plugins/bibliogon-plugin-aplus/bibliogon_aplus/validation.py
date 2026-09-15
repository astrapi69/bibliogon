"""Deterministic text-quality validator for an A+ Content package (#825).

Runs entirely against the versioned ``ruleset.yaml`` (see
:mod:`bibliogon_aplus.rules`), independent of which AI provider - or
whether any AI at all - produced the text. Every finding names the
exact field it concerns, so the caller can highlight precisely where
a package is wrong instead of a single pass/fail flag.
"""

from __future__ import annotations

import re
import unicodedata

from bibliogon_aplus.rules import Ruleset
from bibliogon_aplus.schema import AplusPackage, ValidationFinding

EM_DASH = "—"
EN_DASH = "–"
_DASH_RE = re.compile(f"[{EM_DASH}{EN_DASH}]")

#: Zero-width and byte-order-mark characters that survive copy-paste
#: from a word processor or an AI response but render invisibly.
_ZERO_WIDTH_CHARS = frozenset(
    {
        "​",  # zero width space
        "‌",  # zero width non-joiner
        "‍",  # zero width joiner
        "⁠",  # word joiner
        "﻿",  # BOM / zero width no-break space
    }
)

#: Broad-enough emoji/pictograph coverage for a marketing-text gate;
#: not meant to be an exhaustive Unicode-emoji classifier.
_EMOJI_RE = re.compile(
    "["
    "\U0001f300-\U0001faff"  # symbols & pictographs, emoticons, transport, supplemental
    "\U00002600-\U000027bf"  # misc symbols, dingbats
    "\U0001f1e6-\U0001f1ff"  # regional indicators (flag emoji)
    "]"
)

_ALLOWED_CONTROL_CHARS = frozenset({"\n", "\t", "\r"})

#: A pure word list can never be exhaustive - any future AI response
#: using an unlisted imperative verb slips through silently (#828).
#: These per-language patterns catch a field OPENING with a likely
#: imperative verb even when the exact word is not in
#: ``marketing_imperatives``, using morphology that is specific to
#: each language's formal-imperative form:
#:
#: - German: the formal "Sie" imperative uses verb-first ("V1") word
#:   order - "Verb Sie ..." (e.g. "Erobern Sie ..."). A declarative
#:   German sentence about a book would put "Sie" first, not second
#:   ("Sie erobert..."); a bare capitalized word immediately followed
#:   by "Sie" at the very start of a field is specifically the
#:   imperative/question word order, so this does not require the
#:   verb to end in any particular suffix (many common verbs, e.g.
#:   "meistern"/"erobern", have infinitives ending in "-ern"/"-eln",
#:   not "-en").
#: - French: the formal "vous" imperative for -er verbs (the largest
#:   verb class) ends in "-ez" (e.g. "Gagnez ..."). A short exclusion
#:   list keeps common non-verb "-ez" words (assez, chez, nez) from
#:   false-positiving.
#:
#: English and Spanish have no comparable morphological marker that
#: distinguishes an imperative verb from a noun/adjective/3rd-person
#: form without a part-of-speech tagger (a new NLP dependency, out of
#: scope here per Library-First - no existing dependency provides
#: this). Detection for those two languages relies on the enumerated
#: ``marketing_imperatives`` list staying current; that IS their
#: heuristic, and its coverage gaps are closed by list maintenance,
#: not by a doomed regex.
_LEADING_IMPERATIVE_PATTERNS: dict[str, re.Pattern[str]] = {
    "de": re.compile(r"^[A-ZÄÖÜ][a-zäöüß]{2,}\s+Sie\b"),
    "fr": re.compile(r"^[A-ZÀ-Ü][a-zà-ÿ]{3,}ez\b"),
}

#: French words that end in "-ez" but are not verbs, excluded from
#: the French leading-imperative heuristic to reduce false positives.
_FR_LEADING_EZ_EXCEPTIONS = frozenset({"assez", "chez", "nez"})


_LEADING_WORD_RE = re.compile(r"^\W*(\w+)", re.UNICODE)


def _starts_with_imperative_verb(
    text: str, language: str, leading_only_words: tuple[str, ...] = ()
) -> str | None:
    """Return the matched opening phrase if ``text`` looks like it
    opens with an imperative verb for ``language``, else None.

    Combines the per-language morphological regex (de/fr) with an
    exact-match check against ``leading_only_words`` - words too
    common to block anywhere in text but unambiguous as an opener
    (English's "Build"/"Get"/"Start"/"Take"; see #828).
    """
    stripped = text.strip()

    if leading_only_words:
        leading_match = _LEADING_WORD_RE.match(stripped)
        if leading_match:
            first_word = leading_match.group(1)
            for candidate in leading_only_words:
                if first_word.lower() == candidate.lower():
                    return first_word

    pattern = _LEADING_IMPERATIVE_PATTERNS.get(language)
    if pattern is None:
        return None
    match = pattern.match(stripped)
    if match is None:
        return None
    matched = match.group(0)
    if language == "fr" and matched.lower() in _FR_LEADING_EZ_EXCEPTIONS:
        return None
    return matched


def _find_hidden_or_control_chars(text: str) -> list[str]:
    """Zero-width chars, plus any other C0/C1 control or format
    character not in the small allowed set (newline/tab/CR)."""
    found = []
    for ch in text:
        if ch in _ZERO_WIDTH_CHARS:
            found.append(ch)
            continue
        if ch in _ALLOWED_CONTROL_CHARS:
            continue
        category = unicodedata.category(ch)
        if category in ("Cc", "Cf", "Cs"):
            found.append(ch)
    return found


def _is_utf8_safe(text: str) -> bool:
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


def _contains_word(text: str, word: str) -> bool:
    """Case-insensitive whole-word match (word-boundary, not a bare
    substring search - "art" must not match inside "party")."""
    pattern = r"\b" + re.escape(word) + r"\b"
    return re.search(pattern, text, re.IGNORECASE) is not None


def _check_text_field(
    field: str,
    text: str,
    *,
    max_length: int | None,
    language: str,
    genre_key: str | None,
    rules: Ruleset,
) -> list[ValidationFinding]:
    """Every hard/soft rule that applies to a single free-text field."""
    findings: list[ValidationFinding] = []
    if not text:
        return findings

    if not _is_utf8_safe(text):
        findings.append(
            ValidationFinding(
                field=field, severity="error", message="Text contains an invalid character."
            )
        )

    if _DASH_RE.search(text):
        findings.append(
            ValidationFinding(
                field=field,
                severity="error",
                message="Em dash or en dash found; use a plain hyphen or rewrite the sentence.",
            )
        )

    if _EMOJI_RE.search(text):
        findings.append(
            ValidationFinding(field=field, severity="error", message="Emoji is not allowed.")
        )

    hidden = _find_hidden_or_control_chars(text)
    if hidden:
        findings.append(
            ValidationFinding(
                field=field,
                severity="error",
                message="Hidden or control character found (zero-width space, BOM, or similar).",
            )
        )

    if max_length is not None and len(text) > max_length:
        findings.append(
            ValidationFinding(
                field=field,
                severity="error",
                message=f"Text is {len(text)} characters, over the {max_length} limit.",
            )
        )

    lang_rules = rules.for_language(language)

    matched_imperative = False
    for imperative in lang_rules.marketing_imperatives:
        if _contains_word(text, imperative):
            findings.append(
                ValidationFinding(
                    field=field,
                    severity="error",
                    message=f"Marketing imperative '{imperative}' is not allowed in A+ text.",
                )
            )
            matched_imperative = True
            break

    if not matched_imperative:
        leading = _starts_with_imperative_verb(text, language, lang_rules.leading_only_imperatives)
        if leading is not None:
            findings.append(
                ValidationFinding(
                    field=field,
                    severity="error",
                    message=(
                        f"Text opens with an imperative verb form ('{leading}'); "
                        "A+ copy must not command the reader."
                    ),
                )
            )

    for term in lang_rules.price_shipping_terms:
        if _contains_word(text, term):
            findings.append(
                ValidationFinding(
                    field=field,
                    severity="error",
                    message=f"Price, shipping or availability claim ('{term}') is not allowed.",
                )
            )
            break

    for brand in rules.competitor_brands:
        if brand.lower() in text.lower():
            findings.append(
                ValidationFinding(
                    field=field,
                    severity="error",
                    message=f"Third-party brand reference ('{brand}') is not allowed.",
                )
            )
            break

    escalated = lang_rules.escalated_words(genre_key)
    for word in lang_rules.soft_words_default:
        if _contains_word(text, word):
            if word in escalated:
                findings.append(
                    ValidationFinding(
                        field=field,
                        severity="error",
                        message=f"'{word}' is not appropriate for this genre.",
                    )
                )
            else:
                findings.append(
                    ValidationFinding(
                        field=field,
                        severity="warning",
                        message=f"'{word}' may not fit the intended tone; review before use.",
                    )
                )

    return findings


def _check_alt_text(field: str, alt_text: str, *, max_length: int) -> list[ValidationFinding]:
    if not alt_text or not alt_text.strip():
        return [
            ValidationFinding(
                field=field, severity="error", message="Alt text is required and cannot be empty."
            )
        ]
    if len(alt_text) > max_length:
        return [
            ValidationFinding(
                field=field,
                severity="error",
                message=f"Alt text is {len(alt_text)} characters, over the {max_length} limit.",
            )
        ]
    return []


def validate_package(
    package: AplusPackage,
    *,
    language: str,
    genre_key: str | None,
    rules: Ruleset,
) -> list[ValidationFinding]:
    """Run every deterministic rule against ``package``.

    Args:
        package: The assembled (possibly AI-drafted) package.
        language: One of the ruleset's supported language codes.
        genre_key: Lowercased genre/style key (e.g. ``"kinderbuch"``)
            used for soft-word severity escalation, or None.
        rules: The parsed ruleset to validate against.

    Returns:
        Every finding, errors and warnings together, in a stable
        field order (short_description, bullets, header, images).
    """
    limits = rules.schema_limits
    findings: list[ValidationFinding] = []

    findings += _check_text_field(
        "short_description",
        package.short_description,
        max_length=limits.get("short_description"),
        language=language,
        genre_key=genre_key,
        rules=rules,
    )

    if len(package.bullets) != 3:
        findings.append(
            ValidationFinding(
                field="bullets",
                severity="error",
                message=f"Exactly 3 bullets are required, got {len(package.bullets)}.",
            )
        )
    for index, bullet in enumerate(package.bullets):
        findings += _check_text_field(
            f"bullets[{index}].heading",
            bullet.heading,
            max_length=limits.get("bullet_heading"),
            language=language,
            genre_key=genre_key,
            rules=rules,
        )
        findings += _check_text_field(
            f"bullets[{index}].body",
            bullet.body,
            max_length=limits.get("bullet_body"),
            language=language,
            genre_key=genre_key,
            rules=rules,
        )

    findings += _check_text_field(
        "module_header.text",
        package.module_header.text,
        max_length=None,
        language=language,
        genre_key=genre_key,
        rules=rules,
    )
    findings += _check_alt_text(
        "module_header.alt_text",
        package.module_header.alt_text,
        max_length=limits.get("alt_text", 200),
    )

    if len(package.module_three_images) != 3:
        findings.append(
            ValidationFinding(
                field="module_three_images",
                severity="error",
                message=(
                    f"Exactly 3 image entries are required, got {len(package.module_three_images)}."
                ),
            )
        )
    for index, entry in enumerate(package.module_three_images):
        findings += _check_text_field(
            f"module_three_images[{index}].text",
            entry.text,
            max_length=None,
            language=language,
            genre_key=genre_key,
            rules=rules,
        )
        findings += _check_alt_text(
            f"module_three_images[{index}].alt_text",
            entry.alt_text,
            max_length=limits.get("alt_text", 200),
        )

    return findings
