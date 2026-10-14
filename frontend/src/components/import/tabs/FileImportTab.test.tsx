/**
 * The file source of the import dialog, for the write-book-template project
 * archive it can now import in the browser (#736).
 *
 * The detector and the router are mocked - they have their own tests - so
 * what is pinned here is the surface: a detected `wbt-zip` can be imported
 * from this tab, the import runs through `importFile` with that format, the
 * confirmation names what arrived, and the picker offers the `.bgp`
 * extension the archive usually carries.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const { detectImportFormat, importFile, notifySuccess, notifyError } = vi.hoisted(() => ({
    detectImportFormat: vi.fn(async () => "wbt-zip"),
    importFile: vi.fn(async (_file: File, _format: string) => ({
        kind: "wbt",
        format: "wbt-zip",
        result: {
            bookId: "b1",
            bookTitle: "Die Reise",
            chapterCount: 12,
            assetCount: 4,
        },
    })),
    notifySuccess: vi.fn(),
    notifyError: vi.fn(),
}));

vi.mock("../../../import/detectFormat", () => ({ detectImportFormat }));
vi.mock("../../../import/importRouter", () => ({
    importFile,
    OfflineNotSupportedError: class extends Error {},
    UnknownFormatError: class extends Error {},
}));
vi.mock("../../../utils/platform/notify", () => ({
    notify: { success: notifySuccess, error: notifyError },
}));
vi.mock("../../../storage", () => ({
    getStorage: () => ({ books: { list: vi.fn(async () => []) } }),
}));

import FileImportTab from "./FileImportTab";

function pick(name: string) {
    const input = screen.getByTestId("offline-import-input") as HTMLInputElement;
    const file = new File(["PK-bytes"], name, { type: "application/zip" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    return file;
}

beforeEach(() => vi.clearAllMocks());

describe("FileImportTab with a write-book-template archive (#736)", () => {
    it("imports a detected wbt-zip through the router and names the result", async () => {
        render(
            <MemoryRouter>
                <FileImportTab open onClose={() => {}} />
            </MemoryRouter>,
        );
        pick("die-reise.bgp");

        await waitFor(() =>
            expect(screen.getByTestId("offline-import-format-wbt-zip")).toBeTruthy(),
        );

        const confirm = screen.getByTestId("offline-import-confirm") as HTMLButtonElement;
        expect(confirm.disabled).toBe(false);
        fireEvent.click(confirm);

        await waitFor(() => expect(importFile).toHaveBeenCalled());
        expect(importFile.mock.calls[0][1]).toBe("wbt-zip");
        await waitFor(() => expect(notifySuccess).toHaveBeenCalled());
        const message = String(notifySuccess.mock.calls[0][0]);
        expect(message).toContain("Die Reise");
        expect(message).toContain("12");
        expect(notifyError).not.toHaveBeenCalled();
    });

    it("offers the .bgp extension in the file picker", () => {
        render(
            <MemoryRouter>
                <FileImportTab open onClose={() => {}} />
            </MemoryRouter>,
        );
        const input = screen.getByTestId("offline-import-input") as HTMLInputElement;
        expect(input.accept.split(",")).toContain(".bgp");
    });
});
