/**
 * One translated sentence per AI error kind (#890 stage 3b).
 *
 * Lifted out of `AiAssistantSettings`, where it was a closure, when A+
 * generation became the second surface that reports a browser-direct
 * provider failure to the user. Two copies of this mapping drift into
 * two different answers for the same HTTP 401, which is the shape the
 * Recurring-Component rule exists to prevent.
 *
 * `t` is a parameter rather than a hook call so the function stays a
 * pure mapping and can be tested without a provider.
 *
 * NOTE two surfaces are deliberately NOT migrated: `useAiChapterReview`
 * and `AiTextTools` map only `cors` and send everything else to one
 * generic "AI nicht erreichbar". Routing them through here would change
 * the message a user sees for a rate limit or a bad model, which is a
 * product decision rather than a refactor - tracked separately.
 *
 * @example
 * notify.error(aiErrorText(classifyAiClientError(err), t), err);
 */

import type { AiErrorKind } from "../../ai/llmClient";

/** A translation lookup with a fallback, as every surface already has. */
export type TranslateFn = (key: string, fallback: string) => string;

export function aiErrorText(kind: AiErrorKind, t: TranslateFn): string {
    switch (kind) {
        case "auth_error":
            return t("ui.settings.ai_err_auth", "API-Schlüssel ungültig");
        case "rate_limited":
            return t(
                "ui.settings.ai_err_rate",
                "Rate Limit erreicht. Bitte später erneut versuchen.",
            );
        case "model_not_found":
            return t("ui.settings.ai_err_model", "Modell nicht verfügbar");
        case "invalid_request":
            return t("ui.settings.ai_err_invalid", "Ungültige Anfrage");
        case "server_error":
            return t("ui.settings.ai_err_server", "Server-Fehler beim Anbieter");
        default:
            return t("ui.settings.ai_test_fail", "Verbindung fehlgeschlagen");
    }
}
