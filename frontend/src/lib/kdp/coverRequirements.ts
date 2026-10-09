/**
 * KDP cover validation, readable in the browser (#739).
 *
 * The rules mirror `bibliogon_kdp.cover_validator.validate_cover` for
 * every check that can be answered from an asset the browser already
 * has: the filename extension, the decoded pixel dimensions, the ratio
 * between them, and - where the bytes are local - the byte length.
 * `frontend/src/lib/kdp/coverValidation.parity.test.ts` checks that
 * against verdicts recorded from the Python validator itself, so the two
 * cannot drift apart silently.
 *
 * Three of the Python checks are deliberately absent, because neither
 * `createImageBitmap` nor `<img>` exposes what they need: DPI, the PIL
 * colour mode, and the embedded ICC profile. Those still run on the
 * desktop, where `package.py` validates the staged cover before building
 * the KDP package.
 *
 * Findings carry a code and the numbers behind it rather than a rendered
 * sentence, so the caller owns the wording and this module stays free of
 * i18n.
 *
 * @example
 * const findings = validateCoverProbe({
 *     width: 400,
 *     height: 640,
 *     format: coverFormatFromFilename("cover.jpg"),
 * });
 * // [{field: "dimensions", severity: "error",
 * //   code: "dimensions_too_small", params: {width: 400, height: 640}}]
 */

/** The thresholds Amazon dictates, mirroring `KDP_COVER_REQUIREMENTS`. */
export interface CoverRequirements {
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
    aspectRatioMin: number;
    aspectRatioMax: number;
    maxFileSizeMb: number;
    allowedFormats: readonly string[];
}

/**
 * Amazon's published cover spec. Not a user setting on either end: a
 * cover this approves that KDP then rejects at upload is worse than no
 * validation, so the numbers live next to the code that reads them and
 * change only when Amazon's spec does.
 *
 * Source of truth:
 * `plugins/bibliogon-plugin-kdp/bibliogon_kdp/cover_validator.py`.
 */
export const KDP_COVER_REQUIREMENTS: CoverRequirements = {
    minWidth: 625,
    minHeight: 1000,
    maxWidth: 10000,
    maxHeight: 10000,
    aspectRatioMin: 1.5,
    aspectRatioMax: 1.8,
    maxFileSizeMb: 50,
    allowedFormats: ["jpg", "jpeg", "tiff", "png"],
};

export type CoverFindingCode =
    | "format_unsupported"
    | "file_size_exceeded"
    | "dimensions_too_small"
    | "dimensions_too_large"
    | "aspect_ratio_outside_range";

export type CoverFindingField =
    | "format"
    | "file_size"
    | "dimensions"
    | "aspect_ratio";

export interface CoverFinding {
    field: CoverFindingField;
    /** `error` blocks the KDP upload; `warning` is advisory. */
    severity: "error" | "warning";
    code: CoverFindingCode;
    /** The numbers the message is built from, never prose. */
    params: Record<string, string | number>;
}

/** What the browser could read about the cover. */
export interface CoverProbe {
    /** `naturalWidth`, or an `ImageBitmap`'s width. */
    width: number;
    /** `naturalHeight`, or an `ImageBitmap`'s height. */
    height: number;
    /** Lowercase extension without the dot; `""` when there is none. */
    format: string;
    /**
     * `Blob.size` of the stored asset. Omitted when the bytes are not
     * local - offline the asset comes out of IndexedDB and the length is
     * free, online it sits behind a URL - and then the size check
     * abstains instead of guessing.
     */
    fileSizeBytes?: number;
}

const MEBIBYTE = 1024 * 1024;

/**
 * Round to two decimals the way the Python side does.
 *
 * The parity record carries these numbers across the two runtimes, and
 * `round()` in Python is half-to-even while this is not, so the Python
 * helper spells it out as `floor(v * 100 + 0.5) / 100` - the same
 * sequence of IEEE-754 operations as `Math.round` for the non-negative
 * values here. The guarantee is that both produce the same double, not
 * that either rounds decimal halves up: 1.005 is not representable, and
 * both land on 1.0.
 */
export function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * The extension the format check reads, lowercased and without the dot.
 *
 * Mirrors `Path(name).suffix.lstrip(".").lower()`, including its verdict
 * on a name with no extension at all: `""`, which no allowlist contains,
 * so an extensionless cover is reported rather than waved through.
 */
export function coverFormatFromFilename(
    filename: string | null | undefined,
): string {
    if (!filename) return "";
    const name = filename.split("/").pop() ?? "";
    const dot = name.lastIndexOf(".");
    if (dot < 0) return "";
    return name.slice(dot + 1).toLowerCase();
}

/** Height over width, or null when the width makes it undefined. */
export function coverAspectRatio(probe: {
    width: number;
    height: number;
}): number | null {
    if (probe.width <= 0) return null;
    return probe.height / probe.width;
}

/**
 * Validate a probed cover against the KDP requirements.
 *
 * Findings come in the order the Python validator appends them - format,
 * file size, dimensions, aspect ratio - so the two sides can be compared
 * as sequences and a caller can render them without re-sorting.
 *
 * Both dimension checks run: an image can be under the minimum on one
 * axis and over the maximum on the other, and reporting only the first
 * would hide half the problem.
 */
export function validateCoverProbe(
    probe: CoverProbe,
    requirements: CoverRequirements = KDP_COVER_REQUIREMENTS,
): CoverFinding[] {
    const findings: CoverFinding[] = [];

    if (!requirements.allowedFormats.includes(probe.format)) {
        findings.push({
            field: "format",
            severity: "error",
            code: "format_unsupported",
            params: {format: probe.format},
        });
    }

    if (probe.fileSizeBytes !== undefined) {
        const fileSizeMb = probe.fileSizeBytes / MEBIBYTE;
        if (fileSizeMb > requirements.maxFileSizeMb) {
            findings.push({
                field: "file_size",
                severity: "error",
                code: "file_size_exceeded",
                params: {fileSizeMb: round2(fileSizeMb)},
            });
        }
    }

    if (
        probe.width < requirements.minWidth ||
        probe.height < requirements.minHeight
    ) {
        findings.push({
            field: "dimensions",
            severity: "error",
            code: "dimensions_too_small",
            params: {width: probe.width, height: probe.height},
        });
    }
    if (
        probe.width > requirements.maxWidth ||
        probe.height > requirements.maxHeight
    ) {
        findings.push({
            field: "dimensions",
            severity: "error",
            code: "dimensions_too_large",
            params: {width: probe.width, height: probe.height},
        });
    }

    const ratio = coverAspectRatio(probe);
    if (
        ratio !== null &&
        (ratio < requirements.aspectRatioMin ||
            ratio > requirements.aspectRatioMax)
    ) {
        findings.push({
            field: "aspect_ratio",
            severity: "warning",
            code: "aspect_ratio_outside_range",
            params: {ratio: round2(ratio)},
        });
    }

    return findings;
}

/** True when nothing blocks the upload. Warnings do not. */
export function coverPasses(findings: readonly CoverFinding[]): boolean {
    return !findings.some((finding) => finding.severity === "error");
}
