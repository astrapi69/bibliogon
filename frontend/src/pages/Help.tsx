import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api} from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import {ChevronLeft, Keyboard, HelpCircle, Info, Home} from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";

export default function Help() {
    const navigate = useNavigate();
    const [shortcuts, setShortcuts] = useState<{keys: string; action: string}[]>([]);
    const [faq, setFaq] = useState<{question: string; answer: string}[]>([]);
    const [about, setAbout] = useState<Record<string, string>>({});

    useEffect(() => {
        api.help.shortcuts("de").then(setShortcuts).catch(() => {});
        api.help.faq("de").then(setFaq).catch(() => {});
        api.help.about().then(setAbout).catch(() => {});
    }, []);

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <div style={styles.headerInner}>
                    <div style={styles.headerLeft}>
                        <button style={styles.backBtn} onClick={() => navigate("/")}>
                            <ChevronLeft size={18}/>
                        </button>
                        <h1 style={styles.title}>Hilfe</h1>
                    </div>
                    <div style={{display: "flex", alignItems: "center", gap: 8}}>
                        <button className="btn-icon" onClick={() => navigate("/")} title="Dashboard">
                            <Home size={18}/>
                        </button>
                        <ThemeToggle/>
                    </div>
                </div>
            </header>

            <Tabs.Root defaultValue="shortcuts">
                <Tabs.List className="radix-tabs-list">
                    <Tabs.Trigger value="shortcuts" className="radix-tab-trigger">
                        <Keyboard size={14}/> Tastenkuerzel
                    </Tabs.Trigger>
                    <Tabs.Trigger value="faq" className="radix-tab-trigger">
                        <HelpCircle size={14}/> FAQ
                    </Tabs.Trigger>
                    <Tabs.Trigger value="about" className="radix-tab-trigger">
                        <Info size={14}/> Ueber
                    </Tabs.Trigger>
                </Tabs.List>

            <main style={styles.main}>
                <Tabs.Content value="shortcuts">
                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>Tastenkuerzel</h2>
                        <div style={styles.card}>
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={styles.th}>Taste</th>
                                        <th style={styles.th}>Aktion</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shortcuts.map((s, i) => (
                                        <tr key={i}>
                                            <td style={styles.td}>
                                                <kbd style={styles.kbd}>{s.keys}</kbd>
                                            </td>
                                            <td style={styles.td}>{s.action}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Tabs.Content>

                <Tabs.Content value="faq">
                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>Haeufig gestellte Fragen</h2>
                        {faq.map((item, i) => (
                            <div key={i} style={styles.card}>
                                <h3 style={styles.faqQuestion}>{item.question}</h3>
                                <p style={styles.faqAnswer}>{item.answer}</p>
                            </div>
                        ))}
                    </div>
                </Tabs.Content>

                <Tabs.Content value="about">
                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>Ueber Bibliogon</h2>
                        <div style={styles.card}>
                            <p><strong>{about.name}</strong></p>
                            <p style={{color: "var(--text-muted)", marginTop: 8}}>{about.description}</p>
                            <p style={{marginTop: 12}}>
                                Lizenz: <strong>{about.license}</strong>
                            </p>
                            <p style={{marginTop: 4}}>
                                Website: <a href={about.website} target="_blank" rel="noreferrer"
                                    style={{color: "var(--accent)"}}>{about.website}</a>
                            </p>
                        </div>
                    </div>
                </Tabs.Content>
            </main>
            </Tabs.Root>
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
    main: {maxWidth: 900, margin: "0 auto", padding: "24px"},
    section: {display: "flex", flexDirection: "column", gap: 16},
    sectionTitle: {
        fontFamily: "var(--font-display)", fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)",
    },
    card: {
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: 20,
    },
    table: {width: "100%", borderCollapse: "collapse" as const},
    th: {
        textAlign: "left" as const, padding: "8px 12px", borderBottom: "1px solid var(--border)",
        fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)",
    },
    td: {padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: "0.9375rem"},
    kbd: {
        display: "inline-block", padding: "2px 8px", background: "var(--bg-secondary)",
        border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)",
        fontSize: "0.8125rem", fontWeight: 500,
    },
    faqQuestion: {fontSize: "1rem", fontWeight: 600, marginBottom: 8},
    faqAnswer: {color: "var(--text-secondary)", lineHeight: 1.6},
};
