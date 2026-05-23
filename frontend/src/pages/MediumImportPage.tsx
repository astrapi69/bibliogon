/**
 * Top-level page for the Medium-import plugin.
 *
 * Lives at /articles/import/medium. Diverges deliberately from the
 * existing modal-from-page import-wizard pattern: bulk operations
 * with 30+ second processing time and a structured result for review
 * warrant a stable URL the user can navigate away from and return to.
 * See lessons-learned for the divergence rationale.
 *
 * State machine (ASYNC-IMPORT-PROGRESS-01):
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
 *   importing -------+
 *     | SSE events flow via MediumImportJobContext
 *     | stream_end success -> fetch /jobs/{id}/result -> render
 *     |     MediumImportResult; file/preview/selection cleared
 *     | stream_end failed   -> back to previewing for retry
 *     | stream_end cancelled-> back to previewing
 *     v
 *   result -> idle (via "Weiteres ZIP importieren")
 *
 * Per Q5 the SSE state lives in MediumImportJobContext (provider
 * mounted at App level) so F5 mid-import re-attaches to the
 * running job instead of dropping the progress UI.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Eye, Home, Minimize2, Upload, X } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import { useI18n } from "../hooks/useI18n";
import {
    api,
    ApiError,
    type MediumImportPreviewResponse,
} from "../api/client";
import { notify } from "../utils/notify";
import { useMediumImportJob } from "../contexts/MediumImportJobContext";
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
    const job = useMediumImportJob();

    const [file, setFile] = useState<File | null>(null);
    const [phase, setPhase] = useState<Phase>(
        // If a job was running when the user came back (F5 / re-nav),
        // the context auto-reconnects and we drop straight into the
        // importing phase so the progress UI replaces the dropzone.
        // Result-on-mount is rendered from job.result (context-backed)
        // so phase stays "idle" in that case — the result panel mounts
        // alongside the idle upload card.
        job.active && job.phase === "running" ? "importing" : "idle",
    );
    const [uploadLoaded, setUploadLoaded] = useState(0);
    const [uploadTotal, setUploadTotal] = useState(0);
    const [preview, setPreview] = useState<MediumImportPreviewResponse | null>(
        null,
    );
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // MediumImportJobContext.result is the source of truth for the
    // result panel. Reading from context (not local useState) means
    // the result survives navigation — user can click "Go to comments"
    // → Settings → browser-back and still see the result panel,
    // matching their mental model of "this should still be here".
    const result = job.result;

    const isBusy = phase !== "idle";
    const isUploading = phase === "uploading";
    const isImporting = phase === "importing";
    const inPreview = phase === "previewing" || phase === "importing";

    const handleStartPreview = useCallback(async () => {
        if (!file) return;
        // Starting a new preview implicitly discards any previous
        // result panel + cached job (the user is committing to a
        // new flow). job.clear() drops both.
        job.clear();
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
    }, [file, t, job]);

    const handleImportSelection = useCallback(async () => {
        if (!preview || selected.size === 0) return;
        setPhase("importing");
        try {
            const started = await api.mediumImport.importSelectedAsync(
                preview.preview_id,
                Array.from(selected),
            );
            // Hand the job_id to the context; it opens the SSE
            // stream and folds per-post events into live counters.
            // The page transitions back to idle (or stays in
            // previewing on failure) via the watcher useEffect
            // below, driven by job.phase / job.result.
            job.start(started.job_id);
        } catch (err) {
            // Submission failed before the job started. Rewind to
            // previewing so the user can retry without re-uploading.
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
    }, [preview, selected, t, job]);

    // Watch the context for SSE-driven phase changes. When the
    // active job terminates, drive the page's own transitions:
    //
    //   completed -> clear file + preview + selection, toast summary,
    //                return phase to idle. job.result stays in
    //                context so the result panel keeps rendering
    //                across navigation; user clears explicitly via
    //                handleReset ("Import another ZIP").
    //   failed    -> return to previewing for retry; toast detail;
    //                job.clear() so the failure doesn't leak across
    //                attempts.
    //   cancelled -> return to previewing; job.clear().
    useEffect(() => {
        if (phase !== "importing") return;
        if (job.phase === "completed" && job.result) {
            const response = job.result;
            setPhase("idle");
            setPreview(null);
            setSelected(new Set());
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
            // Intentionally NOT calling job.clear() here: the result
            // must persist in context across navigation so the user
            // can navigate to /settings?tab=comments and back without
            // losing the result panel. handleReset is the only path
            // that clears the job.
        } else if (job.phase === "failed") {
            setPhase("previewing");
            const message =
                job.errorMessage ||
                t(
                    "ui.medium_import.toast.import_failed",
                    "Import fehlgeschlagen",
                );
            notify.error(message);
            job.clear();
        } else if (job.phase === "cancelled") {
            setPhase("previewing");
            job.clear();
        }
    }, [job.phase, job.result, job.errorMessage, phase, t, job]);

    const handleCancelPreview = useCallback(async () => {
        if (preview) {
            void api.mediumImport.cancelPreview(preview.preview_id).catch(() => {
                // Swallowed - TTL reaper will catch any leak.
            });
        }
        setPreview(null);
        setSelected(new Set());
        setPhase("idle");
    }, [preview]);

    const handleCancelImport = useCallback(async () => {
        // Cancel the in-flight async job. The SSE stream emits
        // stream_end with status=cancelled and the watcher
        // useEffect above rewinds to previewing. The preview
        // cache stays intact so the user can retry the same
        // selection without re-uploading.
        await job.cancel();
    }, [job]);

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
        setPreview(null);
        setSelected(new Set());
        setUploadLoaded(0);
        setUploadTotal(0);
        // job.clear() drops the result from context too; the result
        // panel unmounts and the page returns to a clean dropzone
        // state. This is the user's "I'm done with this import,
        // start fresh" path.
        job.clear();
    }, [job]);

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

            <main id="main-content" className={styles.main}>
                <p className={styles.intro}>
                    {t(
                        "ui.medium_import.intro",
                        "Importiere dein Medium-Archiv (Download your information ZIP) als Artikel in Bibliogon. Jeder Beitrag wird ein Artikel; die kanonische URL wird erfasst, sodass ein erneuter Import desselben Archivs sicher ist.",
                    )}
                </p>

                {/*
                  Active-flow content (preview / importing /
                  result) is rendered ABOVE the operating cards
                  (settings + upload) so a user who navigates back
                  to the page lands directly on the running import
                  or the just-finished result, without having to
                  scroll past Settings.
                */}
                {(preview || isImporting) && inPreview && (
                    <section
                        className={styles.card}
                        data-testid="medium-import-preview-section"
                    >
                        <h2 className={styles.cardHeader}>
                            {preview
                                ? t(
                                      "ui.medium_import.preview.card_title",
                                      "Vorschau & Auswahl",
                                  )
                                : t(
                                      "ui.medium_import.preview.in_progress_card_title",
                                      "Import läuft",
                                  )}
                        </h2>
                        <p className={styles.cardHint}>
                            {preview
                                ? t(
                                      "ui.medium_import.preview.card_hint",
                                      "Entferne die Häkchen vor Beiträgen, die du NICHT importieren möchtest. Standardmäßig sind alle ausgewählt.",
                                  )
                                : t(
                                      "ui.medium_import.preview.in_progress_card_hint",
                                      "Der Import läuft im Hintergrund. Du kannst die Seite verlassen — der Badge unten links zeigt den Fortschritt und bringt dich zurück.",
                                  )}
                        </p>
                        {preview && (
                            <MediumImportPreviewTable
                                items={preview.items}
                                errored={preview.errored}
                                selected={selected}
                                onToggleAll={handleToggleAll}
                                onToggleRow={handleToggleRow}
                                disabled={isImporting}
                            />
                        )}
                        {isImporting && (
                            <MediumImportProgress
                                phase="processing-async"
                                asyncCurrent={job.current}
                                asyncTotal={job.total}
                                asyncCurrentFilename={job.currentFilename}
                                asyncImported={job.importedCount}
                                asyncSkipped={job.skippedCount}
                                asyncErrored={job.erroredCount}
                                asyncImportedComments={
                                    job.importedCommentsCount
                                }
                                asyncSkippedComments={
                                    job.skippedCommentsCount
                                }
                            />
                        )}
                        <div className={styles.previewActions}>
                            {preview && (
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
                            )}
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={
                                    isImporting
                                        ? handleCancelImport
                                        : handleCancelPreview
                                }
                                data-testid="medium-import-preview-cancel-btn"
                            >
                                <X size={14} />{" "}
                                {isImporting
                                    ? t(
                                          "ui.medium_import.preview.cancel_import",
                                          "Import abbrechen",
                                      )
                                    : t(
                                          "ui.medium_import.preview.cancel",
                                          "Abbrechen",
                                      )}
                            </button>
                            {isImporting && (
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => navigate("/articles")}
                                    data-testid="medium-import-preview-background-btn"
                                    title={t(
                                        "ui.medium_import.preview.run_in_background_hint",
                                        "Import läuft im Hintergrund weiter; ein Badge zeigt den Fortschritt.",
                                    )}
                                >
                                    <Minimize2 size={14} />{" "}
                                    {t(
                                        "ui.medium_import.preview.run_in_background",
                                        "Im Hintergrund weiterlaufen",
                                    )}
                                </button>
                            )}
                        </div>
                    </section>
                )}

                {result && <MediumImportResult result={result} onReset={handleReset} />}

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
            </main>
        </div>
    );
}
