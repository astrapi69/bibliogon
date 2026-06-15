/**
 * DexieStorage barrel — re-exports the `./dexie/` module set.
 *
 * The implementation was split from a single ~2200-line file into the
 * `./dexie/` module set (schema + helpers + per-namespace modules + the
 * assembling `index`). This file stays as a thin re-export so every
 * existing importer (`./dexie-storage`) keeps working unchanged.
 *
 * See `./dexie/index.ts` for the assembled `dexieStorage` and the full
 * list of re-exported types + helpers.
 */

export * from "./dexie/index";
