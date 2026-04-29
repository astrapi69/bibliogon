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

function isArticlesOnly(detected: DetectedProject): boolean {
    return Boolean(detected.plugin_specific_data?.articles_only);
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
    const articlesOnly = isArticlesOnly(detected);
    const articleCount = Number(
        detected.plugin_specific_data?.article_count ?? 0,
    );
    // Articles-only .bgb has no Book metadata; the title+author gate
    // is book-centric and would always disable Confirm. Bypass it so
    // the user can restore article-only backups end to end.
    const canImport = articlesOnly
        ? articleCount > 0
        : hasMandatoryValues(overrides, allowDeferAuthor);

    return (
        <div data-testid="preview-step">
            <DuplicateBanner
                duplicate={duplicate}
                currentAction={duplicateAction}
                onActionChange={onDuplicateActionChange}
            />
            {articlesOnly ? (
                <div
                    data-testid="preview-articles-only"
                    style={{
                        padding: 16,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        background: "var(--bg-secondary)",
                    }}
                >
                    <h3 style={{ marginTop: 0 }}>
                        {t(
                            "ui.import_wizard.articles_only_heading",
                            "Articles backup",
                        )}
                    </h3>
                    <p style={{ marginBottom: 0 }}>
                        {t(
                            "ui.import_wizard.articles_only_body",
                            "This backup contains {count} article(s) and no books. Confirm to restore them.",
                        ).replace("{count}", String(articleCount))}
                    </p>
                </div>
            ) : (
                <PreviewPanel
                    detected={detected}
                    overrides={overrides}
                    onOverridesChange={onOverridesChange}
                    tempRef={tempRef}
                    gitAdoption={gitAdoption}
                    onGitAdoptionChange={onGitAdoptionChange}
                />
            )}
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
