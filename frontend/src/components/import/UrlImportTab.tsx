/**
 * URL source for the unified offline import dialog (#353).
 *
 * Fetches a single Markdown / HTML / Text document from an arbitrary URL and
 * imports it through the client-side detect/import path (via `getStorage()`,
 * zero `/api`). Works in both modes; the network gate
 * ({@link FEATURES.URL_IMPORT}) disables the tab only when the browser is
 * offline. The remote host must serve permissive CORS headers.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { Link2 } from "lucide-react";

import { useI18n } from "../../hooks/useI18n";
import { notify } from "../../utils/notify";
import { FEATURES } from "../../features/featureConfig";
import { FeatureNotice } from "../../features/FeatureNotice";
import { runUrlImport, UrlImportError } from "../../import/urlImport";

export interface UrlImportTabProps {
    onImported?: () => void;
    onClose: () => void;
}

export default function UrlImportTab({ onImported, onClose }: UrlImportTabProps) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const feature = useFeature(FEATURES.URL_IMPORT);

    const [urlInput, setUrlInput] = useState("");
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!feature.isActive) {
        return (
            <div className="p-5">
                <FeatureNotice reason={feature.reason} testId="url-import-offline" />
            </div>
        );
    }

    const handleImport = async () => {
        const trimmed = urlInput.trim();
        if (!trimmed) return;
        setImporting(true);
        setError(null);
        try {
            const { result } = await runUrlImport(trimmed);
            notify.success(t("ui.url_import.success", "Von URL importiert."));
            onImported?.();
            onClose();
            if (result.kind === "chapter") {
                navigate(`/book/${result.result.bookId}`);
            }
        } catch (err) {
            const message =
                err instanceof UrlImportError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : String(err);
            setError(message);
            notify.error(
                t("ui.url_import.failed", "URL-Import fehlgeschlagen: {error}").replace(
                    "{error}",
                    message,
                ),
            );
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="flex flex-col">
            <div className="flex flex-col gap-3 p-5">
                <label className="text-sm font-medium" htmlFor="url-import-url">
                    {t("ui.url_import.url_label", "Datei-URL")}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        id="url-import-url"
                        data-testid="url-import-url"
                        className="input min-h-[44px] flex-1"
                        type="text"
                        placeholder="https://example.com/document.md"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void handleImport();
                            }
                        }}
                    />
                </div>
                <p className="m-0 flex items-start gap-1 text-xs text-[var(--text-muted)]">
                    <Link2 size={12} className="mt-0.5 inline shrink-0" />
                    {t(
                        "ui.url_import.hint",
                        "Markdown, HTML oder Text von einer öffentlichen URL. Die Seite muss CORS erlauben.",
                    )}
                </p>

                {error && (
                    <p
                        className="m-0 text-sm text-[var(--danger)]"
                        data-testid="url-import-error"
                        role="alert"
                    >
                        {error}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
                <button
                    className="btn btn-secondary btn-sm min-h-[44px]"
                    data-testid="url-import-close"
                    onClick={onClose}
                >
                    {t("ui.offline_import.cancel_btn", "Abbrechen")}
                </button>
                <button
                    className="btn btn-primary btn-sm min-h-[44px]"
                    data-testid="url-import-confirm"
                    onClick={() => void handleImport()}
                    disabled={importing || urlInput.trim() === ""}
                >
                    {importing
                        ? t("ui.url_import.importing", "Importiere …")
                        : t("ui.url_import.import_btn", "Importieren")}
                </button>
            </div>
        </div>
    );
}
