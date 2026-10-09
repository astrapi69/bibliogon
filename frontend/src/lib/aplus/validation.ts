/**
 * The deterministic A+ Content validator, in the browser (#890).
 *
 * A port of `bibliogon_aplus.validation`, rule for rule and in the same
 * field order, so a package checked offline gets the same findings as
 * one checked by the desktop backend. It runs against the seeded
 * ruleset (`./ruleset`) with no model call and no network, which is why
 * this half of A+ Content has no business being server-side.
 *
 * Four places where a faithful port is not a literal transcription,
 * each pinned by a test:
 *
 * 1. **Length is counted in code points.** Python's `len` counts code
 *    points; JavaScript's `.length` counts UTF-16 units, so one astral
 *    character (an emoji, a rare CJK glyph) would count twice and a
 *    field could be rejected under its real limit. `[...text].length`
 *    is the equivalent.
 * 2. **Word boundaries are Unicode-aware.** Python's `\b` on a `str`
 *    pattern treats letters with diacritics as word characters;
 *    JavaScript's `\b` is ASCII-only, so `\bStreit\b` would match
 *    inside `Straßenstreit`. Lookarounds over `[\p{L}\p{N}_]` restore
 *    the Python semantics.
 * 3. **The control-character classes are the same categories.**
 *    `unicodedata.category(ch) in ("Cc", "Cf", "Cs")` becomes
 *    `\p{Cc}`/`\p{Cf}`/`\p{Cs}` under the `u` flag.
 * 4. **An invalid character means an unpaired surrogate.** Python's
 *    check is whether `text.encode("utf-8")` raises, which it does for
 *    a lone surrogate and nothing else a `str` can hold. JavaScript
 *    strings hold lone surrogates happily, so the check is explicit -
 *    and, as in Python, such a character also trips the hidden-character
 *    rule, so both findings appear.
 *
 * @example
 * const findings = validateAplusPackage(pkg, {
 *     language: book.language,
 *     genreKey: book.genre?.toLowerCase() ?? null,
 * });
 * const errors = findings.filter((f) => f.severity === "error");
 */

import type { AplusFinding, AplusPackage } from "../../api/platform/aplus";

import {
    type AplusLanguageRules,
    type AplusRuleset,
    escalatedWords,
    getAplusRuleset,
    languageRules,
} from "./ruleset";

/**
 * Every code the validator can emit. Mirrors `FINDING_CODES`; the UI
 * renders `ui.aplus.finding.<code>` and falls back to `message` for a
 * code it does not know (#889).
 */
export const APLUS_FINDING_CODES = [
    "invalid_character",
    "dash_not_allowed",
    "emoji_not_allowed",
    "hidden_character",
    "over_max_length",
    "marketing_imperative",
    "leading_imperative",
    "price_claim",
    "brand_reference",
    "genre_word_forbidden",
    "genre_word_tone",
    "alt_text_required",
    "alt_text_over_max_length",
    "bullet_count",
    "image_count",
] as const;

const EM_DASH = "\u2014";
const EN_DASH = "\u2013";
const DASH_RE = new RegExp(`[${EM_DASH}${EN_DASH}]`);

/** Broad-enough coverage for a marketing-text gate, not a classifier. */
// One character class, no quantifier and no alternation, so there is
// nothing to backtrack over; the rule reads the bracketed ranges as a
// group it has to worry about.
const EMOJI_RE =
    // eslint-disable-next-line security/detect-unsafe-regex
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

/** Zero-width and BOM characters that survive a copy-paste invisibly. */
const ZERO_WIDTH_CHARS = new Set([
    "\u200b",
    "\u200c",
    "\u200d",
    "\u2060",
    "\ufeff",
]);

const ALLOWED_CONTROL_CHARS = new Set(["\n", "\t", "\r"]);

const CONTROL_OR_FORMAT_RE = /[\p{Cc}\p{Cf}\p{Cs}]/u;

/**
 * A word list can never be exhaustive, so each language whose formal
 * imperative has a morphological marker gets a pattern that catches an
 * unlisted verb opening a field (#828).
 *
 * German's formal imperative is verb-first ("Erobern Sie ..."); a
 * declarative sentence would put "Sie" first. French's formal "vous"
 * imperative for -er verbs ends in "-ez" ("Gagnez ..."). English and
 * Spanish have no comparable marker without a part-of-speech tagger, so
 * for those two the enumerated list IS the heuristic - a documented
 * limitation, pinned by a test, not an oversight.
 */
const LEADING_IMPERATIVE_PATTERNS: Record<string, RegExp> = {
    de: /^[A-ZÄÖÜ][a-zäöüß]{2,}\s+Sie\b/,
    fr: /^[A-ZÀ-Ü][a-zà-ÿ]{3,}ez\b/,
};

