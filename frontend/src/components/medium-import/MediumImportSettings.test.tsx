import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MediumImportSettings from "./MediumImportSettings";
import { api, ApiError } from "../../api/client";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../../api/client", () => {
    class FakeApiError extends Error {
        constructor(
            public status: number,
            public detail: string,
            public endpoint: string = "",
            public method: string = "",
            public stacktrace: string = "",
        ) {
            super(detail);
            this.name = "ApiError";
        }
    }
    // Default implementations: getPlugin always resolves to an empty
    // settings object; updatePlugin always resolves to {}. Per-test
    // overrides via mockResolvedValueOnce / mockRejectedValueOnce.
    return {
        ApiError: FakeApiError,
        api: {
            settings: {
                getPlugin: vi.fn(async () => ({ settings: {} })),
                updatePlugin: vi.fn(async () => ({})),
            },
        },
    };
});

const getPluginMock = vi.mocked(api.settings.getPlugin);
const updatePluginMock = vi.mocked(api.settings.updatePlugin);

afterEach(() => {
    // Use mockClear (keeps the default implementation set in the
    // mock factory) instead of mockReset (which strips it).
    getPluginMock.mockClear();
    updatePluginMock.mockClear();
});

describe("MediumImportSettings", () => {
    it("loads existing settings and prefills the form", async () => {
        getPluginMock.mockImplementation(async () => ({
            settings: {
                download_images: false,
                image_download_timeout_seconds: 60,
                skip_existing_canonical_urls: false,
                default_status: "draft",
            },
        }));
        render(<MediumImportSettings />);
        await waitFor(() => {
            const checkbox = screen.getByTestId(
                "medium-import-settings-download-images",
            ) as HTMLInputElement;
            expect(checkbox.checked).toBe(false);
        });
        const timeout = screen.getByTestId(
            "medium-import-settings-timeout",
        ) as HTMLInputElement;
        expect(timeout.value).toBe("60");
        const select = screen.getByTestId(
            "medium-import-settings-default-status",
        ) as HTMLSelectElement;
        expect(select.value).toBe("draft");
    });

    it("falls back to defaults when the plugin config is missing (404)", async () => {
        getPluginMock.mockImplementation(async () => {
            throw new ApiError(404, "not found", "/api/settings/plugins/medium-import", "GET");
        });
        render(<MediumImportSettings />);
        await waitFor(() => {
            const checkbox = screen.getByTestId(
                "medium-import-settings-download-images",
            ) as HTMLInputElement;
            expect(checkbox.checked).toBe(true);
        });
    });

    it("saves the form via api.settings.updatePlugin", async () => {
        // Default mock implementation already returns {settings:{}};
        // no per-test override needed.
        render(<MediumImportSettings />);
        await waitFor(() => {
            expect(
                screen.getByTestId("medium-import-settings-save"),
            ).not.toBeDisabled();
        });
        fireEvent.click(screen.getByTestId("medium-import-settings-save"));
        await waitFor(() => {
            expect(updatePluginMock).toHaveBeenCalledWith("medium-import", {
                download_images: true,
                image_download_timeout_seconds: 30,
                skip_existing_canonical_urls: true,
                default_status: "published",
            });
        });
    });

    it("coerces a junk default_status from the backend to the safe default", async () => {
        getPluginMock.mockImplementation(async () => ({
            settings: { default_status: "weird-value-from-yaml-edit" },
        }));
        render(<MediumImportSettings />);
        await waitFor(() => {
            const select = screen.getByTestId(
                "medium-import-settings-default-status",
            ) as HTMLSelectElement;
            expect(select.value).toBe("published");
        });
    });
});
