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

const confirmMock = vi.fn().mockResolvedValue(true);
vi.mock("../AppDialog", () => ({
    useDialog: () => ({
        confirm: confirmMock,
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

// Keep the real classifier + provider helpers; only stub the network call.
vi.mock("../../ai/llmClient", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../ai/llmClient")>();
    return { ...actual, aiChat: vi.fn() };
});

let aiModelsValue: {
    models: string[];
    loading: boolean;
    source: "live" | "fallback";
    reload: ReturnType<typeof vi.fn>;
};
vi.mock("../../hooks/useAiModels", () => ({
    useAiModels: () => aiModelsValue,
}));

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
    aiModelsValue = {
        models: ["gemini-2.0-flash", "gemini-2.5-pro"],
        loading: false,
        source: "live",
        reload: vi.fn(),
    };
    aiChatMock.mockReset();
    testConnectionMock.mockReset();
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
    vi.mocked(notify.success).mockReset();
    vi.mocked(notify.error).mockReset();
    vi.mocked(notify.info).mockReset();
});

describe("AiAssistantSettings — connection test (offline)", () => {
    it("Gemini: a successful browser-direct call reports success", async () => {
        aiChatMock.mockResolvedValue({
            content: "OK",
            model: "gemini-2.0-flash",
            usage: { total_tokens: 1 },
        });
        renderSettings({ provider: "google" });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith("Verbindung erfolgreich"));
        expect(notify.error).not.toHaveBeenCalled();
    });

    it("Gemini 404: honest 'Modell nicht verfügbar', not a blanket failure", async () => {
        aiChatMock.mockRejectedValue(
            new AiClientError("Provider responded 404", {
                status: 404,
                detail: "models/x is not found",
            }),
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
        renderSettings({
            provider: "anthropic",
            base_url: "https://api.anthropic.com/v1",
            model: "claude",
        });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.error).toHaveBeenCalled());
        expect(vi.mocked(notify.error).mock.calls[0][0]).toBe("API-Schlüssel ungültig");
    });

    it("OpenAI CORS failure: honest info message, NOT a 'failed' error toast", async () => {
        aiChatMock.mockRejectedValue(new AiClientError("Failed to fetch", { isNetwork: true }));
        renderSettings({
            provider: "openai",
            base_url: "https://api.openai.com/v1",
            model: "gpt-4o",
        });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.info).toHaveBeenCalled());
        expect(vi.mocked(notify.info).mock.calls[0][0]).toMatch(/Browser-Modus/);
        expect(notify.error).not.toHaveBeenCalled();
    });

    it("shows the browser-test advisory note for OpenAI but not for Gemini", () => {
        renderSettings({
            provider: "openai",
            base_url: "https://api.openai.com/v1",
            model: "gpt-4o",
        });
        expect(screen.getByTestId("ai-test-browser-note")).toBeInTheDocument();
    });

    it("hides the advisory note for a CORS-capable provider (Gemini)", () => {
        renderSettings({ provider: "google" });
        expect(screen.queryByTestId("ai-test-browser-note")).toBeNull();
    });

    it("disables the test button when a key-requiring provider has no key", () => {
        renderSettings({
            provider: "openai",
            base_url: "https://api.openai.com/v1",
            model: "gpt-4o",
            api_key: "",
        });
        expect(screen.getByTestId("ai-test")).toBeDisabled();
    });
});

describe("AiAssistantSettings — model selection", () => {
    it("shows the dynamically loaded models in the combobox", () => {
        renderSettings({ provider: "google" });
        const input = screen.getByTestId("ai-model") as HTMLInputElement;
        expect(input.value).toBe("gemini-2.0-flash");
        fireEvent.focus(input);
        expect(screen.getByTestId("ai-model-option-gemini-2.5-pro")).toBeInTheDocument();
    });

    it("the refresh button triggers a reload", () => {
        renderSettings({ provider: "google" });
        fireEvent.click(screen.getByTestId("ai-model-refresh"));
        expect(aiModelsValue.reload).toHaveBeenCalledTimes(1);
    });

    it("disables the model combobox + refresh when a key-requiring provider has no key", () => {
        renderSettings({
            provider: "openai",
            base_url: "https://api.openai.com/v1",
            model: "gpt-4o",
            api_key: "",
        });
        expect(screen.getByTestId("ai-model")).toBeDisabled();
        expect(screen.getByTestId("ai-model-refresh")).toBeDisabled();
    });

    it("accepts a manually typed model name (free-text combobox)", () => {
        renderSettings({ provider: "google" });
        const input = screen.getByTestId("ai-model") as HTMLInputElement;
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: "gemini-custom-x" } });
        fireEvent.keyDown(input, { key: "Enter" });
        // allowCustom commits the typed value via onChange(setAiModel); the
        // input reflects the committed custom model.
        expect((screen.getByTestId("ai-model") as HTMLInputElement).value).toBe("gemini-custom-x");
    });
});

