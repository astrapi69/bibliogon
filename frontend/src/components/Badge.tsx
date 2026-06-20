/**
 * Re-export shim: Badge moved to lib/components/Badge (#466 Phase 2,
 * God-folder burn-down). New code should import from
 * "../lib/components/Badge" (or the lib/components barrel); this shim
 * keeps existing import paths working.
 */
export {Badge, default} from "../lib/components/Badge";
export type {BadgeProps, BadgeVariant} from "../lib/components/Badge";
