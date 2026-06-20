/**
 * Pins the relationship-graph foundation (STORY-BIBLE-RELATIONSHIP-GRAPH-01
 * C1): the component mounts without error and renders its themed canvas
 * container, passing nodes/edges through to React Flow.
 *
 * @xyflow/react is mocked to a plain div (its canvas needs ResizeObserver
 * + real layout measurement that happy-dom does not provide); the live
 * canvas is covered by the C6 Playwright smoke.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import RelationshipGraph from "./RelationshipGraph";

vi.mock("../hooks/ui/useTheme", () => ({
  useTheme: () => ({
    theme: "light",
    toggle: vi.fn(),
    appTheme: "warm",
    setAppTheme: vi.fn(),
  }),
}));

let lastProps: { nodes?: unknown[]; edges?: unknown[] } = {};
vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: {
    nodes?: unknown[];
    edges?: unknown[];
    children?: React.ReactNode;
  }) => {
    lastProps = { nodes: props.nodes, edges: props.edges };
    return <div data-testid="react-flow-mock">{props.children}</div>;
  },
  Background: () => <div data-testid="rf-background" />,
  Controls: () => <div data-testid="rf-controls" />,
}));

describe("RelationshipGraph (foundation)", () => {
  it("mounts and renders the canvas container", () => {
    render(<RelationshipGraph bookId="b1" />);
    expect(screen.getByTestId("relationship-graph")).toBeTruthy();
    expect(screen.getByTestId("react-flow-mock")).toBeTruthy();
    expect(screen.getByTestId("rf-background")).toBeTruthy();
  });

  it("passes nodes and edges through to React Flow", () => {
    const nodes = [
      { id: "n1", position: { x: 0, y: 0 }, data: { label: "A" } },
    ];
    const edges = [{ id: "e1", source: "n1", target: "n1" }];
    render(<RelationshipGraph bookId="b1" nodes={nodes} edges={edges} />);
    expect(lastProps.nodes).toHaveLength(1);
    expect(lastProps.edges).toHaveLength(1);
  });
});
