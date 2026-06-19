import {useEffect, useState} from "react";
import {Save, Trash2} from "lucide-react";
import {api} from "../../../api/client";
import {useI18n} from "../../../hooks/useI18n";
import {notify} from "../../../utils/notify";
import {HelpText} from "../HelpText";
import {TokenInput} from "../../../lib/components/TokenInput";

export function ElevenLabsKeyPanel() {
    const {t} = useI18n();
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [keyInput, setKeyInput] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.audiobook
            .getElevenLabsConfig()
            .then((r) => setConfigured(r.configured))
            .catch(() => setConfigured(false));
    }, []);

    const handleSave = async () => {
        if (!keyInput.trim()) return;
        setBusy(true);
        try {
            const r = await api.audiobook.setElevenLabsKey(keyInput.trim());
            setConfigured(true);
            setKeyInput("");
            const tier = r.tier ? ` (${r.tier})` : "";
            notify.success(
                t("ui.audiobook.elevenlabs_saved", "ElevenLabs-Schlüssel gespeichert") + tier,
            );
        } catch (err) {
            notify.error(
                t("ui.audiobook.elevenlabs_save_failed", "ElevenLabs-Schlüssel konnte nicht gespeichert werden"),
                err,
            );
        }
        setBusy(false);
    };

    const handleTest = async () => {
        if (!keyInput.trim()) {
            notify.error(t("ui.audiobook.elevenlabs_empty", "Bitte API-Key eingeben"));
            return;
        }
        setBusy(true);
        try {
            const r = await api.audiobook.setElevenLabsKey(keyInput.trim());
            notify.success(
                t("ui.audiobook.elevenlabs_test_ok", "API-Key gültig") +
                    (r.tier ? ` (${r.tier})` : ""),
            );
            setConfigured(true);
            setKeyInput("");
        } catch (err) {
            notify.error(t("ui.audiobook.elevenlabs_test_failed", "API-Key ungültig"), err);
        }
        setBusy(false);
    };

    const handleRemove = async () => {
        setBusy(true);
        try {
            await api.audiobook.deleteElevenLabsKey();
            setConfigured(false);
            notify.success(t("ui.audiobook.elevenlabs_removed", "ElevenLabs-Schlüssel entfernt"));
        } catch (err) {
            notify.error(
                t("ui.audiobook.elevenlabs_remove_failed", "Schlüssel konnte nicht entfernt werden"),
                err,
            );
        }
        setBusy(false);
    };

    return (
        <div style={{
            marginTop: 24, paddingTop: 16,
            borderTop: "1px solid var(--border)",
        }}>
            <h4 style={{
                fontSize: "0.8125rem", fontWeight: 600,
                color: "var(--text-muted)", marginBottom: 8,
            }}>
                {t("ui.audiobook.api_keys", "API-Keys")}
            </h4>
            <div className="field">
                <label className="label">
                    {t("ui.audiobook.elevenlabs_key", "ElevenLabs API-Key")}
                </label>
                <TokenInput
                    value={keyInput}
                    onChange={setKeyInput}
                    disabled={busy}
                    placeholder={configured ? t("ui.audiobook.elevenlabs_stored", "********** (gespeichert)") : "sk_..."}
                    showLabel={t("ui.common.show", "Anzeigen")}
                    hideLabel={t("ui.common.hide", "Ausblenden")}
                />
                <HelpText>
                    {t(
                        "ui.audiobook.elevenlabs_hint",
                        "Nur nötig für ElevenLabs Engine. Kostenloses Konto auf elevenlabs.io, API-Key im Profil generieren.",
                    )}
                </HelpText>
                {configured === true && (
                    <div style={{fontSize: "0.75rem", color: "var(--accent)", marginTop: 4}}>
                        {t("ui.audiobook.elevenlabs_configured", "Schlüssel hinterlegt.")}
                    </div>
                )}
            </div>
            <div style={{display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap"}}>
                <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleTest}
                    disabled={busy || !keyInput.trim()}
                >
                    {t("ui.audiobook.elevenlabs_test", "Testen")}
                </button>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={busy || !keyInput.trim()}
                >
                    <Save size={12}/> {t("ui.common.save", "Speichern")}
                </button>
                {configured && (
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleRemove}
                        disabled={busy}
                        style={{color: "var(--danger, #c0392b)"}}
                    >
                        <Trash2 size={12}/>{" "}
                        {t("ui.audiobook.elevenlabs_remove", "Entfernen")}
                    </button>
                )}
            </div>
        </div>
    );
}
