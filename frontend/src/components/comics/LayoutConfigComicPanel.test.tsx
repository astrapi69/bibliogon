/**
 * LayoutConfigComicPanel tests (PHASE-2-PANEL-CONFIG-01 C1).
 *
 * Pins:
 * - Mounts with a panel prop.
 * - Heading testid present.
 * - Tier1Section mounts under comic-panel testid prefix (RCU 3rd-site
 *   contract).
 * - writePanelConfig merges partial into existing panel_config and
 *   fires onChange.
 * - Existing panel_config value reflects through Tier1Section
 *   (background_color input echoes the persisted hex).
 * - null panel_config does not crash; defaults flow through.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import {LayoutConfigComicPanel} from "./LayoutConfigComicPanel";
import type {ComicPanelData} from "./ComicPanel";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

function makePanel(overrides: Partial<ComicPanelData> = {}): ComicPanelData {
    return {
        id: "p1",
        page_id: "page1",
        position: 0,
        image_asset_id: null,
        bounds: {},
        panel_config: null,
        ...overrides,
    };
}

describe("LayoutConfigComicPanel", () => {
    it("mounts with the layout-config-comic-panel testid", () => {
        render(
            <LayoutConfigComicPanel
                panel={makePanel()}
                onChange={() => {}}
            />,
        );
        expect(
            screen.getByTestId("layout-config-comic-panel"),
        ).toBeInTheDocument();
    });

    it("renders the Panel heading", () => {
        render(
            <LayoutConfigComicPanel
                panel={makePanel()}
                onChange={() => {}}
            />,
        );
        expect(screen.getByText("Panel")).toBeInTheDocument();
    });

    it("mounts Tier1Section under comic-panel testid prefix (RCU 3rd-site)", () => {
        render(
            <LayoutConfigComicPanel
                panel={makePanel()}
                onChange={() => {}}
            />,
        );
        expect(
            screen.getByTestId("comic-panel-tier1-trigger"),
        ).toBeInTheDocument();
    });

    it("writePanelConfig merges partial into existing panel_config and fires onChange", () => {
        const onChange = vi.fn();
        render(
            <LayoutConfigComicPanel
                panel={makePanel({
                    panel_config: {background_color: "#ffeeaa"},
                })}
                onChange={onChange}
            />,
        );
        // Open Tier1Section so its color input is in the DOM
        fireEvent.click(screen.getByTestId("comic-panel-tier1-trigger"));
        const backgroundInput = screen.getByTestId(
            "comic-panel-background-color",
        );
        fireEvent.change(backgroundInput, {target: {value: "#abcdef"}});
        // Tier1Section debounces color changes 300ms; wait via fake timers
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                expect(onChange).toHaveBeenCalled();
                const lastCall = onChange.mock.calls.at(-1)?.[0];
                expect(lastCall).toEqual({
                    panel_config: {
                        background_color: "#abcdef",
                    },
                });
                resolve();
            }, 350);
        });
    });

    it("reflects existing panel_config.background_color through Tier1Section", () => {
        render(
            <LayoutConfigComicPanel
                panel={makePanel({
                    panel_config: {background_color: "#123456"},
                })}
                onChange={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("comic-panel-tier1-trigger"));
        const backgroundInput = screen.getByTestId(
            "comic-panel-background-color",
        ) as HTMLInputElement;
        expect(backgroundInput.value).toBe("#123456");
    });

    it("does not crash when panel_config is null", () => {
        const {container} = render(
            <LayoutConfigComicPanel
                panel={makePanel({panel_config: null})}
                onChange={() => {}}
            />,
        );
        expect(container).toBeTruthy();
        expect(
            screen.getByTestId("layout-config-comic-panel"),
        ).toBeInTheDocument();
    });

    it("merge-spread preserves prior panel_config keys when changing one field", () => {
        const onChange = vi.fn();
        render(
            <LayoutConfigComicPanel
                panel={makePanel({
                    panel_config: {
                        background_color: "#ffeeaa",
                        border_color: "#000000",
                    },
                })}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByTestId("comic-panel-tier1-trigger"));
        const backgroundInput = screen.getByTestId(
            "comic-panel-background-color",
        );
        fireEvent.change(backgroundInput, {target: {value: "#ff0000"}});
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                const lastCall = onChange.mock.calls.at(-1)?.[0];
                expect(lastCall).toEqual({
                    panel_config: {
                        background_color: "#ff0000",
                        border_color: "#000000",
                    },
                });
                resolve();
            }, 350);
        });
    });
});
