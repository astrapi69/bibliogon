import { Suspense, useCallback, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import BookEditor from "./pages/BookEditor";
import ArticleList from "./pages/ArticleList";
import ArticleEditor from "./pages/ArticleEditor";
import MediumImportPage from "./pages/MediumImportPage";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import GetStarted from "./pages/GetStarted";
import NotFoundPage from "./pages/NotFoundPage";
// Dialog->Pages migration: new full-page surfaces are lazy-loaded so
// they create their own chunks (the rest of the routes stay eager).
// lazyWithReload (not bare React.lazy) recovers from stale-shell
// chunk-load failures after a PWA deploy: the autoUpdate SW swaps the
// precache out from under an open tab, so the first navigation to a
// not-yet-loaded route chunk would otherwise 404 and crash the route's
// error boundary. See lib/lazyWithReload.ts + issue #320.
const CreateBookPage = lazyWithReload(() => import("./pages/CreateBookPage"));
const CreateArticlePage = lazyWithReload(() => import("./pages/CreateArticlePage"));
const ExportPage = lazyWithReload(() => import("./pages/ExportPage"));
const WritingHistoryPage = lazyWithReload(() => import("./pages/WritingHistoryPage"));
const ChapterVersionsPage = lazyWithReload(() => import("./pages/ChapterVersionsPage"));
const GitBackupPage = lazyWithReload(() => import("./pages/GitBackupPage"));
const GitSyncPage = lazyWithReload(() => import("./pages/GitSyncPage"));
const ShortcutsPage = lazyWithReload(() => import("./pages/ShortcutsPage"));
import ErrorBoundary from "./components/shared/ErrorBoundary";
import { lazyWithReload } from "./lib/lazyWithReload";
import { useTheme } from "./hooks/ui/useTheme";
import { I18nProvider } from "./hooks/useI18n";
import { AppFeatureProvider } from "./features/AppFeatureProvider";
import { ContentTypesProvider } from "./hooks/useContentTypes";
import { BookTypesProvider } from "./hooks/book/useBookTypes";
import { DialogProvider } from "./components/shared/AppDialog";
import AudioExportGate from "./components/export/AudioExportGate";
import MediumImportGate from "./components/import/MediumImportGate";
import OfflineBanner from "./components/shared/OfflineBanner";
import PreviewBanner from "./components/preview/PreviewBanner";
import AppUpdateBanner from "./components/shared/AppUpdateBanner";
import AppVersionUpdateBanner from "./components/shared/AppVersionUpdateBanner";
import SyncStatusWatcher from "./components/import/SyncStatusWatcher";
import SkipToContentLink from "./components/shared/SkipToContentLink";
import { AudiobookJobProvider } from "./contexts/AudiobookJobContext";
import { BulkAiFillJobProvider } from "./contexts/BulkAiFillJobContext";
import { MediumImportJobProvider } from "./contexts/MediumImportJobContext";
import BulkAiFillDock from "./components/articles/BulkAiFillDock";
import { HelpProvider } from "./contexts/HelpContext";
import HelpPanel from "./components/help/HelpPanel";
import EventRecorderSetup from "./components/shared/EventRecorderSetup";
import ErrorReportDialog from "./components/shared/ErrorReportDialog";
import AiSetupWizard, { shouldShowAiWizard } from "./components/settings/AiSetupWizard";
import DonationReminderBanner, {
    ensureFirstUseDate,
    shouldShowReminder,
} from "./components/shared/DonationReminderBanner";
import { getDonationsConfig, type DonationsConfig } from "./components/settings/SupportSection";
import GlobalShortcuts from "./components/shortcuts/GlobalShortcuts";
import { api, ApiError } from "./api/client";
import { getStorage } from "./storage";
import { ToastContainer } from "react-toastify";
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
        getStorage()
            .settings.getApp()
            .then((config) => {
                if (shouldShowAiWizard(config)) setShowAiWizard(true);
                setSecretsExternal(
                    Boolean((config as Record<string, unknown>)._secrets_managed_externally),
                );
                // Same fetch piggybacks the donations config so the
                // App-level banner doesn't need its own API call.
                const donations = getDonationsConfig(config);
                setDonationsConfig(donations);
                setReminderVisible(shouldShowReminder(donations));
            })
            .catch(() => {}); // Config load failure is not critical for the wizard
    }, []);

    // Error report dialog state — opened via custom event from notify.ts
    const [errorReport, setErrorReport] = useState<{
        open: boolean;
        message: string;
        apiError?: ApiError;
    }>({ open: false, message: "" });

    const handleOpenReport = useCallback((e: Event) => {
        const detail = (e as CustomEvent).detail as {
            message: string;
            apiError?: ApiError;
        };
        setErrorReport({
            open: true,
            message: detail.message,
            apiError: detail.apiError,
        });
    }, []);

    useEffect(() => {
        window.addEventListener("bibliogon:open-error-report", handleOpenReport);
        return () => window.removeEventListener("bibliogon:open-error-report", handleOpenReport);
    }, [handleOpenReport]);

    return (
        <I18nProvider>
            <AppFeatureProvider>
                <BookTypesProvider>
                    <ContentTypesProvider>
                        <DialogProvider>
                            <AudiobookJobProvider>
                                <BulkAiFillJobProvider>
                                    <MediumImportJobProvider>
                                        <HelpProvider>
                                            <SkipToContentLink />
                                            {/* #642: non-dismissible preview/test-version
                                             *  warning. Renders only on the bibliogon-preview
                                             *  deploy (VITE_IS_PREVIEW=true); off in production
                                             *  and local builds. Sits above every other banner. */}
                                            <PreviewBanner />
                                            <OfflineBanner />
                                            {/* PWA: "new version available" banner (issue #323).
                                             *  Subscribes to swUpdateManager; fixed-bottom, dismissible,
                                             *  applies the update via SKIP_WAITING + controllerchange
                                             *  reload (autosave-safe). */}
                                            <AppUpdateBanner />
                                            {/* #477 Phase 2: background GitHub-release
                                             *  check -> non-blocking version banner with
                                             *  notes + dismiss-per-version (the only
                                             *  update signal on desktop / API mode). */}
                                            <AppVersionUpdateBanner />
                                            {/* Headless: drains the offline write queue on reconnect (P3-C9). */}
                                            <SyncStatusWatcher />
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
                                                    <Route
                                                        path="/"
                                                        element={
                                                            <ErrorBoundary surface="dashboard">
                                                                <Dashboard />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/books/new"
                                                        element={
                                                            <ErrorBoundary surface="create-book">
                                                                <CreateBookPage />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/book/:bookId"
                                                        element={
                                                            <ErrorBoundary surface="book-editor">
                                                                <BookEditor />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/books/:bookId/export"
                                                        element={
                                                            <ErrorBoundary surface="export">
                                                                <ExportPage />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/books/:bookId/chapters/:chapterId/snapshots"
                                                        element={
                                                            <ErrorBoundary surface="chapter-versions">
                                                                <ChapterVersionsPage />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/books/:bookId/git-backup"
                                                        element={
                                                            <ErrorBoundary surface="git-backup">
                                                                <GitBackupPage />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/books/:bookId/git-sync"
                                                        element={
                                                            <ErrorBoundary surface="git-sync">
                                                                <GitSyncPage />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/articles"
                                                        element={
                                                            <ErrorBoundary surface="article-list">
                                                                <ArticleList />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/articles/new"
                                                        element={
                                                            <ErrorBoundary surface="create-article">
                                                                <CreateArticlePage />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/articles/import/medium"
                                                        element={
                                                            <ErrorBoundary surface="medium-import">
                                                                <MediumImportPage />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/articles/:id"
                                                        element={
                                                            <ErrorBoundary surface="article-editor">
                                                                <ArticleEditor />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/settings"
                                                        element={
                                                            <ErrorBoundary surface="settings">
                                                                <Settings />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/help"
                                                        element={
                                                            <ErrorBoundary surface="help">
                                                                <Help />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/get-started"
                                                        element={
                                                            <ErrorBoundary surface="get-started">
                                                                <GetStarted />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/writing-history"
                                                        element={
                                                            <ErrorBoundary surface="writing-history">
                                                                <WritingHistoryPage />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="/help/shortcuts"
                                                        element={
                                                            <ErrorBoundary surface="shortcuts">
                                                                <ShortcutsPage />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                    <Route
                                                        path="*"
                                                        element={
                                                            <ErrorBoundary surface="not-found">
                                                                <NotFoundPage />
                                                            </ErrorBoundary>
                                                        }
                                                    />
                                                </Routes>
                                            </Suspense>
                                            <EventRecorderSetup />
                                            <AudioExportGate />
                                            <MediumImportGate />
                                            <BulkAiFillDock />
                                            <GlobalShortcuts />
                                            <HelpPanel />
                                            <ErrorReportDialog
                                                open={errorReport.open}
                                                onClose={() =>
                                                    setErrorReport({ open: false, message: "" })
                                                }
                                                errorMessage={errorReport.message}
                                                apiError={errorReport.apiError}
                                            />
                                            <AiSetupWizard
                                                open={showAiWizard}
                                                onClose={() => setShowAiWizard(false)}
                                                secretsManagedExternally={secretsExternal}
                                            />
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
            </AppFeatureProvider>
        </I18nProvider>
    );
}
