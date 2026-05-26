/**
 * Vitest coverage for ErscheinungsbildSettings
 * (SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01).
 *
 * Pins the extracted "Erscheinungsbild" tab — Theme + Dashboard-
 * Views sub-card lifted out of the old catch-all "Allgemein" tab
 * into a dedicated focused tab.
 *
 * Behaviour-test (per ``.claude/rules/lessons-learned.md``
 * "End-to-end behaviour tests are not 'kwarg passes through'
 * tests"): assertions on the OBSERVABLE save payload, not just on
 * "did the prop fire."
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {ErscheinungsbildSettings} from "./ErscheinungsbildSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

describe("ErscheinungsbildSettings — extracted Appearance tab", () => {
    const baseConfig = {
        ui: {
            theme: "nord",
            dashboard: {
                books_view: "list",
                articles_view: "grid",
                books_trash_view: "list",
                articles_trash_view: "grid",
            },
        },
    };

    it("renders the section heading + theme select + all 4 dashboard-view selects", () => {
        render(<ErscheinungsbildSettings config={baseConfig} onSave={vi.fn()} saving={false}/>);
        expect(screen.getByTestId("erscheinungsbild-settings")).toBeInTheDocument();
        expect(screen.getByText("Erscheinungsbild")).toBeInTheDocument();
        expect(screen.getByTestId("palette-select-trigger")).toBeInTheDocument();
        const subCard = screen.getByTestId("settings-dashboard-views");
        expect(subCard.querySelector('[data-testid="settings-books-view-trigger"]')).not.toBeNull();
        expect(subCard.querySelector('[data-testid="settings-articles-view-trigger"]')).not.toBeNull();
        expect(subCard.querySelector('[data-testid="settings-books-trash-view-trigger"]')).not.toBeNull();
        expect(subCard.querySelector('[data-testid="settings-articles-trash-view-trigger"]')).not.toBeNull();
    });

    it("invokes onSave with the {ui: {theme, dashboard: {...}}} envelope on save click", () => {
        const onSave = vi.fn();
        render(<ErscheinungsbildSettings config={baseConfig} onSave={onSave} saving={false}/>);
        fireEvent.click(screen.getByTestId("erscheinungsbild-settings-save"));
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith({
            ui: {
                theme: "nord",
                dashboard: {
                    books_view: "list",
                    articles_view: "grid",
                    books_trash_view: "list",
                    articles_trash_view: "grid",
                },
            },
        });
    });
});
