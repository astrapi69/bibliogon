import { useNavigate } from "react-router-dom";
import { useI18n } from "../../../hooks/useI18n";

export function SuccessStep({
    bookId,
    title,
    onClose,
    onAnother,
}: {
    bookId: string;
    title: string;
    onClose: () => void;
    onAnother: () => void;
}) {
    const { t } = useI18n();
    const navigate = useNavigate();
    return (
        <div data-testid="success-step">
            <h3 style={{ margin: 0 }}>
                {t("ui.import_wizard.success_title", "Import complete")}
            </h3>
            <p>
                {t("ui.import_wizard.success_book_title", "Imported as: {title}").replace(
                    "{title}",
                    title,
                )}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
                <button
                    className="btn btn-primary"
                    data-testid="success-open-editor"
                    onClick={() => {
                        onClose();
                        navigate(`/book/${bookId}`);
                    }}
                >
                    {t("ui.import_wizard.success_open_editor", "Open in editor")}
                </button>
                <button
                    className="btn btn-secondary"
                    data-testid="success-import-another"
                    onClick={onAnother}
                >
                    {t("ui.import_wizard.success_import_another", "Import another")}
                </button>
            </div>
        </div>
    );
}
