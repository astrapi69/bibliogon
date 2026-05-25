import {useEffect, useState} from "react";
import {Save} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import styles from "../../pages/Settings.module.css";
import {HelpText} from "./HelpText";
import {SectionHeader} from "./SectionHeader";

export function EditorSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const editorConfig = (config.editor || {}) as Record<string, unknown>;

    const [edAutosave, setEdAutosave] = useState(String(editorConfig.autosave_debounce_ms ?? 800));
    const [edDraftSave, setEdDraftSave] = useState(String(editorConfig.draft_save_debounce_ms ?? 2000));
    const [edDraftAge, setEdDraftAge] = useState(String(editorConfig.draft_max_age_days ?? 30));
    const [edAiChars, setEdAiChars] = useState(String(editorConfig.ai_context_chars ?? 2000));

    useEffect(() => {
        setEdAutosave(String(editorConfig.autosave_debounce_ms ?? 800));
        setEdDraftSave(String(editorConfig.draft_save_debounce_ms ?? 2000));
        setEdDraftAge(String(editorConfig.draft_max_age_days ?? 30));
        setEdAiChars(String(editorConfig.ai_context_chars ?? 2000));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    const buildSaveData = () => ({
        editor: {
            autosave_debounce_ms: parseInt(edAutosave) || 800,
            draft_save_debounce_ms: parseInt(edDraftSave) || 2000,
            draft_max_age_days: parseInt(edDraftAge) || 30,
            ai_context_chars: parseInt(edAiChars) || 2000,
        },
    });

    return (
        <div className={styles.section} data-testid="editor-settings">
            <SectionHeader
                title={t("ui.settings.editor_title", "Editor")}
                description={t("ui.settings.editor_description", "Autosave-Intervalle, Entwurfs-Aufbewahrung und KI-Kontextlimit.")}
            />
            <div className={styles.card}>
                <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_autosave", "Autosave (ms)")}</label>
                        <input className="input" type="number" min="200" max="5000" step="100"
                            data-testid="editor-autosave"
                            value={edAutosave} onChange={(e) => setEdAutosave(e.target.value)}/>
                        <HelpText>{t("ui.settings.editor_autosave_hint", "Verzoegerung bis zum automatischen Speichern")}</HelpText>
                    </div>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_draft_save", "Entwurf (ms)")}</label>
                        <input className="input" type="number" min="500" max="10000" step="500"
                            data-testid="editor-draft-save"
                            value={edDraftSave} onChange={(e) => setEdDraftSave(e.target.value)}/>
                        <HelpText>{t("ui.settings.editor_draft_hint", "Verzoegerung bis zur lokalen Sicherung")}</HelpText>
                    </div>
                </div>
                <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_draft_age", "Entwurf-Alter (Tage)")}</label>
                        <input className="input" type="number" min="1" max="365" step="1"
                            data-testid="editor-draft-age"
                            value={edDraftAge} onChange={(e) => setEdDraftAge(e.target.value)}/>
                        <HelpText>{t("ui.settings.editor_draft_age_hint", "Lokale Entwuerfe älter als dieser Wert werden gelöscht")}</HelpText>
                    </div>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_ai_chars", "KI-Kontext (Zeichen)")}</label>
                        <input className="input" type="number" min="500" max="32000" step="500"
                            data-testid="editor-ai-chars"
                            value={edAiChars} onChange={(e) => setEdAiChars(e.target.value)}/>
                        <HelpText>{t("ui.settings.editor_ai_chars_hint", "Maximale Zeichenanzahl für KI-Vorschläge")}</HelpText>
                    </div>
                </div>
                <button
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => onSave(buildSaveData())}
                    data-testid="editor-settings-save"
                    style={{marginTop: 12}}
                >
                    <Save size={14}/> {t("ui.common.save", "Speichern")}
                </button>
            </div>
        </div>
    );
}
