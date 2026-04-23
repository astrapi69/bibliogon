import {useEffect, useState, useRef} from "react";
import {useNavigate} from "react-router-dom";
import {api, Book, BookCreate, BookFromTemplateCreate} from "../api/client";
import CreateBookModal from "../components/CreateBookModal";
import BookCard from "../components/BookCard";
import DashboardFilterBar from "../components/DashboardFilterBar";
import DashboardFilterSheet from "../components/DashboardFilterSheet";
import {useBookFilters} from "../hooks/useBookFilters";
import {
    Plus, BookOpen, Download, Upload, FolderUp,
    Settings, HelpCircle, Rocket, Trash2, RotateCcw, Trash, ChevronLeft,
    Menu, Search, History, ChevronDown, ChevronUp, GitCompare, SlidersHorizontal,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import BackupCompareDialog from "../components/BackupCompareDialog";
import { ImportWizardModal } from "../components/import-wizard";
import ThemeToggle from "../components/ThemeToggle";
import {useTheme} from "../hooks/useTheme";
import {Moon, Sun} from "lucide-react";
import {useDialog} from "../components/AppDialog";
import {notify} from "../utils/notify";
import {useI18n} from "../hooks/useI18n";
import {useHelp} from "../contexts/HelpContext";
import {getDonationsConfig, type DonationsConfig} from "../components/SupportSection";
import DonationOnboardingDialog, {shouldShowDonationOnboarding} from "../components/DonationOnboardingDialog";
import DonationReminderBanner, {shouldShowReminder} from "../components/DonationReminderBanner";

export default function Dashboard() {
    const dialog = useDialog();
    const {openHelp} = useHelp();
    const {t} = useI18n();
    const {theme, toggle: toggleTheme} = useTheme();
    const [books, setBooks] = useState<Book[]>([]);
    const [trash, setTrash] = useState<Book[]>([]);
    const [showTrash, setShowTrash] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [backupHistory, setBackupHistory] = useState<{timestamp: string; action: string; book_count: number; filename: string}[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showCompareDialog, setShowCompareDialog] = useState(false);
    const [filterSheetOpen, setFilterSheetOpen] = useState(false);
    const [donationsConfig, setDonationsConfig] = useState<DonationsConfig | null>(null);
    const [showDonationOnboarding, setShowDonationOnboarding] = useState(false);
    const [reminderVisible, setReminderVisible] = useState(false);
    const [importWizardOpen, setImportWizardOpen] = useState(false);
    const navigate = useNavigate();
    const filters = useBookFilters(books, t);
    const importInputRef = useRef<HTMLInputElement>(null);

    const loadBooks = async () => {
        try {
            const data = await api.books.list();
            setBooks(data);
        } catch (err) {
            console.error("Failed to load books:", err);
        } finally {
            setLoading(false);
        }
    };

    const loadTrash = async () => {
        try {
            const data = await api.books.listTrash();
            setTrash(data);
        } catch (err) {
            console.error("Failed to load trash:", err);
        }
    };

    useEffect(() => {
        loadBooks();
        loadTrash();
        // Load donation config once per mount for S-02 / S-03 logic.
        // Failure is non-critical; donations stay hidden if it fails.
        api.settings.getApp()
            .then((config) => {
                const donations = getDonationsConfig(config);
                setDonationsConfig(donations);
                setReminderVisible(shouldShowReminder(donations));
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (showHistory) {
            api.backup.history(20).then(setBackupHistory).catch(() => {});
        }
    }, [showHistory]);

    const maybeShowDonationOnboarding = (wasFirstBook: boolean) => {
        if (!wasFirstBook) return;
        if (!donationsConfig) return;
        if (!shouldShowDonationOnboarding()) return;
        setShowDonationOnboarding(true);
    };

    const handleCreate = async (data: BookCreate) => {
        const wasFirstBook = books.length === 0;
        const book = await api.books.create(data);
        setBooks((prev) => [book, ...prev]);
        setShowModal(false);
        maybeShowDonationOnboarding(wasFirstBook);
    };

    const handleCreateFromTemplate = async (data: BookFromTemplateCreate) => {
        const wasFirstBook = books.length === 0;
        const book = await api.books.createFromTemplate(data);
        setBooks((prev) => [book, ...prev]);
        setShowModal(false);
        maybeShowDonationOnboarding(wasFirstBook);
    };

    const handleDelete = async (id: string) => {
        await api.books.delete(id);
        setBooks((prev) => prev.filter((b) => b.id !== id));
        loadTrash();
        notify.info(t("ui.dashboard.moved_to_trash", "In den Papierkorb verschoben"));
    };

    const handleDeletePermanent = async (id: string) => {
        if (!await dialog.confirm(
            t("ui.dashboard.delete_permanent_title", "Endgueltig loeschen"),
            t("ui.dashboard.delete_permanent_warning", "Das Buch wird unwiderruflich geloescht. Diese Aktion kann NICHT rueckgaengig gemacht werden. Nur fuer erfahrene Benutzer."),
            "danger",
        )) return;
        await api.books.delete(id);
        try { await api.books.permanentDelete(id); } catch { /* already in trash */ }
        setBooks((prev) => prev.filter((b) => b.id !== id));
        notify.success(t("ui.dashboard.deleted_permanently", "Buch endgueltig geloescht"));
    };

    const handleRestore = async (id: string) => {
        await api.books.restore(id);
        setTrash((prev) => prev.filter((b) => b.id !== id));
        loadBooks();
    };

    const handlePermanentDelete = async (id: string) => {
        if (!await dialog.confirm(t("ui.dashboard.delete_permanent_title", "Endgueltig loeschen"), t("ui.dashboard.delete_permanent_warning", "Buch endgueltig loeschen? Dies kann nicht rueckgaengig gemacht werden."), "danger")) return;
        await api.books.permanentDelete(id);
        setTrash((prev) => prev.filter((b) => b.id !== id));
    };

    const handleEmptyTrash = async () => {
        if (!await dialog.confirm(t("ui.dashboard.empty_trash_title", "Papierkorb leeren"), t("ui.dashboard.empty_trash_warning", "Alle Buecher im Papierkorb werden unwiderruflich geloescht. Diese Aktion kann nicht rueckgaengig gemacht werden."), "danger")) return;
        await api.books.emptyTrash();
        setTrash([]);
    };

    const handleBackupExport = () => {
        window.open(api.backup.exportUrl(), "_blank");
    };

    const handleSmartImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const {type, result} = await api.backup.smartImport(file);
            if (type === "backup") {
                notify.success(`${result.imported_books} ${t("ui.dashboard.backup_imported", "Bücher importiert")}`);
            } else if (type === "project" || type === "template") {
                notify.success(`"${result.title}" - ${result.chapter_count} ${t("ui.dashboard.chapters_imported", "Kapitel importiert")}`);
            } else if (type === "markdown") {
                notify.success(`"${result.title}" - ${result.chapter_count} ${t("ui.dashboard.chapters_imported", "Kapitel importiert")}`);
            } else if (type === "chapter") {
                notify.success(`${t("ui.dashboard.chapters_imported", "Kapitel importiert")}`);
            }
            loadBooks();
        } catch (err) {
            notify.error(`${t("ui.dashboard.import_failed", "Import fehlgeschlagen")}: ${err}`, err);
        }
        e.target.value = "";
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerInner}>
                    <div style={styles.logo} onClick={() => navigate("/")} role="button" title="Dashboard">
                        <BookOpen size={28} strokeWidth={1.5}/>
                        <h1 style={styles.logoText}>Bibliogon</h1>
                    </div>
                    <div style={styles.headerActions}>
                        {/* Always visible */}
                        <button className="btn btn-primary" onClick={() => setShowModal(true)} data-testid="new-book-btn">
                            <Plus size={16}/> <span className="hide-mobile">{t("ui.dashboard.new_book", "Neues Buch")}</span>
                        </button>

                        {/* Desktop: inline buttons */}
                        <div className="hide-mobile" style={{display: "flex", alignItems: "center", gap: 6}}>
                            <div style={styles.headerSeparator}/>
                            <button
                                className="btn btn-secondary btn-sm"
                                data-testid="backup-export-btn"
                                onClick={handleBackupExport}
                                disabled={books.length === 0}
                            >
                                <Download size={14}/> {t("ui.dashboard.backup", "Backup")}
                            </button>
                            <button className="btn btn-secondary btn-sm" data-testid="backup-import-btn" onClick={() => importInputRef.current?.click()}>
                                <Upload size={14}/> {t("ui.dashboard.import", "Importieren")}
                            </button>
                            <button className="btn btn-secondary btn-sm" data-testid="import-wizard-btn" onClick={() => setImportWizardOpen(true)}>
                                <Upload size={14}/> {t("ui.dashboard.import_new", "Import (New)")}
                            </button>
                            <div style={styles.headerSeparator}/>
                            <button className="btn-icon" onClick={() => navigate("/get-started")} title={t("ui.get_started.title", "Erste Schritte")}>
                                <Rocket size={18}/>
                            </button>
                            <button className="btn-icon" onClick={() => openHelp()} title={t("ui.dashboard.help", "Hilfe")}>
                                <HelpCircle size={18}/>
                            </button>
                            <button className="btn-icon" onClick={() => navigate("/settings")} title={t("ui.settings.title", "Einstellungen")}>
                                <Settings size={18}/>
                            </button>
                            <button
                                className="btn-icon"
                                data-testid="trash-toggle"
                                onClick={() => setShowTrash(!showTrash)}
                                style={showTrash ? {color: "var(--accent)"} : undefined}
                            >
                                <Trash2 size={18}/>
                                {trash.length > 0 && (
                                    <span style={styles.trashBadge} data-testid="trash-badge">
                                        {trash.length}
                                    </span>
                                )}
                            </button>
                            <ThemeToggle/>
                        </div>

                        {/* Mobile: hamburger menu */}
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button className="btn-icon show-mobile-only">
                                    <Menu size={20}/>
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content className="hamburger-menu-content" align="end" sideOffset={4}>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={handleBackupExport}>
                                        <Download size={16}/> {t("ui.dashboard.backup", "Backup")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => importInputRef.current?.click()}>
                                        <Upload size={16}/> {t("ui.dashboard.import", "Importieren")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator"/>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => navigate("/get-started")}>
                                        <Rocket size={16}/> {t("ui.get_started.title", "Erste Schritte")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => openHelp()}>
                                        <HelpCircle size={16}/> {t("ui.dashboard.help", "Hilfe")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => navigate("/settings")}>
                                        <Settings size={16}/> {t("ui.settings.title", "Einstellungen")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator"/>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => setShowTrash(!showTrash)}>
                                        <Trash2 size={16}/> {t("ui.dashboard.trash", "Papierkorb")} {trash.length > 0 && `(${trash.length})`}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={(e) => { e.preventDefault(); toggleTheme(); }}>
                                        {theme === "dark"
                                            ? <><Sun size={16}/> {t("ui.dashboard.light_mode", "Light Mode")}</>
                                            : <><Moon size={16}/> {t("ui.dashboard.dark_mode", "Dark Mode")}</>}
                                    </DropdownMenu.Item>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>

                        <input ref={importInputRef} data-testid="backup-import-input" type="file" accept=".bgb,.bgp,.zip,.md" style={{display: "none"}} onChange={handleSmartImport}/>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main style={styles.main}>
                {donationsConfig && reminderVisible && !showTrash ? (
                    <DonationReminderBanner
                        donations={donationsConfig}
                        onDismiss={() => setReminderVisible(false)}
                    />
                ) : null}
                {showTrash ? (
                    /* Trash view */
                    <div data-testid="trash-view">
                        <div style={styles.mainHeader}>
                            <button className="btn-icon" onClick={() => setShowTrash(false)} title={t("ui.dashboard.back", "Zurück")}>
                                <ChevronLeft size={18}/>
                            </button>
                            <Trash2 size={20} style={{color: "var(--text-muted)"}}/>
                            <h2 style={styles.mainTitle}>{t("ui.dashboard.trash", "Papierkorb")}</h2>
                            <span style={styles.bookCount}>{trash.length} {trash.length === 1 ? t("ui.dashboard.book_singular", "Buch") : t("ui.dashboard.book_plural", "Bücher")}</span>
                            <div style={{flex: 1}}/>
                            {trash.length > 0 && (
                                <button
                                    className="btn btn-danger btn-sm"
                                    data-testid="trash-empty"
                                    onClick={handleEmptyTrash}
                                >
                                    <Trash size={14}/> {t("ui.dashboard.empty_trash", "Papierkorb leeren")}
                                </button>
                            )}
                        </div>
                        {trash.length === 0 ? (
                            <div style={styles.emptyState} data-testid="trash-empty-state">
                                <Trash2 size={48} strokeWidth={1} color="var(--text-muted)"/>
                                <p style={styles.emptyTitle}>{t("ui.dashboard.trash_empty", "Papierkorb ist leer")}</p>
                            </div>
                        ) : (
                            <div style={styles.grid}>
                                {trash.map((book) => (
                                    <div
                                        key={book.id}
                                        style={styles.trashCard}
                                        data-testid={`trash-card-${book.id}`}
                                    >
                                        <div style={{flex: 1}}>
                                            <strong>{book.title}</strong>
                                            <p style={{color: "var(--text-muted)", fontSize: "0.8125rem"}}>{book.author}</p>
                                        </div>
                                        <div style={{display: "flex", gap: 6, flexShrink: 0}}>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                data-testid={`trash-restore-${book.id}`}
                                                onClick={() => handleRestore(book.id)}
                                            >
                                                <RotateCcw size={12}/> {t("ui.dashboard.restore_book", "Wiederherstellen")}
                                            </button>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                data-testid={`trash-delete-permanent-${book.id}`}
                                                onClick={() => handlePermanentDelete(book.id)}
                                            >
                                                <Trash size={12}/> {t("ui.dashboard.delete_permanent", "Endgueltig loeschen")}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : loading ? (
                    <p style={styles.empty}>{t("ui.common.loading", "Laden...")}</p>
                ) : books.length === 0 ? (
                    <div style={styles.emptyState}>
                        <BookOpen size={56} strokeWidth={1} color="var(--text-muted)"/>
                        <p style={styles.emptyTitle}>{t("ui.dashboard.welcome", "Willkommen bei Bibliogon")}</p>
                        <p style={styles.emptyText}>
                            {t("ui.dashboard.welcome_text", "Erstelle dein erstes Buch, importiere ein bestehendes Projekt, oder schaue dir die Erste-Schritte-Anleitung an.")}
                        </p>
                        <div style={{display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", justifyContent: "center"}}>
                            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                                <Plus size={16}/> {t("ui.dashboard.create_book", "Buch erstellen")}
                            </button>
                            <button className="btn btn-secondary" onClick={() => importInputRef.current?.click()}>
                                <FolderUp size={16}/> {t("ui.dashboard.import_project", "Projekt importieren")}
                            </button>
                            <button className="btn btn-secondary" onClick={() => navigate("/get-started")}>
                                <Rocket size={16}/> {t("ui.get_started.title", "Erste Schritte")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={styles.mainHeader}>
                            <h2 style={styles.mainTitle}>{t("ui.dashboard.title", "Meine Bücher")}</h2>
                            <span style={styles.bookCount}>{books.length} {books.length === 1 ? t("ui.dashboard.book_singular", "Buch") : t("ui.dashboard.book_plural", "Bücher")}</span>
                        </div>
                        {books.length > 1 && (
                            <>
                                <div className="hide-mobile">
                                    <DashboardFilterBar filters={filters}/>
                                </div>
                                <button
                                    className="btn btn-secondary btn-sm show-mobile-only"
                                    data-testid="filter-sheet-trigger"
                                    onClick={() => setFilterSheetOpen(true)}
                                    style={{marginBottom: 8}}
                                >
                                    <SlidersHorizontal size={14}/> {t("ui.dashboard.filters", "Filter")}
                                </button>
                                <DashboardFilterSheet
                                    filters={filters}
                                    open={filterSheetOpen}
                                    onOpenChange={setFilterSheetOpen}
                                />
                            </>
                        )}
                        {filters.filteredBooks.length === 0 && books.length > 0 && !loading ? (
                            <div style={styles.emptyState} data-testid="filter-empty-state">
                                <Search size={48} strokeWidth={1} color="var(--text-muted)"/>
                                <p style={styles.emptyTitle}>{t("ui.dashboard.empty_filtered", "Keine Treffer")}</p>
                                <p style={styles.emptyText}>
                                    {t("ui.dashboard.empty_filtered_hint", "Es gibt keine Bücher die zu den aktuellen Filtern passen.")}
                                </p>
                                <button
                                    className="btn btn-secondary"
                                    data-testid="filter-reset-empty"
                                    onClick={filters.resetFilters}
                                >
                                    {t("ui.dashboard.reset_filters", "Filter zurücksetzen")}
                                </button>
                            </div>
                        ) : (
                            <div style={styles.grid}>
                                {filters.filteredBooks.map((book) => (
                                    <BookCard
                                        key={book.id}
                                        book={book}
                                        onClick={() => navigate(`/book/${book.id}`)}
                                        onDelete={() => handleDelete(book.id)}
                                        onDeletePermanent={() => handleDeletePermanent(book.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
                {/* Version History */}
                <div style={{marginTop: 32}}>
                    <div style={{display: "flex", alignItems: "center", gap: 8}}>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowHistory(!showHistory)}
                            style={{gap: 6}}
                        >
                            {showHistory ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            <History size={14}/> {t("ui.dashboard.version_history", "Versionsgeschichte")}
                            {backupHistory.length > 0 && ` (${backupHistory.length})`}
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowCompareDialog(true)}
                            style={{gap: 6}}
                            title={t("ui.dashboard.compare_backups_tooltip", "Zwei .bgb-Dateien aus dem Dateisystem vergleichen")}
                        >
                            <GitCompare size={14}/> {t("ui.dashboard.compare_backups", "Backups vergleichen")}
                        </button>
                    </div>
                    {showHistory && (
                        <div style={{marginTop: 8}}>
                            {backupHistory.length === 0 ? (
                                <p style={{color: "var(--text-muted)", fontSize: "0.875rem", padding: "8px 0"}}>
                                    {t("ui.dashboard.no_history", "Noch keine Backups erstellt.")}
                                </p>
                            ) : (
                                <div style={{display: "flex", flexDirection: "column", gap: 4}}>
                                    {backupHistory.map((entry, i) => (
                                        <div key={i} style={{
                                            display: "flex", alignItems: "center", gap: 12,
                                            padding: "8px 12px", borderRadius: "var(--radius-sm)",
                                            background: "var(--bg-card)", border: "1px solid var(--border)",
                                            fontSize: "0.8125rem",
                                        }}>
                                            <span style={{
                                                padding: "2px 6px", borderRadius: 3, fontSize: "0.6875rem",
                                                fontWeight: 600, textTransform: "uppercase",
                                                background: entry.action === "backup" ? "var(--accent-light)" : "rgba(34,197,94,0.12)",
                                                color: entry.action === "backup" ? "var(--accent)" : "#16a34a",
                                            }}>
                                                {entry.action}
                                            </span>
                                            <span style={{color: "var(--text-secondary)"}}>
                                                {new Date(entry.timestamp).toLocaleString()}
                                            </span>
                                            <span>{entry.book_count} {t("ui.dashboard.book_plural", "Buecher")}</span>
                                            {entry.filename && (
                                                <span style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                                                    {entry.filename}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            <CreateBookModal
                open={showModal}
                onClose={() => setShowModal(false)}
                onCreate={handleCreate}
                onCreateFromTemplate={handleCreateFromTemplate}
            />
            <BackupCompareDialog
                open={showCompareDialog}
                onClose={() => setShowCompareDialog(false)}
            />
            <ImportWizardModal
                open={importWizardOpen}
                onClose={() => setImportWizardOpen(false)}
                onImported={() => loadBooks()}
            />
            {donationsConfig ? (
                <DonationOnboardingDialog
                    open={showDonationOnboarding}
                    onClose={() => setShowDonationOnboarding(false)}
                    donations={donationsConfig}
                />
            ) : null}
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {minHeight: "100vh", background: "var(--bg-primary)"},
    header: {borderBottom: "1px solid var(--border)", background: "var(--bg-card)"},
    headerInner: {
        maxWidth: 1100, margin: "0 auto", padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
    },
    logo: {display: "flex", alignItems: "center", gap: 10, color: "var(--accent)", flexShrink: 0, cursor: "pointer"},
    logoText: {
        fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 600,
        color: "var(--text-primary)", letterSpacing: "-0.02em",
    },
    headerActions: {
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end",
    },
    headerSeparator: {width: 1, height: 24, background: "var(--border)", margin: "0 4px"},
    trashBadge: {
        position: "absolute" as const, top: -4, right: -4,
        background: "var(--danger)", color: "white", fontSize: "0.625rem",
        fontWeight: 700, width: 16, height: 16, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
    },
    main: {maxWidth: 1100, margin: "0 auto", padding: "32px 24px"},
    mainHeader: {
        display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
    },
    mainTitle: {
        fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 600,
        color: "var(--text-primary)",
    },
    bookCount: {fontSize: "0.875rem", color: "var(--text-muted)"},
    grid: {
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20,
    },
    empty: {textAlign: "center" as const, color: "var(--text-muted)", marginTop: 80},
    emptyState: {
        display: "flex", flexDirection: "column" as const, alignItems: "center", marginTop: 80, gap: 8,
    },
    emptyTitle: {
        fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 600, marginTop: 16,
    },
    emptyText: {
        color: "var(--text-muted)", fontSize: "0.9375rem",
        textAlign: "center" as const, maxWidth: 480, lineHeight: 1.6,
    },
    trashCard: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap" as const,
        gap: 12, padding: 16, background: "var(--bg-card)",
        border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
    },
};
