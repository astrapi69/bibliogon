/**
 * The editor's inline style check, in the browser (#733).
 *
 * A port of `plugin-ms-tools`'s `check_style`, producing the same
 * response `POST /api/ms-tools/check` returns - including the
 * offset-bearing findings the editor turns into decorations - so the
 * check works in the backendless build instead of rendering as a
 * disabled button. `chapterMetrics.ts` already mirrors the same checks
 * for the Quality tab, but it only counts; it never records where a
 * finding is, which is what decorations need.
 *
 * Behaviour is pinned against output recorded from the Python checker
 * itself (`styleFindings.parity.test.ts`), not against a hand-written
 * expectation, with one declared exception described below.
 *
 * **Offsets are UTF-16 indices**, because the consumer walks a
 * JavaScript string. Python's are code-point indices, so for text
 * containing an astral character - an emoji, say - the two disagree by
 * one per such character before the finding, and the backend's answer
 * is the one that is wrong for this consumer: it makes the editor
 * highlight one character short. The port therefore does not reproduce
 * it; the parity test declares that case and asserts the corrected
 * behaviour positively instead (#1039 tracks the online path).
 *
 * The user allowlist (`content/allowlist/*.yaml`) has no browser
 * equivalent and ships empty, so it is not applied here - the same
 * deliberate omission `chapterMetrics.ts` documents.
 *
 * @example
 * const result = checkStyle("Das ist eigentlich einfach.", "de");
 * result.findings[0];
 * // {type: "filler_word", word: "eigentlich", offset: 8, length: 10, …}
 */

import {
    ADJECTIVE_FALSE_POSITIVES,
    ADJECTIVE_SUFFIXES,
    ADVERB_SUFFIXES,
    DE_INFLECTION,
    DEFAULT_MAX_SENTENCE_LENGTH,
    DEFAULT_REPETITION_WINDOW,
    FILLER_WORDS,
    PASSIVE_PATTERNS,
    REDUNDANT_PHRASES,
    STOP_WORDS,
    WORD_CLASS,
} from "./styleRules";

/** A finding's bilingual message, as the endpoint returns it. */
export interface StyleFindingMessage {
    de: string;
    en: string;
}

/** One finding, field for field the `/ms-tools/check` shape. */
export interface StyleFinding {
    type: string;
    word: string;
    /** UTF-16 index into the text that was checked. */
    offset: number;
    length: number;
    severity: "info" | "warning";
    message: StyleFindingMessage;
    /** `long_sentence` only. */
    word_count?: number;
    /** `long_sentence` only. */
    max_words?: number;
    /** `word_repetition` only: words between the two occurrences. */
    distance?: number;
    /** `redundant_phrase` only. */
    suggestion?: string;
}

/** The whole `/ms-tools/check` response. */
export interface StyleCheckResult {
    total_words: number;
    total_sentences: number;
    finding_count: number;
    filler_count: number;
    passive_count: number;
    long_sentence_count: number;
    repetition_count: number;
    adverb_count: number;
    adjective_count: number;
    redundant_phrase_count: number;
    filler_ratio: number;
    passive_ratio: number;
    adverb_ratio: number;
    adjective_ratio: number;
    findings: StyleFinding[];
}

export interface StyleCheckOptions {
    maxSentenceLength?: number;
    repetitionWindow?: number;
}

