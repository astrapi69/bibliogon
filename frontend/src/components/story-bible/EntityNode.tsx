/**
 * Custom React Flow node for a Story Bible entity
 * (STORY-BIBLE-RELATIONSHIP-GRAPH-01 C2).
 *
 * One node per entity: a shape keyed to the entity type (character =
 * circle, setting = rectangle, item = diamond, plot_point = hexagon,
 * lore = rounded-rect), tinted with the per-type accent colour, the
 * type icon, and the entity name. Connection handles on all four sides
 * let the user drag a new relationship between entities (wired in C3).
 */
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

import { entityTypeColor, entityTypeIcon } from "./storyBibleIcons";
import styles from "../EntityNode.module.css";

export interface EntityNodeData {
  label: string;
  entityType: string;
  icon?: string;
  [key: string]: unknown;
}

const SHAPE_BY_TYPE: Record<string, string> = {
  character: styles.circle,
  setting: styles.rect,
  item: styles.diamond,
  plot_point: styles.hexagon,
  lore: styles.rounded,
};

export default function EntityNode({ data, selected }: NodeProps) {
  const nodeData = data as EntityNodeData;
  const color = entityTypeColor(nodeData.entityType);
  const Icon = entityTypeIcon(nodeData.entityType, nodeData.icon);
  const shape = SHAPE_BY_TYPE[nodeData.entityType] ?? styles.rounded;
  return (
    <div
      className={`${styles.node} ${shape} ${selected ? styles.selected : ""}`}
      style={{ borderColor: color }}
      data-testid={`entity-node-${nodeData.entityType}`}
      title={nodeData.label}
    >
      <Handle type="target" position={Position.Left} />
      <span className={styles.inner}>
        <Icon size={14} style={{ color }} aria-hidden />
        <span className={styles.label}>{nodeData.label}</span>
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
