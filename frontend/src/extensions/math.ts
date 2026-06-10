/**
 * Bibliogon math typing convention: ``$...$`` for inline math, ``$$...$$``
 * for block math.
 *
 * The bundled v3 ``@tiptap/extension-mathematics`` input rules diverge from
 * this: their InlineMath rule fires on ``$$...$$`` and their BlockMath rule
 * on ``$$$...$$$``. That mismatches every other layer in the app, which all
 * speak ``$...$`` inline / ``$$...$$`` block: the markdown tokenizer the
 * extension itself ships (single-``$`` inline), the export serializers
 * (`formatLatex` / `tiptapToHtml` / `tiptap-markdown` / `formatDocx` /
 * `formatPdf`), and the v2 behaviour users expect. The result was that
 * typing ``$E=mc^2$`` stayed plain text — the rule never matched.
 *
 * These two wrappers re-export the upstream ``InlineMath`` / ``BlockMath``
 * nodes UNCHANGED except for ``addInputRules``, which is replaced with the
 * single-/double-dollar variants. Node names (``inlineMath`` / ``blockMath``),
 * commands (``insertInlineMath`` / ``insertBlockMath`` / ...), attributes and
 * the markdown tokenizers are all inherited untouched, so the toolbar buttons
 * and the export round-trip keep working.
 *
 * The two regexes are mutually exclusive: the inline rule requires a
 * non-``$`` character immediately after the opening ``$`` (so ``$$x$$`` can
 * never match it), and the block rule is anchored to the whole textblock
 * (``^...$``), so a ``$$...$$`` paragraph converts to a block node while an
 * inline ``$...$`` anywhere converts to an inline node.
 */

import { InputRule, nodePasteRule } from "@tiptap/core";
import { InlineMath, BlockMath } from "@tiptap/extension-mathematics";

/** Matches a single-``$`` inline expression not adjacent to another ``$``
 *  (so it never fires inside a ``$$...$$`` block). Capture group 1 is the
 *  LaTeX body. */
export const INLINE_MATH_INPUT_RULE = /(?<!\$)\$([^$\n]+?)\$(?!\$)/;

/** Matches a whole textblock that is exactly ``$$...$$``. Capture group 1 is
 *  the LaTeX body. */
export const BLOCK_MATH_INPUT_RULE = /^\$\$([^$\n]+?)\$\$$/;

/** Paste-rule variants of the two rules above. Paste rules iterate every
 *  match in the pasted text, so they must be global. The block variant is NOT
 *  anchored to the textblock (unlike the input rule) because pasted ``$$...$$``
 *  can sit anywhere in the clipboard text; ``nodePasteRule`` -> ``insertContentAt``
 *  lifts the block node into place. The two stay mutually exclusive: the inline
 *  rule needs a non-``$`` right after the opening ``$``, so ``$$...$$`` never
 *  matches it. */
export const INLINE_MATH_PASTE_RULE = /(?<!\$)\$([^$\n]+?)\$(?!\$)/g;
export const BLOCK_MATH_PASTE_RULE = /(?<!\$)\$\$([^$\n]+?)\$\$(?!\$)/g;

export const InlineMathDollar = InlineMath.extend({
  addInputRules() {
    return [
      new InputRule({
        find: INLINE_MATH_INPUT_RULE,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ latex }),
          );
        },
      }),
    ];
  },
  addPasteRules() {
    return [
      nodePasteRule({
        find: INLINE_MATH_PASTE_RULE,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },
});

export const BlockMathDollar = BlockMath.extend({
  addInputRules() {
    return [
      new InputRule({
        find: BLOCK_MATH_INPUT_RULE,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          const $from = state.doc.resolve(range.from);
          const node = this.type.create({ latex });

          const consumesHostTextblock =
            $from.depth > 0 &&
            $from.parent.isTextblock &&
            range.from === $from.start() &&
            range.to === $from.end();
          const canReplaceHostTextblock =
            consumesHostTextblock &&
            $from
              .node(-1)
              .canReplaceWith($from.index(-1), $from.indexAfter(-1), this.type);
          const replacementRange = canReplaceHostTextblock
            ? { from: $from.before(), to: $from.after() }
            : range;

          state.tr.replaceWith(
            replacementRange.from,
            replacementRange.to,
            node,
          );
        },
      }),
    ];
  },
  addPasteRules() {
    return [
      nodePasteRule({
        find: BLOCK_MATH_PASTE_RULE,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },
});
