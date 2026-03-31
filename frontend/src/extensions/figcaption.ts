import {Node, mergeAttributes} from "@tiptap/core";

/**
 * Custom TipTap node for image captions (figcaption).
 *
 * Imported content: <p class="figcaption">Caption text</p>
 * Rendered in editor as styled paragraph with italic, smaller font.
 */
export const Figcaption = Node.create({
    name: "figcaption",
    group: "block",
    content: "inline*",

    parseHTML() {
        return [
            {tag: 'p.figcaption'},
            {tag: 'figcaption'},
        ];
    },

    renderHTML({HTMLAttributes}) {
        return ["p", mergeAttributes(HTMLAttributes, {class: "figcaption"}), 0];
    },
});
