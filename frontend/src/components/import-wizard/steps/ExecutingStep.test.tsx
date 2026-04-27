import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { ExecutingStep } from "./ExecutingStep";

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const executeImportMock = vi.fn();
vi.mock("../../../api/import", () => ({
    executeImport: (...args: unknown[]) => executeImportMock(...args),
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

describe("ExecutingStep", () => {
    beforeEach(() => {
        executeImportMock.mockReset();
    });

    it("calls executeImport with (tempRef, overrides, duplicateAction, existingBookId, gitAdoption)", async () => {
        executeImportMock.mockResolvedValue({ book_id: "new-1", status: "created" });
        const onSuccess = vi.fn();
        render(
            <ExecutingStep
                tempRef="imp-1"
                overrides={{ title: "X" }}
                duplicateAction="create"
                existingBookId={null}
                onSuccess={onSuccess}
                onError={vi.fn()}
            />,
        );
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("new-1", ["new-1"]));
        expect(executeImportMock).toHaveBeenCalledWith(
            "imp-1",
            { title: "X" },
            "create",
            null,
            null,
        );
    });

    it("forwards gitAdoption to executeImport when set", async () => {
        executeImportMock.mockResolvedValue({ book_id: "new-2", status: "created" });
        const onSuccess = vi.fn();
        render(
            <ExecutingStep
                tempRef="imp-git"
                overrides={{ title: "X" }}
                duplicateAction="create"
                existingBookId={null}
                gitAdoption="adopt_with_remote"
                onSuccess={onSuccess}
                onError={vi.fn()}
            />,
        );
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("new-2", ["new-2"]));
        expect(executeImportMock).toHaveBeenCalledWith(
            "imp-git",
            { title: "X" },
            "create",
            null,
            "adopt_with_remote",
        );
    });

    it("cancelled server response routes to onError", async () => {
        executeImportMock.mockResolvedValue({ book_id: null, status: "cancelled" });
        const onError = vi.fn();
        render(
            <ExecutingStep
                tempRef="imp-1"
                overrides={{}}
                duplicateAction="create"
                existingBookId={null}
                onSuccess={vi.fn()}
                onError={onError}
            />,
        );
        await waitFor(() => expect(onError).toHaveBeenCalled());
    });

    it("ApiError is unwrapped to onError(detail)", async () => {
        const { ApiError } = await import("../../../api/client");
        executeImportMock.mockRejectedValue(
            new ApiError(500, "Handler blew up", "/api/import/execute", "POST"),
        );
        const onError = vi.fn();
        render(
            <ExecutingStep
                tempRef="imp-1"
                overrides={{}}
                duplicateAction="create"
                existingBookId={null}
                onSuccess={vi.fn()}
                onError={onError}
            />,
        );
        await waitFor(() => expect(onError).toHaveBeenCalled());
        const arg = onError.mock.calls[0][0];
        expect(arg.message).toBe("Handler blew up");
        expect(arg.context).toBe("execute");
        expect(arg.retryable).toBe(true);
    });
});
