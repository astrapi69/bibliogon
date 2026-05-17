/**
 * Top-level page for the Medium-import plugin.
 *
 * Lives at /articles/import/medium. Diverges deliberately from the
 * existing modal-from-page import-wizard pattern: bulk operations
 * with 30+ second processing time and a structured result for review
 * warrant a stable URL the user can navigate away from and return to.
 * See lessons-learned for the divergence rationale.
 *
 * State machine (MEDIUM-IMPORT-V2-01, dry-run preview workflow):
 *
 *   idle
 *     | pick file + click "Vorschau & Auswahl"
 *     v
 *   uploading
 *     | upload completes, backend parses
 *     v
 *   previewing  <----.
 *     |              | onCancel  (DELETE /preview/{id}, clear state)
 *     | click "Importieren ({n} ausgewählt)"
 *     v              |
 *   importing        |
 *     |              |
 *     v              |
 *   result -> idle (via "Weiteres ZIP importieren")
 *
 * The v1 single-shot endpoint (api.mediumImport.importZip) is still
 * exported for direct callers (curl, scripts) but the page only ever
 * calls preview() + importSelected() + cancelPreview().
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Eye, Home, Upload, X } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import { useI18n } from "../hooks/useI18n";
import {
    api,
    ApiError,
    type MediumImportPreviewResponse,
    type MediumImportResponse,
} from "../api/client";
import { notify } from "../utils/notify";
import MediumImportSettings from "../components/medium-import/MediumImportSettings";
import MediumImportUploadZone from "../components/medium-import/MediumImportUploadZone";
import MediumImportProgress from "../components/medium-import/MediumImportProgress";
import MediumImportResult from "../components/medium-import/MediumImportResult";
import MediumImportPreviewTable from "../components/medium-import/MediumImportPreviewTable";
import styles from "./MediumImportPage.module.css";

type Phase = "idle" | "uploading" | "previewing" | "importing";

export default function MediumImportPage() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [file, setFile] = useState<File | null>(null);
    const [phase, setPhase] = useState<Phase>("idle");
    const [uploadLoaded, setUploadLoaded] = useState(0);
    const [uploadTotal, setUploadTotal] = useState(0);
    const [preview, setPreview] = useState<MediumImportPreviewResponse | null>(
        null,
    );
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [result, setResult] = useState<MediumImportResponse | null>(null);

    const isBusy = phase !== "idle";
    const isUploading = phase === "uploading";
    const isImporting = phase === "importing";
    const inPreview = phase === "previewing" || phase === "importing";

    const handleStartPreview = useCallback(async () => {
        if (!file) return;
        setResult(null);
        setPreview(null);
        setSelected(new Set());
        setUploadLoaded(0);
        setUploadTotal(file.size);
        setPhase("uploading");
        try {
            const response = await api.mediumImport.preview(file, (loaded, total) => {
                setUploadLoaded(loaded);
                setUploadTotal(total);
            });
            setPreview(response);
            // Default selection: everything checked. The user deselects what
            // they want to skip. This matches the typical "I want most of
            // it" use case better than the inverse default.
            setSelected(new Set(response.items.map((item) => item.filename)));
            setPhase("previewing");
        } catch (err) {
            setPhase("idle");
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.medium_import.toast.preview_failed",
                          "Vorschau fehlgeschlagen",
                      );
            notify.error(message, err);
        }
    }, [file, t]);

    const handleImportSelection = useCallback(async () => {
        if (!preview || selected.size === 0) return;
        setPhase("importing");
        try {
            const response = await api.mediumImport.importSelected(
                preview.preview_id,
                Array.from(selected),
            );
            setResult(response);
            setPhase("idle");
            setPreview(null);
            setSelected(new Set());
            // Auto-clear the file on success so the page's empty-state
            // returns cleanly (mirrors v1 behaviour pinned by the
            // v0.32.0 regression test in MediumImportPage.test.tsx).
            setFile(null);
            const summary = t(
                "ui.medium_import.toast.imported_summary",
                "Import abgeschlossen: {imported} importiert, {skipped} übersprungen, {errored} Fehler.",
            )
                .replace("{imported}", String(response.imported_count))
                .replace("{skipped}", String(response.skipped_count))
                .replace("{errored}", String(response.errored_count));
            if (response.errored_count > 0) {
                notify.warning(summary);
            } else {
                notify.success(summary);
            }
        } catch (err) {
            // Keep preview + selection so the user can retry without
            // re-uploading. The backend leaves the cache intact on
            // import failure for exactly this reason.
            setPhase("previewing");
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.medium_import.toast.import_failed",
                          "Import fehlgeschlagen",
                      );
            notify.error(message, err);
        }
    }, [preview, selected, t]);

    const handleCancelPreview = useCallback(async () => {
        // Fire-and-forget the cancel-cache call; the UI must NOT block
        // on it (the user already wants to cancel). The backend's
        // delete-by-id is idempotent so re-firing it on a missing id
        // is harmless.
        if (preview) {
            void api.mediumImport.cancelPreview(preview.preview_id).catch(() => {
                // Swallowed — TTL reaper will eventually catch the leak.
            });
        }
        setPreview(null);
        setSelected(new Set());
        setPhase("idle");
    }, [preview]);

    const handleToggleAll = useCallback(
        (checked: boolean) => {
            if (!preview) return;
            if (checked) {
                setSelected(new Set(preview.items.map((item) => item.filename)));
            } else {
                setSelected(new Set());
            }
        },
        [preview],
    );

    const handleToggleRow = useCallback((filename: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(filename)) {
                next.delete(filename);
            } else {
                next.add(filename);
            }
            return next;
        });
    }, []);

    const handleReset = useCallback(() => {
        setFile(null);
        setResult(null);
        setPreview(null);
        setSelected(new Set());
        setUploadLoaded(0);
        setUploadTotal(0);
    }, []);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <div className={styles.headerLeft}>
                        <button
                            className={styles.backBtn}
                            onClick={() => navigate("/articles")}
                            data-testid="medium-import-back"
                            aria-label={t(
                                "ui.medium_import.back_to_articles",
                                "Zurück zu Artikeln",
                            )}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <h1 className={styles.title}>
                            {t("ui.medium_import.page_title", "Medium-Import")}
                        </h1>
                    </div>
                    <div className="icon-row">
                        <button
                            className="btn-icon"
                            onClick={() => navigate("/")}
                            title={t("ui.dashboard.title", "Dashboard")}
                            aria-label={t("ui.dashboard.title", "Dashboard")}
                            data-testid="medium-import-home-btn"
                        >
                            <Home size={18} />
                        </button>
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className={styles.main}>
                <p className={styles.intro}>
                    {t(
                        "ui.medium_import.intro",
                        "Importiere dein Medium-Archiv (Download your information ZIP) als Artikel in Bibliogon. Jeder Beitrag wird ein Artikel; die kanonische URL wird erfasst, sodass ein erneuter Import desselben Archivs sicher ist.",
                    )}
                </p>

                <section className={styles.card}>
                    <h2 className={styles.cardHeader}>
                        {t("ui.medium_import.settings.card_title", "Einstellungen")}
                    </h2>
                    <p className={styles.cardHint}>
                        {t(
                            "ui.medium_import.settings.card_hint",
                            "Diese Einstellungen gelten für alle künftigen Importe. Pro Buch oder pro Artikel sind sie nicht überschreibbar.",
                        )}
                    </p>
                    <MediumImportSettings />
                </section>

                <section className={styles.card}>
                    <h2 className={styles.cardHeader}>
                        {t("ui.medium_import.upload.card_title", "Archiv hochladen")}
                    </h2>
                    <p className={styles.cardHint}>
                        {t(
                            "ui.medium_import.upload.card_hint",
                            "Wähle die ZIP-Datei aus, die Medium dir per E-Mail geschickt hat. Maximum 200 MB.",
                        )}
                    </p>
                    <MediumImportUploadZone
                        file={file}
                        onFileSelected={setFile}
                        disabled={isBusy}
                    />
                    {isUploading && (
                        <MediumImportProgress
                            phase="uploading"
                            loaded={uploadLoaded}
                            total={uploadTotal}
                        />
                    )}
                    {!inPreview && (
                        <div>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleStartPreview}
                                disabled={!file || isBusy}
                                data-testid="medium-import-start"
                            >
                                <Eye size={14} />{" "}
                                {isUploading
                                    ? t(
                                          "ui.medium_import.upload.previewing",
                                          "Vorschau wird geladen …",
                                      )
                                    : t(
                                          "ui.medium_import.upload.start",
                                          "Vorschau & Auswahl",
                                      )}
                            </button>
                        </div>
                    )}
                </section>

                {preview && inPreview && (
                    <section
                        className={styles.card}
                        data-testid="medium-import-preview-section"
                    >
                        <h2 className={styles.cardHeader}>
                            {t(
                                "ui.medium_import.preview.card_title",
                                "Vorschau & Auswahl",
                            )}
                        </h2>
                        <p className={styles.cardHint}>
                            {t(
                                "ui.medium_import.preview.card_hint",
                                "Entferne die Häkchen vor Beiträgen, die du NICHT importieren möchtest. Standardmäßig sind alle ausgewählt.",
                            )}
                        </p>
                        <MediumImportPreviewTable
                            items={preview.items}
                            errored={preview.errored}
                            selected={selected}
                            onToggleAll={handleToggleAll}
                            onToggleRow={handleToggleRow}
                            disabled={isImporting}
                        />
                        {isImporting && (
                            <MediumImportProgress
                                phase="processing"
                                loaded={0}
                                total={0}
                            />
                        )}
                        <div className={styles.previewActions}>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleImportSelection}
                                disabled={selected.size === 0 || isImporting}
                                data-testid="medium-import-preview-import-btn"
                            >
                                <Upload size={14} />{" "}
                                {isImporting
                                    ? t(
                                          "ui.medium_import.preview.importing",
                                          "Importiert …",
                                      )
                                    : t(
                                          "ui.medium_import.preview.import_selected",
                                          "{count} Beiträge importieren",
                                      ).replace(
                                          "{count}",
                                          String(selected.size),
                                      )}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleCancelPreview}
                                disabled={isImporting}
                                data-testid="medium-import-preview-cancel-btn"
                            >
                                <X size={14} />{" "}
                                {t(
                                    "ui.medium_import.preview.cancel",
                                    "Abbrechen",
                                )}
                            </button>
                        </div>
                    </section>
                )}

                {result && <MediumImportResult result={result} onReset={handleReset} />}
            </main>
        </div>
    );
}
