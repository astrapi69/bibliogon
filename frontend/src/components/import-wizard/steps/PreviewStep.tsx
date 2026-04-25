import { useI18n } from "../../../hooks/useI18n";
import { useAllowBooksWithoutAuthor } from "../../../hooks/useAllowBooksWithoutAuthor";
import type {
    DetectedProject,
    DuplicateInfo,
    GitAdoption,
    Overrides,
} from "../../../api/import";
import { PreviewPanel } from "./PreviewPanel";
import { DuplicateBanner } from "./DuplicateBanner";

function hasMandatoryValues(
    overrides: Overrides,
    allowNullAuthor: boolean,
): boolean {
    const title = overrides.title;
    const author = overrides.author;
    const valid = (v: unknown): boolean =>
        typeof v === "string" && v.trim().length > 0;
    if (!valid(title)) return false;
    if (allowNullAuthor) return true;
    return valid(author);
}

export function PreviewStep({
    detected,
    duplicate,
    overrides,
    duplicateAction,
    tempRef,
    gitAdoption,
    onOverridesChange,
    onDuplicateActionChange,
    onGitAdoptionChange,
    onBack,
    onConfirm,
}: {
    detected: DetectedProject;
    duplicate: DuplicateInfo;
    overrides: Overrides;
    duplicateAction: "create" | "overwrite";
    tempRef?: string;
    gitAdoption: GitAdoption;
    onOverridesChange: (o: Overrides) => void;
    onDuplicateActionChange: (a: "create" | "overwrite" | "cancel") => void;
    onGitAdoptionChange: (c: GitAdoption) => void;
    onBack: () => void;
    onConfirm: () => void;
}) {
    const { t } = useI18n();
    const allowDeferAuthor = useAllowBooksWithoutAuthor();
    const canImport = hasMandatoryValues(overrides, allowDeferAuthor);

    return (
        <div data-testid="preview-step">
            <DuplicateBanner
                duplicate={duplicate}
                currentAction={duplicateAction}
                onActionChange={onDuplicateActionChange}
            />
            <PreviewPanel
                detected={detected}
                overrides={overrides}
                onOverridesChange={onOverridesChange}
                tempRef={tempRef}
                gitAdoption={gitAdoption}
                onGitAdoptionChange={onGitAdoptionChange}
            />
            <div
                data-testid="preview-step-footer"
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 20,
                    paddingTop: 16,
                    paddingBottom: 12,
                    borderTop: "1px solid var(--border)",
                    background: "var(--bg-primary)",
                    position: "sticky",
                    bottom: 0,
                    zIndex: 2,
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
                    disabled={!canImport}
                    title={
                        !canImport
                            ? t(
                                  "ui.import_wizard.mandatory_tooltip",
                                  "Title and author are required",
                              )
                            : undefined
                    }
                >
                    {t("ui.import_wizard.button_import", "Import")}
                </button>
            </div>
        </div>
    );
}
