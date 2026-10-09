/**
 * #739: the browser port reproduces the Python validator's verdicts.
 *
 * `coverValidation.parity.json` is recorded by
 * `plugins/bibliogon-plugin-kdp/tests/test_cover_validator_parity.py`
 * from `bibliogon_kdp.cover_validator.validate_cover` running over real
 * images. This asserts the port produces the same findings, in the same
 * order, with the same numbers, for the same probes.
 *
 * A hand-written mirror of the original only ever asserts what its
 * author believed the original does - which is how the component's
 * `else if` could report one of "too small" / "too large" for years
 * while the validator reported both.
 */

import {describe, expect, it} from "vitest";

import record from "./coverValidation.parity.json";
import {
    type CoverRequirements,
    KDP_COVER_REQUIREMENTS,
    validateCoverProbe,
} from "./coverRequirements";

interface RecordedFinding {
    severity: string;
    code: string;
    params: Record<string, string | number>;
}

interface RecordedCase {
    name: string;
    filename: string;
    probe: {
        width: number;
        height: number;
        format: string;
        fileSizeBytes?: number;
    };
    requirements?: Partial<CoverRequirements>;
    findings: RecordedFinding[];
}

const CASES = record.cases as RecordedCase[];

/** The recorded findings carry no `field`; that grouping is the port's own. */
function comparable(finding: {
    severity: string;
    code: string;
    params: Record<string, string | number>;
}): RecordedFinding {
    return {
        severity: finding.severity,
        code: finding.code,
        params: finding.params,
    };
}

describe("KDP cover parity with the Python validator", () => {
    it("records the same requirements the port ships", () => {
        // Recorded from KDP_COVER_REQUIREMENTS in cover_validator.py, so a
        // threshold changing on one side alone fails here rather than
        // quietly approving covers KDP will reject.
        expect(record.requirements).toEqual(KDP_COVER_REQUIREMENTS);
    });

    it.each(CASES.map((testCase) => [testCase.name, testCase] as const))(
        "%s",
        (_name, testCase) => {
            const requirements: CoverRequirements = {
                ...KDP_COVER_REQUIREMENTS,
                ...(testCase.requirements ?? {}),
            };
            const findings = validateCoverProbe(
                testCase.probe,
                requirements,
            ).map(comparable);
            expect(findings).toEqual(testCase.findings);
        },
    );

    it("covers every finding code the port can produce", () => {
        const recorded = new Set(
            CASES.flatMap((testCase) =>
                testCase.findings.map((finding) => finding.code),
            ),
        );
        expect([...recorded].sort()).toEqual([
            "aspect_ratio_outside_range",
            "dimensions_too_large",
            "dimensions_too_small",
            "file_size_exceeded",
            "format_unsupported",
        ]);
    });

    it("includes a case that validates cleanly", () => {
        expect(
            CASES.some((testCase) => testCase.findings.length === 0),
        ).toBe(true);
    });
});
