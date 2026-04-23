import type { DetectedProject, DuplicateInfo, Overrides } from "../../../api/import";

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
    void detected;
    void duplicate;
    void overrides;
    void duplicateAction;
    void onOverridesChange;
    void onDuplicateActionChange;
    return (
        <div data-testid="preview-step">
            <p>Preview (scaffold)</p>
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onBack} data-testid="preview-back">
                    Back
                </button>
                <button onClick={onConfirm} data-testid="preview-confirm">
                    Import
                </button>
            </div>
        </div>
    );
}
