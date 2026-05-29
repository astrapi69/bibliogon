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

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  COMIC_GRID_TEMPLATES,
  COMIC_GRID_TEMPLATE_PICKER_OPTIONS,
  ComicPanelGrid,
  resolveComicGridTemplate,
} from "./ComicPanelGrid";
import type { ComicPanelData } from "./ComicPanel";

function makePanel(id: string, position: number): ComicPanelData {
  return {
    id,
    page_id: "pg1",
    position,
    bounds: { x_pct: 0, y_pct: 0, width_pct: 100, height_pct: 100 },
    image_asset_id: null,
    panel_config: null,
  };
}

describe("resolveComicGridTemplate", () => {
  it.each([
    "single_panel",
    "grid_1x2",
    "grid_2x1",
    "grid_2x2",
    "grid_2x3",
    "grid_3x2",
    "grid_3x3",
  ])("returns canonical template %s when explicitly set", (template) => {
    expect(resolveComicGridTemplate({ comic_grid_template: template })).toBe(
      template,
    );
  });

  it("falls back to single_panel when layout_config is null", () => {
    expect(resolveComicGridTemplate(null)).toBe("single_panel");
  });

  it("falls back to single_panel when key is missing", () => {
    expect(resolveComicGridTemplate({ other_key: "x" })).toBe("single_panel");
  });

  it("falls back to single_panel when value is unknown", () => {
    expect(resolveComicGridTemplate({ comic_grid_template: "made_up" })).toBe(
      "single_panel",
    );
  });
});

describe("Standard Layouts contract (Phase 1, 2026-05-20)", () => {
  it("COMIC_GRID_TEMPLATES carries all 7 standards in canonical order", () => {
    // Mirror of the walker's COMIC_GRID_TEMPLATES tuple in
    // plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py.
    // Walker pytest enforces the same set on the backend side.
    expect([...COMIC_GRID_TEMPLATES]).toEqual([
      "single_panel",
      "grid_1x2",
      "grid_2x1",
      "grid_2x2",
      "grid_2x3",
      "grid_3x2",
      "grid_3x3",
    ]);
  });

  it("COMIC_GRID_TEMPLATE_PICKER_OPTIONS excludes grid_3x3 (legacy/advanced)", () => {
    expect([...COMIC_GRID_TEMPLATE_PICKER_OPTIONS]).toEqual([
      "single_panel",
      "grid_1x2",
      "grid_2x1",
      "grid_2x2",
      "grid_2x3",
      "grid_3x2",
    ]);
    expect(COMIC_GRID_TEMPLATE_PICKER_OPTIONS).not.toContain("grid_3x3");
  });
});

describe("ComicPanelGrid template CSS shapes", () => {
  // Each new template's CSS shape is asserted by rendering with
  // that template and reading the inline-style on the grid root.
  // Mirrors the walker's per-template pytest cases.
  const TEMPLATE_EXPECTATIONS: Array<[string, string, string]> = [
    // [templateId, expected gridTemplateColumns, expected gridTemplateRows]
    ["grid_1x2", "repeat(2, 1fr)", "1fr"],
    ["grid_2x1", "1fr", "repeat(2, 1fr)"],
    ["grid_2x3", "repeat(3, 1fr)", "repeat(2, 1fr)"],
    ["grid_3x2", "repeat(2, 1fr)", "repeat(3, 1fr)"],
  ];

  it.each(TEMPLATE_EXPECTATIONS)(
    "%s renders with gridTemplateColumns=%s + gridTemplateRows=%s",
    (templateId, cols, rows) => {
      render(
        <ComicPanelGrid
          layoutConfig={{ comic_grid_template: templateId }}
          panels={[]}
          panelBubblesMap={{}}
        />,
      );
      const grid = screen.getByTestId("comic-page-grid") as HTMLElement;
      expect(grid.style.gridTemplateColumns).toBe(cols);
      expect(grid.style.gridTemplateRows).toBe(rows);
      expect(grid.getAttribute("data-grid-template")).toBe(templateId);
    },
  );
});

