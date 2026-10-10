/**
 * Browser-direct A+ Content generation (#890 stage 3b).
 *
 * The seam half of the port: everything that decides WHAT the model is
 * asked and what its answer becomes lives in `lib/aplus/` and is
 * pinned against the Python's own recorded output. This module only
 * reads the book through the storage seam, resolves the language, and
 * hands the loop a `chat` that calls the user's own provider with the
 * key in their browser.
 *
 * It mirrors `POST /aplus/{book_id}/generate` step for step, with two
 * deliberate differences, both named in `lib/aplus/generate.ts`:
 * `_is_ai_enabled()` becomes {@link isAiConfigured}, and the
 * `aplus_content` cache is not ported because nothing reads it - the
 * only caller asks for a fresh package and the result is written into
 * the editable A+ document, which has been in the storage seam since
 * #891.
 *
 * @example
 * const result = await generateAplusOffline(bookId, { language: "de" });
 * if (isAplusMissingFields(result)) showMissing(result.missing_fields);
 */

import type { AplusMissingFields, AplusPackage } from "../../api/platform/aplus";
import { buildBookContext, findMissingFields } from "../../lib/aplus/bookContext";
import { generateAplusPackage, type AplusChatFn } from "../../lib/aplus/generate";
import { withRenderedPrompts } from "../../lib/aplus/imagePrompts";
import { getAplusRuleset } from "../../lib/aplus/ruleset";
import { getStorage } from "../../storage";
import { AiNotConfiguredError } from "../aiComplete";
import { aiChat, getAiConfig, isAiConfigured } from "../llmClient";

/**
 * Token budget for one attempt.
 *
 * The reply is a short_description, three bullets, a header module and
 * three tiles - longer than the 1024-token default the client uses for
 * a single field, and a reply truncated mid-YAML parses to a partial
 * mapping that the validator then reports as a dozen empty fields.
 */
const APLUS_RESPONSE_MAX_TOKENS = 2048;

/** Thrown when the requested language is outside the ruleset's set. */
export class AplusLanguageError extends Error {
    constructor(language: string, supported: readonly string[]) {
        super(`Unsupported language ${JSON.stringify(language)}; expected one of ${supported.join(", ")}`);
        this.name = "AplusLanguageError";
    }
}

/**
 * Generate a package for the book in the browser.
 *
 * Returns the missing-fields answer instead of a package when the book
 * lacks a required field - the same short-circuit the route does, and
 * for the same reason: a provider call on a book with no author and no
 * description cannot produce anything.
 *
 * Throws {@link AiNotConfiguredError} when no usable provider config
 * exists, {@link AplusLanguageError} for a language the ruleset does
 * not cover, and propagates the client's `AiClientError` on a
 * provider or transport failure.
 */
export async function generateAplusOffline(
    bookId: string,
    options: { language?: string } = {},
): Promise<AplusPackage | AplusMissingFields> {
    const config = await getAiConfig();
    if (!isAiConfigured(config)) throw new AiNotConfiguredError();

    const book = await getStorage().books.get(bookId);
    const missing = findMissingFields(book);
    if (missing.length > 0) return { book_id: bookId, missing_fields: missing };

    const rules = getAplusRuleset();
    const context = buildBookContext(book);
    const language = options.language || context.language;
    if (!rules.supported_languages.includes(language)) {
        throw new AplusLanguageError(language, rules.supported_languages);
    }

    const chat: AplusChatFn = async (messages, chatOptions) => {
        const reply = await aiChat(config, messages, {
            temperature: chatOptions.temperature,
            maxTokens: APLUS_RESPONSE_MAX_TOKENS,
        });
        return { content: reply.content, model: reply.model };
    };

    const pkg = await generateAplusPackage(
        { ...context, language },
        { language, rules, chat },
    );
    return withRenderedPrompts(pkg);
}
