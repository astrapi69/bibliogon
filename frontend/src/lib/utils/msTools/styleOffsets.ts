/**
 * Re-index a style finding's offsets from code points to UTF-16 (#1039).
 *
 * `style_checker.py` reports `match.start()`, a code-point index, because
 * that is what a Python string is indexed by. The editor maps that onto
 * the document by walking a JavaScript string, where an astral character -
 * an emoji, most CJK extension characters, many symbols - occupies two
 * UTF-16 units. So every finding after one lands one character short per
 * astral character before it.
 *
 * The conversion happens on arrival rather than in the backend: the API's
 * offsets stay meaningful to any Python consumer, and the only consumer
 * that needs UTF-16 is the one doing the converting. The browser checker
 * already emits UTF-16 - it indexes the same JavaScript string the editor
 * does - so its results must NOT pass through here.
 *
 * @example
 * toUtf16Offsets("\u{1F3E0} Das ist eigentlich einfach.", [
 *   {offset: 10, length: 10},
 * ]);
 * // [{offset: 11, length: 10}] - 'eigentlich' starts at 11 in UTF-16
 */

/** The fields this touches. Anything else on a finding is carried over. */
export interface OffsetBearing {
    offset: number;
    length: number;
}

/** Any high surrogate. Absent means code-point and UTF-16 indices agree,
 *  which is the overwhelmingly common case and costs one scan to rule in. */
const HAS_ASTRAL = /[\uD800-\uDBFF]/;

/**
 * UTF-16 index per code-point index, with an end sentinel.
 *
 * `for...of` over a string iterates code points, and `ch.length` is 2 for
 * an astral one, so accumulating it gives the UTF-16 position of each.
 */
export function utf16OffsetTable(text: string): number[] {
    const table: number[] = [];
    let utf16 = 0;
    for (const character of text) {
        table.push(utf16);
        utf16 += character.length;
    }
    table.push(utf16);
    return table;
}

/**
 * Findings with `offset` and `length` expressed in UTF-16 units.
 *
 * `length` is recomputed from the converted endpoints rather than scaled:
 * a word that itself contains an astral character is longer in UTF-16 than
 * in code points, and converting only the start would leave the
 * decoration ending mid-character.
 *
 * Out-of-range offsets are clamped to the end of the text instead of
 * yielding `undefined`: a finding whose offset does not fit the text it
 * was computed from is already a bug elsewhere, and a NaN position puts
 * the decoration nowhere while a clamped one puts it somewhere visible.
 */
export function toUtf16Offsets<T extends OffsetBearing>(
    text: string,
    findings: readonly T[],
): T[] {
    if (!HAS_ASTRAL.test(text)) return [...findings];
    const table = utf16OffsetTable(text);
    const last = table.length - 1;
    const at = (index: number): number =>
        table[Math.max(0, Math.min(index, last))];
    return findings.map((finding) => {
        const start = at(finding.offset);
        return {
            ...finding,
            offset: start,
            length: at(finding.offset + finding.length) - start,
        };
    });
}
