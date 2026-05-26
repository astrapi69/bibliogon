/**
 * SETT-L-1 C2 regression pins for SettingsMobileMenu.
 *
 * The trigger button is the load-bearing surface — the portal-
 * mounted DropdownMenu content can't be reliably asserted under
 * happy-dom (per the "Radix DropdownMenu + happy-dom is brittle
 * for Vitest" lessons-learned rule). E2E covers the content;
 * Vitest here covers everything we can pin reliably:
 *
 * 1. Trigger renders with the canonical testid + aria-label so
 *    E2E specs targeting ``settings-tabs-mobile-trigger`` keep
 *    passing.
 * 2. The visible label reflects the current activeTab.
 * 3. The component still mounts when no donations config is
 *    present (Support item omitted from groups).
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {SettingsMobileMenu} from "./SettingsMobileMenu";
import type {SidebarGroup} from "./SettingsSidebar";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

const groupsWithSupport: SidebarGroup[] = [
    {
        key: "darstellung",
        items: [
            {value: "erscheinungsbild", label: "Erscheinungsbild", testId: "settings-tab-erscheinungsbild"},
            {value: "editor", label: "Editor", testId: "settings-tab-editor"},
        ],
    },
    {
        key: "info",
        items: [
            {value: "about", label: "Über", testId: "settings-tab-about"},
            {value: "support", label: "Unterstützen", testId: "settings-tab-support"},
        ],
    },
];

const groupsWithoutSupport: SidebarGroup[] = [
    {
        key: "darstellung",
        items: [
            {value: "erscheinungsbild", label: "Erscheinungsbild", testId: "settings-tab-erscheinungsbild"},
        ],
    },
];

describe("SettingsMobileMenu", () => {
    it("renders the trigger with the canonical testid + aria-label", () => {
        render(<SettingsMobileMenu groups={groupsWithSupport} activeTab="erscheinungsbild" onChange={vi.fn()}/>);
        const trigger = screen.getByTestId("settings-tabs-mobile-trigger");
        expect(trigger.tagName).toBe("BUTTON");
        expect(trigger).toHaveAttribute("aria-label", "Tab-Menü öffnen");
    });

    it("shows the active item's label on the trigger", () => {
        render(<SettingsMobileMenu groups={groupsWithSupport} activeTab="about" onChange={vi.fn()}/>);
        const trigger = screen.getByTestId("settings-tabs-mobile-trigger");
        expect(trigger.textContent).toContain("Über");
    });

    it("updates the trigger label when activeTab changes between renders", () => {
        const {rerender} = render(
            <SettingsMobileMenu groups={groupsWithSupport} activeTab="erscheinungsbild" onChange={vi.fn()}/>
        );
        expect(screen.getByTestId("settings-tabs-mobile-trigger").textContent).toContain("Erscheinungsbild");
        rerender(<SettingsMobileMenu groups={groupsWithSupport} activeTab="editor" onChange={vi.fn()}/>);
        expect(screen.getByTestId("settings-tabs-mobile-trigger").textContent).toContain("Editor");
    });

    it("mounts cleanly when groups omit the conditional Support item", () => {
        // Pins that the donations-absent path doesn't crash on render.
        render(<SettingsMobileMenu groups={groupsWithoutSupport} activeTab="erscheinungsbild" onChange={vi.fn()}/>);
        expect(screen.getByTestId("settings-tabs-mobile-trigger")).toBeTruthy();
    });

    it("renders an empty trigger label when activeTab is not in any group", () => {
        // Defensive: stale ?tab= URLs that the parser hasn't redirected
        // yet should still mount the trigger.
        render(<SettingsMobileMenu groups={groupsWithSupport} activeTab="nonexistent" onChange={vi.fn()}/>);
        const trigger = screen.getByTestId("settings-tabs-mobile-trigger");
        expect(trigger).toBeTruthy();
        // The visible <span> renders an empty string, the icon stays.
        const labelSpan = trigger.querySelector("span");
        expect(labelSpan?.textContent).toBe("");
    });
});
