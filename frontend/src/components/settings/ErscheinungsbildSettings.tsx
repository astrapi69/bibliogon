import {useEffect, useState} from "react";
import {Save} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import {PALETTES} from "../../themes/palettes";
import styles from "../../pages/Settings.module.css";
import {RadixSelect} from "./RadixSelect";
import {SectionHeader} from "./SectionHeader";

export function ErscheinungsbildSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const ui = (config.ui || {}) as Record<string, unknown>;
    const uiDashboard = (ui.dashboard || {}) as Record<string, unknown>;

    const [theme, setTheme] = useState((ui.theme as string) || "warm-literary");
    const [booksView, setBooksView] = useState(
        (uiDashboard.books_view as string) === "list" ? "list" : "grid",
    );
    const [articlesView, setArticlesView] = useState(
        (uiDashboard.articles_view as string) === "list" ? "list" : "grid",
    );
    const [booksTrashView, setBooksTrashView] = useState(
        (uiDashboard.books_trash_view as string) === "list" ? "list" : "grid",
    );
    const [articlesTrashView, setArticlesTrashView] = useState(
        (uiDashboard.articles_trash_view as string) === "list" ? "list" : "grid",
    );

    useEffect(() => {
        setTheme((ui.theme as string) || "warm-literary");
        const dashboardCfg = (ui.dashboard || {}) as Record<string, unknown>;
        setBooksView((dashboardCfg.books_view as string) === "list" ? "list" : "grid");
        setArticlesView((dashboardCfg.articles_view as string) === "list" ? "list" : "grid");
        setBooksTrashView((dashboardCfg.books_trash_view as string) === "list" ? "list" : "grid");
        setArticlesTrashView(
            (dashboardCfg.articles_trash_view as string) === "list" ? "list" : "grid",
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    const buildSaveData = () => ({
        ui: {
            theme,
            dashboard: {
                books_view: booksView,
                articles_view: articlesView,
                books_trash_view: booksTrashView,
                articles_trash_view: articlesTrashView,
            },
        },
    });

    return (
        <div className={styles.section} data-testid="erscheinungsbild-settings">
            <SectionHeader
                title={t("ui.settings.erscheinungsbild_title", "Erscheinungsbild")}
                description={t("ui.settings.erscheinungsbild_description", "Theme und Standard-Ansichten für Bücher- und Artikel-Dashboard.")}
            />
            <div className={styles.card}>
                <div className="field">
                    <label className="label">{t("ui.settings.theme", "Theme")}</label>
                    <RadixSelect
                        value={theme}
                        onValueChange={(val) => {
                            setTheme(val);
                            document.documentElement.setAttribute("data-app-theme", val);
                            localStorage.setItem("bibliogon-app-theme", val);
                        }}
                        testId="palette-select"
                        options={PALETTES.map((p) => ({
                            value: p.id,
                            label: t(`ui.themes.${p.id.replace(/-/g, "_")}`, p.label),
                        }))}
                    />
                </div>
                <div className={styles.subCard} data-testid="settings-dashboard-views">
                    <h3 className={styles.subCardTitle}>
                        {t("ui.settings.dashboard_views_title", "Standard-Ansichten")}
                    </h3>
                    <div className={styles.subCardGrid}>
                        <div className="field">
                            <label className="label" title={t("ui.settings.dashboard_books_view_tooltip", "Standard-Ansicht beim Öffnen des Bücher-Dashboards. Kann jederzeit über das Symbol oben rechts geändert werden.")}>
                                {t("ui.settings.dashboard_books_view_label", "Bücher-Dashboard: Standard-Ansicht")}
                            </label>
                            <RadixSelect
                                value={booksView}
                                onValueChange={setBooksView}
                                testId="settings-books-view"
                                options={[
                                    {value: "grid", label: t("ui.dashboard.view_grid", "Kachel-Ansicht")},
                                    {value: "list", label: t("ui.dashboard.view_list", "Listen-Ansicht")},
                                ]}
                            />
                        </div>
                        <div className="field">
                            <label className="label" title={t("ui.settings.dashboard_articles_view_tooltip", "Standard-Ansicht beim Öffnen des Artikel-Dashboards. Kann jederzeit über das Symbol oben rechts geändert werden.")}>
                                {t("ui.settings.dashboard_articles_view_label", "Artikel-Dashboard: Standard-Ansicht")}
                            </label>
                            <RadixSelect
                                value={articlesView}
                                onValueChange={setArticlesView}
                                testId="settings-articles-view"
                                options={[
                                    {value: "grid", label: t("ui.dashboard.view_grid", "Kachel-Ansicht")},
                                    {value: "list", label: t("ui.dashboard.view_list", "Listen-Ansicht")},
                                ]}
                            />
                        </div>
                        <div className="field">
                            <label
                                className="label"
                                title={t(
                                    "ui.settings.dashboard_books_trash_view_tooltip",
                                    "Standard-Ansicht für den Bücher-Papierkorb. Toggles im Papierkorb sind sitzungsspezifisch und überschreiben diese Einstellung nicht.",
                                )}
                            >
                                {t(
                                    "ui.settings.dashboard_books_trash_view_label",
                                    "Bücher-Papierkorb: Standard-Ansicht",
                                )}
                            </label>
                            <RadixSelect
                                value={booksTrashView}
                                onValueChange={setBooksTrashView}
                                testId="settings-books-trash-view"
                                options={[
                                    {value: "grid", label: t("ui.dashboard.view_grid", "Kachel-Ansicht")},
                                    {value: "list", label: t("ui.dashboard.view_list", "Listen-Ansicht")},
                                ]}
                            />
                        </div>
                        <div className="field">
                            <label
                                className="label"
                                title={t(
                                    "ui.settings.dashboard_articles_trash_view_tooltip",
                                    "Standard-Ansicht für den Artikel-Papierkorb. Toggles im Papierkorb sind sitzungsspezifisch und überschreiben diese Einstellung nicht.",
                                )}
                            >
                                {t(
                                    "ui.settings.dashboard_articles_trash_view_label",
                                    "Artikel-Papierkorb: Standard-Ansicht",
                                )}
                            </label>
                            <RadixSelect
                                value={articlesTrashView}
                                onValueChange={setArticlesTrashView}
                                testId="settings-articles-trash-view"
                                options={[
                                    {value: "grid", label: t("ui.dashboard.view_grid", "Kachel-Ansicht")},
                                    {value: "list", label: t("ui.dashboard.view_list", "Listen-Ansicht")},
                                ]}
                            />
                        </div>
                    </div>
                </div>
                <button
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => onSave(buildSaveData())}
                    data-testid="erscheinungsbild-settings-save"
                    style={{marginTop: 12}}
                >
                    <Save size={14}/> {t("ui.common.save", "Speichern")}
                </button>
            </div>
        </div>
    );
}
