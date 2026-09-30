/**
 * Flatten a TipTap node tree to plain text.
 *
 * The one implementation for the frontend's block-aware flatteners,
 * which had drifted into three copies that disagreed on how to join
 * inline siblings (#849).
 *
 * The rule that settles it is how ProseMirror stores whitespace: a
 * paragraph reading `sehr <strong>wichtig</strong>` is **not** two words
 * that need re-separating, it is the text nodes `"sehr "` and
 * `"wichtig"` — the space belongs to the first node. So inline siblings
 * are joined with nothing; inserting a space there doubles the ones that
 * exist and invents ones that do not (`<em>Hallo</em><strong>Welt</strong>`
 * renders as `HalloWelt`, and should flatten to that).
 *
 * Block nodes (`doc`, `paragraph`, any `heading*`) join their children
 * with a newline, so a first-non-empty-line heuristic sees real lines.
 *
 * A `hardBreak` is an inline node carrying neither text nor content, so
 * both previous join characters lost it — `""` glued the two lines into
 * one word, `" "` demoted a line break to a space. It maps to a newline.
 *
 * @example
 * flattenTipTapText(doc);   // "Kapitel 1\nErster Absatz"
 */

/**
 * Node types that end a line once their content is emitted.
 *
 * Deliberately the same set the three previous copies used. Wrappers
 * like `listItem` and `blockquote` are absent because the paragraph
 * they contain already ends the line; adding them produces a blank line
 * per list entry.
 */
const BLOCK_TYPES = new Set(["doc", "paragraph"]);

interface TipTapNodeLike {
    type?: string;
    text?: string;
    content?: unknown[];
}

function isBlock(type: string | undefined): boolean {
    if (type === undefined) return false;
    return BLOCK_TYPES.has(type) || type.startsWith("heading");
}

function walk(node: unknown): string {
    if (!node || typeof node !== "object") return "";
    const record = node as TipTapNodeLike;
    if (typeof record.text === "string") return record.text;
    if (record.type === "hardBreak") return "\n";
    if (!Array.isArray(record.content)) return "";
    // Children always concatenate; a block ENDS a line rather than
    // separating its own children, which is what keeps a paragraph whose
    // text is split across marks on one line.
    const inner = record.content.map(walk).join("");
    return isBlock(record.type) ? `${inner}\n` : inner;
}

/**
 * Walk a TipTap node (or a whole document) and return its plain text.
 *
 * @param node Any value; anything that is not a node-shaped object
 * flattens to an empty string, so callers can hand it parsed JSON
 * without a guard.
 */
export function flattenTipTapText(node: unknown): string {
    return walk(node).replace(/\n+$/, "");
}
