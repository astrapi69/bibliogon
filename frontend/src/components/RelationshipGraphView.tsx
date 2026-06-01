/**
 * Story Bible relationship-graph view (STORY-BIBLE-RELATIONSHIP-GRAPH-01
 * C2). Loads the book's entities, builds one node per entity (circular
 * auto-layout, shape + colour by type) and one edge per relationship
 * (coloured + labelled by relationship type), and renders the draggable
 * React Flow canvas. Mounted at ``?view=relationships`` in BookEditor.
 */
import { useCallback, useEffect, useState } from "react";
import { useNodesState, useEdgesState, MarkerType } from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";

import { api, type StoryEntityOut } from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/notify";
import { relationshipColor } from "./relationshipColors";
import EntityNode from "./EntityNode";
import RelationshipGraph from "./RelationshipGraph";
import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./RelationshipGraphView.module.css";

const nodeTypes = { entity: EntityNode };

/** Lay entities out evenly around a circle (dependency-free, stable for
 * a given entity ordering). Radius scales with count so larger casts
 * don't overlap. */
export function buildNodes(entities: StoryEntityOut[]): Node[] {
  const n = entities.length;
  const radius = Math.max(160, n * 36);
  return entities.map((entity, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, n);
    return {
      id: entity.id,
      type: "entity",
      position: {
        x: radius + radius * Math.cos(angle),
        y: radius + radius * Math.sin(angle),
      },
      data: {
        label: entity.name,
        entityType: entity.entity_type,
      },
    };
  });
}

/** One edge per relationship whose target is present in the book.
 * Coloured + labelled by relationship type. */
export function buildEdges(entities: StoryEntityOut[]): Edge[] {
  const present = new Set(entities.map((e) => e.id));
  const edges: Edge[] = [];
  for (const entity of entities) {
    for (const rel of entity.relationships ?? []) {
      if (!present.has(rel.target_entity_id)) continue;
      const color = relationshipColor(rel.relationship_type);
      edges.push({
        id: `${entity.id}->${rel.target_entity_id}:${rel.relationship_type}`,
        source: entity.id,
        target: rel.target_entity_id,
        label: rel.relationship_type,
        style: { stroke: color },
        labelStyle: { fill: color, fontSize: 11 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        data: { relationshipType: rel.relationship_type },
      });
    }
  }
  return edges;
}

interface Props {
  bookId: string;
}

export default function RelationshipGraphView({ bookId }: Props) {
  const { t } = useI18n();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entities = await api.storyBible.listEntities(bookId);
      setNodes(buildNodes(entities));
      setEdges(buildEdges(entities));
    } catch {
      notify.error(
        t(
          "ui.relationship_graph.load_failed",
          "Beziehungsgraph konnte nicht geladen werden.",
        ),
      );
    } finally {
      setLoading(false);
    }
    // ``t`` excluded (failure-toast only; unstable under test mock).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, setNodes, setEdges]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && nodes.length === 0) {
    return (
      <div className={styles.wrapper}>
        <LoadingIndicator
          testId="relationship-graph-loading"
          variant="block"
          label={t("ui.common.loading", "Laden...")}
        />
      </div>
    );
  }

  if (!loading && nodes.length === 0) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.emptyState} data-testid="relationship-graph-empty">
          {t(
            "ui.relationship_graph.empty",
            "Noch keine Story-Bible-Einträge. Lege Charaktere, Orte usw. an, um den Beziehungsgraphen zu sehen.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <RelationshipGraph
        bookId={bookId}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
      />
    </div>
  );
}
