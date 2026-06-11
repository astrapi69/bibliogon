/**
 * DangerZoneSettings tests pin the two-phase reset flow:
 *
 * - Section + reset-button render with their pinned testids
 * - Clicking reset opens the intermediate "choosing" dialog (backup
 *   first?) and does NOT yet call ``api.system.resetPrepare``
 * - "Continue without backup" advances to the RESET-confirmation phase
 *   and fires prepare (online)
 * - "Create backup" exports the full backup, then advances to confirm
 * - The destructive button is gated on the RESET text input
 * - Happy path: RESET → final-delete → reset called → cleanup → navigate
 *
 * The Radix Dialog portal follows the AppDialog pattern (its own
 * happy-dom-passing tests); the full UI flow is also covered by the
 * Playwright smoke at ``e2e/smoke/danger-zone.spec.ts``.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { DangerZoneSettings } from "./DangerZoneSettings";

const navigateMock = vi.fn();
const notifySuccess = vi.fn();
const notifyError = vi.fn();
const dbDeleteMock = vi.fn(async () => undefined);
const resetOfflineDbMock = vi.fn(async () => undefined);
const exportFullBackupMock = vi.fn(async () => new Blob(["{}"]));
const downloadBlobMock = vi.fn();
let offlineModeValue = false;

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({ t: (_k: string, fallback: string) => fallback }),
}));

vi.mock("../../storage/useStorageMode", () => ({
    useStorageMode: () => ({
        mode: offlineModeValue ? "dexie" : "api",
        online: !offlineModeValue,
        offlineEnabled: offlineModeValue,
    }),
}));

vi.mock("../../storage/dexie-storage", () => ({
    resetOfflineDatabase: () => resetOfflineDbMock(),
}));

vi.mock("../../export/backupExport", () => ({
    exportFullBackup: (...args: unknown[]) => exportFullBackupMock(...(args as [])),
    backupFilename: () => "bibliogon-backup-2026-06-10.json",
}));

vi.mock("../../export/download", () => ({
    downloadBlob: (...args: unknown[]) => downloadBlobMock(...(args as [])),
}));

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../utils/notify", () => ({
    notify: {
        success: (...args: unknown[]) => notifySuccess(...args),
        error: (...args: unknown[]) => notifyError(...args),
        bulkAction: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock("../../db/drafts", () => ({ db: { delete: () => dbDeleteMock() } }));

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client");
    return {
        ...actual,
        api: {
            ...actual.api,
            system: {
                info: vi.fn(),
                resetPrepare: vi.fn(async () => ({
                    token: "test-token-abc",
                    expires_at: Math.floor(Date.now() / 1000) + 300,
                    ttl_seconds: 300,
                })),
                reset: vi.fn(async () => ({ status: "reset" })),
            },
        },
    };
});

function renderWithRouter() {
    return render(
        <BrowserRouter>
            <DangerZoneSettings />
        </BrowserRouter>,
    );
}

async function advanceToConfirm() {
    fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
    await screen.findByTestId("danger-zone-precheck");
    fireEvent.click(screen.getByTestId("danger-zone-continue-without-backup"));
    await screen.findByTestId("danger-zone-reset-input");
}

describe("DangerZoneSettings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        offlineModeValue = false;
    });

    afterEach(() => {
        cleanup();
    });

    it("renders the section root + reset button", () => {
        renderWithRouter();
        expect(screen.getByTestId("danger-zone-section")).toBeTruthy();
        expect(screen.getByTestId("danger-zone-reset-button")).toBeTruthy();
    });

    it("clicking reset opens the choosing dialog WITHOUT calling prepare", async () => {
        const { api } = await import("../../api/client");
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        await screen.findByTestId("danger-zone-precheck");
        expect(screen.getByTestId("danger-zone-create-backup")).toBeTruthy();
        expect(screen.getByTestId("danger-zone-continue-without-backup")).toBeTruthy();
        expect(api.system.resetPrepare).not.toHaveBeenCalled();
        expect(screen.queryByTestId("danger-zone-reset-input")).toBeNull();
    });

    it("continue-without-backup advances to confirm + calls prepare", async () => {
        const { api } = await import("../../api/client");
        renderWithRouter();
        await advanceToConfirm();
        expect(screen.getByTestId("danger-zone-warning")).toBeTruthy();
        expect(screen.getByTestId("danger-zone-final-delete-button")).toBeTruthy();
        await waitFor(() => expect(api.system.resetPrepare).toHaveBeenCalled());
    });

    it("create-backup exports the full backup, then advances to confirm", async () => {
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        await screen.findByTestId("danger-zone-precheck");
        fireEvent.click(screen.getByTestId("danger-zone-create-backup"));
        await waitFor(() => expect(exportFullBackupMock).toHaveBeenCalled());
        expect(downloadBlobMock).toHaveBeenCalled();
        await screen.findByTestId("danger-zone-reset-input");
    });

    it("final-delete is disabled with empty + lowercase input", async () => {
        const { api } = await import("../../api/client");
        renderWithRouter();
        await advanceToConfirm();
        await waitFor(() => expect(api.system.resetPrepare).toHaveBeenCalled());
        const button = screen.getByTestId("danger-zone-final-delete-button") as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        fireEvent.change(screen.getByTestId("danger-zone-reset-input"), {
            target: { value: "reset" },
        });
        expect(button.disabled).toBe(true);
    });

    it("final-delete enables when input is exactly 'RESET'", async () => {
        const { api } = await import("../../api/client");
        renderWithRouter();
        await advanceToConfirm();
        await waitFor(() => expect(api.system.resetPrepare).toHaveBeenCalled());
        fireEvent.change(screen.getByTestId("danger-zone-reset-input"), {
            target: { value: "RESET" },
        });
        await waitFor(() => {
            const button = screen.getByTestId(
                "danger-zone-final-delete-button",
            ) as HTMLButtonElement;
            expect(button.disabled).toBe(false);
        });
    });

    it("happy path: RESET → final → reset called → cleanup → navigate", async () => {
        localStorage.setItem("bibliogon-theme", "dark");
        sessionStorage.setItem("scratch", "x");

        const { api } = await import("../../api/client");
        renderWithRouter();
        await advanceToConfirm();
        await waitFor(() => expect(api.system.resetPrepare).toHaveBeenCalled());
        fireEvent.change(screen.getByTestId("danger-zone-reset-input"), {
            target: { value: "RESET" },
        });
        const button = screen.getByTestId("danger-zone-final-delete-button") as HTMLButtonElement;
        await waitFor(() => expect(button.disabled).toBe(false));
        fireEvent.click(button);

        await waitFor(() =>
            expect(api.system.reset).toHaveBeenCalledWith("test-token-abc", "RESET"),
        );
        await waitFor(() => {
            expect(localStorage.getItem("bibliogon-theme")).toBeNull();
            expect(sessionStorage.getItem("scratch")).toBeNull();
            expect(dbDeleteMock).toHaveBeenCalled();
            expect(notifySuccess).toHaveBeenCalled();
            expect(navigateMock).toHaveBeenCalledWith("/");
        });
    });

    it("offline mode: reset button is not gated", () => {
        offlineModeValue = true;
        renderWithRouter();
        const button = screen.getByTestId("danger-zone-reset-button") as HTMLButtonElement;
        expect(button.disabled).toBe(false);
    });

    it("offline mode: reset wipes Dexie + reseeds without any /api call", async () => {
        offlineModeValue = true;
        localStorage.setItem("bibliogon-theme", "dark");

        const { api } = await import("../../api/client");
        renderWithRouter();
        await advanceToConfirm();
        expect(api.system.resetPrepare).not.toHaveBeenCalled();
        fireEvent.change(screen.getByTestId("danger-zone-reset-input"), {
            target: { value: "RESET" },
        });
        const button = screen.getByTestId("danger-zone-final-delete-button") as HTMLButtonElement;
        await waitFor(() => expect(button.disabled).toBe(false));
        fireEvent.click(button);

        await waitFor(() => expect(resetOfflineDbMock).toHaveBeenCalled());
        expect(api.system.reset).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(localStorage.getItem("bibliogon-theme")).toBeNull();
            expect(navigateMock).toHaveBeenCalledWith("/");
        });
    });

    it("precheck cancel closes the dialog without resetting", async () => {
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        await screen.findByTestId("danger-zone-precheck");
        fireEvent.click(screen.getByTestId("danger-zone-precheck-cancel"));
        await waitFor(() => expect(screen.queryByTestId("danger-zone-precheck")).toBeNull());
    });
});
