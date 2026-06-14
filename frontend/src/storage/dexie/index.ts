import type { IStorageService } from "../types";
import { store_coreNamespaces } from "./store-core";
import { store_contentNamespaces } from "./store-content";

/**
 * DexieStorage - IStorageService backed by IndexedDB via Dexie. Assembled by
 * spreading the domain-grouped namespace objects (Batch 3 god-file split of
 * the former 1978-line dexie-storage.ts). Schema/migrations, seeding, the
 * write-queue, row builders, blobs, and the book-graph live in sibling
 * modules; this barrel re-exports the public surface so every
 * `../storage/dexie-storage` import keeps working.
 */
export const dexieStorage: IStorageService = {
  mode: "dexie",
  ...store_coreNamespaces,
  ...store_contentNamespaces,
};

export * from "./schema";
export * from "./seed";
export * from "./blobs";
export * from "./graph";
