/**
 * AiAssistantSettings — connection-test behavior (PWA / offline, issue follow-up
 * to #355 for the client-side path).
 *
 * Pins the honest error handling of "Verbindung testen": in offline (Dexie)
 * mode the test pings the provider browser-direct and must classify the real
 * result — a 404 as "model not found", a 401 as "invalid key", a transport/CORS
 * failure as a browser limitation (info, not a hard fail) — instead of a blanket
 * "Verbindung fehlgeschlagen". Online mode keeps using the backend test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiAssistantSettings } from "./AiAssistantSettings";
import { AiClientError } from "../../ai/llmClient";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

let storageMode: "api" | "dexie" = "dexie";
vi.mock("../../storage/useStorageMode", () => ({
    useStorageMode: () => ({ mode: storageMode }),
}));

vi.mock("../../utils/notify", () => ({
    notify: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock("../../api/client", () => ({
    api: { ai: { testConnection: vi.fn() } },
}));

// Keep the real classifier + provider helpers; only stub the network call.
vi.mock("../../ai/llmClient", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../ai/llmClient")>();
    return { ...actual, aiChat: vi.fn() };
});

import { aiChat } from "../../ai/llmClient";
import { api } from "../../api/client";
import { notify } from "../../utils/notify";

const aiChatMock = vi.mocked(aiChat);
const testConnectionMock = vi.mocked(api.ai.testConnection);

function renderSettings(aiOverrides: Record<string, unknown> = {}) {
    const config = {
        ai: {
            enabled: true,
            provider: "google",
            base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
            model: "gemini-2.0-flash",
            api_key: "k",
            ...aiOverrides,
        },
    };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AiAssistantSettings config={config} onSave={onSave} saving={false} />);
    return { onSave };
}

beforeEach(() => {
    storageMode = "dexie";
    aiChatMock.mockReset();
    testConnectionMock.mockReset();
    vi.mocked(notify.success).mockReset();
    vi.mocked(notify.error).mockReset();
    vi.mocked(notify.info).mockReset();
});

describe("AiAssistantSettings — connection test (offline)", () => {
    it("Gemini: a successful browser-direct call reports success", async () => {
        aiChatMock.mockResolvedValue({ content: "OK", model: "gemini-2.0-flash", usage: { total_tokens: 1 } });
        renderSettings({ provider: "google" });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith("Verbindung erfolgreich"));
        expect(notify.error).not.toHaveBeenCalled();
    });

    it("Gemini 404: honest 'Modell nicht verfügbar', not a blanket failure", async () => {
        aiChatMock.mockRejectedValue(
            new AiClientError("Provider responded 404", { status: 404, detail: "models/x is not found" }),
        );
        renderSettings({ provider: "google" });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.error).toHaveBeenCalled());
        expect(vi.mocked(notify.error).mock.calls[0][0]).toBe("Modell nicht verfügbar");
    });

    it("Anthropic 401: honest 'API-Schlüssel ungültig' (browser-direct reaches the provider)", async () => {
        aiChatMock.mockRejectedValue(
            new AiClientError("Provider responded 401", { status: 401, detail: "unauthorized" }),
        );
        renderSettings({ provider: "anthropic", base_url: "https://api.anthropic.com/v1", model: "claude" });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.error).toHaveBeenCalled());
        expect(vi.mocked(notify.error).mock.calls[0][0]).toBe("API-Schlüssel ungültig");
    });

    it("OpenAI CORS failure: honest info message, NOT a 'failed' error toast", async () => {
        aiChatMock.mockRejectedValue(new AiClientError("Failed to fetch", { isNetwork: true }));
        renderSettings({ provider: "openai", base_url: "https://api.openai.com/v1", model: "gpt-4o" });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.info).toHaveBeenCalled());
        expect(vi.mocked(notify.info).mock.calls[0][0]).toMatch(/Browser-Modus/);
        expect(notify.error).not.toHaveBeenCalled();
    });

    it("shows the browser-test advisory note for OpenAI but not for Gemini", () => {
        renderSettings({ provider: "openai", base_url: "https://api.openai.com/v1", model: "gpt-4o" });
        expect(screen.getByTestId("ai-test-browser-note")).toBeInTheDocument();
    });

    it("hides the advisory note for a CORS-capable provider (Gemini)", () => {
        renderSettings({ provider: "google" });
        expect(screen.queryByTestId("ai-test-browser-note")).toBeNull();
    });

    it("disables the test button when a key-requiring provider has no key", () => {
        renderSettings({ provider: "openai", base_url: "https://api.openai.com/v1", model: "gpt-4o", api_key: "" });
        expect(screen.getByTestId("ai-test")).toBeDisabled();
    });
});

describe("AiAssistantSettings — connection test (online)", () => {
    it("online mode uses the backend test for every provider", async () => {
        storageMode = "api";
        testConnectionMock.mockResolvedValue({ success: true, error_key: "", error_detail: "" });
        renderSettings({ provider: "openai", base_url: "https://api.openai.com/v1", model: "gpt-4o" });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(testConnectionMock).toHaveBeenCalled());
        expect(aiChatMock).not.toHaveBeenCalled();
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith("Verbindung erfolgreich"));
    });
});
