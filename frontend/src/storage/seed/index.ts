/**
 * Offline-PWA seed data. The JSON files are generated from the backend
 * YAML SSoT by `scripts/generate-seed-data.py` (`make generate-seed-data`)
 * and committed; this module re-exports them with the API response types so
 * DexieStorage can populate its reference tables on first init.
 *
 * Imported only by `dexie-storage.ts`, which is itself dynamically imported
 * (offline capability only), so the (large) i18n catalogs never enter the
 * eager desktop bundle.
 */

import type {
    BookTypeDef,
    ContentTypeDef,
    DiscoveredPlugin,
    StoryEntityTypeDef,
} from "../../api/client";

import seedSettings from "./seed-settings.json";
import seedBookTypes from "./seed-book-types.json";
import seedContentTypes from "./seed-content-types.json";
import seedStoryEntityTypes from "./seed-story-entity-types.json";
import seedPluginMetadata from "./seed-plugin-metadata.json";
import i18nDe from "./seed-i18n-de.json";
import i18nEn from "./seed-i18n-en.json";
import i18nEs from "./seed-i18n-es.json";
import i18nFr from "./seed-i18n-fr.json";
import i18nEl from "./seed-i18n-el.json";
import i18nPt from "./seed-i18n-pt.json";
import i18nTr from "./seed-i18n-tr.json";
import i18nJa from "./seed-i18n-ja.json";

/** Default app settings (mirrors GET /api/settings/app defaults). */
export const SEED_SETTINGS = seedSettings as Record<string, unknown>;

/** {id: BookTypeDef} (mirrors GET /api/book-types). */
export const SEED_BOOK_TYPES = seedBookTypes as unknown as Record<
    string,
    BookTypeDef
>;

/** {id: ContentTypeDef} (mirrors GET /api/content-types). */
export const SEED_CONTENT_TYPES = seedContentTypes as unknown as Record<
    string,
    ContentTypeDef
>;

/** {id: StoryEntityTypeDef} (mirrors GET /api/story-bible/entity-types). */
export const SEED_STORY_ENTITY_TYPES = seedStoryEntityTypes as unknown as Record<
    string,
    StoryEntityTypeDef
>;

/** Standard visible plugins (mirrors GET /api/settings/plugins/discovered). */
export const SEED_PLUGIN_METADATA =
    seedPluginMetadata as unknown as DiscoveredPlugin[];

/** Per-language i18n catalogs (mirrors GET /api/i18n/{lang}). */
export const SEED_I18N: Record<string, Record<string, unknown>> = {
    de: i18nDe as Record<string, unknown>,
    en: i18nEn as Record<string, unknown>,
    es: i18nEs as Record<string, unknown>,
    fr: i18nFr as Record<string, unknown>,
    el: i18nEl as Record<string, unknown>,
    pt: i18nPt as Record<string, unknown>,
    tr: i18nTr as Record<string, unknown>,
    ja: i18nJa as Record<string, unknown>,
};
