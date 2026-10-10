/**
 * The prompts the A+ generator sends, in the browser (#890 stage 3b).
 *
 * Mirrors `bibliogon_aplus.prompts`. The text is the behaviour here:
 * a browser that asks the model for something other than what the
 * desktop asks for gets different copy out of the same book, which is
 * the kind of divergence nobody notices until two authors compare
 * their A+ pages. So every line is pinned against the recorded output
 * of the Python builders in `generate.parity.json`, system prompt per
 * language and user prompt per branch.
 *
 * Both length-bearing parts read the ruleset rather than restating its
 * numbers, for the reason #896 exists: the alt-text limit once told
 * the model 200 while the validator enforced 100, so the model was
 * asked for text the gate then rejected.
 *
 * @example
 * const messages = [
 *     { role: "system", content: buildSystemPrompt("de") },
 *     { role: "user", content: buildUserPrompt(context, { rules, priorFindings: null }) },
 * ];
 */

import type { AplusFinding } from "../../api/platform/aplus";
import type { BookContext } from "./bookContext";
import type { AplusRuleset, AplusSchemaLimits } from "./ruleset";

/**
 * Language names the system prompt addresses the model in.
 *
 * A code that is absent falls back to the bare code ("You write ... in
 * el"), which is what the Python does and what the record pins - the
 * ruleset's supported set is four languages, and this table is not the
 * place that decides which.
 */
const LANGUAGE_NAMES: Record<string, string> = {
    de: "German",
    en: "English",
    fr: "French",
    es: "Spanish",
};

/**
 * The rules the model is asked to follow, in plain language.
 *
 * Guidance, not the gate: `validateAplusPackage` enforces all of it
 * deterministically afterwards. Saying it here only raises the odds
 * that the first attempt passes.
 */
export function buildSystemPrompt(language: string): string {
    const languageName = LANGUAGE_NAMES[language] ?? language;
    return (
        `You write Amazon A+ Content copy in ${languageName}. Reply with a single ` +
        "YAML document and nothing else - no prose before or after it, no markdown " +
        "headings.\n\n" +
        "Hard rules:\n" +
        "- Never use an em dash or en dash; use a plain hyphen or rewrite the sentence.\n" +
        "- Never use emoji.\n" +
        "- Never mention price, shipping, discounts, or availability.\n" +
        "- Never reference a competing retailer, platform, or brand.\n" +
        "- Never use a marketing imperative such as 'Learn', 'Discover', or 'Find out' " +
        "(or their equivalent in the target language) - write descriptive prose instead.\n" +
        "- Every image alt text must be a real, non-empty description.\n" +
        "- Image prompts are comma-separated descriptive keywords, never literal text " +
        "to render inside the image.\n"
    );
}

/** The reply skeleton, with every length taken from the ruleset. */
function yamlFieldSpec(limits: AplusSchemaLimits): string {
    return (
        `short_description: <string, max ${limits.short_description} characters>\n` +
        "bullets:\n" +
        `  - heading: <string, max ${limits.bullet_heading} characters>\n` +
        `    body: <string, max ${limits.bullet_body} characters>\n` +
        "  - heading: ...\n" +
        "    body: ...\n" +
        "  - heading: ...\n" +
        "    body: ...\n" +
        "module_header:\n" +
        "  title: <string>\n" +
        "  text: <string>\n" +
        "  image_prompt: <comma-separated descriptive keywords>\n" +
        `  alt_text: <string, max ${limits.alt_text} characters, never empty>\n` +
        "module_three_images:\n" +
        "  - title: <string>\n" +
        "    text: <string>\n" +
        "    image_prompt: <comma-separated descriptive keywords>\n" +
        `    alt_text: <string, max ${limits.alt_text} characters, never empty>\n` +
        "  - title: ...\n" +
        "  - title: ...\n"
    );
}

/** The failed attempt's errors, quoted so the retry knows what to fix. */
function correctionSection(priorFindings: AplusFinding[] | null | undefined): string {
    if (!priorFindings || priorFindings.length === 0) return "";
    const lines = priorFindings.map((finding) => `- ${finding.field}: ${finding.message}`);
    return (
        "\nYour previous attempt had these problems - fix every one of them:\n" +
        lines.join("\n") +
        "\n"
    );
}

/**
 * The user turn for one generation attempt.
 *
 * Every optional context line is omitted rather than emitted empty,
 * and `bisac_codes` is deliberately absent: the codes are a retail
 * taxonomy, not something a copywriter can use, and the Python leaves
 * them out of the prompt while still folding them into the cache hash.
 */
export function buildUserPrompt(
    context: BookContext,
    options: { rules: AplusRuleset; priorFindings?: AplusFinding[] | null },
): string {
    const lines: string[] = [`Book title: ${context.title}`];
    if (context.subtitle) lines.push(`Subtitle: ${context.subtitle}`);
    if (context.author) lines.push(`Author: ${context.author}`);
    if (context.categories.length > 0) lines.push(`Categories: ${context.categories.join(", ")}`);
    if (context.keywords.length > 0) lines.push(`Keywords: ${context.keywords.join(", ")}`);
    if (context.genre_key) {
        lines.push(`Genre/style: ${context.genre_key}`);
        if (context.genre_key === "kinderbuch") {
            lines.push(
                "This is a children's book (Kinderbuch). Use a warm, friendly, age-" +
                    "appropriate tone and avoid any mention of violence, theft, or weapons.",
            );
        }
    }
    lines.push("");
    lines.push("Source description (use this as the basis for the copy):");
    lines.push(context.description_text || "(no description provided)");
    lines.push("");
    lines.push("Reply with exactly this YAML shape, filled in:");
    lines.push(yamlFieldSpec(options.rules.schema_limits));
    lines.push(correctionSection(options.priorFindings));

    return lines.join("\n");
}
