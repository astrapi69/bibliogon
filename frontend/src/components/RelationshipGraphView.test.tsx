/**
 * Pins the relationship-graph data layer, view, and interactive editing
 * (STORY-BIBLE-RELATIONSHIP-GRAPH-01 C2 + C3):
 * - buildNodes / buildEdges / addRelationship / removeRelationship pure.
 * - empty + loaded states.
 * - C3: a drag-connect opens the create dialog and PATCHes the source
 *   entity's relationships; an edge click confirm-deletes the relationship.
 *
 * @xyflow/react is mocked (real React state for the node/edge hooks; the
 * ReactFlow stub exposes connect/edge-click triggers so the C3 handlers
 * are exercisable without a real canvas). Live canvas: C6 Playwright smoke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import RelationshipGraphView, {
  buildNodes,
  buildEdges,
  addRelationship,
  removeRelationship,
} from "./RelationshipGraphView";
import type { StoryEntityOut } from "../api/client";

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, f: string) => f,
    lang: "en",
    setLang: vi.fn(),
  }),
}));
vi.mock("../hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "light",
    toggle: vi.fn(),
    appTheme: "warm",
    setAppTheme: vi.fn(),
  }),
}));
vi.mock("../utils/notify", () => ({ notify: { error: vi.fn() } }));

const mockConfirm = vi.fn();
vi.mock("./AppDialog", () => ({ useDialog: () => ({ confirm: mockConfirm }) }));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    MarkerType: { ArrowClosed: "arrowclosed" },
    useNodesState: (init: unknown[]) => {
      const [s, set] = React.useState(init);
      return [s, set, vi.fn()];
    },
    useEdgesState: (init: unknown[]) => {
      const [s, set] = React.useState(init);
      return [s, set, vi.fn()];
    },
    // Stub canvas exposing the interaction callbacks as test triggers.
    ReactFlow: (props: {
      nodes?: { id: string }[];
      edges?: { id: string; source: string; target: string }[];
      onConnect?: (c: { source: string; target: string }) => void;
      onEdgeClick?: (e: unknown, edge: unknown) => void;
      onNodeClick?: (e: unknown, node: unknown) => void;
      onNodeDoubleClick?: (e: unknown, node: unknown) => void;
      onNodeDragStop?: (e: unknown, node: unknown) => void;
    }) => (
      <div data-testid="rf-stub">
        <div className="react-flow__viewport" />
        <button
          data-testid="rf-trigger-connect"
          onClick={() => {
            const [a, b] = props.nodes ?? [];
            if (a && b) props.onConnect?.({ source: a.id, target: b.id });
          }}
        />
        <button
          data-testid="rf-trigger-drag-stop"
          onClick={() => {
            const [a] = props.nodes ?? [];
            if (a)
              props.onNodeDragStop?.({} as unknown, {
                id: a.id,
                position: { x: 42, y: 7 },
              });
          }}
        />
        {(props.nodes ?? []).map((n) => (
          <span key={n.id}>
            <button
              data-testid={`rf-node-${n.id}`}
              onClick={() => props.onNodeClick?.({} as unknown, n)}
            />
            <button
              data-testid={`rf-node-dblclick-${n.id}`}
              onClick={() => props.onNodeDoubleClick?.({} as unknown, n)}
            />
          </span>
        ))}
        {(props.edges ?? []).map((e) => (
          <button
            key={e.id}
            data-testid={`rf-edge-${e.id}`}
            onClick={() => props.onEdgeClick?.({} as unknown, e)}
          />
        ))}
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    Position: { Left: "left", Right: "right" },
  };
});

const listEntities = vi.fn();
const updateEntity = vi.fn();
const updateBook = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    storyBible: {
      listEntities: (...a: unknown[]) => listEntities(...a),
      updateEntity: (...a: unknown[]) => updateEntity(...a),
    },
    books: { update: (...a: unknown[]) => updateBook(...a) },
  },
}));

const toPng = vi.fn();
vi.mock("html-to-image", () => ({ toPng: (...a: unknown[]) => toPng(...a) }));

function entity(
  id: string,
  type: string,
  rels: StoryEntityOut["relationships"] = [],
): StoryEntityOut {
  return {
    id,
    book_id: "b1",
    entity_type: type,
    name: `Name ${id}`,
    position: 0,
    relationships: rels,
    created_at: "",
    updated_at: "",
  };
}

describe("relationship-graph builders", () => {
  it("buildNodes makes one typed node per entity", () => {
    const nodes = buildNodes([
      entity("a", "character"),
      entity("b", "setting"),
    ]);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ id: "a", type: "entity" });
    expect(nodes[0].data).toMatchObject({
      label: "Name a",
      entityType: "character",
    });
  });

  it("buildNodes honours a saved layout position over the auto-layout", () => {
    const nodes = buildNodes([entity("a", "character")], { a: { x: 5, y: 9 } });
    expect(nodes[0].position).toEqual({ x: 5, y: 9 });
  });

  it("buildEdges makes one edge per relationship, skipping missing targets", () => {
    const edges = buildEdges([
      entity("a", "character", [
        { target_entity_id: "b", relationship_type: "ally" },
        { target_entity_id: "ghost", relationship_type: "rival" },
      ]),
      entity("b", "character"),
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: "a", target: "b", label: "ally" });
  });

  it("addRelationship replaces an existing edge to the same target", () => {
    const src = entity("a", "character", [
      { target_entity_id: "b", relationship_type: "ally" },
    ]);
    const next = addRelationship(src, "b", "rival", "note");
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      target_entity_id: "b",
      relationship_type: "rival",
      description: "note",
    });
  });

  it("removeRelationship drops only the matching target", () => {
    const src = entity("a", "character", [
      { target_entity_id: "b", relationship_type: "ally" },
      { target_entity_id: "c", relationship_type: "family" },
    ]);
    const next = removeRelationship(src, "b");
    expect(next).toHaveLength(1);
    expect(next[0].target_entity_id).toBe("c");
  });
});

describe("RelationshipGraphView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
    updateEntity.mockResolvedValue({});
    updateBook.mockResolvedValue({});
    toPng.mockResolvedValue("data:image/png;base64,AAAA");
  });

  it("shows the empty state when the book has no entities", async () => {
    listEntities.mockResolvedValue([]);
    render(<RelationshipGraphView bookId="b1" />);
    expect(await screen.findByTestId("relationship-graph-empty")).toBeTruthy();
  });

  it("creates a relationship via drag-connect + dialog", async () => {
    listEntities.mockResolvedValue([
      entity("a", "character"),
      entity("b", "character"),
    ]);
    render(<RelationshipGraphView bookId="b1" />);
    await screen.findByTestId("rf-stub");
    fireEvent.click(screen.getByTestId("rf-trigger-connect"));
    await screen.findByTestId("relationship-create-dialog");
    fireEvent.click(screen.getByTestId("relationship-type-rival"));
    fireEvent.click(screen.getByTestId("relationship-create-confirm"));
    await waitFor(() =>
      expect(updateEntity).toHaveBeenCalledWith("a", {
        relationships: [
          {
            target_entity_id: "b",
            relationship_type: "rival",
            description: null,
          },
        ],
      }),
    );
  });

  it("deletes a relationship on edge click after confirm", async () => {
    listEntities.mockResolvedValue([
      entity("a", "character", [
        { target_entity_id: "b", relationship_type: "ally" },
      ]),
      entity("b", "character"),
    ]);
    render(<RelationshipGraphView bookId="b1" />);
    const edgeBtn = await screen.findByTestId("rf-edge-a->b:ally");
    fireEvent.click(edgeBtn);
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    await waitFor(() =>
      expect(updateEntity).toHaveBeenCalledWith("a", { relationships: [] }),
    );
  });

  it("opens a detail panel on node click and navigates via the open button", async () => {
    const onOpenEntity = vi.fn();
    listEntities.mockResolvedValue([
      entity("a", "character", [
        { target_entity_id: "b", relationship_type: "ally" },
      ]),
      entity("b", "character"),
    ]);
    render(<RelationshipGraphView bookId="b1" onOpenEntity={onOpenEntity} />);
    fireEvent.click(await screen.findByTestId("rf-node-a"));
    const panel = await screen.findByTestId("relationship-detail-panel");
    expect(panel.textContent).toContain("Name a");
    expect(panel.textContent).toContain("1"); // relationship count
    fireEvent.click(screen.getByTestId("relationship-detail-open"));
    expect(onOpenEntity).toHaveBeenCalledWith("a");
  });

  it("opens the entity directly on node double-click", async () => {
    const onOpenEntity = vi.fn();
    listEntities.mockResolvedValue([entity("a", "character")]);
    render(<RelationshipGraphView bookId="b1" onOpenEntity={onOpenEntity} />);
    fireEvent.click(await screen.findByTestId("rf-node-dblclick-a"));
    expect(onOpenEntity).toHaveBeenCalledWith("a");
  });

  it("persists node positions on drag stop", async () => {
    listEntities.mockResolvedValue([entity("a", "character")]);
    render(<RelationshipGraphView bookId="b1" />);
    fireEvent.click(await screen.findByTestId("rf-trigger-drag-stop"));
    await waitFor(() =>
      expect(updateBook).toHaveBeenCalledWith("b1", {
        graph_layout: { a: { x: 42, y: 7 } },
      }),
    );
  });

  it("resets the layout to empty", async () => {
    listEntities.mockResolvedValue([entity("a", "character")]);
    render(<RelationshipGraphView bookId="b1" />);
    fireEvent.click(await screen.findByTestId("relationship-reset-layout"));
    await waitFor(() =>
      expect(updateBook).toHaveBeenCalledWith("b1", { graph_layout: {} }),
    );
  });

  it("exports the graph as a PNG", async () => {
    listEntities.mockResolvedValue([entity("a", "character")]);
    render(<RelationshipGraphView bookId="b1" />);
    fireEvent.click(await screen.findByTestId("relationship-export-png"));
    await waitFor(() => expect(toPng).toHaveBeenCalled());
  });
});
