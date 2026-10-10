/**
 * The A+ generation loop, in the browser (#890 stage 3b).
 *
 * Mirrors `bibliogon_aplus.generator`: prompt -> model -> YAML-fragment
 * parse -> deterministic validation -> up to
 * `max_regeneration_retries` regenerations while hard errors survive.
 * After the last attempt the package comes back WITH its remaining
 * errors rather than being swallowed, so the caller decides what to do
 * with a draft the validator still rejects.
 *
 * Pinned against `generate.parity.json`, recorded from the Python with
 * a scripted client. What the record covers and what the generate
 * ROUTE adds on top of this function is enumerated in the recorder's
 * own docstring; two of its steps have no browser equivalent and are
 * stated here instead of being left implicit:
 *
 * - `_is_ai_enabled()` becomes `isAiConfigured` at the call site. There
 *   is no server setting to read; a browser-direct call needs the key
 *   the user stored in Settings and nothing else.
 * - The `aplus_content` cache is not ported, because it has no reader.
 *   The only caller passes `force=true`, and the generated package is
 *   written straight into the editable A+ document, which has lived in
 *   the storage seam since #891. A Dexie table nothing reads back is
 *   the half-wired shape `lessons-learned.md` warns about, so the
 *   bullet the issue asked for is deliberately not built.
 *
 * The model call is injected rather than imported. A module under
 * `lib/` may not reach into app code, and the injection is what lets
 * the parity test drive the same loop from a scripted reply.
 *
 * @example
 * const pkg = await generateAplusPackage(context, {
 *     language: "de",
 *     rules: getAplusRuleset(),
 *     chat: (messages, opts) => aiChat(config, messages, opts),
 * });
 */

import { parse as parseYaml } from "yaml";

import type {
    AplusBullet,
    AplusFinding,
    AplusImage,
    AplusMeta,
    AplusModule,
    AplusPackage,
} from "../../api/platform/aplus";
import type { BookContext } from "./bookContext";
import {
    buildStyleContext,
    type AplusImageStyleContext,
    type ModuleImageStyle,
} from "./imagePrompts";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import type { AplusRuleset } from "./ruleset";
import { validateAplusPackage } from "./validation";

/**
 * The loop always runs one initial attempt and then retries up to
 * `max_regeneration_retries` more times, so the total call count is
 * this plus the configured budget - never the budget alone (#829).
 */
export const INITIAL_GENERATION_ATTEMPT = 1;

/** One chat turn, in the shape both the browser client and the backend use. */
export interface AplusChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

/** What the loop needs back from a provider call. */
export interface AplusChatReply {
    content: string;
    model?: string;
}

/** The injected model call. Mirrors the Python `ChatClient` Protocol. */
export type AplusChatFn = (
    messages: AplusChatMessage[],
    options: { temperature: number },
) => Promise<AplusChatReply>;

/** The temperature the Python passes on every attempt. */
const GENERATION_TEMPERATURE = 0.6;

/**
 * One of the model's string fields, as a clean string.
 *
 * A YAML key present with no value parses to null, and the Python's
 * `str(None)` used to put the literal word "None" into the author's
 * copy - fixed in #1086 by collapsing null and whitespace-only to "".
 * This mirrors the fixed behaviour, which is what the record holds.
 *
 * Only those two collapse: a model that answers with an unquoted
 * number meant those digits, and YAML parsed them as a number, so the
 * field keeps them. The two runtimes stringify an integer and a string
 * identically, which the record covers. They differ for a float
 * (`4.0` vs `4`) and a boolean (`True` vs `true`) - degenerate replies
 * where the resulting text is equally unusable either way, so neither
 * is recorded and neither is special-cased.
 */
function text(raw: unknown): string {
    if (raw === null || raw === undefined) return "";
    return String(raw).trim();
}

