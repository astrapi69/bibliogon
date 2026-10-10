/**
 * The download name for a `.biblio.yaml` (#745 stage 3).
 *
 * A mirror of `ascii_filename_slug` in
 * `backend/app/services/filename_slug.py`, used for one reason: a
 * template exported in the browser and the same record exported on the
 * desktop have to land as the same file. The user moves these between
 * the two, and a name that differs by deployment makes a round-trip
 * look like two different documents.
 *
 * That is why this does NOT reuse either of the project's other slugs:
 * `shared/utils/slugify` keeps umlauts on purpose (a German user
 * expects `über-uns`), and `kdpPackageSlug` folds through NFKD but
 * turns a `ß` into a separator. Neither reproduces the backend's output
 * here, and the recorded `Content-Disposition` headers in
 * `aiTemplate.parity.json` are what this is checked against.
 *
 * @example
 * asciiFilenameSlug("Über Dächer und Straßen", "book"); // "uber-dacher-und-straen"
 */

/** Non-word, non-space, non-hyphen characters (`[^\w\s-]`). */
const NON_WORD = /[^\w\s-]/g;
/** Runs of whitespace, underscore or hyphen (`[\s_-]+`). */
const SEPARATORS = /[\s_-]+/g;

/**
 * An ASCII-safe, lowercase, hyphen-separated filename slug.
 *
 * Folds through NFKD and drops what is still non-ASCII, which is the
 * backend's `encode("ascii", "ignore")`: `ä` decomposes and keeps its
 * `a`, while `ß` has no decomposition and disappears entirely
 * (`Straßen` -> `straen`). That last one is the backend's behaviour
 * rather than the nicer `strassen`, and it is reproduced on purpose -
 * the filename has to match, not improve.
 *
 * @param text A title, or any free text.
 * @param fallback Returned when the input slugifies to nothing.
 */
export function asciiFilenameSlug(text: string, fallback = "file"): string {
    const folded = text.normalize("NFKD");
    let asciiOnly = "";
    for (const char of folded) {
        if (char.codePointAt(0)! < 128) asciiOnly += char;
    }
    const cleaned = asciiOnly.replace(NON_WORD, "").trim().replace(SEPARATORS, "-");
    return cleaned.toLowerCase() || fallback;
}

/** The whole download name, including the `.biblio.yaml` suffix. */
export function templateFilename(title: string, kind: "article" | "book"): string {
    return `${asciiFilenameSlug(title, kind)}.biblio.yaml`;
}
