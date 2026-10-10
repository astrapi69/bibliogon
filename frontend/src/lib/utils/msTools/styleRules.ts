/**
 * The style checker's data tables, shared by the two client-side
 * consumers: `chapterMetrics.ts` (counts + ratios for the Quality tab)
 * and `styleFindings.ts` (offset-bearing findings for the editor).
 *
 * They mirror `plugin-ms-tools`'s `style_checker.py` and its
 * `content/fillers/*.yaml` word lists. One copy rather than one per
 * consumer, because a second copy is how two consumers drift apart -
 * and behaviour is pinned against output recorded from the Python
 * checker itself (`styleFindings.parity.json`), so an edit to a YAML
 * list that does not reach here fails a test rather than quietly
 * changing what the Quality tab counts (#733).
 *
 * Word matching uses `[\p{L}\p{N}_]` with the `u` flag throughout,
 * because Python's `\w` is Unicode-aware while JavaScript's is ASCII -
 * a literal transcription would stop matching at the first umlaut.
 */

/** Filler word lists per language (mirrors content/fillers/{lang}.yaml). */
export const FILLER_WORDS: Record<string, string[]> = {
    de: [
        "eigentlich", "sozusagen", "quasi", "irgendwie", "gewissermaßen",
        "grundsätzlich", "im Grunde", "im Prinzip", "halt", "eben",
        "einfach", "wirklich", "ziemlich", "relativ", "durchaus",
        "natürlich", "selbstverständlich", "offensichtlich", "offenbar",
        "ja", "nun", "also", "jedenfalls", "übrigens", "bekanntlich",
        "naja", "tja", "sicherlich", "gewiss", "freilich",
    ],
    en: [
        "actually", "basically", "essentially", "literally", "virtually",
        "really", "very", "quite", "rather", "somewhat",
        "just", "simply", "honestly", "frankly", "obviously",
        "clearly", "definitely", "certainly", "surely", "perhaps",
        "kind of", "sort of", "you know", "I mean", "in fact",
        "as a matter of fact", "to be honest", "needless to say",
    ],
    es: [
        "realmente", "basicamente", "obviamente", "literalmente", "simplemente",
        "en realidad", "de hecho", "la verdad", "digamos", "o sea",
        "bueno", "pues", "como que", "tipo", "practicamente",
    ],
    fr: [
        "vraiment", "en fait", "justement", "effectivement", "absolument",
        "franchement", "quand meme", "en gros", "genre", "bon",
        "bref", "voila", "du coup", "en quelque sorte", "disons",
    ],
};

/** Passive-voice detectors per language (mirror PASSIVE_PATTERNS). */
/** Passive-voice indicators per language. */
export const PASSIVE_PATTERNS: Record<string, RegExp[]> = {
    de: [
        /\b(wird|werden|wurde|wurden|worden|werde|wirst|werdet)\b\s+\w+t\b/giu,
        /\b(ist|sind|war|waren)\b\s+\w+(t|en)\s+worden\b/giu,
    ],
    en: [
        /\b(is|are|was|were|been|being|be)\b\s+(\w+\s+)?(written|taken|made|done|seen|given|told|found|known|called|used|said|asked|built|held|kept|left|lost|paid|read|run|set|shown|thought|understood|won|\w+ed)\b/giu,
    ],
};

/** Adverb suffixes per language. */
export const ADVERB_SUFFIXES: Record<string, string[]> = {
    de: ["lich", "weise", "falls", "lings", "waerts"],
    en: ["ly"],
    es: ["mente"],
    fr: ["ment"],
};

/** Adjective suffixes per language; German adds DE_INFLECTION. */
export const ADJECTIVE_SUFFIXES: Record<string, string[]> = {
    de: ["ig", "isch", "bar", "sam", "haft", "los", "voll", "reich", "arm"],
    en: ["ous", "ive", "ful", "less", "able", "ible", "ical"],
    es: ["oso", "osa", "ivo", "iva", "ble"],
    fr: ["eux", "euse", "ble"],
};

/** Words ending in an adjective suffix that are not adjectives. */
export const ADJECTIVE_FALSE_POSITIVES: Record<string, Set<string>> = {
    de: new Set([
        "landschaft", "gesellschaft", "wissenschaft", "wirtschaft",
        "botschaft", "mannschaft", "eigenschaft", "bereitschaft",
        "nachbarschaft", "freundschaft", "leidenschaft", "herrschaft",
    ]),
    en: new Set([
        "table", "able", "cable", "fable", "stable", "double", "trouble",
        "give", "live", "have", "five", "drive", "arrive",
        "house", "mouse", "because", "use", "refuse", "excuse",
        "bus", "plus", "us", "thus", "focus", "bonus", "campus",
    ]),
    es: new Set(),
    fr: new Set(),
};

/** Words excluded from repetition detection. */
export const STOP_WORDS: Record<string, ReadonlySet<string>> = {
    de: new Set(["aber", "als", "an", "auch", "auf", "aus", "bei", "da", "das", "dass", "dem", "den", "der", "des", "die", "du", "ein", "eine", "einem", "einen", "einer", "er", "es", "für", "haben", "hat", "ich", "ihr", "in", "ist", "man", "mit", "nach", "nicht", "noch", "oder", "schon", "sich", "sie", "sind", "so", "um", "und", "von", "vor", "war", "wenn", "werden", "wie", "wir", "wird", "zu"]),
    en: new Set(["a", "an", "and", "are", "as", "at", "be", "but", "by", "do", "for", "from", "had", "has", "have", "he", "i", "if", "in", "is", "it", "not", "of", "on", "or", "she", "so", "that", "the", "they", "this", "to", "was", "we", "were", "will", "with", "would", "you"]),
};

/** Redundant phrase -> the shorter form that suffices. */
export const REDUNDANT_PHRASES: Record<
    string,
    readonly (readonly [string, string])[]
> = {
    de: [
        ["persoenliche Meinung", "Meinung"],
        ["zukuenftige Plaene", "Plaene"],
        ["kurze Zusammenfassung", "Zusammenfassung"],
        ["komplett fertig", "fertig"],
        ["voellig überfluessig", "überfluessig"],
        ["bereits schon", "bereits"],
        ["nochmals wieder", "nochmals"],
        ["gemeinsam zusammen", "gemeinsam"],
        ["einzelne Details", "Details"],
        ["neue Innovation", "Innovation"],
        ["freies Geschenk", "Geschenk"],
        ["aktuelle Gegenwart", "Gegenwart"],
        ["runde Form", "Form"],
        ["weiter fortsetzen", "fortsetzen"],
        ["vorher planen", "planen"],
    ],
    en: [
        ["personal opinion", "opinion"],
        ["future plans", "plans"],
        ["brief summary", "summary"],
        ["completely finished", "finished"],
        ["absolutely essential", "essential"],
        ["advance planning", "planning"],
        ["added bonus", "bonus"],
        ["end result", "result"],
        ["free gift", "gift"],
        ["past history", "history"],
        ["new innovation", "innovation"],
        ["completely eliminate", "eliminate"],
        ["each and every", "each"],
        ["basic fundamentals", "fundamentals"],
        ["close proximity", "proximity"],
    ],
};

/** German adjective inflection endings that may follow the stem. */
export const DE_INFLECTION = "(?:e[rsnm]?|em)?";

/** Sentence-length and repetition-window defaults. */
export const DEFAULT_MAX_SENTENCE_LENGTH = 25;
export const DEFAULT_REPETITION_WINDOW = 50;

/** One word character. Unicode-aware, as Python's `\w` is. */
export const WORD_CLASS = "[\\p{L}\\p{N}_]";
