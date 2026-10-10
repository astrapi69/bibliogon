import { describe, expect, it } from "vitest";

import { aiErrorText } from "./aiErrorText";
import type { AiErrorKind } from "../../ai/llmClient";

/** The identity translator: returns the fallback, as the app's `t` does
 *  for a key no catalog carries yet. */
const t = (_key: string, fallback: string) => fallback;

/** Echoes the key instead, so a case can assert WHICH key was asked for. */
const keyOf = (key: string, _fallback: string) => key;

describe("aiErrorText", () => {
    const cases: [AiErrorKind, string][] = [
        ["auth_error", "ui.settings.ai_err_auth"],
        ["rate_limited", "ui.settings.ai_err_rate"],
        ["model_not_found", "ui.settings.ai_err_model"],
        ["invalid_request", "ui.settings.ai_err_invalid"],
        ["server_error", "ui.settings.ai_err_server"],
        ["cors", "ui.settings.ai_test_fail"],
        ["unknown", "ui.settings.ai_test_fail"],
    ];

    it.each(cases)("maps %s to %s", (kind, key) => {
        expect(aiErrorText(kind, keyOf)).toBe(key);
    });

    it("covers every kind the classifier can return", () => {
        // A new kind added to `AiErrorKind` without an entry here falls
        // into the default and silently reads "Verbindung fehlgeschlagen"
        // on every surface. The list is the reminder.
        const kinds: AiErrorKind[] = [
            "cors",
            "auth_error",
            "rate_limited",
            "model_not_found",
            "invalid_request",
            "server_error",
            "unknown",
        ];
        expect(cases.map(([kind]) => kind).sort()).toEqual([...kinds].sort());
    });

    it("returns the fallback sentence when the catalog has no entry", () => {
        expect(aiErrorText("auth_error", t)).toBe("API-Schlüssel ungültig");
    });
});
