import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api} from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import {useDialog} from "../components/AppDialog";
import {
    ChevronLeft, BookPlus, FilePlus, PenTool, GripVertical,
    Download, Settings, Archive, Rocket, Check,
} from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
    "book-plus": <BookPlus size={24}/>,
    "file-plus": <FilePlus size={24}/>,
    "pen-tool": <PenTool size={24}/>,
    "grip-vertical": <GripVertical size={24}/>,
    "download": <Download size={24}/>,
    "settings": <Settings size={24}/>,
    "archive": <Archive size={24}/>,
};

interface GuideStep {
    id: string;
    title: string;
    description: string;
    icon: string;
}

export default function GetStarted() {
    const navigate = useNavigate();
    const dlg = useDialog();
    const [steps, setSteps] = useState<GuideStep[]>([]);
    const [completedSteps, setCompletedSteps] = useState<Set<string>>(() => {
        const stored = localStorage.getItem("bibliogon-onboarding");
        return stored ? new Set(JSON.parse(stored)) : new Set();
    });
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        api.getStarted.guide("de").then(setSteps).catch(() => {});
    }, []);

    const toggleStep = (id: string) => {
        setCompletedSteps((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
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
            navigate(`/book/${book.id}`);
        } catch (err) {
            await dlg.alert("Fehler", `${err}`, "danger");
        }
        setCreating(false);
    };

    const progress = steps.length > 0
        ? Math.round((completedSteps.size / steps.length) * 100)
        : 0;

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
                    <ThemeToggle/>
                </div>
            </header>

            <main style={styles.main}>
                {/* Progress */}
                <div style={styles.progressSection}>
                    <div style={styles.progressBar}>
                        <div style={{...styles.progressFill, width: `${progress}%`}}/>
                    </div>
                    <span style={styles.progressText}>{progress}% abgeschlossen</span>
                </div>

                {/* Sample book button */}
                <div style={styles.card}>
                    <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                        <div>
                            <h3 style={{fontSize: "1rem", fontWeight: 600}}>Beispielbuch erstellen</h3>
                            <p style={{color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4}}>
                                Erstelle ein Buch mit Beispielkapiteln, um Bibliogon kennenzulernen.
                            </p>
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={handleCreateSampleBook}
                            disabled={creating}
                        >
                            <BookPlus size={16}/>
                            {creating ? "Erstellt..." : "Beispielbuch erstellen"}
                        </button>
                    </div>
                </div>

                {/* Steps */}
                <h2 style={styles.sectionTitle}>Schritt fuer Schritt</h2>
                <div style={styles.stepsGrid}>
                    {steps.map((step) => {
                        const done = completedSteps.has(step.id);
                        return (
                            <div
                                key={step.id}
                                style={{...styles.stepCard, ...(done ? styles.stepDone : {})}}
                                onClick={() => toggleStep(step.id)}
                            >
                                <div style={styles.stepIcon}>
                                    {done ? (
                                        <Check size={24} style={{color: "var(--accent)"}}/>
                                    ) : (
                                        ICON_MAP[step.icon] || <Rocket size={24}/>
                                    )}
                                </div>
                                <h3 style={styles.stepTitle}>{step.title}</h3>
                                <p style={styles.stepDesc}>{step.description}</p>
                                {done && (
                                    <span style={styles.checkBadge}>Erledigt</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </main>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {minHeight: "100vh", background: "var(--bg-primary)"},
    header: {borderBottom: "1px solid var(--border)", background: "var(--bg-card)"},
    headerInner: {
        maxWidth: 900, margin: "0 auto", padding: "16px 24px",
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
    main: {maxWidth: 900, margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20},
    progressSection: {display: "flex", alignItems: "center", gap: 12},
    progressBar: {
        flex: 1, height: 8, background: "var(--bg-secondary)", borderRadius: 4, overflow: "hidden",
    },
    progressFill: {
        height: "100%", background: "var(--accent)", borderRadius: 4, transition: "width 300ms ease",
    },
    progressText: {fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-muted)", whiteSpace: "nowrap"},
    card: {
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: 20,
    },
    sectionTitle: {
        fontFamily: "var(--font-display)", fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)",
    },
    stepsGrid: {
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16,
    },
    stepCard: {
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: 20, cursor: "pointer",
        transition: "all 150ms", position: "relative",
    },
    stepDone: {borderColor: "var(--accent)", background: "var(--accent-light)"},
    stepIcon: {marginBottom: 12, color: "var(--text-muted)"},
    stepTitle: {fontSize: "0.9375rem", fontWeight: 600, marginBottom: 6},
    stepDesc: {fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5},
    checkBadge: {
        position: "absolute", top: 12, right: 12,
        fontSize: "0.6875rem", fontWeight: 600, color: "var(--accent)",
        background: "var(--accent-light)", padding: "2px 8px", borderRadius: 4,
    },
};
