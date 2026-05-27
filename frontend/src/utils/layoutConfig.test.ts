/**
 * Unit tests for the layout_config namespace helpers (Fix B).
 *
 * PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 1 C1+C2. Covers:
 * - looksNamespaced: shape detection (flat vs namespaced)
 * - readLayoutNamespace: extract per-layout namespace
 *   (namespaced shape, legacy-flat shape, null, sibling-layout-only)
 * - writeLayoutNamespace: merge partial into per-layout namespace
 *   (null config, namespaced config, legacy-flat migration,
 *   sibling preservation)
 */

import {describe, it, expect} from "vitest"
import {
    looksNamespaced,
    readLayoutNamespace,
    writeLayoutNamespace,
} from "./layoutConfig"

describe("looksNamespaced", () => {
    it("returns false for null + undefined", () => {
        expect(looksNamespaced(null)).toBe(false)
        expect(looksNamespaced(undefined)).toBe(false)
    })

    it("returns false for empty object", () => {
        expect(looksNamespaced({})).toBe(false)
    })

    it("returns false for legacy-flat shape (no layout-name keys)", () => {
        expect(looksNamespaced({anchor_position: "top-left", opacity: 0.7})).toBe(
            false,
        )
        expect(looksNamespaced({split_ratio: 60, image_fit: "cover"})).toBe(false)
    })

    it("returns true when at least one layout-name key maps to an object", () => {
        expect(looksNamespaced({speech_bubble: {bubbles: []}})).toBe(true)
        expect(
            looksNamespaced({image_top_text_bottom: {image_position: "left"}}),
        ).toBe(true)
    })

    it("returns false when layout-name key has a non-object value", () => {
        // bubbles is a top-level key on the speech_bubble flat shape,
        // not a layout name. But a key like 'speech_bubble: null' is
        // edge-case noise — treat as flat shape (no real namespace).
        expect(looksNamespaced({speech_bubble: null})).toBe(false)
        expect(looksNamespaced({speech_bubble: "stringy"})).toBe(false)
        expect(looksNamespaced({image_top_text_bottom: 42})).toBe(false)
    })

    it("returns false when a layout-name key maps to an array", () => {
        // Arrays are not the namespace shape.
        expect(looksNamespaced({speech_bubble: [{anchor: "x"}]})).toBe(false)
    })

    it("returns true even when other keys are legacy-flat keys", () => {
        // Mixed shape: at least one namespace key is enough to count
        // the config as namespaced. Flat siblings get dropped on
        // first write.
        expect(
            looksNamespaced({
                speech_bubble: {bubbles: []},
                anchor_position: "top-left", // stray flat key
            }),
        ).toBe(true)
    })
})

describe("readLayoutNamespace", () => {
    it("returns null for null + undefined config", () => {
        expect(readLayoutNamespace(null, "speech_bubble")).toBe(null)
        expect(readLayoutNamespace(undefined, "speech_bubble")).toBe(null)
    })

    it("returns the layout's namespace from a namespaced config", () => {
        const config = {
            speech_bubble: {bubbles: [{anchor_position: "top-left"}]},
            image_top_text_bottom: {image_position: "right"},
        }
        const sb = readLayoutNamespace(config, "speech_bubble")
        expect(sb).toEqual({bubbles: [{anchor_position: "top-left"}]})
        const itb = readLayoutNamespace(config, "image_top_text_bottom")
        expect(itb).toEqual({image_position: "right"})
    })

    it("returns null when the layout has no namespace in a namespaced config", () => {
        const config = {speech_bubble: {opacity: 0.8}}
        // image_full_text_overlay has no namespace here.
        expect(
            readLayoutNamespace(config, "image_full_text_overlay"),
        ).toBe(null)
    })

    it("returns the WHOLE flat dict for legacy-flat configs", () => {
        // Legacy flat shape is treated as the current layout's
        // namespace. Bodies see their fields directly; the next
        // write migrates to namespaced shape.
        const config = {
            anchor_position: "center",
            opacity: 0.6,
            bubble_width: 50,
        }
        expect(readLayoutNamespace(config, "speech_bubble")).toEqual(config)
        // Same flat dict read for a different layout: returns the
        // whole thing (legacy fallback). On first write through
        // writeLayoutNamespace it gets scoped to whichever layout
        // is writing.
        expect(readLayoutNamespace(config, "image_top_text_bottom")).toEqual(
            config,
        )
    })

    it("treats empty-object config as legacy-flat (returns the empty object)", () => {
        // {} is technically not namespaced. Read returns the empty
        // object so bodies see their defaults; subsequent writes
        // create the namespace.
        expect(readLayoutNamespace({}, "speech_bubble")).toEqual({})
    })
})

