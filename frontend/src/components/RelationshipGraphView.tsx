/**
 * Story Bible relationship-graph view (STORY-BIBLE-RELATIONSHIP-GRAPH-01).
 *
 * C2: loads the book's entities, builds one node per entity (circular
 * auto-layout, shape + colour by type) and one coloured/labelled edge
 * per relationship; draggable canvas. Mounted at ``?view=relationships``.
 *
 * C3: interactive relationship editing. Dragging from one node's handle
 * to another opens a mini-dialog (type + optional note) that PATCHes the
 * source entity's ``relationships``; clicking an edge offers a confirmed
 * delete. The graph reloads from the server after each mutation.
 */
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useNodesState, useEdgesState, MarkerType } from "@xyflow/react";
import type { Node, Edge, Connection } from "@xyflow/react";
import { X } from "lucide-react";

import {
  api,
  type StoryEntityOut,
  type StoryEntityRelationship,
  type RelationshipType,
} from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { useDialog } from "./AppDialog";
import { notify } from "../utils/notify";
import { RELATIONSHIP_TYPES, relationshipColor } from "./relationshipColors";
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
      data: { label: entity.name, entityType: entity.entity_type },
    };
  });
}

/** One edge per relationship whose target is present in the book. */
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

/** Append a relationship to ``source``'s list, replacing any existing
 * one to the same target (one edge per pair is the rendered contract).
 * Pure - returns the new relationships array. */
export function addRelationship(
  source: StoryEntityOut,
  targetId: string,
  type: RelationshipType,
  description: string | null,
): StoryEntityRelationship[] {
  const kept = (source.relationships ?? []).filter(
    (r) => r.target_entity_id !== targetId,
  );
  return [
    ...kept,
    { target_entity_id: targetId, relationship_type: type, description },
  ];
}

/** Remove the relationship from ``source`` to ``targetId``. Pure. */
export function removeRelationship(
  source: StoryEntityOut,
  targetId: string,
): StoryEntityRelationship[] {
  return (source.relationships ?? []).filter(
    (r) => r.target_entity_id !== targetId,
  );
}

interface Props {
  bookId: string;
}

export default function RelationshipGraphView({ bookId }: Props) {
  const { t } = useI18n();
  const dialog = useDialog();
  const [entities, setEntities] = useState<StoryEntityOut[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<{
    source: string;
    target: string;
  } | null>(null);
  const [createType, setCreateType] = useState<RelationshipType>("ally");
  const [createNote, setCreateNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.storyBible.listEntities(bookId);
      setEntities(list);
      setNodes(buildNodes(list));
      setEdges(buildEdges(list));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, setNodes, setEdges]);

  useEffect(() => {
    void load();
  }, [load]);

  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target && c.source !== c.target) {
      setCreateType("ally");
      setCreateNote("");
      setPending({ source: c.source, target: c.target });
    }
  }, []);

  const handleCreate = async () => {
    if (!pending) return;
    const source = entities.find((e) => e.id === pending.source);
    if (!source) {
      setPending(null);
      return;
    }
    try {
      await api.storyBible.updateEntity(source.id, {
        relationships: addRelationship(
          source,
          pending.target,
          createType,
          createNote.trim() || null,
        ),
      });
      setPending(null);
      await load();
    } catch {
      notify.error(
        t(
          "ui.relationship_graph.save_failed",
          "Beziehung konnte nicht gespeichert werden.",
        ),
      );
    }
  };

  const onEdgeClick = async (_e: React.MouseEvent, edge: Edge) => {
    const source = entities.find((en) => en.id === edge.source);
    if (!source) return;
    const ok = await dialog.confirm(
      t("ui.relationship_graph.delete_confirm_title", "Beziehung löschen?"),
      t(
        "ui.relationship_graph.delete_confirm_message",
        "Diese Beziehung wird entfernt.",
      ),
      "danger",
    );
    if (!ok) return;
    try {
      await api.storyBible.updateEntity(source.id, {
        relationships: removeRelationship(source, edge.target),
      });
      await load();
    } catch {
      notify.error(
        t(
          "ui.relationship_graph.delete_failed",
          "Beziehung konnte nicht gelöscht werden.",
        ),
      );
    }
  };

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
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
      />

      <Dialog.Root
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="radix-dialog-overlay" />
          <Dialog.Content
            className={`radix-dialog-content ${styles.createDialog}`}
            data-testid="relationship-create-dialog"
          >
            <div className={styles.createHeader}>
              <Dialog.Title className={styles.createTitle}>
                {t(
                  "ui.relationship_graph.create_title",
                  "Beziehung hinzufügen",
                )}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="btn-icon"
                  aria-label={t("ui.common.close", "Schließen")}
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
            <div className={styles.typeRow}>
              {RELATIONSHIP_TYPES.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  className={`btn btn-sm ${createType === rt ? "btn-primary" : "btn-secondary"}`}
                  style={
                    createType === rt
                      ? undefined
                      : { borderColor: relationshipColor(rt) }
                  }
                  onClick={() => setCreateType(rt)}
                  data-testid={`relationship-type-${rt}`}
                >
                  {rt}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="input"
              value={createNote}
              onChange={(e) => setCreateNote(e.target.value)}
              placeholder={t(
                "ui.relationship_graph.note_placeholder",
                "Notiz (optional)",
              )}
              data-testid="relationship-create-note"
            />
            <div className={styles.createActions}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void handleCreate()}
                data-testid="relationship-create-confirm"
              >
                {t("ui.relationship_graph.create_confirm", "Hinzufügen")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
