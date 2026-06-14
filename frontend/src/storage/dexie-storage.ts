// dexie-storage.ts - barrel for the IndexedDB storage seam (Batch 3 split).
//
// The implementation lives in ./dexie/* modules (schema + 9 migrations,
// seeding, write-queue, row builders, blobs, book-graph, and the
// domain-grouped dexieStorage namespaces). Re-exported here so every existing
// `../storage/dexie-storage` import site keeps working unchanged.
export * from "./dexie";
