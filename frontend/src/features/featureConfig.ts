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
    /**
     * Whether the configured AI provider can be reached browser-direct (its API
     * serves CORS headers for browser calls). Only matters in Dexie mode, where
     * AI runs from the browser. As of 2026-06-19 EVERY shipped provider qualifies
     * (Gemini / Anthropic / OpenAI / Mistral / LM Studio / custom — verified
     * against live CORS headers + the adaptive-learner PWA), so this resolves to
     * `true` for all real providers and the gate below is dormant defensive infra
     * (it fires only if a future provider is added to `CORS_BLOCKED_PROVIDERS`).
     * Optional for backward-compatible test fixtures; `undefined` is treated as
     * capable (no extra gate). See
     * docs/explorations/openai-cors-browser-direct-analysis.md.
     */
    readonly aiProviderBrowserCapable?: boolean;
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
    WRITING_HISTORY_CSV: "writing-history-csv",
    TRANSLATION_LINKS: "translation-links",
    KDP_CATEGORY_CATALOG: "kdp-category-catalog",
    DANGER_ZONE_RESET: "danger-zone-reset",
    BOOK_IMPORT_JSON: "book-import-json",
    AUTHORS_EXPORT: "authors-export",
    BACKUP_EXPORT: "backup-export",
    BACKUP_IMPORT: "backup-import",
    SELECTIVE_EXPORT: "selective-export",
    EXPORT_PREVIEW: "export-preview",
    DATA_MANAGEMENT: "data-management",
    EVENT_RECORDING: "event-recording",

    AI_FILL: "ai-fill",
    AI_GENERATE: "ai-generate",
    AI_STORY_EXTRACTION: "ai-story-extraction",
    AI_TEMPLATE_FILE_IO: "ai-template-file-io",
    // Browser-direct AI text tools (#661): grammar correction + translation of
    // the editor selection, run against the user's own provider key. They are
    // the OFFLINE (Dexie) alternative to the backend GRAMMAR / TRANSLATION
    // surfaces below — key-dependent (active with a key, disabled+explained
    // without), so they coexist with the desktop-premium LanguageTool / DeepL
    // paths rather than replacing them.
    AI_GRAMMAR: "ai-grammar",
    AI_TRANSLATE: "ai-translate",

    GIT_SYNC: "git-sync",
    LEARNSET_EXPORT: "learnset-export",
    APLUS_AI: "aplus-ai",
    PORTFOLIO_BOARD: "portfolio-board",
    GIT_BACKUP: "git-backup",
    TTS: "tts",
    LAN_MODE: "lan-mode",
    BACKUP_COMPARE: "backup-compare",
    BACKUP_HISTORY: "backup-history",
    BGB_IMPORT: "bgb-import",
    PANDOC_EXPORT: "pandoc-export",
    VERSION_HISTORY: "version-history",
    BULK_EXPORT: "bulk-export",
    // Server-bound review/translation surfaces with no browser path: the
    // grammar spellcheck proxies LanguageTool through the backend, and the
    // article translation executes DeepL/LMStudio via the backend plugin.
    // Offline they have no implementation, so they are disabled+explained
    // (policy #78) rather than failing silently on the guardedFetch backstop.
    // The OFFLINE browser-direct grammar/translation path lives behind the
    // key-dependent AI_GRAMMAR / AI_TRANSLATE gates above (#661).
    GRAMMAR: "grammar",
    TRANSLATION: "translation",

    // Publish an Article to a platform through its API instead of the
    // user copying it across (#918). The affordance exists; no adapter
    // does yet, so it is disabled everywhere with the not-yet reason -
    // see NOT_YET_IMPLEMENTED below.
    PUBLISH_VIA_API: "publish-via-api",
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
    /** The configured AI provider serves no CORS headers for browser-direct
     *  calls, so it cannot run in the backendless PWA. Dormant: no shipped
     *  provider is currently CORS-blocked (kept for a hypothetical future one). */
    PROVIDER_CORS_BLOCKED: "ui.feature.provider_cors_blocked",
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
    // The backup log reads through the seam since #748: the backend's
    // store online, the browser's own IndexedDB log offline. Active in
    // both modes - the one thing it cannot do offline is hand back a
    // `.bgb` the browser no longer has, and it never offered that.
    FEATURES.BACKUP_HISTORY,
    // The .bgb diff runs in the browser since #748: unzip both archives
    // with fflate, reuse the #728 line diff. Nothing server-side left.
    FEATURES.BACKUP_COMPARE,
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
    // The diagnostic event recorder (in-memory ring buffer + Dexie-persisted
    // log) runs entirely client-side and never sends anything anywhere; it is
    // active in both modes. Registered as a declared feature (EVT-06) so the
    // recorder consults the registry instead of mounting ungated, giving a
    // single kill-switch and an audit point.
    FEATURES.EVENT_RECORDING,
    // A translation group is one shared id across book rows - no master,
    // no hierarchy, nothing for a server to compute - so the sibling list,
    // the link and the unlink all run against Dexie offline (#746).
    FEATURES.TRANSLATION_LINKS,
    // The bulk Export buttons render each selected book or article through
    // the same client export engine the single-file download uses, then pack
    // the results with fflate - so the ZIP and the combined document are
    // built in the browser offline and by Pandoc online, from one branch
    // in `bulkExportRun` (#743).
    FEATURES.BULK_EXPORT,
    // Amazon's browse categories are reference data, not a server
    // computation, so the suggestions come from a client catalog offline
    // and the field behaves the same in both modes (#738).
    FEATURES.KDP_CATEGORY_CATALOG,
    // The Writing-History CSV is serialised in the browser from the same
    // day-aggregated series the view already renders (the Dexie
    // `writingSessions` table since #668), then downloaded as a Blob. No
    // backend round-trip, so one implementation serves both modes (#744).
    FEATURES.WRITING_HISTORY_CSV,
    // Chapter version history + manual snapshots run through the storage
    // seam: automatic versions are written on every chapter save and named
    // snapshots on demand, both into the Dexie `chapterVersions` table, and
    // the diff is computed client-side. No backend round-trip, so the whole
    // surface is active in both modes (#728).
    FEATURES.VERSION_HISTORY,
];

