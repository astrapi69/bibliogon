/**
 * DexieStorage — IStorageService backed by IndexedDB via Dexie
 * (mobile-sync Phase 3, C1).
 *
 * The offline mirror of the user-selected sync scope. Implements the
 * SAME IStorageService as ApiStorage, so `getStorage()` can return this
 * when offline and components keep calling the same methods.
 *
 * This module assembles the `dexieStorage` object from the per-namespace
 * modules under `./` and re-exports the supporting types + helpers. The
 * schema (table shapes + migration chain) lives in `./schema`; the shared
 * helpers in `./helpers`; the write-serialization wrapper in
 * `./serialized-update`; the reference-data seeding in `./seed`; and the
 * offline-download graph support in `./graph`.
 */

import type { IStorageService } from "../types";
import { articleAssets } from "./article-assets";
import { articles } from "./articles";
import { assets } from "./assets";
import { authors } from "./authors";
import { articlePlatforms, editorPluginStatus, publications } from "./backend-only";
import { books } from "./books";
import { chapterLabels } from "./chapter-labels";
import { chapters } from "./chapters";
import { comics } from "./comics";
import { comments } from "./comments";
import { covers } from "./covers";
import { pages } from "./pages";
import { bookTypes, contentTypes, i18n, settings } from "./reference";
import { storyBible } from "./story-bible";
import { writingSessions, writingStats } from "./writing";

export const dexieStorage: IStorageService = {
    mode: "dexie",
    books,
    chapters,
    articles,
    articleAssets,
    settings,
    i18n,
    bookTypes,
    contentTypes,
    writingSessions,
    writingStats,
    authors,
    publications,
    articlePlatforms,
    editorPluginStatus,
    chapterLabels,
    storyBible,
    pages,
    comics,
    assets,
    covers,
    comments,
};

export { offlineDb, getBaseline, setBaseline } from "./schema";
export type {
    ArticleAssetRow,
    AssetRow,
    CommentRow,
    OfflineArticleRow,
    OfflineBookRow,
    SyncBaseline,
    SyncQueueEntry,
    WritingSessionRow,
} from "./schema";
export { ensureSeeded, resetOfflineDatabase } from "./seed";
export { hasAssetBlob, storeArticleAssetBlob, storeAssetBlob } from "./helpers";
export {
    ingestBookGraph,
    isBookOffline,
    listOfflineBookIds,
    removeBookGraph,
} from "./graph";
