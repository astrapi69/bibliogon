import {describe, it, expect, vi, beforeEach} from "vitest";

const {mockBuildPackage, mockClientBuild, mockMode} = vi.hoisted(() => ({
    mockBuildPackage: vi.fn(),
    mockClientBuild: vi.fn(),
    mockMode: {value: "api" as "api" | "dexie"},
}));

vi.mock("../../api/client", () => ({
    api: {kdp: {buildPackage: mockBuildPackage}},
}));

vi.mock("../../storage", () => ({
    getStorage: () => ({mode: mockMode.value}),
}));

vi.mock("./gatherKdpPackage", () => ({
    buildClientKdpPackage: mockClientBuild,
}));

import {runKdpPackage, usesClientKdpPackage} from "./runKdpPackage";

const BOOK = {id: "b1", title: "Mein Buch"} as never;

describe("runKdpPackage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockMode.value = "api";
        mockBuildPackage.mockResolvedValue({blob: new Blob(["s"]), filename: "s.zip"});
        mockClientBuild.mockResolvedValue({blob: new Blob(["c"]), filename: "c.zip"});
    });

    it("calls the backend endpoint online", async () => {
        const result = await runKdpPackage(BOOK, {
            formatKind: "paperback",
            trimSize: "6x9",
            margin: "normal",
        });
        expect(mockBuildPackage).toHaveBeenCalledWith("b1", {
            format_kind: "paperback",
            trim_size: "6x9",
            margin: "normal",
        });
        expect(mockClientBuild).not.toHaveBeenCalled();
        expect(result.filename).toBe("s.zip");
    });

    it("names the defaults rather than sending an empty string", async () => {
        // The endpoint's payload has no optional fields. An empty string
        // would reach the server as a trim id it has to interpret.
        await runKdpPackage(BOOK, {formatKind: "ebook"});
        expect(mockBuildPackage).toHaveBeenCalledWith("b1", {
            format_kind: "ebook",
            trim_size: "6x9",
            margin: "normal",
        });
    });

    it("builds in the browser offline and fires no request", async () => {
        mockMode.value = "dexie";
        const result = await runKdpPackage(BOOK, {
            formatKind: "paperback",
            trimSize: "5x8",
            margin: "wide",
        });
        expect(mockBuildPackage).not.toHaveBeenCalled();
        expect(mockClientBuild).toHaveBeenCalledWith(BOOK, {
            formatKind: "paperback",
            trimSize: "5x8",
            margin: "wide",
        });
        expect(result.filename).toBe("c.zip");
    });

    it("reports which builder will run, so a caller can say so first", () => {
        expect(usesClientKdpPackage()).toBe(false);
        mockMode.value = "dexie";
        expect(usesClientKdpPackage()).toBe(true);
    });

    it("reads the mode per call, because it can change mid-session", async () => {
        // The connectivity monitor can flip the storage mode while the
        // wizard is open. A branch resolved once at import would keep
        // calling an endpoint that is no longer reachable.
        await runKdpPackage(BOOK, {formatKind: "ebook"});
        mockMode.value = "dexie";
        await runKdpPackage(BOOK, {formatKind: "ebook"});
        expect(mockBuildPackage).toHaveBeenCalledTimes(1);
        expect(mockClientBuild).toHaveBeenCalledTimes(1);
    });
});
