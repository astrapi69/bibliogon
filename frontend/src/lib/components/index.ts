/**
 * Barrel for the generic, app-agnostic UI primitives promoted into
 * lib/components (#466 Phase 2). Library-grade: no app imports, reusable,
 * Props-in / render-out. New code imports primitives from here.
 *
 * Existing lib/components modules that predate this barrel are still
 * imported by their direct path; entries are added here as they are
 * promoted / curated.
 */
export {Badge, default as BadgeDefault} from "./Badge";
export type {BadgeProps, BadgeVariant} from "./Badge";
export {EmptyState} from "./EmptyState";
export type {EmptyStateProps} from "./EmptyState";
export {default as Tooltip} from "./Tooltip";
