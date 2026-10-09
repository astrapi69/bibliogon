/**
 * KDP metadata-completeness check, mirrored from
 * `bibliogon_kdp/metadata_checker.py` (#738).
 *
 * The rules are pure field inspection - no DB, no network, no AI - so
 * the browser can answer the same question the backend answers, and the
 * publishing wizard's first step works without one. The Python module
 * stays the authority: it still runs on the backend path, so the two
 * must agree, and the parity cases in the sibling test are pinned
 * against its rules rather than against this file.
 *
 * Messages are the backend's English sentences, deliberately: a
 * divergence in wording between the two modes would be a worse bug than
 * English in a German UI. Localising them is a separate change for both
 * sides at once (the shape #889 used for the A+ validator).
 *
 * @example
 * const result = checkMetadataCompleteness(book);
 * if (!result.complete) showIssues(result.issues);
 */

/** One completeness issue, attached to the field it concerns. */
export interface MetadataIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

/** The check's verdict: `complete` is false when any issue is an error. */
export interface MetadataCheckResult {
  complete: boolean;
  error_count: number;
  warning_count: number;
  issues: MetadataIssue[];
}

/** KDP retail listings use BISAC codes: 3 uppercase letters + 6 digits. */
export const BISAC_CODE_RE = /^[A-Z]{3}[0-9]{6}$/;

/** Amazon accepts at most 3 BISAC codes; the surplus is silently ignored. */
export const KDP_MAX_BISAC_CODES = 3;

type BookLike = Record<string, unknown>;

function text(book: BookLike, key: string): string {
  const value = book[key];
  return typeof value === "string" ? value : "";
}

/**
 * Keywords reach this in two shapes: the API layer's `string[]`, and the
 * legacy JSON-string form raw ORM data still carries. An unparseable
 * string counts as no keywords rather than throwing, matching the
 * backend's `except (JSONDecodeError, TypeError)`.
 */
function keywordList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter((k) => k.trim());
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter((k) => k.trim());
    } catch {
      return [];
    }
  }
  return [];
}

export function checkMetadataCompleteness(book: BookLike): MetadataCheckResult {
  const issues: MetadataIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ field, message, severity: "error" });
  const warning = (field: string, message: string) =>
    issues.push({ field, message, severity: "warning" });

  if (!text(book, "title").trim()) error("title", "Title is required");
  if (!text(book, "author").trim()) error("author", "Author is required");
  if (!text(book, "language").trim()) error("language", "Language is required");

  const description = text(book, "description") || text(book, "html_description");
  if (!description.trim()) {
    error("description", "Book description is required for KDP listing");
  }

  const keywords = keywordList(book.keywords);
  if (keywords.length === 0) {
    warning("keywords", "No keywords set. KDP allows up to 7 keywords for discoverability");
  } else if (keywords.length < 3) {
    warning(
      "keywords",
      `Only ${keywords.length} keyword(s). KDP recommends 7 for best discoverability`,
    );
  }

  if (!book.cover_image) {
    warning("cover_image", "No cover image assigned. A cover is required for KDP");
  }
  if (!book.isbn_ebook && !book.isbn_paperback) {
    warning("isbn", "No ISBN set. KDP can assign a free ISBN, or enter your own");
  }
  if (!book.publisher) {
    warning("publisher", "No publisher set. Recommended for professional appearance");
  }
  if (!book.backpage_description) {
    warning("backpage_description", "No back cover description. Useful for paperback editions");
  }
  if (!book.subtitle) {
    warning("subtitle", "No subtitle. A subtitle can improve search visibility on KDP");
  }

  const categories = book.categories ?? [];
  if (Array.isArray(categories) && categories.length === 0) {
    warning(
      "categories",
      "No categories set. KDP requires at least one category for retail listing.",
    );
  }

  const bisacCodes = book.bisac_codes ?? [];
  if (Array.isArray(bisacCodes)) {
    if (bisacCodes.length === 0) {
      warning(
        "bisac_codes",
        "No BISAC codes set. KDP recommends 1-3 BISAC subject codes for catalogue discoverability.",
      );
    } else {
      for (const code of bisacCodes) {
        if (!BISAC_CODE_RE.test(String(code))) {
          error(
            "bisac_codes",
            `Invalid BISAC code '${String(code)}'. Expected 3 uppercase letters + 6 digits (e.g. FIC022020).`,
          );
        }
      }
      if (bisacCodes.length > KDP_MAX_BISAC_CODES) {
        warning(
          "bisac_codes",
          `${bisacCodes.length} BISAC codes set. KDP best practice is at most ${KDP_MAX_BISAC_CODES}; surplus codes are silently ignored.`,
        );
      }
    }
  }

  const chapters = book.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    error("chapters", "Book has no chapters");
  }

  return {
    complete: !issues.some((i) => i.severity === "error"),
    error_count: issues.filter((i) => i.severity === "error").length,
    warning_count: issues.filter((i) => i.severity === "warning").length,
    issues,
  };
}
