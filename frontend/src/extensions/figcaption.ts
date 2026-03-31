import {Node, mergeAttributes} from "@tiptap/core";

/**
 * Custom TipTap node for image captions (figcaption).
 *
 * Imported as: <p class="figcaption">text</p> or <figcaption>text</figcaption>
 * Rendered as: <figcaption>text</figcaption>
 */
export const Figcaption = Node.create({
    name: "figcaption",
    group: "block",
    content: "inline*",

    parseHTML() {
        return [
            {tag: "p.figcaption"},
            {tag: "figcaption"},
        ];
    },

    renderHTML({HTMLAttributes}) {
        return ["figcaption", mergeAttributes(HTMLAttributes), 0];
    },
});
