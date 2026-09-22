/**
 * A+ Content section in the book metadata (#887, #891).
 *
 * The author edits the A+ document by hand; it is loaded and saved through
 * the storage seam, so it works in the web app and on a phone. "Fill with
 * AI" is optional: desktop-only (the backend ruleset + validator), needs a
 * configured AI and one of the ruleset languages, asks before overwriting
 * typed text, and shows the validator findings afterwards.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { BookDetail } from "../../../api/client";

const docGet = vi.fn();
const docSave = vi.fn();
vi.mock("../../../storage", () => ({
    getStorage: () => ({ aplusDocuments: { get: docGet, save: docSave } }),
}));

const generateMock = vi.fn();
vi.mock("../../../api/client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../api/client")>();
    return { ...actual, api: { aplus: { generate: (...args: unknown[]) => generateMock(...args) } } };
});

const notifySuccess = vi.fn();
const notifyError = vi.fn();
vi.mock("../../../utils/platform/notify", () => ({
    notify: {
        success: (...a: unknown[]) => notifySuccess(...a),
        error: (...a: unknown[]) => notifyError(...a),
        info: vi.fn(),
    },
}));

const copyMock = vi.fn(async (_text: string) => true);
vi.mock("../../../utils/platform/clipboard", () => ({
    copyToClipboard: (text: string) => copyMock(text),
}));

const confirmMock = vi.fn(async () => true);
vi.mock("../../shared/AppDialog", () => ({
    useDialog: () => ({ confirm: confirmMock }),
}));

let aiFeatureActive = true;
vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({
        state: aiFeatureActive ? "active" : "disabled",
        isActive: aiFeatureActive,
        isDisabled: !aiFeatureActive,
        isHidden: false,
        reason: aiFeatureActive ? undefined : "ui.feature.requires_desktop_app",
    }),
}));

import AplusSection from "./AplusSection";

const t = (key: string, fallback?: string) => fallback ?? key;

const BOOK = { id: "b1", title: "El caballo", language: "es" } as unknown as BookDetail;

const PACKAGE = {
    short_description: "Filimón sabe reír.",
    bullets: [
        { heading: "Uno", body: "Primero." },
        { heading: "Dos", body: "Segundo." },
        { heading: "Tres", body: "Tercero." },
    ],
    module_header: {
        title: "Kopf",
        text: "Kopftext",
        image: { prompt: "farm", rendered: "farm --ar 97:60", aspect_ratio: "97:60", size: "970x600", style_flags: [] },
        alt_text: "Granja",
    },
    module_three_images: [],
    validation: [{ field: "short_description", severity: "warning", message: "Too long" }],
    meta: { book_id: "b1", language: "es", model: "m", ruleset_version: "3", generated_at: "2026-09-22T08:00:00Z" },
};

function storedDoc(overrides: Record<string, unknown> = {}) {
    return {
        book_id: "b1",
        language: "es",
        updated_at: "t",
        content_name: "El caballo - A+Content",
        short_description: "",
        bullets: [],
        modules: [],
        ...overrides,
    };
}

beforeEach(() => {
    aiFeatureActive = true;
    docGet.mockReset();
    docSave.mockReset();
    generateMock.mockReset();
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
    docGet.mockResolvedValue(null);
    docSave.mockImplementation(async (bookId: string, language: string, doc: object) => ({
        ...doc,
        book_id: bookId,
        language,
        updated_at: "now",
    }));
});
afterEach(() => vi.clearAllMocks());

describe("AplusSection", () => {
    it("opens an editable document even without the desktop app", async () => {
        aiFeatureActive = false;
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        const name = (await screen.findByTestId("aplus-content-name")) as HTMLTextAreaElement;
        expect(name.value).toBe("El caballo - A+Content");
        expect(docGet).toHaveBeenCalledWith("b1", "es");
    });

    it("saves a typed field through the storage seam", async () => {
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        fireEvent.change(await screen.findByTestId("aplus-short-description"), {
            target: { value: "Kurz" },
        });
        await waitFor(() => expect(docSave).toHaveBeenCalled(), { timeout: 3000 });
        expect(docSave.mock.calls[0][0]).toBe("b1");
        expect(docSave.mock.calls[0][1]).toBe("es");
        expect(docSave.mock.calls[0][2].short_description).toBe("Kurz");
    });

    it("offers the book's own language next to the AI languages and loads its document", async () => {
        const book = { ...BOOK, language: "it" } as unknown as BookDetail;
        render(<AplusSection book={book} aiAvailable t={t} />);
        await screen.findByTestId("aplus-content-name");
        expect(docGet).toHaveBeenCalledWith("b1", "it");
        fireEvent.change(screen.getByTestId("aplus-language-trigger"), { target: { value: "de" } });
        await waitFor(() => expect(docGet).toHaveBeenCalledWith("b1", "de"));
    });

    it("disables AI fill with a reason in the web app", async () => {
        aiFeatureActive = false;
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByTestId("aplus-content-name");
        expect((screen.getByTestId("aplus-ai-fill") as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByTestId("aplus-ai-unavailable")).toBeTruthy();
    });

    it("disables AI fill with a reason when AI is not set up", async () => {
        render(<AplusSection book={BOOK} aiAvailable={false} t={t} />);
        await screen.findByTestId("aplus-content-name");
        expect((screen.getByTestId("aplus-ai-fill") as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByTestId("aplus-ai-unavailable")).toBeTruthy();
    });

    it("disables AI fill for a language the ruleset does not cover", async () => {
        const book = { ...BOOK, language: "it" } as unknown as BookDetail;
        render(<AplusSection book={book} aiAvailable t={t} />);
        await screen.findByTestId("aplus-content-name");
        expect((screen.getByTestId("aplus-ai-fill") as HTMLButtonElement).disabled).toBe(true);
    });

    it("fills an empty document with AI without asking and saves it at once", async () => {
        generateMock.mockResolvedValue(PACKAGE);
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByTestId("aplus-content-name");
        fireEvent.click(screen.getByTestId("aplus-ai-fill"));
        await waitFor(() =>
            expect((screen.getByTestId("aplus-short-description") as HTMLTextAreaElement).value).toBe(
                "Filimón sabe reír.",
            ),
        );
        expect(confirmMock).not.toHaveBeenCalled();
        expect(generateMock).toHaveBeenCalledWith("b1", { language: "es", force: true });
        expect(docSave).toHaveBeenCalled();
        expect(screen.getByTestId("aplus-findings").textContent).toContain("Too long");
        expect((screen.getByTestId("aplus-module-0-slot-0-prompt") as HTMLTextAreaElement).value).toBe(
            "farm --ar 97:60",
        );
    });

    it("asks before AI overwrites typed text and leaves it alone on cancel", async () => {
        docGet.mockResolvedValue(storedDoc({ short_description: "Von Hand" }));
        confirmMock.mockResolvedValue(false);
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByTestId("aplus-content-name");
        fireEvent.click(screen.getByTestId("aplus-ai-fill"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(generateMock).not.toHaveBeenCalled();
        expect((screen.getByTestId("aplus-short-description") as HTMLTextAreaElement).value).toBe("Von Hand");
    });

    it("lists missing book fields and jumps to the section that holds them", async () => {
        generateMock.mockResolvedValue({
            book_id: "b1",
            missing_fields: [{ field: "author", reason: "An author name is required." }],
        });
        const onSelectSection = vi.fn();
        render(<AplusSection book={BOOK} aiAvailable t={t} onSelectSection={onSelectSection} />);
        await screen.findByTestId("aplus-content-name");
        fireEvent.click(screen.getByTestId("aplus-ai-fill"));
        fireEvent.click(await screen.findByTestId("aplus-missing-goto-author"));
        expect(onSelectSection).toHaveBeenCalledWith("general");
    });

    it("reports an AI error with the caught error", async () => {
        const failure = new Error("provider down");
        generateMock.mockRejectedValue(failure);
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByTestId("aplus-content-name");
        fireEvent.click(screen.getByTestId("aplus-ai-fill"));
        await waitFor(() => expect(notifyError).toHaveBeenCalled());
        expect(notifyError.mock.calls[0][1]).toBe(failure);
    });

    it("copies the whole document as text", async () => {
        docGet.mockResolvedValue(storedDoc({ short_description: "Kurz" }));
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByTestId("aplus-content-name");
        fireEvent.click(screen.getByTestId("aplus-copy-all"));
        await waitFor(() => expect(copyMock).toHaveBeenCalled());
        const text = copyMock.mock.calls[0][0];
        expect(text).toContain("El caballo - A+Content");
        expect(text).toContain("Kurz");
    });
});
