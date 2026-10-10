/**
 * Client-side chapter quality-metrics engine (#offline-quality).
 *
 * A faithful TypeScript port of the backend `plugin-ms-tools`
 * readability + style analysis (`readability.py` + `style_checker.py` +
 * the `/metrics/{book_id}` route), so the Quality tab works in the
 * backendless (Dexie / GH Pages) build instead of failing with a
 * generic "Qualitätsanalyse fehlgeschlagen" when `guardedFetch` blocks
 * the `/api/ms-tools/...` call.
 *
 * It computes the same {@link ChapterMetricsResponse} shape the backend
 * returns, from chapters fetched through the storage seam. The math
 * (Flesch coefficients, syllable heuristic, filler/passive/adverb/
 * adjective detection) mirrors the Python implementation; the only
 * deliberate omission is the user allowlist YAML (offline default is
 * empty, which matches a fresh install).
 *
 * Word splitting uses a Unicode-aware class (`\p{L}\p{N}_`) so German
 * umlauts and accented letters are not broken at word boundaries, the
 * same way Python's Unicode `\w` behaves.
 */

import type {
    Chapter,
    ChapterMetric,
    ChapterMetricsResponse,
    LongSentence,
} from "../../api/types";

import { htmlToPlainText } from "./content/htmlToPlainText";

import {
    ADJECTIVE_FALSE_POSITIVES,
    ADJECTIVE_SUFFIXES,
    ADVERB_SUFFIXES,
    FILLER_WORDS,
    PASSIVE_PATTERNS,
} from "./msTools/styleRules";

const MAX_SENTENCE_LENGTH = 25;

/** Per-language vowel groups for the syllable heuristic. */
const VOWEL_GROUPS: Record<string, RegExp> = {
    de: /[aeiouyäöü]+/gi,
    en: /[aeiouy]+/gi,
    es: /[aeiouáéíóúü]+/gi,
    fr: /[aeiouyàâéèêëïîôùûü]+/gi,
    el: /[αεηιοουωάέήίόύώϊϋΐΰ]+/gi,
};

/** Flesch Reading Ease coefficients: [base, asl, asw] per language. */
const FLESCH_COEFFICIENTS: Record<string, [number, number, number]> = {
    en: [206.835, 1.015, 84.6],
    de: [180.0, 1.0, 58.5],
    es: [206.835, 1.02, 60.0],
    fr: [207.0, 1.015, 73.6],
};

