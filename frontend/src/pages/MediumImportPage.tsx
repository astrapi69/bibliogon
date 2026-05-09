/**
 * Top-level page for the Medium-import plugin.
 *
 * Lives at /articles/import/medium. Diverges deliberately from the
 * existing modal-from-page import-wizard pattern: bulk operations
 * with 30+ second processing time and a structured result for review
 * warrant a stable URL the user can navigate away from and return to.
 * See lessons-learned for the divergence rationale.
 *
 * Subsequent commits add: settings card, upload zone, progress, and
 * structured result. This shell renders the page chrome + intro so
 * the route is reachable end-to-end.
 */
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Home } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import { useI18n } from "../hooks/useI18n";
import styles from "./MediumImportPage.module.css";

export default function MediumImportPage() {
    const navigate = useNavigate();
    const { t } = useI18n();

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <div className={styles.headerLeft}>
                        <button
                            className={styles.backBtn}
                            onClick={() => navigate("/articles")}
                            data-testid="medium-import-back"
                            aria-label={t("ui.medium_import.back_to_articles", "Zurück zu Artikeln")}
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
                {/* Settings card, upload zone, progress, and result are
                 *  added in subsequent commits. */}
            </main>
        </div>
    );
}
