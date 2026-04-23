import { useI18n } from "../../../hooks/useI18n";
import type {
    DetectedProject,
    DuplicateInfo,
    Overrides,
} from "../../../api/import";
import { PreviewPanel } from "./PreviewPanel";

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
    // overrides + onOverridesChange are consumed by Commit 5; kept in
    // the signature so the wizard shell does not need to change when
    // the override UI lands.
    void overrides;
    void onOverridesChange;
    void duplicate;
    void duplicateAction;
    void onDuplicateActionChange;

    return (
        <div data-testid="preview-step">
            <PreviewPanel detected={detected} />
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