/**
 * AI features that work browser-direct WITH a configured key. Disabled in
 * Dexie mode only when no key is configured; active otherwise (online uses
 * the backend AI path, offline-with-key uses the user's own provider).
 */
const NEEDS_KEY: readonly string[] = [
    FEATURES.AI_FILL,
    FEATURES.AI_GENERATE,
    FEATURES.AI_GRAMMAR,
    FEATURES.AI_TRANSLATE,
];

/**
 * Features that are purely client-side but reach external hosts directly
 * (GitHub REST API, arbitrary URL fetch). They are active in BOTH storage
 * modes as long as the browser has network connectivity; only a genuine
 * offline state (`navigator.onLine === false`) disables them, with the
 * "requires internet connection" reason. No backend, so no `/api`.
 */
const NEEDS_NETWORK: readonly string[] = [FEATURES.GITHUB_IMPORT, FEATURES.URL_IMPORT];

/**
 * AI features that ALSO reach an external provider directly, so they need BOTH
 * a usable key (browser-direct in Dexie mode) AND live network connectivity.
 * Disabled when the browser is offline (with the network reason) or, in Dexie
 * mode, when no key is configured (with the AI-key reason); active otherwise.
 * The AI Story Bible / Storyboard extraction (#374) lives here: it streams the
 * whole manuscript to the provider, so a genuine offline state must gate it.
 *
 * `translation` joined it with #751. It was desktop-only while the only
 * implementations were the backend's DeepL and LMStudio - DeepL's browser
 * path is the verify-first question still open on that issue, and LMStudio
 * is a localhost server a PWA cannot reach. The article translation now
 * runs through the user's own AI provider instead, which needs the same key
 * and the same live connection as the extraction above.
 */
