/**
 * #890: the image-slot behaviour a recording cannot state.
 *
 * `context.parity.test.ts` pins the rendered strings and the style
 * contexts against Python output. What it cannot state is the shapes
 * this has to survive without throwing - a package cached under an
 * older ruleset version, a tile list that is not a list, a slot with no
 * image block - because those are the cases a caller hits when the
 * cache outlives a schema change (#865).
 */

import {describe, expect, it} from "vitest";

import {
    type ImagePromptSlot,
    type RenderablePackage,
    buildStyleContext,
    renderImagePrompt,
    withRenderedPrompts,
} from "./imagePrompts";

/** A slot carrying only what a given case is about. */
interface TestSlot {
    image?: ImagePromptSlot;
    headline?: string;
}
import {getAplusRuleset} from "./ruleset";

const STYLE = getAplusRuleset().image_style;

describe("buildStyleContext", () => {
    it("falls back to the default style for a genre it has no entry for", () => {
        expect(buildStyleContext("eine-erfundene-kategorie", STYLE)).toEqual(
            buildStyleContext(null, STYLE),
        );
    });

    it("treats undefined like null", () => {
        expect(buildStyleContext(undefined, STYLE)).toEqual(
            buildStyleContext(null, STYLE),
        );
    });

    it("gives a genre with an override a different style", () => {
        // Guards the fallback test above: if the override were lost,
        // "falls back to the default" would pass trivially.
        expect(buildStyleContext("kinderbuch", STYLE).header.style_flags)
            .not.toEqual(buildStyleContext(null, STYLE).header.style_flags);
    });

    it("copies the flag list rather than sharing the ruleset's", () => {
        const first = buildStyleContext(null, STYLE);
        first.header.style_flags.push("--mutated");
        expect(buildStyleContext(null, STYLE).header.style_flags)
            .not.toContain("--mutated");
    });

    it("yields an empty string for a slot the ruleset has no size for", () => {
        const sparse = {...STYLE, aspect_ratios: {}, target_pixel_sizes: {}};
        const context = buildStyleContext(null, sparse);
        expect(context.header.aspect_ratio).toBe("");
        expect(context.three_images.target_pixel_size).toBe("");
    });
});

describe("renderImagePrompt", () => {
    it("renders nothing for a slot with no prompt at all", () => {
        expect(renderImagePrompt({})).toBe("");
    });

    it("renders nothing for a prompt that is only parameters", () => {
        expect(
            renderImagePrompt({
                prompt: "",
                aspect_ratio: "1:1",
                style_flags: ["--no text"],
            }),
        ).toBe("");
    });

    it("leaves the pixel size out", () => {
        // Production metadata for the UI, not a prompt keyword.
        expect(
            renderImagePrompt({prompt: "a cat", size: "300x300"}),
        ).toBe("a cat");
    });

    it("puts the ratio before the flags", () => {
        expect(
            renderImagePrompt({
                prompt: "a cat",
                aspect_ratio: "1:1",
                style_flags: ["--style raw"],
            }),
        ).toBe("a cat --ar 1:1 --style raw");
    });
});

describe("withRenderedPrompts survives a package from an older ruleset", () => {
    it("tolerates a package with no image blocks", () => {
        const pkg = {module_header: {headline: "Titel"}, module_three_images: []};
        expect(withRenderedPrompts(pkg)).toEqual(pkg);
    });

    it("tolerates a tile list that is not a list", () => {
        const pkg = {module_three_images: "not a list"};
        expect(withRenderedPrompts(pkg)).toEqual(pkg);
    });

    it("tolerates a slot that is null", () => {
        const pkg = {module_header: null, module_three_images: [null]};
        expect(withRenderedPrompts(pkg)).toEqual(pkg);
    });

    it("tolerates a package with neither slot", () => {
        const pkg: RenderablePackage & {short_description: string} = {
            short_description: "x",
        };
        expect(withRenderedPrompts(pkg)).toEqual({short_description: "x"});
    });

    it("renders the header and every tile", () => {
        const pkg: {module_header: TestSlot; module_three_images: TestSlot[]} = {
            module_header: {image: {prompt: "header", aspect_ratio: "97:60"}},
            module_three_images: [
                {image: {prompt: "one", aspect_ratio: "1:1"}},
                {image: {prompt: "two"}},
                {headline: "no image here"},
            ],
        };
        const rendered = withRenderedPrompts(pkg);
        expect(rendered.module_header.image?.rendered).toBe("header --ar 97:60");
        expect(rendered.module_three_images[0].image?.rendered).toBe("one --ar 1:1");
        expect(rendered.module_three_images[1].image?.rendered).toBe("two");
        expect(rendered.module_three_images[2]).toEqual({headline: "no image here"});
    });

    it("overwrites a rendered string the cache already carries", () => {
        // A row cached before a prompt edit holds the old string; the
        // point of deriving it on the way out is that it cannot survive.
        const pkg: {module_header: TestSlot} = {
            module_header: {image: {prompt: "neu", rendered: "alt"}},
        };
        expect(withRenderedPrompts(pkg).module_header.image?.rendered).toBe("neu");
    });
});
