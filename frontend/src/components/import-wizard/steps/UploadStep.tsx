import { useI18n } from "../../../hooks/useI18n";

export function UploadStep({
    onFileSelected,
}: {
    onFileSelected: (file: File) => void;
}) {
    const { t } = useI18n();
    return (
        <div data-testid="upload-step">
            <p style={{ color: "var(--text-muted)" }}>
                {t("ui.import_wizard.step_1_placeholder", "File upload UI pending.")}
            </p>
            <input
                type="file"
                data-testid="upload-input"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onFileSelected(file);
                }}
            />
        </div>
    );
}