const NEEDS_KEY_AND_NETWORK: readonly string[] = [
    FEATURES.AI_STORY_EXTRACTION,
    FEATURES.TRANSLATION,
];

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
 *
 * `portfolio-board` (#810) is in this bucket for the same reason as the
 * server-bound review surfaces: the per-format retail state lives in the
 * `book_format_states` table that the promotion plugin owns, with no Dexie
 * mirror and no client-side source for it, so offline there is nothing to
 * read. It stays visible and explained rather than silently empty.
 *
 * `backup-history` and `backup-compare` BOTH left this bucket in #748. The
 * log is the browser's own record of what it backed up, kept in its own
 * IndexedDB database so it outlives the Danger-Zone reset. The compare
 * reads two files the user picked and touches nothing else, so the old
 * round trip uploaded both archives to learn what the browser can work out
 * with `fflate` and the line diff the version history already uses.
 *
 * `learnset-export` (#763/#775) is a deliberate Maximal-Offline exception,
 * recorded in `.claude/rules/architecture.md`: the export assembles the alc
 * ZIP server-side and validates it against the vendored learn-content-engine
 * schemas with Python jsonschema, so it has no browser implementation to
 * route through the storage seam.
 *
 * `aplus-ai` (#891) gates only the AI fill of the A+ document: the package
 * is built from the plugin's versioned Python ruleset and every field is
 * checked by its deterministic Python validator. Editing the A+ document by
 * hand is not gated; it goes through the storage seam and works offline.
 * Browser-direct AI plus a TypeScript validator is tracked in #890.
 */
const DESKTOP_ONLY: readonly string[] = [
    FEATURES.GIT_SYNC,
    FEATURES.GIT_BACKUP,
    FEATURES.LEARNSET_EXPORT,
    FEATURES.APLUS_AI,
    FEATURES.PORTFOLIO_BOARD,
    FEATURES.TTS,
    FEATURES.LAN_MODE,
    FEATURES.PANDOC_EXPORT,
    FEATURES.AI_TEMPLATE_FILE_IO,
    FEATURES.GRAMMAR,
];

/**
 * Features whose UI has shipped ahead of their implementation, so they are
 * `disabled` in BOTH modes with the not-yet-available reason.
 *
 * `publish-via-api` (#918) is the bucket's first and only member. The
 * Publications panel offers the action for a platform whose schema declares
 * `publishing_method: "api"`, which makes the declared field finally
 * load-bearing - but no adapter exists in any deployment, so enabling it on
 * desktop would be a button that fails on click. "Requires the desktop app"
 * would be the wrong reason for the same source: today the desktop app
 * cannot do it either. It becomes desktop-only (CORS blocks browser-direct
 * posts to WordPress / Ghost / Forem) when the first adapter lands with
 * #917, and the gate moves to DESKTOP_ONLY in that change.
 */
const NOT_YET_IMPLEMENTED: readonly string[] = [FEATURES.PUBLISH_VIA_API];

function descriptor(id: string): FeatureDescriptor {
    return { id, defaultState: "active" satisfies FeatureState };
}

const DESCRIPTORS: readonly FeatureDescriptor[] = [
    ...ALWAYS_ACTIVE,
    ...NEEDS_KEY,
    ...NEEDS_NETWORK,
    ...NEEDS_KEY_AND_NETWORK,
    ...DESKTOP_ONLY,
    ...NOT_YET_IMPLEMENTED,
].map(descriptor);

function keyDependentCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => {
            if (ctx?.mode !== "dexie") return undefined;
            if (!ctx.hasAiKey) return "disabled";
            if (ctx.aiProviderBrowserCapable === false) return "disabled";
            return undefined;
        },
        reason: (ctx) =>
            ctx?.hasAiKey && ctx.aiProviderBrowserCapable === false
                ? FEATURE_REASON.PROVIDER_CORS_BLOCKED
                : FEATURE_REASON.REQUIRES_AI_KEY,
    };
}

function desktopOnlyCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => (ctx?.mode === "dexie" ? "disabled" : undefined),
        reason: FEATURE_REASON.REQUIRES_DESKTOP_APP,
    };
}

function notYetImplementedCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: () => "disabled",
        reason: FEATURE_REASON.NOT_YET_AVAILABLE,
    };
}

function networkDependentCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => (ctx?.online === false ? "disabled" : undefined),
        reason: FEATURE_REASON.REQUIRES_NETWORK,
    };
}

function keyAndNetworkCondition(): FeatureCondition<FeatureContext> {
    return {
        evaluate: (ctx) => {
            if (ctx?.online === false) return "disabled";
            if (ctx?.mode === "dexie" && !ctx.hasAiKey) return "disabled";
            if (ctx?.mode === "dexie" && ctx.aiProviderBrowserCapable === false) return "disabled";
            return undefined;
        },
        reason: (ctx) => {
            if (ctx?.online === false) return FEATURE_REASON.REQUIRES_NETWORK;
            if (ctx?.mode === "dexie" && ctx.hasAiKey && ctx.aiProviderBrowserCapable === false) {
                return FEATURE_REASON.PROVIDER_CORS_BLOCKED;
            }
            return FEATURE_REASON.REQUIRES_AI_KEY;
        },
    };
}

function buildRules(): Record<string, FeatureCondition<FeatureContext>> {
    const rules: Record<string, FeatureCondition<FeatureContext>> = {};
    for (const id of NEEDS_KEY) rules[id] = keyDependentCondition();
    for (const id of NEEDS_NETWORK) rules[id] = networkDependentCondition();
    for (const id of NEEDS_KEY_AND_NETWORK) rules[id] = keyAndNetworkCondition();
    for (const id of DESKTOP_ONLY) rules[id] = desktopOnlyCondition();
    for (const id of NOT_YET_IMPLEMENTED) rules[id] = notYetImplementedCondition();
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
