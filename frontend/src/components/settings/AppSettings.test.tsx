/**
 * Vitest coverage for AppSettings (SETT-PHASE-1-QUICK-WINS-01).
 *
 * Pins:
 * - C1: 4 dashboard-view selects are grouped inside the
 *   ``settings-dashboard-views`` sub-card. The sub-card carries
 *   the "Standard-Ansichten" heading (via
 *   ``ui.settings.dashboard_views_title``).
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {AppSettings} from "./AppSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

vi.mock("../SshKeySection", () => ({
    default: () => <div data-testid="stub-ssh-key-section"/>,
}));

vi.mock("../../api/client", () => ({
    api: {},
}));

describe("AppSettings — Advanced/White-Label section (SETT-QW-6)", () => {
    const baseConfig = {
        app: {default_language: "de"},
        ui: {
            title: "Bibliogon",
            theme: "warm-literary",
            dashboard: {books_view: "grid", articles_view: "list"},
        },
        plugins: {enabled: ["export", "help", "getstarted"]},
        editor: {},
    };

    it("renders an Erweitert section header above the White-Label toggle", () => {
        render(<AppSettings config={baseConfig} onSave={vi.fn()} saving={false}/>);
        const section = screen.getByTestId("advanced-section");
        expect(section).toHaveTextContent("Erweitert");
        expect(section).toHaveTextContent("White-Label: App anpassen");
    });

    it("starts collapsed (white-label-card not rendered)", () => {
        render(<AppSettings config={baseConfig} onSave={vi.fn()} saving={false}/>);
        // Radix Collapsible renders the content with hidden state when
        // closed. We assert via the aria-expanded attribute on the
        // toggle button.
        const toggle = screen.getByTestId("white-label-toggle");
        expect(toggle).toHaveAttribute("aria-expanded", "false");
    });
});

describe("AppSettings — dashboard-views sub-card (SETT-QW-1)", () => {
    const baseConfig = {
        app: {default_language: "de"},
        ui: {
            title: "Bibliogon",
            theme: "warm-literary",
            dashboard: {
                books_view: "grid",
                articles_view: "list",
                books_trash_view: "grid",
                articles_trash_view: "list",
            },
        },
        plugins: {enabled: ["export", "help", "getstarted"]},
        editor: {},
    };

    it("renders the dashboard-views sub-card with the Standard-Ansichten heading", () => {
        render(<AppSettings config={baseConfig} onSave={vi.fn()} saving={false}/>);
        const subCard = screen.getByTestId("settings-dashboard-views");
        expect(subCard).toBeInTheDocument();
        expect(subCard).toHaveTextContent("Standard-Ansichten");
    });

    it("groups all 4 dashboard-view selects inside the sub-card", () => {
        render(<AppSettings config={baseConfig} onSave={vi.fn()} saving={false}/>);
        const subCard = screen.getByTestId("settings-dashboard-views");
        // RadixSelect renders its trigger with ``${testId}-trigger``.
        expect(subCard.querySelector('[data-testid="settings-books-view-trigger"]')).not.toBeNull();
        expect(subCard.querySelector('[data-testid="settings-articles-view-trigger"]')).not.toBeNull();
        expect(subCard.querySelector('[data-testid="settings-books-trash-view-trigger"]')).not.toBeNull();
        expect(subCard.querySelector('[data-testid="settings-articles-trash-view-trigger"]')).not.toBeNull();
    });
});
