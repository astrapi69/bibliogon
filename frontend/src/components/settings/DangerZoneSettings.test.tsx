/**
 * DangerZoneSettings tests pin:
 *
 * - The section + reset-button render with their pinned testids
 * - Clicking the reset button fires ``api.system.resetPrepare``
 *   and opens the dialog
 * - The destructive button is gated on the RESET text input
 *   (empty / "reset" lowercase / "RESET" matching)
 * - Happy path: typing RESET → click final-delete →
 *   ``api.system.reset`` called → localStorage + Dexie cleared
 *   → navigate("/")
 * - Backup button opens the backup-export URL in a new tab
 *
 * Per the lessons-learned rule "Radix DropdownMenu + happy-dom is
 * brittle for Vitest", the Radix Dialog portal-rendered content
 * can be intermittent. The Dialog Root + Portal here follows the
 * same pattern as AppDialog (which has its own happy-dom-passing
 * tests at AppDialog.test.tsx), so it should be reliable; if
 * regressions surface, the full UI flow is also covered by the
 * Playwright smoke at ``e2e/smoke/danger-zone.spec.ts``.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor, cleanup} from "@testing-library/react";
import {BrowserRouter} from "react-router-dom";
import {DangerZoneSettings} from "./DangerZoneSettings";

const navigateMock = vi.fn();
const notifySuccess = vi.fn();
const notifyError = vi.fn();
const dbDeleteMock = vi.fn(async () => undefined);

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>(
        "react-router-dom",
    );
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

vi.mock("../../utils/notify", () => ({
    notify: {
        success: (...args: unknown[]) => notifySuccess(...args),
        error: (...args: unknown[]) => notifyError(...args),
        bulkAction: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock("../../db/drafts", () => ({
    db: {
        delete: () => dbDeleteMock(),
    },
}));

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>(
        "../../api/client",
    );
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
                reset: vi.fn(async () => ({
                    status: "reset",
                    jobs_cancelled: 0,
                    rows_deleted: 0,
                    uploads_cleared: true,
                    tmp_cleared: true,
                    backup_history_cleared: true,
                    config_overlays_cleared: 0,
                    installed_plugins_cleared: 0,
                    secrets_cleared: true,
                })),
            },
            backup: {
                exportUrl: vi.fn(() => "/api/backup/export"),
            },
        },
    };
});

function renderWithRouter() {
    return render(
        <BrowserRouter>
            <DangerZoneSettings/>
        </BrowserRouter>,
    );
}

describe("DangerZoneSettings", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        navigateMock.mockClear();
        notifySuccess.mockClear();
        notifyError.mockClear();
        dbDeleteMock.mockClear();
    });

    afterEach(() => {
        cleanup();
    });

    it("renders the section root + reset button", () => {
        renderWithRouter();
        expect(screen.getByTestId("danger-zone-section")).toBeTruthy();
        expect(screen.getByTestId("danger-zone-reset-button")).toBeTruthy();
    });

    it("clicking the reset button opens the dialog + calls prepare", async () => {
        const {api} = await import("../../api/client");
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        const dialog = await screen.findByTestId("danger-zone-dialog");
        expect(dialog).toBeTruthy();
        await waitFor(() => {
            expect(api.system.resetPrepare).toHaveBeenCalled();
        });
    });

    it("dialog shows warning text + backup button + RESET input", async () => {
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        await screen.findByTestId("danger-zone-dialog");
        expect(screen.getByTestId("danger-zone-warning")).toBeTruthy();
        expect(screen.getByTestId("danger-zone-backup-offer")).toBeTruthy();
        expect(screen.getByTestId("danger-zone-backup-button")).toBeTruthy();
        expect(screen.getByTestId("danger-zone-reset-input")).toBeTruthy();
        expect(screen.getByTestId("danger-zone-final-delete-button")).toBeTruthy();
    });

    it("final-delete button is disabled with empty input", async () => {
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        await screen.findByTestId("danger-zone-dialog");
        const button = screen.getByTestId("danger-zone-final-delete-button") as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });

    it("final-delete button is disabled with 'reset' (lowercase)", async () => {
        const {api} = await import("../../api/client");
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        await screen.findByTestId("danger-zone-dialog");
        // Wait for prepare to resolve (token must be set).
        await waitFor(() => {
            expect(api.system.resetPrepare).toHaveBeenCalled();
        });
        const input = screen.getByTestId("danger-zone-reset-input") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "reset"}});
        const button = screen.getByTestId("danger-zone-final-delete-button") as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });

    it("final-delete button enables when input is exactly 'RESET'", async () => {
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        await screen.findByTestId("danger-zone-dialog");
        // Wait for the background prepare-call to land - the destructive
        // button stays disabled until ``token !== null``.
        const {api} = await import("../../api/client");
        await waitFor(() => {
            expect(api.system.resetPrepare).toHaveBeenCalled();
        });
        const input = screen.getByTestId("danger-zone-reset-input") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "RESET"}});
        await waitFor(() => {
            const button = screen.getByTestId("danger-zone-final-delete-button") as HTMLButtonElement;
            expect(button.disabled).toBe(false);
        });
    });

    it("happy path: type RESET → click final → reset called → cleanup → navigate", async () => {
        // Seed localStorage so we can assert it was cleared.
        localStorage.setItem("bibliogon-theme", "dark");
        localStorage.setItem("bibliogon-onboarding", "complete");
        sessionStorage.setItem("scratch", "x");

        const {api} = await import("../../api/client");
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        await screen.findByTestId("danger-zone-dialog");
        await waitFor(() => {
            expect(api.system.resetPrepare).toHaveBeenCalled();
        });
        const input = screen.getByTestId("danger-zone-reset-input") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "RESET"}});

        const button = screen.getByTestId("danger-zone-final-delete-button") as HTMLButtonElement;
        await waitFor(() => expect(button.disabled).toBe(false));
        fireEvent.click(button);

        await waitFor(() => {
            expect(api.system.reset).toHaveBeenCalledWith("test-token-abc", "RESET");
        });
        await waitFor(() => {
            expect(localStorage.getItem("bibliogon-theme")).toBeNull();
            expect(sessionStorage.getItem("scratch")).toBeNull();
            expect(dbDeleteMock).toHaveBeenCalled();
            expect(notifySuccess).toHaveBeenCalled();
            expect(navigateMock).toHaveBeenCalledWith("/");
        });
    });

    it("backup button opens the backup-export URL in a new tab", async () => {
        const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        await screen.findByTestId("danger-zone-dialog");
        fireEvent.click(screen.getByTestId("danger-zone-backup-button"));
        expect(openSpy).toHaveBeenCalledWith(
            "/api/backup/export",
            "_blank",
            "noopener",
        );
        openSpy.mockRestore();
    });

    it("cancel button closes the dialog", async () => {
        renderWithRouter();
        fireEvent.click(screen.getByTestId("danger-zone-reset-button"));
        await screen.findByTestId("danger-zone-dialog");
        fireEvent.click(screen.getByTestId("danger-zone-cancel-button"));
        await waitFor(() => {
            expect(screen.queryByTestId("danger-zone-dialog")).toBeNull();
        });
    });
});
