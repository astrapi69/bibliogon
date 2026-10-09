import {describe, expect, it} from "vitest";

import {
    KDP_COVER_REQUIREMENTS,
    type CoverProbe,
    coverAspectRatio,
    coverFormatFromFilename,
    coverPasses,
    round2,
    validateCoverProbe,
} from "./coverRequirements";

/** A cover that satisfies every rule, to vary one field at a time. */
function clean(overrides: Partial<CoverProbe> = {}): CoverProbe {
    return {width: 1600, height: 2560, format: "jpg", ...overrides};
}

function codes(probe: CoverProbe, requirements = KDP_COVER_REQUIREMENTS) {
    return validateCoverProbe(probe, requirements).map((f) => f.code);
}

describe("coverFormatFromFilename", () => {
    it("lowercases the extension", () => {
        expect(coverFormatFromFilename("Cover.JPEG")).toBe("jpeg");
    });

    it("reads past a path", () => {
        expect(coverFormatFromFilename("assets/covers/front.png")).toBe("png");
    });

    it("takes the last dot, not the first", () => {
        expect(coverFormatFromFilename("my.book.cover.tiff")).toBe("tiff");
    });

    it("returns the empty string for a name without an extension", () => {
        expect(coverFormatFromFilename("cover")).toBe("");
    });

    it("returns the empty string for no filename at all", () => {
        expect(coverFormatFromFilename(null)).toBe("");
        expect(coverFormatFromFilename(undefined)).toBe("");
        expect(coverFormatFromFilename("")).toBe("");
    });
});

describe("coverAspectRatio", () => {
    it("is height over width", () => {
        expect(coverAspectRatio({width: 1000, height: 1600})).toBe(1.6);
    });

    it("is undefined for a zero width rather than Infinity", () => {
        expect(coverAspectRatio({width: 0, height: 1600})).toBeNull();
    });
});

describe("round2", () => {
    it("agrees with the Python side digit for digit", () => {
        // The property is agreement, not decimal half-up: 1.005 is not
        // representable, so `1.005 * 100` is 100.49999999999999 and both
        // languages land on 1.0. Values recorded from
        // `math.floor(v * 100 + 0.5) / 100`.
        expect(round2(1.005)).toBe(1.0);
        expect(round2(1.015)).toBe(1.01);
        expect(round2(1.025)).toBe(1.02);
        expect(round2(2.675)).toBe(2.68);
        expect(round2(1.4)).toBe(1.4);
    });
});

describe("validateCoverProbe", () => {
    it("reports nothing for a cover that meets every rule", () => {
        expect(validateCoverProbe(clean())).toEqual([]);
        expect(coverPasses(validateCoverProbe(clean()))).toBe(true);
    });

    it("accepts the exact minimum dimensions", () => {
        expect(codes(clean({width: 625, height: 1000}))).toEqual([]);
    });

    it("accepts the exact maximum dimensions", () => {
        // A 10000x10000 cover is square, so the ratio warning is expected
        // here; what matters is that no dimension error fires at the bound.
        expect(codes(clean({width: 10000, height: 10000}))).toEqual([
            "aspect_ratio_outside_range",
        ]);
    });

    it("rejects one pixel under the minimum on either axis", () => {
        expect(codes(clean({width: 624, height: 1000}))).toContain(
            "dimensions_too_small",
        );
        expect(codes(clean({width: 625, height: 999}))).toContain(
            "dimensions_too_small",
        );
    });

    it("rejects one pixel over the maximum on either axis", () => {
        expect(codes(clean({width: 10001, height: 10000}))).toContain(
            "dimensions_too_large",
        );
        expect(codes(clean({width: 10000, height: 10001}))).toContain(
            "dimensions_too_large",
        );
    });

    it("reports too-small and too-large together", () => {
        // 400 is under the minimum width while 10001 is over the maximum
        // height. An `else if` would hide the second half.
        expect(codes(clean({width: 400, height: 10001}))).toEqual([
            "dimensions_too_small",
            "dimensions_too_large",
            "aspect_ratio_outside_range",
        ]);
    });

    it("rejects a format outside the allowlist", () => {
        const findings = validateCoverProbe(clean({format: "bmp"}));
        expect(findings).toEqual([
            {
                field: "format",
                severity: "error",
                code: "format_unsupported",
                params: {format: "bmp"},
            },
        ]);
    });

    it("accepts every allowed format", () => {
        for (const format of KDP_COVER_REQUIREMENTS.allowedFormats) {
            expect(codes(clean({format}))).toEqual([]);
        }
    });

    it("warns rather than errors outside the recommended ratio", () => {
        const findings = validateCoverProbe(clean({width: 2000, height: 2800}));
        expect(findings).toEqual([
            {
                field: "aspect_ratio",
                severity: "warning",
                code: "aspect_ratio_outside_range",
                params: {ratio: 1.4},
            },
        ]);
        expect(coverPasses(findings)).toBe(true);
    });

    it("treats both ratio bounds as inclusive", () => {
        expect(codes(clean({width: 1000, height: 1500}))).toEqual([]);
        expect(codes(clean({width: 1000, height: 1800}))).toEqual([]);
    });

    it("errors when the byte length is over the limit", () => {
        const findings = validateCoverProbe(
            clean({fileSizeBytes: 1024 * 1024 * 60}),
        );
        expect(findings).toEqual([
            {
                field: "file_size",
                severity: "error",
                code: "file_size_exceeded",
                params: {fileSizeMb: 60},
            },
        ]);
    });

    it("treats the size limit as inclusive", () => {
        expect(
            codes(clean({fileSizeBytes: KDP_COVER_REQUIREMENTS.maxFileSizeMb * 1024 * 1024})),
        ).toEqual([]);
    });

    it("abstains on size when the byte length is unknown", () => {
        // The online path only has a URL for the asset. Abstaining is not
        // the same as passing: nothing is reported either way, but the
        // desktop package build still runs the full Python validator.
        const probe = clean();
        expect(probe.fileSizeBytes).toBeUndefined();
        expect(codes(probe)).toEqual([]);
    });

    it("reads its thresholds from the requirements it is given", () => {
        const strict = {
            ...KDP_COVER_REQUIREMENTS,
            minWidth: 4000,
            maxFileSizeMb: 1,
            allowedFormats: ["png"] as const,
        };
        expect(codes(clean({fileSizeBytes: 1024 * 1024 * 2}), strict)).toEqual([
            "format_unsupported",
            "file_size_exceeded",
            "dimensions_too_small",
        ]);
    });

    it("orders findings format, size, dimensions, ratio", () => {
        expect(
            codes(
                clean({
                    width: 300,
                    height: 300,
                    format: "gif",
                    fileSizeBytes: 1024 * 1024 * 80,
                }),
            ),
        ).toEqual([
            "format_unsupported",
            "file_size_exceeded",
            "dimensions_too_small",
            "aspect_ratio_outside_range",
        ]);
    });
});

describe("coverPasses", () => {
    it("is false once there is an error", () => {
        expect(coverPasses(validateCoverProbe(clean({format: "bmp"})))).toBe(
            false,
        );
    });
});