describe("ComicPanelGrid", () => {
  it("carries data-grid-template attr matching the resolved template", () => {
    render(
      <ComicPanelGrid
        layoutConfig={{ comic_grid_template: "grid_2x2" }}
        panels={[]}
        panelBubblesMap={{}}
      />,
    );
    const grid = screen.getByTestId("comic-page-grid");
    expect(grid.getAttribute("data-grid-template")).toBe("grid_2x2");
  });

  it("renders panels in position order regardless of array order", () => {
    const { container } = render(
      <ComicPanelGrid
        layoutConfig={{ comic_grid_template: "grid_2x2" }}
        panels={[makePanel("p3", 2), makePanel("p1", 0), makePanel("p2", 1)]}
        panelBubblesMap={{}}
      />,
    );
    const panelEls = Array.from(
      container.querySelectorAll("[data-testid^='comic-panel-']"),
    );
    expect(panelEls.map((el) => el.getAttribute("data-testid"))).toEqual([
      "comic-panel-p1",
      "comic-panel-p2",
      "comic-panel-p3",
    ]);
  });
});

describe("ComicPanelGrid same-page reorder (Phase 1)", () => {
  // dnd-kit drag simulation is brittle under happy-dom (same as
  // PageThumbnails) — actual drag-reorder behaviour is covered by
  // the Playwright smoke. These pins assert the reorderable-mode
  // contract: drag handles render, the grid flags itself
  // reorderable, and the read-only path stays handle-free.
  it("renders a drag handle per panel when onPanelReorder is provided", () => {
    render(
      <ComicPanelGrid
        layoutConfig={{ comic_grid_template: "grid_2x2" }}
        panels={[makePanel("p1", 0), makePanel("p2", 1)]}
        panelBubblesMap={{}}
        onPanelReorder={vi.fn()}
      />,
    );
    expect(screen.getByTestId("comic-reorder-handle-p1")).toBeTruthy();
    expect(screen.getByTestId("comic-reorder-handle-p2")).toBeTruthy();
    expect(
      screen.getByTestId("comic-page-grid").getAttribute("data-reorderable"),
    ).toBe("true");
  });

  it("wraps each panel in a sortable container in reorder mode", () => {
    render(
      <ComicPanelGrid
        layoutConfig={{ comic_grid_template: "grid_2x2" }}
        panels={[makePanel("p1", 0), makePanel("p2", 1)]}
        panelBubblesMap={{}}
        onPanelReorder={vi.fn()}
      />,
    );
    expect(screen.getByTestId("comic-reorder-item-p1")).toBeTruthy();
    expect(screen.getByTestId("comic-reorder-item-p2")).toBeTruthy();
  });

  it("renders read-only (no drag handle, no reorderable flag) when onPanelReorder is absent", () => {
    render(
      <ComicPanelGrid
        layoutConfig={{ comic_grid_template: "grid_2x2" }}
        panels={[makePanel("p1", 0)]}
        panelBubblesMap={{}}
      />,
    );
    expect(screen.queryByTestId("comic-reorder-handle-p1")).toBeNull();
    expect(
      screen.getByTestId("comic-page-grid").getAttribute("data-reorderable"),
    ).toBeNull();
  });

  it("keeps position-order rendering in reorder mode", () => {
    const { container } = render(
      <ComicPanelGrid
        layoutConfig={{ comic_grid_template: "grid_2x2" }}
        panels={[makePanel("p3", 2), makePanel("p1", 0), makePanel("p2", 1)]}
        panelBubblesMap={{}}
        onPanelReorder={vi.fn()}
      />,
    );
    const sortables = Array.from(
      container.querySelectorAll("[data-testid^='comic-reorder-item-']"),
    );
    expect(sortables.map((el) => el.getAttribute("data-testid"))).toEqual([
      "comic-reorder-item-p1",
      "comic-reorder-item-p2",
      "comic-reorder-item-p3",
    ]);
  });
});