const WORD_RE = /[\p{L}\p{N}_]+/gu;

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function roundTo(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

/**
 * Extract plain text from a chapter body in any stored shape.
 *
 * Mirrors the backend `content_to_plain_text`: a TipTap doc (parsed or
 * as a JSON string) is walked, HTML is stripped to prose, and genuine
 * plain text passes through.
 *
 * The HTML branch is the common case, not the edge case: an imported
 * chapter stays HTML until someone opens and saves it in the editor
 * (#787), which is 779 of 834 chapters on the dev library. Returning the
 * raw markup here counted `<p>`, `strong`, class names and URLs as words
 * and syllables, so every metric for an imported chapter was computed
 * over the tags as well as the prose (#914) - the same failure #806
 * fixed server-side.
 */
export function extractPlainText(content: unknown): string {
    let doc: unknown = content;
    if (typeof content === "string") {
        const stripped = content.trimStart();
        if (!stripped) return "";
        try {
            doc = JSON.parse(content);
        } catch {
            return stripped.startsWith("<") ? htmlToPlainText(content) : content;
        }
    }
    if (typeof doc !== "object" || doc === null) {
        return doc ? String(doc) : "";
    }

    const parts: string[] = [];
    const blockTypes = new Set(["paragraph", "heading", "blockquote", "listItem"]);

    const walk = (node: Record<string, unknown>): void => {
        if (node.type === "text" && typeof node.text === "string") {
            parts.push(node.text);
        }
        const children = node.content;
        if (Array.isArray(children)) {
            for (const child of children) {
                if (child && typeof child === "object") {
                    walk(child as Record<string, unknown>);
                }
            }
        }
        if (typeof node.type === "string" && blockTypes.has(node.type)) {
            parts.push("\n");
        }
    };

    walk(doc as Record<string, unknown>);
    return parts.join("").trim();
}

function splitSentences(text: string): string[] {
    return text
        .trim()
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/** Regex word list (Unicode \w equivalent), used by readability metrics. */
function splitWords(text: string): string[] {
    return text.match(WORD_RE) ?? [];
}

/** Whitespace word count (mirrors Python `str.split()`), used by style ratios. */
function whitespaceWordCount(text: string): number {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

function countSyllables(word: string, language: string): number {
    const lower = word.toLowerCase().trim();
    if (!lower) return 0;

    const pattern = VOWEL_GROUPS[language] ?? VOWEL_GROUPS.en;
    pattern.lastIndex = 0;
    const groups = lower.match(pattern) ?? [];
    let count = groups.length;

    if (language === "en") {
        if (lower.endsWith("e") && count > 1) count -= 1;
        if (lower.endsWith("le") && lower.length > 2 && !"aeiouy".includes(lower[lower.length - 3])) {
            count += 1;
        }
        if (lower.endsWith("ed") && count > 1 && !"td".includes(lower[lower.length - 3])) {
            count -= 1;
        }
    }

    return Math.max(1, count);
}

function countSyllablesText(text: string, language: string): number {
    return splitWords(text).reduce((sum, w) => sum + countSyllables(w, language), 0);
}

function fleschReadingEase(text: string, language: string): number {
    const sentences = splitSentences(text);
    const words = splitWords(text);
    if (sentences.length === 0 || words.length === 0) return 0;

    const totalSyllables = countSyllablesText(text, language);
    const asl = words.length / sentences.length;
    const asw = totalSyllables / words.length;

    const [base, cAsl, cAsw] = FLESCH_COEFFICIENTS[language] ?? FLESCH_COEFFICIENTS.en;
    return roundTo(base - cAsl * asl - cAsw * asw, 2);
}

function difficultyFor(fre: number): string {
    if (fre >= 80) return "easy";
    if (fre >= 60) return "medium";
    if (fre >= 40) return "difficult";
    return "very_difficult";
}

/** Unicode-safe `\b...\b` for a literal term: no letter/number/_ adjacent. */
function wordBoundaryRegex(term: string): RegExp {
    return new RegExp(
        `(?<![\\p{L}\\p{N}_])${escapeRegExp(term)}(?![\\p{L}\\p{N}_])`,
        "giu",
    );
}

function countFiller(text: string, language: string): number {
    const fillers = FILLER_WORDS[language] ?? FILLER_WORDS.en;
    let count = 0;
    for (const filler of fillers) {
        const matches = text.match(wordBoundaryRegex(filler));
        if (matches) count += matches.length;
    }
    return count;
}

function countPassive(text: string, language: string): number {
    const patterns = PASSIVE_PATTERNS[language] ?? PASSIVE_PATTERNS.en;
    let count = 0;
    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) count += matches.length;
    }
    return count;
}

function countAdverbs(text: string, language: string): number {
    const suffixes = ADVERB_SUFFIXES[language] ?? ADVERB_SUFFIXES.en;
    let count = 0;
    for (const word of splitWords(text)) {
        if (word.length < 4) continue;
        const lower = word.toLowerCase();
        for (const suffix of suffixes) {
            if (lower.endsWith(suffix) && lower.length > suffix.length + 1) {
                count += 1;
                break;
            }
        }
    }
    return count;
}

function countAdjectives(text: string, language: string): number {
    const suffixes = ADJECTIVE_SUFFIXES[language] ?? ADJECTIVE_SUFFIXES.en;
    const falsePositives = ADJECTIVE_FALSE_POSITIVES[language] ?? new Set<string>();
    const tail = language === "de" ? "(?:e[rsnm]?|em)?" : "";
    const patterns = suffixes.map(
        (suffix) => new RegExp(`^.{2,}${escapeRegExp(suffix)}${tail}$`, "iu"),
    );

    let count = 0;
    for (const word of splitWords(text)) {
        if (word.length < 4) continue;
        const lower = word.toLowerCase();
        if (falsePositives.has(lower)) continue;
        if (patterns.some((p) => p.test(lower))) count += 1;
    }
    return count;
}

function countLongSentences(text: string): number {
    return splitSentences(text).filter((s) => whitespaceWordCount(s) > MAX_SENTENCE_LENGTH)
        .length;
}

/** Longest sentences by word count, descending (mirrors `longest_sentences`). */
function longestSentences(text: string, limit = 15): LongSentence[] {
    return splitSentences(text)
        .map((sentence) => ({ text: sentence, word_count: whitespaceWordCount(sentence) }))
        .sort((a, b) => b.word_count - a.word_count)
        .slice(0, limit);
}

interface ChapterInput {
    id: string;
    title: string;
    content: unknown;
    position: number;
    chapter_type: string;
}

/** Compute the per-chapter metric row for one chapter's plain text. */
function metricFor(chapter: ChapterInput, language: string): ChapterMetric {
    const plain = extractPlainText(chapter.content);
    const base = {
        chapter_id: chapter.id,
        chapter: chapter.title,
        position: chapter.position,
        chapter_type: chapter.chapter_type,
    };

    if (!plain.trim()) {
        return {
            ...base,
            empty: true,
            word_count: 0,
            sentence_count: 0,
            avg_sentence_length: 0,
            flesch_reading_ease: 0,
            difficulty: "",
            reading_time_minutes: 0,
            filler_ratio: 0,
            passive_ratio: 0,
            adverb_ratio: 0,
            adjective_ratio: 0,
            long_sentence_count: 0,
            finding_count: 0,
            long_sentences: [],
        };
    }

    const words = splitWords(plain);
    const sentences = splitSentences(plain);
    const nWords = words.length;
    const nSentences = sentences.length;
    const fre = fleschReadingEase(plain, language);

    const totalWords = whitespaceWordCount(plain);
    const totalSentences = nSentences;
    const fillerCount = countFiller(plain, language);
    const passiveCount = countPassive(plain, language);
    const adverbCount = countAdverbs(plain, language);
    const adjectiveCount = countAdjectives(plain, language);
    const longSentenceCount = countLongSentences(plain);

    return {
        ...base,
        empty: false,
        word_count: nWords,
        sentence_count: nSentences,
        avg_sentence_length: nSentences > 0 ? roundTo(nWords / nSentences, 1) : 0,
        flesch_reading_ease: fre,
        difficulty: difficultyFor(fre),
        reading_time_minutes: roundTo(nWords / 200, 1),
        filler_ratio: totalWords > 0 ? roundTo(fillerCount / totalWords, 4) : 0,
        passive_ratio: totalSentences > 0 ? roundTo(passiveCount / totalSentences, 4) : 0,
        adverb_ratio: totalWords > 0 ? roundTo(adverbCount / totalWords, 4) : 0,
        adjective_ratio: totalWords > 0 ? roundTo(adjectiveCount / totalWords, 4) : 0,
        long_sentence_count: longSentenceCount,
        finding_count:
            fillerCount + passiveCount + adverbCount + adjectiveCount + longSentenceCount,
        long_sentences: longestSentences(plain),
    };
}

const AVERAGE_KEYS: (keyof ChapterMetric)[] = [
    "word_count",
    "filler_ratio",
    "passive_ratio",
    "adverb_ratio",
    "adjective_ratio",
    "avg_sentence_length",
    "flesch_reading_ease",
    "long_sentence_count",
];

/**
 * Compute the full {@link ChapterMetricsResponse} client-side, the same
 * shape `GET /api/ms-tools/metrics/{book_id}` returns. Chapters are
 * analyzed in `position` order; book-wide averages cover non-empty
 * chapters only (outlier detection in the Quality tab).
 */
export function computeChapterMetrics(
    bookTitle: string,
    language: string | null | undefined,
    chapters: Chapter[],
): ChapterMetricsResponse {
    const lang = language || "de";
    const ordered = [...chapters].sort((a, b) => a.position - b.position);
    const rows = ordered.map((ch) =>
        metricFor(
            {
                id: ch.id,
                title: ch.title,
                content: ch.content,
                position: ch.position,
                chapter_type: ch.chapter_type,
            },
            lang,
        ),
    );

    const nonEmpty = rows.filter((r) => !r.empty);
    const averages: Record<string, number> = {};
    if (nonEmpty.length > 0) {
        for (const key of AVERAGE_KEYS) {
            const sum = nonEmpty.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
            averages[key] = roundTo(sum / nonEmpty.length, 4);
        }
    }

    return {
        book_title: bookTitle,
        chapter_count: rows.length,
        chapters: rows,
        averages,
    };
}
