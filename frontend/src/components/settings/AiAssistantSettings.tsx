import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { TokenInput } from "../../lib/components/TokenInput";
import { ComboboxSelect } from "../../lib/components/ComboboxSelect";
import { useAiModels } from "../../hooks/ai/useAiModels";
import { api } from "../../api/client";
import {
    aiChat,
    classifyAiClientError,
    isBrowserUnsupportedTestResult,
    listModels,
    providerSupportsBrowserTest,
    type AiErrorKind,
} from "../../ai/llmClient";
import { useStorageMode } from "../../storage/useStorageMode";
import { useI18n } from "../../hooks/useI18n";
import { AI_PROVIDER_PRESETS, AI_PROVIDER_IDS, getProviderPreset } from "../../utils/ai/aiProviders";
import {
    baseUrlForProvider,
    buildAiPatch,
    keyRequiringProviderIds,
    maskSecret,
    modelForProvider,
    normalizeAiConfig,
    providerHasKey,
    providerKeyStatus,
    type AiSettings,
} from "../../utils/ai/aiConfig";
import { notify } from "../../utils/platform/notify";
import styles from "../../pages/Settings.module.css";
import { RadixSelect } from "../RadixSelect";
import { useDialog } from "../AppDialog";
import {
    ConfiguredProvidersTable,
    type ProviderRow,
    type ProviderTestOutcome,
} from "./ConfiguredProvidersTable";
import { HelpText } from "./HelpText";
import { SectionHeader } from "./SectionHeader";
import { Toggle } from "./Toggle";
import { useSettingsAutoSave } from "./useSettingsAutoSave";

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

    // Canonical model derived from whatever shape the stored config has
    // (legacy single-key, #459 provider_keys, or active_provider+keys). Drives
    // the overview table + the active-provider pointer.
    const settings = normalizeAiConfig(aiConfig);

    // True when secrets are managed via ~/.config/bibliogon/secrets.yaml or
    // BIBLIOGON_AI_API_KEY. The backend strips api_key from PATCH bodies then;
    // we keep the table read-only and never send keys.
    const secretsExternal = Boolean(
        (config as Record<string, unknown>)._secrets_managed_externally,
    );

    // Form state edits ONE provider at a time. `aiProvider` is the provider
    // currently loaded into the form (defaults to the active provider); the
    // table's radio is the separate active_provider pointer.
    const [aiEnabled, setAiEnabled] = useState(settings.enabled);
    const [aiProvider, setAiProvider] = useState(settings.active_provider);
    const [aiBaseUrl, setAiBaseUrl] = useState("");
    const [aiModel, setAiModel] = useState("");
    const [aiApiKey, setAiApiKey] = useState("");
    const [aiTemp, setAiTemp] = useState(String(settings.temperature));
    const [aiMaxTokens, setAiMaxTokens] = useState(String(settings.max_tokens));
    const [aiTestStatus, setAiTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

    const { confirm } = useDialog();

    /** Load a provider's stored credentials (or preset defaults) into the form. */
    const fillForm = (s: AiSettings, id: string) => {
        const targetPreset = getProviderPreset(id);
        setAiBaseUrl(s.base_url_overrides[id] || targetPreset?.base_url || "");
        setAiModel(s.model_overrides[id] || targetPreset?.default_model || "");
        setAiApiKey(s.keys[id] || "");
    };

    useEffect(() => {
        const s = normalizeAiConfig((config.ai || {}) as Record<string, unknown>);
        setAiEnabled(s.enabled);
        setAiProvider(s.active_provider);
        setAiTemp(String(s.temperature));
        setAiMaxTokens(String(s.max_tokens));
        fillForm(s, s.active_provider);
    }, [config]);

    const preset = getProviderPreset(aiProvider);
    const requiresKey = preset?.requires_api_key ?? false;
    const missingKey = requiresKey && !aiApiKey.trim();

    /** Switch which provider the form edits (table edit/add + provider dropdown). */
    const loadProvider = (id: string) => {
        setAiProvider(id);
        fillForm(settings, id);
    };

    const providerRows: ProviderRow[] = keyRequiringProviderIds(AI_PROVIDER_IDS).map((id) => {
        const status = providerKeyStatus(id, settings, {
            offline,
            supportsBrowserTest: providerSupportsBrowserTest,
            secretsExternal,
        });
        const hasKey = providerHasKey(settings, id);
        const corsBlockedOffline = offline && !providerSupportsBrowserTest(id);
        return {
            id,
            label: t(`ui.settings.ai_provider_${id}`, AI_PROVIDER_PRESETS[id].label),
            model: hasKey ? modelForProvider(settings, id) : "",
            status,
            keyPreview: maskSecret(settings.keys[id]),
            isActive: id === settings.active_provider,
            canActivate: hasKey,
            canTest: hasKey && !corsBlockedOffline && !secretsExternal,
            testBlockedReason:
                hasKey && corsBlockedOffline
                    ? t("ui.settings.ai_test_desktop_only", "Nur in Desktop-App testbar")
                    : undefined,
        };
    });

    /** Lightweight per-row connection test: browser-direct GET /v1/models for
     *  the given provider's stored key. */
    const handleTestProvider = async (id: string): Promise<ProviderTestOutcome> => {
        const cfg = {
            provider: id,
            base_url: baseUrlForProvider(settings, id),
            model: modelForProvider(settings, id),
            api_key: settings.keys[id] || "",
        };
        try {
            await listModels(cfg);
            notify.success(t("ui.settings.ai_test_ok", "Verbindung erfolgreich"));
            return { ok: true, message: t("ui.settings.ai_test_ok_short", "Verbindung ok") };
        } catch (err) {
            const kind = classifyAiClientError(err);
            const message =
                kind === "cors"
                    ? offline && !providerSupportsBrowserTest(id)
                        ? t("ui.settings.ai_test_desktop_only", "Nur in Desktop-App testbar")
                        : t("ui.settings.ai_test_network", "Netzwerkfehler")
                    : aiErrorText(kind);
            notify.error(message, err);
            return { ok: false, message };
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

    /** Settings reflecting the current form edit for `aiProvider`, which also
     *  becomes the active provider on save. */
    const buildEditedSettings = (): AiSettings => {
        const next: AiSettings = {
            ...settings,
            keys: { ...settings.keys },
            model_overrides: { ...settings.model_overrides },
            base_url_overrides: { ...settings.base_url_overrides },
            enabled: aiEnabled,
            temperature: parseFloat(aiTemp) || 0.7,
            max_tokens: parseInt(aiMaxTokens) || 4096,
            active_provider: aiProvider,
        };
        if (requiresKey) {
            if (aiApiKey.trim()) next.keys[aiProvider] = aiApiKey;
            else delete next.keys[aiProvider];
        }
        if (aiModel) next.model_overrides[aiProvider] = aiModel;
        else delete next.model_overrides[aiProvider];
        if (aiBaseUrl && aiBaseUrl !== getProviderPreset(aiProvider)?.base_url) {
            next.base_url_overrides[aiProvider] = aiBaseUrl;
        } else {
            delete next.base_url_overrides[aiProvider];
        }
        return next;
    };

    const buildSaveData = () => buildAiPatch(buildEditedSettings());

    // Auto-save (#472): editing any field persists the current provider's
    // form (debounced). Switching the provider dropdown (loadProvider) and
    // the table radio (handleActivate) keep their own explicit paths.
    const triggerSave = useSettingsAutoSave(buildSaveData, onSave);

    /** Move the active_provider pointer; keys stay (the keystone). */
    const handleActivate = async (id: string) => {
        if (id === settings.active_provider) return;
        await onSave(buildAiPatch({ ...settings, active_provider: id }));
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
        const next: AiSettings = {
            ...settings,
            keys: { ...settings.keys },
            model_overrides: { ...settings.model_overrides },
            base_url_overrides: { ...settings.base_url_overrides },
        };
        delete next.keys[id];
        delete next.model_overrides[id];
        delete next.base_url_overrides[id];
        await onSave(buildAiPatch(next));
        if (id === aiProvider) setAiApiKey("");
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
                            onChange={(v) => { setAiEnabled(v); triggerSave(); }}
                            testId="ai-enabled"
                            indentedDescription
                        />
                    </div>

                    <div className="field" data-testid="ai-provider-keys-section">
                        <label className="label">
                            {t("ui.settings.ai_configured_providers", "Konfigurierte KI-Anbieter")}
                        </label>
                        <ConfiguredProvidersTable
                            rows={providerRows}
                            onActivate={handleActivate}
                            onEdit={loadProvider}
                            onDelete={handleDeleteProvider}
                            onTest={handleTestProvider}
                            readOnly={secretsExternal}
                        />
                        <HelpText>
                            {secretsExternal
                                ? t(
                                      "ui.settings.ai_api_key_external_note",
                                      "API-Schlüssel wird aus externer Konfiguration gelesen (~/.config/bibliogon/secrets.yaml oder Umgebungsvariable BIBLIOGON_AI_API_KEY). Editiere die Datei direkt oder setze die Umgebungsvariable, um den Schlüssel zu ändern.",
                                  )
                                : t(
                                      "ui.settings.ai_configured_providers_hint",
                                      "Übersicht der gespeicherten Schlüssel. Der Radiobutton wählt den aktiven Anbieter; zum Ändern oder Hinzufügen einen Anbieter unten konfigurieren.",
                                  )}
                        </HelpText>
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
                                onChange={(e) => { setAiBaseUrl(e.target.value); triggerSave(); }}
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
                                    onChange={(v) => { setAiModel(v); triggerSave(); }}
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
                                    onChange={(e) => { setAiTemp(e.target.value); triggerSave(); }}
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
                                    onChange={(e) => { setAiMaxTokens(e.target.value); triggerSave(); }}
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
                                    onChange={(v) => { setAiApiKey(v); triggerSave(); }}
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
                                            // a save-before-test would persist a half-edited config
                                            // over a working saved one. The user persists via Save.
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
