/**
 * module-aplus — browser-side counterpart of `plugin-aplus`.
 *
 * Offline parity layer (Maximal Offline, #34). A+ Content has two halves
 * and they belong in different places: the AI drafting needs a model
 * call, while the deterministic validator reads a versioned ruleset and
 * returns findings with no model, no network and no database. The second
 * half runs in the browser (#890), so the web app can check a package
 * the user wrote or edited by hand.
 *
 * The ruleset reaches the browser through the offline seed - it has no
 * API endpoint - and the validator is a rule-for-rule port of
 * `bibliogon_aplus.validation`, pinned against findings recorded from
 * the real Python validator (`validation.parity.json`). Implementation
 * lives in `src/lib/aplus/` (pure, library-grade); this barrel is the
 * stable plugin-parity seam under `modules/`.
 *
 * The generate route's deterministic half is ported too: the missing-
 * field check that short-circuits before any model call, the book
 * context, the cache key and the image slots' copy-and-paste strings
 * (`context.parity.json`). What is left of the route is the model call
 * itself and the cache table.
 *
 * Partial parity: generating a package still needs the backend, and the
 * `aplus-ai` feature stays gated with its reason (#891). Editing an A+
 * document by hand already works offline through the storage seam
 * (#887).
 *
 * @example
 * import { validateAplusPackage } from "@/modules/module-aplus";
 *
 * const findings = validateAplusPackage(pkg, { language: book.language });
 */
export {
    escalatedWords,
    getAplusRuleset,
    imageStyleFor,
    languageRules,
} from "../../lib/aplus/ruleset";
export type {
    AplusImageStyleRules,
    AplusLanguageRules,
    AplusRuleset,
    AplusSchemaLimits,
} from "../../lib/aplus/ruleset";
export {
    APLUS_FINDING_CODES,
    containsWord,
    startsWithImperativeVerb,
    validateAplusPackage,
} from "../../lib/aplus/validation";
export {
    JUVENILE_TEXT_MARKERS,
    buildBookContext,
    computeSourceHash,
    findMissingFields,
} from "../../lib/aplus/bookContext";
export type {
    BookContext,
    BookContextSource,
    MissingFieldFinding,
} from "../../lib/aplus/bookContext";
export {
    buildStyleContext,
    renderImagePrompt,
    withRenderedPrompts,
} from "../../lib/aplus/imagePrompts";
export type {
    AplusImageStyleContext,
    ImagePromptSlot,
    ModuleImageStyle,
    RenderablePackage,
} from "../../lib/aplus/imagePrompts";
