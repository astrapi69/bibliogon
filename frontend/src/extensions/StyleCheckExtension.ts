/**
 * TipTap extension that highlights ms-tools style findings as inline
 * ProseMirror decorations. Findings (filler words, passive voice,
 * adjectives, etc.) are rendered as colored underlines without
 * modifying the document content.
 *
 * Usage:
 *   editor.commands.setStyleFindings(findings)  // apply marks
 *   editor.commands.clearStyleFindings()         // remove all marks
 */

import {Extension} from "@tiptap/core"
import {Plugin, PluginKey} from "@tiptap/pm/state"
import {Decoration, DecorationSet} from "@tiptap/pm/view"
import type {Node as PmNode} from "@tiptap/pm/model"
import type {StyleFinding} from "../api/client"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    styleCheck: {
      setStyleFindings: (findings: StyleFinding[]) => ReturnType;
      clearStyleFindings: () => ReturnType;
    }
  }
}

const STYLE_CHECK_KEY = new PluginKey("styleCheck")

/**
 * Map a plain-text offset to a ProseMirror document position.
 *
 * The backend returns offsets into `editor.getText()` (plain text).
 * ProseMirror positions include structural nodes (paragraphs, etc.)
 * so we walk all text nodes to build the mapping.
 */
function textOffsetToDocPos(doc: PmNode, textOffset: number): number | null {
  let charCount = 0
  let result: number | null = null

  doc.descendants((node, pos) => {
    if (result !== null) return false
    if (node.isText && node.text) {
      const nodeEnd = charCount + node.text.length
      if (textOffset >= charCount && textOffset < nodeEnd) {
        result = pos + (textOffset - charCount)
        return false
      }
      charCount = nodeEnd
    } else if (node.isBlock && charCount > 0) {
      charCount += 1
    }
    return undefined
  })

  return result
}

function buildDecorations(doc: PmNode, findings: StyleFinding[]): DecorationSet {
  if (!findings.length) return DecorationSet.empty

  const decorations: Decoration[] = []

  for (const finding of findings) {
    const from = textOffsetToDocPos(doc, finding.offset)
    if (from === null) continue
    const to = textOffsetToDocPos(doc, finding.offset + finding.length)
    if (to === null) continue

    decorations.push(
      Decoration.inline(from, to, {
        class: `style-mark style-mark--${finding.type}`,
        "data-style-type": finding.type,
        "data-style-word": finding.word,
      }),
    )
  }

  return DecorationSet.create(doc, decorations)
}

export const StyleCheckExtension = Extension.create({
  name: "styleCheck",

  addStorage() {
    return {findings: [] as StyleFinding[]}
  },

  addCommands() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const ext = this
    return {
      setStyleFindings:
        (findings: StyleFinding[]) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({tr, dispatch}: any) => {
          if (dispatch) {
            ext.storage.findings = findings
            tr.setMeta(STYLE_CHECK_KEY, buildDecorations(tr.doc, findings))
            dispatch(tr)
          }
          return true
        },
      clearStyleFindings:
        () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({tr, dispatch}: any) => {
          if (dispatch) {
            ext.storage.findings = []
            tr.setMeta(STYLE_CHECK_KEY, DecorationSet.empty)
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: STYLE_CHECK_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, oldSet) => {
            const meta = tr.getMeta(STYLE_CHECK_KEY)
            if (meta !== undefined) return meta
            if (tr.docChanged) return oldSet.map(tr.mapping, tr.doc)
            return oldSet
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})
