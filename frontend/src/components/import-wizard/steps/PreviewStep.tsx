import { useI18n } from "../../../hooks/useI18n";
import type {
    DetectedProject,
    DuplicateInfo,
    Overrides,
} from "../../../api/import";
import { PreviewPanel } from "./PreviewPanel";
import { OverrideFields } from "./OverrideFields";

export function PreviewStep({
    detected,
    duplicate,
    overrides,
    duplicateAction,
    onOverridesChange,
    onDuplicateActionChange,
    onBack,
    onConfirm,
}: {
    detected: DetectedProject;
    duplicate: DuplicateInfo;
    overrides: Overrides;
    duplicateAction: "create" | "overwrite";
    onOverridesChange: (o: Overrides) => void;
    onDuplicateActionChange: (a: "create" | "overwrite" | "cancel") => void;
    onBack: () => void;
    onConfirm: () => void;
}) {
    const { t } = useI18n();
    // duplicate banner + action selector land in Commit 6; kept in
    // the signature so the wizard shell is stable.
    void duplicate;
    void duplicateAction;
    void onDuplicateActionChange;

    return (
        <div data-testid="preview-step">
            <PreviewPanel detected={detected} />
            <OverrideFields
                overrides={overrides}
                detectedTitle={detected.title}
                detectedAuthor={detected.author}
                detectedLanguage={detected.language}
                onChange={onOverridesChange}
            />
            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 20,
                    paddingTop: 16,
                    borderTop: "1px solid var(--border)",
                }}
            >
                <button
                    className="btn btn-secondary"
                    data-testid="preview-back"
                    onClick={onBack}
                >
                    {t("ui.import_wizard.button_back", "Back")}
                </button>
                <button
                    className="btn btn-primary"
                    data-testid="preview-confirm"
                    onClick={onConfirm}
                >
                    {t("ui.import_wizard.button_import", "Import")}
                </button>
            </div>
        </div>
    );
}
