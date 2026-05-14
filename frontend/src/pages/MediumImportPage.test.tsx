/**
 * Tests for the MediumImportPage button-state machine.
 *
 * Pins the v0.32.0 fix where the "Import starten" button stayed
 * enabled after a successful import (with the same ZIP still
 * selected), letting an accidental second click re-trigger the
 * import. The fix auto-clears the file on success so the button's
 * `disabled={!file || isBusy}` gate evaluates true.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MediumImportPage from "./MediumImportPage";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../utils/notify", () => ({
    notify: {
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

// MediumImportSettings reads the plugin config on mount; stub it
// out so the page test doesn't need to wire api.plugins.* mocks.
vi.mock("../components/medium-import/MediumImportSettings", () => ({
    default: () => <div data-testid="medium-import-settings-stub" />,
}));

const importZipMock = vi.fn();
vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>(
        "../api/client",
    );
    return {
        ...actual,
        api: {
            ...actual.api,
            mediumImport: {
                importZip: (...args: unknown[]) => importZipMock(...args),
            },
        },
    };
});

function makeFile(name: string, sizeBytes: number): File {
    const file = new File([new Uint8Array(0)], name, { type: "application/zip" });
    Object.defineProperty(file, "size", { value: sizeBytes });
    return file;
}

function pickFile(container: HTMLElement, file: File) {
    const input = container.querySelector(
        '[data-testid="medium-import-upload-input"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
}

function withRouter(node: React.ReactElement) {
    return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("MediumImportPage", () => {
    it("clears the selected file after a successful import so the Start button stays disabled", async () => {
        importZipMock.mockResolvedValue({
            imported_count: 3,
            skipped_count: 0,
            errored_count: 0,
            imported: [],
            skipped: [],
            errored: [],
        });
        const { container } = withRouter(<MediumImportPage />);

        // Pick a file -> Start enables.
        pickFile(container, makeFile("medium.zip", 1024));
        const startBtn = screen.getByTestId(
            "medium-import-start",
        ) as HTMLButtonElement;
        await waitFor(() => expect(startBtn.disabled).toBe(false));

        // Click Start -> import resolves -> result shown.
        fireEvent.click(startBtn);
        await waitFor(() =>
            expect(screen.getByTestId("medium-import-result")).toBeInTheDocument(),
        );

        // Pin: button must be disabled because file was auto-cleared.
        expect(startBtn.disabled).toBe(true);

        // The upload zone reverts to the empty-state dropzone (file
        // cleared) rather than showing the previous file name.
        expect(screen.queryByTestId("medium-import-upload-selected")).toBeNull();
        expect(screen.getByTestId("medium-import-upload-zone")).toBeInTheDocument();
    });

    it("keeps the file selected when the import fails so the user can retry", async () => {
        importZipMock.mockRejectedValue(new Error("network down"));
        const { container } = withRouter(<MediumImportPage />);

        pickFile(container, makeFile("medium.zip", 1024));
        const startBtn = screen.getByTestId(
            "medium-import-start",
        ) as HTMLButtonElement;
        await waitFor(() => expect(startBtn.disabled).toBe(false));

        fireEvent.click(startBtn);
        await waitFor(() => expect(importZipMock).toHaveBeenCalled());
        // Failed import returns the page to idle with the file STILL
        // selected so retry is one click away. (Auto-clear is the
        // success-only signal; failure preserves user state.)
        await waitFor(() => expect(startBtn.disabled).toBe(false));
        expect(screen.getByTestId("medium-import-upload-selected")).toBeInTheDocument();
    });
});
