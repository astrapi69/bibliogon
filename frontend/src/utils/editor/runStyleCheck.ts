/**
 * The editor's style check, against whichever implementation this build
 * has (#733).
 *
 * Online the backend answers; in the backendless build there is no
 * backend, so the same checks run in the browser from
 * `lib/utils/msTools/styleFindings`. The same shape comes back either
 * way, so the callers do not branch - the one branch lives here.
 *
 * This wrapper sits outside `lib/` on purpose: it reaches for
 * `getStorage()` and `api`, which a library-grade module may not. The
 * checker itself takes no dependency on either.
 *
 * The thresholds follow the backend's documented order as far as a
 * browser can: the book's own overrides beat the built-in defaults. The
 * plugin-config tier has no offline equivalent - a backendless build
 * ships no plugin config - so the default there is the code default,
 * which is why the two modes can still disagree on a book that sets
 * neither (#1042).
 *
 * @example
 * const {findings} = await runStyleCheck(editor.getText(), "de", bookId);
 * editor.commands.setStyleFindings(findings);
 */

import { api } from "../../api/client";
import { getStorage } from "../../storage";
import {
    checkStyle,
    type StyleCheckOptions,
    type StyleCheckResult,
} from "../../lib/utils/msTools/styleFindings";
import { toUtf16Offsets } from "../../lib/utils/msTools/styleOffsets";

export async function runStyleCheck(
    text: string,
    language: string,
    bookId?: string,
): Promise<StyleCheckResult> {
    const storage = getStorage();
    if (storage.mode === "dexie") {
        // Already UTF-16: the browser checker indexes the same JavaScript
        // string the editor walks. Converting here would shift every
        // finding a second time (#1039).
        return checkStyle(text, language, await bookThresholds(storage, bookId));
    }
    const result = (await api.msTools.check(
        text,
        language,
        bookId,
    )) as StyleCheckResult;
    // The backend reports code-point offsets, because that is how Python
    // indexes a string. The editor maps them by walking a JavaScript
    // string, where an astral character takes two units, so without this
    // every finding after an emoji is highlighted one character short per
    // astral character before it (#1039). Converted on arrival rather
    // than in the backend: the API's offsets stay meaningful to a Python
    // consumer, and the only consumer needing UTF-16 is this one.
    return { ...result, findings: toUtf16Offsets(text, result.findings) };
}

/**
 * The book's threshold overrides, or none when it has not set any.
 *
 * A failed read is not worth failing the check over: the defaults are
 * what the user would have got anyway.
 */
async function bookThresholds(
    storage: ReturnType<typeof getStorage>,
    bookId?: string,
): Promise<StyleCheckOptions> {
    if (!bookId) return {};
    try {
        const book = await storage.books.get(bookId);
        const options: StyleCheckOptions = {};
        if (book.ms_tools_max_sentence_length != null) {
            options.maxSentenceLength = book.ms_tools_max_sentence_length;
        }
        if (book.ms_tools_repetition_window != null) {
            options.repetitionWindow = book.ms_tools_repetition_window;
        }
        return options;
    } catch {
        return {};
    }
}
