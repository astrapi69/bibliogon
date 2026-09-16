/**
 * Offline reference-data seeding (Track B) + Danger-Zone reset.
 *
 * Populates the reference tables from the committed seed JSON on first
 * init (idempotent + non-destructive), and provides the offline-mode
 * Danger-Zone reset that drops and re-seeds the whole DB.
 */

import {
    SEED_BOOK_TYPES,
    SEED_CHAPTER_TEMPLATES,
    SEED_CONTENT_TYPES,
    SEED_I18N,
    SEED_PLUGIN_METADATA,
    SEED_SETTINGS,
    SEED_STORY_ENTITY_TYPES,
} from "../seed";
import { offlineDb, REF_KEY, SETTINGS_KEY } from "./schema";

let seedPromise: Promise<void> | null = null;

/** Populate the reference tables from the committed seed. Idempotent +
 *  non-destructive: writes only an ABSENT row, so a user-edited settings
 *  row (or a newly-added i18n language on seed regen) is never clobbered.
 *  Memoized so concurrent reads seed exactly once. */
export function ensureSeeded(): Promise<void> {
    if (!seedPromise) seedPromise = doSeed();
    return seedPromise;
}

/** Test-only: forget that the seed already ran, so the next
 *  {@link ensureSeeded} re-populates a cleared database. Without it a suite
 *  that wipes the tables between cases leaves every later case un-seeded —
 *  the module-level memo outlives the table contents. */
export function __resetSeedForTests(): void {
    seedPromise = null;
}

async function doSeed(): Promise<void> {
    if (!(await offlineDb.appSettings.get(SETTINGS_KEY))) {
        await offlineDb.appSettings.put({ key: SETTINGS_KEY, data: SEED_SETTINGS });
    }
    if (!(await offlineDb.bookTypesRef.get(REF_KEY))) {
        await offlineDb.bookTypesRef.put({ key: REF_KEY, data: SEED_BOOK_TYPES });
    }
    if (!(await offlineDb.contentTypesRef.get(REF_KEY))) {
        await offlineDb.contentTypesRef.put({
            key: REF_KEY,
            data: SEED_CONTENT_TYPES,
        });
    }
    if (!(await offlineDb.storyEntityTypesRef.get(REF_KEY))) {
        await offlineDb.storyEntityTypesRef.put({
            key: REF_KEY,
            data: SEED_STORY_ENTITY_TYPES,
        });
    }
    if (!(await offlineDb.pluginMetaRef.get(REF_KEY))) {
        await offlineDb.pluginMetaRef.put({
            key: REF_KEY,
            data: SEED_PLUGIN_METADATA,
        });
    }
    for (const [lang, catalog] of Object.entries(SEED_I18N)) {
        if (!(await offlineDb.i18nCatalogs.get(lang))) {
            await offlineDb.i18nCatalogs.put({ lang, catalog });
        }
    }
    // Chapter templates seed ROWS of a user-writable table (#731), so the
    // idempotency check mirrors the backend's: insert only when no builtin
    // row exists yet. A user's own templates are never touched.
    const builtinCount = await offlineDb.chapterTemplates
        .filter((t) => t.is_builtin)
        .count();
    if (builtinCount === 0) {
        await offlineDb.chapterTemplates.bulkPut(
            SEED_CHAPTER_TEMPLATES.map((t) => ({ ...t })),
        );
    }
}

/**
 * Drop and re-seed the offline database back to the first-install state.
 *
 * Deletes every user-created table, reopens the schema, resets the seed
 * memoization, and re-runs the idempotent seed so the app boots with
 * default settings plus the committed reference catalogs. Backs the
 * Settings Danger Zone reset in Dexie (offline) mode, where there is no
 * backend ``POST /api/system/reset`` to call.
 */
export async function resetOfflineDatabase(): Promise<void> {
    await offlineDb.delete();
    await offlineDb.open();
    seedPromise = null;
    await ensureSeeded();
}
