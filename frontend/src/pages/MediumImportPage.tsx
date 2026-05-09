/**
 * Top-level page for the Medium-import plugin.
 *
 * Lives at /articles/import/medium. Diverges deliberately from the
 * existing modal-from-page import-wizard pattern: bulk operations
 * with 30+ second processing time and a structured result for review
 * warrant a stable URL the user can navigate away from and return to.
 * See lessons-learned for the divergence rationale.
 *
 * State machine:
 *   idle -> uploading -> processing -> result
 *   result -> idle  (via "Weiteres ZIP importieren")
 *   uploading|processing -> idle on error (toast surfaces detail)
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Home, Upload } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import { useI18n } from "../hooks/useI18n";
import { api, ApiError, type MediumImportResponse } from "../api/client";
import { notify } from "../utils/notify";
import MediumImportSettings from "../components/medium-import/MediumImportSettings";
import MediumImportUploadZone from "../components/medium-import/MediumImportUploadZone";
import MediumImportProgress from "../components/medium-import/MediumImportProgress";
import MediumImportResult from "../components/medium-import/MediumImportResult";
import styles from "./MediumImportPage.module.css";

type Phase = "idle" | "uploading" | "processing";

export default function MediumImportPage() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const [file, setFile] = useState<File | null>(null);
    const [phase, setPhase] = useState<Phase>("idle");
    const [uploadLoaded, setUploadLoaded] = useState(0);
    const [uploadTotal, setUploadTotal] = useState(0);
    const [result, setResult] = useState<MediumImportResponse | null>(null);

    const isBusy = phase !== "idle";

    const handleImport = useCallback(async () => {
        if (!file) return;
        setResult(null);
        setUploadLoaded(0);
        setUploadTotal(file.size);
        setPhase("uploading");
        try {
            const response = await api.mediumImport.importZip(file, (loaded, total) => {
                setUploadLoaded(loaded);
                setUploadTotal(total);
                if (loaded >= total) {
                    setPhase("processing");
                }
            });
            setResult(response);
            setPhase("idle");
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
            setPhase("idle");
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.medium_import.toast.import_failed",
                          "Import fehlgeschlagen",
                      );
            notify.error(message, err);
        }
    }, [file, t]);

    const handleReset = useCallback(() => {
        setFile(null);
        setResult(null);
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
                    {isBusy && (
                        <MediumImportProgress
                            phase={phase === "uploading" ? "uploading" : "processing"}
                            loaded={uploadLoaded}
                            total={uploadTotal}
                        />
                    )}
                    <div>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleImport}
                            disabled={!file || isBusy}
                            data-testid="medium-import-start"
                        >
                            <Upload size={14} />{" "}
                            {isBusy
                                ? t("ui.medium_import.upload.importing", "Importiert …")
                                : t("ui.medium_import.upload.start", "Import starten")}
                        </button>
                    </div>
                </section>

                {result && <MediumImportResult result={result} onReset={handleReset} />}
            </main>
        </div>
    );
}
