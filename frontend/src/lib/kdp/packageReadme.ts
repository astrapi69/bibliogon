/**
 * The `README.txt` that ships inside a KDP package (#741).
 *
 * A mirror of `_build_readme` in
 * `plugins/bibliogon-plugin-kdp/bibliogon_kdp/package.py`, kept
 * line-for-line so the file a user opens is the same whichever path built
 * the ZIP. English like the Python original: this is the one file inside
 * the package that is prose rather than data, and translating it in one
 * path only would be worse than leaving both untranslated.
 *
 * Library-grade: a plain object in, a string out.
 *
 * @example
 * kdpPackageReadme({title: "Mein Buch", id: "abc", author: "A. R."}, "prose");
 */

export interface KdpReadmeBook {
    id?: string;
    title?: string | null;
    author?: string | null;
    language?: string | null;
}

/**
 * The note the client build adds and the server build does not: the print
 * interior came out of pdfmake rather than WeasyPrint, which means the
 * typography is a proof rather than a press-ready file.
 *
 * Stating it in the package, not only in the UI that produced it, because
 * the ZIP outlives the wizard step - the person who uploads it to KDP
 * weeks later has the file and not the toast.
 */
export const CLIENT_PDF_FIDELITY_NOTE = [
    "## About this PDF",
    "",
    "The print interior in this package was rendered in your browser.",
    "It carries the right trim size and margins, and it is accurate",
    "enough to check structure, pagination and page count. It is NOT",
    "typeset to the same standard as the desktop app's PDF: there is no",
    "hyphenation, no bleed box (the page is grown by the bleed instead),",
    "and no crop marks. For a final print upload, build the package from",
    "the desktop app.",
];

export function kdpPackageReadme(
    book: KdpReadmeBook,
    bookType: string,
    options: {clientRendered?: boolean} = {},
): string {
    const lines = [
        `# KDP Publishing Package — ${book.title || "Untitled"}`,
        "",
        `Book ID: ${book.id}`,
        `Author: ${book.author || "(unset)"}`,
        `Language: ${book.language || "en"}`,
        `Book type: ${bookType}`,
        "",
        "## Contents",
        "",
        "- metadata.json — KDP-shaped book metadata. Use this when",
        "  filling in KDP's listing form.",
        "- cover.* — your book's cover image, copied as-is.",
        "- cover-validation-report.json — result of running KDP's",
        "  cover-spec checks (DPI, dimensions, format) on the cover.",
        "- manuscript-*.* — manuscript file(s) per edition.",
        "- publishing-state-snapshot.json — snapshot of the book's",
        "  editorial state at the time the package was built.",
        "",
        "## Next steps",
        "",
        "1. Review cover-validation-report.json. Fix any 'errors'",
        "   before uploading to KDP.",
        "2. Upload the matching manuscript file to KDP under the",
        "   product type you're publishing (ebook / paperback).",
        "3. Use metadata.json as a cross-check against KDP's listing",
        "   form — categories, keywords, BISAC codes, descriptions.",
        "",
        "Bibliogon does NOT upload to KDP automatically. You're",
        "the publisher of record; review every field before",
        "clicking Publish on Amazon's side.",
    ];
    if (options.clientRendered) {
        lines.push("", ...CLIENT_PDF_FIDELITY_NOTE);
    }
    return lines.join("\n") + "\n";
}
