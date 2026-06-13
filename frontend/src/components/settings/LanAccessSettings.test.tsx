/**
 * Vitest coverage for the LAN-access Settings card (LAN-MODE-PHASE-1 C4b).
 *
 * Pins both contract branches: render the URL + PIN + QR when
 * /api/lan-auth/info resolves, and render NOTHING (LAN mode off)
 * when it rejects with a 404.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { FeatureTestProvider } from "../../features/FeatureTestProvider";
import { render, screen, waitFor } from "@testing-library/react";
import { LanAccessSettings } from "./LanAccessSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client");
    return {
        ...actual,
        api: {
            ...actual.api,
            lanAuth: { info: vi.fn() },
        },
    };
});

import { api, ApiError } from "../../api/client";

const INFO = {
    enabled: true,
    lan_ip: "192.168.1.5",
    port: 8000,
    url: "http://192.168.1.5:8000",
    pin: "424242",
};

afterEach(() => {
    vi.mocked(api.lanAuth.info).mockClear();
});

describe("LanAccessSettings", () => {
    it("renders URL, PIN and QR when LAN mode is active", async () => {
        vi.mocked(api.lanAuth.info).mockImplementation(async () => INFO);
        render(
            <FeatureTestProvider>
                <LanAccessSettings />
            </FeatureTestProvider>,
        );

        await waitFor(() => {
            expect(screen.getByTestId("lan-access-section")).toBeTruthy();
        });
        expect(screen.getByTestId("lan-access-url").textContent).toContain(
            "http://192.168.1.5:8000",
        );
        expect(screen.getByTestId("lan-access-pin").textContent).toContain("424242");
        const qr = screen.getByTestId("lan-access-qr") as HTMLImageElement;
        expect(qr.getAttribute("src")).toBe("/api/lan-auth/qr.svg");
    });

    it("shows the desktop-app notice (no QR/URL/PIN) in Dexie mode", () => {
        render(
            <FeatureTestProvider mode="dexie">
                <LanAccessSettings />
            </FeatureTestProvider>,
        );

        // Header stays visible; the short disabled notice replaces the full
        // QR/URL/PIN instructions, which are useless without a backend host.
        expect(screen.getByTestId("lan-access-header")).toBeTruthy();
        expect(screen.getByTestId("lan-access-disabled")).toBeTruthy();
        expect(screen.queryByTestId("lan-access-qr")).toBeNull();
        expect(screen.queryByTestId("lan-access-url")).toBeNull();
        expect(screen.queryByTestId("lan-access-pin")).toBeNull();
        // And it fires no /api/lan-auth request offline.
        expect(vi.mocked(api.lanAuth.info)).not.toHaveBeenCalled();
    });

    it("renders nothing when LAN mode is off (info 404s)", async () => {
        vi.mocked(api.lanAuth.info).mockImplementation(async () => {
            throw new ApiError(404, "Not Found", "/api/lan-auth/info", "GET");
        });
        const { container } = render(
            <FeatureTestProvider>
                <LanAccessSettings />
            </FeatureTestProvider>,
        );

        // The fetch settles to an error -> the section never mounts.
        await waitFor(() => {
            expect(vi.mocked(api.lanAuth.info)).toHaveBeenCalled();
        });
        expect(screen.queryByTestId("lan-access-section")).toBeNull();
        expect(container.textContent).toBe("");
    });
});
