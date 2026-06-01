/**
 * Pins the relationship-graph data layer + view
 * (STORY-BIBLE-RELATIONSHIP-GRAPH-01 C2):
 * - buildNodes: one node per entity, typed + positioned.
 * - buildEdges: one edge per relationship, coloured, target-filtered.
 * - the view shows the empty state with no entities and the canvas
 *   once entities load.
 *
 * @xyflow/react is mocked (real React state for the node/edge hooks so
 * the canvas mounts; ReactFlow itself stubbed - happy-dom lacks its
 * layout). The live canvas is covered by the C6 Playwright smoke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import RelationshipGraphView, {
  buildNodes,
  buildEdges,
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
    ReactFlow: () => null,
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    Position: { Left: "left", Right: "right" },
  };
});

const listEntities = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    storyBible: { listEntities: (...a: unknown[]) => listEntities(...a) },
  },
}));

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
    expect(typeof nodes[0].position.x).toBe("number");
  });

  it("buildEdges makes one coloured edge per relationship, skipping missing targets", () => {
    const entities = [
      entity("a", "character", [
        { target_entity_id: "b", relationship_type: "ally" },
        { target_entity_id: "ghost", relationship_type: "rival" }, // target absent
      ]),
      entity("b", "character"),
    ];
    const edges = buildEdges(entities);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: "a", target: "b", label: "ally" });
    expect(edges[0].markerEnd).toBeTruthy();
  });
});

describe("RelationshipGraphView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the empty state when the book has no entities", async () => {
    listEntities.mockResolvedValue([]);
    render(<RelationshipGraphView bookId="b1" />);
    expect(await screen.findByTestId("relationship-graph-empty")).toBeTruthy();
  });

  it("renders the canvas once entities load", async () => {
    listEntities.mockResolvedValue([entity("a", "character")]);
    render(<RelationshipGraphView bookId="b1" />);
    expect(await screen.findByTestId("relationship-graph")).toBeTruthy();
  });
});
