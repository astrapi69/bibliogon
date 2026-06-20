/**
 * useAiModels — dynamic AI model loading with preset fallback + 1h cache (#451).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Keep providerSupportsBrowserTest real; stub only the network call.
vi.mock("../../ai/llmClient", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../ai/llmClient")>();
    return { ...actual, listModels: vi.fn() };
});

import { listModels } from "../../ai/llmClient";
import { getProviderPreset } from "../../utils/ai/aiProviders";
import { useAiModels } from "./useAiModels";

const listModelsMock = vi.mocked(listModels);

beforeEach(() => {
    sessionStorage.clear();
    listModelsMock.mockReset();
});

const googleFallback = getProviderPreset("google")?.model_suggestions ?? [];

describe("useAiModels", () => {
    it("loads live models for a CORS-capable provider with a key", async () => {
        listModelsMock.mockResolvedValue(["gemini-2.0-flash", "gemini-2.5-pro"]);
        const { result } = renderHook(() =>
            useAiModels({ provider: "google", baseUrl: "https://g/v1", apiKey: "AIzaXYZ" }),
        );
        await waitFor(() => expect(result.current.source).toBe("live"));
        expect(result.current.models).toEqual(["gemini-2.0-flash", "gemini-2.5-pro"]);
    });

    it("falls back to preset suggestions when the provider call fails", async () => {
        listModelsMock.mockRejectedValue(new Error("CORS"));
        const { result } = renderHook(() =>
            useAiModels({ provider: "google", baseUrl: "https://g/v1", apiKey: "AIzaXYZ" }),
        );
        await waitFor(() => expect(listModelsMock).toHaveBeenCalled());
        await waitFor(() => expect(result.current.source).toBe("fallback"));
        expect(result.current.models).toEqual(googleFallback);
    });

    it("loads live models for OpenAI now that it is browser-capable (#467)", async () => {
        // #467: OpenAI is no longer CORS-blocked, so it loads live like Gemini.
        listModelsMock.mockResolvedValue(["gpt-4o", "gpt-4o-mini"]);
        const { result } = renderHook(() =>
            useAiModels({
                provider: "openai",
                baseUrl: "https://api.openai.com/v1",
                apiKey: "sk-x",
            }),
        );
        await waitFor(() => expect(result.current.source).toBe("live"));
        expect(result.current.models).toEqual(["gpt-4o", "gpt-4o-mini"]);
        expect(listModelsMock).toHaveBeenCalled();
    });

    it("loads live models for Mistral now that it is browser-capable (#467)", async () => {
        listModelsMock.mockResolvedValue(["mistral-large-latest", "mistral-small-latest"]);
        const { result } = renderHook(() =>
            useAiModels({
                provider: "mistral",
                baseUrl: "https://api.mistral.ai/v1",
                apiKey: "m-key",
            }),
        );
        await waitFor(() => expect(result.current.source).toBe("live"));
        expect(result.current.models).toEqual(["mistral-large-latest", "mistral-small-latest"]);
        expect(listModelsMock).toHaveBeenCalled();
    });

    it("does not call the provider when a key-requiring provider has no key", async () => {
        const { result } = renderHook(() =>
            useAiModels({ provider: "google", baseUrl: "https://g/v1", apiKey: "" }),
        );
        await waitFor(() => expect(result.current.models).toEqual(googleFallback));
        expect(listModelsMock).not.toHaveBeenCalled();
    });

    it("reloads with the new provider's models when the provider changes", async () => {
        listModelsMock.mockResolvedValue(["gemini-2.0-flash"]);
        const { result, rerender } = renderHook((props) => useAiModels(props), {
            initialProps: { provider: "google", baseUrl: "https://g/v1", apiKey: "AIzaXYZ" },
        });
        await waitFor(() => expect(result.current.source).toBe("live"));

        listModelsMock.mockResolvedValue(["claude-sonnet-4-6"]);
        rerender({ provider: "anthropic", baseUrl: "https://a/v1", apiKey: "skey" });
        await waitFor(() => expect(result.current.models).toEqual(["claude-sonnet-4-6"]));
        expect(listModelsMock.mock.calls.at(-1)?.[0].provider).toBe("anthropic");
    });

    it("invalidates the cache and reloads when the key changes", async () => {
        listModelsMock.mockResolvedValue(["gemini-2.0-flash"]);
        const { rerender, result } = renderHook((props) => useAiModels(props), {
            initialProps: { provider: "google", baseUrl: "https://g/v1", apiKey: "AIzaAAA" },
        });
        await waitFor(() => expect(result.current.source).toBe("live"));
        expect(listModelsMock).toHaveBeenCalledTimes(1);

        rerender({ provider: "google", baseUrl: "https://g/v1", apiKey: "AIzaBBB" });
        await waitFor(() => expect(listModelsMock).toHaveBeenCalledTimes(2));
    });

    it("serves a cached list on remount with the same provider/key (no refetch)", async () => {
        listModelsMock.mockResolvedValue(["gemini-2.0-flash"]);
        const first = renderHook(() =>
            useAiModels({ provider: "google", baseUrl: "https://g/v1", apiKey: "AIzaAAA" }),
        );
        await waitFor(() => expect(first.result.current.source).toBe("live"));
        expect(listModelsMock).toHaveBeenCalledTimes(1);
        first.unmount();

        const second = renderHook(() =>
            useAiModels({ provider: "google", baseUrl: "https://g/v1", apiKey: "AIzaAAA" }),
        );
        await waitFor(() => expect(second.result.current.models).toEqual(["gemini-2.0-flash"]));
        expect(listModelsMock).toHaveBeenCalledTimes(1);
    });
});
