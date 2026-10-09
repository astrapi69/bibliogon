/**
 * Storage namespace for the preview deploy (#991).
 *
 * GitHub Pages serves the production app at
 * `astrapi69.github.io/bibliogon/` and the preview build at
 * `astrapi69.github.io/bibliogon-preview/`. An origin is scheme, host and
 * port - the path is not part of it - so both paths are one origin and
 * share one IndexedDB. Opening the preview therefore wrote into the same
 * databases the production app reads, and a schema change shipped to the
 * preview could leave production state the stable build cannot open.
 *
 * Suffixing the database names in the preview build gives it its own
 * stores. Production keeps the unsuffixed names, so no existing install
 * migrates and no book moves. Preview data written before this landed
 * stays in the production databases, which is the one-off cost of
 * separating them; the preview carries a non-stable warning banner for
 * exactly this class of surprise.
 *
 * This does NOT separate the origin - only a custom domain does. The
 * localStorage preferences stay shared, and so does everything a sibling
 * project site on the same account can reach.
 *
 * @example
 * class DraftsDB extends Dexie {
 *     constructor() {
 *         super(storageDbName("bibliogon"));
 *     }
 * }
 */

/** The suffix a preview build appends to every database name. */
export const PREVIEW_DB_SUFFIX = "-preview";

/**
 * Append the preview suffix to a database name when `isPreview` is set.
 *
 * Kept as a pure function so the branch is testable without a build-time
 * constant; `storageDbName` is the caller-facing wrapper that reads the
 * constant.
 */
export function namespacedDbName(baseName: string, isPreview: boolean): string {
    return isPreview ? `${baseName}${PREVIEW_DB_SUFFIX}` : baseName;
}

/** The database name this build must use for `baseName`. */
export function storageDbName(baseName: string): string {
    return namespacedDbName(baseName, __IS_PREVIEW__ || false);
}