/** Python's `round(x, 4)` for the ratios: half-up on the digit. */
function round4(value: number): number {
    return Math.round(value * 10000) / 10000;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `\b` around a term, spelled with lookarounds over a Unicode word
 * class. JavaScript's own `\b` is ASCII-only, so a German term would
 * match inside a longer word at the first umlaut.
 */
function wordBoundary(term: string): RegExp {
    return new RegExp(
        `(?<!${WORD_CLASS})${escapeRegExp(term)}(?!${WORD_CLASS})`,
        "giu",
    );
}

const WORD_RE = new RegExp(`(?<!${WORD_CLASS})${WORD_CLASS}+(?!${WORD_CLASS})`, "gu");

/** `re.split(r"(?<=[.!?])\s+", text.strip())`, dropping blanks. */
function splitSentences(text: string): string[] {
    return text
        .trim()
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
}

/** `len(text.split())`: whitespace-separated tokens. */
function wordCount(text: string): number {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** `re.findall(r"\b\w+\b", text)` with a Unicode word class. */
function splitWords(text: string): string[] {
    return text.match(WORD_RE) ?? [];
}

function tableFor<T>(table: Record<string, T>, language: string, fallback: string): T {
    return table[language] ?? table[fallback];
}

function checkFillerWords(text: string, language: string): StyleFinding[] {
    const fillers = tableFor(FILLER_WORDS, language, "en") ?? [];
    const findings: StyleFinding[] = [];
    for (const filler of fillers) {
        const pattern = wordBoundary(filler);
        for (const match of text.matchAll(pattern)) {
            findings.push({
                type: "filler_word",
                word: filler,
                offset: match.index,
                length: match[0].length,
                severity: "info",
                message: {
                    de: `Fuellwort '${filler}' - kann oft gestrichen werden.`,
                    en: `Filler word '${filler}' - consider removing.`,
                },
            });
        }
    }
    return findings;
}

function checkPassiveVoice(text: string, language: string): StyleFinding[] {
    const patterns = tableFor(PASSIVE_PATTERNS, language, "en") ?? [];
    const findings: StyleFinding[] = [];
    for (const pattern of patterns) {
        for (const match of text.matchAll(new RegExp(pattern.source, "giu"))) {
            findings.push({
                type: "passive_voice",
                word: match[0],
                offset: match.index,
                length: match[0].length,
                severity: "warning",
                message: {
                    de: `Passiv-Konstruktion: '${match[0]}' - aktive Formulierung bevorzugen.`,
                    en: `Passive voice: '${match[0]}' - prefer active voice.`,
                },
            });
        }
    }
    return findings;
}

function checkSentenceLength(text: string, maxWords: number): StyleFinding[] {
    const findings: StyleFinding[] = [];
    let offset = 0;
    for (const sentence of splitSentences(text)) {
        const words = wordCount(sentence);
        let index = text.indexOf(sentence, offset);
        if (index === -1) index = offset;
        if (words > maxWords) {
            findings.push({
                type: "long_sentence",
                word: sentence.slice(0, 80) + (sentence.length > 80 ? "..." : ""),
                offset: index,
                length: sentence.length,
                word_count: words,
                max_words: maxWords,
                severity: "warning",
                message: {
                    de: `Satz mit ${words} Woertern (Maximum: ${maxWords}) - kuerzen oder aufteilen.`,
                    en: `Sentence with ${words} words (max: ${maxWords}) - consider splitting.`,
                },
            });
        }
        offset = index + sentence.length;
    }
    return findings;
}

function checkWordRepetitions(
    text: string,
    language: string,
    window: number,
): StyleFinding[] {
    const words = splitWords(text);
    const stop = tableFor(STOP_WORDS, language, "en") ?? new Set<string>();
    const findings: StyleFinding[] = [];
    const seen = new Map<string, number>();

    for (let i = 0; i < words.length; i += 1) {
        const word = words[i].toLowerCase();
        if (word.length < 3 || stop.has(word)) continue;
        const previous = seen.get(word);
        if (previous !== undefined && i - previous <= window) {
            // The same walk the original does: step through every earlier
            // word to find where this occurrence starts.
            let offset = 0;
            for (let j = 0; j < i; j += 1) {
                offset = text.indexOf(words[j], offset) + words[j].length;
            }
            let actual = text.indexOf(words[i], offset);
            if (actual === -1) actual = offset;
            findings.push({
                type: "word_repetition",
                word,
                offset: actual,
                length: word.length,
                distance: i - previous,
                severity: "info",
                message: {
                    de: `Wortwiederholung '${word}' (Abstand: ${i - previous} Woerter).`,
                    en: `Word repetition '${word}' (${i - previous} words apart).`,
                },
            });
        }
        seen.set(word, i);
    }
    return findings;
}

function checkAdverbs(text: string, language: string): StyleFinding[] {
    const suffixes = tableFor(ADVERB_SUFFIXES, language, "en") ?? ["ly"];
    const findings: StyleFinding[] = [];
    for (const match of text.matchAll(WORD_RE)) {
        const word = match[0];
        if (word.length < 4) continue;
        const lower = word.toLowerCase();
        for (const suffix of suffixes) {
            if (lower.endsWith(suffix) && lower.length > suffix.length + 1) {
                findings.push({
                    type: "adverb",
                    word,
                    offset: match.index,
                    length: word.length,
                    severity: "info",
                    message: {
                        de: `Adverb '${word}' - staerkeres Verb statt Adverb+schwaches Verb?`,
                        en: `Adverb '${word}' - consider a stronger verb instead.`,
                    },
                });
                break;
            }
        }
    }
    return findings;
}

function checkAdjectives(text: string, language: string): StyleFinding[] {
    const suffixes =
        tableFor(ADJECTIVE_SUFFIXES, language, "en") ?? ["ous", "ive", "ful"];
    const falsePositives =
        ADJECTIVE_FALSE_POSITIVES[language] ?? new Set<string>();
    const tail = language === "de" ? DE_INFLECTION : "";
    const patterns = suffixes.map(
        (suffix) => new RegExp(`^.{2,}${escapeRegExp(suffix)}${tail}$`, "iu"),
    );
    const findings: StyleFinding[] = [];
    for (const match of text.matchAll(WORD_RE)) {
        const word = match[0];
        if (word.length < 4) continue;
        const lower = word.toLowerCase();
        if (falsePositives.has(lower)) continue;
        if (patterns.some((pattern) => pattern.test(lower))) {
            findings.push({
                type: "adjective",
                word,
                offset: match.index,
                length: word.length,
                severity: "info",
                message: {
                    de: `Adjektiv '${word}' - zu viele Adjektive schwaecht den Text.`,
                    en: `Adjective '${word}' - high adjective density weakens prose.`,
                },
            });
        }
    }
    return findings;
}

function checkRedundantPhrases(text: string, language: string): StyleFinding[] {
    const phrases = tableFor(REDUNDANT_PHRASES, language, "en") ?? [];
    const findings: StyleFinding[] = [];
    for (const [phrase, suggestion] of phrases) {
        for (const match of text.matchAll(wordBoundary(phrase))) {
            findings.push({
                type: "redundant_phrase",
                word: phrase,
                offset: match.index,
                length: phrase.length,
                suggestion,
                severity: "info",
                message: {
                    de: `Redundant: '${phrase}' - '${suggestion}' reicht.`,
                    en: `Redundant: '${phrase}' - '${suggestion}' is sufficient.`,
                },
            });
        }
    }
    return findings;
}

/**
 * Run every style check over plain text.
 *
 * Findings come in the order the original appends them - filler,
 * passive, long sentence, repetition, adverb, adjective, redundant -
 * so the two sides can be compared as sequences.
 */
export function checkStyle(
    text: string,
    language = "de",
    options: StyleCheckOptions = {},
): StyleCheckResult {
    const maxWords = options.maxSentenceLength ?? DEFAULT_MAX_SENTENCE_LENGTH;
    const window = options.repetitionWindow ?? DEFAULT_REPETITION_WINDOW;

    const findings: StyleFinding[] = [
        ...checkFillerWords(text, language),
        ...checkPassiveVoice(text, language),
        ...checkSentenceLength(text, maxWords),
        ...checkWordRepetitions(text, language, window),
        ...checkAdverbs(text, language),
        ...checkAdjectives(text, language),
        ...checkRedundantPhrases(text, language),
    ];

    const countOf = (type: string) =>
        findings.filter((finding) => finding.type === type).length;

    const totalWords = wordCount(text);
    const totalSentences = splitSentences(text).length;
    const fillerCount = countOf("filler_word");
    const passiveCount = countOf("passive_voice");
    const adverbCount = countOf("adverb");
    const adjectiveCount = countOf("adjective");

    return {
        total_words: totalWords,
        total_sentences: totalSentences,
        finding_count: findings.length,
        filler_count: fillerCount,
        passive_count: passiveCount,
        long_sentence_count: countOf("long_sentence"),
        repetition_count: countOf("word_repetition"),
        adverb_count: adverbCount,
        adjective_count: adjectiveCount,
        redundant_phrase_count: countOf("redundant_phrase"),
        filler_ratio: totalWords > 0 ? round4(fillerCount / totalWords) : 0,
        passive_ratio:
            totalSentences > 0 ? round4(passiveCount / totalSentences) : 0,
        adverb_ratio: totalWords > 0 ? round4(adverbCount / totalWords) : 0,
        adjective_ratio: totalWords > 0 ? round4(adjectiveCount / totalWords) : 0,
        findings,
    };
}
