/**
 * Publication-status badge (#318).
 *
 * A small wrapper over the canonical themed {@link Badge} that maps a
 * publication-lifecycle status (draft / ready / published / archived) to a
 * consistent color and renders a caller-supplied label. Centralizing this in
 * one component keeps the status pill identical across every surface (Book +
 * Article cards and list rows) and gives one place to evolve the mapping.
 *
 * Reuses the existing `.badge-{variant}` color system (token-based, themed
 * across all 12 variants) rather than introducing a parallel set of colors,
 * per the project's CSS-first / one-look discipline. Colors: draft = neutral,
 * ready = blue (info), published = green (success), archived = dimmed (muted).
 */

import { Badge, type BadgeVariant } from "../../components/Badge";
import { publicationStatusVariant } from "../../utils/format/publicationStatusBadge";

export interface StatusBadgeProps {
  /** Lifecycle status (draft / ready / published / archived; others → neutral). */
  status: string;
  /** Map of status → display label (caller localizes). */
  labels: Record<string, string>;
  /** Optional status → variant override (defaults to the lifecycle mapping). */
  variantMap?: Record<string, BadgeVariant>;
  size?: "sm" | "md";
  testId?: string;
  className?: string;
}

/** Render a colored status pill for a publication-lifecycle status. */
export default function StatusBadge({
  status,
  labels,
  variantMap,
  size = "sm",
  testId,
  className,
}: StatusBadgeProps) {
  const variant = variantMap?.[status] ?? publicationStatusVariant(status);
  return (
    <Badge variant={variant} size={size} testId={testId} className={className}>
      {labels[status] ?? status}
    </Badge>
  );
}
