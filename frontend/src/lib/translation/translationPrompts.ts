/**
 * Prompts for translating an article through the user's own AI provider
 * (#751).
 *
 * The browser has no DeepL path - `api-free.deepl.com` is a verify-first
 * question still open on the issue - so offline translation runs through
 * the same provider the rest of the app's AI features use. That changes
 * one thing structurally: a translation API returns a translation, while a
 * chat model returns whatever it feels like unless told otherwise, and the
 * rebuild downstream maps lines onto text nodes BY POSITION. A model that
 * helpfully merges two paragraphs silently destroys the mapping.
 *
 * So the prompt's job is mostly to constrain shape, and the caller still
 * has to survive the model ignoring it - which is what the
 * single-paragraph fallback in `articleTranslation.translatedBody` is for.
 *
 * Returns plain strings rather than provider messages so the module stays
 * free of the AI client.
 *
 * @example
 * const {system, user} = translationPrompt("Ein Satz.", {targetLang: "en"});
 */

/** Target-language names, for a prompt rather than a locale switch.
 *  Mirrors the eight Bibliogon ships UI for; an unknown code falls back
 *  to the code itself, which models handle acceptably. */
const LANGUAGE_NAMES: Record<string, string> = {
    de: "German",
    en: "English",
    es: "Spanish",
    fr: "French",
    pt: "Portuguese",
    el: "Greek",
    tr: "Turkish",
    ja: "Japanese",
};

export interface TranslationPromptOptions {
    targetLang: string;
    sourceLang?: string | null;
}

/** `English` from `en` or `en-GB`; the code itself when unknown. */
export function languageName(code: string | null | undefined): string {
    if (!code) return "";
    return LANGUAGE_NAMES[code.split("-")[0].toLowerCase()] ?? code;
}

export interface TranslationPrompt {
    system: string;
    user: string;
}

/**
 * A prompt that asks for a translation and nothing else.
 *
 * Every instruction here exists because its absence breaks something
 * downstream, not for politeness:
 *
 * - *same number of lines* keeps the positional rebuild valid;
 * - *no commentary, no quotes, no markdown fence* keeps the output from
 *   becoming a chat reply that gets written into the document verbatim;
 * - *keep names, code and URLs* stops a canonical URL or an identifier
 *   being "translated" into something that no longer resolves;
 * - *output nothing but the translation* covers the model that would
 *   otherwise explain its choices.
 */
export function translationPrompt(
    text: string,
    options: TranslationPromptOptions,
): TranslationPrompt {
    const target = languageName(options.targetLang);
    const source = languageName(options.sourceLang);
    const from = source ? ` from ${source}` : "";
    return {
        system: [
            `You are a translator. Translate the user's text${from} into ${target}.`,
            "Rules:",
            `- Output ONLY the translation. No commentary, no quotes, no markdown fences.`,
            "- Preserve the line structure exactly: the output must have the same",
            "  number of lines as the input, in the same order, including blank ones.",
            "- Translate prose only. Leave proper names, code, identifiers and URLs",
            "  unchanged.",
            "- Keep the register and tone of the original.",
        ].join("\n"),
        user: text,
    };
}

/**
 * A model's reply, reduced to the translation.
 *
 * Models wrap output in a fence or a leading "Here is the translation:"
 * often enough that trusting the raw reply means writing that sentence
 * into the user's article. Stripping a fence is safe - a fence is never
 * part of a prose translation - while anything more aggressive would risk
 * eating real content, so this does only what it can do without guessing.
 */
export function cleanTranslationReply(reply: string): string {
    const trimmed = reply.trim();
    const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/.exec(trimmed);
    return (fenced ? fenced[1] : trimmed).replace(/\s+$/, "");
}
