import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DetectingStep } from "./DetectingStep";

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const detectImportMock = vi.fn();
vi.mock("../../../api/import", () => ({
    detectImport: (file: File) => detectImportMock(file),
}));

vi.mock("../../../api/client", () => {
    class ApiError extends Error {
        status: number;
        detail: string;
        constructor(status: number, detail: string) {
            super(detail);
            this.status = status;
            this.detail = detail;
        }
    }
    return { ApiError };
});

function makeFile(name = "book.bgb", size = 1024): File {
    const f = new File([new Uint8Array(size)], name, {
        type: "application/octet-stream",
    });
    return f;
}

describe("DetectingStep", () => {
    beforeEach(() => {
        detectImportMock.mockReset();
    });

    it("calls detectImport with the file and propagates success", async () => {
        const response = {
            detected: {
                format_name: "bgb",
                source_identifier: "sha256:abc",
                title: "X",
                author: null,
                language: null,
                chapters: [],
                assets: [],
                warnings: [],
                plugin_specific_data: {},
            },
            duplicate: { found: false },
            temp_ref: "imp-1",
        };
        detectImportMock.mockResolvedValue(response);
        const onDetected = vi.fn();
        render(
            <DetectingStep
                file={makeFile()}
                onDetected={onDetected}
                onError={vi.fn()}
                onCancel={vi.fn()}
            />,
        );

        await waitFor(() => expect(onDetected).toHaveBeenCalled());
        expect(onDetected).toHaveBeenCalledWith(
            response.detected,
            response.duplicate,
            "imp-1",
        );
    });

    it("calls onError when the API rejects", async () => {
        const { ApiError } = await import("../../../api/client");
        detectImportMock.mockRejectedValue(
            new ApiError(415, "Unsupported format", "/api/import/detect", "POST"),
        );
        const onError = vi.fn();
        render(
            <DetectingStep
                file={makeFile("x.pdf")}
                onDetected={vi.fn()}
                onError={onError}
                onCancel={vi.fn()}
            />,
        );

        await waitFor(() => expect(onError).toHaveBeenCalled());
        expect(onError.mock.calls[0][0]).toMatch(/unsupported/i);
    });

    it("holds onDetected for at least the minimum visible time on fast detects", async () => {
        const response = {
            detected: {
                format_name: "bgb",
                source_identifier: "sha256:fast",
                title: "Fast",
                author: null,
                language: null,
                chapters: [],
                assets: [],
                warnings: [],
                plugin_specific_data: {},
            },
            duplicate: { found: false },
            temp_ref: "imp-fast",
        };
        // Resolve synchronously; the component must still hold the
        // spinner visible for MIN_VISIBLE_MS before calling onDetected.
        detectImportMock.mockResolvedValue(response);
        const onDetected = vi.fn();
        const startedAt = Date.now();
        render(
            <DetectingStep
                file={makeFile()}
                onDetected={onDetected}
                onError={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        await waitFor(() => expect(onDetected).toHaveBeenCalled(), {
            timeout: 2000,
        });
        const elapsed = Date.now() - startedAt;
        // MIN_VISIBLE_MS = 300. Allow 50ms slack for scheduling jitter.
        expect(elapsed).toBeGreaterThanOrEqual(250);
    });

    it("cancel stops calling onDetected even if the API resolves late", async () => {
        let resolveDetect: (v: unknown) => void = () => {};
        detectImportMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveDetect = resolve;
                }),
        );
        const onDetected = vi.fn();
        const onCancel = vi.fn();
        render(
            <DetectingStep
                file={makeFile()}
                onDetected={onDetected}
                onError={vi.fn()}
                onCancel={onCancel}
            />,
        );
        fireEvent.click(screen.getByTestId("detecting-cancel"));
        expect(onCancel).toHaveBeenCalled();
        // Late resolution must not invoke onDetected.
        resolveDetect({
            detected: {},
            duplicate: { found: false },
            temp_ref: "late",
        });
        await new Promise((r) => setTimeout(r, 0));
        expect(onDetected).not.toHaveBeenCalled();
    });
});
