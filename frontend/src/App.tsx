import {lazy, Suspense, useCallback, useEffect, useMemo, useState} from "react";
import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import BookEditor from "./pages/BookEditor";
import ArticleList from "./pages/ArticleList";
import ArticleEditor from "./pages/ArticleEditor";
import MediumImportPage from "./pages/MediumImportPage";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import GetStarted from "./pages/GetStarted";
// Dialog->Pages migration: new full-page surfaces are lazy-loaded so
// they create their own chunks (the rest of the routes stay eager).
const CreateBookPage = lazy(() => import("./pages/CreateBookPage"));
const CreateArticlePage = lazy(() => import("./pages/CreateArticlePage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const WritingHistoryPage = lazy(() => import("./pages/WritingHistoryPage"));
const ChapterVersionsPage = lazy(() => import("./pages/ChapterVersionsPage"));
import ErrorBoundary from "./components/ErrorBoundary";
import {useTheme} from "./hooks/useTheme";
import {I18nProvider} from "./hooks/useI18n";
import {ContentTypesProvider} from "./hooks/useContentTypes";
import {BookTypesProvider} from "./hooks/useBookTypes";
import {DialogProvider} from "./components/AppDialog";
import AudioExportGate from "./components/AudioExportGate";
import MediumImportGate from "./components/MediumImportGate";
import OfflineBanner from "./components/OfflineBanner";
import SkipToContentLink from "./components/SkipToContentLink";
import {AudiobookJobProvider} from "./contexts/AudiobookJobContext";
import {BulkAiFillJobProvider} from "./contexts/BulkAiFillJobContext";
import {MediumImportJobProvider} from "./contexts/MediumImportJobContext";
import BulkAiFillDock from "./components/BulkAiFillDock";
import {HelpProvider} from "./contexts/HelpContext";
import HelpPanel from "./components/help/HelpPanel";
import EventRecorderSetup from "./components/EventRecorderSetup";
import ErrorReportDialog from "./components/ErrorReportDialog";
import AiSetupWizard, {shouldShowAiWizard} from "./components/AiSetupWizard";
import DonationReminderBanner, {
    ensureFirstUseDate,
    shouldShowReminder,
} from "./components/DonationReminderBanner";
import {
    getDonationsConfig,
    type DonationsConfig,
} from "./components/SupportSection";
import ShortcutCheatsheet from "./components/ShortcutCheatsheet";
import {useKeyboardShortcuts, Shortcut} from "./hooks/useKeyboardShortcuts";
import {useWordWrap} from "./hooks/useWordWrap";
import {api, ApiError} from "./api/client";
import {ToastContainer} from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
    useTheme();

    // AI setup wizard state — shows on first run when AI is not configured
    const [showAiWizard, setShowAiWizard] = useState(false);
    // True when ai.api_key comes from ~/.config/bibliogon/secrets.yaml or
    // BIBLIOGON_AI_API_KEY env-var. Backend reports this via the
    // ``_secrets_managed_externally`` meta-flag on the app-config payload.
    // Wizard hides the API-key input + skips its validation in that case.
    const [secretsExternal, setSecretsExternal] = useState(false);
    // v0.35.1 (2026-05-18): S-03 donation reminder lifted from
    // Dashboard-only mount to App-level mount per user-direction
    // ("panel ganz oben am Anfang"). Banner is visible across every
    // page (Articles, Books, Picture-Books, Settings, etc.) until
    // the user explicitly dismisses via Support / Not now / X / Esc.
    // Each dismiss path sets the appropriate cooldown (90/180 days)
    // per industry-research-confirmed defaults (Mastodon / Blender /
    // Signal medians).
    const [donationsConfig, setDonationsConfig] = useState<DonationsConfig | null>(null);
    const [reminderVisible, setReminderVisible] = useState(false);

    useEffect(() => {
        ensureFirstUseDate();
        api.settings.getApp()
            .then((config) => {
                if (shouldShowAiWizard(config)) setShowAiWizard(true);
                setSecretsExternal(
                    Boolean(
                        (config as Record<string, unknown>)._secrets_managed_externally,
                    ),
                );
                // Same fetch piggybacks the donations config so the
                // App-level banner doesn't need its own API call.
                const donations = getDonationsConfig(config);
                setDonationsConfig(donations);
                setReminderVisible(shouldShowReminder(donations));
            })
            .catch(() => {}); // Config load failure is not critical for the wizard
    }, []);

    // Word-wrap toggle (Alt+Z) — applies a body-level CSS class
    // affecting every .ProseMirror + markdown textarea. Silent on
    // toggle; the editor's visual state IS the feedback (matches
    // VS Code / Sublime / IntelliJ behavior).
    const {toggle: toggleWordWrap} = useWordWrap();

    // Shortcut cheatsheet
    const [showShortcuts, setShowShortcuts] = useState(false);
    const shortcuts = useMemo<Shortcut[]>(() => [
        {keys: "ctrl+/", handler: () => setShowShortcuts((s) => !s), label: "Show shortcuts"},
        {keys: "alt+z", handler: toggleWordWrap, label: "Toggle word wrap"},
    ], [toggleWordWrap]);
    useKeyboardShortcuts(shortcuts);

    // Error report dialog state — opened via custom event from notify.ts
    const [errorReport, setErrorReport] = useState<{
        open: boolean;
        message: string;
        apiError?: ApiError;
    }>({open: false, message: ""});

    const handleOpenReport = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail as {message: string; apiError?: ApiError};
        setErrorReport({open: true, message: detail.message, apiError: detail.apiError});
    }, []);

    useEffect(() => {
        window.addEventListener("bibliogon:open-error-report", handleOpenReport);
        return () => window.removeEventListener("bibliogon:open-error-report", handleOpenReport);
    }, [handleOpenReport]);

    return (
        <I18nProvider>
        <BookTypesProvider>
        <ContentTypesProvider>
        <DialogProvider>
        <AudiobookJobProvider>
        <BulkAiFillJobProvider>
        <MediumImportJobProvider>
        <HelpProvider>
            <SkipToContentLink />
            <OfflineBanner />
            {/* v0.35.1 (2026-05-18): App-level S-03 reminder mount.
             *  Renders above Routes so the banner sits at the top
             *  of every page (Dashboard, BookEditor, ArticleEditor,
             *  Settings, etc.). Persists across navigation until the
             *  user actively dismisses via Support / Not now / X /
             *  Escape — each path sets the appropriate cooldown
             *  (90 days dismissed, 180 days donated). */}
            {donationsConfig && reminderVisible ? (
                <DonationReminderBanner
                    donations={donationsConfig}
                    onDismiss={() => setReminderVisible(false)}
                />
            ) : null}
            {/* BUG-2: per-surface error boundaries. A render crash in
                one route shows a friendly fallback + Reload instead of
                blanking the whole app. BookEditor's boundary also covers
                the page-based editors (PageEditor/ComicBookEditor) and
                Storyboard mounted inside it. */}
            <Suspense fallback={null}>
            <Routes>
                <Route path="/" element={<ErrorBoundary surface="dashboard"><Dashboard/></ErrorBoundary>}/>
                <Route path="/books/new" element={<ErrorBoundary surface="create-book"><CreateBookPage/></ErrorBoundary>}/>
                <Route path="/book/:bookId" element={<ErrorBoundary surface="book-editor"><BookEditor/></ErrorBoundary>}/>
                <Route path="/books/:bookId/export" element={<ErrorBoundary surface="export"><ExportPage/></ErrorBoundary>}/>
                <Route path="/books/:bookId/chapters/:chapterId/snapshots" element={<ErrorBoundary surface="chapter-versions"><ChapterVersionsPage/></ErrorBoundary>}/>
                <Route path="/articles" element={<ErrorBoundary surface="article-list"><ArticleList/></ErrorBoundary>}/>
                <Route path="/articles/new" element={<ErrorBoundary surface="create-article"><CreateArticlePage/></ErrorBoundary>}/>
                <Route path="/articles/import/medium" element={<ErrorBoundary surface="medium-import"><MediumImportPage/></ErrorBoundary>}/>
                <Route path="/articles/:id" element={<ErrorBoundary surface="article-editor"><ArticleEditor/></ErrorBoundary>}/>
                <Route path="/settings" element={<ErrorBoundary surface="settings"><Settings/></ErrorBoundary>}/>
                <Route path="/help" element={<ErrorBoundary surface="help"><Help/></ErrorBoundary>}/>
                <Route path="/get-started" element={<ErrorBoundary surface="get-started"><GetStarted/></ErrorBoundary>}/>
                <Route path="/writing-history" element={<ErrorBoundary surface="writing-history"><WritingHistoryPage/></ErrorBoundary>}/>
            </Routes>
            </Suspense>
            <EventRecorderSetup/>
            <AudioExportGate/>
            <MediumImportGate/>
            <BulkAiFillDock/>
            <HelpPanel/>
            <ErrorReportDialog
                open={errorReport.open}
                onClose={() => setErrorReport({open: false, message: ""})}
                errorMessage={errorReport.message}
                apiError={errorReport.apiError}
            />
            <AiSetupWizard
                open={showAiWizard}
                onClose={() => setShowAiWizard(false)}
                secretsManagedExternally={secretsExternal}
            />
            <ShortcutCheatsheet open={showShortcuts} onClose={() => setShowShortcuts(false)}/>
            <ToastContainer
                position="bottom-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop
                closeOnClick
                pauseOnHover
                theme="colored"
            />
        </HelpProvider>
        </MediumImportJobProvider>
        </BulkAiFillJobProvider>
        </AudiobookJobProvider>
        </DialogProvider>
        </ContentTypesProvider>
        </BookTypesProvider>
        </I18nProvider>
    );
}
