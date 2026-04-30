import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import ThemeToggle from "../components/ThemeToggle";
import {notify} from "../utils/notify";
import styles from "./GetStarted.module.css";
import {
    ChevronLeft, ChevronRight, BookPlus, FilePlus, PenTool, GripVertical,
    Download, Settings, Archive, Rocket, Check, Home, HelpCircle,
    ArrowRight, ArrowLeft, PartyPopper,
} from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
    "book-plus": <BookPlus size={32}/>,
    "file-plus": <FilePlus size={32}/>,
    "pen-tool": <PenTool size={32}/>,
    "grip-vertical": <GripVertical size={32}/>,
    "download": <Download size={32}/>,
    "settings": <Settings size={32}/>,
    "archive": <Archive size={32}/>,
};

interface GuideStep {
    id: string;
    title: string;
    description: string;
    icon: string;
}

export default function GetStarted() {
    const navigate = useNavigate();
    const {t} = useI18n();
    const [steps, setSteps] = useState<GuideStep[]>([]);
    const [currentStep, setCurrentStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<Set<string>>(() => {
        const stored = localStorage.getItem("bibliogon-onboarding");
        return stored ? new Set(JSON.parse(stored)) : new Set();
    });
    const [expandedHelp, setExpandedHelp] = useState(false);
    const [creating, setCreating] = useState(false);

    const ACTION_MAP: Record<string, {label: string; path: string}> = {
        "create-book": {label: t("ui.get_started.to_dashboard", "Zum Dashboard"), path: "/"},
        "add-chapters": {label: t("ui.get_started.open_book", "Buch öffnen"), path: "/"},
        "write-content": {label: t("ui.get_started.open_editor", "Editor öffnen"), path: "/"},
        "organize": {label: t("ui.get_started.open_book", "Buch öffnen"), path: "/"},
        "export": {label: t("ui.get_started.open_book", "Buch öffnen"), path: "/"},
        "settings": {label: t("ui.get_started.open_settings", "Einstellungen öffnen"), path: "/settings"},
        "backup": {label: t("ui.get_started.to_dashboard", "Zum Dashboard"), path: "/"},
    };

    useEffect(() => {
        api.getStarted.guide("de").then((data) => {
            setSteps(data);
            // Start at first incomplete step
            const stored = localStorage.getItem("bibliogon-onboarding");
            const done = stored ? new Set(JSON.parse(stored)) : new Set();
            const firstIncomplete = data.findIndex((s) => !done.has(s.id));
            if (firstIncomplete >= 0) setCurrentStep(firstIncomplete);
        }).catch(() => {});
    }, []);

    const markComplete = (id: string) => {
        setCompletedSteps((prev) => {
            const next = new Set(prev);
            next.add(id);
            localStorage.setItem("bibliogon-onboarding", JSON.stringify([...next]));
            return next;
        });
    };

    const handleCreateSampleBook = async () => {
        setCreating(true);
        try {
            const sample = await api.getStarted.sampleBook("de");
            const book = await api.books.create({
                title: sample.title,
                author: sample.author,
                language: sample.language,
                description: sample.description,
            });
            for (const ch of sample.chapters) {
                await api.chapters.create(book.id, {title: ch.title, content: ch.content});
            }
            notify.success(t("ui.get_started.sample_book_created", "Beispielbuch erstellt!"));
            navigate(`/book/${book.id}`);
        } catch (err) {
            notify.error(`${t("ui.common.error", "Fehler")}: ${err}`, err);
        }
        setCreating(false);
    };

    const step = steps[currentStep];
    const isComplete = step ? completedSteps.has(step.id) : false;
    const allDone = steps.length > 0 && steps.every((s) => completedSteps.has(s.id));
    const progress = steps.length > 0 ? Math.round((completedSteps.size / steps.length) * 100) : 0;

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <div className={styles.headerLeft}>
                        <button className={styles.backBtn} onClick={() => navigate("/")}>
                            <ChevronLeft size={18}/>
                        </button>
                        <Rocket size={22} style={{color: "var(--accent)"}}/>
                        <h1 className={styles.title}>{t("ui.get_started.title", "Erste Schritte")}</h1>
                    </div>
                    <div className="icon-row">
                        <button className="btn-icon" onClick={() => navigate("/")} title="Dashboard">
                            <Home size={18}/>
                        </button>
                        <ThemeToggle/>
                    </div>
                </div>
            </header>

            <main className={styles.main}>
                {/* Progress bar */}
                <div className={styles.progressSection}>
                    <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{width: `${progress}%`}}/>
                    </div>
                    <span className={styles.progressText}>
                        {allDone
                            ? t("ui.get_started.done", "Fertig!")
                            : t("ui.get_started.progress", "Schritt {current} von {total}")
                                .replace("{current}", String(currentStep + 1))
                                .replace("{total}", String(steps.length))
                        }
                    </span>
                </div>

                {/* Step indicators */}
                <div className={styles.stepIndicators}>
                    {steps.map((s, i) => (
                        <button
                            key={s.id}
                            onClick={() => setCurrentStep(i)}
                            className={[
                                styles.indicator,
                                i === currentStep ? styles.indicatorActive : "",
                                completedSteps.has(s.id) ? styles.indicatorDone : "",
                            ].filter(Boolean).join(" ")}
                        >
                            {completedSteps.has(s.id) ? <Check size={14}/> : i + 1}
                        </button>
                    ))}
                </div>

                {/* All done celebration */}
                {allDone && (
                    <div className={styles.doneCard}>
                        <PartyPopper size={40} style={{color: "var(--accent)"}}/>
                        <h2 style={{fontSize: "1.25rem", fontWeight: 600, marginTop: 12}}>
                            {t("ui.get_started.congratulations", "Glueckwunsch!")}
                        </h2>
                        <p style={{color: "var(--text-secondary)", marginTop: 8}}>
                            {t("ui.get_started.all_done", "Du kennst jetzt alle wichtigen Funktionen von Bibliogon.")}
                        </p>
                        <div style={{display: "flex", gap: 12, marginTop: 16}}>
                            <button className="btn btn-primary" onClick={() => navigate("/")}>
                                {t("ui.get_started.to_dashboard", "Zum Dashboard")}
                            </button>
                            <button className="btn btn-ghost" onClick={() => {
                                localStorage.removeItem("bibliogon-onboarding");
                                setCompletedSteps(new Set());
                                setCurrentStep(0);
                            }}>
                                {t("ui.get_started.restart", "Nochmal starten")}
                            </button>
                        </div>
                    </div>
                )}

                {/* Current step */}
                {step && !allDone && (
                    <div className={styles.stepCard}>
                        <div className={styles.stepHeader}>
                            <div
                                className={styles.stepIconCircle}
                                style={isComplete ? {background: "var(--accent-light)", color: "var(--accent)"} : undefined}
                            >
                                {isComplete ? <Check size={32}/> : (ICON_MAP[step.icon] || <Rocket size={32}/>)}
                            </div>
                            <div style={{flex: 1}}>
                                <h2 className={styles.stepTitle}>{step.title}</h2>
                                <p className={styles.stepDesc}>{step.description}</p>
                            </div>
                        </div>

                        {/* Help toggle */}
                        <button
                            className={styles.helpToggle}
                            onClick={() => setExpandedHelp(!expandedHelp)}
                        >
                            <HelpCircle size={16}/>
                            {expandedHelp ? t("ui.get_started.hide_help", "Hilfe ausblenden") : t("ui.get_started.how_to", "Wie geht das?")}
                            {expandedHelp ? <ChevronLeft size={14} style={{transform: "rotate(-90deg)"}}/> : <ChevronRight size={14} style={{transform: "rotate(90deg)"}}/>}
                        </button>

                        {expandedHelp && (
                            <div className={styles.helpContent}>
                                {step.id === "create-book" && (
                                    <ol className={styles.helpList}>
                                        <li>{t("ui.get_started.help_create_1", "Gehe zum Dashboard (Startseite)")}</li>
                                        <li>{t("ui.get_started.help_create_2", "Klicke den Button \"Neues Buch\"")}</li>
                                        <li>{t("ui.get_started.help_create_3", "Gib Titel und Autor ein (Pseudonym wird aus den Einstellungen geladen)")}</li>
                                        <li>{t("ui.get_started.help_create_4", "Wähle die Sprache und klicke \"Erstellen\"")}</li>
                                    </ol>
                                )}
                                {step.id === "add-chapters" && (
                                    <ol className={styles.helpList}>
                                        <li>{t("ui.get_started.help_chapters_1", "Oeffne ein Buch im Dashboard")}</li>
                                        <li>{t("ui.get_started.help_chapters_2", "Klicke das \"+\" neben \"Inhalt\" in der linken Sidebar")}</li>
                                        <li>{t("ui.get_started.help_chapters_3", "Wähle den Kapiteltyp: Kapitel, Vorwort, Epilog, etc.")}</li>
                                        <li>{t("ui.get_started.help_chapters_4", "Das neue Kapitel erscheint in der Sidebar")}</li>
                                    </ol>
                                )}
                                {step.id === "write-content" && (
                                    <ol className={styles.helpList}>
                                        <li>{t("ui.get_started.help_write_1", "Klicke auf ein Kapitel in der Sidebar")}</li>
                                        <li>{t("ui.get_started.help_write_2", "Der WYSIWYG-Editor oeffnet sich rechts")}</li>
                                        <li>{t("ui.get_started.help_write_3", "Nutze die Toolbar für Formatierung (Fett, Kursiv, Überschriften, etc.)")}</li>
                                        <li>{t("ui.get_started.help_write_4", "Wechsle mit dem \"Markdown\" Button oben rechts in den Markdown-Modus")}</li>
                                        <li>{t("ui.get_started.help_write_5", "Änderungen werden automatisch gespeichert")}</li>
                                    </ol>
                                )}
                                {step.id === "organize" && (
                                    <ol className={styles.helpList}>
                                        <li>{t("ui.get_started.help_organize_1", "Greife das Griffsymbol links neben einem Kapitel")}</li>
                                        <li>{t("ui.get_started.help_organize_2", "Ziehe es an die gewuenschte Position")}</li>
                                        <li>{t("ui.get_started.help_organize_3", "Front Matter, Kapitel und Back Matter sind getrennte Bereiche")}</li>
                                        <li>{t("ui.get_started.help_organize_4", "Die Bereiche lassen sich auf- und zuklappen")}</li>
                                    </ol>
                                )}
                                {step.id === "export" && (
                                    <ol className={styles.helpList}>
                                        <li>{t("ui.get_started.help_export_1", "Klicke \"Exportieren...\" unten in der Sidebar")}</li>
                                        <li>{t("ui.get_started.help_export_2", "Wähle das Format: EPUB, PDF, Word, HTML oder Markdown")}</li>
                                        <li>{t("ui.get_started.help_export_3", "Wähle den Buchtyp: E-Book, Taschenbuch oder Hardcover")}</li>
                                        <li>{t("ui.get_started.help_export_4", "Bei vorhandenem Inhaltsverzeichnis: Checkbox \"Manuelles TOC verwenden\"")}</li>
                                        <li>{t("ui.get_started.help_export_5", "Klicke \"Exportieren\" - die Datei wird heruntergeladen")}</li>
                                    </ol>
                                )}
                                {step.id === "settings" && (
                                    <ol className={styles.helpList}>
                                        <li>{t("ui.get_started.help_settings_1", "Oeffne die Einstellungen über das Zahnrad-Icon")}</li>
                                        <li>{t("ui.get_started.help_settings_2", "Tab \"Allgemein\": Sprache, Theme, Titel")}</li>
                                        <li>{t("ui.get_started.help_settings_3", "Tab \"Autor\": Dein Name und Pseudonyme eintragen")}</li>
                                        <li>{t("ui.get_started.help_settings_4", "Tab \"Plugins\": Plugins aktivieren, konfigurieren oder per ZIP installieren")}</li>
                                    </ol>
                                )}
                                {step.id === "backup" && (
                                    <ol className={styles.helpList}>
                                        <li>{t("ui.get_started.help_backup_1", "Im Dashboard: \"Backup\" Button erstellt eine .bgb-Datei")}</li>
                                        <li>{t("ui.get_started.help_backup_2", "Die Datei enthält alle Bücher, Kapitel und Bilder")}</li>
                                        <li>{t("ui.get_started.help_backup_3", "\"Restore\" stellt ein Backup wieder her")}</li>
                                        <li>{t("ui.get_started.help_backup_4", "Externe Projekte (.zip, .bgp) können über \"Import\" geladen werden")}</li>
                                    </ol>
                                )}
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className={styles.stepActions}>
                            {step.id === "create-book" && (
                                <button
                                    className="btn btn-ghost"
                                    onClick={handleCreateSampleBook}
                                    disabled={creating}
                                >
                                    <BookPlus size={16}/>
                                    {creating ? t("ui.get_started.creating", "Erstellt...") : t("ui.get_started.or_sample", "Oder: Beispielbuch erstellen")}
                                </button>
                            )}
                            {ACTION_MAP[step.id] && (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        markComplete(step.id);
                                        navigate(ACTION_MAP[step.id].path);
                                    }}
                                >
                                    {ACTION_MAP[step.id].label} <ArrowRight size={16}/>
                                </button>
                            )}
                            {!isComplete && (
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => {
                                        markComplete(step.id);
                                        if (currentStep < steps.length - 1) {
                                            setCurrentStep(currentStep + 1);
                                            setExpandedHelp(false);
                                        }
                                    }}
                                >
                                    <Check size={16}/> {t("ui.get_started.mark_complete", "Als erledigt markieren")}
                                </button>
                            )}
                        </div>

                        {/* Spacer pushes navigation to bottom */}
                        <div className={styles.stepSpacer}/>

                        {/* Navigation */}
                        <div className={styles.navigation}>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={currentStep === 0}
                                onClick={() => { setCurrentStep(currentStep - 1); setExpandedHelp(false); }}
                            >
                                <ArrowLeft size={14}/> {t("ui.get_started.back", "Zurück")}
                            </button>
                            {currentStep < steps.length - 1 ? (
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => { setCurrentStep(currentStep + 1); setExpandedHelp(false); }}
                                >
                                    {t("ui.get_started.next", "Weiter")} <ArrowRight size={14}/>
                                </button>
                            ) : (
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => {
                                        markComplete(step.id);
                                        navigate("/");
                                    }}
                                >
                                    <Check size={14}/> {t("ui.get_started.finish", "Fertig - zum Dashboard")}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

