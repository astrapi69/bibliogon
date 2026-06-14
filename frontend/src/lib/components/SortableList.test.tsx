import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SortableItem, SortableList } from "./SortableList";

interface Row {
  id: string;
  label: string;
}

const ROWS: Row[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

describe("SortableList", () => {
  it("renders one element per item via the render-prop", () => {
    render(
      <SortableList
        items={ROWS}
        getId={(r) => r.id}
        onReorder={vi.fn()}
        renderItem={(row, dnd) => (
          <div ref={dnd.setNodeRef} style={dnd.style} data-testid={`row-${row.id}`}>
            {row.label}
          </div>
        )}
      />,
    );
    expect(screen.getByTestId("row-a")).toHaveTextContent("Alpha");
    expect(screen.getByTestId("row-b")).toHaveTextContent("Beta");
    expect(screen.getByTestId("row-c")).toHaveTextContent("Gamma");
  });

  it("hands each item a dnd bag with attributes, listeners, and isDragging", () => {
    const seen: Array<{ hasAttrs: boolean; hasListeners: boolean; dragging: boolean }> =
      [];
    render(
      <SortableList
        items={ROWS}
        getId={(r) => r.id}
        onReorder={vi.fn()}
        renderItem={(row, dnd) => {
          seen.push({
            hasAttrs: typeof dnd.attributes === "object" && dnd.attributes !== null,
            hasListeners: dnd.listeners !== undefined,
            dragging: dnd.isDragging,
          });
          return (
            <div ref={dnd.setNodeRef} data-testid={`row-${row.id}`}>
              {row.label}
            </div>
          );
        }}
      />,
    );
    expect(seen).toHaveLength(3);
    for (const entry of seen) {
      expect(entry.hasAttrs).toBe(true);
      expect(entry.dragging).toBe(false);
    }
  });

  it("renders an empty list without crashing", () => {
    const { container } = render(
      <SortableList
        items={[]}
        getId={(r: Row) => r.id}
        onReorder={vi.fn()}
        renderItem={(row) => <div data-testid={`row-${row.id}`}>{row.label}</div>}
      />,
    );
    expect(container.querySelectorAll("[data-testid^='row-']")).toHaveLength(0);
  });
});

describe("SortableItem", () => {
  it("exposes the dnd bag to its render-prop child", () => {
    let captured: { hasSetNodeRef: boolean; dragging: boolean } | null = null;
    render(
      <SortableItem id="x">
        {(dnd) => {
          captured = {
            hasSetNodeRef: typeof dnd.setNodeRef === "function",
            dragging: dnd.isDragging,
          };
          return (
            <span
              ref={dnd.setNodeRef}
              {...dnd.attributes}
              {...dnd.listeners}
              data-testid="sortable-item-x"
              onClick={() => undefined}
            >
              x
            </span>
          );
        }}
      </SortableItem>,
    );
    const node = screen.getByTestId("sortable-item-x");
    expect(node).toBeInTheDocument();
    fireEvent.pointerDown(node);
    expect(captured).not.toBeNull();
    expect(captured!.hasSetNodeRef).toBe(true);
    expect(captured!.dragging).toBe(false);
  });
});
