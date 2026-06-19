import { useEffect, useState } from "react";
import { Save, RefreshCw } from "lucide-react";
import { TokenInput } from "../../lib/components/TokenInput";
import { ComboboxSelect } from "../../lib/components/ComboboxSelect";
import { useAiModels } from "../../hooks/useAiModels";
import { api } from "../../api/client";
import {
    aiChat,
    classifyAiClientError,
    isBrowserUnsupportedTestResult,
    providerSupportsBrowserTest,
    type AiErrorKind,
} from "../../ai/llmClient";
import { useStorageMode } from "../../storage/useStorageMode";
import { useI18n } from "../../hooks/useI18n";
import { AI_PROVIDER_PRESETS, AI_PROVIDER_IDS, getProviderPreset } from "../../utils/aiProviders";
import {
    effectiveProviderKeys,
    keyRequiringProviderIds,
    maskKeyPreview,
    providerStatus,
    type AiProviderKeysMap,
} from "../../utils/aiProviderKeys";
import { notify } from "../../utils/notify";
import styles from "../../pages/Settings.module.css";
import { RadixSelect } from "../RadixSelect";
import { useDialog } from "../AppDialog";
import { AiProviderKeysTable, type AiProviderKeyRow } from "./AiProviderKeysTable";
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

    const { confirm } = useDialog();

    const preset = getProviderPreset(aiProvider);
    const requiresKey = preset?.requires_api_key ?? false;
    const missingKey = requiresKey && !aiApiKey.trim();

    // Side-store of saved per-provider credentials, powering the overview
    // table. The top-level ai.* fields stay the single active config; the
    // active provider's legacy key is folded in for backward-compat.
    const providerKeys = effectiveProviderKeys(aiConfig);

    const providerRows: AiProviderKeyRow[] = keyRequiringProviderIds(AI_PROVIDER_IDS).map((id) => {
        const entry = providerKeys[id];
        return {
            id,
            label: t(`ui.settings.ai_provider_${id}`, AI_PROVIDER_PRESETS[id].label),
            model: entry?.model || "",
            status: providerStatus(id, providerKeys, {
                offline,
                supportsBrowserTest: providerSupportsBrowserTest,
            }),
            keyPreview: maskKeyPreview(entry?.api_key),
            isActive: id === aiProvider,
        };
    });

    /** Load a provider into the form, preferring its saved credentials. */
    const loadProvider = (id: string) => {
        setAiProvider(id);
        const targetPreset = getProviderPreset(id);
        const saved = providerKeys[id];
        if (saved && (saved.api_key || saved.model || saved.base_url)) {
            setAiBaseUrl(saved.base_url || targetPreset?.base_url || "");
            setAiModel(saved.model || targetPreset?.default_model || "");
            setAiApiKey(saved.api_key || "");
        } else if (targetPreset && id !== "custom") {
            setAiBaseUrl(targetPreset.base_url);
            setAiModel(targetPreset.default_model);
            setAiApiKey("");
        } else {
            setAiApiKey("");
        }
    };

    const {
        models: aiModels,
        loading: modelsLoading,
        reload: reloadModels,
    } = useAiModels({
        provider: aiProvider,
        baseUrl: aiBaseUrl,
        apiKey: aiApiKey,
        enabled: aiEnabled,
    });
    // Soft advisory only: some providers (OpenAI / Mistral) may not serve CORS
    // headers, so a browser-direct test can fail on the transport layer. We do
    // NOT disable the test (the runtime result is authoritative); we just warn.
    const browserTestUnreliable = offline && !providerSupportsBrowserTest(aiProvider);
    const testDisabled = saving || aiTestStatus === "testing" || !aiBaseUrl || missingKey;

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

    const buildAiPayload = (keys: AiProviderKeysMap): Record<string, unknown> => {
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
            aiPayload.provider_keys = keys;
        }
        return aiPayload;
    };

    const buildSaveData = () => {
        const keys = { ...providerKeys };
        if (requiresKey) {
            if (aiApiKey.trim()) {
                keys[aiProvider] = {
                    api_key: aiApiKey,
                    model: aiModel,
                    base_url: aiBaseUrl,
                };
            } else {
                delete keys[aiProvider];
            }
        }
        return { ai: buildAiPayload(keys) };
    };

    const handleDeleteProvider = async (id: string) => {
        const label = t(`ui.settings.ai_provider_${id}`, AI_PROVIDER_PRESETS[id]?.label ?? id);
        const ok = await confirm(
            t("ui.settings.ai_delete_key_title", "Schlüssel löschen"),
            t(
                "ui.settings.ai_delete_key_confirm",
                "Den gespeicherten API-Schlüssel für {provider} entfernen?",
            ).replace("{provider}", label),
            "danger",
        );
        if (!ok) return;
        const keys = { ...providerKeys };
        delete keys[id];
        const payload = buildAiPayload(keys);
        const clearActive = id === aiProvider;
        if (!secretsExternal && clearActive) {
            payload.api_key = "";
        }
        await onSave({ ai: payload });
        if (clearActive) setAiApiKey("");
        notify.success(t("ui.settings.ai_delete_key_done", "Schlüssel entfernt"));
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

                    {!secretsExternal && (
                        <div className="field" data-testid="ai-provider-keys-section">
                            <label className="label">
                                {t(
                                    "ui.settings.ai_configured_providers",
                                    "Konfigurierte KI-Anbieter",
                                )}
                            </label>
                            <AiProviderKeysTable
                                rows={providerRows}
                                onEdit={loadProvider}
                                onDelete={handleDeleteProvider}
                            />
                            <HelpText>
                                {t(
                                    "ui.settings.ai_configured_providers_hint",
                                    "Übersicht der gespeicherten Schlüssel. Zum Ändern oder Hinzufügen einen Anbieter auswählen und unten den Schlüssel eingeben.",
                                )}
                            </HelpText>
                        </div>
                    )}

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
                                onValueChange={loadProvider}
                                testId="ai-provider"
                                options={AI_PROVIDER_IDS.map((pid) => ({
                                    value: pid,
                                    label: t(
                                        `ui.settings.ai_provider_${pid}`,
                                        AI_PROVIDER_PRESETS[pid].label,
                                    ),
                                }))}
                            />
                            {browserTestUnreliable && (
                                <small
                                    className="mt-1 block text-[0.75rem] text-[var(--text-muted)]"
                                    data-testid="ai-provider-cors-note"
                                >
                                    {t(
                                        "ui.feature.provider_cors_blocked",
                                        "This AI provider can't be reached directly from the browser (CORS). Use the Bibliogon desktop app, or switch to Gemini.",
                                    )}
                                </small>
                            )}
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
                            <div className="flex items-center gap-2">
                                <ComboboxSelect
                                    options={aiModels.map((m) => ({ value: m, label: m }))}
                                    value={aiModel}
                                    onChange={setAiModel}
                                    allowCustom
                                    disabled={missingKey}
                                    testId="ai-model"
                                    placeholder={
                                        aiProvider === "lmstudio"
                                            ? t(
                                                  "ui.settings.ai_model_lmstudio",
                                                  "Vom Server bereitgestellt",
                                              )
                                            : ""
                                    }
                                />
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={reloadModels}
                                    disabled={modelsLoading || missingKey}
                                    title={t(
                                        "ui.settings.ai_model_refresh",
                                        "Modelle aktualisieren",
                                    )}
                                    aria-label={t(
                                        "ui.settings.ai_model_refresh",
                                        "Modelle aktualisieren",
                                    )}
                                    data-testid="ai-model-refresh"
                                >
                                    <RefreshCw
                                        size={14}
                                        className={modelsLoading ? "animate-spin" : undefined}
                                    />
                                </button>
                            </div>
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
                                <TokenInput
                                    value={aiApiKey}
                                    onChange={setAiApiKey}
                                    testId="ai-api-key-input"
                                    placeholder={
                                        aiProvider === "lmstudio"
                                            ? t(
                                                  "ui.settings.ai_key_not_required",
                                                  "Nicht erforderlich",
                                              )
                                            : "sk-..."
                                    }
                                    showLabel={t("ui.common.show", "Anzeigen")}
                                    hideLabel={t("ui.common.hide", "Ausblenden")}
                                />
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
                                title={
                                    browserTestUnreliable ? browserUnsupportedMessage : undefined
                                }
                                data-testid="ai-test"
                                onClick={async () => {
                                    setAiTestStatus("testing");
                                    try {
                                        if (offline) {
                                            // Offline: ping the provider directly from the browser
                                            // with the in-memory form values. Do NOT save first -
                                            // the offline test reads these values directly, and a
                                            // save-before-test would persist a half-edited config
                                            // (e.g. an empty key right after switching providers
                                            // clears the field) over a working saved one. The user
                                            // persists explicitly via Speichern.
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
                                                // Classify honestly. A provider that cannot be
                                                // reached browser-direct at all (OpenAI / Mistral:
                                                // CORS/403 by design) gets the honest "use the
                                                // desktop app or choose Gemini" hint, never a
                                                // wrong-key message. A genuine transport/CORS
                                                // failure is also a browser limitation; a real
                                                // HTTP error on a browser-capable provider (401
                                                // bad key, 404 bad model) keeps its specific
                                                // message.
                                                if (
                                                    isBrowserUnsupportedTestResult(
                                                        err,
                                                        browserTestUnreliable,
                                                    )
                                                ) {
                                                    setAiTestStatus("idle");
                                                    notify.info(browserUnsupportedMessage);
                                                } else {
                                                    setAiTestStatus("fail");
                                                    notify.error(
                                                        aiErrorText(classifyAiClientError(err)),
                                                        err,
                                                    );
                                                }
                                            }
                                            setTimeout(() => setAiTestStatus("idle"), 3000);
                                            return;
                                        }

                                        // Online: the backend tests against its saved config, so
                                        // persist the form first.
                                        await onSave(buildSaveData());
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