/** A mapping, or `{}` for anything else (null, a list, a scalar). */
function mapping(raw: unknown): Record<string, unknown> {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

/**
 * Parse a (possibly fenced) YAML fragment from an AI response.
 *
 * Same shape as the Python `_parse_ai_yaml_fragment`: strip a leading
 * ``` or ```yaml fence and a trailing one, parse, and return `{}` for
 * anything that is not a mapping - a reply the model wrapped in prose,
 * a list, a bare scalar, or YAML that does not parse at all. The
 * caller then treats the attempt as having produced nothing usable and
 * lets the validator report on an empty draft.
 *
 * YAML rather than JSON mode on purpose: every AI consumer in this
 * project asks for YAML, because the multi-provider client has no
 * uniform JSON-mode support. The `yaml` package arrived with #745,
 * which is what unblocked this port.
 */
export function parseAiYamlFragment(rawText: string): Record<string, unknown> {
    if (!rawText) return {};
    let cleaned = rawText.trim();
    if (cleaned.startsWith("```")) {
        const lines = cleaned.split(/\r?\n/);
        if (lines.length > 0 && lines[0].startsWith("```")) lines.shift();
        if (lines.length > 0 && lines[lines.length - 1].trim() === "```") lines.pop();
        cleaned = lines.join("\n").trim();
    }
    let parsed: unknown;
    try {
        parsed = parseYaml(cleaned);
    } catch {
        return {};
    }
    return mapping(parsed);
}

function slotImage(style: ModuleImageStyle, prompt: string): AplusImage {
    return {
        prompt,
        aspect_ratio: style.aspect_ratio,
        size: style.target_pixel_size,
        style_flags: [...style.style_flags],
    };
}

function moduleFrom(raw: unknown, style: ModuleImageStyle): AplusModule {
    const entry = mapping(raw);
    return {
        title: text(entry.title),
        text: text(entry.text),
        image: slotImage(style, text(entry.image_prompt)),
        alt_text: text(entry.alt_text),
    };
}

/**
 * Build a draft from whatever the model replied.
 *
 * Tolerant by design: a missing or wrongly-typed key becomes an empty
 * string or an empty list rather than throwing, so a partially broken
 * reply still produces a draft the validator can report on. A
 * non-mapping entry inside `bullets` or `module_three_images` is
 * dropped, which is why a reply with two good bullets and one stray
 * string yields two.
 *
 * The model supplies only the keyword prompt per image; the aspect
 * ratio, size and style flags come from `styles` - the ruleset
 * resolved for the book's genre - so the same prompt gets the
 * Kinderbuch illustration style on a children's book and the default
 * style elsewhere (#865).
 */
export function buildDraftPackage(
    parsed: Record<string, unknown>,
    meta: AplusMeta,
    styles: AplusImageStyleContext,
): AplusPackage {
    const bulletsRaw = parsed.bullets;
    const bullets: AplusBullet[] = Array.isArray(bulletsRaw)
        ? bulletsRaw
              .filter((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry))
              .map((entry) => {
                  const bullet = entry as Record<string, unknown>;
                  return { heading: text(bullet.heading), body: text(bullet.body) };
              })
        : [];

    const tilesRaw = parsed.module_three_images;
    const tiles: AplusModule[] = Array.isArray(tilesRaw)
        ? tilesRaw
              .filter((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry))
              .map((entry) => moduleFrom(entry, styles.three_images))
        : [];

    return {
        short_description: text(parsed.short_description),
        bullets,
        module_header: moduleFrom(parsed.module_header, styles.header),
        module_three_images: tiles,
        validation: [],
        meta,
    };
}

/** The clock, injectable so a test can pin the stamp. */
export type NowFn = () => string;

export interface GenerateAplusOptions {
    language: string;
    rules: AplusRuleset;
    chat: AplusChatFn;
    /** Defaults to `new Date().toISOString()`. */
    now?: NowFn;
}

/**
 * Run generate -> validate -> regenerate.
 *
 * Returns the best package produced with its findings attached, even
 * after the retry budget is spent with hard errors still present.
 * Never throws on a bad model reply; only a failure from `chat` itself
 * propagates, which is the browser client's `AiClientError` and the
 * caller's to classify.
 */
export async function generateAplusPackage(
    context: BookContext,
    options: GenerateAplusOptions,
): Promise<AplusPackage> {
    const { language, rules, chat } = options;
    const now = options.now ?? (() => new Date().toISOString());
    const genreKey = context.genre_key;
    const styles = buildStyleContext(genreKey, rules.image_style);

    let priorFindings: AplusFinding[] | null = null;
    let modelUsed = "";
    let draft: AplusPackage = {
        short_description: "",
        bullets: [],
        module_header: {
            title: "",
            text: "",
            image: { prompt: "", aspect_ratio: "", size: "", style_flags: [] },
            alt_text: "",
        },
        module_three_images: [],
        validation: [],
        meta: {
            book_id: context.book_id,
            language,
            model: "",
            ruleset_version: rules.version,
            generated_at: now(),
        },
    };

    const maxAttempts = INITIAL_GENERATION_ATTEMPT + rules.max_regeneration_retries;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const reply = await chat(
            [
                { role: "system", content: buildSystemPrompt(language) },
                { role: "user", content: buildUserPrompt(context, { rules, priorFindings }) },
            ],
            { temperature: GENERATION_TEMPERATURE },
        );
        // Sticky: a later reply that names no model must not blank the
        // one an earlier attempt reported.
        modelUsed = reply.model || modelUsed;
        const parsed = parseAiYamlFragment(reply.content ?? "");
        draft = buildDraftPackage(parsed, {
            book_id: context.book_id,
            language,
            model: modelUsed,
            ruleset_version: rules.version,
            generated_at: now(),
        }, styles);
        const findings = validateAplusPackage(draft, { language, genreKey, ruleset: rules });
        draft.validation.push(...findings);

        if (!findings.some((finding) => finding.severity === "error")) return draft;
        priorFindings = findings.filter((finding) => finding.severity === "error");
    }

    return draft;
}
