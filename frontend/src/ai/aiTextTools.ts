/**
 * Browser-direct AI text tools: grammar correction + translation (#661).
 *
 * The offline (Dexie / PWA) browser-direct path for two editor selection
 * tools. Both send the selected text (or full text) to the user's configured
 * provider via {@link aiChat} and return ONLY the rewritten text, so the editor
 * can offer the result as an apply-or-discard suggestion. Like {@link aiFill}
 * these run entirely in the browser against the user's own key (stored in
 * IndexedDB, sent only to the provider); online the backend LanguageTool /
 * DeepL plugins remain the desktop-premium path.
 */

import {
    AiClientError,
    aiChat,
    getAiConfig,
    isAiConfigured,
    type AiConfig,
} from "./llmClient";

/** Conservative generation settings: grammar/translation are deterministic
 *  rewrites, so a low temperature keeps the model from paraphrasing. */
const MAX_TOKENS = 2048;
const TEMPERATURE = 0.2;

export interface AiTextResult {
    /** The rewritten (corrected or translated) text. */
    text: string;
    /** Total tokens the provider reported for the call. */
    tokens: number;
}

async function requireAiConfig(): Promise<AiConfig> {
    const config = await getAiConfig();
    if (!isAiConfigured(config)) {
        throw new AiClientError("AI is not configured");
    }
    return config;
}

/** Strip a leading/trailing Markdown code fence the model sometimes wraps the
 *  answer in, plus surrounding whitespace, so the result drops cleanly back
 *  into the editor. */
function cleanCompletion(raw: string): string {
    let text = raw.trim();
    const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(text);
    if (fence) text = fence[1].trim();
    return text;
}

/**
 * Correct the grammar, spelling and punctuation of `text` while preserving its
 * wording, meaning, tone and (critically) its original language. Returns the
 * corrected text only.
 *
 * @example
 * const { text } = await aiCorrectGrammar("i has went to the store");
 * // text === "I have gone to the store."
 */
export async function aiCorrectGrammar(text: string): Promise<AiTextResult> {
    const config = await requireAiConfig();
    const result = await aiChat(
        config,
        [
            {
                role: "system",
                content:
                    "You are a meticulous proofreader. You correct grammar, " +
                    "spelling and punctuation while preserving the author's " +
                    "wording, meaning, tone and the original language. You never " +
                    "translate the text and you never add commentary.",
            },
            {
                role: "user",
                content:
                    "Correct the grammar, spelling and punctuation of the text " +
                    "below. Keep the original language. Return ONLY the corrected " +
                    "text, with no commentary, quotes or code fences.\n\n" +
                    text,
            },
        ],
        { maxTokens: MAX_TOKENS, temperature: TEMPERATURE },
    );
    return { text: cleanCompletion(result.content), tokens: result.usage.total_tokens };
}

/**
 * Translate `text` into the language named by `targetLanguage` (a human-readable
 * endonym such as "Deutsch" or "Français"). The source language is auto-detected
 * unless `sourceLanguage` is given. Returns the translation only.
 *
 * @example
 * const { text } = await aiTranslate("Guten Morgen", "English");
 * // text === "Good morning"
 */
export async function aiTranslate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
): Promise<AiTextResult> {
    const config = await requireAiConfig();
    const from = sourceLanguage ? `from ${sourceLanguage} ` : "";
    const result = await aiChat(
        config,
        [
            {
                role: "system",
                content:
                    "You are a professional translator. You translate text " +
                    "accurately, preserving meaning, tone and paragraph breaks, " +
                    "and you never add commentary.",
            },
            {
                role: "user",
                content:
                    `Translate the text below ${from}into ${targetLanguage}. ` +
                    "Return ONLY the translation, with no commentary, quotes or " +
                    "code fences.\n\n" +
                    text,
            },
        ],
        { maxTokens: MAX_TOKENS, temperature: TEMPERATURE },
    );
    return { text: cleanCompletion(result.content), tokens: result.usage.total_tokens };
}
