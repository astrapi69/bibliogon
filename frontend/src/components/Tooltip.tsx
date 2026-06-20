/**
 * Re-export shim: Tooltip moved to lib/components/Tooltip (#466 Phase 2,
 * God-folder burn-down). New code should import from
 * "../lib/components/Tooltip" (or the lib/components barrel); this shim
 * keeps existing import paths working.
 */
export {default} from "../lib/components/Tooltip";
