import {
    ConditionalFeatureStrategy,
    FeatureRegistry,
    type FeatureCondition,
    type FeatureDescriptor,
    type FeatureState,
} from "@astrapi69/feature-strategy";

import type { StorageMode } from "../storage/types";

/**
 * Evaluation context for every feature verdict.
 *
 * `mode` is the effective storage backend (`"api"` online / desktop / LAN,
 * `"dexie"` on the backendless GitHub-Pages PWA). `hasAiKey` reports whether a
 * usable AI configuration exists (a configured key, or a local provider that
 * needs none) so AI features can stay active offline with the user's own key.
 */
export interface FeatureContext {
    readonly mode: StorageMode;
    readonly hasAiKey: boolean;
}

/**
 * Stable feature identifiers. Every gating site references one of these
 * constants rather than a bare string. Grouped by verdict bucket: the
 * grouping is documentation only — the actual verdict comes from the
 * descriptor `defaultState` plus the strategy rules below.
 */
export const FEATURES = {
    EXPORT: "export",
    STORY_BIBLE: "story-bible",
    STORYBOARD: "storyboard",
    PICTURE_BOOK: "picture-book",
    COMICS: "comics",
    MEDIUM_IMPORT: "medium-import",
    WRITING_HISTORY: "writing-history",
    DANGER_ZONE_RESET: "danger-zone-reset",
    BOOK_IMPORT_JSON: "book-import-json",
    AUTHORS_EXPORT: "authors-export",
    BACKUP_EXPORT: "backup-export",
    BACKUP_IMPORT: "backup-import",

    AI_FILL: "ai-fill",
    AI_GENERATE: "ai-generate",
    AI_TEMPLATE_FILE_IO: "ai-template-file-io",

    GIT_SYNC: "git-sync",
    GIT_BACKUP: "git-backup",
    TTS: "tts",
    LAN_MODE: "lan-mode",
    BACKUP_COMPARE: "backup-compare",
    BACKUP_HISTORY: "backup-history",
    BGB_IMPORT: "bgb-import",
    PANDOC_EXPORT: "pandoc-export",
    VERSION_HISTORY: "version-history",
    TRANSLATION_LINKS: "translation-links",
    KDP_CATEGORY_CATALOG: "kdp-category-catalog",
    BULK_EXPORT: "bulk-export",
    WRITING_HISTORY_CSV: "writing-history-csv",
    BOOK_TEMPLATES: "book-templates",
} as const;

/**
 * i18n keys used as the {@link FeatureCondition.reason} for restrictive
 * verdicts. The registry stays React-free, so the key (not the translated
 * string) travels with the verdict; consumers resolve it through `t()`.
 * Bibliogon catalogs namespace UI strings under `ui.*`, so these are
 * `ui.feature.*` rather than the bare tokens the integration prompt sketched.
 */
export const FEATURE_REASON = {
    REQUIRES_DESKTOP_APP: "ui.feature.requires_desktop_app",
    REQUIRES_AI_KEY: "ui.feature.requires_ai_key",
} as const;

/**
 * Always-usable features in both modes. They carry only a descriptor
 * (`defaultState: 'active'`) and no strategy rule, so the strategy abstains
 * and the default wins everywhere. Listed here only to register the
 * descriptors; the grouping is not consulted at evaluation time.
 */
const ALWAYS_ACTIVE: readonly string[] = [
    FEATURES.EXPORT,
    FEATURES.STORY_BIBLE,
    FEATURES.STORYBOARD,
    FEATURES.PICTURE_BOOK,
    FEATURES.COMICS,
    FEATURES.MEDIUM_IMPORT,
    FEATURES.WRITING_HISTORY,
    FEATURES.DANGER_ZONE_RESET,
    FEATURES.BOOK_IMPORT_JSON,
    FEATURES.AUTHORS_EXPORT,
    FEATURES.BACKUP_EXPORT,
    FEATURES.BACKUP_IMPORT,
];

/**
 * AI features that work browser-direct WITH a configured key. Disabled in
 * Dexie mode only when no key is configured; active otherwise (online uses
 * the backend AI path, offline-with-key uses the user's own provider).
 */
const NEEDS_KEY: readonly string[] = [FEATURES.AI_FILL, FEATURES.AI_GENERATE];

/**
 * Features that genuinely cannot work in a browser (no git binary, no TTS
 * engine, no Pandoc, no LAN host, no backend round-trip). Hidden in Dexie
 * mode; active online (the strategy abstains online so the descriptor
 * default wins).
 */
const DEXIE_HIDDEN: readonly string[] = [
    FEATURES.GIT_SYNC,
    FEATURES.GIT_BACKUP,
    FEATURES.TTS,
    FEATURES.LAN_MODE,
    FEATURES.BACKUP_COMPARE,
    FEATURES.BACKUP_HISTORY,
    FEATURES.BGB_IMPORT,
    FEATURES.PANDOC_EXPORT,
    FEATURES.VERSION_HISTORY,
    FEATURES.TRANSLATION_LINKS,
    FEATURES.KDP_CATEGORY_CATALOG,
    FEATURES.BULK_EXPORT,
    FEATURES.WRITING_HISTORY_CSV,
    FEATURES.BOOK_TEMPLATES,
    // ai-template-file-io: the .biblio.yaml Export/Import round-trip calls
    // backend /api with no offline path, so it cannot run in the browser even
    // with a configured AI key — hidden offline, not key-dependent.
    FEATURES.AI_TEMPLATE_FILE_IO,
];

function descriptor(id: string): FeatureDescriptor {
    return { id, defaultState: "active" satisfies FeatureState };
}

const DESCRIPTORS: readonly FeatureDescriptor[] = [
    ...ALWAYS_ACTIVE,
    ...NEEDS_KEY,
    ...DEXIE_HIDDEN,
].map(descriptor);

function keyDependentCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => (ctx?.mode === "dexie" && !ctx.hasAiKey ? "disabled" : undefined),
        reason: FEATURE_REASON.REQUIRES_AI_KEY,
    };
}

function dexieHiddenCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => (ctx?.mode === "dexie" ? "hidden" : undefined),
        reason: FEATURE_REASON.REQUIRES_DESKTOP_APP,
    };
}

function buildRules(): Record<string, FeatureCondition<FeatureContext>> {
    const rules: Record<string, FeatureCondition<FeatureContext>> = {};
    for (const id of NEEDS_KEY) rules[id] = keyDependentCondition();
    for (const id of DEXIE_HIDDEN) rules[id] = dexieHiddenCondition();
    return rules;
}

/**
 * The application feature registry. A module constant (not a component-level
 * memo): descriptors registered once, the conditional strategy holding rules
 * only for the needs-key + dexie-hidden buckets. Unruled features abstain and
 * fall back to their `active` default; unknown ids fail closed to `hidden`.
 */
export const featureRegistry = new FeatureRegistry<FeatureContext>();
featureRegistry.registerAll(DESCRIPTORS);
featureRegistry.setStrategy(new ConditionalFeatureStrategy<FeatureContext>(buildRules()));
