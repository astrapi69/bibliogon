/**
 * Re-export shim: EmptyState moved to lib/components/EmptyState (#466
 * Phase 2, God-folder burn-down). New code should import from
 * "../lib/components/EmptyState" (or the lib/components barrel); this
 * shim keeps existing import paths working.
 */
export {EmptyState} from "../lib/components/EmptyState";
export type {EmptyStateProps} from "../lib/components/EmptyState";
