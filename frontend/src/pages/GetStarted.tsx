import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api} from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import {toast} from "react-toastify";
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

const ACTION_MAP: Record<string, {label: string; path: string}> = {
    "create-book": {label: "Zum Dashboard", path: "/"},
    "add-chapters": {label: "Buch oeffnen", path: "/"},
    "write-content": {label: "Editor oeffnen", path: "/"},
    "organize": {label: "Buch oeffnen", path: "/"},
    "export": {label: "Buch oeffnen", path: "/"},
    "settings": {label: "Einstellungen oeffnen", path: "/settings"},
    "backup": {label: "Zum Dashboard", path: "/"},
};

interface GuideStep {
    id: string;
    title: string;
    description: string;
    icon: string;
}

export default function GetStarted() {
    const navigate = useNavigate();
    const [steps, setSteps] = useState<GuideStep[]>([]);
    const [currentStep, setCurrentStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<Set<string>>(() => {
        const stored = localStorage.getItem("bibliogon-onboarding");
        return stored ? new Set(JSON.parse(stored)) : new Set();
    });
    const [expandedHelp, setExpandedHelp] = useState(false);
    const [creating, setCreating] = useState(false);

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
            toast.success("Beispielbuch erstellt!");
            navigate(`/book/${book.id}`);
        } catch (err) {
            toast.error(`Fehler: ${err}`);
        }
        setCreating(false);
    };

    const step = steps[currentStep];
    const isComplete = step ? completedSteps.has(step.id) : false;
    const allDone = steps.length > 0 && steps.every((s) => completedSteps.has(s.id));
    const progress = steps.length > 0 ? Math.round((completedSteps.size / steps.length) * 100) : 0;

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <div style={styles.headerInner}>
                    <div style={styles.headerLeft}>
                        <button style={styles.backBtn} onClick={() => navigate("/")}>
                            <ChevronLeft size={18}/>
                        </button>
                        <Rocket size={22} style={{color: "var(--accent)"}}/>
                        <h1 style={styles.title}>Erste Schritte</h1>
                    </div>
                    <div style={{display: "flex", alignItems: "center", gap: 8}}>
                        <button className="btn-icon" onClick={() => navigate("/")} title="Dashboard">
                            <Home size={18}/>
                        </button>
                        <ThemeToggle/>
                    </div>
                </div>
            </header>

            <main style={styles.main}>
                {/* Progress bar */}
                <div style={styles.progressSection}>
                    <div style={styles.progressBar}>
                        <div style={{...styles.progressFill, width: `${progress}%`}}/>
                    </div>
                    <span style={styles.progressText}>
                        {allDone ? "Fertig!" : `Schritt ${currentStep + 1} von ${steps.length}`}
                    </span>
                </div>

                {/* Step indicators */}
                <div style={styles.stepIndicators}>
                    {steps.map((s, i) => (
                        <button
                            key={s.id}
                            onClick={() => setCurrentStep(i)}
                            style={{
                                ...styles.indicator,
                                ...(i === currentStep ? styles.indicatorActive : {}),
                                ...(completedSteps.has(s.id) ? styles.indicatorDone : {}),
                            }}
                        >
                            {completedSteps.has(s.id) ? <Check size={14}/> : i + 1}
                        </button>
                    ))}
                </div>

                {/* All done celebration */}
                {allDone && (
                    <div style={styles.doneCard}>
                        <PartyPopper size={40} style={{color: "var(--accent)"}}/>
                        <h2 style={{fontSize: "1.25rem", fontWeight: 600, marginTop: 12}}>
                            Glueckwunsch!
                        </h2>
                        <p style={{color: "var(--text-secondary)", marginTop: 8}}>
                            Du kennst jetzt alle wichtigen Funktionen von Bibliogon.
                        </p>
                        <div style={{display: "flex", gap: 12, marginTop: 16}}>
                            <button className="btn btn-primary" onClick={() => navigate("/")}>
                                Zum Dashboard
                            </button>
                            <button className="btn btn-ghost" onClick={() => {
                                localStorage.removeItem("bibliogon-onboarding");
                                setCompletedSteps(new Set());
                                setCurrentStep(0);
                            }}>
                                Nochmal starten
                            </button>
                        </div>
                    </div>
                )}

                {/* Current step */}
                {step && !allDone && (
                    <div style={styles.stepCard}>
                        <div style={styles.stepHeader}>
                            <div style={{
                                ...styles.stepIconCircle,
                                ...(isComplete ? {background: "var(--accent-light)", color: "var(--accent)"} : {}),
                            }}>
                                {isComplete ? <Check size={32}/> : (ICON_MAP[step.icon] || <Rocket size={32}/>)}
                            </div>
                            <div style={{flex: 1}}>
                                <h2 style={styles.stepTitle}>{step.title}</h2>
                                <p style={styles.stepDesc}>{step.description}</p>
                            </div>
                        </div>

                        {/* Help toggle */}
                        <button
                            style={styles.helpToggle}
                            onClick={() => setExpandedHelp(!expandedHelp)}
                        >
                            <HelpCircle size={16}/>
                            {expandedHelp ? "Hilfe ausblenden" : "Wie geht das?"}
                            {expandedHelp ? <ChevronLeft size={14} style={{transform: "rotate(-90deg)"}}/> : <ChevronRight size={14} style={{transform: "rotate(90deg)"}}/>}
                        </button>

                        {expandedHelp && (
                            <div style={styles.helpContent}>
                                {step.id === "create-book" && (
                                    <ol style={styles.helpList}>
                                        <li>Gehe zum Dashboard (Startseite)</li>
                                        <li>Klicke den Button "Neues Buch"</li>
                                        <li>Gib Titel und Autor ein (Pseudonym wird aus den Einstellungen geladen)</li>
                                        <li>Waehle die Sprache und klicke "Erstellen"</li>
                                    </ol>
                                )}
                                {step.id === "add-chapters" && (
                                    <ol style={styles.helpList}>
                                        <li>Oeffne ein Buch im Dashboard</li>
                                        <li>Klicke das "+" neben "Inhalt" in der linken Sidebar</li>
                                        <li>Waehle den Kapiteltyp: Kapitel, Vorwort, Epilog, etc.</li>
                                        <li>Das neue Kapitel erscheint in der Sidebar</li>
                                    </ol>
                                )}
                                {step.id === "write-content" && (
                                    <ol style={styles.helpList}>
                                        <li>Klicke auf ein Kapitel in der Sidebar</li>
                                        <li>Der WYSIWYG-Editor oeffnet sich rechts</li>
                                        <li>Nutze die Toolbar fuer Formatierung (Fett, Kursiv, Ueberschriften, etc.)</li>
                                        <li>Wechsle mit dem "Markdown" Button oben rechts in den Markdown-Modus</li>
                                        <li>Aenderungen werden automatisch gespeichert</li>
                                    </ol>
                                )}
                                {step.id === "organize" && (
                                    <ol style={styles.helpList}>
                                        <li>Greife das Griffsymbol links neben einem Kapitel</li>
                                        <li>Ziehe es an die gewuenschte Position</li>
                                        <li>Front Matter, Kapitel und Back Matter sind getrennte Bereiche</li>
                                        <li>Die Bereiche lassen sich auf- und zuklappen</li>
                                    </ol>
                                )}
                                {step.id === "export" && (
                                    <ol style={styles.helpList}>
                                        <li>Klicke "Exportieren..." unten in der Sidebar</li>
                                        <li>Waehle das Format: EPUB, PDF, Word, HTML oder Markdown</li>
                                        <li>Waehle den Buchtyp: E-Book, Taschenbuch oder Hardcover</li>
                                        <li>Bei vorhandenem Inhaltsverzeichnis: Checkbox "Manuelles TOC verwenden"</li>
                                        <li>Klicke "Exportieren" - die Datei wird heruntergeladen</li>
                                    </ol>
                                )}
                                {step.id === "settings" && (
                                    <ol style={styles.helpList}>
                                        <li>Oeffne die Einstellungen ueber das Zahnrad-Icon</li>
                                        <li>Tab "Allgemein": Sprache, Theme, Titel</li>
                                        <li>Tab "Autor": Dein Name und Pseudonyme eintragen</li>
                                        <li>Tab "Plugins": Plugins aktivieren, konfigurieren oder per ZIP installieren</li>
                                    </ol>
                                )}
                                {step.id === "backup" && (
                                    <ol style={styles.helpList}>
                                        <li>Im Dashboard: "Backup" Button erstellt eine .bgb-Datei</li>
                                        <li>Die Datei enthaelt alle Buecher, Kapitel und Bilder</li>
                                        <li>"Restore" stellt ein Backup wieder her</li>
                                        <li>Externe Projekte (.zip, .bgp) koennen ueber "Import" geladen werden</li>
                                    </ol>
                                )}
                            </div>
                        )}

                        {/* Action buttons */}
                        <div style={styles.stepActions}>
                            {step.id === "create-book" && (
                                <button
                                    className="btn btn-ghost"
                                    onClick={handleCreateSampleBook}
                                    disabled={creating}
                                >
                                    <BookPlus size={16}/>
                                    {creating ? "Erstellt..." : "Oder: Beispielbuch erstellen"}
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
                                    <Check size={16}/> Als erledigt markieren
                                </button>
                            )}
                        </div>

                        {/* Navigation */}
                        <div style={styles.navigation}>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={currentStep === 0}
                                onClick={() => { setCurrentStep(currentStep - 1); setExpandedHelp(false); }}
                            >
                                <ArrowLeft size={14}/> Zurueck
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={currentStep === steps.length - 1}
                                onClick={() => { setCurrentStep(currentStep + 1); setExpandedHelp(false); }}
                            >
                                Weiter <ArrowRight size={14}/>
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {minHeight: "100vh", background: "var(--bg-primary)"},
    header: {borderBottom: "1px solid var(--border)", background: "var(--bg-card)"},
    headerInner: {
        maxWidth: 700, margin: "0 auto", padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
    },
    headerLeft: {display: "flex", alignItems: "center", gap: 8},
    backBtn: {
        background: "none", border: "none", cursor: "pointer",
        color: "var(--text-secondary)", display: "flex", alignItems: "center", padding: 4, borderRadius: 4,
    },
    title: {
        fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)",
    },
    main: {maxWidth: 700, margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20},
    progressSection: {display: "flex", alignItems: "center", gap: 12},
    progressBar: {
        flex: 1, height: 6, background: "var(--bg-secondary)", borderRadius: 3, overflow: "hidden",
    },
    progressFill: {
        height: "100%", background: "var(--accent)", borderRadius: 3, transition: "width 300ms ease",
    },
    progressText: {fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-muted)", whiteSpace: "nowrap"},
    stepIndicators: {
        display: "flex", justifyContent: "center", gap: 8,
    },
    indicator: {
        width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--border)",
        background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)",
        cursor: "pointer", transition: "all 150ms",
    },
    indicatorActive: {
        borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-light)",
    },
    indicatorDone: {
        borderColor: "var(--accent)", color: "#fff", background: "var(--accent)",
    },
    doneCard: {
        background: "var(--bg-card)", border: "1px solid var(--accent)",
        borderRadius: "var(--radius-lg)", padding: 32, textAlign: "center",
    },
    stepCard: {
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: 24,
    },
    stepHeader: {
        display: "flex", alignItems: "flex-start", gap: 20,
    },
    stepIconCircle: {
        width: 64, height: 64, borderRadius: "50%", background: "var(--bg-secondary)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-muted)", flexShrink: 0,
    },
    stepTitle: {
        fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 600, marginBottom: 8,
    },
    stepDesc: {
        fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6,
    },
    helpToggle: {
        display: "flex", alignItems: "center", gap: 6, marginTop: 16,
        background: "none", border: "none", cursor: "pointer",
        color: "var(--accent)", fontSize: "0.8125rem", fontWeight: 500,
        fontFamily: "var(--font-body)", padding: 0,
    },
    helpContent: {
        marginTop: 12, padding: 16, background: "var(--bg-secondary)",
        borderRadius: "var(--radius-md)", borderLeft: "3px solid var(--accent)",
    },
    helpList: {
        margin: 0, paddingLeft: 20, fontSize: "0.875rem", lineHeight: 1.8,
        color: "var(--text-secondary)",
    },
    stepActions: {
        display: "flex", alignItems: "center", gap: 12, marginTop: 20,
        flexWrap: "wrap",
    },
    navigation: {
        display: "flex", justifyContent: "space-between", marginTop: 16,
        paddingTop: 16, borderTop: "1px solid var(--border)",
    },
};
