/**
 * SETT-L-1 C1 regression pins for SettingsSidebar.
 *
 * Covers the structural shell: all groups render, all items
 * carry the canonical ``settings-tab-{value}`` testid so E2E
 * specs that target those ids keep passing, active state pins
 * via ``aria-current="page"`` + ``onChange`` fires with the
 * clicked item's value.
 *
 * Visual treatment (group headers, Danger-Zone red accent)
 * lands in C3 and gets its own coverage there.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {SettingsSidebar, type SidebarGroup} from "./SettingsSidebar";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

const groups: SidebarGroup[] = [
    {
        key: "darstellung",
        items: [
            {value: "erscheinungsbild", label: "Erscheinungsbild", testId: "settings-tab-erscheinungsbild"},
            {value: "verhalten", label: "Verhalten", testId: "settings-tab-verhalten"},
            {value: "editor", label: "Editor", testId: "settings-tab-editor"},
        ],
    },
    {
        key: "inhalt",
        items: [
            {value: "ai", label: "KI-Assistent", testId: "settings-tab-ai"},
            {value: "autoren", label: "Autoren", testId: "settings-tab-autoren"},
            {value: "topics", label: "Themen", testId: "settings-tab-topics"},
        ],
    },
    {
        key: "system",
        items: [
            {value: "plugins", label: "Plugins", testId: "settings-tab-plugins"},
            {value: "comments", label: "Kommentare", testId: "settings-tab-comments"},
            {value: "backups", label: "Backups", testId: "settings-tab-backups"},
            {value: "erweitert", label: "Erweitert", testId: "settings-tab-erweitert"},
        ],
    },
    {
        key: "info",
        items: [
            {value: "about", label: "Über", testId: "settings-tab-about"},
        ],
    },
    {
        key: "danger",
        items: [
            {value: "danger_zone", label: "Gefahrenzone", testId: "settings-tab-danger-zone"},
        ],
    },
];

describe("SettingsSidebar", () => {
    it("renders the nav landmark with an accessible label", async () => {
        render(<SettingsSidebar groups={groups} activeTab="erscheinungsbild" onChange={vi.fn()}/>);
        const nav = await screen.findByTestId("settings-sidebar");
        expect(nav.tagName).toBe("NAV");
        expect(nav).toHaveAttribute("aria-label", "Einstellungs-Navigation");
    });

    it("renders all five groups", async () => {
        render(<SettingsSidebar groups={groups} activeTab="erscheinungsbild" onChange={vi.fn()}/>);
        for (const g of groups) {
            expect(await screen.findByTestId(`settings-sidebar-group-${g.key}`)).toBeTruthy();
        }
    });

    it("renders every item with its canonical testid + label", async () => {
        render(<SettingsSidebar groups={groups} activeTab="erscheinungsbild" onChange={vi.fn()}/>);
        for (const g of groups) {
            for (const item of g.items) {
                const node = await screen.findByTestId(item.testId);
                expect(node).toBeTruthy();
                expect(node.textContent).toContain(item.label);
            }
        }
    });

    it("marks the active item with aria-current='page' and no others", async () => {
        render(<SettingsSidebar groups={groups} activeTab="autoren" onChange={vi.fn()}/>);
        const active = await screen.findByTestId("settings-tab-autoren");
        expect(active).toHaveAttribute("aria-current", "page");
        // Spot-check two siblings to confirm they are NOT marked.
        const inactive1 = screen.getByTestId("settings-tab-erscheinungsbild");
        const inactive2 = screen.getByTestId("settings-tab-plugins");
        expect(inactive1.getAttribute("aria-current")).toBeNull();
        expect(inactive2.getAttribute("aria-current")).toBeNull();
    });

    it("fires onChange with the clicked item's value", () => {
        const onChange = vi.fn();
        render(<SettingsSidebar groups={groups} activeTab="erscheinungsbild" onChange={onChange}/>);
        fireEvent.click(screen.getByTestId("settings-tab-plugins"));
        expect(onChange).toHaveBeenCalledWith("plugins");
        fireEvent.click(screen.getByTestId("settings-tab-danger-zone"));
        expect(onChange).toHaveBeenCalledWith("danger_zone");
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("omits conditional items when not present in the groups prop", async () => {
        // The Support item is only rendered when donations config is
        // present. Re-render without it and assert it is absent.
        render(<SettingsSidebar groups={groups} activeTab="erscheinungsbild" onChange={vi.fn()}/>);
        expect(screen.queryByTestId("settings-tab-support")).toBeNull();
    });
});
