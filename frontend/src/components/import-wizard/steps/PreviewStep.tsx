import { useI18n } from "../../../hooks/useI18n";
import type {
    DetectedProject,
    DuplicateInfo,
    Overrides,
} from "../../../api/import";
import { PreviewPanel } from "./PreviewPanel";
import { OverrideFields } from "./OverrideFields";
import { DuplicateBanner } from "./DuplicateBanner";

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

    return (
        <div data-testid="preview-step">
            <DuplicateBanner
                duplicate={duplicate}
                currentAction={duplicateAction}
                onActionChange={onDuplicateActionChange}
            />
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
