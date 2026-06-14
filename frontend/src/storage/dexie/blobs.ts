import {
  blobToArrayBuffer,
} from "./record-helpers";
import {
  AssetRow,
  newId,
  nowIso,
  offlineDb,
} from "./schema";
import {
  ensureSeeded,
} from "./seed";

export async function storeAssetBlob(
  bookId: string,
  filename: string,
  blob: Blob,
  mimeType: string,
  assetType: string,
  id?: string,
): Promise<AssetRow> {
  await ensureSeeded();
  const data = await blobToArrayBuffer(blob);
  const existing = (await offlineDb.assets
    .where("[bookId+filename]")
    .equals([bookId, filename])
    .primaryKeys()) as string[];
  if (existing.length) await offlineDb.assets.bulkDelete(existing);
  const row: AssetRow = {
    // The offline-download byte-fetch passes the SERVER asset id so the
    // id-served picture-book / collage URLs (`/assets/{id}/file`) resolve;
    // fresh uploads mint a uuid.
    id: id ?? newId(),
    bookId,
    filename,
    mimeType,
    assetType,
    data,
    createdAt: nowIso(),
  };
  await offlineDb.assets.put(row);
  return row;
}

/** Whether a (bookId, filename) asset blob is already cached. Lets the lazy
 *  online-view cache skip a redundant re-download. */

export async function hasAssetBlob(
  bookId: string,
  filename: string,
): Promise<boolean> {
  const count = await offlineDb.assets
    .where("[bookId+filename]")
    .equals([bookId, filename])
    .count();
  return count > 0;
}

/** Read a Blob/File into an ArrayBuffer, with a FileReader fallback for
 *  environments whose Blob lacks `.arrayBuffer()`. */
