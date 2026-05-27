/**
 * LayoutConfigComicPanel tests (PHASE-2-PANEL-CONFIG-01 C1 + C3).
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
 * - C3: file input upload calls api.assets.upload(bookId, file,
 *   "figure") + onChange({image_asset_id: asset.id}).
 * - C3: image-clear button renders only when image_asset_id is set;
 *   click clears via onChange({image_asset_id: null}).
 * - C3: upload error surfaces under comic-panel-image-upload-error
 *   testid.
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";

import {LayoutConfigComicPanel} from "./LayoutConfigComicPanel";
import type {ComicPanelData} from "./ComicPanel";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

vi.mock("../../api/client", () => ({
    api: {
        assets: {
            upload: vi.fn(),
        },
    },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockedApi: any;
beforeEach(async () => {
    mockedApi = (await import("../../api/client")).api;
    mockedApi.assets.upload.mockReset();
    localStorage.clear();
});

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
                bookId="book-1"
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
                bookId="book-1"
                onChange={() => {}}
            />,
        );
        expect(screen.getByText("Panel")).toBeInTheDocument();
    });

    it("mounts Tier1Section under comic-panel testid prefix (RCU 3rd-site)", () => {
        render(
            <LayoutConfigComicPanel
                panel={makePanel()}
                bookId="book-1"
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
                bookId="book-1"
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByTestId("comic-panel-tier1-trigger"));
        const backgroundInput = screen.getByTestId(
            "comic-panel-background-color",
        );
        fireEvent.change(backgroundInput, {target: {value: "#abcdef"}});
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
                bookId="book-1"
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
                bookId="book-1"
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
                bookId="book-1"
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

    // C3 — image-upload UI

    it("renders the image input + section testids", () => {
        render(
            <LayoutConfigComicPanel
                panel={makePanel()}
                bookId="book-1"
                onChange={() => {}}
            />,
        );
        expect(
            screen.getByTestId("comic-panel-image-section"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("comic-panel-image-input"),
        ).toBeInTheDocument();
    });

    it("hides the image-clear button when no image is set", () => {
        render(
            <LayoutConfigComicPanel
                panel={makePanel({image_asset_id: null})}
                bookId="book-1"
                onChange={() => {}}
            />,
        );
        expect(
            screen.queryByTestId("comic-panel-image-clear"),
        ).not.toBeInTheDocument();
    });

    it("shows the image-clear button when image_asset_id is set", () => {
        render(
            <LayoutConfigComicPanel
                panel={makePanel({image_asset_id: "asset-99"})}
                bookId="book-1"
                onChange={() => {}}
            />,
        );
        expect(
            screen.getByTestId("comic-panel-image-clear"),
        ).toBeInTheDocument();
    });

    it("clicking image-clear fires onChange({image_asset_id: null})", () => {
        const onChange = vi.fn();
        render(
            <LayoutConfigComicPanel
                panel={makePanel({image_asset_id: "asset-99"})}
                bookId="book-1"
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByTestId("comic-panel-image-clear"));
        expect(onChange).toHaveBeenCalledWith({image_asset_id: null});
    });

    it("file pick calls api.assets.upload(bookId, file, 'figure') and onChange({image_asset_id: ...})", async () => {
        const onChange = vi.fn();
        mockedApi.assets.upload.mockResolvedValue({
            id: "new-asset-1",
            filename: "panel.png",
            url: "/api/books/book-1/assets/file/panel.png",
        });
        render(
            <LayoutConfigComicPanel
                panel={makePanel()}
                bookId="book-1"
                onChange={onChange}
            />,
        );
        const input = screen.getByTestId(
            "comic-panel-image-input",
        ) as HTMLInputElement;
        const file = new File(["test"], "panel.png", {type: "image/png"});
        fireEvent.change(input, {target: {files: [file]}});
        await waitFor(() => {
            expect(mockedApi.assets.upload).toHaveBeenCalledWith(
                "book-1",
                file,
                "figure",
            );
        });
        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith({
                image_asset_id: "new-asset-1",
            });
        });
    });

    it("upload-error surfaces under comic-panel-image-upload-error testid", async () => {
        const onChange = vi.fn();
        mockedApi.assets.upload.mockRejectedValue(new Error("Upload boom"));
        render(
            <LayoutConfigComicPanel
                panel={makePanel()}
                bookId="book-1"
                onChange={onChange}
            />,
        );
        const input = screen.getByTestId(
            "comic-panel-image-input",
        ) as HTMLInputElement;
        const file = new File(["test"], "panel.png", {type: "image/png"});
        fireEvent.change(input, {target: {files: [file]}});
        await waitFor(() => {
            expect(
                screen.getByTestId("comic-panel-image-upload-error"),
            ).toBeInTheDocument();
        });
        expect(onChange).not.toHaveBeenCalled();
    });
});
