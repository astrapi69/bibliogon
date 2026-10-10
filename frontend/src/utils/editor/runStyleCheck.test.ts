import {beforeEach, describe, expect, it, vi} from "vitest";

import {runStyleCheck} from "./runStyleCheck";

const getStorageMock = vi.fn();
const checkMock = vi.fn();

vi.mock("../../storage", () => ({
    getStorage: () => getStorageMock(),
}));

vi.mock("../../api/client", () => ({
    api: {msTools: {check: (...args: unknown[]) => checkMock(...args)}},
}));

describe("runStyleCheck", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("asks the backend in api mode", async () => {
        getStorageMock.mockReturnValue({mode: "api"});
        checkMock.mockResolvedValue({findings: [], total_words: 3});

        const result = await runStyleCheck("Das ist einfach.", "de", "book-1");

        expect(checkMock).toHaveBeenCalledWith("Das ist einfach.", "de", "book-1");
        expect(result.total_words).toBe(3);
    });

    it("computes in the browser in dexie mode, with no /api call", async () => {
        getStorageMock.mockReturnValue({mode: "dexie"});

        const result = await runStyleCheck("Das ist eigentlich einfach.", "de");

        expect(checkMock).not.toHaveBeenCalled();
        expect(result.findings.some((f) => f.type === "filler_word")).toBe(true);
    });

    it("passes the language through to the browser checker", async () => {
        getStorageMock.mockReturnValue({mode: "dexie"});

        // "actually" is an English filler; the German tables do not have it,
        // so a hard-coded language would report nothing here.
        const result = await runStyleCheck("This is actually simple.", "en");

        expect(
            result.findings.some(
                (f) => f.type === "filler_word" && f.word === "actually",
            ),
        ).toBe(true);
    });
});
