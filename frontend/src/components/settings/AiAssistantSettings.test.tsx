/**
 * AiAssistantSettings — connection-test behavior + the configured-providers
 * overview (issue #460: active_provider + keys shape).
 *
 * Connection test: offline (Dexie) pings the provider browser-direct and
 * classifies the real result honestly; online uses the backend test.
 *
 * Table: shows the canonical per-provider keys with masked previews, the
 * active-provider radio (the keystone: switching only moves the pointer), and
 * edit / delete / add actions.
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
    notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
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

vi.mock("../../ai/llmClient", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../ai/llmClient")>();
    return { ...actual, aiChat: vi.fn(), listModels: vi.fn() };
});

let aiModelsValue: {
    models: string[];
    loading: boolean;
    source: "live" | "fallback";
    reload: ReturnType<typeof vi.fn>;
};
vi.mock("../../hooks/ai/useAiModels", () => ({
    useAiModels: () => aiModelsValue,
}));

import { aiChat, listModels } from "../../ai/llmClient";
import { api } from "../../api/client";
import { notify } from "../../utils/notify";

const aiChatMock = vi.mocked(aiChat);
const listModelsMock = vi.mocked(listModels);
const testConnectionMock = vi.mocked(api.ai.testConnection);

function renderSettings(
    aiOverrides: Record<string, unknown> = {},
    root: Record<string, unknown> = {},
) {
    const config = {
        ai: {
            enabled: true,
            active_provider: "google",
            keys: { google: "AIzaSyABCD1234efgh" },
            model_overrides: { google: "gemini-2.0-flash" },
            ...aiOverrides,
        },
        ...root,
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
    listModelsMock.mockReset();
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
        renderSettings();
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith("Verbindung erfolgreich"));
        expect(notify.error).not.toHaveBeenCalled();
    });

    it("Gemini 404: honest 'Modell nicht verfügbar'", async () => {
        aiChatMock.mockRejectedValue(
            new AiClientError("Provider responded 404", {
                status: 404,
                detail: "models/x is not found",
            }),
        );
        renderSettings();
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.error).toHaveBeenCalled());
        expect(vi.mocked(notify.error).mock.calls[0][0]).toBe("Modell nicht verfügbar");
    });

    it("Anthropic 401: honest 'API-Schlüssel ungültig'", async () => {
        aiChatMock.mockRejectedValue(
            new AiClientError("Provider responded 401", { status: 401, detail: "unauthorized" }),
        );
        renderSettings({ active_provider: "anthropic", keys: { anthropic: "a-key" } });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.error).toHaveBeenCalled());
        expect(vi.mocked(notify.error).mock.calls[0][0]).toBe("API-Schlüssel ungültig");
    });

    it("genuine transport/CORS failure: honest info message, NOT a 'failed' error toast", async () => {
        aiChatMock.mockRejectedValue(new AiClientError("Failed to fetch", { isNetwork: true }));
        renderSettings({ active_provider: "openai", keys: { openai: "o-key" } });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(notify.info).toHaveBeenCalled());
        expect(vi.mocked(notify.info).mock.calls[0][0]).toMatch(/Browser-Modus/);
        expect(notify.error).not.toHaveBeenCalled();
    });

    it("no longer shows the browser-test advisory note for OpenAI (browser-capable, #467)", () => {
        renderSettings({ active_provider: "openai", keys: { openai: "o-key" } });
        expect(screen.queryByTestId("ai-test-browser-note")).toBeNull();
    });

    it("hides the advisory note for a CORS-capable provider (Gemini)", () => {
        renderSettings();
        expect(screen.queryByTestId("ai-test-browser-note")).toBeNull();
    });

    it("disables the test button when a key-requiring provider has no key", () => {
        renderSettings({ active_provider: "openai", keys: {} });
        expect(screen.getByTestId("ai-test")).toBeDisabled();
    });
});

describe("AiAssistantSettings — model selection", () => {
    it("shows the dynamically loaded models in the combobox", () => {
        renderSettings();
        const input = screen.getByTestId("ai-model") as HTMLInputElement;
        expect(input.value).toBe("gemini-2.0-flash");
        fireEvent.focus(input);
        expect(screen.getByTestId("ai-model-option-gemini-2.5-pro")).toBeInTheDocument();
    });

    it("the refresh button triggers a reload", () => {
        renderSettings();
        fireEvent.click(screen.getByTestId("ai-model-refresh"));
        expect(aiModelsValue.reload).toHaveBeenCalledTimes(1);
    });

    it("disables the model combobox + refresh when a key-requiring provider has no key", () => {
        renderSettings({ active_provider: "openai", keys: {} });
        expect(screen.getByTestId("ai-model")).toBeDisabled();
        expect(screen.getByTestId("ai-model-refresh")).toBeDisabled();
    });
});

describe("AiAssistantSettings — configured providers table", () => {
    it("shows a saved key (masked, first4...last4) with active highlight + radio", () => {
        renderSettings();
        expect(screen.getByTestId("ai-provider-key-preview-google").textContent).toBe(
            "AIza...efgh",
        );
        expect(screen.getByTestId("ai-provider-status-google").textContent).toBe("Aktiv");
        expect(screen.getByTestId("ai-provider-row-google").getAttribute("data-active")).toBe(
            "true",
        );
        expect(
            (screen.getByTestId("ai-provider-activate-google") as HTMLInputElement).checked,
        ).toBe(true);
    });

    it("lists multiple configured providers, each with its own preview", () => {
        renderSettings({
            active_provider: "google",
            keys: { google: "AIzaSyABCD1234efgh", anthropic: "sk-ant-9999zzzz" },
            model_overrides: { google: "gemini-2.0-flash", anthropic: "claude-sonnet-4-6" },
        });
        expect(screen.getByTestId("ai-provider-status-google").textContent).toBe("Aktiv");
        expect(screen.getByTestId("ai-provider-status-anthropic").textContent).toBe("Aktiv");
        expect(screen.getByTestId("ai-provider-status-openai").textContent).toBe("Leer");
        expect(screen.getByTestId("ai-provider-add-openai")).toBeInTheDocument();
    });

    it("PWA mode: OpenAI with a key shows 'Aktiv' (browser-capable, #467)", () => {
        renderSettings({
            active_provider: "google",
            keys: { google: "k", openai: "sk-openai-12345678" },
        });
        expect(screen.getByTestId("ai-provider-status-openai").textContent).toBe("Aktiv");
    });

    it("migrates + shows a legacy single-key config in the table", () => {
        // No canonical keys; only the legacy top-level api_key.
        renderSettings({
            active_provider: undefined,
            keys: undefined,
            model_overrides: undefined,
            provider: "google",
            api_key: "AIzaLEGACYkey9999",
            model: "gemini-2.0-flash",
        });
        expect(screen.getByTestId("ai-provider-key-preview-google").textContent).toBe(
            "AIza...9999",
        );
        expect(screen.getByTestId("ai-provider-status-google").textContent).toBe("Aktiv");
    });

    it("saving persists the canonical keys + a derived top-level mirror", async () => {
        const { onSave } = renderSettings();
        fireEvent.click(screen.getByTestId("ai-save"));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        const payload = onSave.mock.calls[0][0] as {
            ai: {
                keys?: Record<string, string>;
                provider?: string;
                api_key?: string;
                active_provider?: string;
            };
        };
        expect(payload.ai.keys?.google).toBe("AIzaSyABCD1234efgh");
        expect(payload.ai.active_provider).toBe("google");
        // mirror for the backend / legacy readers
        expect(payload.ai.provider).toBe("google");
        expect(payload.ai.api_key).toBe("AIzaSyABCD1234efgh");
    });

    it("the keystone: activating a provider only moves the pointer, keys stay", async () => {
        const { onSave } = renderSettings({
            active_provider: "google",
            keys: { google: "AIzaSyABCD1234efgh", anthropic: "sk-ant-9999zzzz" },
        });
        fireEvent.click(screen.getByTestId("ai-provider-activate-anthropic"));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        const payload = onSave.mock.calls[0][0] as {
            ai: { active_provider?: string; keys?: Record<string, string> };
        };
        expect(payload.ai.active_provider).toBe("anthropic");
        expect(payload.ai.keys?.google).toBe("AIzaSyABCD1234efgh");
        expect(payload.ai.keys?.anthropic).toBe("sk-ant-9999zzzz");
    });

    it("an empty provider's activate radio is disabled", () => {
        renderSettings();
        expect(screen.getByTestId("ai-provider-activate-openai")).toBeDisabled();
    });

    it("delete confirms, then saves with the provider removed from keys", async () => {
        const { onSave } = renderSettings({
            active_provider: "anthropic",
            keys: { anthropic: "sk-ant-active", google: "AIzaSyABCD1234efgh" },
        });
        fireEvent.click(screen.getByTestId("ai-provider-delete-google"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        const payload = onSave.mock.calls[0][0] as { ai: { keys?: Record<string, string> } };
        expect(payload.ai.keys?.google).toBeUndefined();
        expect(payload.ai.keys?.anthropic).toBe("sk-ant-active");
    });

    it("delete is aborted when the confirmation is declined", async () => {
        confirmMock.mockResolvedValue(false);
        const { onSave } = renderSettings();
        fireEvent.click(screen.getByTestId("ai-provider-delete-google"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(onSave).not.toHaveBeenCalled();
    });

    it("editing a row loads that provider's saved key into the form", () => {
        renderSettings({
            active_provider: "google",
            keys: { google: "AIzaSyABCD1234efgh", anthropic: "sk-ant-9999zzzz" },
            model_overrides: { anthropic: "claude-sonnet-4-6" },
        });
        fireEvent.click(screen.getByTestId("ai-provider-edit-anthropic"));
        expect((screen.getByTestId("ai-api-key-input") as HTMLInputElement).value).toBe(
            "sk-ant-9999zzzz",
        );
    });

    it("external secrets: shows 'Extern verwaltet' and a read-only table", () => {
        renderSettings(
            { active_provider: "google", keys: {} },
            { _secrets_managed_externally: true },
        );
        expect(screen.getByTestId("ai-provider-status-google").textContent).toBe(
            "Extern verwaltet",
        );
        expect(screen.getByTestId("ai-provider-activate-google")).toBeDisabled();
        expect(screen.getByTestId("ai-api-key-external-note")).toBeInTheDocument();
    });
});

describe("AiAssistantSettings — per-row provider test (#462)", () => {
    it("Gemini key: a successful GET /v1/models reports 'Verbindung ok' inline", async () => {
        listModelsMock.mockResolvedValue(["gemini-2.0-flash"]);
        renderSettings();
        fireEvent.click(screen.getByTestId("ai-provider-test-google"));
        await waitFor(() =>
            expect(screen.getByTestId("ai-provider-test-result-google").textContent).toBe(
                "Verbindung ok",
            ),
        );
        expect(notify.success).toHaveBeenCalledWith("Verbindung erfolgreich");
    });

    it("invalid key: reports 'API-Schlüssel ungültig' inline", async () => {
        listModelsMock.mockRejectedValue(
            new AiClientError("401", { status: 401, detail: "unauthorized" }),
        );
        renderSettings();
        fireEvent.click(screen.getByTestId("ai-provider-test-google"));
        await waitFor(() =>
            expect(screen.getByTestId("ai-provider-test-result-google").textContent).toBe(
                "API-Schlüssel ungültig",
            ),
        );
        expect(notify.error).toHaveBeenCalled();
    });

    it("a provider with no key has no Test button (only add)", () => {
        renderSettings({ active_provider: "google", keys: { google: "k" } });
        expect(screen.queryByTestId("ai-provider-test-openai")).toBeNull();
        expect(screen.getByTestId("ai-provider-add-openai")).toBeInTheDocument();
    });

    it("OpenAI in PWA mode: Test button enabled (browser-capable, #467)", () => {
        renderSettings({ active_provider: "google", keys: { google: "k", openai: "o-key" } });
        const btn = screen.getByTestId("ai-provider-test-openai");
        expect(btn).not.toBeDisabled();
    });

    it("shows a spinner ('Teste...') while the test is in flight", async () => {
        let resolve!: (v: string[]) => void;
        listModelsMock.mockReturnValue(new Promise<string[]>((r) => (resolve = r)));
        renderSettings();
        fireEvent.click(screen.getByTestId("ai-provider-test-google"));
        await waitFor(() =>
            expect(screen.getByTestId("ai-provider-test-google").textContent).toContain("Teste..."),
        );
        expect(screen.getByTestId("ai-provider-test-google")).toBeDisabled();
        resolve(["gemini-2.0-flash"]);
    });
});

describe("AiAssistantSettings — connection test (online)", () => {
    it("online mode uses the backend test for every provider", async () => {
        storageMode = "api";
        testConnectionMock.mockResolvedValue({ success: true, error_key: "", error_detail: "" });
        renderSettings({ active_provider: "openai", keys: { openai: "o-key" } });
        fireEvent.click(screen.getByTestId("ai-test"));
        await waitFor(() => expect(testConnectionMock).toHaveBeenCalled());
        expect(aiChatMock).not.toHaveBeenCalled();
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith("Verbindung erfolgreich"));
    });
});
