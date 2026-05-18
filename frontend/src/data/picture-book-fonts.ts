/**
 * Picture-book font catalog (PB-PHASE4 Session 4c-B-1 Finding G,
 * D8 sub-decision 5-font set).
 *
 * Five OFL-licensed fonts curated for children's picture-book
 * typography. Each entry's ``id`` is the canonical font-family
 * name used in BOTH:
 * - TipTap's ``fontFamily`` mark attribute (frontend in-editor
 *   render), and
 * - the WeasyPrint ``@font-face`` rule + ``font-family`` CSS
 *   property in the PDF export pipeline.
 *
 * Keep this list in sync with the Python-side constant in
 * ``plugins/bibliogon-plugin-export/bibliogon_export/picture_book_fonts.py``
 * (single-source-of-truth discipline; the Python side hosts the
 * actual font file paths + license metadata, ships in G3).
 *
 * Fonts are loaded by the PDF generator with ``src: url(...)``
 * (ships the .otf files in G3), not ``src: local()`` — KDP-grade
 * embedding requires the font files to be under our control.
 */

export interface PictureBookFont {
    /** Canonical name: stored in TipTap mark + used in @font-face. */
    id: string
    /** User-facing dropdown label. */
    label: string
}

export const PICTURE_BOOK_FONTS: readonly PictureBookFont[] = [
    {id: "Atkinson Hyperlegible", label: "Atkinson Hyperlegible"},
    {id: "Andika", label: "Andika"},
    {id: "Comic Neue", label: "Comic Neue"},
    {id: "Lexend", label: "Lexend"},
    {id: "OpenDyslexic", label: "OpenDyslexic"},
] as const

export const DEFAULT_PICTURE_BOOK_FONT_ID = "Atkinson Hyperlegible"

/** Lookup helper. Returns ``undefined`` for unknown ids. */
export function findPictureBookFont(id: string): PictureBookFont | undefined {
    return PICTURE_BOOK_FONTS.find((f) => f.id === id)
}
