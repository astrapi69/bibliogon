import {useCallback, useEffect, useState} from "react";
import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import BookEditor from "./pages/BookEditor";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import GetStarted from "./pages/GetStarted";
import {useTheme} from "./hooks/useTheme";
import {I18nProvider} from "./hooks/useI18n";
import {DialogProvider} from "./components/AppDialog";
import AudioExportGate from "./components/AudioExportGate";
import {AudiobookJobProvider} from "./contexts/AudiobookJobContext";
import {HelpProvider} from "./contexts/HelpContext";
import HelpPanel from "./components/help/HelpPanel";
import EventRecorderSetup from "./components/EventRecorderSetup";
import ErrorReportDialog from "./components/ErrorReportDialog";
import {ApiError} from "./api/client";
import {ToastContainer} from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
    useTheme();

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
            <Routes>
                <Route path="/" element={<Dashboard/>}/>
                <Route path="/book/:bookId" element={<BookEditor/>}/>
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
