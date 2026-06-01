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
import type { Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useTheme } from "../hooks/useTheme";
import styles from "./RelationshipGraph.module.css";

interface Props {
  bookId: string;
  nodes?: Node[];
  edges?: Edge[];
}

export default function RelationshipGraph({ nodes = [], edges = [] }: Props) {
  const { theme } = useTheme();
  return (
    <div className={styles.canvas} data-testid="relationship-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
