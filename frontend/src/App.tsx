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
import {ToastContainer} from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
    // Initialize theme on app start (applies data-theme attribute)
    useTheme();

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