/** French "-ez" words that are not verbs. */
const FR_LEADING_EZ_EXCEPTIONS = new Set(["assez", "chez", "nez"]);

const LEADING_WORD_RE = /^[^\p{L}\p{N}_]*([\p{L}\p{N}_]+)/u;

/** Code points, not UTF-16 units - see the module docstring. */
function textLength(text: string): number {
    return [...text].length;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive whole-word match. A word boundary, not a substring
 * search: "art" must not match inside "party".
 */
export function containsWord(text: string, word: string): boolean {
    // The word comes from the vendored ruleset and goes through
    // escapeRegExp first, exactly as the Python original passes it
    // through re.escape.
    // eslint-disable-next-line security/detect-non-literal-regexp
    const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}_])${escapeRegExp(word)}(?![\\p{L}\\p{N}_])`,
        "iu",
    );
    return pattern.test(text);
}

/** True unless the text holds an unpaired surrogate. */
function isUtf8Safe(text: string): boolean {
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = text.charCodeAt(index + 1);
            if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return false;
            index += 1;
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            return false;
        }
    }
    return true;
}

/** Zero-width characters plus any control/format character not allowed. */
function hasHiddenOrControlChars(text: string): boolean {
    for (const character of text) {
        if (ZERO_WIDTH_CHARS.has(character)) return true;
        if (ALLOWED_CONTROL_CHARS.has(character)) continue;
        if (CONTROL_OR_FORMAT_RE.test(character)) return true;
    }
    return false;
}

/**
 * The opening phrase when the text looks like it starts with an
 * imperative verb for this language, else null. Combines the
 * morphological pattern (de/fr) with an exact match against the
 * leading-only words - too common to block anywhere, unambiguous as an
 * opener (#828).
 */
export function startsWithImperativeVerb(
    text: string,
    language: string,
    leadingOnlyWords: string[] = [],
): string | null {
    const stripped = text.trim();

    if (leadingOnlyWords.length > 0) {
        const leading = LEADING_WORD_RE.exec(stripped);
        if (leading) {
            const firstWord = leading[1];
            for (const candidate of leadingOnlyWords) {
                if (firstWord.toLowerCase() === candidate.toLowerCase()) {
                    return firstWord;
                }
            }
        }
    }

    const pattern = LEADING_IMPERATIVE_PATTERNS[language];
    if (!pattern) return null;
    const match = pattern.exec(stripped);
    if (!match) return null;
    if (language === "fr" && FR_LEADING_EZ_EXCEPTIONS.has(match[0].toLowerCase())) {
        return null;
    }
    return match[0];
}

function finding(
    field: string,
    severity: "error" | "warning",
    code: string,
    message: string,
    params?: Record<string, string>,
): AplusFinding {
    return params
        ? { field, severity, code, message, params }
        : { field, severity, code, message };
}

/** Every hard and soft rule that applies to one free-text field. */
function checkTextField(
    field: string,
    text: string,
    options: {
        maxLength: number | null;
        language: string;
        genreKey: string | null;
        ruleset: AplusRuleset;
    },
): AplusFinding[] {
    const findings: AplusFinding[] = [];
    if (!text) return findings;

    if (!isUtf8Safe(text)) {
        findings.push(
            finding(
                field,
                "error",
                "invalid_character",
                "Text contains an invalid character.",
            ),
        );
    }

    if (DASH_RE.test(text)) {
        findings.push(
            finding(
                field,
                "error",
                "dash_not_allowed",
                "Em dash or en dash found; use a plain hyphen or rewrite the sentence.",
            ),
        );
    }

    if (EMOJI_RE.test(text)) {
        findings.push(
            finding(field, "error", "emoji_not_allowed", "Emoji is not allowed."),
        );
    }

    if (hasHiddenOrControlChars(text)) {
        findings.push(
            finding(
                field,
                "error",
                "hidden_character",
                "Hidden or control character found (zero-width space, BOM, or similar).",
            ),
        );
    }

    const length = textLength(text);
    if (options.maxLength !== null && length > options.maxLength) {
        findings.push(
            finding(
                field,
                "error",
                "over_max_length",
                `Text is ${length} characters, over the ${options.maxLength} limit.`,
                { length: String(length), max: String(options.maxLength) },
            ),
        );
    }

    const rules: AplusLanguageRules = languageRules(options.ruleset, options.language);

    let matchedImperative = false;
    for (const imperative of rules.marketing_imperatives) {
        if (containsWord(text, imperative)) {
            findings.push(
                finding(
                    field,
                    "error",
                    "marketing_imperative",
                    `Marketing imperative '${imperative}' is not allowed in A+ text.`,
                    { term: imperative },
                ),
            );
            matchedImperative = true;
            break;
        }
    }

    if (!matchedImperative) {
        const leading = startsWithImperativeVerb(
            text,
            options.language,
            rules.leading_only_imperatives,
        );
        if (leading !== null) {
            findings.push(
                finding(
                    field,
                    "error",
                    "leading_imperative",
                    `Text opens with an imperative verb form ('${leading}'); ` +
                        "A+ copy must not command the reader.",
                    { term: leading },
                ),
            );
        }
    }

    for (const term of rules.price_shipping_terms) {
        if (containsWord(text, term)) {
            findings.push(
                finding(
                    field,
                    "error",
                    "price_claim",
                    `Price, shipping or availability claim ('${term}') is not allowed.`,
                    { term },
                ),
            );
            break;
        }
    }

    const lowered = text.toLowerCase();
    for (const brand of options.ruleset.competitor_brands) {
        if (lowered.includes(brand.toLowerCase())) {
            findings.push(
                finding(
                    field,
                    "error",
                    "brand_reference",
                    `Third-party brand reference ('${brand}') is not allowed.`,
                    { term: brand },
                ),
            );
            break;
        }
    }

    const escalated = new Set(escalatedWords(rules, options.genreKey));
    for (const word of rules.soft_words_default) {
        if (!containsWord(text, word)) continue;
        findings.push(
            escalated.has(word)
                ? finding(
                      field,
                      "error",
                      "genre_word_forbidden",
                      `'${word}' is not appropriate for this genre.`,
                      { term: word },
                  )
                : finding(
                      field,
                      "warning",
                      "genre_word_tone",
                      `'${word}' may not fit the intended tone; review before use.`,
                      { term: word },
                  ),
        );
    }

    return findings;
}

function checkAltText(
    field: string,
    altText: string,
    maxLength: number,
): AplusFinding[] {
    if (!altText || !altText.trim()) {
        return [
            finding(
                field,
                "error",
                "alt_text_required",
                "Alt text is required and cannot be empty.",
            ),
        ];
    }
    const length = textLength(altText);
    if (length > maxLength) {
        return [
            finding(
                field,
                "error",
                "alt_text_over_max_length",
                `Alt text is ${length} characters, over the ${maxLength} limit.`,
                { length: String(length), max: String(maxLength) },
            ),
        ];
    }
    return [];
}

/**
 * Every deterministic rule against `pkg`, errors and warnings together,
 * in the Python validator's field order: short_description, bullets,
 * header, images.
 *
 * `genreKey` is the lowercased genre/style key (e.g. `"kinderbuch"`)
 * that escalates a soft word from a tone warning to an error; an
 * unknown key behaves like no key rather than throwing.
 */
export function validateAplusPackage(
    pkg: AplusPackage,
    options: {
        language: string;
        genreKey?: string | null;
        ruleset?: AplusRuleset;
    },
): AplusFinding[] {
    const ruleset = options.ruleset ?? getAplusRuleset();
    const limits = ruleset.schema_limits;
    const shared = {
        language: options.language,
        genreKey: options.genreKey ?? null,
        ruleset,
    };
    const findings: AplusFinding[] = [];

    findings.push(
        ...checkTextField("short_description", pkg.short_description, {
            ...shared,
            maxLength: limits.short_description,
        }),
    );

    const bullets = pkg.bullets ?? [];
    if (bullets.length !== 3) {
        findings.push(
            finding(
                "bullets",
                "error",
                "bullet_count",
                `Exactly 3 bullets are required, got ${bullets.length}.`,
                { count: String(bullets.length) },
            ),
        );
    }
    bullets.forEach((bullet, index) => {
        findings.push(
            ...checkTextField(`bullets[${index}].heading`, bullet.heading, {
                ...shared,
                maxLength: limits.bullet_heading,
            }),
        );
        findings.push(
            ...checkTextField(`bullets[${index}].body`, bullet.body, {
                ...shared,
                maxLength: limits.bullet_body,
            }),
        );
    });

    findings.push(
        ...checkTextField("module_header.text", pkg.module_header.text, {
            ...shared,
            maxLength: null,
        }),
    );
    findings.push(
        ...checkAltText(
            "module_header.alt_text",
            pkg.module_header.alt_text,
            limits.alt_text,
        ),
    );

    const images = pkg.module_three_images ?? [];
    if (images.length !== 3) {
        findings.push(
            finding(
                "module_three_images",
                "error",
                "image_count",
                `Exactly 3 image entries are required, got ${images.length}.`,
                { count: String(images.length) },
            ),
        );
    }
    images.forEach((entry, index) => {
        findings.push(
            ...checkTextField(`module_three_images[${index}].text`, entry.text, {
                ...shared,
                maxLength: null,
            }),
        );
        findings.push(
            ...checkAltText(
                `module_three_images[${index}].alt_text`,
                entry.alt_text,
                limits.alt_text,
            ),
        );
    });

    return findings;
}
