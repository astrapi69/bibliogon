/**
 * The style declarations the editor keeps, and where each one lands (#1105).
 *
 * The editor OWNS this: its extension set decides which CSS declarations
 * survive a paste or an import, and nothing else gets a vote. This module is
 * that decision written down so another layer can read it instead of keeping
 * a second list - the import walker drops every style attribute today, which
 * means a centred dedication imports centred on the desktop and flush-left in
 * the browser.
 *
 * It lives in the editor folder, beside `editorExtensions`, because that is
 * who owns it. It deliberately imports NOTHING: the walker runs on the import
 * path, and pulling the extension set in there would drag TipTap, KaTeX and
 * the rest into a bundle that only needs three strings.
 *
 * `editorStyleAttributes.guard.test.ts` keeps the two honest. It builds the
 * real schema `buildEditorExtensions` returns, parses HTML through it, and
 * fails when this declaration and that schema disagree - so a sixth
 * style-emitting extension is a red test, not a silent divergence.
 *
 * Three, not five. The backend's import allowlist
 * (`ALLOWED_STYLE_PROPERTIES` in `markdown_utils.py`) also lists `width` and
 * `min-width` for resizable table columns, and that is right for what it
 * does - it filters HTML that STAYS HTML in the database. The editor's table
 * cell reads its column width from the `colwidth` attribute, not from
 * `style: width`, so a walker that carried it would be inventing a behaviour
 * the editor does not have. Measured in the guard, not assumed.
 *
 * @example
 * const target = EDITOR_STYLE_ATTRIBUTES[property];
 * if (target?.kind === "mark") marks.push({ type: target.mark, attrs: { color: value } });
 */

/** Where one kept declaration lands in the document. */
export type EditorStyleTarget =
    | {
          kind: "nodeAttr";
          /** The node attribute that carries it. */
          attr: "textAlign";
          /** The node types the extension is configured for. */
          nodes: readonly string[];
      }
    | {
          kind: "mark";
          /** The mark that carries it. */
          mark: "textStyle" | "highlight";
          /** The mark attribute that carries the value. */
          attr: "color";
      };

/**
 * Every CSS property the editor reads out of a `style` attribute.
 *
 * Derived from the extensions `buildEditorExtensions` mounts:
 * `TextAlign.configure({ types: ["heading", "paragraph"] })`,
 * `@tiptap/extension-color` over `TextStyle`, and
 * `Highlight.configure({ multicolor: true })`.
 */
export const EDITOR_STYLE_ATTRIBUTES: Readonly<Record<string, EditorStyleTarget>> = {
    "text-align": { kind: "nodeAttr", attr: "textAlign", nodes: ["heading", "paragraph"] },
    color: { kind: "mark", mark: "textStyle", attr: "color" },
    "background-color": { kind: "mark", mark: "highlight", attr: "color" },
};

/**
 * The kept declarations of one `style` attribute value, in source order.
 *
 * Splits on `;` and matches on the property name, lower-cased and trimmed; a
 * fragment without a colon is not a declaration. Everything outside
 * {@link EDITOR_STYLE_ATTRIBUTES} is dropped, which is what keeps
 * `position: fixed` and a third-party `background-image: url(...)` out of an
 * imported document.
 *
 * @param style - the raw attribute value, e.g. `"text-align: center; position: fixed"`.
 * @returns the kept `[property, value]` pairs.
 *
 * @example
 * keptStyleDeclarations("color: red; position: fixed") // [["color", "red"]]
 */
export function keptStyleDeclarations(style: string | null | undefined): [string, string][] {
    if (!style) return [];
    const kept: [string, string][] = [];
    for (const declaration of style.split(";")) {
        const colon = declaration.indexOf(":");
        if (colon === -1) continue;
        const property = declaration.slice(0, colon).trim().toLowerCase();
        const value = declaration.slice(colon + 1).trim();
        if (!value || !(property in EDITOR_STYLE_ATTRIBUTES)) continue;
        kept.push([property, value]);
    }
    return kept;
}