describe("AiAssistantSettings — configured providers table", () => {
    it("shows a saved key (masked, first4...last4) after returning to the tab", () => {
        // Simulates: key saved earlier, navigate away, come back. The config
        // arrives with provider_keys; the table must surface it masked.
        renderSettings({
            provider: "google",
            api_key: "AIzaSyABCD1234efgh",
            provider_keys: {
                google: {
                    api_key: "AIzaSyABCD1234efgh",
                    model: "gemini-2.0-flash",
                    base_url: "u",
                },
            },
        });
        expect(screen.getByTestId("ai-provider-key-preview-google").textContent).toBe(
            "AIza...efgh",
        );
        expect(screen.getByTestId("ai-provider-status-google").textContent).toBe("Aktiv");
        // Active provider highlighted.
        expect(screen.getByTestId("ai-provider-row-google").getAttribute("data-active")).toBe(
            "true",
        );
    });

    it("lists every configured provider with its own preview", () => {
        renderSettings({
            provider: "google",
            api_key: "AIzaSyABCD1234efgh",
            provider_keys: {
                google: { api_key: "AIzaSyABCD1234efgh", model: "gemini-2.0-flash" },
                anthropic: { api_key: "sk-ant-9999zzzz", model: "claude-sonnet-4-6" },
            },
        });
        expect(screen.getByTestId("ai-provider-status-google").textContent).toBe("Aktiv");
        expect(screen.getByTestId("ai-provider-status-anthropic").textContent).toBe("Aktiv");
        // OpenAI / Mistral have no key -> Empty with an add button.
        expect(screen.getByTestId("ai-provider-status-openai").textContent).toBe("Leer");
        expect(screen.getByTestId("ai-provider-add-openai")).toBeInTheDocument();
    });

    it("PWA mode: a CORS-blocked provider with a key shows 'Nur Desktop'", () => {
        storageMode = "dexie";
        renderSettings({
            provider: "google",
            api_key: "k",
            provider_keys: { openai: { api_key: "sk-openai-12345678" } },
        });
        expect(screen.getByTestId("ai-provider-status-openai").textContent).toBe("Nur Desktop");
    });

    it("saving persists the active provider's key into provider_keys", async () => {
        // The end-to-end wiring: a save must carry provider_keys so the key
        // survives a navigate-away/return cycle.
        const { onSave } = renderSettings({
            provider: "google",
            api_key: "AIzaSyABCD1234efgh",
            model: "gemini-2.0-flash",
        });
        fireEvent.click(screen.getByTestId("ai-save"));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        const payload = onSave.mock.calls[0][0] as {
            ai: { provider_keys?: Record<string, { api_key: string }> };
        };
        expect(payload.ai.provider_keys?.google?.api_key).toBe("AIzaSyABCD1234efgh");
    });

    it("delete confirms, then saves with the provider removed from provider_keys", async () => {
        const { onSave } = renderSettings({
            provider: "anthropic",
            api_key: "sk-ant-active",
            model: "claude-sonnet-4-6",
            base_url: "https://api.anthropic.com/v1",
            provider_keys: {
                anthropic: { api_key: "sk-ant-active", model: "claude-sonnet-4-6" },
                google: { api_key: "AIzaSyABCD1234efgh", model: "gemini-2.0-flash" },
            },
        });
        fireEvent.click(screen.getByTestId("ai-provider-delete-google"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        const payload = onSave.mock.calls[0][0] as {
            ai: { provider_keys?: Record<string, unknown> };
        };
        expect(payload.ai.provider_keys?.google).toBeUndefined();
        expect(payload.ai.provider_keys?.anthropic).toBeDefined();
    });

    it("delete is aborted when the confirmation is declined", async () => {
        confirmMock.mockResolvedValue(false);
        const { onSave } = renderSettings({
            provider: "google",
            api_key: "k",
            provider_keys: { google: { api_key: "AIzaSyABCD1234efgh" } },
        });
        fireEvent.click(screen.getByTestId("ai-provider-delete-google"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(onSave).not.toHaveBeenCalled();
    });

    it("editing a row loads that provider's saved key into the form", () => {
        renderSettings({
            provider: "google",
            api_key: "AIzaSyABCD1234efgh",
            model: "gemini-2.0-flash",
            base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
            provider_keys: {
                google: { api_key: "AIzaSyABCD1234efgh", model: "gemini-2.0-flash" },
                anthropic: {
                    api_key: "sk-ant-9999zzzz",
                    model: "claude-sonnet-4-6",
                    base_url: "https://api.anthropic.com/v1",
                },
            },
        });
        fireEvent.click(screen.getByTestId("ai-provider-edit-anthropic"));
        const keyInput = screen.getByTestId("ai-api-key-input") as HTMLInputElement;
        expect(keyInput.value).toBe("sk-ant-9999zzzz");
    });

    it("hides the table when secrets are managed externally", () => {
        const config = {
            _secrets_managed_externally: true,
            ai: { enabled: true, provider: "google", api_key: "k", model: "gemini-2.0-flash" },
        };
        render(<AiAssistantSettings config={config} onSave={vi.fn()} saving={false} />);
        expect(screen.queryByTestId("ai-provider-keys-section")).toBeNull();
    });
});

describe("AiAssistantSettings — connection test (online)", () => {
    it("online mode uses the backend test for every provider", async () => {
        storageMode = "api";
        testConnectionMock.mockResolvedValue({ success: true, error_key: "", error_detail: "" });
        renderSettings({
            provider: "openai",
            base_url: "https://api.openai.com/v1",
            model: "gpt-4o",
        });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(testConnectionMock).toHaveBeenCalled());
        expect(aiChatMock).not.toHaveBeenCalled();
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith("Verbindung erfolgreich"));
    });
});
