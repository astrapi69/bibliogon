/**
 * A+ Content section in the book metadata (#887).
 *
 * The section is the only UI for the backend-only A+ generator (#825):
 * it loads the cached package, generates or regenerates one, lists the
 * missing required fields the backend answers with instead of calling
 * the AI, shows the validator findings, and is gated off in the web app.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { BookDetail } from "../../../api/client";
import type { AplusPackage } from "../../../api/platform";

const getMock = vi.fn();
const generateMock = vi.fn();
vi.mock("../../../api/client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../api/client")>();
    return {
        ...actual,
        api: {
            aplus: {
                get: (...args: unknown[]) => getMock(...args),
                generate: (...args: unknown[]) => generateMock(...args),
            },
        },
    };
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

let featureActive = true;
vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({
        state: featureActive ? "active" : "disabled",
        isActive: featureActive,
        isDisabled: !featureActive,
        isHidden: false,
        reason: featureActive ? undefined : "ui.feature.requires_desktop_app",
    }),
}));

import AplusSection from "./AplusSection";

const t = (key: string, fallback?: string) => fallback ?? key;

const BOOK = { id: "b1", title: "Das Buch", language: "de" } as unknown as BookDetail;

const PACKAGE: AplusPackage = {
    short_description: "Eine kurze Beschreibung.",
    bullets: [
        { heading: "Punkt eins", body: "Text eins" },
        { heading: "Punkt zwei", body: "Text zwei" },
    ],
    module_header: {
        title: "Kopfmodul",
        text: "Kopftext",
        image: {
            prompt: "a book",
            aspect_ratio: "16:9",
            size: "970x600",
            style_flags: [],
            rendered: "a book, 970x600, 16:9",
        },
        alt_text: "Buchcover",
    },
    module_three_images: [
        {
            title: "Bild eins",
            text: "Bildtext",
            image: { prompt: "p1", aspect_ratio: "1:1", size: "300x300", style_flags: [], rendered: "p1 rendered" },
            alt_text: "Alt eins",
        },
    ],
    validation: [{ field: "short_description", severity: "warning", message: "Zu lang" }],
    meta: {
        book_id: "b1",
        language: "de",
        model: "claude-sonnet-4-6",
        ruleset_version: "3",
        generated_at: "2026-09-22T08:00:00Z",
    },
};

beforeEach(() => {
    featureActive = true;
    getMock.mockReset();
    generateMock.mockReset();
    notifySuccess.mockClear();
    notifyError.mockClear();
    copyMock.mockClear();
    getMock.mockResolvedValue(null);
});
afterEach(() => vi.clearAllMocks());

describe("AplusSection", () => {
    it("is gated off in the web app and never calls the backend", () => {
        featureActive = false;
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        expect(screen.getByTestId("aplus-feature-notice")).toBeTruthy();
        expect(screen.queryByTestId("aplus-generate")).toBeNull();
        expect(getMock).not.toHaveBeenCalled();
    });

    it("loads the cached package for the book language on mount", async () => {
        getMock.mockResolvedValue(PACKAGE);
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByText("Eine kurze Beschreibung.");
        expect(getMock).toHaveBeenCalledWith("b1", "de");
        expect(screen.getByText("Punkt zwei")).toBeTruthy();
        expect(screen.getByText("a book, 970x600, 16:9")).toBeTruthy();
        expect(screen.getByTestId("aplus-findings").textContent).toContain("Zu lang");
        expect(screen.getByTestId("aplus-generate").textContent).toContain("Neu generieren");
    });

    it("shows the empty state and generates without force when nothing is cached", async () => {
        generateMock.mockResolvedValue(PACKAGE);
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByTestId("aplus-empty");
        fireEvent.click(screen.getByTestId("aplus-generate"));
        await screen.findByText("Eine kurze Beschreibung.");
        expect(generateMock).toHaveBeenCalledWith("b1", { language: "de", force: false });
        expect(notifySuccess).toHaveBeenCalled();
    });

    it("regenerates with force when a package is already shown", async () => {
        getMock.mockResolvedValue(PACKAGE);
        generateMock.mockResolvedValue(PACKAGE);
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByText("Eine kurze Beschreibung.");
        fireEvent.click(screen.getByTestId("aplus-generate"));
        await waitFor(() =>
            expect(generateMock).toHaveBeenCalledWith("b1", { language: "de", force: true }),
        );
    });

    it("lists missing fields and jumps to the section that holds them", async () => {
        generateMock.mockResolvedValue({
            book_id: "b1",
            missing_fields: [{ field: "author", reason: "An author name is required." }],
        });
        const onSelectSection = vi.fn();
        render(<AplusSection book={BOOK} aiAvailable t={t} onSelectSection={onSelectSection} />);
        await screen.findByTestId("aplus-empty");
        fireEvent.click(screen.getByTestId("aplus-generate"));
        const missing = await screen.findByTestId("aplus-missing");
        expect(missing.textContent).toContain("An author name is required.");
        fireEvent.click(screen.getByTestId("aplus-missing-goto-author"));
        expect(onSelectSection).toHaveBeenCalledWith("general");
    });

    it("reloads the cached package when the language changes", async () => {
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByTestId("aplus-empty");
        fireEvent.change(screen.getByTestId("aplus-language-trigger"), { target: { value: "en" } });
        await waitFor(() => expect(getMock).toHaveBeenCalledWith("b1", "en"));
    });

    it("falls back to English for a book language the ruleset does not support", async () => {
        render(<AplusSection book={{ ...BOOK, language: "ja" }} aiAvailable t={t} />);
        await waitFor(() => expect(getMock).toHaveBeenCalledWith("b1", "en"));
    });

    it("disables generation and says why when AI is not available", async () => {
        render(<AplusSection book={BOOK} aiAvailable={false} t={t} />);
        await screen.findByTestId("aplus-empty");
        expect((screen.getByTestId("aplus-generate") as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByTestId("aplus-ai-unavailable")).toBeTruthy();
    });

    it("copies a field to the clipboard", async () => {
        getMock.mockResolvedValue(PACKAGE);
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByText("Eine kurze Beschreibung.");
        fireEvent.click(screen.getByTestId("aplus-copy-short-description"));
        await waitFor(() => expect(copyMock).toHaveBeenCalledWith("Eine kurze Beschreibung."));
    });

    it("shows a bullet's body under its heading and copies heading and body together", async () => {
        getMock.mockResolvedValue(PACKAGE);
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByText("Text eins");
        expect(screen.queryByText("Punkt eins: Text eins")).toBeNull();
        fireEvent.click(screen.getByTestId("aplus-copy-bullet-0"));
        await waitFor(() => expect(copyMock).toHaveBeenCalledWith("Punkt eins: Text eins"));
    });

    it("reports a generation error with the caught error", async () => {
        const failure = new Error("provider down");
        generateMock.mockRejectedValue(failure);
        render(<AplusSection book={BOOK} aiAvailable t={t} />);
        await screen.findByTestId("aplus-empty");
        fireEvent.click(screen.getByTestId("aplus-generate"));
        await waitFor(() => expect(notifyError).toHaveBeenCalled());
        expect(notifyError.mock.calls[0][1]).toBe(failure);
    });
});
