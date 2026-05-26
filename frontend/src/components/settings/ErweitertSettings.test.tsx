/**
 * Vitest coverage for ErweitertSettings
 * (SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01).
 *
 * Pins the new "Erweitert" tab — SshKeySection + White-Label
 * customisation lifted out of the catch-all "Allgemein" tab.
 * The Phase 1 Collapsible wrapper around White-Label is removed
 * since the tab itself is now the affordance.
 *
 * SshKeySection is stubbed so this test stays focused on the
 * White-Label save contract; SshKeySection has its own
 * regression-pin (SshKeySection.test.tsx).
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {ErweitertSettings} from "./ErweitertSettings";

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

describe("ErweitertSettings — Advanced tab (Phase 2)", () => {
    const baseConfig = {
        ui: {title: "Bibliogon", subtitle: "Authoring"},
        plugins: {enabled: ["export", "help", "getstarted", "audiobook"]},
    };

    it("renders the section heading + SshKeySection stub + White-Label card", () => {
        render(<ErweitertSettings config={baseConfig} onSave={vi.fn()} saving={false}/>);
        expect(screen.getByTestId("erweitert-settings")).toBeInTheDocument();
        expect(screen.getByText("Erweitert")).toBeInTheDocument();
        expect(screen.getByTestId("stub-ssh-key-section")).toBeInTheDocument();
        expect(screen.getByTestId("white-label-card")).toBeInTheDocument();
        expect(screen.getByTestId("white-label-app-name")).toHaveValue("Bibliogon");
        expect(screen.getByTestId("white-label-description")).toHaveValue("Authoring");
        expect(screen.getByTestId("white-label-core-export")).toBeChecked();
        expect(screen.getByTestId("white-label-core-help")).toBeChecked();
        expect(screen.getByTestId("white-label-core-getstarted")).toBeChecked();
    });

    it("invokes onSave with ui + plugins envelope, preserving non-core plugins", () => {
        const onSave = vi.fn();
        render(<ErweitertSettings config={baseConfig} onSave={onSave} saving={false}/>);
        fireEvent.click(screen.getByTestId("erweitert-settings-save"));
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith({
            ui: {title: "Bibliogon", subtitle: "Authoring"},
            plugins: {enabled: expect.arrayContaining(["export", "help", "getstarted", "audiobook"])},
        });
    });

    it("unchecking a core plugin removes it from the save payload", () => {
        const onSave = vi.fn();
        render(<ErweitertSettings config={baseConfig} onSave={onSave} saving={false}/>);
        fireEvent.click(screen.getByTestId("white-label-core-help"));
        fireEvent.click(screen.getByTestId("erweitert-settings-save"));
        const call = onSave.mock.calls[0][0] as {plugins: {enabled: string[]}};
        expect(call.plugins.enabled).not.toContain("help");
        expect(call.plugins.enabled).toContain("export");
        expect(call.plugins.enabled).toContain("audiobook");
    });
});
