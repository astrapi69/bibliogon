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
 * @example
 * const {findings} = await runStyleCheck(editor.getText(), "de", bookId);
 * editor.commands.setStyleFindings(findings);
 */

import { api } from "../../api/client";
import { getStorage } from "../../storage";
import {
    checkStyle,
    type StyleCheckResult,
} from "../../lib/utils/msTools/styleFindings";

export async function runStyleCheck(
    text: string,
    language: string,
    bookId?: string,
): Promise<StyleCheckResult> {
    if (getStorage().mode === "dexie") {
        return checkStyle(text, language);
    }
    return (await api.msTools.check(text, language, bookId)) as StyleCheckResult;
}
