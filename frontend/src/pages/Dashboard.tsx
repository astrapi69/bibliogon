import {useEffect, useRef, useState} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {api, ApiError, Book} from "../api/client";
import {getStorage} from "../storage";
import WritingGoalWidget from "../components/WritingGoalWidget";
import NewFromTemplateButton from "../components/NewFromTemplateButton";
import BulkTemplateImportDialog from "../components/BulkTemplateImportDialog";
import FieldClassDialog, {type FieldClassDialogResult} from "../components/FieldClassDialog";
import BulkAiFillConfirmDialog from "../components/BulkAiFillConfirmDialog";
import BookCard from "../components/BookCard";
import BookListView from "../components/BookListView";
import BookBulkActionBar, {
    type BookBulkExportFormat,
    BOOK_BULK_LIMIT_HARD,
} from "../components/BookBulkActionBar";
import TypeToConfirmDialog from "../components/dialogs/TypeToConfirmDialog";
import { formatActiveBookFilters } from "../utils/formatActiveFilters";
import {useBookSelection} from "../components/useBookSelection";
import ViewToggle from "../components/ViewToggle";
import { useTrashViewMode, useViewMode } from "../hooks/useViewMode";
import PageSizeSelector from "../components/PageSizeSelector";
import { usePagedList } from "../hooks/usePagedList";
import DashboardFilterBar from "../components/DashboardFilterBar";
import DashboardFilterSheet from "../components/DashboardFilterSheet";
import {useBookFilters} from "../hooks/useBookFilters";
import {useBookTypes, bookTypeDefaultTitleKey} from "../hooks/useBookTypes";
import {BookTypeIcon} from "../utils/bookTypeIcon";
import SplitButton, {type SplitButtonDropdownItem} from "../components/SplitButton";
import {
    Plus, BookOpen, Download, Upload, FolderUp,
    Settings, HelpCircle, Rocket, Trash2, RotateCcw, Trash, ChevronLeft,
    Menu, Search, SlidersHorizontal, FileText,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ImportWizardModal } from "../components/import-wizard";
import TrashCard from "../components/trash/TrashCard";
import styles from "./Dashboard.module.css";
import FullscreenButton from "../components/FullscreenButton";
import ThemeToggle from "../components/ThemeToggle";
import {useTheme} from "../hooks/useTheme";
import {Moon, Sun} from "lucide-react";
import {useDialog} from "../components/AppDialog";
import {notify} from "../utils/notify";
import {useI18n} from "../hooks/useI18n";
import {useOfflineFeatureGate} from "../storage/useOfflineFeatureGate";
import {useHelp} from "../contexts/HelpContext";
import {getDonationsConfig, type DonationsConfig} from "../components/SupportSection";
import DonationOnboardingDialog, {shouldShowDonationOnboarding} from "../components/DonationOnboardingDialog";
// v0.35.1 (2026-05-18): DonationReminderBanner lifted from Dashboard
// to App.tsx (App-level mount per user-direction "panel ganz oben am
// Anfang"). Dashboard keeps DonationsConfig + OnboardingDialog only.
import {EmptyState} from "../components/EmptyState";
import {LoadingIndicator} from "../components/LoadingIndicator";

