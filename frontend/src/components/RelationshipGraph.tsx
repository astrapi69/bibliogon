/**
 * Story Bible relationship graph (STORY-BIBLE-RELATIONSHIP-GRAPH-01).
 *
 * C1 foundation: an interactive canvas (React Flow / @xyflow/react)
 * that will render one node per StoryEntity and one edge per
 * relationship. This commit ships the empty, themed, draggable canvas;
 * node/edge population from the book's entities lands in C2.
 *
 * Theming: the container background + border use theme tokens; the
 * canvas itself follows the app light/dark mode via React Flow's
 * ``colorMode`` so it reads correctly across all 12 variants.
 */
import { ReactFlow, Background, Controls } from "@xyflow/react";
import type {
  Node,
  Edge,
  NodeTypes,
  OnNodesChange,
  OnConnect,
  OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useTheme } from "../hooks/useTheme";
import styles from "./RelationshipGraph.module.css";

interface Props {
  bookId: string;
  nodes?: Node[];
  edges?: Edge[];
  nodeTypes?: NodeTypes;
  onNodesChange?: OnNodesChange;
  onConnect?: OnConnect;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  onNodeDoubleClick?: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStop?: OnNodeDrag;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
}

export default function RelationshipGraph({
  nodes = [],
  edges = [],
  nodeTypes,
  onNodesChange,
  onConnect,
  onNodeClick,
  onNodeDoubleClick,
  onNodeDragStop,
  onEdgeClick,
}: Props) {
  const { theme } = useTheme();
  return (
    <div className={styles.canvas} data-testid="relationship-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        colorMode={theme === "dark" ? "dark" : "light"}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
