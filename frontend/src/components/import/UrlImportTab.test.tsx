import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

vi.mock("../../utils/platform/notify", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));

const useFeatureMock = vi.fn();
vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => useFeatureMock(),
}));

const runUrlImport = vi.fn();
vi.mock("../../import/urlImport", () => ({
    runUrlImport: (...a: unknown[]) => runUrlImport(...a),
    UrlImportError: class extends Error {},
}));

import UrlImportTab from "./UrlImportTab";

afterEach(() => vi.clearAllMocks());

describe("UrlImportTab", () => {
    it("shows the network notice when the feature is offline-disabled", () => {
        useFeatureMock.mockReturnValue({ isActive: false, reason: "ui.feature.requires_network" });
        render(<UrlImportTab onClose={() => {}} />);
        expect(screen.getByTestId("url-import-offline")).toBeTruthy();
    });

    it("imports from a URL and navigates to the created book", async () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        runUrlImport.mockResolvedValue({
            format: "markdown",
            result: { kind: "chapter", result: { bookId: "book-9" } },
        });
        const onClose = vi.fn();
        const onImported = vi.fn();
        render(<UrlImportTab onClose={onClose} onImported={onImported} />);

        fireEvent.change(screen.getByTestId("url-import-url"), {
            target: { value: "https://example.com/doc.md" },
        });
        fireEvent.click(screen.getByTestId("url-import-confirm"));

        await waitFor(() =>
            expect(runUrlImport).toHaveBeenCalledWith("https://example.com/doc.md"),
        );
        expect(onImported).toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith("/book/book-9");
    });

    it("surfaces an import error", async () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        runUrlImport.mockRejectedValue(new Error("CORS blocked"));
        render(<UrlImportTab onClose={() => {}} />);

        fireEvent.change(screen.getByTestId("url-import-url"), {
            target: { value: "https://example.com/doc.md" },
        });
        fireEvent.click(screen.getByTestId("url-import-confirm"));

        expect(await screen.findByTestId("url-import-error")).toBeTruthy();
    });
});

describe("UrlImportTab edge cases", () => {
    it("disables import when the URL is empty", () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        render(<UrlImportTab onClose={() => {}} />);
        expect((screen.getByTestId("url-import-confirm") as HTMLButtonElement).disabled).toBe(true);
    });

    it("passes a long URL with special characters through to the importer (boundary)", async () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        runUrlImport.mockResolvedValue({
            format: "markdown",
            result: { kind: "backup", result: { imported: {} } },
        });
        const url = "https://example.com/" + "a".repeat(200) + "/d%20oc.md?x=1#y";
        render(<UrlImportTab onClose={() => {}} />);

        fireEvent.change(screen.getByTestId("url-import-url"), { target: { value: url } });
        fireEvent.click(screen.getByTestId("url-import-confirm"));

        await waitFor(() => expect(runUrlImport).toHaveBeenCalledWith(url));
    });
});
