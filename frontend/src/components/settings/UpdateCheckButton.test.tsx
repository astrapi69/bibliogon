import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const checkForUpdateNow = vi.fn();
const applyUpdate = vi.fn();
let nextAvailable = false;
vi.mock("../../shared/utils/swUpdateManager", () => ({
    checkForUpdateNow: (...a: unknown[]) => checkForUpdateNow(...a),
    applyUpdate: (...a: unknown[]) => applyUpdate(...a),
    subscribeToUpdates: (cb: (b: boolean) => void) => {
        cb(nextAvailable);
        return () => {};
    },
}));

// Storage mode drives the SW (dexie) vs GitHub-Releases (api/desktop) path.
let storageMode: "api" | "dexie" = "dexie";
vi.mock("../../storage/useStorageMode", () => ({
    useStorageMode: () => ({ mode: storageMode }),
}));

const checkForUpdate = vi.fn();
vi.mock("../../lib/utils/updateChecker", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../lib/utils/updateChecker")>();
    return { ...actual, checkForUpdate: (...a: unknown[]) => checkForUpdate(...a) };
});

import { UpdateCheckButton, formatRelativeTime } from "./UpdateCheckButton";

beforeEach(() => {
    nextAvailable = false;
    storageMode = "dexie";
    localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe("UpdateCheckButton", () => {
    // Tier 1 — reproduction: the action button exists in the About section.
    it("renders the check button", () => {
        render(<UpdateCheckButton />);
        expect(screen.getByTestId("about-check-update")).toBeTruthy();
    });

    // Tier 2 — happy path: click shows the spinner state, then the result.
    it("shows a checking state then the up-to-date result", async () => {
        let resolveCheck: (v: string) => void = () => {};
        checkForUpdateNow.mockReturnValue(
            new Promise((res) => {
                resolveCheck = res as (v: string) => void;
            }),
        );
        render(<UpdateCheckButton />);

        fireEvent.click(screen.getByTestId("about-check-update"));
        expect(screen.getByTestId("about-check-update").textContent).toContain("Prüfe");

        resolveCheck("up-to-date");
        await waitFor(() =>
            expect(screen.getByTestId("about-update-status").textContent).toContain(
                "aktuellste Version",
            ),
        );
        // Last-check line switches from "never" to a relative timestamp.
        expect(screen.getByTestId("about-update-lastcheck").textContent).toContain(
            "Letzte Prüfung",
        );
    });

    // Tier 2 — happy path: a found update offers the Update button (skipWaiting).
    it("offers the Update button when a new version is found and applies it", async () => {
        checkForUpdateNow.mockResolvedValue("update-available");
        render(<UpdateCheckButton />);

        fireEvent.click(screen.getByTestId("about-check-update"));
        const apply = await screen.findByTestId("about-update-apply");
        fireEvent.click(apply);
        expect(applyUpdate).toHaveBeenCalledOnce();
    });

    // Tier 3 — edge: no service worker registered (dev mode).
    it("shows the dev-mode notice when no service worker is available", async () => {
        checkForUpdateNow.mockResolvedValue("unsupported");
        render(<UpdateCheckButton />);
        fireEvent.click(screen.getByTestId("about-check-update"));
        await waitFor(() =>
            expect(screen.getByTestId("about-update-status").textContent).toContain(
                "Entwicklungsmodus",
            ),
        );
    });

    // Tier 4 — edge: offline / check error.
    it("shows the failure hint when the check errors (offline)", async () => {
        checkForUpdateNow.mockResolvedValue("error");
        render(<UpdateCheckButton />);
        fireEvent.click(screen.getByTestId("about-check-update"));
        await waitFor(() =>
            expect(screen.getByTestId("about-update-status").textContent).toContain(
                "fehlgeschlagen",
            ),
        );
        expect(applyUpdate).not.toHaveBeenCalled();
    });

    // Edge: an already-waiting worker surfaces the Update button without a click.
    it("surfaces the Update button when an update is already waiting", () => {
        nextAvailable = true;
        render(<UpdateCheckButton />);
        expect(screen.getByTestId("about-update-apply")).toBeTruthy();
    });

    // Edge: never-checked state before any interaction.
    it("shows 'never checked' before the first check", () => {
        render(<UpdateCheckButton />);
        expect(screen.getByTestId("about-update-lastcheck").textContent).toContain("Noch nie");
    });
});

describe("UpdateCheckButton — desktop (API) mode via GitHub Releases", () => {
    beforeEach(() => {
        storageMode = "api";
    });

    it("uses the GitHub API (not the Service Worker) and offers release + install actions", async () => {
        checkForUpdate.mockResolvedValue({
            status: "update-available",
            currentVersion: "0.56.0",
            latestVersion: "v0.57.0",
            releaseUrl: "https://github.com/astrapi69/bibliogon/releases/tag/v0.57.0",
            releaseNotes: "## What's new\n- stuff",
        });
        render(<UpdateCheckButton />);
        fireEvent.click(screen.getByTestId("about-check-update"));

        const link = await screen.findByTestId("about-update-release-link");
        expect(link.getAttribute("href")).toContain("/releases/tag/v0.57.0");
        expect(screen.getByTestId("about-update-copy-install")).toBeTruthy();
        expect(screen.getByTestId("about-update-status").textContent).toContain("v0.57.0");
        // Desktop path does NOT touch the Service Worker.
        expect(checkForUpdateNow).not.toHaveBeenCalled();
        expect(checkForUpdate).toHaveBeenCalledOnce();
    });

    it("shows the up-to-date result with the current version", async () => {
        checkForUpdate.mockResolvedValue({
            status: "up-to-date",
            currentVersion: "0.56.0",
            latestVersion: "v0.56.0",
        });
        render(<UpdateCheckButton />);
        fireEvent.click(screen.getByTestId("about-check-update"));
        await waitFor(() =>
            expect(screen.getByTestId("about-update-status").textContent).toContain(
                "neueste Version",
            ),
        );
        expect(screen.queryByTestId("about-update-apply")).toBeNull();
    });

    it("shows the failure hint when the GitHub check errors", async () => {
        checkForUpdate.mockResolvedValue({ status: "error", currentVersion: "0.56.0" });
        render(<UpdateCheckButton />);
        fireEvent.click(screen.getByTestId("about-check-update"));
        await waitFor(() =>
            expect(screen.getByTestId("about-update-status").textContent).toContain(
                "fehlgeschlagen",
            ),
        );
    });
});

describe("formatRelativeTime (boundaries)", () => {
    const now = 1_000_000_000_000;
    it("formats seconds", () => {
        expect(formatRelativeTime(now - 30_000, now, "en")).toContain("second");
    });
    it("formats minutes", () => {
        expect(formatRelativeTime(now - 5 * 60_000, now, "en")).toContain("minute");
    });
    it("formats hours", () => {
        expect(formatRelativeTime(now - 2 * 3_600_000, now, "en")).toContain("hour");
    });
    it("formats days", () => {
        expect(formatRelativeTime(now - 3 * 86_400_000, now, "en")).toContain("day");
    });
    it("falls back to English for an invalid locale tag", () => {
        expect(formatRelativeTime(now - 2 * 3_600_000, now, "not a locale")).toContain("hour");
    });
});
