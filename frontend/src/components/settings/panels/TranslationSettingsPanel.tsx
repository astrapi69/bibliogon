import {useState} from "react";
import {Save} from "lucide-react";
import {useI18n} from "../../../hooks/useI18n";
import styles from "../../../pages/Settings.module.css";
import {RadixSelect} from "../../RadixSelect";
import {TokenInput} from "../../../lib/components/TokenInput";

/** Custom panel for the translation plugin. Mostly exists to render
 *  ``provider`` as a dropdown and ``deepl_api_key`` through the shared
 *  ``TokenInput`` (masked secret field that does not trigger the browser
 *  password manager). The other four fields use the same typed inputs as
 *  the generic panel.
 */
export function TranslationSettingsPanel({settings, onSave}: {
    settings: Record<string, unknown>;
    onSave: (s: Record<string, unknown>) => void;
}) {
    const {t} = useI18n();
    const [provider, setProvider] = useState<string>(String(settings.provider || "deepl"));
    const [apiKey, setApiKey] = useState<string>(String(settings.deepl_api_key || ""));
    const [freeApi, setFreeApi] = useState<boolean>(
        settings.deepl_free_api === undefined ? true : Boolean(settings.deepl_free_api),
    );
    const [lmstudioUrl, setLmstudioUrl] = useState<string>(
        String(settings.lmstudio_url || "http://localhost:1234/v1"),
    );
    const [lmstudioModel, setLmstudioModel] = useState<string>(
        String(settings.lmstudio_model || "default"),
    );
    const [lmstudioTemperature, setLmstudioTemperature] = useState<number>(
        typeof settings.lmstudio_temperature === "number" ? settings.lmstudio_temperature : 0.3,
    );

    const handleSave = () => {
        onSave({
            ...settings,
            provider,
            deepl_api_key: apiKey,
            deepl_free_api: freeApi,
            lmstudio_url: lmstudioUrl,
            lmstudio_model: lmstudioModel,
            lmstudio_temperature: lmstudioTemperature,
        });
    };

    const providerOptions = [
        {value: "deepl", label: "DeepL"},
        {value: "lmstudio", label: "LMStudio"},
    ];

    return (
        <>
            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                {t("ui.settings.expand_settings", "Einstellungen")}
            </h4>
            <div className={styles.settingsGrid}>
                <div className="field">
                    <label className="label">{t("ui.translation.provider", "Anbieter")}</label>
                    <RadixSelect value={provider} onValueChange={setProvider} options={providerOptions} />
                </div>
                <div className="field">
                    <label className="label">{t("ui.translation.deepl_api_key", "DeepL API-Schlüssel")}</label>
                    <TokenInput
                        value={apiKey}
                        onChange={setApiKey}
                        placeholder={t("ui.translation.deepl_api_key_placeholder", "Optional, leer = LMStudio")}
                        showLabel={t("ui.common.show", "Anzeigen")}
                        hideLabel={t("ui.common.hide", "Verbergen")}
                    />
                </div>
                <div className="field">
                    <label className="label icon-row">
                        <input
                            type="checkbox"
                            checked={freeApi}
                            onChange={(e) => setFreeApi(e.target.checked)}
                        />
                        {t("ui.translation.deepl_free_api", "DeepL Free-API verwenden")}
                    </label>
                </div>
                <div className="field">
                    <label className="label">{t("ui.translation.lmstudio_url", "LMStudio URL")}</label>
                    <input
                        className="input"
                        type="text"
                        value={lmstudioUrl}
                        onChange={(e) => setLmstudioUrl(e.target.value)}
                    />
                </div>
                <div className="field">
                    <label className="label">{t("ui.translation.lmstudio_model", "LMStudio Modell")}</label>
                    <input
                        className="input"
                        type="text"
                        value={lmstudioModel}
                        onChange={(e) => setLmstudioModel(e.target.value)}
                    />
                </div>
                <div className="field">
                    <label className="label">{t("ui.translation.lmstudio_temperature", "LMStudio Temperatur")}</label>
                    <input
                        className="input"
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={lmstudioTemperature}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v)) setLmstudioTemperature(v);
                        }}
                    />
                </div>
            </div>
            <button className="btn btn-primary btn-sm mt-1" onClick={handleSave}>
                <Save size={12}/> {t("ui.common.save", "Speichern")}
            </button>
        </>
    );
}
