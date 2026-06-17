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
    /**
     * Whether the browser currently has general network connectivity
     * (`navigator.onLine`). Drives the network-dependent features (GitHub /
     * URL import) which reach external hosts directly, independent of whether
     * the Bibliogon backend is reachable. Optional for backward-compatible
     * test fixtures; `undefined` is treated as online.
     */
    readonly online?: boolean;
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
    GITHUB_IMPORT: "github-import",
    URL_IMPORT: "url-import",
    WRITING_HISTORY: "writing-history",
    DANGER_ZONE_RESET: "danger-zone-reset",
    BOOK_IMPORT_JSON: "book-import-json",
    AUTHORS_EXPORT: "authors-export",
    BACKUP_EXPORT: "backup-export",
    BACKUP_IMPORT: "backup-import",
    SELECTIVE_EXPORT: "selective-export",
    EXPORT_PREVIEW: "export-preview",
    DATA_MANAGEMENT: "data-management",

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
    REQUIRES_NETWORK: "ui.feature.requires_network",
    NOT_YET_AVAILABLE: "ui.feature.not_yet_available",
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
    // Selective export gathers a chosen subset of the same JSON backup
    // bundle through the storage seam (no /api), so it works offline like
    // the full-backup export (#247).
    FEATURES.SELECTIVE_EXPORT,
    // Export preview renders the client-side HTML export (TipTap -> HTML) in
    // an iframe; no backend, works in both modes (#316).
    FEATURES.EXPORT_PREVIEW,
    // `.bgb` full-data backup import runs client-side (`importBgbFile`):
    // unzip + JSON parse + storage-seam writes, no Pandoc/Git, so it works
    // in Dexie mode like every other offline importer (#99).
    FEATURES.BGB_IMPORT,
    // The Settings > Daten tab (storage overview + export/import + cache
    // maintenance) is purely client-side: it reads IndexedDB counts +
    // navigator.storage.estimate() and writes only through the storage
    // seam. No backend round-trip, so it is active in both modes (#338).
    FEATURES.DATA_MANAGEMENT,
];

/**
 * AI features that work browser-direct WITH a configured key. Disabled in
 * Dexie mode only when no key is configured; active otherwise (online uses
 * the backend AI path, offline-with-key uses the user's own provider).
 */
const NEEDS_KEY: readonly string[] = [FEATURES.AI_FILL, FEATURES.AI_GENERATE];

/**
 * Features that are purely client-side but reach external hosts directly
 * (GitHub REST API, arbitrary URL fetch). They are active in BOTH storage
 * modes as long as the browser has network connectivity; only a genuine
 * offline state (`navigator.onLine === false`) disables them, with the
 * "requires internet connection" reason. No backend, so no `/api`.
 */
const NEEDS_NETWORK: readonly string[] = [FEATURES.GITHUB_IMPORT, FEATURES.URL_IMPORT];

/**
 * Features that genuinely cannot work in a browser (no git binary, no TTS
 * engine, no Pandoc, no LAN host, no backend round-trip). In Dexie mode they
 * resolve to `disabled` with the desktop-app reason (per the policy: nothing
 * the user owns is hidden — it stays visible and explained); online the
 * strategy abstains so the descriptor `active` default wins.
 *
 * `ai-template-file-io` is in this bucket rather than the key-dependent one:
 * the `.biblio.yaml` Export/Import round-trip calls backend `/api` with no
 * offline path, so it stays desktop-only even with a configured AI key.
 */
const DESKTOP_ONLY: readonly string[] = [
    FEATURES.GIT_SYNC,
    FEATURES.GIT_BACKUP,
    FEATURES.TTS,
    FEATURES.LAN_MODE,
    FEATURES.BACKUP_COMPARE,
    FEATURES.BACKUP_HISTORY,
    FEATURES.PANDOC_EXPORT,
    FEATURES.VERSION_HISTORY,
    FEATURES.TRANSLATION_LINKS,
    FEATURES.KDP_CATEGORY_CATALOG,
    FEATURES.BULK_EXPORT,
    FEATURES.WRITING_HISTORY_CSV,
    FEATURES.BOOK_TEMPLATES,
    FEATURES.AI_TEMPLATE_FILE_IO,
];

function descriptor(id: string): FeatureDescriptor {
    return { id, defaultState: "active" satisfies FeatureState };
}

const DESCRIPTORS: readonly FeatureDescriptor[] = [
    ...ALWAYS_ACTIVE,
    ...NEEDS_KEY,
    ...NEEDS_NETWORK,
    ...DESKTOP_ONLY,
].map(descriptor);

function keyDependentCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => (ctx?.mode === "dexie" && !ctx.hasAiKey ? "disabled" : undefined),
        reason: FEATURE_REASON.REQUIRES_AI_KEY,
    };
}

function desktopOnlyCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => (ctx?.mode === "dexie" ? "disabled" : undefined),
        reason: FEATURE_REASON.REQUIRES_DESKTOP_APP,
    };
}

function networkDependentCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => (ctx?.online === false ? "disabled" : undefined),
        reason: FEATURE_REASON.REQUIRES_NETWORK,
    };
}

function buildRules(): Record<string, FeatureCondition<FeatureContext>> {
    const rules: Record<string, FeatureCondition<FeatureContext>> = {};
    for (const id of NEEDS_KEY) rules[id] = keyDependentCondition();
    for (const id of NEEDS_NETWORK) rules[id] = networkDependentCondition();
    for (const id of DESKTOP_ONLY) rules[id] = desktopOnlyCondition();
    return rules;
}

/**
 * The application feature registry. A module constant (not a component-level
 * memo): descriptors registered once, the conditional strategy holding rules
 * only for the needs-key + desktop-only buckets. Unruled features abstain and
 * fall back to their `active` default. Unknown ids fail closed to `hidden` -
 * that is the library's typo safety net, not the UI policy (no product
 * feature is ever hidden; user-owned features are active or disabled).
 */
export const featureRegistry = new FeatureRegistry<FeatureContext>();
featureRegistry.registerAll(DESCRIPTORS);
featureRegistry.setStrategy(new ConditionalFeatureStrategy<FeatureContext>(buildRules()));
