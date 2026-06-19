import { useEffect, useState } from "react";
import { Save, Eye, EyeOff } from "lucide-react";
import { api } from "../../api/client";
import {
    aiChat,
    classifyAiClientError,
    providerSupportsBrowserTest,
    type AiErrorKind,
} from "../../ai/llmClient";
import { useStorageMode } from "../../storage/useStorageMode";
import { useI18n } from "../../hooks/useI18n";
import { AI_PROVIDER_PRESETS, AI_PROVIDER_IDS, getProviderPreset } from "../../utils/aiProviders";
import { notify } from "../../utils/notify";
import styles from "../../pages/Settings.module.css";
import { RadixSelect } from "../RadixSelect";
import { HelpText } from "./HelpText";
import { SectionHeader } from "./SectionHeader";
import { Toggle } from "./Toggle";

export function AiAssistantSettings({
    config,
    onSave,
    saving,
}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => Promise<void> | void;
    saving: boolean;
}) {
    const { t } = useI18n();
    const { mode } = useStorageMode();
    const offline = mode === "dexie";
    const aiConfig = (config.ai || {}) as Record<string, unknown>;

    const [aiEnabled, setAiEnabled] = useState(Boolean(aiConfig.enabled));
    const [aiProvider, setAiProvider] = useState((aiConfig.provider as string) || "lmstudio");
    const [aiBaseUrl, setAiBaseUrl] = useState((aiConfig.base_url as string) || "");
    const [aiModel, setAiModel] = useState((aiConfig.model as string) || "");
    const [aiTemp, setAiTemp] = useState(String(aiConfig.temperature ?? "0.7"));
    const [aiMaxTokens, setAiMaxTokens] = useState(String(aiConfig.max_tokens ?? "4096"));
    const [aiApiKey, setAiApiKey] = useState((aiConfig.api_key as string) || "");
    const [showAiKey, setShowAiKey] = useState(false);
    const [aiTestStatus, setAiTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

    useEffect(() => {
        setAiEnabled(Boolean(aiConfig.enabled));
        setAiProvider((aiConfig.provider as string) || "lmstudio");
        setAiBaseUrl((aiConfig.base_url as string) || "");
        setAiModel((aiConfig.model as string) || "");
        setAiTemp(String(aiConfig.temperature ?? "0.7"));
        setAiMaxTokens(String(aiConfig.max_tokens ?? "4096"));
        setAiApiKey((aiConfig.api_key as string) || "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    // True when secrets are managed via ~/.config/bibliogon/secrets.yaml
    // or BIBLIOGON_AI_API_KEY env-var. Backend strips api_key from
    // PATCH bodies in this case as defense-in-depth; we drop it here
    // so the frontend never sends it in the first place.
    const secretsExternal = Boolean(
        (config as Record<string, unknown>)._secrets_managed_externally,
    );

    const preset = getProviderPreset(aiProvider);
    const requiresKey = preset?.requires_api_key ?? false;
    const missingKey = requiresKey && !aiApiKey.trim();
    // Soft advisory only: some providers (OpenAI / Mistral) may not serve CORS
    // headers, so a browser-direct test can fail on the transport layer. We do
    // NOT disable the test (the runtime result is authoritative); we just warn.
    const browserTestUnreliable = offline && !providerSupportsBrowserTest(aiProvider);
    const testDisabled =
        saving || aiTestStatus === "testing" || !aiBaseUrl || missingKey;

    const browserUnsupportedMessage = t(
        "ui.settings.ai_test_browser_unsupported",
        "Ein Verbindungstest ist im Browser-Modus für diesen Anbieter evtl. nicht möglich. Der API-Schlüssel wird beim ersten KI-Aufruf geprüft.",
    );

    /** Localized honest message for a classified offline AI error. */
    const aiErrorText = (kind: AiErrorKind): string => {
        switch (kind) {
            case "auth_error":
                return t("ui.settings.ai_err_auth", "API-Schlüssel ungültig");
            case "rate_limited":
                return t(
                    "ui.settings.ai_err_rate",
                    "Rate Limit erreicht. Bitte später erneut versuchen.",
                );
            case "model_not_found":
                return t("ui.settings.ai_err_model", "Modell nicht verfügbar");
            case "invalid_request":
                return t("ui.settings.ai_err_invalid", "Ungültige Anfrage");
            case "server_error":
                return t("ui.settings.ai_err_server", "Server-Fehler beim Anbieter");
            default:
                return t("ui.settings.ai_test_fail", "Verbindung fehlgeschlagen");
        }
    };

    const buildSaveData = () => {
        const aiPayload: Record<string, unknown> = {
            enabled: aiEnabled,
            provider: aiProvider,
            base_url: aiBaseUrl,
            model: aiModel,
            temperature: parseFloat(aiTemp) || 0.7,
            max_tokens: parseInt(aiMaxTokens) || 4096,
        };
        if (!secretsExternal) {
            aiPayload.api_key = aiApiKey;
        }
        return { ai: aiPayload };
    };

    return (
        <div className={styles.main} data-testid="ai-assistant-settings">
            <div className={styles.section}>
                <SectionHeader
                    title={t("ui.settings.ai_title", "KI-Assistent")}
                    description={t(
                        "ui.settings.ai_description",
                        "Anbieter, API-Schlüssel und Modell für die KI-Funktionen im Editor.",
                    )}
                />
                <div className={styles.card}>
                    <div className="field">
                        <Toggle
                            label={t("ui.settings.ai_enable", "KI-Funktionen aktivieren")}
                            description={t(
                                "ui.settings.ai_enable_hint",
                                "Wenn deaktiviert, sind alle KI-Funktionen ausgeblendet.",
                            )}
                            checked={aiEnabled}
                            onChange={setAiEnabled}
                            testId="ai-enabled"
                            indentedDescription
                        />
                    </div>

                    <div
                        style={{
                            opacity: aiEnabled ? 1 : 0.4,
                            pointerEvents: aiEnabled ? "auto" : "none",
                        }}
                        aria-disabled={!aiEnabled}
                    >
                        <div className="field">
                            <label className="label">
                                {t("ui.settings.ai_provider", "KI-Anbieter")}
                            </label>
                            <RadixSelect
                                value={aiProvider}
                                onValueChange={(val) => {
                                    setAiProvider(val);
                                    const preset = getProviderPreset(val);
                                    // The "custom" preset has empty
                                    // base_url + default_model on purpose -
                                    // do not wipe the user's input. For all
                                    // other presets, auto-fill from the
                                    // preset so users land in a working
                                    // state with one click.
                                    if (preset && val !== "custom") {
                                        setAiBaseUrl(preset.base_url);
                                        setAiModel(preset.default_model);
                                        setAiApiKey("");
                                    }
                                }}
                                testId="ai-provider"
                                options={AI_PROVIDER_IDS.map((pid) => ({
                                    value: pid,
                                    label: t(
                                        `ui.settings.ai_provider_${pid}`,
                                        AI_PROVIDER_PRESETS[pid].label,
                                    ),
                                }))}
                            />
                        </div>
                        <div className="field">
                            <label className="label">
                                {t("ui.settings.ai_base_url", "Base URL")}
                            </label>
                            <input
                                className="input"
                                value={aiBaseUrl}
                                onChange={(e) => setAiBaseUrl(e.target.value)}
                                data-testid="ai-base-url"
                                placeholder="https://api.openai.com/v1"
                                style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}
                            />
                        </div>
                        <div className="field">
                            <label className="label">{t("ui.settings.ai_model", "Modell")}</label>
                            <input
                                className="input"
                                value={aiModel}
                                onChange={(e) => setAiModel(e.target.value)}
                                list="ai-model-suggestions"
                                data-testid="ai-model"
                                placeholder={
                                    aiProvider === "lmstudio"
                                        ? t(
                                              "ui.settings.ai_model_lmstudio",
                                              "Vom Server bereitgestellt",
                                          )
                                        : ""
                                }
                                style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}
                            />
                            <datalist id="ai-model-suggestions">
                                {(getProviderPreset(aiProvider)?.model_suggestions || []).map(
                                    (m) => (
                                        <option key={m} value={m} />
                                    ),
                                )}
                            </datalist>
                        </div>
                        <div style={{ display: "flex", gap: 12 }}>
                            <div className="field" style={{ flex: 1 }}>
                                <label className="label">
                                    {t("ui.settings.ai_temperature", "Temperature")}
                                </label>
                                <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    data-testid="ai-temperature"
                                    value={aiTemp}
                                    onChange={(e) => setAiTemp(e.target.value)}
                                />
                            </div>
                            <div className="field" style={{ flex: 1 }}>
                                <label className="label">
                                    {t("ui.settings.ai_max_tokens", "Max Tokens")}
                                </label>
                                <input
                                    className="input"
                                    type="number"
                                    min="256"
                                    max="32768"
                                    step="256"
                                    data-testid="ai-max-tokens"
                                    value={aiMaxTokens}
                                    onChange={(e) => setAiMaxTokens(e.target.value)}
                                />
                            </div>
                        </div>
                        {secretsExternal ? (
                            <div className="field" data-testid="ai-api-key-external-note">
                                <label className="label">
                                    {t("ui.settings.ai_api_key", "API Key")}
                                </label>
                                <div
                                    style={{
                                        padding: 12,
                                        border: "1px solid var(--border)",
                                        borderRadius: "var(--radius-sm)",
                                        background: "var(--bg-secondary)",
                                        color: "var(--text-muted)",
                                        fontSize: "0.8125rem",
                                    }}
                                >
                                    {t(
                                        "ui.settings.ai_api_key_external_note",
                                        "API-Schlüssel wird aus externer Konfiguration gelesen (~/.config/bibliogon/secrets.yaml oder Umgebungsvariable BIBLIOGON_AI_API_KEY). Editiere die Datei direkt oder setze die Umgebungsvariable, um den Schlüssel zu ändern.",
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="field">
                                <label className="label">
                                    {t("ui.settings.ai_api_key", "API Key")}
                                </label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input
                                        className="input"
                                        type={showAiKey ? "text" : "password"}
                                        data-testid="ai-api-key-input"
                                        value={aiApiKey}
                                        onChange={(e) => setAiApiKey(e.target.value)}
                                        placeholder={
                                            aiProvider === "lmstudio"
                                                ? t(
                                                      "ui.settings.ai_key_not_required",
                                                      "Nicht erforderlich",
                                                  )
                                                : "sk-..."
                                        }
                                        style={{
                                            flex: 1,
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.8125rem",
                                        }}
                                    />
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setShowAiKey(!showAiKey)}
                                        data-testid="ai-api-key-toggle"
                                        title={
                                            showAiKey
                                                ? t("ui.common.hide", "Ausblenden")
                                                : t("ui.common.show", "Anzeigen")
                                        }
                                    >
                                        {showAiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <HelpText>
                                    {t(
                                        "ui.settings.ai_key_hint",
                                        "Der API-Schlüssel wird nur lokal gespeichert und nur an den in 'Base URL' angegebenen Dienst übertragen.",
                                    )}
                                </HelpText>
                            </div>
                        )}
                        {aiProvider === "lmstudio" && (
                            <HelpText style={{ marginTop: 0, marginBottom: 8 }}>
                                {t(
                                    "ui.settings.ai_lmstudio_hint",
                                    "Lokal laufend, kein API-Schlüssel nötig. Modelle werden vom LM Studio Server bereitgestellt.",
                                )}
                            </HelpText>
                        )}
                        <div
                            style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}
                        >
                            <button
                                className="btn btn-primary"
                                disabled={saving}
                                onClick={() => onSave(buildSaveData())}
                                data-testid="ai-save"
                            >
                                <Save size={14} /> {t("ui.common.save", "Speichern")}
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={testDisabled}
                                title={browserTestUnreliable ? browserUnsupportedMessage : undefined}
                                data-testid="ai-test"
                                onClick={async () => {
                                    setAiTestStatus("testing");
                                    try {
                                        // Save current settings first so the backend sees the latest config
                                        await onSave(buildSaveData());

                                        if (offline) {
                                            // Offline: ping the provider directly from the browser
                                            // with the just-entered config (no backend round-trip).
                                            try {
                                                await aiChat(
                                                    {
                                                        provider: aiProvider,
                                                        base_url: aiBaseUrl,
                                                        model: aiModel,
                                                        api_key: aiApiKey,
                                                    },
                                                    [
                                                        {
                                                            role: "user",
                                                            content:
                                                                "Reply with the single word: OK",
                                                        },
                                                    ],
                                                    { maxTokens: 16 },
                                                );
                                                setAiTestStatus("ok");
                                                notify.success(
                                                    t(
                                                        "ui.settings.ai_test_ok",
                                                        "Verbindung erfolgreich",
                                                    ),
                                                );
                                            } catch (err) {
                                                // Classify honestly: a transport/CORS
                                                // failure is a browser limitation (not a
                                                // wrong key); a real HTTP error (401 bad
                                                // key, 404 bad model) gets its specific
                                                // message instead of "connection failed".
                                                const kind = classifyAiClientError(err);
                                                if (kind === "cors") {
                                                    setAiTestStatus("idle");
                                                    notify.info(browserUnsupportedMessage);
                                                } else {
                                                    setAiTestStatus("fail");
                                                    notify.error(aiErrorText(kind), err);
                                                }
                                            }
                                            setTimeout(() => setAiTestStatus("idle"), 3000);
                                            return;
                                        }

                                        const data = await api.ai.testConnection();
                                        if (data.success) {
                                            setAiTestStatus("ok");
                                            notify.success(
                                                t(
                                                    "ui.settings.ai_test_ok",
                                                    "Verbindung erfolgreich",
                                                ),
                                            );
                                        } else {
                                            const errorKey = data.error_key || "error";
                                            const detail = data.error_detail || "";
                                            setAiTestStatus("fail");
                                            const errorMessages: Record<string, string> = {
                                                auth_error: t(
                                                    "ui.settings.ai_err_auth",
                                                    "API-Schlüssel ungültig",
                                                ),
                                                rate_limited: t(
                                                    "ui.settings.ai_err_rate",
                                                    "Rate Limit erreicht. Bitte später erneut versuchen.",
                                                ),
                                                offline: t(
                                                    "ui.settings.ai_err_offline",
                                                    "Server nicht erreichbar",
                                                ),
                                                timeout: t(
                                                    "ui.settings.ai_err_timeout",
                                                    "Zeitüberschreitung",
                                                ),
                                                model_not_found: t(
                                                    "ui.settings.ai_err_model",
                                                    "Modell nicht verfügbar",
                                                ),
                                                invalid_request: t(
                                                    "ui.settings.ai_err_invalid",
                                                    "Ungültige Anfrage",
                                                ),
                                                server_error: t(
                                                    "ui.settings.ai_err_server",
                                                    "Server-Fehler beim Anbieter",
                                                ),
                                                disabled: t(
                                                    "ui.settings.ai_err_disabled",
                                                    "KI-Funktionen sind deaktiviert. Aktiviere sie unter Einstellungen > KI-Assistent.",
                                                ),
                                            };
                                            const baseMessage =
                                                errorMessages[errorKey] ||
                                                t(
                                                    "ui.settings.ai_test_fail",
                                                    "Verbindung fehlgeschlagen",
                                                );
                                            const fullMessage = detail
                                                ? `${baseMessage}: ${detail}`
                                                : baseMessage;
                                            notify.warning(fullMessage);
                                        }
                                    } catch (err) {
                                        setAiTestStatus("fail");
                                        notify.error(
                                            t(
                                                "ui.settings.ai_test_fail",
                                                "Verbindung fehlgeschlagen",
                                            ),
                                            err,
                                        );
                                    }
                                    setTimeout(() => setAiTestStatus("idle"), 3000);
                                }}
                            >
                                {aiTestStatus === "testing"
                                    ? t("ui.common.loading", "Laden...")
                                    : t("ui.settings.ai_test", "Verbindung testen")}
                            </button>
                        </div>
                        {browserTestUnreliable && (
                            <HelpText testId="ai-test-browser-note">
                                {browserUnsupportedMessage}
                            </HelpText>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
