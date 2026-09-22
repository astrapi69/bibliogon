/**
 * useAplusDocument (#891): loads the author's A+ document through the
 * storage seam, starts from an empty document when none exists, and
 * saves edits debounced - without ever dropping the last keystrokes on
 * unmount or on a language switch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const getMock = vi.fn();
const saveMock = vi.fn();
vi.mock("../../storage", () => ({
    getStorage: () => ({
        aplusDocuments: {
            get: (...args: unknown[]) => getMock(...args),
            save: (...args: unknown[]) => saveMock(...args),
        },
    }),
}));

import { useAplusDocument } from "./useAplusDocument";

const RECORD = {
    book_id: "b1",
    language: "es",
    updated_at: "2026-09-22T10:00:00Z",
    content_name: "El caballo - A+Content",
    short_description: "Kurz",
    bullets: [{ heading: "H", body: "B" }],
    modules: [],
};

beforeEach(() => {
    getMock.mockReset();
    saveMock.mockReset();
    getMock.mockResolvedValue(null);
    saveMock.mockImplementation(async (bookId: string, language: string, doc: object) => ({
        ...doc,
        book_id: bookId,
        language,
        updated_at: "now",
    }));
});
afterEach(() => {
    vi.useRealTimers();
});

function render(language = "es", onError = vi.fn()) {
    return renderHook(
        ({ lang }) => useAplusDocument({ bookId: "b1", bookTitle: "El caballo", language: lang, delayMs: 500, onError }),
        { initialProps: { lang: language } },
    );
}

describe("useAplusDocument", () => {
    it("loads the stored document without the record metadata", async () => {
        getMock.mockResolvedValue(RECORD);
        const { result } = render();
        await waitFor(() => expect(result.current.document).not.toBeNull());
        expect(getMock).toHaveBeenCalledWith("b1", "es");
        expect(result.current.document).toEqual({
            content_name: "El caballo - A+Content",
            short_description: "Kurz",
            bullets: [{ heading: "H", body: "B" }],
            modules: [],
        });
        expect(result.current.saveState).toBe("saved");
    });

    it("starts from an empty document named after the book and does not save it yet", async () => {
        const { result } = render();
        await waitFor(() => expect(result.current.document).not.toBeNull());
        expect(result.current.document?.content_name).toBe("El caballo - A+Content");
        expect(result.current.document?.modules).toHaveLength(2);
        expect(result.current.saveState).toBe("idle");
        expect(saveMock).not.toHaveBeenCalled();
    });

    it("collapses quick edits into one save with the latest document", async () => {
        const { result } = render();
        await waitFor(() => expect(result.current.document).not.toBeNull());
        vi.useFakeTimers();
        const base = result.current.document!;
        act(() => result.current.update({ ...base, short_description: "a" }));
        act(() => result.current.update({ ...base, short_description: "ab" }));
        expect(result.current.document?.short_description).toBe("ab");
        expect(saveMock).not.toHaveBeenCalled();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });
        expect(saveMock).toHaveBeenCalledTimes(1);
        expect(saveMock.mock.calls[0][2].short_description).toBe("ab");
        expect(result.current.saveState).toBe("saved");
    });

    it("saves a pending edit when the component unmounts", async () => {
        const { result, unmount } = render();
        await waitFor(() => expect(result.current.document).not.toBeNull());
        const base = result.current.document!;
        act(() => result.current.update({ ...base, content_name: "Neu" }));
        unmount();
        await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
        expect(saveMock.mock.calls[0][0]).toBe("b1");
        expect(saveMock.mock.calls[0][2].content_name).toBe("Neu");
    });

    it("saves the pending edit under the old language before loading the new one", async () => {
        const { result, rerender } = render("es");
        await waitFor(() => expect(result.current.document).not.toBeNull());
        const base = result.current.document!;
        act(() => result.current.update({ ...base, content_name: "Español" }));
        rerender({ lang: "de" });
        await waitFor(() => expect(saveMock).toHaveBeenCalled());
        expect(saveMock.mock.calls[0][1]).toBe("es");
        expect(saveMock.mock.calls[0][2].content_name).toBe("Español");
        await waitFor(() => expect(getMock).toHaveBeenCalledWith("b1", "de"));
    });

    it("replace saves at once", async () => {
        const { result } = render();
        await waitFor(() => expect(result.current.document).not.toBeNull());
        const base = result.current.document!;
        await act(async () => {
            await result.current.replace({ ...base, short_description: "KI" });
        });
        expect(saveMock).toHaveBeenCalledTimes(1);
        expect(result.current.document?.short_description).toBe("KI");
    });

    it("reports a failed save with the caught error", async () => {
        const failure = new Error("disk full");
        saveMock.mockRejectedValue(failure);
        const onError = vi.fn();
        const { result } = render("es", onError);
        await waitFor(() => expect(result.current.document).not.toBeNull());
        const base = result.current.document!;
        await act(async () => {
            await result.current.replace({ ...base, short_description: "x" });
        });
        expect(onError).toHaveBeenCalledWith(failure);
        expect(result.current.saveState).toBe("error");
    });
});
