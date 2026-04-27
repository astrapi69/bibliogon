import {useCallback, useEffect, useMemo, useState} from "react";
import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import BookEditor from "./pages/BookEditor";
import ArticleList from "./pages/ArticleList";
import ArticleEditor from "./pages/ArticleEditor";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import GetStarted from "./pages/GetStarted";
import {useTheme} from "./hooks/useTheme";
import {I18nProvider} from "./hooks/useI18n";
import {DialogProvider} from "./components/AppDialog";
import AudioExportGate from "./components/AudioExportGate";
import OfflineBanner from "./components/OfflineBanner";
import {AudiobookJobProvider} from "./contexts/AudiobookJobContext";
import {HelpProvider} from "./contexts/HelpContext";
import HelpPanel from "./components/help/HelpPanel";
import EventRecorderSetup from "./components/EventRecorderSetup";
import ErrorReportDialog from "./components/ErrorReportDialog";
import AiSetupWizard, {shouldShowAiWizard} from "./components/AiSetupWizard";
import {ensureFirstUseDate} from "./components/DonationReminderBanner";
import ShortcutCheatsheet from "./components/ShortcutCheatsheet";
import {useKeyboardShortcuts, Shortcut} from "./hooks/useKeyboardShortcuts";
import {api, ApiError} from "./api/client";
import {ToastContainer} from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
    useTheme();

    // AI setup wizard state — shows on first run when AI is not configured
    const [showAiWizard, setShowAiWizard] = useState(false);
    useEffect(() => {
        ensureFirstUseDate();
        api.settings.getApp()
            .then((config) => {
                if (shouldShowAiWizard(config)) setShowAiWizard(true);
            })
            .catch(() => {}); // Config load failure is not critical for the wizard
    }, []);

    // Shortcut cheatsheet
    const [showShortcuts, setShowShortcuts] = useState(false);
    const shortcuts = useMemo<Shortcut[]>(() => [
        {keys: "ctrl+/", handler: () => setShowShortcuts((s) => !s), label: "Show shortcuts"},
    ], []);
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
        <DialogProvider>
        <AudiobookJobProvider>
        <HelpProvider>
            <OfflineBanner />
            <Routes>
                <Route path="/" element={<Dashboard/>}/>
                <Route path="/book/:bookId" element={<BookEditor/>}/>
                <Route path="/articles" element={<ArticleList/>}/>
                <Route path="/articles/:id" element={<ArticleEditor/>}/>
                <Route path="/settings" element={<Settings/>}/>
                <Route path="/help" element={<Help/>}/>
                <Route path="/get-started" element={<GetStarted/>}/>
            </Routes>
            <EventRecorderSetup/>
            <AudioExportGate/>
            <HelpPanel/>
            <ErrorReportDialog
                open={errorReport.open}
                onClose={() => setErrorReport({open: false, message: ""})}
                errorMessage={errorReport.message}
                apiError={errorReport.apiError}
            />
            <AiSetupWizard open={showAiWizard} onClose={() => setShowAiWizard(false)}/>
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
        </AudiobookJobProvider>
        </DialogProvider>
        </I18nProvider>
    );
}
