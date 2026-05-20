/**
 * ComicPanelGrid tests (Comics-Session-2 C5).
 *
 * Pins:
 * - resolveComicGridTemplate accepts the 3 canonical templates
 *   + gamma-shim default for unknown / missing.
 * - The grid root carries data-grid-template attr matching the
 *   resolved template.
 * - Panels render in position order.
 */

import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";

import {
    ComicPanelGrid,
    resolveComicGridTemplate,
} from "./ComicPanelGrid";
import type {ComicPanelData} from "./ComicPanel";

function makePanel(id: string, position: number): ComicPanelData {
    return {
        id,
        page_id: "pg1",
        position,
        bounds: {x_pct: 0, y_pct: 0, width_pct: 100, height_pct: 100},
        image_asset_id: null,
        panel_config: null,
    };
}

describe("resolveComicGridTemplate", () => {
    it.each(["single_panel", "grid_2x2", "grid_3x3"])(
        "returns canonical template %s when explicitly set",
        (template) => {
            expect(
                resolveComicGridTemplate({comic_grid_template: template}),
            ).toBe(template);
        },
    );

    it("falls back to single_panel when layout_config is null", () => {
        expect(resolveComicGridTemplate(null)).toBe("single_panel");
    });

    it("falls back to single_panel when key is missing", () => {
        expect(resolveComicGridTemplate({other_key: "x"})).toBe(
            "single_panel",
        );
    });

    it("falls back to single_panel when value is unknown", () => {
        expect(
            resolveComicGridTemplate({comic_grid_template: "made_up"}),
        ).toBe("single_panel");
    });
});

describe("ComicPanelGrid", () => {
    it("carries data-grid-template attr matching the resolved template", () => {
        render(
            <ComicPanelGrid
                layoutConfig={{comic_grid_template: "grid_2x2"}}
                panels={[]}
                panelBubblesMap={{}}
            />,
        );
        const grid = screen.getByTestId("comic-page-grid");
        expect(grid.getAttribute("data-grid-template")).toBe("grid_2x2");
    });

    it("renders panels in position order regardless of array order", () => {
        const {container} = render(
            <ComicPanelGrid
                layoutConfig={{comic_grid_template: "grid_2x2"}}
                panels={[
                    makePanel("p3", 2),
                    makePanel("p1", 0),
                    makePanel("p2", 1),
                ]}
                panelBubblesMap={{}}
            />,
        );
        const panelEls = Array.from(
            container.querySelectorAll("[data-testid^='comic-panel-']"),
        );
        expect(
            panelEls.map((el) => el.getAttribute("data-testid")),
        ).toEqual(["comic-panel-p1", "comic-panel-p2", "comic-panel-p3"]);
    });
});
