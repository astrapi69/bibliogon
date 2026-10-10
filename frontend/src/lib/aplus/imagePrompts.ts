/**
 * The A+ image slots' style parameters and their copy-and-paste prompt
 * strings (#890).
 *
 * Mirrors `bibliogon_aplus.image_prompts`. The style comes from the
 * ruleset's `image_style` block, per genre; the rendered string is
 * derived on the way out and deliberately never stored, so a cached
 * package cannot carry a stale one (#865).
 *
 * @example
 * renderImagePrompt({prompt: "a cat", aspect_ratio: "1:1", size: "",
 *                    style_flags: ["--no text"]});
 * // "a cat --ar 1:1 --no text"
 */

import type { AplusImage } from "../../api/platform/aplus";
import {
    type AplusImageStyleRules,
    imageStyleFor,
} from "./ruleset";

/**
 * An image slot as it may actually arrive: a row cached under an older
 * ruleset version can be missing any of the fields the current schema
 * declares, so every one is optional here.
 */
export type ImagePromptSlot = Partial<AplusImage>;

/** Style parameters for one slot (header or a tile). */
export interface ModuleImageStyle {
    model_hint: string;
    style_flags: string[];
    aspect_ratio: string;
    target_pixel_size: string;
}

/** The resolved style for both slots, for one genre. */
export interface AplusImageStyleContext {
    header: ModuleImageStyle;
    three_images: ModuleImageStyle;
}

/**
 * The header and tile styles for a genre.
 *
 * An unknown genre key falls back to the default style rather than
 * throwing, and a slot the ruleset has no entry for yields `""` -
 * `renderImagePrompt` then simply omits that parameter.
 */
export function buildStyleContext(
    genreKey: string | null | undefined,
    imageStyle: AplusImageStyleRules,
): AplusImageStyleContext {
    const { modelHint, styleFlags } = imageStyleFor(imageStyle, genreKey);
    const slot = (key: string): ModuleImageStyle => ({
        model_hint: modelHint,
        style_flags: [...styleFlags],
        aspect_ratio: imageStyle.aspect_ratios[key] ?? "",
        target_pixel_size: imageStyle.target_pixel_sizes[key] ?? "",
    });
    return {
        header: slot("module_header"),
        three_images: slot("module_three_images"),
    };
}

/**
 * One slot as `<prompt> --ar <aspect_ratio> <style_flags>`.
 *
 * An empty prompt renders as `""`: a bare parameter tail is not a
 * prompt. The pixel size is left out on purpose - that is production
 * metadata for the UI, not a prompt keyword.
 */
export function renderImagePrompt(image: ImagePromptSlot): string {
    const prompt = (image.prompt ?? "").trim();
    if (!prompt) return "";
    const parts = [prompt];
    if (image.aspect_ratio) parts.push(`--ar ${image.aspect_ratio}`);
    parts.push(...(image.style_flags ?? []));
    return parts.join(" ");
}

/** A package slot, which may or may not carry an image block. */
interface PackageSlot {
    image?: ImagePromptSlot;
    [key: string]: unknown;
}

/**
 * A package as it may actually arrive.
 *
 * `AplusPackage` describes the CURRENT schema; a row cached under an
 * older ruleset version can be missing whole slots, so the two fields
 * this touches are typed as unknown and checked at runtime. Stating the
 * tolerance in the type keeps a caller from assuming more than the
 * cache guarantees.
 */
export interface RenderablePackage {
    module_header?: unknown;
    module_three_images?: unknown;
}

function withRendered(slot: unknown): void {
    if (!slot || typeof slot !== "object") return;
    const image = (slot as PackageSlot).image;
    if (!image || typeof image !== "object") return;
    image.rendered = renderImagePrompt(image);
}

/**
 * A copy of a package with `rendered` added to the header image and to
 * every tile image.
 *
 * Tolerates a package with no image blocks - rows cached under a ruleset
 * version that predates them - and never mutates its input, so the
 * stored JSON stays free of the derived string.
 */
export function withRenderedPrompts<T extends RenderablePackage>(pkg: T): T {
    const result = structuredClone(pkg);
    withRendered(result.module_header);
    const tiles: unknown = result.module_three_images;
    if (Array.isArray(tiles)) {
        for (const tile of tiles) withRendered(tile);
    }
    return result;
}
