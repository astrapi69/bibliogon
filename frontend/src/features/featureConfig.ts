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
 * Stable feature identifiers used across the registry, the consumers and the
 * tests. Grouped by the verdict bucket they belong to.
 */
export const FEATURE = {
    GIT_SYNC: "git-sync",
    GIT_BACKUP: "git-backup",
    LAN_MODE: "lan-mode",
    BACKUP_COMPARE: "backup-compare",
    BACKUP_HISTORY: "backup-history",
    BGB_IMPORT: "bgb-import",
    BGB_EXPORT: "bgb-export",
    TRANSLATION_LINKS: "translation-links",
    BOOK_TEMPLATES: "book-templates",
    WRITING_HISTORY_CSV: "writing-history-csv",
    BULK_EXPORT: "bulk-export",
    KDP_CATEGORY_CATALOG: "kdp-category-catalog",
    TTS: "tts",
    PANDOC_EXPORT: "pandoc-export",
    VERSION_HISTORY: "version-history",
    AI_GENERATE: "ai-generate",
    AI_FILL: "ai-fill",
} as const;

/**
 * i18n keys used as the {@link FeatureCondition.reason} for restrictive
 * verdicts. The registry stays React-free, so the key (not the translated
 * string) travels with the verdict; consumers resolve it through `t()`.
 */
export const FEATURE_REASON = {
    REQUIRES_DESKTOP_APP: "ui.feature.requires_desktop_app",
    REQUIRES_AI_KEY: "ui.feature.requires_ai_key",
} as const;

/**
 * Features that genuinely cannot work in a browser (no git binary, no TTS
 * engine, no Pandoc, no LAN host, no backend round-trip). Hidden in Dexie
 * mode; active online. The strategy abstains online so the descriptor default
 * (`active`) wins.
 */
const DEXIE_HIDDEN: readonly string[] = [
    FEATURE.GIT_SYNC,
    FEATURE.GIT_BACKUP,
    FEATURE.LAN_MODE,
    FEATURE.BACKUP_COMPARE,
    FEATURE.BACKUP_HISTORY,
    FEATURE.BGB_IMPORT,
    FEATURE.BGB_EXPORT,
    FEATURE.TRANSLATION_LINKS,
    FEATURE.BOOK_TEMPLATES,
    FEATURE.WRITING_HISTORY_CSV,
    FEATURE.BULK_EXPORT,
    FEATURE.KDP_CATEGORY_CATALOG,
    FEATURE.TTS,
    FEATURE.PANDOC_EXPORT,
    FEATURE.VERSION_HISTORY,
];

/**
 * AI features that work browser-direct WITH a configured key. Disabled in
 * Dexie mode only when no key is configured; active otherwise (online uses the
 * backend AI path, offline-with-key uses the user's own provider).
 */
const KEY_DEPENDENT: readonly string[] = [FEATURE.AI_GENERATE, FEATURE.AI_FILL];

/**
 * Features that are always usable in both modes. They carry only a descriptor
 * (`defaultState: 'active'`) and no strategy rule, so the strategy abstains and
 * the default wins everywhere.
 */
const ALWAYS_ACTIVE: readonly string[] = [
    "export",
    "story-bible",
    "storyboard",
    "picture-book",
    "comics",
    "medium-import",
    "writing-history",
    "danger-zone-reset",
    "book-import-json",
    "authors-export",
];

function descriptor(id: string): FeatureDescriptor {
    return { id, defaultState: "active" satisfies FeatureState };
}

const DESCRIPTORS: readonly FeatureDescriptor[] = [
    ...DEXIE_HIDDEN,
    ...KEY_DEPENDENT,
    ...ALWAYS_ACTIVE,
].map(descriptor);

function dexieHiddenCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => (ctx?.mode === "dexie" ? "hidden" : undefined),
        reason: FEATURE_REASON.REQUIRES_DESKTOP_APP,
    };
}

function keyDependentCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => (ctx?.mode === "dexie" && !ctx.hasAiKey ? "disabled" : undefined),
        reason: FEATURE_REASON.REQUIRES_AI_KEY,
    };
}

function buildRules(): Record<string, FeatureCondition<FeatureContext>> {
    const rules: Record<string, FeatureCondition<FeatureContext>> = {};
    for (const id of DEXIE_HIDDEN) rules[id] = dexieHiddenCondition();
    for (const id of KEY_DEPENDENT) rules[id] = keyDependentCondition();
    return rules;
}

/**
 * The application feature registry. A module constant (not a component-level
 * memo): descriptors registered once, the conditional strategy holding rules
 * only for the hidden + key-dependent buckets. Unruled features abstain and
 * fall back to their `active` default; unknown ids fail closed to `hidden`.
 */
export const featureRegistry = new FeatureRegistry<FeatureContext>();
featureRegistry.registerAll(DESCRIPTORS);
featureRegistry.setStrategy(new ConditionalFeatureStrategy<FeatureContext>(buildRules()));
