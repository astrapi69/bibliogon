import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api} from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import {ChevronLeft, Keyboard, HelpCircle, Info, Home} from "lucide-react";
import {useI18n} from "../hooks/useI18n";
import * as Tabs from "@radix-ui/react-tabs";
import styles from "./Help.module.css";

export default function Help() {
    const navigate = useNavigate();
    const {t, lang} = useI18n();
    const [shortcuts, setShortcuts] = useState<{keys: string; action: string}[]>([]);
    const [faq, setFaq] = useState<{question: string; answer: string}[]>([]);
    const [about, setAbout] = useState<Record<string, string>>({});

    useEffect(() => {
        api.help.shortcuts(lang).then(setShortcuts).catch(() => {});
        api.help.faq(lang).then(setFaq).catch(() => {});
        api.help.about().then(setAbout).catch(() => {});
    }, [lang]);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <div className={styles.headerLeft}>
                        <button className={styles.backBtn} onClick={() => navigate("/")}>
                            <ChevronLeft size={18}/>
                        </button>
                        <h1 className={styles.title}>{t("ui.help.title", "Hilfe")}</h1>
                    </div>
                    <div className="icon-row">
                        <button className="btn-icon" onClick={() => navigate("/")} title={t("ui.dashboard.title", "Dashboard")}>
                            <Home size={18}/>
                        </button>
                        <ThemeToggle/>
                    </div>
                </div>
            </header>

            <Tabs.Root defaultValue="shortcuts">
                <Tabs.List className="radix-tabs-list">
                    <Tabs.Trigger value="shortcuts" className="radix-tab-trigger">
                        <Keyboard size={14}/> {t("ui.help.shortcuts_tab", "Tastenkürzel")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="faq" className="radix-tab-trigger">
                        <HelpCircle size={14}/> FAQ
                    </Tabs.Trigger>
                    <Tabs.Trigger value="about" className="radix-tab-trigger">
                        <Info size={14}/> {t("ui.help.about_tab", "Über")}
                    </Tabs.Trigger>
                </Tabs.List>

            <main className={styles.main}>
                <Tabs.Content value="shortcuts">
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>{t("ui.help.shortcuts_tab", "Tastenkürzel")}</h2>
                        <div className={styles.card}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.th}>{t("ui.help.key_column", "Taste")}</th>
                                        <th className={styles.th}>{t("ui.help.action_column", "Aktion")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shortcuts.map((s, i) => (
                                        <tr key={i}>
                                            <td className={styles.td}>
                                                <kbd className={styles.kbd}>{s.keys}</kbd>
                                            </td>
                                            <td className={styles.td}>{s.action}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Tabs.Content>

                <Tabs.Content value="faq">
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>{t("ui.help.faq_title", "Häufig gestellte Fragen")}</h2>
                        {faq.map((item, i) => (
                            <div key={i} className={styles.card}>
                                <h3 className={styles.faqQuestion}>{item.question}</h3>
                                <p className={styles.faqAnswer}>{item.answer}</p>
                            </div>
                        ))}
                    </div>
                </Tabs.Content>

                <Tabs.Content value="about">
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>{t("ui.help.about_title", "Über Bibliogon")}</h2>
                        <div className={styles.card}>
                            <p><strong>{about.name}</strong></p>
                            <p style={{color: "var(--text-muted)", marginTop: 8}}>{about.description}</p>
                            <p style={{marginTop: 12}}>
                                {t("ui.help.license", "Lizenz")}: <strong>{about.license}</strong>
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