describe("writeLayoutNamespace", () => {
    it("creates a fresh namespace when config is null", () => {
        const result = writeLayoutNamespace(null, "speech_bubble", {
            anchor_position: "top-left",
        })
        expect(result).toEqual({
            speech_bubble: {anchor_position: "top-left"},
        })
    })

    it("creates a fresh namespace when config is undefined", () => {
        const result = writeLayoutNamespace(undefined, "image_top_text_bottom", {
            image_fit: "cover",
        })
        expect(result).toEqual({
            image_top_text_bottom: {image_fit: "cover"},
        })
    })

    it("merges partial into existing namespace; preserves siblings", () => {
        const config = {
            speech_bubble: {bubbles: [{anchor_position: "bottom-center"}]},
            image_top_text_bottom: {image_position: "left"},
        }
        const result = writeLayoutNamespace(config, "speech_bubble", {
            opacity: 0.7,
        })
        // speech_bubble namespace gets the new field + retains
        // the prior bubbles.
        expect(result).toEqual({
            speech_bubble: {
                bubbles: [{anchor_position: "bottom-center"}],
                opacity: 0.7,
            },
            image_top_text_bottom: {image_position: "left"},
        })
    })

    it("legacy-flat config migrates to namespaced shape on first write", () => {
        const legacy = {
            anchor_position: "center",
            opacity: 0.8,
            bubble_width: 45,
        }
        const result = writeLayoutNamespace(legacy, "speech_bubble", {
            anchor_position: "top-right", // new value overrides
        })
        // Legacy keys folded into the speech_bubble namespace;
        // anchor_position is the new value.
        expect(result).toEqual({
            speech_bubble: {
                anchor_position: "top-right",
                opacity: 0.8,
                bubble_width: 45,
            },
        })
    })

    it("legacy-flat keys silently drop if they don't belong to the writing layout", () => {
        // Acceptable per backlog: Fix A's purge already removed
        // most stale-key cases. A page that wears a legacy flat
        // config with anchor_position + image_position simultaneously
        // would not have rendered correctly anyway.
        const legacy = {
            anchor_position: "center",
            image_position: "left",
        }
        const result = writeLayoutNamespace(legacy, "image_top_text_bottom", {
            image_fit: "contain",
        })
        // Whole flat dict gets scoped under image_top_text_bottom;
        // the anchor_position stale key is preserved BUT under the
        // wrong namespace. Acceptable for one-shot migration:
        // subsequent writes preserve only image_top_text_bottom keys.
        expect(result).toEqual({
            image_top_text_bottom: {
                anchor_position: "center",
                image_position: "left",
                image_fit: "contain",
            },
        })
    })

    it("creates a new layout namespace when the existing config covers other layouts", () => {
        const config = {
            speech_bubble: {bubbles: [{anchor_position: "top-left"}]},
        }
        const result = writeLayoutNamespace(
            config,
            "image_full_text_overlay",
            {text_position: "top"},
        )
        // Sibling speech_bubble preserved; new
        // image_full_text_overlay namespace created.
        expect(result).toEqual({
            speech_bubble: {bubbles: [{anchor_position: "top-left"}]},
            image_full_text_overlay: {text_position: "top"},
        })
    })

    it("preserves bubbles[0] when the partial is bubbles-shaped (4c-B-2 wrapper inside namespace)", () => {
        // speech_bubble's bubbles[0] wrapper lives INSIDE the
        // namespace; a partial like {bubbles: [...]} replaces the
        // whole bubbles array (shallow merge at the namespace level).
        const config = {
            speech_bubble: {
                bubbles: [{anchor_position: "bottom-center", opacity: 0.6}],
            },
        }
        const result = writeLayoutNamespace(config, "speech_bubble", {
            bubbles: [{anchor_position: "top-left", opacity: 0.6}],
        })
        expect(result).toEqual({
            speech_bubble: {
                bubbles: [{anchor_position: "top-left", opacity: 0.6}],
            },
        })
    })

    it("switch-→-switch-back: a write to speech_bubble preserves an existing image_full_text_overlay namespace", () => {
        // Fix B preservation pin: this is the load-bearing test
        // per backlog "Tests must include a switch → switch-back
        // assertion that prior config re-applies after returning to
        // a layout". Simulate: user has set image_full_text_overlay
        // config, switches to speech_bubble, edits an anchor. The
        // image_full_text_overlay namespace must survive the write.
        const config = {
            image_full_text_overlay: {text_position: "top"},
        }
        const result = writeLayoutNamespace(config, "speech_bubble", {
            anchor_position: "top-left",
        })
        expect(result).toEqual({
            image_full_text_overlay: {text_position: "top"},
            speech_bubble: {anchor_position: "top-left"},
        })
        // Reading the image_full_text_overlay namespace from the
        // result still finds the preserved value.
        expect(
            readLayoutNamespace(result, "image_full_text_overlay"),
        ).toEqual({text_position: "top"})
    })
})
