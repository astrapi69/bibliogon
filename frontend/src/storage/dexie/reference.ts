/**
 * Reference-data namespaces backed by the seeded blob tables: app settings
 * (the one mutable surface), i18n catalogs, and the book-type / content-type
 * registries.
 */

import type { IStorageService } from "../types";
import { isPlainObject } from "./helpers";
import { offlineDb, REF_KEY, SETTINGS_KEY } from "./schema";
import { ensureSeeded } from "./seed";
import {
    SEED_BOOK_TYPES,
    SEED_CONTENT_TYPES,
    SEED_PLUGIN_METADATA,
    SEED_SETTINGS,
} from "../seed";
import { serializedUpdate } from "./serialized-update";

export const settings: IStorageService["settings"] = {
    getApp: async () => {
        await ensureSeeded();
        const row = await offlineDb.appSettings.get(SETTINGS_KEY);
        return (row?.data ?? SEED_SETTINGS) as Record<string, unknown>;
    },

    /**
     * Apply a settings patch with a shallow per-section merge, mirroring the
     * backend PATCH semantics (`current.setdefault(section, {}).update(...)`):
     * object sections merge key-by-key, scalars replace.
     */
    updateApp: async (patch) =>
        serializedUpdate("app_settings", SETTINGS_KEY, async () => {
            await ensureSeeded();
            const row = await offlineDb.appSettings.get(SETTINGS_KEY);
            const current = (row?.data ?? SEED_SETTINGS) as Record<string, unknown>;
            const merged: Record<string, unknown> = { ...current };
            for (const [key, value] of Object.entries(patch)) {
                const prev = merged[key];
                merged[key] =
                    isPlainObject(prev) && isPlainObject(value) ? { ...prev, ...value } : value;
            }
            await offlineDb.appSettings.put({ key: SETTINGS_KEY, data: merged });
            return merged;
        }),

    discoveredPlugins: async () => {
        await ensureSeeded();
        const row = await offlineDb.pluginMetaRef.get(REF_KEY);
        return row?.data ?? SEED_PLUGIN_METADATA;
    },
};

export const i18n: IStorageService["i18n"] = {
    get: async (lang: string) => {
        await ensureSeeded();
        const row = await offlineDb.i18nCatalogs.get(lang);
        if (row) return row.catalog;
        const fallback = await offlineDb.i18nCatalogs.get("en");
        return fallback?.catalog ?? {};
    },
};

export const bookTypes: IStorageService["bookTypes"] = {
    list: async () => {
        await ensureSeeded();
        const row = await offlineDb.bookTypesRef.get(REF_KEY);
        return row?.data ?? SEED_BOOK_TYPES;
    },
};

export const contentTypes: IStorageService["contentTypes"] = {
    list: async () => {
        await ensureSeeded();
        const row = await offlineDb.contentTypesRef.get(REF_KEY);
        return row?.data ?? SEED_CONTENT_TYPES;
    },
};
