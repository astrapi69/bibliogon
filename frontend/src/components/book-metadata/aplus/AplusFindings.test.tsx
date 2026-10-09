/**
 * Pins the localized rendering of validator findings (#889).
 *
 * The validator's `message` is English, which a German, French or
 * Spanish UI used to show verbatim. A finding now carries a stable
 * `code` plus `params`, and the catalogs carry one sentence per code;
 * `message` stays as the fallback for a code this build does not know
 * and for packages cached before codes existed.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import AplusFindings from "./AplusFindings";
import type { AplusFinding } from "../../../api/platform";

/** Stand-in for the app's `t`, which takes a key and a fallback and does
 *  no interpolation of its own - the placeholders are the component's job,
 *  as everywhere else in this codebase. */
const CATALOG: Record<string, string> = {
    "ui.aplus.finding.marketing_imperative": "Werbliche Aufforderung '{term}' ist nicht erlaubt.",
    "ui.aplus.finding.over_max_length": "Text hat {length} Zeichen, Grenze ist {max}.",
    "ui.aplus.finding_error": "Fehler",
    "ui.aplus.finding_warning": "Hinweis",
};
const t = (key: string, fallback?: string) => CATALOG[key] ?? fallback ?? key;

function finding(over: Partial<AplusFinding> = {}): AplusFinding {
    return {
        field: "short_description",
        severity: "error",
        message: "Marketing imperative 'Entdecken Sie' is not allowed in A+ text.",
        code: "marketing_imperative",
        params: { term: "Entdecken Sie" },
        ...over,
    };
}

describe("AplusFindings", () => {
    it("renders the catalog sentence for a known code, with its params", () => {
        render(<AplusFindings findings={[finding()]} t={t} />);
        expect(screen.getByTestId("aplus-findings").textContent).toContain(
            "Werbliche Aufforderung 'Entdecken Sie' ist nicht erlaubt.",
        );
    });

    it("interpolates every param of a length finding", () => {
        render(
            <AplusFindings
                findings={[
                    finding({
                        code: "over_max_length",
                        params: { length: "5000", max: "1000" },
                        message: "Text is 5000 characters, over the 1000 limit.",
                    }),
                ]}
                t={t}
            />,
        );
        expect(screen.getByTestId("aplus-findings").textContent).toContain(
            "Text hat 5000 Zeichen, Grenze ist 1000.",
        );
    });

    it("falls back to the English message for a code this build does not know", () => {
        render(
            <AplusFindings
                findings={[finding({ code: "a_rule_from_the_future", params: {} })]}
                t={t}
            />,
        );
        expect(screen.getByTestId("aplus-findings").textContent).toContain(
            "Marketing imperative 'Entdecken Sie' is not allowed in A+ text.",
        );
    });

    it("falls back for a package cached before codes existed", () => {
        const legacy = { field: "bullets", severity: "error", message: "Exactly 3 bullets." };
        render(<AplusFindings findings={[legacy as AplusFinding]} t={t} />);
        expect(screen.getByTestId("aplus-findings").textContent).toContain("Exactly 3 bullets.");
    });
});