export default function Dashboard() {
    const dialog = useDialog();
    const bookTypesSnapshot = useBookTypes();
    const {openHelp} = useHelp();
    const {t} = useI18n();
    // Offline (Dexie/GitHub-Pages) gate: backend-only features (.bgb
    // backup/export, import) are disabled with a "needs desktop app" hint.
    const {offline: offlineGate, message: offlineMsg} = useOfflineFeatureGate();
    const {theme, toggle: toggleTheme} = useTheme();
    const [books, setBooks] = useState<Book[]>([]);
    const [trash, setTrash] = useState<Book[]>([]);
    const [showTrash, setShowTrash] = useState(false);
    const [loading, setLoading] = useState(true);
    const [filterSheetOpen, setFilterSheetOpen] = useState(false);
    const [donationsConfig, setDonationsConfig] = useState<DonationsConfig | null>(null);
    // CONFIGURABLE-DEFAULT-CONTENT-BOOK-TYPE-01: workspace default
    // book-type (ui.defaults.book_type). The split-button primary
    // "Neues Buch" creates this type (CreateBookPage applies it); the
    // chevron dropdown lists every other dashboard-visible type.
    const [defaultBookType, setDefaultBookType] = useState("prose");
    const [showDonationOnboarding, setShowDonationOnboarding] = useState(false);
    const [importWizardOpen, setImportWizardOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    // Dialog->Pages migration (C2): book creation moved to CreateBookPage
    // (/books/new). After a prose create it navigates back here with a
    // `bookCreated` nav-state flag; this ref makes the resulting
    // donation-onboarding check fire exactly once per arrival.
    const onboardingHandledRef = useRef(false);
    const filters = useBookFilters(books, t);
    const selection = useBookSelection();
    const { mode: viewMode, setMode: setViewMode } = useViewMode("books");
    // CONFIGURABLE-DEFAULT-CONTENT-BOOK-TYPE-01: the SplitButton primary
    // label reflects the configured default book-type. Look up its
    // ``default_title_key`` in the registry (book-types.yaml SSoT) and
    // fall back to the generic "Neues Buch" if the type is unknown or
    // omits the key. Re-reads on every mount (the settings fetch has no
    // cache), so changing the default in Settings updates the label as
    // soon as the user navigates back to the Dashboard.
    const newBookFallbackLabel = t("ui.dashboard.new_book", "Neues Buch");
    const newBookTitleKey = bookTypeDefaultTitleKey(
        bookTypesSnapshot,
        defaultBookType,
    );
    const newBookLabel = newBookTitleKey
        ? t(newBookTitleKey, newBookFallbackLabel)
        : newBookFallbackLabel;
    // Trash surface keeps an INDEPENDENT view-mode read from a separate
    // YAML key (``ui.dashboard.books_trash_view``). In-trash toggles
    // are session-local (no YAML write); persistence is only via the
    // Settings UI. See ``useTrashViewMode`` for the rationale.
    const { mode: trashViewMode, setMode: setTrashViewMode } =
        useTrashViewMode("books");
    // DASHBOARD-PAGINATION-LOAD-MORE-01 C5: paged display of the
    // active (non-trash) book list. Slices ``filters.filteredBooks``
    // to ``paged.limit`` for render; "Load more" grows the limit;
    // PageSizeSelector persists the user's preference. Filter changes
    // reset the limit (effect below).
    const paged = usePagedList("books");

    /** Bulk export. Reads the current filtered list in display order,
     *  restricts to the selected IDs, then POSTs them to the backend
     *  bulk endpoint. The backend preserves the input order in the
     *  response (ZIP iteration), so the user gets exactly what they
     *  selected, in the order they saw it on screen. Toasts on
     *  failure with the server message (which includes the offending
     *  book's title for fail-loud Pandoc errors). */
    const handleBulkBookExport = async (format: BookBulkExportFormat) => {
        const ordered = filters.filteredBooks
            .map((b) => b.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length === 0) return;
        if (ordered.length > BOOK_BULK_LIMIT_HARD) return;
        try {
            const {blob, filename} = await api.books.bulkExport(ordered, format);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            selection.clear();
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t("ui.dashboard.bulk.export_failed", "Bulk book export failed");
            notify.error(message, err);
        }
    };

    // UNIVERSAL-AI-TEMPLATE-02: bulk AI-template ZIP export.
    // Cap of 50 enforced by the action bar's disabled state;
    // server-side 422 surfaces here as a toast if the bar gate
    // is somehow bypassed (e.g. e2e replay).
    const handleBulkBookAiTemplateExport = async () => {
        const ordered = filters.filteredBooks
            .map((b) => b.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length === 0) return;
        try {
            const {blob, filename} = await api.books.bulkAiTemplate.export(ordered);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            notify.success(
                t(
                    "ui.ai_template.bulk.export_success",
                    "{count} template(s) exported as {filename}",
                )
                    .replace("{count}", String(ordered.length))
                    .replace("{filename}", filename),
            );
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.ai_template.bulk.export_failed",
                          "Bulk template export failed",
                      );
            notify.error(message, err);
        }
    };

    const [bulkBookAiImportOpen, setBulkBookAiImportOpen] = useState(false);

    // UNIVERSAL-AI-TEMPLATE-02 commit 8: bulk-AI-fill flow state.
    // The "Bulk AI fill" dropdown item opens a FieldClassDialog;
    // submitting that opens the BulkAiFillConfirmDialog; confirm
    // calls /start and hands off to BulkAiFillJobContext (the
    // dock takes over from there).
    const [bulkBookAiFillFieldsOpen, setBulkBookAiFillFieldsOpen] = useState(false);
    const [bulkBookAiFillConfirm, setBulkBookAiFillConfirm] = useState<{
        ids: string[];
        fieldClasses: string[];
        force: boolean;
        inlineImageCount?: number | null;
    } | null>(null);

    // Bulk-delete state. Same shape as the Articles dashboard;
    // see ArticleList.tsx for the rationale + behavior matrix.
    const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{
        ids: string[];
        count: number;
    } | null>(null);

    const handleBulkBookDelete = async (permanent: false) => {
        const ordered = filters.filteredBooks
            .map((b) => b.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length < 2 || ordered.length > BOOK_BULK_LIMIT_HARD) return;
        try {
            const result = await api.books.bulkDelete(ordered, permanent);
            setBooks((prev) =>
                prev.filter(
                    (b) =>
                        !ordered.includes(b.id) ||
                        result.failed.some((f) => f.id === b.id),
                ),
            );
            loadTrash();
            selection.clear();
            const message = t(
                "ui.bulk_delete.toast_trashed",
                "{count} in den Papierkorb verschoben",
            ).replace("{count}", String(result.deleted_count));
            notify.bulkAction(
                message,
                async () => {
                    try {
                        const undone = ordered.filter(
                            (id) =>
                                !result.skipped_already_trashed.includes(id) &&
                                !result.failed.some((f) => f.id === id),
                        );
                        if (undone.length === 0) {
                            notify.info(
                                t("ui.bulk_delete.toast_undone", "Wiederhergestellt"),
                            );
                            return;
                        }
                        // One round-trip via bulk-restore
                        // (BULK-RESTORE-PARITY-01). Per-id status
                        // surfaces partial failures via the response
                        // shape instead of Promise.all's first-rejection
                        // wins.
                        const undoResult = await api.books.bulkRestore(undone);
                        loadBooks();
                        loadTrash();
                        if (undoResult.failed.length > 0) {
                            notify.warning(
                                t(
                                    "ui.bulk_delete.toast_undone_partial",
                                    "{restored} wiederhergestellt, {failed} fehlgeschlagen",
                                )
                                    .replace("{restored}", String(undoResult.restored_count))
                                    .replace("{failed}", String(undoResult.failed.length)),
                            );
                        } else {
                            notify.info(
                                t("ui.bulk_delete.toast_undone", "Wiederhergestellt"),
                            );
                        }
                    } catch (undoErr) {
                        notify.error(
                            t("ui.bulk_delete.toast_undo_failed", "Wiederherstellen fehlgeschlagen"),
                            undoErr,
                        );
                    }
                },
                t("ui.bulk_delete.undo_label", "Rückgängig"),
            );
        } catch (err) {
            notify.error(
                t("ui.bulk_delete.toast_failed", "Bulk-Löschen fehlgeschlagen"),
                err,
            );
        }
    };

    const handleBulkBookDeletePermanentRequest = () => {
        const ordered = filters.filteredBooks
            .map((b) => b.id)
            .filter((id) => selection.isSelected(id));
        if (ordered.length < 2 || ordered.length > BOOK_BULK_LIMIT_HARD) return;
        setBulkDeleteDialog({ ids: ordered, count: ordered.length });
    };

    const handleBulkBookDeletePermanentConfirmed = async () => {
        if (!bulkDeleteDialog) return;
        const { ids } = bulkDeleteDialog;
        setBulkDeleteDialog(null);
        try {
            const result = await api.books.bulkDelete(ids, true);
            setBooks((prev) => prev.filter((b) => !ids.includes(b.id)));
            selection.clear();
            notify.success(
                t(
                    "ui.bulk_delete.toast_deleted_permanent",
                    "{count} endgültig gelöscht",
                ).replace("{count}", String(result.deleted_count)),
            );
        } catch (err) {
            notify.error(
                t("ui.bulk_delete.toast_failed", "Bulk-Löschen fehlgeschlagen"),
                err,
            );
        }
    };

    /** Filter changes invalidate selection because a previously-
     *  selected book may now be hidden. Pinning to ``selection.clear``
     *  (stable callback identity) avoids the infinite-render loop the
     *  articles dashboard hit when depending on the whole selection
     *  object. */
    const clearBookSelection = selection.clear;
    const resetPagination = paged.reset;
    useEffect(() => {
        clearBookSelection();
        // Reset display limit on filter change so the user always
        // sees the first PAGE_SIZE rows of the new filter result —
        // not a mid-page slice carried over from the prior filter.
        resetPagination();
    }, [
        filters.searchQuery,
        filters.genre,
        filters.language,
        clearBookSelection,
        resetPagination,
    ]);

    const loadBooks = async () => {
        try {
            // Reads route through the storage seam: ApiStorage online,
            // DexieStorage offline (offline-available books). (P3-C4)
            const data = await getStorage().books.list();
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
        // Load donation config once per mount for S-02 OnboardingDialog
        // logic. The S-03 reminder banner moved to App-level mount in
        // v0.35.1 and has its own config fetch. Failure is non-critical;
        // OnboardingDialog stays hidden if it fails.
        getStorage().settings.getApp()
            .then((config) => {
                const donations = getDonationsConfig(config);
                setDonationsConfig(donations);
                const uiConfig = (config.ui || {}) as Record<string, unknown>;
                const uiDefaults = (uiConfig.defaults || {}) as Record<string, unknown>;
                const dt = uiDefaults.book_type;
                if (typeof dt === "string") setDefaultBookType(dt);
            })
            .catch(() => {});
    }, []);

    const maybeShowDonationOnboarding = (wasFirstBook: boolean) => {
        if (!wasFirstBook) return;
        if (!donationsConfig) return;
        if (!shouldShowDonationOnboarding()) return;
        setShowDonationOnboarding(true);
    };

    // Dialog->Pages migration (C2): CreateBookPage performs the book
    // create now. When it creates a prose book it returns here with
    // `location.state.bookCreated`; mirror the former handleCreate
    // behavior by re-running the first-book donation-onboarding check
    // once both the books list and the donations config have loaded.
    // wasFirstBook is inferred from the freshly loaded list length (===1).
    useEffect(() => {
        if (onboardingHandledRef.current) return;
        const navState = location.state as {bookCreated?: boolean} | null;
        if (!navState?.bookCreated) return;
        if (loading || !donationsConfig) return;
        onboardingHandledRef.current = true;
        maybeShowDonationOnboarding(books.length === 1);
        // Clear the flag so a refresh / back-nav doesn't re-trigger it.
        navigate("/", {replace: true, state: null});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, donationsConfig, books, location.state]);

    const handleDelete = async (id: string) => {
        await api.books.delete(id);
        setBooks((prev) => prev.filter((b) => b.id !== id));
        // Reconcile bulk-selection state: the row that just
        // disappeared must not stay in the BulkActionBar count.
        selection.remove(id);
        loadTrash();
        notify.info(t("ui.dashboard.moved_to_trash", "In den Papierkorb verschoben"));
    };

    const handleDeletePermanent = async (id: string) => {
        if (!await dialog.confirm(
            t("ui.dashboard.delete_permanent_title", "Endgültig löschen"),
            t("ui.dashboard.delete_permanent_warning", "Das Buch wird unwiderruflich gelöscht. Diese Aktion kann NICHT rückgaengig gemacht werden. Nur für erfahrene Benutzer."),
            "danger",
        )) return;
        await api.books.delete(id);
        try { await api.books.permanentDelete(id); } catch { /* already in trash */ }
        setBooks((prev) => prev.filter((b) => b.id !== id));
        // Reconcile bulk-selection state.
        selection.remove(id);
        notify.success(t("ui.dashboard.deleted_permanently", "Buch endgültig gelöscht"));
    };

    const handleRestore = async (book: Book) => {
        // Optimistic update: drop the trash row first so the
        // user sees the restore land before the network round-
        // trip. The POST returns the restored entity which we
        // splice into the live list — skipping the full
        // /api/books refetch that produced the 419ms-class
        // perception-lag the 2026-05-14 user report surfaced.
        setTrash((prev) => prev.filter((b) => b.id !== book.id));
        try {
            const restored = await api.books.restore(book.id);
            setBooks((prev) => {
                if (prev.some((b) => b.id === restored.id)) return prev;
                return [restored, ...prev];
            });
            notify.success(t("ui.dashboard.restored", "Buch wiederhergestellt"));
        } catch (err) {
            // Revert the optimistic trash removal so a failed
            // restore does not vanish the row entirely.
            setTrash((prev) => {
                if (prev.some((b) => b.id === book.id)) return prev;
                return [book, ...prev];
            });
            notify.error(t("ui.dashboard.restore_failed", "Wiederherstellen fehlgeschlagen"), err);
        }
    };

    const handlePermanentDelete = async (id: string) => {
        if (!await dialog.confirm(t("ui.dashboard.delete_permanent_title", "Endgültig löschen"), t("ui.dashboard.delete_permanent_warning", "Buch endgültig löschen? Dies kann nicht rückgaengig gemacht werden."), "danger")) return;
        await api.books.permanentDelete(id);
        setTrash((prev) => prev.filter((b) => b.id !== id));
        // Defensive: same as ArticleList — if the book was soft-deleted
        // in another tab and the id was still in this tab's live-list
        // selection, drop it so the BulkActionBar count never
        // references a row that's gone everywhere.
        selection.remove(id);
    };

    const handleEmptyTrash = async () => {
        if (!await dialog.confirm(t("ui.dashboard.empty_trash_title", "Papierkorb leeren"), t("ui.dashboard.empty_trash_warning", "Alle Bücher im Papierkorb werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgaengig gemacht werden."), "danger")) return;
        await api.books.emptyTrash();
        setTrash([]);
    };

    const handleBackupExport = () => {
        if (offlineGate) return; // no backend to produce the .bgb
        window.open(api.backup.exportUrl(), "_blank");
    };

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header} data-testid="dashboard-header">
                <div className={styles.headerInner}>
                    <div className={styles.logo} onClick={() => navigate("/")} role="button" title="Dashboard">
                        <BookOpen size={28} strokeWidth={1.5}/>
                        <h1 className={styles.logoText}>Bibliogon</h1>
                    </div>
                    <div className={styles.headerActions}>
                        {/* Always visible. Split-button: the primary
                         *  click keeps the existing 'new prose book'
                         *  flow (testid 'new-book-btn' preserved for
                         *  the 90% case); the chevron exposes
                         *  picture-book (+ future comic). Pattern
                         *  mirrors the Toolbar Copy split-button per
                         *  the 'split-button (default + chevron
                         *  disclosure)' lessons-learned rule. */}
                        {/* ARTICLE-TYPES-SSOT-01 C4 (2026-05-29):
                         *  migrated from inline ``newBookGroup`` to
                         *  the shared SplitButton primitive. RCU
                         *  2-surface threshold fires when C5 lands
                         *  the same shape on the Article Dashboard.
                         *  Existing testids preserved
                         *  (new-book-group / new-book-btn /
                         *  new-book-chevron / new-book-menu-item-*)
                         *  so E2E specs keep working without
                         *  modification. */}
                        <SplitButton
                            buttonClass="btn btn-primary"
                            variant="primary"
                            primaryContent={
                                <>
                                    <Plus size={16} />{" "}
                                    <span className="hide-mobile">
                                        {newBookLabel}
                                    </span>
                                </>
                            }
                            onPrimaryClick={() => navigate("/books/new")}
                            chevronTooltip={t(
                                "ui.dashboard.new_book_more_tooltip",
                                "Weitere Buch-Arten",
                            )}
                            dropdownItems={bookTypesSnapshot.ordered
                                // Exclude the configured default (created
                                // by the primary button) so the dropdown
                                // never duplicates it. Defaults to prose,
                                // matching the pre-feature behaviour.
                                .filter(
                                    (bt) =>
                                        bt.id !== defaultBookType &&
                                        bt.dashboard_create_visible,
                                )
                                .map(
                                    (bt): SplitButtonDropdownItem => ({
                                        id: bt.id,
                                        content: (
                                            <>
                                                <BookTypeIcon
                                                    iconName={bt.icon}
                                                    size={14}
                                                />
                                                <span
                                                    style={{
                                                        marginLeft: 6,
                                                    }}
                                                >
                                                    {t(bt.label_key, bt.id)}
                                                </span>
                                            </>
                                        ),
                                        onSelect: () =>
                                            navigate(`/books/new?type=${bt.id}`),
                                    }),
                                )}
                            groupTestId="new-book-group"
                            primaryTestId="new-book-btn"
                            chevronTestId="new-book-chevron"
                            itemTestIdPrefix="new-book-menu-item"
                        />

                        {/* Secondary cluster. Fixed-breakpoint collapse via the
                         *  Tailwind `menu:` screen (1200px worst-case full-bar
                         *  width; see tailwind.css): shown inline at >=1200px,
                         *  hidden below it where the hamburger takes over. The
                         *  decision is viewport-only - language / default-type
                         *  changes never toggle it. */}
                        <div
                            className="hidden menu:flex items-center gap-[6px]"
                            data-testid="dashboard-header-inline-actions"
                        >
                            <NewFromTemplateButton
                                kind="book"
                                defaultLanguage="de"
                                triggerClassName="btn btn-secondary btn-sm"
                                triggerTestId="new-book-from-template-btn"
                                onCreated={(created) => navigate(`/books/${created.id}`)}
                            />
                            <button
                                className="btn btn-secondary btn-sm"
                                data-testid="articles-nav-btn"
                                onClick={() => navigate("/articles")}
                                title={t("ui.dashboard.articles_nav_tooltip", "Artikel verwalten")}
                            >
                                {t("ui.dashboard.articles_nav", "Artikel")}
                            </button>
                            <div className={styles.headerSeparator}/>
                            <button
                                className="btn btn-secondary btn-sm"
                                data-testid="backup-export-btn"
                                onClick={handleBackupExport}
                                disabled={books.length === 0 || offlineGate}
                                title={offlineGate ? offlineMsg : undefined}
                            >
                                <Download size={14}/> {t("ui.dashboard.backup", "Backup")}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                data-testid="import-wizard-btn"
                                onClick={() => !offlineGate && setImportWizardOpen(true)}
                                disabled={offlineGate}
                                title={offlineGate ? offlineMsg : undefined}
                            >
                                <Upload size={14}/> {t("ui.dashboard.import", "Importieren")}
                            </button>
                            <div className={styles.headerSeparator}/>
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
                                aria-label={t("ui.dashboard.trash", "Papierkorb")}
                                onClick={() => setShowTrash(!showTrash)}
                                style={
                                    showTrash
                                        ? {color: "var(--accent)", position: "relative"}
                                        : {position: "relative"}
                                }
                            >
                                <Trash2 size={18}/>
                                {trash.length > 0 && (
                                    <span className={styles.trashBadge} data-testid="trash-badge">
                                        {trash.length}
                                    </span>
                                )}
                            </button>
                            <FullscreenButton testidPrefix="dashboard"/>
                            <ThemeToggle/>
                        </div>

                        {/* Overflow: hamburger menu, shown below the 1200px
                         *  breakpoint (Tailwind `menu:hidden` => visible only
                         *  under the worst-case full-bar width). Viewport-only,
                         *  so it never toggles on language / default-type. */}
                        <div className="menu:hidden">
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    className="btn-icon"
                                    data-testid="dashboard-hamburger"
                                    aria-label={t("ui.dashboard.menu", "Menü")}
                                >
                                    <Menu size={20}/>
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content className="hamburger-menu-content" align="end" sideOffset={4}>
                                    {/* Cross-nav to the Article Dashboard.
                                     *  Mirrors the "Bücher" item in the
                                     *  ArticleList hamburger so the collapsed
                                     *  menu carries the same actions as the
                                     *  inline bar. */}
                                    <DropdownMenu.Item
                                        className="hamburger-menu-item"
                                        data-testid="dashboard-hamburger-articles"
                                        onSelect={() => navigate("/articles")}
                                    >
                                        <FileText size={16}/> {t("ui.dashboard.articles_nav", "Artikel")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className="hamburger-menu-separator"/>
                                    <DropdownMenu.Item className="hamburger-menu-item" disabled={offlineGate} onSelect={handleBackupExport}>
                                        <Download size={16}/> {t("ui.dashboard.backup", "Backup")}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item className="hamburger-menu-item" disabled={offlineGate} onSelect={() => setImportWizardOpen(true)}>
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
                                    <DropdownMenu.Item className="hamburger-menu-item" onSelect={() => toggleTheme()}>
                                        {theme === "dark"
                                            ? <><Sun size={16}/> {t("ui.dashboard.light_mode", "Light Mode")}</>
                                            : <><Moon size={16}/> {t("ui.dashboard.dark_mode", "Dark Mode")}</>}
                                    </DropdownMenu.Item>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                        </div>

                    </div>
                </div>
            </header>

            {/* Content */}
            <main id="main-content" className={styles.main}>
                {/* v0.35.1 (2026-05-18): DonationReminderBanner lifted
                 *  to App.tsx — App-level mount above <Routes>. The
                 *  banner now persists across navigation (every page
                 *  shows it) until the user actively dismisses. */}
                {!showTrash && <WritingGoalWidget />}
                {showTrash ? (
                    /* Trash view */
                    <div data-testid="trash-view">
                        <div className={styles.mainHeader}>
                            <button className="btn-icon" onClick={() => setShowTrash(false)} title={t("ui.dashboard.back", "Zurück")}>
                                <ChevronLeft size={18}/>
                            </button>
                            <Trash2 size={20} className="muted"/>
                            <h2 className={styles.mainTitle}>{t("ui.dashboard.trash", "Papierkorb")}</h2>
                            <span className={styles.bookCount}>{trash.length} {trash.length === 1 ? t("ui.dashboard.book_singular", "Buch") : t("ui.dashboard.book_plural", "Bücher")}</span>
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
                            <ViewToggle mode={trashViewMode} onChange={setTrashViewMode} />
                        </div>
                        {trash.length === 0 ? (
                            <EmptyState
                                testId="trash-empty-state"
                                icon={<Trash2 size={48} strokeWidth={1} color="var(--text-muted)"/>}
                                title={t("ui.dashboard.trash_empty", "Papierkorb ist leer")}
                            />
                        ) : trashViewMode === "grid" ? (
                            <div className={styles.grid} data-testid="trash-grid">
                                {trash.map((book) => (
                                    <TrashCard
                                        key={book.id}
                                        title={book.title}
                                        subtitle={book.author}
                                        onRestore={() => handleRestore(book)}
                                        onPermanentDelete={() => handlePermanentDelete(book.id)}
                                        restoreLabel={t("ui.dashboard.restore_book", "Wiederherstellen")}
                                        deletePermanentLabel={t("ui.dashboard.delete_permanent", "Endgültig löschen")}
                                        cardTestId={`trash-card-${book.id}`}
                                        restoreTestId={`trash-restore-${book.id}`}
                                        permanentTestId={`trash-delete-permanent-${book.id}`}
                                    />
                                ))}
                            </div>
                        ) : (
                            <ul className={styles.trashList} data-testid="trash-list">
                                {trash.map((book) => (
                                    <li
                                        key={book.id}
                                        className={styles.trashRow}
                                        data-testid={`trash-row-${book.id}`}
                                    >
                                        <div style={{flex: 1, minWidth: 0}}>
                                            <strong>{book.title}</strong>
                                            <p style={{color: "var(--text-muted)", fontSize: "0.8125rem", margin: "4px 0 0 0"}}>{book.author}</p>
                                        </div>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            data-testid={`trash-restore-${book.id}`}
                                            onClick={() => handleRestore(book)}
                                        >
                                            <RotateCcw size={12}/> {t("ui.dashboard.restore_book", "Wiederherstellen")}
                                        </button>
                                        <button
                                            className="btn btn-danger btn-sm"
                                            data-testid={`trash-delete-permanent-${book.id}`}
                                            onClick={() => handlePermanentDelete(book.id)}
                                        >
                                            <Trash size={12}/> {t("ui.dashboard.delete_permanent", "Endgültig löschen")}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : loading ? (
                    <LoadingIndicator
                        testId="dashboard-loading"
                        variant="block"
                        label={t("ui.common.loading", "Laden...")}
                    />
                ) : books.length === 0 ? (
                    <EmptyState
                        testId="dashboard-empty-state"
                        icon={<BookOpen size={56} strokeWidth={1} color="var(--text-muted)"/>}
                        title={t("ui.dashboard.welcome", "Willkommen bei Bibliogon")}
                        body={t("ui.dashboard.welcome_text", "Erstelle dein erstes Buch, importiere ein bestehendes Projekt, oder schaue dir die Erste-Schritte-Anleitung an.")}
                        actions={
                            <>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => navigate("/books/new")}
                                    data-testid="dashboard-empty-create-book"
                                >
                                    <Plus size={16}/> {t("ui.dashboard.create_book", "Buch erstellen")}
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setImportWizardOpen(true)}
                                    data-testid="dashboard-empty-import"
                                >
                                    <FolderUp size={16}/> {t("ui.dashboard.import_project", "Projekt importieren")}
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => navigate("/get-started")}
                                    data-testid="dashboard-empty-get-started"
                                >
                                    <Rocket size={16}/> {t("ui.get_started.title", "Erste Schritte")}
                                </button>
                            </>
                        }
                    />
                ) : (
                    <>
                        <div className={styles.mainHeader}>
                            <h2 className={styles.mainTitle}>{t("ui.dashboard.title", "Meine Bücher")}</h2>
                            <span className={styles.bookCount}>{books.length} {books.length === 1 ? t("ui.dashboard.book_singular", "Buch") : t("ui.dashboard.book_plural", "Bücher")}</span>
                            <ViewToggle mode={viewMode} onChange={setViewMode} />
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
                            <EmptyState
                                testId="filter-empty-state"
                                icon={<Search size={48} strokeWidth={1} color="var(--text-muted)"/>}
                                title={t("ui.dashboard.empty_filtered", "Keine Treffer")}
                                body={t("ui.dashboard.empty_filtered_hint", "Es gibt keine Bücher die zu den aktuellen Filtern passen.")}
                                actions={
                                    <button
                                        className="btn btn-secondary"
                                        data-testid="filter-reset-empty"
                                        onClick={filters.resetFilters}
                                    >
                                        {t("ui.dashboard.reset_filters", "Filter zurücksetzen")}
                                    </button>
                                }
                            />
                        ) : (
                            <>
                            {selection.count > 0 ? (
                                <BookBulkActionBar
                                    count={selection.count}
                                    onExport={(fmt) => void handleBulkBookExport(fmt)}
                                    onBulkDelete={() => void handleBulkBookDelete(false)}
                                    onBulkDeletePermanent={handleBulkBookDeletePermanentRequest}
                                    onBulkAiTemplateExport={() => void handleBulkBookAiTemplateExport()}
                                    onBulkAiTemplateImport={() => setBulkBookAiImportOpen(true)}
                                    onBulkAiFill={() => setBulkBookAiFillFieldsOpen(true)}
                                    onClear={selection.clear}
                                    t={t}
                                />
                            ) : null}
                            {filters.filteredBooks.length > 0 ? (
                                <div className={styles.bulkSelectAll}>
                                    <label>
                                        <input
                                            type="checkbox"
                                            data-testid="book-bulk-select-all"
                                            checked={
                                                selection.count > 0 &&
                                                selection.count === filters.filteredBooks.length
                                            }
                                            ref={(el) => {
                                                if (el)
                                                    el.indeterminate =
                                                        selection.count > 0 &&
                                                        selection.count < filters.filteredBooks.length;
                                            }}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    selection.selectAll(
                                                        filters.filteredBooks.map((b) => b.id),
                                                    );
                                                } else {
                                                    selection.clear();
                                                }
                                            }}
                                        />
                                        {" "}
                                        {t("ui.dashboard.bulk.select_all", "Select all")}
                                    </label>
                                </div>
                            ) : null}
                            {(() => {
                                // C5: slice to ``paged.limit`` for render.
                                // Selection semantics unchanged — select-all
                                // still operates on the full filtered set,
                                // not just the visible page. The pagination
                                // is a display-cost guard, not a selection
                                // boundary.
                                const visibleBooks = filters.filteredBooks.slice(
                                    0,
                                    paged.limit,
                                );
                                const hasMore =
                                    filters.filteredBooks.length > visibleBooks.length;
                                return (
                                    <>
                                        {viewMode === "list" ? (
                                            <BookListView
                                                books={visibleBooks}
                                                onClick={(book) => navigate(`/book/${book.id}`)}
                                                onDelete={(book) => handleDelete(book.id)}
                                                onDeletePermanent={(book) => handleDeletePermanent(book.id)}
                                                isSelected={(book) => selection.isSelected(book.id)}
                                                onToggleSelect={(book) => selection.toggle(book.id)}
                                            />
                                        ) : (
                                            <div className={styles.grid}>
                                                {visibleBooks.map((book) => (
                                                    <div
                                                        key={book.id}
                                                        className={`${styles.tileWrapper}${selection.isSelected(book.id) ? ` ${styles.tileSelected}` : ""}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className={styles.tileCheckbox}
                                                            data-testid={`book-bulk-check-${book.id}`}
                                                            checked={selection.isSelected(book.id)}
                                                            onChange={() => selection.toggle(book.id)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            aria-label="Select book"
                                                        />
                                                        <BookCard
                                                            book={book}
                                                            onClick={() => navigate(`/book/${book.id}`)}
                                                            onDelete={() => handleDelete(book.id)}
                                                            onDeletePermanent={() => handleDeletePermanent(book.id)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {filters.filteredBooks.length > 0 && (
                                            <div
                                                data-testid="dashboard-pagination"
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                    gap: 16,
                                                    marginTop: 16,
                                                    paddingBottom: 8,
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                {hasMore && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary"
                                                        data-testid="dashboard-load-more"
                                                        onClick={paged.loadMore}
                                                    >
                                                        {t(
                                                            "ui.dashboard.load_more",
                                                            "Mehr laden",
                                                        )}
                                                        {" "}
                                                        ({visibleBooks.length} /{" "}
                                                        {filters.filteredBooks.length})
                                                    </button>
                                                )}
                                                <PageSizeSelector
                                                    value={paged.pageSize}
                                                    onChange={paged.setPageSize}
                                                    data-testid="dashboard-page-size"
                                                />
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                            </>
                        )}
                    </>
                )}
            </main>

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
            {bulkDeleteDialog && (
                <TypeToConfirmDialog
                    open
                    count={bulkDeleteDialog.count}
                    filterDescription={formatActiveBookFilters(filters, t)}
                    itemNoun={t("ui.bulk_delete.items_books", "Bücher")}
                    onConfirm={() => void handleBulkBookDeletePermanentConfirmed()}
                    onCancel={() => setBulkDeleteDialog(null)}
                />
            )}
            <BulkTemplateImportDialog
                open={bulkBookAiImportOpen}
                kind="book"
                onClose={() => setBulkBookAiImportOpen(false)}
                onApplied={() => {
                    selection.clear();
                    void loadBooks();
                }}
            />
            <FieldClassDialog
                open={bulkBookAiFillFieldsOpen}
                kind="book"
                onClose={() => setBulkBookAiFillFieldsOpen(false)}
                onSubmit={(req: FieldClassDialogResult) => {
                    const ids = filters.filteredBooks
                        .map((b) => b.id)
                        .filter((id) => selection.isSelected(id));
                    if (ids.length === 0) {
                        setBulkBookAiFillFieldsOpen(false);
                        return;
                    }
                    setBulkBookAiFillFieldsOpen(false);
                    setBulkBookAiFillConfirm({
                        ids,
                        fieldClasses: req.field_classes,
                        force: req.force,
                        inlineImageCount: req.inline_image_count,
                    });
                }}
                title={t("ui.bulk_ai_fill.field_class_dialog_title", "Bulk AI fill: pick field-classes")}
                submitLabel={t("ui.bulk_ai_fill.field_class_dialog_submit", "Continue to estimate")}
            />
            {bulkBookAiFillConfirm && (
                <BulkAiFillConfirmDialog
                    open
                    onClose={() => setBulkBookAiFillConfirm(null)}
                    kind="book"
                    ids={bulkBookAiFillConfirm.ids}
                    fieldClasses={bulkBookAiFillConfirm.fieldClasses}
                    force={bulkBookAiFillConfirm.force}
                    inlineImageCount={bulkBookAiFillConfirm.inlineImageCount}
                />
            )}
        </div>
    );
}
